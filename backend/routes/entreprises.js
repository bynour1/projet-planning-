const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const db     = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const {
  authorizeDocumentAction,
  canUserAccessCategory,
  generateSignedDocumentUrl,
  isHseCategory,
} = require('../middleware/documentSecurity');
const { logDocumentAudit } = require('../services/auditService');

const PATIENTS_UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'patients');
if (!fs.existsSync(PATIENTS_UPLOADS_DIR)) fs.mkdirSync(PATIENTS_UPLOADS_DIR, { recursive: true });

const patientDocStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PATIENTS_UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${base}_${unique}${ext}`);
  },
});

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv'
]);

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.php', '.phtml', '.php3', '.php4', '.php5', '.phps',
  '.js', '.vbs', '.ps1', '.jar', '.msi', '.dll', '.scr', '.cgi', '.pl', '.py', '.asp', '.aspx', '.jsp', '.html', '.htm'
]);

const uploadPatientDoc = multer({
  storage: patientDocStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 Mo max
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (DANGEROUS_EXTENSIONS.has(ext)) {
      return cb(new Error('Extension de fichier non autorisée pour des raisons de sécurité.'));
    }
    const isImage = (file.mimetype || '').startsWith('image/');
    const isAllowedDoc = ALLOWED_MIME_TYPES.has(file.mimetype);
    if (!isImage && !isAllowedDoc) {
      return cb(new Error('Format non autorisé. Sont acceptés : Images (JPG, PNG...), PDF, Word, Excel, CSV.'));
    }
    cb(null, true);
  },
});

// ═══════════════════════════════════════════════════════════════
// ENTREPRISES
// ═══════════════════════════════════════════════════════════════

// In-memory cache for high performance on large dataset (898+ enterprises)
let cachedEntreprises = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60s cache TTL

function invalidateEntreprisesCache() {
  cachedEntreprises = null;
  cacheTime = 0;
}

// GET /api/entreprises
router.get('/', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'administrateur';
    const now = Date.now();

    if (!cachedEntreprises || (now - cacheTime > CACHE_TTL_MS)) {
      const [rows] = await db.query(`
        SELECT e.*,
          COUNT(DISTINCT r.id)          AS nb_avis,
          ROUND(AVG(r.note), 1)         AS note_moyenne
        FROM entreprises e
        LEFT JOIN entreprise_avis r ON r.entreprise_id = e.id
        GROUP BY e.id
        ORDER BY e.nom ASC
      `);
      cachedEntreprises = rows || [];
      cacheTime = now;
    }

    // Mask code if not administrator
    const result = cachedEntreprises.map(r => {
      if (!isAdmin) {
        const { code, ...rest } = r;
        return rest;
      }
      return r;
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Helper: Récupération de l'historique complet des visites médicales et de l'effectif examiné
async function getVisitesForEntreprise(entrepriseId, entrepriseNom) {
  let explicitVisites = [];
  try {
    const [rows] = await db.query(`
      SELECT ev.*,
        CONCAT(u.prenom, ' ', u.nom) AS medecin_full,
        CONCAT(t.prenom, ' ', t.nom) AS technicien_full,
        CONCAT(cb.prenom, ' ', cb.nom) AS created_by_full,
        cb.role AS created_by_role_user
      FROM entreprise_visites ev
      LEFT JOIN users u ON u.id = ev.medecin_id
      LEFT JOIN users t ON t.id = ev.technicien_id
      LEFT JOIN users cb ON cb.id = ev.created_by
      WHERE ev.entreprise_id = ?
      ORDER BY ev.date DESC, ev.heure DESC
    `, [entrepriseId]);
    explicitVisites = rows || [];
  } catch (e) {
    console.error('Error fetching entreprise_visites:', e.message);
  }

  let planningVisites = [];
  try {
    const [pRows] = await db.query(`
      SELECT pe.id AS planning_id, pe.date, pe.heure_debut AS heure,
        pe.medecin_id, pe.technicien_id, pe.commentaire, pe.statut, pe.is_clino, pe.clino_id,
        pe.nb_examines,
        CONCAT(u.prenom, ' ', u.nom) AS medecin_full,
        CONCAT(t.prenom, ' ', t.nom) AS technicien_full
      FROM planning_events pe
      LEFT JOIN users u ON u.id = pe.medecin_id
      LEFT JOIN users t ON t.id = pe.technicien_id
      WHERE pe.entreprise_id = ? OR LOWER(TRIM(pe.titre)) = LOWER(TRIM(?))
      ORDER BY pe.date DESC, pe.heure_debut DESC
    `, [entrepriseId, entrepriseNom || '']);
    planningVisites = pRows || [];
  } catch (e) {
    console.error('Error fetching planning_events for entreprise:', e.message);
  }

  let clinoVisites = [];
  try {
    const [cRows] = await db.query(`
      SELECT cm.id AS clino_id, cm.date, cm.heure,
        cm.medecin_id, cm.technicien_id, cm.commentaire,
        cm.planning_id, cm.nb_examines,
        CONCAT(u.prenom, ' ', u.nom) AS medecin_full,
        CONCAT(t.prenom, ' ', t.nom) AS technicien_full,
        pe.titre AS entreprise_nom
      FROM clino_mobile cm
      LEFT JOIN users u ON u.id = cm.medecin_id
      LEFT JOIN users t ON t.id = cm.technicien_id
      LEFT JOIN planning_events pe ON pe.id = cm.planning_id
      WHERE cm.entreprise_id = ? OR LOWER(TRIM(pe.titre)) = LOWER(TRIM(?))
      ORDER BY cm.date DESC, cm.heure DESC
    `, [entrepriseId, entrepriseNom || '']);
    clinoVisites = cRows || [];
  } catch (e) {
    console.error('Error fetching clino_mobile for entreprise:', e.message);
  }

  const linkedPlanningIds = new Set(explicitVisites.filter(v => v.planning_id).map(v => String(v.planning_id)));
  const linkedClinoIds = new Set(explicitVisites.filter(v => v.clino_id).map(v => String(v.clino_id)));

  const all = [...explicitVisites.map(v => ({
    id: 'ev_' + v.id,
    source: 'visite',
    visite_id: v.id,
    date: String(v.date || '').slice(0, 10),
    heure: v.heure ? String(v.heure).slice(0, 5) : '',
    medecin_id: v.medecin_id,
    technicien_id: v.technicien_id,
    medecin_nom: v.medecin_nom || v.medecin_full || '—',
    technicien_nom: v.technicien_nom || v.technicien_full || '—',
    type_visite: v.type_visite || 'Visite Médicale Périodique',
    nb_examines: parseInt(v.nb_examines, 10) || 0,
    nb_bilans: parseInt(v.nb_bilans, 10) || 0,
    statut: v.statut || 'effectuee',
    commentaire: v.commentaire || '',
    planning_id: v.planning_id,
    clino_id: v.clino_id,
    created_at: v.created_at,
    created_by_nom: v.created_by_nom || v.created_by_full || null,
    created_by_role: v.created_by_role || v.created_by_role_user || null,
    lieu_poste: v.lieu_poste || null,
    risques_identifies: v.risques_identifies || null,
    recommandations: v.recommandations || null,
    rapport_type: v.rapport_type || null,
    patient_id: v.patient_id || null,
    patient_nom: v.patient_nom || null,
  }))];

  planningVisites.forEach(p => {
    if (!linkedPlanningIds.has(String(p.planning_id))) {
      all.push({
        id: 'pe_' + p.planning_id,
        source: 'planning',
        planning_id: p.planning_id,
        date: String(p.date || '').slice(0, 10),
        heure: p.heure ? String(p.heure).slice(0, 5) : '',
        medecin_id: p.medecin_id,
        technicien_id: p.technicien_id,
        medecin_nom: p.medecin_full || '—',
        technicien_nom: p.technicien_full || '—',
        type_visite: p.is_clino ? '🚗 Tournée Clino Mobile' : '📋 Visite Médicale / Planning',
        nb_examines: parseInt(p.nb_examines, 10) || 0,
        nb_bilans: 0,
        statut: p.statut || 'planifiee',
        commentaire: p.commentaire || '',
        clino_id: p.clino_id,
      });
    }
  });

  clinoVisites.forEach(c => {
    if (!linkedClinoIds.has(String(c.clino_id)) && (!c.planning_id || !linkedPlanningIds.has(String(c.planning_id)))) {
      all.push({
        id: 'cm_' + c.clino_id,
        source: 'clino',
        clino_id: c.clino_id,
        date: String(c.date || '').slice(0, 10),
        heure: c.heure ? String(c.heure).slice(0, 5) : '',
        medecin_id: c.medecin_id,
        technicien_id: c.technicien_id,
        medecin_nom: c.medecin_full || '—',
        technicien_nom: c.technicien_full || '—',
        type_visite: '🚗 Clino Mobile sur site',
        nb_examines: parseInt(c.nb_examines, 10) || 0,
        nb_bilans: 0,
        statut: 'effectuee',
        commentaire: c.commentaire || '',
        planning_id: c.planning_id,
      });
    }
  });

  all.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.heure || '').localeCompare(a.heure || ''));

  return all;
}

// GET /api/entreprises/patients/all (Tous les salariés pour la vue consolidée)
router.get('/patients/all', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.*, e.nom AS entreprise_nom,
        (SELECT COUNT(*) FROM entreprise_patient_documents WHERE patient_id = p.id) AS nb_documents
      FROM entreprise_patients p
      JOIN entreprises e ON e.id = p.entreprise_id
      ORDER BY p.entreprise_id ASC, p.nom ASC, p.prenom ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching all patients:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/entreprises/rapport-medecin (Rapport d'activité des médecins par date ou période)
router.get('/rapport-medecin', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'administrateur';
    let medecinId = req.query.medecin_id;
    // Si l'utilisateur est un médecin, il est strictement limité à ses propres rapports médicaux
    if (req.user?.role === 'medecin') {
      medecinId = req.user.id;
    } else if (!isAdmin || !medecinId) {
      if (req.user?.role !== 'administrateur') {
        medecinId = req.user.id;
      }
    }

    const { date, date_debut, date_fin, entreprise_id } = req.query;

    let medecinInfo = null;
    if (medecinId && medecinId !== 'all') {
      const [u] = await db.query('SELECT id, nom, prenom, email, telephone, role FROM users WHERE id=?', [medecinId]);
      medecinInfo = u[0] || null;
    }

    // Conditions pour entreprise_visites
    const whereConditions = [];
    const params = [];

    if (medecinId && medecinId !== 'all') {
      whereConditions.push('(ev.medecin_id = ? OR ev.medecin_nom LIKE ?)');
      params.push(medecinId, `%${medecinInfo?.nom || ''}%`);
    }

    if (date) {
      whereConditions.push('ev.date = ?');
      params.push(date);
    } else {
      if (date_debut) {
        whereConditions.push('ev.date >= ?');
        params.push(date_debut);
      }
      if (date_fin) {
        whereConditions.push('ev.date <= ?');
        params.push(date_fin);
      }
    }

    if (entreprise_id) {
      whereConditions.push('ev.entreprise_id = ?');
      params.push(entreprise_id);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [visitesRows] = await db.query(`
      SELECT ev.*,
        e.nom AS entreprise_nom, e.adresse AS entreprise_adresse, e.secteur AS entreprise_secteur,
        CONCAT(u.prenom, ' ', u.nom) AS medecin_fullname,
        CONCAT(t.prenom, ' ', t.nom) AS technicien_fullname
      FROM entreprise_visites ev
      JOIN entreprises e ON e.id = ev.entreprise_id
      LEFT JOIN users u ON u.id = ev.medecin_id
      LEFT JOIN users t ON t.id = ev.technicien_id
      ${whereClause}
      ORDER BY ev.date DESC, ev.heure DESC
    `, params);

    const visites = visitesRows.map(v => ({
      ...v,
      source: 'visite',
      medecin_nom: v.medecin_fullname || v.medecin_nom,
      technicien_nom: v.technicien_fullname || v.technicien_nom,
    }));

    // Also get planning events if any
    const planningWhere = [];
    const planningParams = [];
    if (medecinId && medecinId !== 'all') {
      planningWhere.push('pe.medecin_id = ?');
      planningParams.push(medecinId);
    }
    if (date) {
      planningWhere.push('pe.date = ?');
      planningParams.push(date);
    } else {
      if (date_debut) {
        planningWhere.push('pe.date >= ?');
        planningParams.push(date_debut);
      }
      if (date_fin) {
        planningWhere.push('pe.date <= ?');
        planningParams.push(date_fin);
      }
    }
    if (entreprise_id) {
      planningWhere.push('pe.entreprise_id = ?');
      planningParams.push(entreprise_id);
    }

    const existingPlanningIds = new Set(visites.filter(v => v.planning_id).map(v => v.planning_id));
    let extraPlanning = [];
    try {
      const pClause = planningWhere.length > 0 ? `WHERE ${planningWhere.join(' AND ')}` : '';
      const [pRows] = await db.query(`
        SELECT pe.id AS planning_id, pe.date, pe.heure_debut AS heure,
          pe.medecin_id, pe.technicien_id, pe.commentaire, pe.statut, pe.is_clino, pe.clino_id,
          pe.nb_examines, pe.entreprise_id, pe.titre, pe.adresse,
          COALESCE(e.nom, pe.titre, 'Visite sur site') AS entreprise_nom,
          COALESCE(e.adresse, pe.adresse, '') AS entreprise_adresse,
          COALESCE(e.secteur, '') AS entreprise_secteur,
          CONCAT(u.prenom, ' ', u.nom) AS medecin_fullname,
          CONCAT(t.prenom, ' ', t.nom) AS technicien_fullname
        FROM planning_events pe
        LEFT JOIN entreprises e ON (e.id = pe.entreprise_id OR LOWER(TRIM(e.nom)) = LOWER(TRIM(pe.titre)) OR LOWER(TRIM(pe.titre)) LIKE CONCAT('%', LOWER(TRIM(e.nom)), '%'))
        LEFT JOIN users u ON u.id = pe.medecin_id
        LEFT JOIN users t ON t.id = pe.technicien_id
        ${pClause}
      `, planningParams);

      for (const pr of pRows) {
        if (!existingPlanningIds.has(pr.planning_id)) {
          extraPlanning.push({
            id: `p-${pr.planning_id}`,
            entreprise_id: pr.entreprise_id,
            entreprise_nom: pr.entreprise_nom || 'Visite sur site',
            entreprise_adresse: pr.entreprise_adresse || '',
            entreprise_secteur: pr.entreprise_secteur || '',
            date: pr.date,
            heure: pr.heure,
            medecin_id: pr.medecin_id,
            technicien_id: pr.technicien_id,
            medecin_nom: pr.medecin_fullname,
            technicien_nom: pr.technicien_fullname,
            type_visite: pr.is_clino ? 'Tournée Clino Mobile' : 'Visite Médicale Planifiée',
            nb_examines: pr.nb_examines || 0,
            nb_bilans: 0,
            statut: pr.statut || 'effectuee',
            commentaire: pr.commentaire || '',
            planning_id: pr.planning_id,
            source: 'planning',
          });
        }
      }
    } catch (e) {
      console.error('Error fetching extra planning for rapport:', e.message);
    }

    // Also include missions from clino_mobile if any
    try {
      const clinoWhere = [];
      const clinoParams = [];
      if (medecinId && medecinId !== 'all') {
        clinoWhere.push('(cm.medecin_id = ? OR cm.medecin_nom LIKE ?)');
        clinoParams.push(medecinId, `%${medecinInfo?.nom || ''}%`);
      }
      if (date) {
        clinoWhere.push('cm.date = ?');
        clinoParams.push(date);
      } else {
        if (date_debut) {
          clinoWhere.push('cm.date >= ?');
          clinoParams.push(date_debut);
        }
        if (date_fin) {
          clinoWhere.push('cm.date <= ?');
          clinoParams.push(date_fin);
        }
      }
      if (entreprise_id) {
        clinoWhere.push('cm.entreprise_id = ?');
        clinoParams.push(entreprise_id);
      }
      const cClause = clinoWhere.length > 0 ? `WHERE ${clinoWhere.join(' AND ')}` : '';
      const [cRows] = await db.query(`
        SELECT cm.*,
          COALESCE(e.nom, 'Tournée Clino Mobile') AS entreprise_nom,
          COALESCE(e.adresse, cm.adresse, '') AS entreprise_adresse,
          COALESCE(e.secteur, '') AS entreprise_secteur
        FROM clino_mobile cm
        LEFT JOIN entreprises e ON e.id = cm.entreprise_id
        ${cClause}
      `, clinoParams);
      for (const cr of cRows) {
        if (!existingPlanningIds.has(cr.planning_id) && !visites.some(v => v.clino_id === cr.id)) {
          extraPlanning.push({
            id: `cm-${cr.id}`,
            entreprise_id: cr.entreprise_id,
            entreprise_nom: cr.entreprise_nom,
            entreprise_adresse: cr.entreprise_adresse,
            entreprise_secteur: cr.entreprise_secteur,
            date: cr.date,
            heure: cr.heure,
            medecin_id: cr.medecin_id,
            technicien_id: cr.technicien_id,
            medecin_nom: cr.medecin_nom,
            technicien_nom: cr.technicien_nom,
            type_visite: 'Tournée Clino Mobile',
            nb_examines: cr.nb_examines || 0,
            nb_bilans: 0,
            statut: 'effectuee',
            commentaire: cr.commentaire || '',
            clino_id: cr.id,
            source: 'clino',
          });
        }
      }
    } catch (e) {
      // ignore
    }

    // Also include medical events from calendar 'events' table
    try {
      const eventsWhere = [];
      const eventsParams = [];
      if (medecinId && medecinId !== 'all') {
        eventsWhere.push('(ev.medecin_id = ? OR ev.participants LIKE ?)');
        eventsParams.push(medecinId, `%"id":${medecinId}%`);
      }
      if (date) {
        eventsWhere.push('DATE(ev.date_debut) = ?');
        eventsParams.push(date);
      } else {
        if (date_debut) {
          eventsWhere.push('DATE(ev.date_debut) >= ?');
          eventsParams.push(date_debut);
        }
        if (date_fin) {
          eventsWhere.push('DATE(ev.date_debut) <= ?');
          eventsParams.push(date_fin);
        }
      }
      const evClause = eventsWhere.length > 0 ? `WHERE ${eventsWhere.join(' AND ')}` : '';
      const [evRows] = await db.query(`
        SELECT ev.*,
          CONCAT(u.prenom, ' ', u.nom) AS medecin_fullname,
          CONCAT(t.prenom, ' ', t.nom) AS technicien_fullname
        FROM events ev
        LEFT JOIN users u ON u.id = ev.medecin_id
        LEFT JOIN users t ON t.id = ev.technicien_id
        ${evClause}
      `, eventsParams);

      for (const er of evRows) {
        extraPlanning.push({
          id: `ev-${er.id}`,
          entreprise_id: null,
          entreprise_nom: er.titre || 'Événement Médical',
          entreprise_adresse: er.lieu || '',
          entreprise_secteur: '',
          date: er.date_debut ? String(er.date_debut).slice(0, 10) : '',
          heure: er.date_debut && er.date_debut.includes('T') ? er.date_debut.split('T')[1]?.slice(0, 5) : (er.date_debut && er.date_debut.includes(' ') ? er.date_debut.split(' ')[1]?.slice(0, 5) : ''),
          medecin_id: er.medecin_id,
          technicien_id: er.technicien_id,
          medecin_nom: er.medecin_fullname,
          technicien_nom: er.technicien_fullname,
          type_visite: er.type || 'Événement Médical',
          nb_examines: 0,
          nb_bilans: 0,
          statut: 'effectuee',
          commentaire: er.lieu ? `Lieu : ${er.lieu}` : '',
          source: 'evenement',
        });
      }
    } catch (e) {
      // ignore
    }

    function deduceVisitTypes(v) {
      let e = parseInt(v.nb_embauche, 10) || 0;
      let p = parseInt(v.nb_periodique, 10) || 0;
      let r = parseInt(v.nb_reprise, 10) || 0;
      let s = parseInt(v.nb_spontanee, 10) || 0;
      if (e === 0 && p === 0 && r === 0 && s === 0) {
        const tot = parseInt(v.nb_examines, 10) || 0;
        const tv = String(v.type_visite || '').toLowerCase();
        if (tv.includes('embauche')) e = tot;
        else if (tv.includes('reprise')) r = tot;
        else if (tv.includes('spontan') || tv.includes('autre')) s = tot;
        else p = tot;
      }
      return { nb_embauche: e, nb_periodique: p, nb_reprise: r, nb_spontanee: s };
    }

    // Retrieve patient registry breakdown by visit type from entreprise_patients
    const patientBreakdownMap = {};
    try {
      const pWhere = [];
      const pParams = [];
      if (medecinId && medecinId !== 'all') {
        pWhere.push('(ep.medecin_id = ? OR ep.medecin_nom LIKE ?)');
        pParams.push(medecinId, `%${medecinInfo?.nom || ''}%`);
      }
      if (date) {
        pWhere.push('DATE(ep.date_derniere_visite) = ?');
        pParams.push(date);
      } else {
        if (date_debut) {
          pWhere.push('DATE(ep.date_derniere_visite) >= ?');
          pParams.push(date_debut);
        }
        if (date_fin) {
          pWhere.push('DATE(ep.date_derniere_visite) <= ?');
          pParams.push(date_fin);
        }
      }
      if (entreprise_id) {
        pWhere.push('ep.entreprise_id = ?');
        pParams.push(entreprise_id);
      }
      const pWhereClause = pWhere.length > 0 ? `WHERE ${pWhere.join(' AND ')}` : '';
      const [ptRows] = await db.query(`
        SELECT ep.entreprise_id,
          e.nom AS entreprise_nom, e.secteur AS entreprise_secteur, e.adresse AS entreprise_adresse,
          COUNT(*) as total_patients,
          COUNT(CASE WHEN LOWER(ep.type_visite) LIKE '%embauche%' THEN 1 END) AS count_embauche,
          COUNT(CASE WHEN LOWER(ep.type_visite) LIKE '%reprise%' THEN 1 END) AS count_reprise,
          COUNT(CASE WHEN LOWER(ep.type_visite) LIKE '%spontan%' THEN 1 END) AS count_spontanee,
          COUNT(CASE WHEN LOWER(ep.type_visite) LIKE '%period%' OR LOWER(ep.type_visite) LIKE '%périod%' OR ep.type_visite IS NULL OR ep.type_visite = '' THEN 1 END) AS count_periodique,
          COUNT(CASE WHEN ep.has_visio = 1 THEN 1 END) AS count_visio,
          COUNT(CASE WHEN ep.has_audio = 1 THEN 1 END) AS count_audio,
          COUNT(CASE WHEN ep.has_ecg = 1 THEN 1 END) AS count_ecg,
          COUNT(CASE WHEN ep.bilan_en_attente = 1 THEN 1 END) AS count_bilans,
          DATE_FORMAT(MAX(ep.date_derniere_visite), '%Y-%m-%d') AS dernier_passage
        FROM entreprise_patients ep
        LEFT JOIN entreprises e ON e.id = ep.entreprise_id
        ${pWhereClause}
        GROUP BY ep.entreprise_id
      `, pParams);

      for (const pr of ptRows) {
        patientBreakdownMap[pr.entreprise_id] = pr;
      }
    } catch (e) {
      console.error('Error fetching patient breakdown for rapport:', e.message);
    }

    const allVisites = [...visites, ...extraPlanning].sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')) || String(b.heure || '').localeCompare(String(a.heure || ''))
    );

    // Apply deduced breakdown to each visit
    for (const v of allVisites) {
      const d = deduceVisitTypes(v);
      v.nb_embauche = d.nb_embauche;
      v.nb_periodique = d.nb_periodique;
      v.nb_reprise = d.nb_reprise;
      v.nb_spontanee = d.nb_spontanee;
    }

    // Summary grouped by enterprise
    const entreprisesMap = {};
    for (const v of allVisites) {
      const eNom = v.entreprise_nom || 'Autre';
      if (!entreprisesMap[eNom]) {
        entreprisesMap[eNom] = {
          entreprise_id: v.entreprise_id,
          entreprise_nom: eNom,
          secteur: v.entreprise_secteur || '—',
          adresse: v.entreprise_adresse || '—',
          nb_visites: 0,
          total_examines: 0,
          total_bilans: 0,
          total_visio: 0,
          total_audio: 0,
          total_ecg: 0,
          total_embauche: 0,
          total_periodique: 0,
          total_reprise: 0,
          total_spontanee: 0,
          dernier_passage: v.date,
          types_visite: new Set(),
        };
      }
      entreprisesMap[eNom].nb_visites += 1;
      entreprisesMap[eNom].total_examines += parseInt(v.nb_examines, 10) || 0;
      entreprisesMap[eNom].total_bilans += parseInt(v.nb_bilans, 10) || 0;
      entreprisesMap[eNom].total_visio += parseInt(v.nb_visio, 10) || 0;
      entreprisesMap[eNom].total_audio += parseInt(v.nb_audio, 10) || 0;
      entreprisesMap[eNom].total_ecg += parseInt(v.nb_ecg, 10) || 0;
      entreprisesMap[eNom].total_embauche += v.nb_embauche;
      entreprisesMap[eNom].total_periodique += v.nb_periodique;
      entreprisesMap[eNom].total_reprise += v.nb_reprise;
      entreprisesMap[eNom].total_spontanee += v.nb_spontanee;
      if (v.type_visite) entreprisesMap[eNom].types_visite.add(v.type_visite);
      if (String(v.date) > String(entreprisesMap[eNom].dernier_passage)) {
        entreprisesMap[eNom].dernier_passage = v.date;
      }
    }

    // Also incorporate enterprise patient registry if any enterprise is not yet in visits or has 0 breakdown
    for (const [entId, pb] of Object.entries(patientBreakdownMap)) {
      const idNum = parseInt(entId, 10);
      const existing = Object.values(entreprisesMap).find(e => e.entreprise_id === idNum);
      if (!existing) {
        const eNom = pb.entreprise_nom || `Entreprise #${idNum}`;
        entreprisesMap[eNom] = {
          entreprise_id: idNum,
          entreprise_nom: eNom,
          secteur: pb.entreprise_secteur || '—',
          adresse: pb.entreprise_adresse || '—',
          nb_visites: 1,
          total_examines: pb.total_patients || 0,
          total_bilans: pb.count_bilans || 0,
          total_visio: pb.count_visio || 0,
          total_audio: pb.count_audio || 0,
          total_ecg: pb.count_ecg || 0,
          total_embauche: pb.count_embauche || 0,
          total_periodique: pb.count_periodique || 0,
          total_reprise: pb.count_reprise || 0,
          total_spontanee: pb.count_spontanee || 0,
          dernier_passage: pb.dernier_passage ? String(pb.dernier_passage).slice(0, 10) : new Date().toISOString().slice(0, 10),
          types_visite: new Set(['Registre Salariés']),
        };
      } else {
        if (existing.total_embauche === 0 && existing.total_reprise === 0 && existing.total_spontanee === 0 && (pb.count_embauche > 0 || pb.count_reprise > 0 || pb.count_spontanee > 0)) {
          existing.total_embauche = pb.count_embauche || 0;
          existing.total_reprise = pb.count_reprise || 0;
          existing.total_spontanee = pb.count_spontanee || 0;
          existing.total_periodique = pb.count_periodique || 0;
        }
      }
    }

    // Aggregations
    const totalVisites = allVisites.length > 0 ? allVisites.length : Object.values(entreprisesMap).reduce((s, e) => s + e.nb_visites, 0);
    const totalEffectifs = Object.values(entreprisesMap).reduce((sum, e) => sum + (e.total_examines || 0), 0);
    const totalBilans = Object.values(entreprisesMap).reduce((sum, e) => sum + (e.total_bilans || 0), 0);
    const totalVisio = Object.values(entreprisesMap).reduce((sum, e) => sum + (e.total_visio || 0), 0);
    const totalAudio = Object.values(entreprisesMap).reduce((sum, e) => sum + (e.total_audio || 0), 0);
    const totalEcg = Object.values(entreprisesMap).reduce((sum, e) => sum + (e.total_ecg || 0), 0);
    const totalEmbauche = Object.values(entreprisesMap).reduce((sum, e) => sum + (e.total_embauche || 0), 0);
    const totalPeriodique = Object.values(entreprisesMap).reduce((sum, e) => sum + (e.total_periodique || 0), 0);
    const totalReprise = Object.values(entreprisesMap).reduce((sum, e) => sum + (e.total_reprise || 0), 0);
    const totalSpontanee = Object.values(entreprisesMap).reduce((sum, e) => sum + (e.total_spontanee || 0), 0);
    const distinctEntreprises = new Set(Object.values(entreprisesMap).map(e => e.entreprise_nom).filter(Boolean));

    const entreprises_summary = Object.values(entreprisesMap).map(e => ({
      ...e,
      types_visite: Array.from(e.types_visite).join(', '),
    })).sort((a, b) => b.total_examines - a.total_examines);

    res.json({
      medecin: medecinInfo,
      periode: { date: date || null, date_debut: date_debut || null, date_fin: date_fin || null },
      kpis: {
        total_visites: totalVisites,
        total_entreprises: distinctEntreprises.size,
        total_effectifs_examines: totalEffectifs,
        total_bilans: totalBilans,
        total_visio: totalVisio,
        total_audio: totalAudio,
        total_ecg: totalEcg,
        total_embauche: totalEmbauche,
        total_periodique: totalPeriodique,
        total_reprise: totalReprise,
        total_spontanee: totalSpontanee,
      },
      visites: allVisites,
      entreprises_summary,
    });
  } catch (err) {
    console.error('Error generating rapport medecin:', err);
    res.status(500).json({ message: 'Erreur lors de la génération du rapport' });
  }
});

