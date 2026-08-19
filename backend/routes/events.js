const router = require('express').Router();
const db     = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { notifyAllUsers, eventEmailHtml } = require('../config/mailer');

// GET /api/events
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM events ORDER BY date_debut ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/events  (Admin only) + email notification
router.post('/', authenticate, authorize('administrateur'), async (req, res) => {
  const { titre, type, date_debut, date_fin, lieu, recurrence } = req.body;
  if (!titre || !date_debut) return res.status(400).json({ message: 'Titre et date requis' });

  try {
    const [result] = await db.query(
      'INSERT INTO events (titre,type,date_debut,date_fin,lieu,recurrence,created_by) VALUES (?,?,?,?,?,?,?)',
      [titre, type||'ponctuel', date_debut, date_fin||null, lieu||null, recurrence||'none', req.user.id]
    );

    // Emit socket
    const io = req.app.get('io');
    if (io) io.emit('calendar_refresh');

    // Email notification (async)
    notifyAllUsers({
      subject:   `📅 Nouvel événement — ${titre}`,
      html:      eventEmailHtml({ titre, type: type||'ponctuel', date_debut, date_fin, lieu, createdBy: `${req.user.prenom} ${req.user.nom}` }),
      excludeId: req.user.id,
    });

    res.status(201).json({ message: 'Événement créé', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/events/:id
router.put('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  const { titre, type, date_debut, date_fin, lieu, recurrence } = req.body;
  try {
    await db.query(
      'UPDATE events SET titre=?,type=?,date_debut=?,date_fin=?,lieu=?,recurrence=? WHERE id=?',
      [titre, type||'ponctuel', date_debut, date_fin||null, lieu||null, recurrence||'none', req.params.id]
    );
    const io = req.app.get('io');
    if (io) io.emit('calendar_refresh');
    res.json({ message: 'Événement mis à jour' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/events/:id
router.delete('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  try {
    await db.query('DELETE FROM events WHERE id = ?', [req.params.id]);
    const io = req.app.get('io');
    if (io) io.emit('calendar_refresh');
    res.json({ message: 'Événement supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
