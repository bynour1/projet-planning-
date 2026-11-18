const router = require('express').Router();
const db     = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { notifyAllUsers, notifyAssignedIntervenants, planningEmailHtml, planningSmsText } = require('../config/mailer');

// Helper: format date YYYY-MM-DD → DD/MM/YYYY
function fmt(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (isNaN(d)) return String(dateVal).slice(0, 10);
  const day   = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year  = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function fmtRaw(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (isNaN(d)) return String(dateVal).slice(0, 10);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

function normaliseRows(rows) {
  return rows.map(r => ({
    ...r,
    date:        fmtRaw(r.date),       // raw YYYY-MM-DD for grid logic
    date_fmt:    fmt(r.date),          // DD/MM/YYYY for display
    heure_debut: r.heure_debut ? String(r.heure_debut).slice(0, 5) : null,
    heure_fin:   r.heure_fin   ? String(r.heure_fin).slice(0, 5)   : null,
  }));
}

// GET /api/planning?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/', authenticate, async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = `
      SELECT pe.*,
        CONCAT(m.prenom,' ',m.nom) AS medecin_nom,
        m.telephone AS medecin_tel,
        CONCAT(t.prenom,' ',t.nom) AS technicien_nom,
        t.telephone AS technicien_tel,
        ent.nom AS entreprise_nom,
        ent.telephone AS entreprise_tel
      FROM planning_events pe
      LEFT JOIN users m ON m.id = pe.medecin_id
      LEFT JOIN users t ON t.id = pe.technicien_id
      LEFT JOIN entreprises ent ON ent.id = pe.entreprise_id
    `;
    const params = [];
    if (start && end) {
      query += ' WHERE pe.date BETWEEN ? AND ?';
      params.push(start, end);
    }
    query += ' ORDER BY pe.date, pe.heure_debut';
    const [rows] = await db.query(query, params);
    res.json(normaliseRows(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/planning/today  — programme du jour
router.get('/today', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await db.query(`
      SELECT pe.*,
        CONCAT(m.prenom,' ',m.nom) AS medecin_nom,
        m.telephone AS medecin_tel,
        CONCAT(t.prenom,' ',t.nom) AS technicien_nom,
        t.telephone AS technicien_tel,
        ent.nom AS entreprise_nom,
        ent.telephone AS entreprise_tel
      FROM planning_events pe
      LEFT JOIN users m ON m.id = pe.medecin_id
      LEFT JOIN users t ON t.id = pe.technicien_id
      LEFT JOIN entreprises ent ON ent.id = pe.entreprise_id
      WHERE pe.date = ?
      ORDER BY pe.heure_debut
    `, [today]);
    res.json(normaliseRows(rows));
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/planning/mine
router.get('/mine', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.query(`
      SELECT pe.*,
        CONCAT(m.prenom,' ',m.nom) AS medecin_nom,
        m.telephone AS medecin_tel,
        CONCAT(t.prenom,' ',t.nom) AS technicien_nom,
        t.telephone AS technicien_tel,
        ent.nom AS entreprise_nom,
        ent.telephone AS entreprise_tel
      FROM planning_events pe
      LEFT JOIN users m ON m.id = pe.medecin_id
      LEFT JOIN users t ON t.id = pe.technicien_id
      LEFT JOIN entreprises ent ON ent.id = pe.entreprise_id
      WHERE pe.medecin_id = ? OR pe.technicien_id = ?
      ORDER BY pe.date DESC, pe.heure_debut
    `, [userId, userId]);
    res.json(normaliseRows(rows));
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/planning  (Admin only) + email notification
router.post('/', authenticate, authorize('administrateur'), async (req, res) => {
  const { titre, date, heure_debut, heure_fin, adresse, medecin_id, technicien_id, programme, is_clino, nb_examines, entreprise_id, type } = req.body;
  if (!date) return res.status(400).json({ message: 'Date requise' });

  try {
    // Get names for email
    const [medecinRows] = await db.query("SELECT CONCAT(prenom,' ',nom) n FROM users WHERE id=?", [medecin_id || null]);
    const [technicienRows] = await db.query("SELECT CONCAT(prenom,' ',nom) n FROM users WHERE id=?", [technicien_id || null]);
    const medecin_nom = medecinRows[0]?.n || null;
    const technicien_nom = technicienRows[0]?.n || null;

    const clinoFlag = (is_clino === true || is_clino === 1 || is_clino === '1') ? 1 : 0;
    let clino_id = null;

    // Auto-detect entreprise_id if not given
    let entId = entreprise_id || null;
    if (!entId && titre && type !== 'evenement') {
      const [eMatch] = await db.query(
        'SELECT id FROM entreprises WHERE LOWER(TRIM(nom)) = LOWER(TRIM(?)) OR LOWER(TRIM(?)) LIKE CONCAT(\'%\', LOWER(TRIM(nom)), \'%\') LIMIT 1',
        [titre, titre]
      );
      if (eMatch.length) entId = eMatch[0].id;
    }
    const nbExam = nb_examines !== undefined ? parseInt(nb_examines, 10) || 0 : 0;
    const pType = type || 'visite';

    const [result] = await db.query(
      'INSERT INTO planning_events (titre,date,heure_debut,heure_fin,adresse,medecin_id,technicien_id,commentaire,is_clino,clino_id,nb_examines,entreprise_id,type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [titre||null, date, heure_debut||null, heure_fin||null, adresse||null, medecin_id||null, technicien_id||null, programme||null, clinoFlag, null, nbExam, entId, pType]
    );
    const planningId = result.insertId;

    if (clinoFlag) {
      const clinoHeure = (heure_debut && heure_debut.trim()) ? heure_debut : null;
      const clinoAdresse = (adresse && adresse.trim()) ? adresse : (titre || 'Visite sur site');
      const clinoComment = titre ? `[Planning] ${titre}` : 'Visite Clino';
      const [cRes] = await db.query(
        'INSERT INTO clino_mobile (date,heure,adresse,medecin_id,technicien_id,medecin_nom,technicien_nom,commentaire,planning_id,nb_examines,entreprise_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [date, clinoHeure, clinoAdresse, medecin_id||null, technicien_id||null, medecin_nom, technicien_nom, clinoComment, planningId, nbExam, entId]
      );
      clino_id = cRes.insertId;
      await db.query('UPDATE planning_events SET clino_id = ? WHERE id = ?', [clino_id, planningId]);
    }

    // Emit socket
    const io = req.app.get('io');
    if (io) {
      io.emit('planning_new', {
        id: planningId,
        titre: titre || 'Nouvelle intervention',
        date: fmtRaw(date),
        heure_debut,
        heure_fin,
        adresse,
        medecin_nom,
        technicien_nom,
        is_clino: clinoFlag,
        clino_id,
        nb_examines: nbExam,
        entreprise_id: entId,
        createdBy: `${req.user.prenom} ${req.user.nom}`,
        creatorId: req.user.id,
      });
      io.emit('planning_refresh');
      if (clinoFlag) io.emit('clino_refresh');
    }

    // Email + SMS notification aux intervenants assignés (Médecin + Technicien)
    notifyAssignedIntervenants({
      medecin_id,
      technicien_id,
      subject:   `📋 Nouvelle intervention — ${date}${clinoFlag ? ' (🚗 Clino Mobile)' : ''}`,
      html:      planningEmailHtml ? planningEmailHtml({ titre, date: fmt(date), heure_debut, heure_fin, adresse, medecin_nom, technicien_nom, createdBy: `${req.user.prenom} ${req.user.nom}` }) : '',
      smsText:   (typeof planningSmsText === 'function') ? planningSmsText({ titre, date: fmt(date), heure_debut, heure_fin, adresse }) : null,
    });

    // Web Push notification aux intervenants assignés (sans nom de patient ni donnée médicale)
    try {
      const pushService = require('../services/pushService');
      const targetUserIds = [medecin_id, technicien_id].filter(id => id && Number(id) !== Number(req.user.id));
      if (targetUserIds.length) {
        pushService.sendPushToMultipleUsers(targetUserIds, {
          title: 'Nouveau planning',
          body: 'Une intervention a été ajoutée à votre planning.',
          data: { url: '/planning' },
        }).catch(() => {});
      }
    } catch {}

    res.status(201).json({ message: 'Intervention créée', id: planningId, clino_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/planning/:id  (Admin ou Médecin assigné)
router.put('/:id', authenticate, async (req, res) => {
  const { titre, date, heure_debut, heure_fin, adresse, medecin_id, technicien_id, programme, is_clino, nb_examines, entreprise_id, type } = req.body;
  try {
    const planningId = req.params.id;
    const [existing] = await db.query('SELECT * FROM planning_events WHERE id = ?', [planningId]);
    if (!existing.length) return res.status(404).json({ message: 'Intervention introuvable' });

    // Seul l'admin ou le médecin assigné à l'intervention peut modifier
    const isDoc = (req.user.role === 'medecin' && existing[0].medecin_id === req.user.id);
    if (req.user.role !== 'administrateur' && !isDoc) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const targetMedecinId = medecin_id !== undefined ? (medecin_id || null) : existing[0].medecin_id;
    const targetTechnicienId = technicien_id !== undefined ? (technicien_id || null) : existing[0].technicien_id;

    const [medecinRows] = await db.query("SELECT CONCAT(prenom,' ',nom) n FROM users WHERE id=?", [targetMedecinId]);
    const [technicienRows] = await db.query("SELECT CONCAT(prenom,' ',nom) n FROM users WHERE id=?", [targetTechnicienId]);
    const medecin_nom = medecinRows[0]?.n || null;
    const technicien_nom = technicienRows[0]?.n || null;

    const clinoFlag = is_clino !== undefined ? ((is_clino === true || is_clino === 1 || is_clino === '1') ? 1 : 0) : existing[0].is_clino;
    let clino_id = existing[0].clino_id;

    let entId = entreprise_id !== undefined ? (entreprise_id || null) : existing[0].entreprise_id;
    const effectiveTitre = titre !== undefined ? titre : existing[0].titre;
    const targetType = type !== undefined ? type : (existing[0].type || 'visite');
    if (!entId && effectiveTitre && targetType !== 'evenement') {
      const [eMatch] = await db.query(
        'SELECT id FROM entreprises WHERE LOWER(TRIM(nom)) = LOWER(TRIM(?)) OR LOWER(TRIM(?)) LIKE CONCAT(\'%\', LOWER(TRIM(nom)), \'%\') LIMIT 1',
        [effectiveTitre, effectiveTitre]
      );
      if (eMatch.length) entId = eMatch[0].id;
    }
    const nbExam = nb_examines !== undefined ? (parseInt(nb_examines, 10) || 0) : (existing[0].nb_examines || 0);

    const targetDate = date || existing[0].date;
    const targetHeureDebut = heure_debut !== undefined ? (heure_debut || null) : existing[0].heure_debut;
    const targetHeureFin = heure_fin !== undefined ? (heure_fin || null) : existing[0].heure_fin;
    const targetAdresse = adresse !== undefined ? (adresse || null) : existing[0].adresse;
    const targetCommentaire = programme !== undefined ? (programme || null) : existing[0].commentaire;

    if (clinoFlag) {
      const clinoHeure = (targetHeureDebut && targetHeureDebut.trim()) ? targetHeureDebut : null;
      const clinoAdresse = (targetAdresse && targetAdresse.trim()) ? targetAdresse : (effectiveTitre || 'Visite sur site');
      const clinoComment = effectiveTitre ? `[Planning] ${effectiveTitre}` : 'Visite Clino';

      if (clino_id) {
        await db.query(
          'UPDATE clino_mobile SET date=?,heure=?,adresse=?,medecin_id=?,technicien_id=?,medecin_nom=?,technicien_nom=?,commentaire=?,planning_id=?,nb_examines=?,entreprise_id=? WHERE id=?',
          [targetDate, clinoHeure, clinoAdresse, targetMedecinId, targetTechnicienId, medecin_nom, technicien_nom, clinoComment, planningId, nbExam, entId, clino_id]
        );
      } else {
        const [cRes] = await db.query(
          'INSERT INTO clino_mobile (date,heure,adresse,medecin_id,technicien_id,medecin_nom,technicien_nom,commentaire,planning_id,nb_examines,entreprise_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [targetDate, clinoHeure, clinoAdresse, targetMedecinId, targetTechnicienId, medecin_nom, technicien_nom, clinoComment, planningId, nbExam, entId]
        );
        clino_id = cRes.insertId;
      }
    } else {
      if (clino_id) {
        await db.query('DELETE FROM clino_mobile WHERE id = ?', [clino_id]);
        clino_id = null;
      }
    }

    await db.query(
      'UPDATE planning_events SET titre=?,date=?,heure_debut=?,heure_fin=?,adresse=?,medecin_id=?,technicien_id=?,commentaire=?,is_clino=?,clino_id=?,nb_examines=?,entreprise_id=?,type=? WHERE id=?',
      [effectiveTitre||null, targetDate, targetHeureDebut, targetHeureFin, targetAdresse, targetMedecinId, targetTechnicienId, targetCommentaire, clinoFlag, clino_id, nbExam, entId, targetType, planningId]
    );

    const io = req.app.get('io');
    if (io) {
      io.emit('planning_refresh');
      io.emit('clino_refresh');
    }

    // Web Push notification aux intervenants assignés (sans nom de patient ni donnée médicale)
    try {
      const pushService = require('../services/pushService');
      const targetUserIds = [targetMedecinId, targetTechnicienId].filter(id => id && Number(id) !== Number(req.user.id));
      if (targetUserIds.length) {
        pushService.sendPushToMultipleUsers(targetUserIds, {
          title: 'Planning modifié',
          body: 'Votre planning a été modifié.',
          data: { url: '/planning' },
        }).catch(() => {});
      }
    } catch {}

    res.json({ message: 'Intervention mise à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PATCH /api/planning/:id/valider  (Validation du planning par Admin ou Médecin)
router.patch('/:id/valider', authenticate, async (req, res) => {
  try {
    const planningId = req.params.id;
    const [existing] = await db.query('SELECT * FROM planning_events WHERE id = ?', [planningId]);
    if (!existing.length) return res.status(404).json({ message: 'Intervention introuvable' });

    const isDoc = (req.user.role === 'medecin' && existing[0].medecin_id === req.user.id);
    if (req.user.role !== 'administrateur' && !isDoc) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    await db.query("UPDATE planning_events SET statut = 'valide' WHERE id = ?", [planningId]);

    const io = req.app.get('io');
    if (io) io.emit('planning_refresh');

    // Web Push notification de validation (sans nom de patient ni donnée médicale)
    try {
      const pushService = require('../services/pushService');
      const targetUserIds = [existing[0].medecin_id, existing[0].technicien_id].filter(id => id && Number(id) !== Number(req.user.id));
      if (targetUserIds.length) {
        pushService.sendPushToMultipleUsers(targetUserIds, {
          title: 'Planning validé',
          body: 'Votre planning a été validé.',
          data: { url: '/planning' },
        }).catch(() => {});
      }
    } catch {}

    res.json({ message: 'Planning validé avec succès' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PATCH /api/planning/:id/effectif  (Enregistrement rapide de l'effectif examiné)
router.patch('/:id/effectif', authenticate, async (req, res) => {
  const { nb_examines, commentaire } = req.body;
  try {
    const planningId = req.params.id;
    const [existing] = await db.query('SELECT * FROM planning_events WHERE id = ?', [planningId]);
    if (!existing.length) return res.status(404).json({ message: 'Intervention introuvable' });

    if (req.user.role === 'hse') {
      return res.status(403).json({ message: 'Action non autorisée : la modification des effectifs de patients examinés est réservée au personnel médical.' });
    }
    const isDoc = (req.user.role === 'medecin' && existing[0].medecin_id === req.user.id);
    if (req.user.role !== 'administrateur' && !isDoc) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const nbExam = nb_examines !== undefined ? (parseInt(nb_examines, 10) || 0) : existing[0].nb_examines;
    const notes = commentaire !== undefined ? commentaire : existing[0].commentaire;

    await db.query('UPDATE planning_events SET nb_examines = ?, commentaire = ? WHERE id = ?', [
      nbExam,
      notes,
      planningId,
    ]);

    if (existing[0].clino_id) {
      await db.query('UPDATE clino_mobile SET nb_examines = ? WHERE id = ?', [nbExam, existing[0].clino_id]);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('planning_refresh');
      io.emit('clino_refresh');
    }
    res.json({ message: 'Effectifs enregistrés avec succès', nb_examines: nbExam });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/planning/feed.ics — Flux iCalendar pour abonnement externe (Google Agenda, Apple Calendar, Outlook)
router.get('/feed.ics', async (req, res) => {
  try {
    const { user_id, medecin_id, technicien_id } = req.query;
    let query = `
      SELECT pe.*,
        CONCAT(m.prenom,' ',m.nom) AS medecin_nom,
        CONCAT(t.prenom,' ',t.nom) AS technicien_nom
      FROM planning_events pe
      LEFT JOIN users m ON m.id = pe.medecin_id
      LEFT JOIN users t ON t.id = pe.technicien_id
      WHERE pe.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `;
    const params = [];
    if (user_id) {
      query += ' AND (pe.medecin_id = ? OR pe.technicien_id = ?)';
      params.push(user_id, user_id);
    } else {
      if (medecin_id) {
        query += ' AND pe.medecin_id = ?';
        params.push(medecin_id);
      }
      if (technicien_id) {
        query += ' AND pe.technicien_id = ?';
        params.push(technicien_id);
      }
    }
    query += ' ORDER BY pe.date, pe.heure_debut';

    const [rows] = await db.query(query, params);

    // Also fetch Clino Mobile events
    let clinoQuery = `
      SELECT cm.*,
        CONCAT(u.prenom, ' ', u.nom) AS medecin_nom,
        CONCAT(t.prenom, ' ', t.nom) AS technicien_nom,
        pe.titre AS planning_titre,
        pe.titre AS entreprise_nom
      FROM clino_mobile cm
      LEFT JOIN users u ON u.id = cm.medecin_id
      LEFT JOIN users t ON t.id = cm.technicien_id
      LEFT JOIN planning_events pe ON pe.id = cm.planning_id
      WHERE cm.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `;
    const clinoParams = [];
    if (user_id) {
      clinoQuery += ' AND (cm.medecin_id = ? OR cm.technicien_id = ?)';
      clinoParams.push(user_id, user_id);
    } else {
      if (medecin_id) {
        clinoQuery += ' AND cm.medecin_id = ?';
        clinoParams.push(medecin_id);
      }
      if (technicien_id) {
        clinoQuery += ' AND cm.technicien_id = ?';
        clinoParams.push(technicien_id);
      }
    }
    clinoQuery += ' ORDER BY cm.date, cm.heure';
    const [clinoRows] = await db.query(clinoQuery, clinoParams);

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//GMT Ariana//Planning Medical//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:GMT Ariana Planning',
      'X-WR-TIMEZONE:Africa/Tunis',
    ];

    const nowStr = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

    rows.forEach((ev) => {
      const dStr = fmtRaw(ev.date);
      if (!dStr) return;
      const cleanDate = dStr.replace(/-/g, '');
      const start = ev.heure_debut ? `${cleanDate}T${String(ev.heure_debut).replace(':', '').slice(0, 4)}00` : cleanDate;
      const end   = ev.heure_fin   ? `${cleanDate}T${String(ev.heure_fin).replace(':', '').slice(0, 4)}00`   : (ev.heure_debut ? `${cleanDate}T${String(ev.heure_debut).replace(':', '').slice(0, 4)}00` : cleanDate);

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:gmt-planning-${ev.id}@gmt-ariana.tn`);
      lines.push(`DTSTAMP:${nowStr}`);
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${end}`);
      lines.push(`SUMMARY:${(ev.titre || 'Intervention GMT').replace(/[\r\n]/g, ' ')}`);
      if (ev.adresse) lines.push(`LOCATION:${ev.adresse.replace(/[\r\n]/g, ' ')}`);
      lines.push(`DESCRIPTION:Medecin: ${ev.medecin_nom || 'Non assigné'} \\nTechnicien: ${ev.technicien_nom || 'Non assigné'}${ev.commentaire ? ' \\nNote: ' + ev.commentaire : ''}`);
      lines.push('STATUS:CONFIRMED');
      lines.push('END:VEVENT');
    });

    clinoRows.forEach((cl) => {
      const dStr = fmtRaw(cl.date);
      if (!dStr) return;
      const cleanDate = dStr.replace(/-/g, '');
      const hStr = cl.heure ? String(cl.heure).replace(':', '').slice(0, 4) : '0800';
      const start = `${cleanDate}T${hStr}00`;
      const end   = `${cleanDate}T${hStr}00`;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:gmt-clino-${cl.id}@gmt-ariana.tn`);
      lines.push(`DTSTAMP:${nowStr}`);
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${end}`);
      lines.push(`SUMMARY:🚗 Clino Mobile - ${(cl.medecin_nom || cl.adresse || 'Tournée').replace(/[\r\n]/g, ' ')}`);
      if (cl.adresse) lines.push(`LOCATION:${cl.adresse.replace(/[\r\n]/g, ' ')}`);
      lines.push(`DESCRIPTION:Type: Clino Mobile \\nMedecin: ${cl.medecin_nom || 'Non assigné'} \\nTechnicien: ${cl.technicien_nom || 'Non assigné'}${cl.commentaire ? ' \\nNote: ' + cl.commentaire : ''}`);
      lines.push('STATUS:CONFIRMED');
      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');

    const icsContent = lines.join('\r\n');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="gmt_planning.ics"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(icsContent);
  } catch (err) {
    console.error('ICS Feed Error:', err);
    res.status(500).send('Erreur génération calendrier');
  }
});

// DELETE /api/planning/:id  (Admin only)
router.delete('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  try {
    const planningId = req.params.id;
    const [existing] = await db.query('SELECT medecin_id, technicien_id, clino_id FROM planning_events WHERE id = ?', [planningId]);
    if (existing.length && existing[0].clino_id) {
      await db.query('DELETE FROM clino_mobile WHERE id = ?', [existing[0].clino_id]);
    }
    // Also delete any clino_mobile pointing to this planning_id
    await db.query('DELETE FROM clino_mobile WHERE planning_id = ?', [planningId]);
    await db.query('DELETE FROM planning_events WHERE id = ?', [planningId]);
    const io = req.app.get('io');
    if (io) {
      io.emit('planning_refresh');
      io.emit('clino_refresh');
    }

    // Web Push notification d'annulation (sans nom de patient ni donnée médicale)
    try {
      if (existing.length) {
        const pushService = require('../services/pushService');
        const targetUserIds = [existing[0].medecin_id, existing[0].technicien_id].filter(id => id && Number(id) !== Number(req.user.id));
        if (targetUserIds.length) {
          pushService.sendPushToMultipleUsers(targetUserIds, {
            title: 'Intervention annulée',
            body: 'Une intervention a été annulée dans votre planning.',
            data: { url: '/planning' },
          }).catch(() => {});
        }
      }
    } catch {}

    res.json({ message: 'Événement supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;

