const router = require('express').Router();
const db     = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { notifyAllUsers, planningEmailHtml, planningSmsText } = require('../config/mailer');

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
        CONCAT(t.prenom,' ',t.nom) AS technicien_nom
      FROM planning_events pe
      LEFT JOIN users m ON m.id = pe.medecin_id
      LEFT JOIN users t ON t.id = pe.technicien_id
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
        CONCAT(t.prenom,' ',t.nom) AS technicien_nom
      FROM planning_events pe
      LEFT JOIN users m ON m.id = pe.medecin_id
      LEFT JOIN users t ON t.id = pe.technicien_id
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
        CONCAT(t.prenom,' ',t.nom) AS technicien_nom
      FROM planning_events pe
      LEFT JOIN users m ON m.id = pe.medecin_id
      LEFT JOIN users t ON t.id = pe.technicien_id
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
  const { titre, date, heure_debut, heure_fin, adresse, medecin_id, technicien_id, programme } = req.body;
  if (!date) return res.status(400).json({ message: 'Date requise' });

  try {
    // Get names for email
    const [medecinRows] = await db.query("SELECT CONCAT(prenom,' ',nom) n FROM users WHERE id=?", [medecin_id || null]);
    const [technicienRows] = await db.query("SELECT CONCAT(prenom,' ',nom) n FROM users WHERE id=?", [technicien_id || null]);
    const medecin_nom = medecinRows[0]?.n || null;
    const technicien_nom = technicienRows[0]?.n || null;

    const [result] = await db.query(
      'INSERT INTO planning_events (titre,date,heure_debut,heure_fin,adresse,medecin_id,technicien_id,commentaire) VALUES (?,?,?,?,?,?,?,?)',
      [titre||null, date, heure_debut||null, heure_fin||null, adresse||null, medecin_id||null, technicien_id||null, programme||null]
    );

    // Emit socket
    const io = req.app.get('io');
    if (io) {
      io.emit('planning_new', {
        id: result.insertId,
        titre: titre || 'Nouvelle intervention',
        date: fmtRaw(date),
        heure_debut,
        heure_fin,
        adresse,
        medecin_nom,
        technicien_nom,
        createdBy: `${req.user.prenom} ${req.user.nom}`,
        creatorId: req.user.id,
      });
      io.emit('planning_refresh');
    }

    // Email + SMS notification (async, don't await)
    notifyAllUsers({
      subject:   `📋 Nouvelle intervention — ${date}`,
      html:      planningEmailHtml ? planningEmailHtml({ titre, date: fmt(date), heure_debut, heure_fin, adresse, medecin_nom, technicien_nom, createdBy: `${req.user.prenom} ${req.user.nom}` }) : '',
      smsText:   (typeof planningSmsText === 'function') ? planningSmsText({ titre, date: fmt(date), heure_debut, heure_fin, adresse }) : null,
      excludeId: req.user.id,
    });

    res.status(201).json({ message: 'Intervention créée', id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/planning/:id  (Admin only)
router.put('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  const { titre, date, heure_debut, heure_fin, adresse, medecin_id, technicien_id, programme } = req.body;
  try {
    await db.query(
      'UPDATE planning_events SET titre=?,date=?,heure_debut=?,heure_fin=?,adresse=?,medecin_id=?,technicien_id=?,commentaire=? WHERE id=?',
      [titre||null, date, heure_debut||null, heure_fin||null, adresse||null, medecin_id||null, technicien_id||null, programme||null, req.params.id]
    );
    const io = req.app.get('io');
    if (io) io.emit('planning_refresh');
    res.json({ message: 'Intervention mise à jour' });
  } catch (err) {
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
        CONCAT(t.prenom, ' ', t.nom) AS technicien_nom
      FROM clino_mobile cm
      LEFT JOIN users u ON u.id = cm.medecin_id
      LEFT JOIN users t ON t.id = cm.technicien_id
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
    await db.query('DELETE FROM planning_events WHERE id = ?', [req.params.id]);
    const io = req.app.get('io');
    if (io) io.emit('planning_refresh');
    res.json({ message: 'Événement supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;

