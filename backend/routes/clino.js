const router = require('express').Router();
const db     = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/clino
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT cm.*, CONCAT(u.prenom," ",u.nom) AS medecin_full FROM clino_mobile cm LEFT JOIN users u ON u.id = cm.medecin_id ORDER BY cm.date DESC, cm.heure DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/clino  (Admin only)
router.post('/', authenticate, authorize('administrateur'), async (req, res) => {
  const { date, heure, adresse, medecin_id, commentaire } = req.body;
  if (!date || !heure || !adresse) return res.status(400).json({ message: 'Date, heure et adresse requis' });

  try {
    // Get medecin name
    let medecin_nom = null;
    if (medecin_id) {
      const [rows] = await db.query('SELECT CONCAT(prenom," ",nom) AS fullname FROM users WHERE id=?', [medecin_id]);
      medecin_nom = rows[0]?.fullname || null;
    }

    const [result] = await db.query(
      'INSERT INTO clino_mobile (date,heure,adresse,medecin_id,medecin_nom,commentaire) VALUES (?,?,?,?,?,?)',
      [date, heure, adresse, medecin_id||null, medecin_nom, commentaire||null]
    );
    res.status(201).json({ message: 'Intervention créée', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/clino/:id  (Admin only)
router.put('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  const { date, heure, adresse, medecin_id, commentaire } = req.body;
  try {
    let medecin_nom = null;
    if (medecin_id) {
      const [rows] = await db.query('SELECT CONCAT(prenom," ",nom) AS fullname FROM users WHERE id=?', [medecin_id]);
      medecin_nom = rows[0]?.fullname || null;
    }
    await db.query(
      'UPDATE clino_mobile SET date=?,heure=?,adresse=?,medecin_id=?,medecin_nom=?,commentaire=? WHERE id=?',
      [date, heure, adresse, medecin_id||null, medecin_nom, commentaire||null, req.params.id]
    );
    res.json({ message: 'Intervention mise à jour' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/clino/:id  (Admin only)
router.delete('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  try {
    await db.query('DELETE FROM clino_mobile WHERE id = ?', [req.params.id]);
    res.json({ message: 'Intervention supprimée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
