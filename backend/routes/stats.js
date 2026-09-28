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

// GET /api/stats/dashboard-summary
router.get('/dashboard-summary', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const isAdmin = role === 'administrateur';

    // Parallel fast queries
    const [
      [userCountRows],
      [eventCountRows],
      [planningCountRows],
      [clinoCountRows],
      [entCountRows],
      [todayEventsRows],
      [upcomingEventsRows],
      [myPlanningRows],
      [convEntRows],
    ] = await Promise.all([
      db.query('SELECT COUNT(*) AS count FROM users'),
      db.query('SELECT COUNT(*) AS count FROM events'),
      db.query('SELECT COUNT(*) AS count FROM planning_events'),
      db.query('SELECT COUNT(*) AS count FROM clino_mobile'),
      db.query('SELECT COUNT(*) AS count FROM entreprises WHERE convensionne = 1'),
      db.query(`
        SELECT pe.*,
          CONCAT(m.prenom,' ',m.nom) AS medecin_nom,
          CONCAT(t.prenom,' ',t.nom) AS technicien_nom
        FROM planning_events pe
        LEFT JOIN users m ON m.id = pe.medecin_id
        LEFT JOIN users t ON t.id = pe.technicien_id
        WHERE pe.date = CURDATE()
        ORDER BY pe.heure_debut
      `),
      db.query(`
        SELECT * FROM events
        WHERE date_debut >= CURDATE()
        ORDER BY date_debut ASC
        LIMIT 10
      `),
      (isAdmin
        ? db.query(`
            SELECT pe.*,
              CONCAT(m.prenom,' ',m.nom) AS medecin_nom,
              CONCAT(t.prenom,' ',t.nom) AS technicien_nom
            FROM planning_events pe
            LEFT JOIN users m ON m.id = pe.medecin_id
            LEFT JOIN users t ON t.id = pe.technicien_id
            WHERE pe.date >= CURDATE()
            ORDER BY pe.date, pe.heure_debut
            LIMIT 6
          `)
        : db.query(`
            SELECT pe.*,
              CONCAT(m.prenom,' ',m.nom) AS medecin_nom,
              CONCAT(t.prenom,' ',t.nom) AS technicien_nom
            FROM planning_events pe
            LEFT JOIN users m ON m.id = pe.medecin_id
            LEFT JOIN users t ON t.id = pe.technicien_id
            WHERE (pe.medecin_id = ? OR pe.technicien_id = ?) AND pe.date >= CURDATE()
            ORDER BY pe.date, pe.heure_debut
            LIMIT 6
          `, [userId, userId])
      ),
      db.query(`
        SELECT id, code, nom, secteur, adresse, telephone, email, effectif_total, nb_visites_faites, convensionne
        FROM entreprises
        WHERE convensionne = 1
        ORDER BY nom ASC
        LIMIT 5
      `),
    ]);

    const formatRow = (r) => {
      if (!r) return r;
      const d = r.date ? new Date(r.date) : null;
      return {
        ...r,
        date: d && !isNaN(d) ? `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}` : r.date,
        heure_debut: r.heure_debut ? String(r.heure_debut).slice(0, 5) : null,
        heure_fin: r.heure_fin ? String(r.heure_fin).slice(0, 5) : null,
      };
    };

    res.json({
      stats: {
        users: userCountRows[0]?.count || 0,
        events: eventCountRows[0]?.count || 0,
        planning: planningCountRows[0]?.count || 0,
        clino: clinoCountRows[0]?.count || 0,
        entreprises: entCountRows[0]?.count || 0,
      },
      todayEvents: (todayEventsRows || []).map(formatRow),
      upcomingEvents: upcomingEventsRows || [],
      myPlanning: (myPlanningRows || []).map(formatRow),
      convEntreprises: convEntRows || [],
    });
  } catch (err) {
    console.error('dashboard-summary error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
