const router = require('express').Router();
const db     = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

function fmtRaw(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (isNaN(d)) return String(dateVal).slice(0, 10);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

function normaliseClinoRows(rows) {
  return rows.map(r => ({
    ...r,
    date: fmtRaw(r.date),
    heure: r.heure ? String(r.heure).slice(0, 5) : null,
  }));
}

// GET /api/clino
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT cm.*, 
        CONCAT(u.prenom, ' ', u.nom) AS medecin_full,
        CONCAT(t.prenom, ' ', t.nom) AS technicien_full
      FROM clino_mobile cm 
      LEFT JOIN users u ON u.id = cm.medecin_id 
      LEFT JOIN users t ON t.id = cm.technicien_id 
      ORDER BY cm.date DESC, cm.heure DESC
    `);
    res.json(normaliseClinoRows(rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/clino  (Admin only)
router.post('/', authenticate, authorize('administrateur'), async (req, res) => {
  const { date, heure, adresse, medecin_id, technicien_id, commentaire } = req.body;
  if (!date || !heure || !adresse) return res.status(400).json({ message: 'Date, heure et adresse requis' });

  try {
    let medecin_nom = null;
    if (medecin_id) {
      const [rows] = await db.query('SELECT CONCAT(prenom," ",nom) AS fullname FROM users WHERE id=?', [medecin_id]);
      medecin_nom = rows[0]?.fullname || null;
    }

    let technicien_nom = null;
    if (technicien_id) {
      const [rows] = await db.query('SELECT CONCAT(prenom," ",nom) AS fullname FROM users WHERE id=?', [technicien_id]);
      technicien_nom = rows[0]?.fullname || null;
    }

    const [result] = await db.query(
      'INSERT INTO clino_mobile (date,heure,adresse,medecin_id,technicien_id,medecin_nom,technicien_nom,commentaire) VALUES (?,?,?,?,?,?,?,?)',
      [date, heure, adresse, medecin_id||null, technicien_id||null, medecin_nom, technicien_nom, commentaire||null]
    );

    const io = req.app.get('io');
    if (io) {
      io.emit('clino_new', {
        id: result.insertId,
        date: fmtRaw(date),
        heure,
        adresse,
        medecin_nom,
        technicien_nom,
        createdBy: `${req.user.prenom} ${req.user.nom}`,
        creatorId: req.user.id,
      });
      io.emit('clino_refresh');
    }

    res.status(201).json({ message: 'Intervention créée', id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/clino/:id  (Admin only)
router.put('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  const { date, heure, adresse, medecin_id, technicien_id, commentaire } = req.body;
  try {
    let medecin_nom = null;
    if (medecin_id) {
      const [rows] = await db.query('SELECT CONCAT(prenom," ",nom) AS fullname FROM users WHERE id=?', [medecin_id]);
      medecin_nom = rows[0]?.fullname || null;
    }

    let technicien_nom = null;
    if (technicien_id) {
      const [rows] = await db.query('SELECT CONCAT(prenom," ",nom) AS fullname FROM users WHERE id=?', [technicien_id]);
      technicien_nom = rows[0]?.fullname || null;
    }

    await db.query(
      'UPDATE clino_mobile SET date=?,heure=?,adresse=?,medecin_id=?,technicien_id=?,medecin_nom=?,technicien_nom=?,commentaire=? WHERE id=?',
      [date, heure, adresse, medecin_id||null, technicien_id||null, medecin_nom, technicien_nom, commentaire||null, req.params.id]
    );

    const io = req.app.get('io');
    if (io) io.emit('clino_refresh');

    res.json({ message: 'Intervention mise à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/clino/:id  (Admin only)
router.delete('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  try {
    await db.query('DELETE FROM clino_mobile WHERE id = ?', [req.params.id]);

    const io = req.app.get('io');
    if (io) io.emit('clino_refresh');

    res.json({ message: 'Intervention supprimée' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
