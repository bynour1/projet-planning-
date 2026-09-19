const router = require('express').Router();
const db     = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { notifyAllUsers, notifyAssignedIntervenants, eventEmailHtml } = require('../config/mailer');

// Auto-migration for events columns
(async () => {
  try { await db.query('ALTER TABLE events ADD COLUMN medecin_id INT NULL'); } catch (e) {}
  try { await db.query('ALTER TABLE events ADD COLUMN technicien_id INT NULL'); } catch (e) {}
  try { await db.query('ALTER TABLE events ADD COLUMN is_clino TINYINT(1) DEFAULT 0'); } catch (e) {}
  try { await db.query('ALTER TABLE events ADD COLUMN clino_id INT NULL'); } catch (e) {}
  try { await db.query('ALTER TABLE events ADD COLUMN participants TEXT NULL'); } catch (e) {}
})();

// GET /api/events
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT e.*,
        CONCAT(m.prenom, ' ', m.nom) AS medecin_nom,
        CONCAT(t.prenom, ' ', t.nom) AS technicien_nom
      FROM events e
      LEFT JOIN users m ON m.id = e.medecin_id
      LEFT JOIN users t ON t.id = e.technicien_id
      ORDER BY e.date_debut ASC
    `);
    const formatted = rows.map(r => {
      let parts = [];
      if (r.participants) {
        try {
          parts = typeof r.participants === 'string' ? JSON.parse(r.participants) : r.participants;
        } catch (e) {
          parts = [];
        }
      }
      return {
        ...r,
        participants: Array.isArray(parts) ? parts : [],
      };
    });
    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/events  (Admin only) + email notification
router.post('/', authenticate, authorize('administrateur'), async (req, res) => {
  const { titre, type, date_debut, date_fin, lieu, medecin_id, technicien_id, is_clino, participants } = req.body;
  if (!titre || !date_debut) return res.status(400).json({ message: 'Titre et date requis' });

  try {
    let clino_id = null;
    const isClinoVal = is_clino ? 1 : 0;

    let parsedParts = Array.isArray(participants) ? participants : [];
    let medId = medecin_id || null;
    let tecId = technicien_id || null;

    if (!medId && parsedParts.length > 0) {
      const doc = parsedParts.find(p => p.role === 'medecin');
      if (doc) medId = doc.id;
    }
    if (!tecId && parsedParts.length > 0) {
      const tec = parsedParts.find(p => p.role === 'technicien');
      if (tec) tecId = tec.id;
    }

    const partsJson = parsedParts.length > 0 ? JSON.stringify(parsedParts) : null;

    // Si Clino Mobile est activé, créer également la tournée dans clino_mobile
    if (isClinoVal) {
      const clinoDate = String(date_debut).slice(0, 10);
      const clinoTime = date_debut.includes('T') ? date_debut.split('T')[1].slice(0, 5) : '08:30';
      const [cRes] = await db.query(
        'INSERT INTO clino_mobile (titre, date, heure, adresse, medecin_id, technicien_id) VALUES (?,?,?,?,?,?)',
        [titre, clinoDate, clinoTime, lieu || null, medId, tecId]
      );
      clino_id = cRes.insertId;
    }

    const [result] = await db.query(
      'INSERT INTO events (titre, type, date_debut, date_fin, lieu, recurrence, medecin_id, technicien_id, is_clino, clino_id, participants, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [titre, type || 'Visite', date_debut, date_fin || null, lieu || null, 'none', medId, tecId, isClinoVal, clino_id, partsJson, req.user.id]
    );

    // Emit socket
    const io = req.app.get('io');
    if (io) {
      io.emit('calendar_new', {
        id: result.insertId,
        titre,
        type: type || 'Visite',
        date_debut,
        lieu,
        createdBy: `${req.user.prenom} ${req.user.nom}`,
        creatorId: req.user.id,
      });
      io.emit('calendar_refresh');
      io.emit('planning_refresh');
      if (isClinoVal) io.emit('clino_refresh');
    }

    // Email notification: Notifier uniquement les intervenants assignés pour la confidentialité des données
    const assignedIds = Array.from(new Set([
      medId,
      tecId,
      ...parsedParts.map(p => p.id),
    ].filter(Boolean)));

    if (assignedIds.length > 0) {
      notifyAssignedIntervenants({
        userIds: assignedIds,
        subject: `📅 Nouvel événement assigné — ${titre}`,
        html: eventEmailHtml({ titre, type: type || 'Visite', date_debut, date_fin, lieu, createdBy: `${req.user.prenom} ${req.user.nom}` }),
      });
    } else {
      // Événement général sans assignation spécifique
      notifyAllUsers({
        subject:   `📅 Nouvel événement — ${titre}`,
        html:      eventEmailHtml({ titre, type: type || 'Visite', date_debut, date_fin, lieu, createdBy: `${req.user.prenom} ${req.user.nom}` }),
        excludeId: req.user.id,
      });
    }

    res.status(201).json({ message: 'Événement créé', id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/events/:id
router.put('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  const { titre, type, date_debut, date_fin, lieu, medecin_id, technicien_id, is_clino, participants } = req.body;
  try {
    let parsedParts = Array.isArray(participants) ? participants : [];
    let medId = medecin_id || null;
    let tecId = technicien_id || null;

    if (!medId && parsedParts.length > 0) {
      const doc = parsedParts.find(p => p.role === 'medecin');
      if (doc) medId = doc.id;
    }
    if (!tecId && parsedParts.length > 0) {
      const tec = parsedParts.find(p => p.role === 'technicien');
      if (tec) tecId = tec.id;
    }

    const partsJson = parsedParts.length > 0 ? JSON.stringify(parsedParts) : null;

    await db.query(
      'UPDATE events SET titre=?, type=?, date_debut=?, date_fin=?, lieu=?, medecin_id=?, technicien_id=?, is_clino=?, participants=? WHERE id=?',
      [titre, type || 'Visite', date_debut, date_fin || null, lieu || null, medId, tecId, is_clino ? 1 : 0, partsJson, req.params.id]
    );
    const io = req.app.get('io');
    if (io) {
      io.emit('calendar_refresh');
      io.emit('planning_refresh');
    }
    res.json({ message: 'Événement mis à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/events/:id
router.delete('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  try {
    await db.query('DELETE FROM events WHERE id = ?', [req.params.id]);
    const io = req.app.get('io');
    if (io) {
      io.emit('calendar_refresh');
      io.emit('planning_refresh');
    }
    res.json({ message: 'Événement supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;

