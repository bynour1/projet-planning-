const router = require('express').Router();
const db     = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════
// ENTREPRISES
// ═══════════════════════════════════════════════════════════════

// GET /api/entreprises
router.get('/', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'administrateur';
    const [rows] = await db.query(`
      SELECT e.*,
        COUNT(DISTINCT r.id)          AS nb_avis,
        ROUND(AVG(r.note), 1)         AS note_moyenne
      FROM entreprises e
      LEFT JOIN entreprise_avis r ON r.entreprise_id = e.id
      GROUP BY e.id
      ORDER BY e.nom ASC
    `);

    // Mask code if not administrator
    const result = rows.map(r => {
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

    const entData = { ...rows[0] };
    if (!isAdmin) {
      delete entData.code;
    }

    res.json({ ...entData, avis, campagnes });
  } catch (err) {
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
    res.json({ message: 'Entreprise supprimée' });
  } catch (err) {
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
    res.json({ message: 'Avis supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
