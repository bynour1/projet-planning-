const router = require('express').Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/search?q=QUERY
router.get('/', authenticate, async (req, res) => {
  const query = req.query.q;
  if (!query || query.trim() === '') {
    return res.json({ planning: [], entreprises: [], users: [] });
  }

  const searchTerm = `%${query.trim()}%`;

  try {
    const [planning] = await db.query(
      `SELECT id, titre, adresse, date FROM planning_events 
       WHERE titre LIKE ? OR adresse LIKE ? 
       LIMIT 5`,
      [searchTerm, searchTerm]
    );

    const [entreprises] = await db.query(
      `SELECT id, nom, adresse, secteur FROM entreprises 
       WHERE nom LIKE ? OR adresse LIKE ? OR secteur LIKE ? 
       LIMIT 5`,
      [searchTerm, searchTerm, searchTerm]
    );

    const [users] = await db.query(
      `SELECT id, nom, prenom, email, role FROM users 
       WHERE nom LIKE ? OR prenom LIKE ? OR email LIKE ? 
       LIMIT 5`,
      [searchTerm, searchTerm, searchTerm]
    );

    res.json({ planning, entreprises, users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
