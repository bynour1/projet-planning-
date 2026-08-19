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
    if (io) io.emit('planning_refresh');

    // Email + SMS notification (async, don't await)
    notifyAllUsers({
      subject:   `📋 Nouvelle intervention — ${date}`,
      html:      planningEmailHtml({ titre, date: fmt(date), heure_debut, heure_fin, adresse, medecin_nom, technicien_nom, createdBy: `${req.user.prenom} ${req.user.nom}` }),
      smsText:   planningSmsText({ titre, date: fmt(date), heure_debut, heure_fin, adresse }),
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
