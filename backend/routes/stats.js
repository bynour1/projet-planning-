const router = require('express').Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/stats/monthly
router.get('/monthly', authenticate, async (req, res) => {
  try {
    const query = `
      SELECT 
        DATE_FORMAT(date, '%Y-%m') as month, 
        COUNT(*) as count 
      FROM planning_events 
      WHERE date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY month 
      ORDER BY month ASC
    `;
    const [rows] = await db.query(query);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/stats/by-medecin
router.get('/by-medecin', authenticate, async (req, res) => {
  try {
    const query = `
      SELECT 
        u.id, 
        u.nom, 
        u.prenom, 
        COUNT(pe.id) as count 
      FROM users u
      LEFT JOIN planning_events pe ON u.id = pe.medecin_id
      WHERE u.role = 'medecin' OR pe.id IS NOT NULL
      GROUP BY u.id, u.nom, u.prenom
      ORDER BY count DESC
    `;
    const [rows] = await db.query(query);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