// POST /api/entreprises/rapport-medecin/import — Chaque médecin peut importer son rapport médical (visites/examens)
router.post('/rapport-medecin/import', authenticate, authorize('administrateur', 'medecin'), async (req, res) => {
  try {
    const isDoc = req.user?.role === 'medecin';
    // Si médecin, forcer l'attribution à soi-même
    const effectiveMedecinId = isDoc ? req.user.id : (req.body.medecin_id || req.user.id);

    const [uRows] = await db.query('SELECT CONCAT(prenom, " ", nom) as fullname FROM users WHERE id = ?', [effectiveMedecinId]);
    const effectiveMedecinNom = uRows[0]?.fullname || `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() || 'Médecin';

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ message: 'Aucune donnée valide à importer' });
    }

    let importedCount = 0;
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rawDate = item.date || item.Date;
      const entrepriseNom = (item.entreprise || item.Entreprise || item.entreprise_nom || '').trim();

      if (!rawDate || !entrepriseNom) {
        errors.push(`Ligne ${i + 1} : Date ou Entreprise absente.`);
        continue;
      }

      const dateStr = String(rawDate).slice(0, 10);

      // Recherche de l'entreprise
      let entId = null;
      const [eRows] = await db.query(
        'SELECT id, nom, adresse, nb_visites_faites FROM entreprises WHERE LOWER(TRIM(nom)) = LOWER(TRIM(?)) LIMIT 1',
        [entrepriseNom]
      );
      if (eRows.length > 0) {
        entId = eRows[0].id;
      } else {
        const [newE] = await db.query(
          'INSERT INTO entreprises (nom, adresse, secteur, effectif_total, nb_visites_faites) VALUES (?, ?, ?, ?, ?)',
          [entrepriseNom, item.adresse || item.Adresse || '', item.secteur || item.Secteur || 'Général', parseInt(item.effectif || item.nb_examines, 10) || 0, 0]
        );
        entId = newE.insertId;
      }

      const nbExam = Math.max(0, parseInt(item.nb_examines || item['Salariés Examinés'] || item.examines || item.effectif, 10) || 0);
      const nbBilans = Math.max(0, parseInt(item.nb_bilans || item['Bilans Complémentaires'] || item.bilans, 10) || 0);
      const nbVisio = Math.max(0, parseInt(item.nb_visio || item.visio || item.Visio, 10) || 0);
      const nbAudio = Math.max(0, parseInt(item.nb_audio || item.audio || item.Audio, 10) || 0);
      const nbEcg = Math.max(0, parseInt(item.nb_ecg || item.ecg || item.ECG, 10) || 0);
      const nbEmbauche = Math.max(0, parseInt(item.nb_embauche || item.Embauche || item.embauche, 10) || 0);
      const nbPeriodique = Math.max(0, parseInt(item.nb_periodique || item['Périodique'] || item.periodique, 10) || 0);
      const nbReprise = Math.max(0, parseInt(item.nb_reprise || item.Reprise || item.reprise, 10) || 0);
      const nbSpontanee = Math.max(0, parseInt(item.nb_spontanee || item['Spontanée'] || item.spontanee, 10) || 0);

      const typeVisite = item.type_visite || item['Type de Visite'] || 'Visite Médicale Périodique';
      const commentaire = item.commentaire || item['Observations / Rapport'] || item.observations || null;
      const heure = item.heure || item.Heure || '09:00';
      const statut = item.statut || item.Statut || 'effectuee';

      await db.query(`
        INSERT INTO entreprise_visites (
          entreprise_id, date, heure, medecin_id, medecin_nom,
          type_visite, nb_examines, nb_bilans, nb_visio, nb_audio, nb_ecg,
          nb_embauche, nb_periodique, nb_reprise, nb_spontanee,
          statut, commentaire, created_by, created_by_nom, created_by_role,
          rapport_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        entId,
        dateStr,
        heure ? String(heure).slice(0, 5) : '09:00',
        effectiveMedecinId,
        effectiveMedecinNom,
        typeVisite,
        nbExam,
        nbBilans,
        nbVisio,
        nbAudio,
        nbEcg,
        nbEmbauche,
        nbPeriodique,
        nbReprise,
        nbSpontanee,
        statut,
        commentaire,
        req.user.id,
        `${req.user.prenom || ''} ${req.user.nom || ''}`.trim(),
        req.user.role,
        'medical'
      ]);

      // Mettre à jour le compteur global de visites faites dans l'entreprise
      const [vSum] = await db.query(
        'SELECT COALESCE(SUM(nb_examines), 0) AS total_vu FROM entreprise_visites WHERE entreprise_id = ?',
        [entId]
      );
      await db.query('UPDATE entreprises SET nb_visites_faites = ? WHERE id = ?', [vSum[0]?.total_vu || 0, entId]);

      importedCount++;
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('visites_refresh');
      io.emit('planning_refresh');
    }

    res.json({
      success: true,
      importedCount,
      totalRequested: items.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${importedCount} visite(s) médicale(s) importée(s) avec succès pour Dr. ${effectiveMedecinNom}.`
    });
  } catch (err) {
    console.error('Error importing rapport medecin:', err);
    res.status(500).json({ message: "Erreur lors de l'importation du rapport médical" });
  }
});

// GET /api/entreprises/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'administrateur';
    const [rows] = await db.query('SELECT * FROM entreprises WHERE id=?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Entreprise introuvable' });

    const [avis] = await db.query(`
      SELECT a.*, u.nom AS user_nom, u.prenom AS user_prenom, u.role AS user_role
      FROM entreprise_avis a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.entreprise_id = ?
      ORDER BY a.created_at DESC
    `, [req.params.id]);

    let campagnes = [];
    try {
      const [campRows] = await db.query(`
        SELECT * FROM entreprise_campagnes_annuelles
        WHERE entreprise_id = ?
        ORDER BY annee DESC
      `, [req.params.id]);
      campagnes = campRows || [];
    } catch {
      campagnes = [];
    }

    const visites = await getVisitesForEntreprise(req.params.id, rows[0].nom);

    const entData = { ...rows[0] };
    if (!isAdmin) {
      delete entData.code;
    }

    res.json({ ...entData, avis, campagnes, visites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/entreprises/:id/visites  — Historique complet des visites et de l'effectif vu
router.get('/:id/visites', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM entreprises WHERE id=?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Entreprise introuvable' });

    const allVisites = await getVisitesForEntreprise(req.params.id, rows[0].nom);
    // Filtrage par rôle : le rôle HSE ne doit voir que les Rapports HSE, sans détails médicaux
    const visites = req.user.role === 'hse'
      ? allVisites.filter((v) => v.rapport_type === 'hse' || v.created_by_role === 'hse')
      : allVisites;

    const sumExamines = visites.reduce((acc, v) => acc + (parseInt(v.nb_examines, 10) || 0), 0);
    const effTotal = parseInt(rows[0].effectif_total, 10) || 0;
    const nbVisitesFaites = Math.max(parseInt(rows[0].nb_visites_faites, 10) || 0, sumExamines);

    res.json({
      entreprise_id: rows[0].id,
      entreprise_nom: rows[0].nom,
      effectif_total: effTotal,
      nb_visites_faites: nbVisitesFaites,
      nb_bilans_faits: rows[0].nb_bilans_faits || 0,
      nb_bilans_manquants: rows[0].nb_bilans_manquants || 0,
      visites,
      total_visites: visites.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/entreprises/:id/visites — Enregistrer une nouvelle visite médicale ou rapport HSE
router.post('/:id/visites', authenticate, authorize('administrateur', 'medecin', 'technicien', 'hse'), async (req, res) => {
  const {
    date, heure, medecin_id, technicien_id, medecin_nom, technicien_nom,
    type_visite, nb_examines, nb_bilans, statut, commentaire, planning_id, clino_id,
    patients_updates, lieu_poste, risques_identifies, recommandations, rapport_type,
    patient_id, patient_nom
  } = req.body;

  if (!date) return res.status(400).json({ message: 'Date de la visite requise' });

  try {
    const [rows] = await db.query('SELECT * FROM entreprises WHERE id=?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Entreprise introuvable' });

    const isHseVisit = (rapport_type === 'hse') || (req.user?.role === 'hse');

    // 🔒 SÉCURITÉ : Seul le Responsable HSE a le droit de créer un Rapport de Visite de Poste ou de Lieu (HSE)
    if (isHseVisit && req.user?.role !== 'hse') {
      return res.status(403).json({
        message: 'Accès refusé : Seul le Responsable HSE a le droit de créer un Rapport de Visite de Poste ou de Lieu (HSE).'
      });
    }

    const finalRapportType = isHseVisit ? 'hse' : (rapport_type || 'medical');
    let finalLieuPoste = lieu_poste || null;
    const finalRisques = Array.isArray(risques_identifies) ? risques_identifies.join(', ') : (risques_identifies || null);
    const finalRecommandations = recommandations || null;

    let finalPatientId = patient_id ? parseInt(patient_id, 10) : null;
    let finalPatientNom = patient_nom || null;
    if (finalPatientId && !finalPatientNom) {
      try {
        const [pRows] = await db.query('SELECT CONCAT(prenom, " ", nom) AS fullname, poste FROM entreprise_patients WHERE id = ?', [finalPatientId]);
        if (pRows[0]) {
          finalPatientNom = pRows[0].fullname;
          if (!finalLieuPoste && pRows[0].poste) {
            finalLieuPoste = pRows[0].poste;
          }
        }
      } catch (e) {}
    }

    let finalMedNom = medecin_nom || null;
    if (medecin_id && !finalMedNom) {
      const [u] = await db.query('SELECT CONCAT(prenom, " ", nom) AS fullname FROM users WHERE id=?', [medecin_id]);
      finalMedNom = u[0]?.fullname || null;
    }

    let finalTecNom = technicien_nom || null;
    if (technicien_id && !finalTecNom) {
      const [t] = await db.query('SELECT CONCAT(prenom, " ", nom) AS fullname FROM users WHERE id=?', [technicien_id]);
      finalTecNom = t[0]?.fullname || null;
    }

    // Un utilisateur HSE n'examine pas de patients et n'ajoute pas d'effectif clinique
    let nbExamNum = isHseVisit ? 0 : Math.max(0, parseInt(nb_examines, 10) || 0);
    let nbBilanNum = isHseVisit ? 0 : Math.max(0, parseInt(nb_bilans, 10) || 0);

    let countVisio = 0;
    let countAudio = 0;
    let countEcg = 0;

    let countEmbauche = 0;
    let countPeriodique = 0;
    let countReprise = 0;
    let countSpontanee = 0;

    // Si des salariés spécifiques ont été sélectionnés, synchroniser les effectifs (interdit pour HSE)
    if (!isHseVisit && Array.isArray(patients_updates) && patients_updates.length > 0) {
      nbExamNum = patients_updates.length;
      const countBilans = patients_updates.filter((p) => p.bilan_en_attente).length;
      if (countBilans > 0) nbBilanNum = countBilans;
      countVisio = patients_updates.filter((p) => p.has_visio).length;
      countAudio = patients_updates.filter((p) => p.has_audio).length;
      countEcg = patients_updates.filter((p) => p.has_ecg).length;

      countEmbauche = patients_updates.filter((p) => p.type_visite && p.type_visite.toLowerCase().includes('embauche')).length;
      countReprise = patients_updates.filter((p) => p.type_visite && p.type_visite.toLowerCase().includes('reprise')).length;
      countSpontanee = patients_updates.filter((p) => p.type_visite && (p.type_visite.toLowerCase().includes('spontan') || p.type_visite.toLowerCase().includes('autre'))).length;
      countPeriodique = patients_updates.filter((p) => !p.type_visite || p.type_visite.toLowerCase().includes('period') || p.type_visite.toLowerCase().includes('périod')).length;
      const accounted = countEmbauche + countReprise + countSpontanee + countPeriodique;
      if (accounted < nbExamNum) {
        countPeriodique += (nbExamNum - accounted);
      }
    } else if (!isHseVisit) {
      if (req.body.nb_embauche !== undefined || req.body.nb_periodique !== undefined || req.body.nb_reprise !== undefined || req.body.nb_spontanee !== undefined) {
        countEmbauche = parseInt(req.body.nb_embauche, 10) || 0;
        countPeriodique = parseInt(req.body.nb_periodique, 10) || 0;
        countReprise = parseInt(req.body.nb_reprise, 10) || 0;
        countSpontanee = parseInt(req.body.nb_spontanee, 10) || 0;
      } else {
        const tvLower = String(type_visite || '').toLowerCase();
        if (tvLower.includes('embauche')) countEmbauche = nbExamNum;
        else if (tvLower.includes('reprise')) countReprise = nbExamNum;
        else if (tvLower.includes('spontan') || tvLower.includes('autre')) countSpontanee = nbExamNum;
        else countPeriodique = nbExamNum;
      }
    }

    const creatorNom = req.user ? `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() : null;
    const creatorRole = req.user?.role || 'administrateur';

    // Synchroniser avec planning_events pour que l'admin voie l'intervention dans son calendrier planning
    let syncPlanningId = planning_id || null;
    if (!syncPlanningId) {
      try {
        const planningTitre = isHseVisit
          ? (finalPatientNom ? `Étude de poste (${finalPatientNom}) - ${rows[0].nom}` : `Rapport Visite HSE - ${rows[0].nom}`)
          : `Visite Médicale - ${rows[0].nom}`;

        const [peRes] = await db.query(
          `INSERT INTO planning_events (
            titre, date, heure_debut, adresse, medecin_id, technicien_id, entreprise_id,
            nb_examines, nb_embauche, nb_periodique, nb_reprise, nb_spontanee, statut, commentaire, type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            planningTitre,
            date,
            heure ? String(heure).slice(0, 5) : '08:30:00',
            rows[0].adresse || '',
            medecin_id || null,
            technicien_id || null,
            req.params.id,
            nbExamNum,
            countEmbauche,
            countPeriodique,
            countReprise,
            countSpontanee,
            statut || 'effectuee',
            commentaire || (isHseVisit ? `Rapport HSE enregistré par ${creatorNom || 'Responsable HSE'}` : `Visite enregistrée par ${creatorNom || 'l\'équipe médicale'}`),
            isHseVisit ? 'evenement' : 'visite'
          ]
        );
        syncPlanningId = peRes.insertId;
      } catch (peErr) {
        console.warn('Note: Could not sync to planning_events:', peErr.message);
      }
    }

    const [result] = await db.query(
      `INSERT INTO entreprise_visites (
        entreprise_id, date, heure, medecin_id, technicien_id, medecin_nom, technicien_nom,
        type_visite, nb_examines, nb_bilans, nb_visio, nb_audio, nb_ecg,
        nb_embauche, nb_periodique, nb_reprise, nb_spontanee,
        statut, commentaire, planning_id, clino_id, created_by, created_by_nom, created_by_role,
        lieu_poste, risques_identifies, recommandations, rapport_type,
        patient_id, patient_nom
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        date,
        heure ? String(heure).slice(0, 5) : null,
        medecin_id || null,
        technicien_id || null,
        finalMedNom,
        finalTecNom,
        type_visite || (isHseVisit ? 'Visite des lieux de travail & Étude de poste' : 'Visite Médicale Périodique'),
        nbExamNum,
        nbBilanNum,
        countVisio,
        countAudio,
        countEcg,
        countEmbauche,
        countPeriodique,
        countReprise,
        countSpontanee,
        statut || 'effectuee',
        commentaire || null,
        syncPlanningId,
        clino_id || null,
        req.user?.id || null,
        creatorNom,
        creatorRole,
        finalLieuPoste,
        finalRisques,
        finalRecommandations,
        finalRapportType,
        finalPatientId,
        finalPatientNom,
      ]
    );

    // Mettre à jour chaque salarié sélectionné dans entreprise_patients (uniquement pour les visites médicales)
    if (!isHseVisit && Array.isArray(patients_updates) && patients_updates.length > 0) {
      for (const pu of patients_updates) {
        if (!pu.id) continue;
        const resVal = pu.resultat_visite || 'apte';
        const isTemp = resVal === 'apte_temporaire' || resVal === 'inapte_temporaire';
        const dureeVal = isTemp ? (pu.duree_temporaire || '3 mois à revoir') : null;
        const dateRevoirVal = isTemp ? (pu.date_revoir || null) : null;
        const bilanVal = pu.bilan_en_attente ? 1 : 0;
        const typeBilanVal = pu.type_bilan || null;
        const visioVal = pu.has_visio ? 1 : 0;
        const audioVal = pu.has_audio ? 1 : 0;
        const ecgVal = pu.has_ecg ? 1 : 0;

        await db.query(`
          UPDATE entreprise_patients SET
            resultat_visite = ?,
            duree_temporaire = ?,
            date_revoir = ?,
            date_derniere_visite = ?,
            medecin_nom = COALESCE(?, medecin_nom),
            medecin_id = COALESCE(?, medecin_id),
            type_visite = COALESCE(?, type_visite),
            bilan_en_attente = ?,
            type_bilan = ?,
            has_visio = ?,
            has_audio = ?,
            has_ecg = ?,
            notes = CASE WHEN ? IS NOT NULL AND ? != '' THEN ? ELSE notes END,
            statut_visite = 'visite_effectuee'
          WHERE id = ? AND entreprise_id = ?
        `, [
          resVal,
          dureeVal,
          dateRevoirVal,
          date,
          finalMedNom,
          medecin_id || null,
          pu.type_visite || type_visite || 'Visite Périodique',
          bilanVal,
          typeBilanVal,
          visioVal,
          audioVal,
          ecgVal,
          pu.notes || null, pu.notes || null, pu.notes || null,
          pu.id,
          req.params.id
        ]);
      }
    }

    let finalVisitesFaites = parseInt(rows[0].nb_visites_faites, 10) || 0;

    // Pour les visites médicales, mettre à jour l'effectif examiné cumulé dans la table entreprises
    if (!isHseVisit) {
      const [patientStats] = await db.query(`
        SELECT
          COUNT(*) AS total_patients,
          SUM(CASE WHEN resultat_visite IN ('apte', 'apte_temporaire', 'apte_avec_amenagement', 'inapte_temporaire', 'inapte') THEN 1 ELSE 0 END) AS nb_patients_visites,
          SUM(CASE WHEN bilan_en_attente = 1 THEN 1 ELSE 0 END) AS nb_bilans_manquants
        FROM entreprise_patients WHERE entreprise_id = ?
      `, [req.params.id]);

      if (patientStats[0]?.total_patients > 0) {
        finalVisitesFaites = patientStats[0].nb_patients_visites || 0;
        const nbBilansManquants = patientStats[0].nb_bilans_manquants || 0;
        await db.query(`
          UPDATE entreprises SET
            nb_visites_faites = ?,
            nb_bilans_manquants = ?,
            date_derniere_visite = ?
          WHERE id = ?
        `, [finalVisitesFaites, nbBilansManquants, date, req.params.id]);
      } else {
        const [sumRows] = await db.query(
          'SELECT COALESCE(SUM(nb_examines), 0) AS total_vu, COALESCE(SUM(nb_bilans), 0) AS total_bilans FROM entreprise_visites WHERE entreprise_id=?',
          [req.params.id]
        );
        const newTotalExam = sumRows[0]?.total_vu || nbExamNum;
        finalVisitesFaites = Math.max(finalVisitesFaites, newTotalExam);

        await db.query(`
          UPDATE entreprises SET
            nb_visites_faites = ?,
            date_derniere_visite = ?
          WHERE id = ?
        `, [finalVisitesFaites, date, req.params.id]);
      }
    } else {
      // Visite HSE : enregistrer uniquement la date de dernière visite sans incrémenter les effectifs médicaux
      await db.query(`
        UPDATE entreprises SET
          date_derniere_visite = COALESCE(date_derniere_visite, ?)
        WHERE id = ?
      `, [date, req.params.id]);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('entreprises_refresh');
      io.emit('planning_refresh');
    }
    invalidateEntreprisesCache();

    res.status(201).json({
      message: isHseVisit ? 'Rapport de visite HSE enregistré avec succès ✓' : 'Visite enregistrée avec succès ✓',
      id: result.insertId,
      nb_examines: nbExamNum,
      nb_visites_faites: finalVisitesFaites,
      rapport_type: finalRapportType,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/entreprises/:id/visites/:visiteId — Supprimer une visite de l'historique
router.delete('/:id/visites/:visiteId', authenticate, authorize('administrateur', 'medecin', 'hse'), async (req, res) => {
  try {
    const [existing] = await db.query('SELECT * FROM entreprise_visites WHERE id=? AND entreprise_id=?', [req.params.visiteId, req.params.id]);
    if (!existing[0]) return res.status(404).json({ message: 'Visite introuvable' });

    // Si c'est un rapport HSE, seul le rôle HSE ou Administrateur a le droit de le supprimer
    if (existing[0].rapport_type === 'hse' && req.user.role !== 'hse' && req.user.role !== 'administrateur') {
      return res.status(403).json({ message: 'Seul le Responsable HSE ou l\'Administrateur peut supprimer un Rapport HSE' });
    }

    await db.query('DELETE FROM entreprise_visites WHERE id=? AND entreprise_id=?', [req.params.visiteId, req.params.id]);

    const [sumRows] = await db.query(
      'SELECT COALESCE(SUM(nb_examines), 0) AS total_vu FROM entreprise_visites WHERE entreprise_id=?',
      [req.params.id]
    );
    const newTotalExam = sumRows[0]?.total_vu || 0;

    await db.query('UPDATE entreprises SET nb_visites_faites = ? WHERE id = ?', [newTotalExam, req.params.id]);
    invalidateEntreprisesCache();

    const io = req.app.get('io');
    if (io) {
      io.emit('entreprises_refresh');
    }

    res.json({ message: 'Visite supprimée avec succès' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/entreprises  (Admin only)
router.post('/', authenticate, authorize('administrateur'), async (req, res) => {
  const {
    code, nom, secteur, adresse, telephone, email, site_web, description, convensionne,
    date_debut_convention, date_fin_convention, renouvelable,
    annee_campagne, date_derniere_visite,
    effectif_total, nb_visites_faites, nb_bilans_faits, nb_bilans_manquants,
  } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });
  try {
    const [result] = await db.query(
      `INSERT INTO entreprises (
        code, nom, secteur, adresse, telephone, email, site_web, description, convensionne,
        date_debut_convention, date_fin_convention, renouvelable,
        annee_campagne, date_derniere_visite,
        effectif_total, nb_visites_faites, nb_bilans_faits, nb_bilans_manquants
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        code?.trim() || null,
        nom.trim(), secteur||null, adresse||null, telephone||null, email||null, site_web||null, description||null,
        convensionne ? 1 : 0,
        date_debut_convention || null,
        date_fin_convention || null,
        renouvelable ? 1 : 0,
        parseInt(annee_campagne) || new Date().getFullYear(),
        date_derniere_visite || null,
        parseInt(effectif_total) || 0,
        parseInt(nb_visites_faites) || 0,
        parseInt(nb_bilans_faits) || 0,
        parseInt(nb_bilans_manquants) || 0,
      ]
    );
    invalidateEntreprisesCache();
    res.status(201).json({ message: 'Entreprise créée', id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/entreprises/:id  (Admin only)
router.put('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  const {
    code, nom, secteur, adresse, telephone, email, site_web, description, convensionne,
    date_debut_convention, date_fin_convention, renouvelable,
    annee_campagne, date_derniere_visite,
    effectif_total, nb_visites_faites, nb_bilans_faits, nb_bilans_manquants,
  } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });
  try {
    await db.query(
      `UPDATE entreprises SET
        code=?, nom=?, secteur=?, adresse=?, telephone=?, email=?, site_web=?, description=?, convensionne=?,
        date_debut_convention=?, date_fin_convention=?, renouvelable=?,
        annee_campagne=?, date_derniere_visite=?,
        effectif_total=?, nb_visites_faites=?, nb_bilans_faits=?, nb_bilans_manquants=?
      WHERE id=?`,
      [
        code !== undefined ? (code?.trim() || null) : null,
        nom.trim(), secteur||null, adresse||null, telephone||null, email||null, site_web||null, description||null,
        convensionne ? 1 : 0,
        date_debut_convention || null,
        date_fin_convention || null,
        renouvelable ? 1 : 0,
        parseInt(annee_campagne) || new Date().getFullYear(),
        date_derniere_visite || null,
        parseInt(effectif_total) || 0,
        parseInt(nb_visites_faites) || 0,
        parseInt(nb_bilans_faits) || 0,
        parseInt(nb_bilans_manquants) || 0,
        req.params.id,
      ]
    );
    invalidateEntreprisesCache();
    res.json({ message: 'Entreprise mise à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PATCH /api/entreprises/:id/bilan  (Admin, Médecin, Technicien - mise à jour rapide des effectifs vus et bilans)
router.patch('/:id/bilan', authenticate, authorize('administrateur', 'medecin', 'technicien'), async (req, res) => {
  const {
    effectif_total, nb_visites_faites, nb_bilans_faits, nb_bilans_manquants,
    annee_campagne, date_derniere_visite
  } = req.body;
  const isAdmin = req.user.role === 'administrateur';

  try {
    if (isAdmin && effectif_total !== undefined) {
      await db.query(
        `UPDATE entreprises SET
          effectif_total=?, nb_visites_faites=?, nb_bilans_faits=?, nb_bilans_manquants=?,
          annee_campagne=COALESCE(?, annee_campagne), date_derniere_visite=COALESCE(?, date_derniere_visite)
        WHERE id=?`,
        [
          parseInt(effectif_total) || 0,
          parseInt(nb_visites_faites) || 0,
          parseInt(nb_bilans_faits) || 0,
          parseInt(nb_bilans_manquants) || 0,
          annee_campagne ? parseInt(annee_campagne) : null,
          date_derniere_visite || null,
          req.params.id,
        ]
      );
    } else {
      // Médecins et Techniciens : Saisie et mise à jour de l'effectif examiné / bilans
      await db.query(
        `UPDATE entreprises SET
          nb_visites_faites=?, nb_bilans_faits=?, nb_bilans_manquants=?,
          date_derniere_visite=COALESCE(?, date_derniere_visite)
        WHERE id=?`,
        [
          parseInt(nb_visites_faites) || 0,
          parseInt(nb_bilans_faits) || 0,
          parseInt(nb_bilans_manquants) || 0,
          date_derniere_visite || null,
          req.params.id,
        ]
      );
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('entreprises_refresh');
    }
    invalidateEntreprisesCache();

    res.json({ message: 'Bilan et effectif mis à jour avec succès' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/entreprises/:id/nouvelle-campagne (Admin only - Réinitialisation annuelle & Archivage)
router.post('/:id/nouvelle-campagne', authenticate, authorize('administrateur'), async (req, res) => {
  const { nouvelle_annee } = req.body;
  const targetYear = parseInt(nouvelle_annee, 10) || (new Date().getFullYear());

  try {
    const [rows] = await db.query('SELECT * FROM entreprises WHERE id=?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Entreprise introuvable' });

    const ent = rows[0];
    const prevYear = ent.annee_campagne || (targetYear - 1);
    const effTotal = parseInt(ent.effectif_total, 10) || 0;
    const vf = parseInt(ent.nb_visites_faites, 10) || 0;
    const bf = parseInt(ent.nb_bilans_faits, 10) || 0;
    const taux = effTotal > 0 ? Math.min(100, Math.round((vf / effTotal) * 100 * 100) / 100) : 0;
    const today = new Date().toISOString().slice(0, 10);

    // Archiver la campagne précédente dans la table historique
    try {
      await db.query(`
        INSERT INTO entreprise_campagnes_annuelles (
          entreprise_id, annee, effectif_total, nb_visites_faites, nb_bilans_faits, taux_realisation, date_cloture
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [ent.id, prevYear, effTotal, vf, bf, taux, today]);
    } catch (e) {
      console.warn('Note: Archivage de la campagne:', e.message);
    }

    // Réinitialiser pour la nouvelle année
    await db.query(`
      UPDATE entreprises SET
        annee_campagne = ?,
        nb_visites_faites = 0,
        nb_bilans_faits = 0,
        nb_bilans_manquants = 0
      WHERE id = ?
    `, [targetYear, req.params.id]);

    invalidateEntreprisesCache();
    res.json({
      message: `Campagne ${targetYear} initialisée avec succès. Effectif réinitialisé pour la nouvelle année.`,
      annee: targetYear,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});


// DELETE /api/entreprises/:id  (Admin only)
router.delete('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  try {
    await db.query('DELETE FROM entreprises WHERE id=?', [req.params.id]);
    invalidateEntreprisesCache();
    res.json({ message: 'Entreprise supprimée' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════════
// AVIS & REMARQUES
// ═══════════════════════════════════════════════════════════════

// GET /api/entreprises/:id/avis
router.get('/:id/avis', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT a.*, u.nom AS user_nom, u.prenom AS user_prenom, u.role AS user_role
      FROM entreprise_avis a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.entreprise_id = ?
      ORDER BY a.created_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/entreprises/import  (Admin only - Import en masse Excel / CSV)
router.post('/import', authenticate, authorize('administrateur'), async (req, res) => {
  const { items, updateExisting = true } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Aucune donnée à importer (liste vide ou invalide)' });
  }

  const currentYear = new Date().getFullYear();

  try {
    // 1. Récupérer toutes les entreprises existantes en 1 seule requête ultra-rapide
    const [existingRows] = await db.query('SELECT id, code, LOWER(TRIM(nom)) AS nom_lower FROM entreprises');
    
    const byCodeMap = new Map();
    const byNomMap = new Map();
    for (const row of existingRows) {
      if (row.code) byCodeMap.set(String(row.code).trim(), row.id);
      if (row.nom_lower) byNomMap.set(row.nom_lower, row.id);
    }

    const toInsert = [];
    const toUpdate = [];
    let skipped = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowNum = i + 1;

      let nom = typeof item.nom === 'string' ? item.nom.trim() : (item.nom ? String(item.nom).trim() : '');
      const code = item.code ? String(item.code).trim().slice(0, 100) : null;

      if (!nom) {
        if (code) {
          nom = `Entreprise ${code}`;
        } else if (item.telephone || item.adresse) {
          nom = `Entreprise ${String(item.telephone || item.adresse).trim().slice(0, 50)}`;
        } else {
          nom = `Entreprise #${rowNum}`;
        }
      }
      nom = nom.slice(0, 255);

      // Normalisation sécurisée des champs
      const secteur = item.secteur ? String(item.secteur).trim().slice(0, 255) : null;
      const adresse = item.adresse ? String(item.adresse).trim().slice(0, 1000) : null;
      const telephone = item.telephone ? String(item.telephone).trim().slice(0, 255) : null;
      const email = item.email ? String(item.email).trim().slice(0, 255) : null;
      const site_web = item.site_web ? String(item.site_web).trim().slice(0, 255) : null;
      const description = item.description ? String(item.description).trim().slice(0, 2000) : null;

      // Conventionné (Oui/Non/1/0/true/false)
      let convensionne = 1;
      if (item.convensionne !== undefined && item.convensionne !== null) {
        const cStr = String(item.convensionne).trim().toLowerCase();
        if (cStr === '0' || cStr === 'false' || cStr === 'non' || cStr === 'non conventionnée' || cStr === 'no') {
          convensionne = 0;
        }
      }

      // Dates convention
      const date_debut_convention = item.date_debut_convention ? String(item.date_debut_convention).slice(0, 10) : null;
      const date_fin_convention = item.date_fin_convention ? String(item.date_fin_convention).slice(0, 10) : null;
      const date_derniere_visite = item.date_derniere_visite ? String(item.date_derniere_visite).slice(0, 10) : null;

      // Renouvelable
      let renouvelable = 1;
      if (item.renouvelable !== undefined && item.renouvelable !== null) {
        const rStr = String(item.renouvelable).trim().toLowerCase();
        if (rStr === '0' || rStr === 'false' || rStr === 'non' || rStr === 'no') {
          renouvelable = 0;
        }
      }

      // Année et effectifs
      const annee_campagne = parseInt(item.annee_campagne, 10) || currentYear;
      const effectif_total = Math.max(0, parseInt(item.effectif_total, 10) || 0);
      const nb_visites_faites = Math.max(0, parseInt(item.nb_visites_faites, 10) || 0);
      const nb_bilans_faits = Math.max(0, parseInt(item.nb_bilans_faits, 10) || 0);
      const nb_bilans_manquants = Math.max(0, parseInt(item.nb_bilans_manquants, 10) || 0);

      // Vérification en mémoire O(1)
      let existingId = null;
      if (code && byCodeMap.has(code)) {
        existingId = byCodeMap.get(code);
      } else if (nom && byNomMap.has(nom.toLowerCase())) {
        existingId = byNomMap.get(nom.toLowerCase());
      }

      if (existingId) {
        if (updateExisting) {
          toUpdate.push({
            id: existingId,
            code, nom, secteur, adresse, telephone, email, site_web, description,
            convensionne, date_debut_convention, date_fin_convention, renouvelable,
            annee_campagne, date_derniere_visite,
            effectif_total, nb_visites_faites, nb_bilans_faits, nb_bilans_manquants
          });
        } else {
          skipped++;
        }
      } else {
        toInsert.push([
          code, nom, secteur, adresse, telephone, email, site_web, description,
          convensionne, date_debut_convention, date_fin_convention, renouvelable,
          annee_campagne, date_derniere_visite,
          effectif_total, nb_visites_faites, nb_bilans_faits, nb_bilans_manquants
        ]);
        if (code) byCodeMap.set(code, true);
        if (nom) byNomMap.set(nom.toLowerCase(), true);
      }
    }

    let created = 0;
    let updated = 0;

    // 2. Insérer en bulk par lots de 100
    if (toInsert.length > 0) {
      const CHUNK_SIZE = 100;
      for (let c = 0; c < toInsert.length; c += CHUNK_SIZE) {
        const chunk = toInsert.slice(c, c + CHUNK_SIZE);
        await db.query(
          `INSERT INTO entreprises (
            code, nom, secteur, adresse, telephone, email, site_web, description,
            convensionne, date_debut_convention, date_fin_convention, renouvelable,
            annee_campagne, date_derniere_visite,
            effectif_total, nb_visites_faites, nb_bilans_faits, nb_bilans_manquants
          ) VALUES ?`,
          [chunk]
        );
        created += chunk.length;
      }
    }

    // 3. Mettre à jour les existantes en parallèle (par paquets de 10)
    if (toUpdate.length > 0) {
      const BATCH_PARALLEL = 10;
      for (let c = 0; c < toUpdate.length; c += BATCH_PARALLEL) {
        const batch = toUpdate.slice(c, c + BATCH_PARALLEL);
        await Promise.all(
          batch.map(u =>
            db.query(
              `UPDATE entreprises SET
                code = COALESCE(?, code),
                nom = ?,
                secteur = COALESCE(?, secteur),
                adresse = COALESCE(?, adresse),
                telephone = COALESCE(?, telephone),
                email = COALESCE(?, email),
                site_web = COALESCE(?, site_web),
                description = COALESCE(?, description),
                convensionne = ?,
                date_debut_convention = COALESCE(?, date_debut_convention),
                date_fin_convention = COALESCE(?, date_fin_convention),
                renouvelable = ?,
                annee_campagne = ?,
                date_derniere_visite = COALESCE(?, date_derniere_visite),
                effectif_total = ?,
                nb_visites_faites = ?,
                nb_bilans_faits = ?,
                nb_bilans_manquants = ?
              WHERE id = ?`,
              [
                u.code, u.nom, u.secteur, u.adresse, u.telephone, u.email, u.site_web, u.description,
                u.convensionne, u.date_debut_convention, u.date_fin_convention, u.renouvelable,
                u.annee_campagne, u.date_derniere_visite,
                u.effectif_total, u.nb_visites_faites, u.nb_bilans_faits, u.nb_bilans_manquants,
                u.id
              ]
            )
          )
        );
        updated += batch.length;
      }
    }

    invalidateEntreprisesCache();
    res.json({
      message: 'Importation terminée avec succès',
      total: items.length,
      created,
      updated,
      skipped,
      errors: [],
    });
  } catch (err) {
    console.error('Erreur import en masse:', err);
    res.status(500).json({ message: 'Erreur lors de l\'importation: ' + (err.message || 'Erreur serveur') });
  }
});

// POST /api/entreprises/:id/avis  (Any authenticated user)
router.post('/:id/avis', authenticate, async (req, res) => {
  const { note, commentaire, type_avis } = req.body;
  if (!commentaire?.trim()) return res.status(400).json({ message: 'Commentaire requis' });
  if (note !== undefined && (note < 1 || note > 5))
    return res.status(400).json({ message: 'Note entre 1 et 5' });

  try {
    // Check entreprise exists
    const [ent] = await db.query('SELECT id FROM entreprises WHERE id=?', [req.params.id]);
    if (!ent.length) return res.status(404).json({ message: 'Entreprise introuvable' });

    const [result] = await db.query(
      'INSERT INTO entreprise_avis (entreprise_id,user_id,note,commentaire,type_avis) VALUES (?,?,?,?,?)',
      [req.params.id, req.user.id, note||null, commentaire.trim(), type_avis||'avis']
    );
    invalidateEntreprisesCache();
    res.status(201).json({ message: 'Avis ajouté', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/entreprises/:id/avis/:avisId  (own avis or admin)
router.put('/:id/avis/:avisId', authenticate, async (req, res) => {
  const { note, commentaire, type_avis } = req.body;
  if (!commentaire?.trim()) return res.status(400).json({ message: 'Commentaire requis' });
  try {
    const [rows] = await db.query('SELECT * FROM entreprise_avis WHERE id=?', [req.params.avisId]);
    if (!rows[0]) return res.status(404).json({ message: 'Avis introuvable' });
    if (rows[0].user_id !== req.user.id && req.user.role !== 'administrateur')
      return res.status(403).json({ message: 'Accès refusé' });

    await db.query(
      'UPDATE entreprise_avis SET note=?,commentaire=?,type_avis=? WHERE id=?',
      [note||null, commentaire.trim(), type_avis||'avis', req.params.avisId]
    );
    invalidateEntreprisesCache();
    res.json({ message: 'Avis mis à jour' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/entreprises/:id/avis/:avisId (own avis or admin)
router.delete('/:id/avis/:avisId', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM entreprise_avis WHERE id=?', [req.params.avisId]);
    if (!rows[0]) return res.status(404).json({ message: 'Avis introuvable' });
    if (rows[0].user_id !== req.user.id && req.user.role !== 'administrateur')
      return res.status(403).json({ message: 'Accès refusé' });

    await db.query('DELETE FROM entreprise_avis WHERE id=?', [req.params.avisId]);
    invalidateEntreprisesCache();
    res.json({ message: 'Avis supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════════
// PATIENTS / SALARIÉS DE L'ENTREPRISE
// ═══════════════════════════════════════════════════════════════

// GET /api/entreprises/:id/patients
router.get('/:id/patients', authenticate, async (req, res) => {
  try {
    const { search, statut } = req.query;
    let query = `
      SELECT p.*,
        (SELECT COUNT(*) FROM entreprise_patient_documents WHERE patient_id = p.id) AS nb_documents
      FROM entreprise_patients p
      WHERE p.entreprise_id = ?
    `;
    const params = [req.params.id];

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      query += ' AND (p.nom LIKE ? OR p.prenom LIKE ? OR p.cin LIKE ? OR p.matricule LIKE ? OR p.poste LIKE ?)';
      params.push(s, s, s, s, s);
    }

    if (statut && statut !== 'all') {
      query += ' AND p.statut_visite = ?';
      params.push(statut);
    }

    query += ' ORDER BY p.nom ASC, p.prenom ASC';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching patients:', err);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des patients' });
  }
});

// POST /api/entreprises/:id/patients (Admin, Médecin, Technicien - ajout manuel)
router.post('/:id/patients', authenticate, authorize('administrateur', 'medecin', 'technicien'), async (req, res) => {
  const {
    nom, prenom, cin, matricule, date_naissance, genre, poste, departement, telephone, email,
    statut_visite, type_visite, resultat_visite, duree_temporaire, date_revoir, date_derniere_visite, medecin_nom, notes,
    has_visio, has_audio, has_ecg
  } = req.body;

  if (!nom?.trim() || !prenom?.trim()) {
    return res.status(400).json({ message: 'Le nom et le prénom sont obligatoires' });
  }

  try {
    const [ent] = await db.query('SELECT id FROM entreprises WHERE id = ?', [req.params.id]);
    if (!ent[0]) return res.status(404).json({ message: 'Entreprise introuvable' });

    const finalResultat = resultat_visite || (statut_visite && statut_visite !== 'en_attente' ? statut_visite : 'en_attente');
    const finalStatut = finalResultat !== 'en_attente' ? 'visite_effectuee' : 'en_attente';

    const creatorNom = req.user ? `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() : null;
    const creatorRole = req.user?.role || 'administrateur';
    const creatorId = req.user?.id || null;

    const [result] = await db.query(`
      INSERT INTO entreprise_patients (
        entreprise_id, nom, prenom, cin, matricule, date_naissance, genre, poste, departement, telephone, email,
        statut_visite, type_visite, resultat_visite, duree_temporaire, date_revoir, date_derniere_visite, medecin_nom, notes,
        has_visio, has_audio, has_ecg, created_by, created_by_nom, created_by_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.params.id,
      nom.trim(),
      prenom.trim(),
      cin?.trim() || null,
      matricule?.trim() || null,
      date_naissance || null,
      genre === 'F' ? 'F' : 'M',
      poste?.trim() || null,
      departement?.trim() || null,
      telephone?.trim() || null,
      email?.trim() || null,
      finalStatut,
      type_visite || 'Visite Périodique',
      finalResultat,
      duree_temporaire ? duree_temporaire.trim() : null,
      date_revoir || null,
      date_derniere_visite || null,
      medecin_nom?.trim() || null,
      notes?.trim() || null,
      has_visio ? 1 : 0,
      has_audio ? 1 : 0,
      has_ecg ? 1 : 0,
      creatorId,
      creatorNom,
      creatorRole,
    ]);

    // Mettre à jour l'effectif total et les visites faites de l'entreprise
    const [counts] = await db.query(`
      SELECT 
        COUNT(*) AS total,
        COUNT(CASE WHEN resultat_visite IN ('apte', 'apte_temporaire', 'apte_avec_amenagement', 'inapte_temporaire', 'inapte', 'visite_effectuee') THEN 1 END) AS visites_faites
      FROM entreprise_patients WHERE entreprise_id = ?
    `, [req.params.id]);

    await db.query(`
      UPDATE entreprises 
      SET effectif_total = ?, nb_visites_faites = ?
      WHERE id = ?
    `, [counts[0].total, counts[0].visites_faites, req.params.id]);

    const io = req.app.get('io');
    if (io) {
      io.emit('entreprises_refresh');
      io.emit('patients_refresh', { entreprise_id: req.params.id, patient_id: result.insertId });
    }

    invalidateEntreprisesCache();
    res.status(201).json({ message: 'Patient / salarié ajouté avec succès', id: result.insertId });
  } catch (err) {
    console.error('Error adding patient:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/entreprises/:id/patients/:patientId (Admin, Médecin, Technicien)
router.put('/:id/patients/:patientId', authenticate, authorize('administrateur', 'medecin', 'technicien'), async (req, res) => {
  try {
    const {
      nom, prenom, cin, matricule, date_naissance, genre, poste, departement, telephone, email,
      statut_visite, type_visite, resultat_visite, duree_temporaire, date_revoir, date_derniere_visite, medecin_nom, notes,
      has_visio, has_audio, has_ecg
    } = req.body;

    const [rows] = await db.query('SELECT * FROM entreprise_patients WHERE id = ? AND entreprise_id = ?', [req.params.patientId, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Patient introuvable' });

    const finalResultat = resultat_visite !== undefined ? resultat_visite : rows[0].resultat_visite;
    const finalStatut = finalResultat && finalResultat !== 'en_attente' ? 'visite_effectuee' : (statut_visite || rows[0].statut_visite);

    await db.query(`
      UPDATE entreprise_patients SET
        nom = COALESCE(?, nom),
        prenom = COALESCE(?, prenom),
        cin = ?,
        matricule = ?,
        date_naissance = ?,
        genre = COALESCE(?, genre),
        poste = ?,
        departement = ?,
        telephone = ?,
        email = ?,
        statut_visite = ?,
        type_visite = COALESCE(?, type_visite),
        resultat_visite = ?,
        duree_temporaire = ?,
        date_revoir = ?,
        date_derniere_visite = ?,
        medecin_nom = ?,
        notes = ?,
        has_visio = COALESCE(?, has_visio),
        has_audio = COALESCE(?, has_audio),
        has_ecg = COALESCE(?, has_ecg)
      WHERE id = ? AND entreprise_id = ?
    `, [
      nom ? nom.trim() : null,
      prenom ? prenom.trim() : null,
      cin !== undefined ? (cin ? cin.trim() : null) : rows[0].cin,
      matricule !== undefined ? (matricule ? matricule.trim() : null) : rows[0].matricule,
      date_naissance !== undefined ? (date_naissance || null) : rows[0].date_naissance,
      genre !== undefined ? (genre === 'F' ? 'F' : 'M') : rows[0].genre,
      poste !== undefined ? (poste ? poste.trim() : null) : rows[0].poste,
      departement !== undefined ? (departement ? departement.trim() : null) : rows[0].departement,
      telephone !== undefined ? (telephone ? telephone.trim() : null) : rows[0].telephone,
      email !== undefined ? (email ? email.trim() : null) : rows[0].email,
      finalStatut,
      type_visite || null,
      finalResultat || 'en_attente',
      duree_temporaire !== undefined ? (duree_temporaire ? duree_temporaire.trim() : null) : rows[0].duree_temporaire,
      date_revoir !== undefined ? (date_revoir || null) : rows[0].date_revoir,
      date_derniere_visite !== undefined ? (date_derniere_visite || null) : rows[0].date_derniere_visite,
      medecin_nom !== undefined ? (medecin_nom ? medecin_nom.trim() : null) : rows[0].medecin_nom,
      notes !== undefined ? (notes ? notes.trim() : null) : rows[0].notes,
      has_visio !== undefined ? (has_visio ? 1 : 0) : null,
      has_audio !== undefined ? (has_audio ? 1 : 0) : null,
      has_ecg !== undefined ? (has_ecg ? 1 : 0) : null,
      req.params.patientId,
      req.params.id,
    ]);

    // Recalculer le nombre de visites faites pour cette entreprise
    const [counts] = await db.query(`
      SELECT 
        COUNT(*) AS total,
        COUNT(CASE WHEN resultat_visite IN ('apte', 'apte_temporaire', 'apte_avec_amenagement', 'inapte_temporaire', 'inapte', 'visite_effectuee') THEN 1 END) AS visites_faites
      FROM entreprise_patients WHERE entreprise_id = ?
    `, [req.params.id]);

    await db.query('UPDATE entreprises SET effectif_total = ?, nb_visites_faites = ? WHERE id = ?', [counts[0].total, counts[0].visites_faites, req.params.id]);

    const io = req.app.get('io');
    if (io) {
      io.emit('entreprises_refresh');
      io.emit('patients_refresh', { entreprise_id: req.params.id, patient_id: req.params.patientId });
    }

    invalidateEntreprisesCache();
    res.json({ message: 'Patient mis à jour avec succès' });
  } catch (err) {
    console.error('Error updating patient:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/entreprises/:id/patients/:patientId (Admin only)
router.delete('/:id/patients/:patientId', authenticate, authorize('administrateur'), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id FROM entreprise_patients WHERE id = ? AND entreprise_id = ?', [req.params.patientId, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Patient introuvable' });

    await db.query('DELETE FROM entreprise_patients WHERE id = ? AND entreprise_id = ?', [req.params.patientId, req.params.id]);

    // Mettre à jour effectif total
    const [counts] = await db.query(`
      SELECT 
        COUNT(*) AS total,
        COUNT(CASE WHEN resultat_visite IN ('apte', 'apte_temporaire', 'apte_avec_amenagement', 'inapte_temporaire', 'inapte', 'visite_effectuee') THEN 1 END) AS visites_faites
      FROM entreprise_patients WHERE entreprise_id = ?
    `, [req.params.id]);

    await db.query(`
      UPDATE entreprises 
      SET effectif_total = ?, nb_visites_faites = ?
      WHERE id = ?
    `, [counts[0]?.total || 0, counts[0]?.visites_faites || 0, req.params.id]);

    const io = req.app.get('io');
    if (io) {
      io.emit('entreprises_refresh');
      io.emit('patients_refresh', { entreprise_id: req.params.id });
    }

    invalidateEntreprisesCache();
    res.json({ message: 'Patient supprimé avec succès' });
  } catch (err) {
    console.error('Error deleting patient:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/entreprises/:id/patients/import (Admin, Médecin, Technicien - Import Excel/CSV)
router.post('/:id/patients/import', authenticate, authorize('administrateur', 'medecin', 'technicien'), async (req, res) => {
  const { items, updateExisting = true } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Aucune donnée à importer' });
  }

  try {
    const [ent] = await db.query('SELECT id, nom FROM entreprises WHERE id = ?', [req.params.id]);
    if (!ent[0]) return res.status(404).json({ message: 'Entreprise introuvable' });

    const creatorNom = req.user ? `${req.user.prenom || ''} ${req.user.nom || ''}`.trim() : null;
    const creatorRole = req.user?.role || 'administrateur';
    const creatorId = req.user?.id || null;

    // Récupérer les patients existants de l'entreprise pour dédupliquer/mettre à jour
    const [existing] = await db.query('SELECT id, cin, matricule, LOWER(TRIM(nom)) AS nom_lower, LOWER(TRIM(prenom)) AS prenom_lower FROM entreprise_patients WHERE entreprise_id = ?', [req.params.id]);
    
    const byCin = new Map();
    const byName = new Map();
    existing.forEach(p => {
      if (p.cin) byCin.set(String(p.cin).trim().toLowerCase(), p.id);
      byName.set(`${p.nom_lower}|${p.prenom_lower}`, p.id);
    });

    let inserted = 0;
    let updated = 0;

    for (const item of items) {
      const nom = String(item.nom || '').trim();
      const prenom = String(item.prenom || '').trim();
      if (!nom || !prenom) continue;

      const cin = item.cin ? String(item.cin).trim() : null;
      const matricule = item.matricule ? String(item.matricule).trim() : null;
      const date_naissance = item.date_naissance ? String(item.date_naissance).slice(0, 10) : null;
      const genre = item.genre === 'F' ? 'F' : 'M';
      const poste = item.poste ? String(item.poste).trim() : null;
      const departement = item.departement ? String(item.departement).trim() : null;
      const telephone = item.telephone ? String(item.telephone).trim() : null;
      const email = item.email ? String(item.email).trim() : null;
      
      const type_visite = item.type_visite || 'Visite Périodique';
      const resultat_visite = item.resultat_visite || item.statut_visite || 'en_attente';
      const statut_visite = resultat_visite !== 'en_attente' ? 'visite_effectuee' : 'en_attente';
      const duree_temporaire = item.duree_temporaire ? String(item.duree_temporaire).trim() : null;
      const date_revoir = item.date_revoir ? String(item.date_revoir).slice(0, 10) : null;
      const date_derniere_visite = item.date_derniere_visite ? String(item.date_derniere_visite).slice(0, 10) : null;
      const medecin_nom = item.medecin_nom ? String(item.medecin_nom).trim() : null;
      const notes = item.notes ? String(item.notes).trim() : null;

      const keyName = `${nom.toLowerCase()}|${prenom.toLowerCase()}`;
      const existingId = (cin && byCin.has(cin.toLowerCase())) ? byCin.get(cin.toLowerCase()) : byName.get(keyName);

      if (existingId && updateExisting) {
        await db.query(`
          UPDATE entreprise_patients SET
            nom = ?, prenom = ?, cin = COALESCE(?, cin), matricule = COALESCE(?, matricule),
            date_naissance = COALESCE(?, date_naissance), genre = ?, poste = COALESCE(?, poste),
            departement = COALESCE(?, departement), telephone = COALESCE(?, telephone),
            email = COALESCE(?, email), statut_visite = ?, type_visite = COALESCE(?, type_visite),
            resultat_visite = ?, duree_temporaire = COALESCE(?, duree_temporaire),
            date_revoir = COALESCE(?, date_revoir), date_derniere_visite = COALESCE(?, date_derniere_visite),
            medecin_nom = COALESCE(?, medecin_nom), notes = COALESCE(?, notes)
          WHERE id = ? AND entreprise_id = ?
        `, [
          nom, prenom, cin, matricule, date_naissance, genre, poste, departement, telephone, email,
          statut_visite, type_visite, resultat_visite, duree_temporaire, date_revoir, date_derniere_visite, medecin_nom, notes, existingId, req.params.id
        ]);
        updated++;
      } else if (!existingId) {
        const [insertRes] = await db.query(`
          INSERT INTO entreprise_patients (
            entreprise_id, nom, prenom, cin, matricule, date_naissance, genre, poste, departement, telephone, email,
            statut_visite, type_visite, resultat_visite, duree_temporaire, date_revoir, date_derniere_visite, medecin_nom, notes,
            created_by, created_by_nom, created_by_role
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          req.params.id, nom, prenom, cin, matricule, date_naissance, genre, poste, departement, telephone, email,
          statut_visite, type_visite, resultat_visite, duree_temporaire, date_revoir, date_derniere_visite, medecin_nom, notes,
          creatorId, creatorNom, creatorRole
        ]);
        if (cin) byCin.set(cin.toLowerCase(), insertRes.insertId);
        byName.set(keyName, insertRes.insertId);
        inserted++;
      }
    }

    // Mettre à jour l'effectif total et les visites faites
    const [counts] = await db.query(`
      SELECT 
        COUNT(*) AS total,
        COUNT(CASE WHEN resultat_visite IN ('apte', 'apte_temporaire', 'apte_avec_amenagement', 'inapte_temporaire', 'inapte', 'visite_effectuee') THEN 1 END) AS visites_faites
      FROM entreprise_patients WHERE entreprise_id = ?
    `, [req.params.id]);

    await db.query(`
      UPDATE entreprises 
      SET effectif_total = ?, nb_visites_faites = ?
      WHERE id = ?
    `, [counts[0]?.total || 0, counts[0]?.visites_faites || 0, req.params.id]);

    const io = req.app.get('io');
    if (io) {
      io.emit('entreprises_refresh');
      io.emit('patients_refresh', { entreprise_id: req.params.id });
    }

    invalidateEntreprisesCache();

    res.json({
      message: `Import terminé : ${inserted} patient(s) ajouté(s), ${updated} mis à jour.`,
      inserted,
      updated,
      total: inserted + updated,
    });
  } catch (err) {
    console.error('Error importing patients:', err);
    res.status(500).json({ message: 'Erreur lors de l\'import des patients' });
  }
});

// ═══════════════════════════════════════════════════════════════
// DOCUMENTS & IMAGES DES SALARIÉS / PATIENTS (SÉCURISÉ)
// ═══════════════════════════════════════════════════════════════

// GET /api/entreprises/:id/patients/:patientId/documents
router.get(
  '/:id/patients/:patientId/documents',
  authenticate,
  authorizeDocumentAction('list'),
  async (req, res) => {
    try {
      // 1. Protection IDOR : Vérification entreprise et patient
      const [patient] = await db.query(
        'SELECT id FROM entreprise_patients WHERE id = ? AND entreprise_id = ?',
        [req.params.patientId, req.params.id]
      );
      if (!patient[0]) {
        return res.status(404).json({ message: 'Salarié / patient introuvable pour cette entreprise' });
      }

      // 2. Filtrage côté serveur par rôle :
      // Le rôle HSE ne doit voir que les Rapports HSE, aucun document médical n'est renvoyé
      let sql = `
        SELECT id, patient_id, entreprise_id, nom_original, url, type_mime, taille, categorie, description, created_at
        FROM entreprise_patient_documents 
        WHERE patient_id = ? AND entreprise_id = ?
      `;
      const params = [req.params.patientId, req.params.id];

      if (req.user.role === 'hse') {
        sql += " AND LOWER(categorie) IN ('rapport_hse', 'hse', 'etude_poste', 'visite_lieux')";
      }

      sql += ' ORDER BY created_at DESC';

      const [rows] = await db.query(sql, params);

      // 3. Masquage des chemins internes et génération d'URL signées temporaires (5 minutes)
      const sanitized = (rows || []).map((doc) => ({
        ...doc,
        url: generateSignedDocumentUrl(doc, req.user, req),
      }));

      res.json(sanitized);
    } catch (err) {
      console.error('Error fetching patient documents:', err);
      res.status(500).json({ message: 'Erreur lors de la récupération des documents' });
    }
  }
);

// POST /api/entreprises/:id/patients/:patientId/documents (Upload sécurisé)
router.post(
  '/:id/patients/:patientId/documents',
  authenticate,
  authorizeDocumentAction('upload'),
  (req, res, next) => {
    uploadPatientDoc.array('files', 10)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || 'Fichier non conforme ou trop volumineux' });
      }
      next();
    });
  },
  async (req, res) => {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'Aucun fichier fourni' });
    }

    const categorie = req.body.categorie || 'autre';
    const description = req.body.description ? String(req.body.description).trim() : null;

    // Contrôle strict de catégorie pour HSE :
    if (req.user.role === 'hse' && !isHseCategory(categorie)) {
      return res.status(403).json({
        message: 'Accès refusé : Le rôle HSE ne peut téléverser que des rapports HSE.',
      });
    }

    try {
      // Protection IDOR : Vérification que le patient appartient bien à l'entreprise
      const [patient] = await db.query(
        'SELECT id FROM entreprise_patients WHERE id = ? AND entreprise_id = ?',
        [req.params.patientId, req.params.id]
      );
      if (!patient[0]) {
        return res.status(404).json({ message: 'Salarié / patient introuvable pour cette entreprise' });
      }

      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
      const insertedDocs = [];

      for (const file of files) {
        // Enregistrement en base
        const [result] = await db.query(`
          INSERT INTO entreprise_patient_documents (
            patient_id, entreprise_id, nom_fichier, nom_original, url, type_mime, taille, categorie, description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          req.params.patientId,
          req.params.id,
          file.filename,
          file.originalname,
          '', // Pas d'URL publique directe stockée
          file.mimetype,
          file.size,
          categorie,
          description,
        ]);

        const docObj = {
          id: result.insertId,
          patient_id: req.params.patientId,
          entreprise_id: req.params.id,
          nom_original: file.originalname,
          type_mime: file.mimetype,
          taille: file.size,
          categorie,
          description,
          created_at: new Date(),
        };

        // URL signée temporaire (5 minutes)
        docObj.url = generateSignedDocumentUrl(docObj, req.user, req);

        // Journal d'audit : enregistrement de l'action 'upload'
        await logDocumentAudit({
          userId: req.user.id,
          userEmail: req.user.email,
          userRole: req.user.role,
          action: 'upload',
          documentId: result.insertId,
          documentName: file.originalname,
          documentCategory: categorie,
          patientId: req.params.patientId,
          entrepriseId: req.params.id,
          ip: clientIp,
          userAgent: req.headers['user-agent'],
        });

        insertedDocs.push(docObj);
      }

      res.status(201).json({
        message: `${files.length} document(s) importé(s) avec succès`,
        documents: insertedDocs,
      });
    } catch (err) {
      console.error('Error uploading patient documents:', err);
      res.status(500).json({ message: 'Erreur lors de l\'enregistrement des fichiers' });
    }
  }
);

// GET /api/entreprises/:id/patients/:patientId/documents/:docId/view — Consultation / Prévisualisation sécurisée
router.get(
  '/:id/patients/:patientId/documents/:docId/view',
  authenticate,
  authorizeDocumentAction('view'),
  async (req, res) => {
    try {
      // 1. Protection IDOR
      const [rows] = await db.query(
        'SELECT * FROM entreprise_patient_documents WHERE id = ? AND patient_id = ? AND entreprise_id = ?',
        [req.params.docId, req.params.patientId, req.params.id]
      );
      const doc = rows[0];
      if (!doc) {
        return res.status(404).json({ message: 'Document introuvable pour ce patient' });
      }

      // 2. Contrôle d'autorisation par catégorie
      if (!canUserAccessCategory(req.user.role, doc.categorie)) {
        return res.status(403).json({
          message: 'Accès refusé : Votre rôle n\'est pas autorisé à consulter ce document.',
        });
      }

      // 3. Fichier physique sécurisé anti directory-traversal
      const filename = doc?.nom_fichier || doc?.nom_original || '';
      if (!filename) {
        return res.status(404).json({ message: 'Fichier physique introuvable' });
      }
      const safeBasename = path.basename(filename);
      const filePath = path.join(PATIENTS_UPLOADS_DIR, safeBasename);
      const resolved = path.resolve(filePath);

      if (!resolved.startsWith(path.resolve(PATIENTS_UPLOADS_DIR)) || !fs.existsSync(resolved)) {
        return res.status(404).json({ message: 'Fichier physique introuvable' });
      }

      // 4. Journal d'audit : action 'consultation'
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
      await logDocumentAudit({
        userId: req.user.id,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'consultation',
        documentId: doc.id,
        documentName: doc.nom_original,
        documentCategory: doc.categorie,
        patientId: doc.patient_id,
        entrepriseId: doc.entreprise_id,
        ip: clientIp,
        userAgent: req.headers['user-agent'],
      });

      res.setHeader('Content-Type', doc.type_mime || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.nom_original)}"`);
      return res.sendFile(resolved);
    } catch (err) {
      console.error('Error viewing patient document:', err);
      res.status(500).json({ message: 'Erreur lors de la consultation du document' });
    }
  }
);

// GET /api/entreprises/:id/patients/:patientId/documents/:docId/download — Téléchargement sécurisé
router.get(
  '/:id/patients/:patientId/documents/:docId/download',
  authenticate,
  authorizeDocumentAction('download'),
  async (req, res) => {
    try {
      // 1. Protection IDOR
      const [rows] = await db.query(
        'SELECT * FROM entreprise_patient_documents WHERE id = ? AND patient_id = ? AND entreprise_id = ?',
        [req.params.docId, req.params.patientId, req.params.id]
      );
      const doc = rows[0];
      if (!doc) {
        return res.status(404).json({ message: 'Document introuvable pour ce patient' });
      }

      // 2. Contrôle d'autorisation par catégorie
      if (!canUserAccessCategory(req.user.role, doc.categorie)) {
        return res.status(403).json({
          message: 'Accès refusé : Votre rôle n\'est pas autorisé à télécharger ce document.',
        });
      }

      // 3. Fichier physique sécurisé anti directory-traversal
      const filename = doc?.nom_fichier || doc?.nom_original || '';
      if (!filename) {
        return res.status(404).json({ message: 'Fichier physique introuvable' });
      }
      const safeBasename = path.basename(filename);
      const filePath = path.join(PATIENTS_UPLOADS_DIR, safeBasename);
      const resolved = path.resolve(filePath);

      if (!resolved.startsWith(path.resolve(PATIENTS_UPLOADS_DIR)) || !fs.existsSync(resolved)) {
        return res.status(404).json({ message: 'Fichier physique introuvable' });
      }

      // 4. Journal d'audit : action 'telechargement'
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
      await logDocumentAudit({
        userId: req.user.id,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'telechargement',
        documentId: doc.id,
        documentName: doc.nom_original,
        documentCategory: doc.categorie,
        patientId: doc.patient_id,
        entrepriseId: doc.entreprise_id,
        ip: clientIp,
        userAgent: req.headers['user-agent'],
      });

      res.setHeader('Content-Type', doc.type_mime || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.nom_original)}"`);
      return res.sendFile(resolved);
    } catch (err) {
      console.error('Error downloading patient document:', err);
      res.status(500).json({ message: 'Erreur lors du téléchargement du document' });
    }
  }
);

// DELETE /api/entreprises/:id/patients/:patientId/documents/:docId (Suppression sécurisée)
router.delete(
  '/:id/patients/:patientId/documents/:docId',
  authenticate,
  authorizeDocumentAction('delete'),
  async (req, res) => {
    try {
      // 1. Protection IDOR : vérification id, patient_id et entreprise_id
      const [rows] = await db.query(
        'SELECT * FROM entreprise_patient_documents WHERE id = ? AND patient_id = ? AND entreprise_id = ?',
        [req.params.docId, req.params.patientId, req.params.id]
      );
      const doc = rows[0];
      if (!doc) return res.status(404).json({ message: 'Document introuvable' });

      // 2. Contrôle d'autorisation par catégorie pour la suppression
      if (!canUserAccessCategory(req.user.role, doc.categorie)) {
        return res.status(403).json({
          message: 'Accès refusé : Vous n\'êtes pas autorisé à supprimer ce document.',
        });
      }

      // 3. Sécurité anti directory-traversal et suppression physique
      const filename = doc?.nom_fichier || doc?.nom_original || '';
      if (filename) {
        const safeBasename = path.basename(filename);
        const filePath = path.join(PATIENTS_UPLOADS_DIR, safeBasename);
        const resolved = path.resolve(filePath);
        if (resolved.startsWith(path.resolve(PATIENTS_UPLOADS_DIR)) && fs.existsSync(resolved)) {
          try { fs.unlinkSync(resolved); } catch (e) {}
        }
      }

      // 4. Suppression en base
      await db.query('DELETE FROM entreprise_patient_documents WHERE id = ?', [req.params.docId]);

      // 5. Journal d'audit : action 'suppression'
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
      await logDocumentAudit({
        userId: req.user.id,
        userEmail: req.user.email,
        userRole: req.user.role,
        action: 'suppression',
        documentId: doc.id,
        documentName: doc.nom_original,
        documentCategory: doc.categorie,
        patientId: doc.patient_id,
        entrepriseId: doc.entreprise_id,
        ip: clientIp,
        userAgent: req.headers['user-agent'],
      });

      res.json({ message: 'Document supprimé avec succès' });
    } catch (err) {
      console.error('Error deleting patient document:', err);
      res.status(500).json({ message: 'Erreur lors de la suppression du document' });
    }
  }
);

module.exports = router;
