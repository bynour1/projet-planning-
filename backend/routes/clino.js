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
        CONCAT(t.prenom, ' ', t.nom) AS technicien_full,
        pe.titre AS planning_titre,
        pe.titre AS entreprise_nom
      FROM clino_mobile cm 
      LEFT JOIN users u ON u.id = cm.medecin_id 
      LEFT JOIN users t ON t.id = cm.technicien_id 
      LEFT JOIN planning_events pe ON pe.id = cm.planning_id
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
  const { date, heure, adresse, medecin_id, technicien_id, commentaire, planning_id, titre } = req.body;
  if (!date || !adresse) return res.status(400).json({ message: 'Date et adresse requises' });

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

    let finalPlanningId = planning_id || null;

    if (!finalPlanningId && titre) {
      const pTitre = titre;
      const [pRes] = await db.query(
        'INSERT INTO planning_events (titre, date, heure_debut, adresse, medecin_id, technicien_id, is_clino, type) VALUES (?,?,?,?,?,?,1,"ponctuel")',
        [pTitre, date, heure || null, adresse, medecin_id || null, technicien_id || null]
      );
      finalPlanningId = pRes.insertId;
    }

    const [result] = await db.query(
      'INSERT INTO clino_mobile (date,heure,adresse,medecin_id,technicien_id,medecin_nom,technicien_nom,commentaire,planning_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [date, heure || null, adresse, medecin_id||null, technicien_id||null, medecin_nom, technicien_nom, commentaire||null, finalPlanningId]
    );

    if (finalPlanningId) {
      await db.query('UPDATE planning_events SET clino_id = ? WHERE id = ?', [result.insertId, finalPlanningId]);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('clino_new', {
        id: result.insertId,
        date: fmtRaw(date),
        heure,
        adresse,
        titre: titre || null,
        medecin_nom,
        technicien_nom,
        planning_id: finalPlanningId,
        createdBy: `${req.user.prenom} ${req.user.nom}`,
        creatorId: req.user.id,
      });
      io.emit('clino_refresh');
      io.emit('planning_refresh');
    }

    res.status(201).json({ message: 'Intervention créée', id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/clino/:id  (Admin only)
router.put('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  const { date, heure, adresse, medecin_id, technicien_id, commentaire, titre } = req.body;
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
      [date, heure || null, adresse, medecin_id||null, technicien_id||null, medecin_nom, technicien_nom, commentaire||null, req.params.id]
    );

    // If linked to a planning_event, update it too
    if (titre) {
      await db.query(
        'UPDATE planning_events SET titre=?, date=?, heure_debut=?, adresse=?, medecin_id=?, technicien_id=? WHERE clino_id=?',
        [titre, date, heure || null, adresse, medecin_id||null, technicien_id||null, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE planning_events SET date=?, heure_debut=?, adresse=?, medecin_id=?, technicien_id=? WHERE clino_id=?',
        [date, heure || null, adresse, medecin_id||null, technicien_id||null, req.params.id]
      );
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('clino_refresh');
      io.emit('planning_refresh');
    }

    res.json({ message: 'Intervention mise à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/clino/:id  (Admin only)
router.delete('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  try {
    const clinoId = req.params.id;
    // Detach from planning_events
    await db.query('UPDATE planning_events SET is_clino = 0, clino_id = NULL WHERE clino_id = ?', [clinoId]);
    await db.query('DELETE FROM clino_mobile WHERE id = ?', [clinoId]);

    const io = req.app.get('io');
    if (io) {
      io.emit('clino_refresh');
      io.emit('planning_refresh');
    }

    res.json({ message: 'Intervention supprimée' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
