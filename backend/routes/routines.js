const router = require('express').Router();
const db     = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/routines
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM routines WHERE user_id = ? ORDER BY time ASC, id DESC',
      [req.user.id]
    );
    const routines = rows.map(r => ({
      ...r,
      days: (() => { try { return JSON.parse(r.days || '[]'); } catch { return []; } })(),
    }));
    res.json(routines);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/routines
router.post('/', authenticate, async (req, res) => {
  const { title, time, days } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ message: 'Titre requis' });
  try {
    const [result] = await db.query(
      'INSERT INTO routines (user_id, title, time, days, active) VALUES (?,?,?,?,1)',
      [req.user.id, title.trim(), time || null, JSON.stringify(days || [])]
    );
    res.status(201).json({ message: 'Routine créée', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/routines/:id
router.put('/:id', authenticate, async (req, res) => {
  const { title, time, days, active } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ message: 'Titre requis' });
  try {
    const [result] = await db.query(
      'UPDATE routines SET title=?, time=?, days=?, active=? WHERE id=? AND user_id=?',
      [title.trim(), time || null, JSON.stringify(days || []), active ? 1 : 0, req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Routine introuvable' });
    res.json({ message: 'Routine mise à jour' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/routines/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM routines WHERE id=? AND user_id=?',
      [req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Routine introuvable' });
    res.json({ message: 'Routine supprimée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
