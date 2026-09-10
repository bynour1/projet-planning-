const router = require('express').Router();
const db     = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════
// ENTREPRISES
// ═══════════════════════════════════════════════════════════════

// GET /api/entreprises
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT e.*,
        COUNT(DISTINCT r.id)          AS nb_avis,
        ROUND(AVG(r.note), 1)         AS note_moyenne
      FROM entreprises e
      LEFT JOIN entreprise_avis r ON r.entreprise_id = e.id
      GROUP BY e.id
      ORDER BY e.nom ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/entreprises/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM entreprises WHERE id=?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Entreprise introuvable' });

    const [avis] = await db.query(`
      SELECT a.*, u.nom AS user_nom, u.prenom AS user_prenom, u.role AS user_role
      FROM entreprise_avis a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.entreprise_id = ?
      ORDER BY a.created_at DESC
    `, [req.params.id]);

    res.json({ ...rows[0], avis });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/entreprises  (Admin only)
router.post('/', authenticate, authorize('administrateur'), async (req, res) => {
  const {
    nom, secteur, adresse, telephone, email, site_web, description, convensionne,
    date_debut_convention, date_fin_convention, renouvelable,
    effectif_total, nb_visites_faites, nb_bilans_faits, nb_bilans_manquants,
  } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });
  try {
    const [result] = await db.query(
      `INSERT INTO entreprises (
        nom, secteur, adresse, telephone, email, site_web, description, convensionne,
        date_debut_convention, date_fin_convention, renouvelable,
        effectif_total, nb_visites_faites, nb_bilans_faits, nb_bilans_manquants
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        nom.trim(), secteur||null, adresse||null, telephone||null, email||null, site_web||null, description||null,
        convensionne ? 1 : 0,
        date_debut_convention || null,
        date_fin_convention || null,
        renouvelable ? 1 : 0,
        parseInt(effectif_total) || 0,
        parseInt(nb_visites_faites) || 0,
        parseInt(nb_bilans_faits) || 0,
        parseInt(nb_bilans_manquants) || 0,
      ]
    );
    res.status(201).json({ message: 'Entreprise créée', id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/entreprises/:id  (Admin only)
router.put('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  const {
    nom, secteur, adresse, telephone, email, site_web, description, convensionne,
    date_debut_convention, date_fin_convention, renouvelable,
    effectif_total, nb_visites_faites, nb_bilans_faits, nb_bilans_manquants,
  } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });
  try {
    await db.query(
      `UPDATE entreprises SET
        nom=?, secteur=?, adresse=?, telephone=?, email=?, site_web=?, description=?, convensionne=?,
        date_debut_convention=?, date_fin_convention=?, renouvelable=?,
        effectif_total=?, nb_visites_faites=?, nb_bilans_faits=?, nb_bilans_manquants=?
      WHERE id=?`,
      [
        nom.trim(), secteur||null, adresse||null, telephone||null, email||null, site_web||null, description||null,
        convensionne ? 1 : 0,
        date_debut_convention || null,
        date_fin_convention || null,
        renouvelable ? 1 : 0,
        parseInt(effectif_total) || 0,
        parseInt(nb_visites_faites) || 0,
        parseInt(nb_bilans_faits) || 0,
        parseInt(nb_bilans_manquants) || 0,
        req.params.id,
      ]
    );
    res.json({ message: 'Entreprise mise à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PATCH /api/entreprises/:id/bilan  (Admin only - mise à jour rapide des chiffres)
router.patch('/:id/bilan', authenticate, authorize('administrateur'), async (req, res) => {
  const { effectif_total, nb_visites_faites, nb_bilans_faits, nb_bilans_manquants } = req.body;
  try {
    await db.query(
      `UPDATE entreprises SET
        effectif_total=?, nb_visites_faites=?, nb_bilans_faits=?, nb_bilans_manquants=?
      WHERE id=?`,
      [
        parseInt(effectif_total) || 0,
        parseInt(nb_visites_faites) || 0,
        parseInt(nb_bilans_faits) || 0,
        parseInt(nb_bilans_manquants) || 0,
        req.params.id,
      ]
    );
    res.json({ message: 'Bilan et effectif mis à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/entreprises/:id  (Admin only)
router.delete('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  try {
    await db.query('DELETE FROM entreprises WHERE id=?', [req.params.id]);
    res.json({ message: 'Entreprise supprimée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════════
// AVIS & REMARQUES
// ═══════════════════════════════════════════════════════════════

// GET /api/entreprises/:id/avis
router.get('/:id/avis', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT a.*, u.nom AS user_nom, u.prenom AS user_prenom, u.role AS user_role
      FROM entreprise_avis a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.entreprise_id = ?
      ORDER BY a.created_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/entreprises/:id/avis  (Any authenticated user)
router.post('/:id/avis', authenticate, async (req, res) => {
  const { note, commentaire, type_avis } = req.body;
  if (!commentaire?.trim()) return res.status(400).json({ message: 'Commentaire requis' });
  if (note !== undefined && (note < 1 || note > 5))
    return res.status(400).json({ message: 'Note entre 1 et 5' });

  try {
    // Check entreprise exists
    const [ent] = await db.query('SELECT id FROM entreprises WHERE id=?', [req.params.id]);
    if (!ent.length) return res.status(404).json({ message: 'Entreprise introuvable' });

    const [result] = await db.query(
      'INSERT INTO entreprise_avis (entreprise_id,user_id,note,commentaire,type_avis) VALUES (?,?,?,?,?)',
      [req.params.id, req.user.id, note||null, commentaire.trim(), type_avis||'avis']
    );
    res.status(201).json({ message: 'Avis ajouté', id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/entreprises/:id/avis/:avisId  (own avis or admin)
router.put('/:id/avis/:avisId', authenticate, async (req, res) => {
  const { note, commentaire, type_avis } = req.body;
  if (!commentaire?.trim()) return res.status(400).json({ message: 'Commentaire requis' });
  try {
    const [rows] = await db.query('SELECT * FROM entreprise_avis WHERE id=?', [req.params.avisId]);
    if (!rows[0]) return res.status(404).json({ message: 'Avis introuvable' });
    if (rows[0].user_id !== req.user.id && req.user.role !== 'administrateur')
      return res.status(403).json({ message: 'Accès refusé' });

    await db.query(
      'UPDATE entreprise_avis SET note=?,commentaire=?,type_avis=? WHERE id=?',
      [note||null, commentaire.trim(), type_avis||'avis', req.params.avisId]
    );
    res.json({ message: 'Avis mis à jour' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/entreprises/:id/avis/:avisId (own avis or admin)
router.delete('/:id/avis/:avisId', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM entreprise_avis WHERE id=?', [req.params.avisId]);
    if (!rows[0]) return res.status(404).json({ message: 'Avis introuvable' });
    if (rows[0].user_id !== req.user.id && req.user.role !== 'administrateur')
      return res.status(403).json({ message: 'Accès refusé' });

    await db.query('DELETE FROM entreprise_avis WHERE id=?', [req.params.avisId]);
    res.json({ message: 'Avis supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
