const router     = require('express').Router();
const bcrypt     = require('bcryptjs');
const db         = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { sendWelcomeEmail, sendSMS, getTransporter } = require('../config/mailer');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Génère un mot de passe provisoire lisible (ex: Med@4827)
function generateTempPassword() {
  const prefixes = ['Med', 'Doc', 'Plan', 'San', 'Care'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const specials = ['@', '#', '!', '$'];
  const special = specials[Math.floor(Math.random() * specials.length)];
  return `${prefix}${special}${num}`;
}

// ─── GET /api/users ───────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nom, prenom, email, role, telephone, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/users/by-role/:role
router.get('/by-role/:role', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nom, prenom, email, role FROM users WHERE role = ? AND is_active = 1',
      [req.params.role]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/users/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nom, prenom, email, role, telephone, is_active FROM users WHERE id = ?',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Utilisateur introuvable' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── POST /api/users  (Admin only) ───────────────────────────
router.post('/', authenticate, authorize('administrateur'), async (req, res) => {
  const { nom, prenom, email, role, telephone } = req.body;
  if (!nom || !prenom || !email || !role)
    return res.status(400).json({ message: 'Tous les champs sont requis' });

  try {
    // Check existing email
    const [exists] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists.length) return res.status(409).json({ message: 'Email déjà utilisé' });

    // Mot de passe initial provisoire sécurisé envoyé par email
    const tempPassword = generateTempPassword();
    const tempHash = await bcrypt.hash(tempPassword, 10);

    const [result] = await db.query(
      'INSERT INTO users (nom, prenom, email, password, role, telephone, is_active, first_login) VALUES (?,?,?,?,?,?,0,1)',
      [nom, prenom, email, tempHash, role, telephone || null]
    );

    // Générer l'OTP de confirmation
    const otp = generateOTP();
    await db.query('DELETE FROM codes WHERE email = ?', [email]);
    await db.query('INSERT INTO codes (email, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))', [email, otp]);

    // Envoyer l'email de bienvenue directement et uniquement à l'utilisateur
    let emailError = null;
    try {
      await sendWelcomeEmail({ email, prenom, nom, tempPassword, otp, telephone });
    } catch (err) {
      console.error(`[POST /api/users] Erreur envoi email à ${email}:`, err.message);
      emailError = err.message;
    }

    res.status(201).json({
      message: emailError
        ? `Compte créé mais l'e-mail n'a pas pu être envoyé à ${email}. Communiquez les identifiants ci-dessous directement à l'utilisateur.`
        : `Compte créé ! Un e-mail a été envoyé à ${email}. Si l'utilisateur ne le reçoit pas, communiquez-lui les identifiants ci-dessous.`,
      userId: result.insertId,
      email,
      tempPassword,
      otp,
      otp_sent: !emailError,
      email_error: emailError || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── POST /api/users/:id/resend-welcome (Admin only) ─────────
router.post('/:id/resend-welcome', authenticate, authorize('administrateur'), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Utilisateur introuvable' });
    const user = rows[0];

    // Générer nouveau mot de passe temporaire et OTP
    const tempPassword = generateTempPassword();
    const tempHash = await bcrypt.hash(tempPassword, 10);
    const otp = generateOTP();

    await db.query('UPDATE users SET password = ?, first_login = 1, is_active = 1 WHERE id = ?', [tempHash, user.id]);
    await db.query('DELETE FROM codes WHERE email = ?', [user.email]);
    await db.query('INSERT INTO codes (email, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))', [user.email, otp]);

    await sendWelcomeEmail({
      email: user.email,
      prenom: user.prenom,
      nom: user.nom,
      tempPassword,
      otp,
      telephone: user.telephone,
    });

    res.json({
      message: `E-mail d'accès renvoyé directement à ${user.email}.`,
      email: user.email,
    });
  } catch (err) {
    console.error('[resend-welcome]', err);
    res.status(500).json({ message: 'Erreur lors du renvoi de l\'e-mail' });
  }
});

// ─── POST /api/users/verify-otp  (Admin only) ────────────────
router.post('/verify-otp', authenticate, authorize('administrateur'), async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code)
    return res.status(400).json({ message: 'Champs requis manquants' });

  try {
    const [rows] = await db.query(
      'SELECT * FROM codes WHERE email = ? AND code = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email, code]
    );
    if (!rows.length) return res.status(400).json({ message: 'Code invalide ou expiré' });

    await db.query(
      'UPDATE users SET is_active = 1 WHERE email = ?',
      [email]
    );
    await db.query('DELETE FROM codes WHERE email = ?', [email]);

    res.json({ message: 'Compte activé avec succès.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── POST /api/users/resend-otp  (Admin only) ────────────────
router.post('/resend-otp', authenticate, authorize('administrateur'), async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email requis' });

  try {
    const [userRows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!userRows.length) return res.status(404).json({ message: 'Utilisateur introuvable' });
    const user = userRows[0];

    const otp = generateOTP();
    await db.query('DELETE FROM codes WHERE email = ?', [email]);
    await db.query('INSERT INTO codes (email, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))', [email, otp]);

    // Envoyer uniquement le code OTP par email
    const { sendOTP } = require('../config/mailer');
    await sendOTP(email, otp, user.nom, user.prenom, user.telephone);

    res.json({ message: `Nouveau code de confirmation envoyé à ${email}.` });
  } catch (err) {
    console.error('[resend-otp]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── PUT /api/users/:id  (Admin only) ────────────────────────
router.put('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  const { nom, prenom, email, role, telephone, is_active } = req.body;
  try {
    await db.query(
      'UPDATE users SET nom=?, prenom=?, email=?, role=?, telephone=?, is_active=? WHERE id=?',
      [nom, prenom, email, role, telephone || null, is_active ? 1 : 0, req.params.id]
    );
    res.json({ message: 'Utilisateur mis à jour' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── DELETE /api/users/:id  (Admin only) ─────────────────────
router.delete('/:id', authenticate, authorize('administrateur'), async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ message: 'Impossible de supprimer votre propre compte' });
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
