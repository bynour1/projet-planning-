const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db     = require('../config/db');
const { sendPasswordReset } = require('../config/mailer');

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email ou numéro de téléphone requis' });

  // Always return success to avoid enumeration
  res.json({ message: 'Si ce compte existe, un lien / code de réinitialisation a été envoyé par e-mail ou SMS.' });

  try {
    const rawInput = String(email).trim();
    const cleanPhone = rawInput.replace(/[^\d]/g, '');

    const [rows] = await db.query(
      `SELECT * FROM users WHERE email = ? 
       OR telephone = ? 
       OR telephone = ? 
       OR REPLACE(REPLACE(telephone, ' ', ''), '+216', '') = ?`,
      [rawInput, rawInput, `+216 ${rawInput}`, cleanPhone ? cleanPhone.slice(-8) : '___nomatch___']
    );
    if (!rows[0]) return;

    const user  = rows[0];
    const token = crypto.randomBytes(32).toString('hex');

    await db.query('DELETE FROM password_resets WHERE email = ?', [user.email]);
    await db.query(
      'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))',
      [user.email, token]
    );

    await sendPasswordReset(user.email, user.nom, user.prenom, token, user.telephone || null);
  } catch (err) {
    console.error('[forgot-password]', err.message);
  }
});

// GET /api/auth/reset-password?token=xxx  — validate token
router.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ message: 'Token requis' });
  try {
    const [rows] = await db.query(
      'SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > NOW()',
      [token]
    );
    if (!rows[0]) return res.status(400).json({ message: 'Lien invalide ou expiré' });
    res.json({ valid: true, email: rows[0].email });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password) return res.status(400).json({ message: 'Token et mot de passe requis' });
  if (new_password.length < 6) return res.status(400).json({ message: 'Mot de passe trop court (min 6)' });

  try {
    const [rows] = await db.query(
      'SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > NOW()',
      [token]
    );
    if (!rows[0]) return res.status(400).json({ message: 'Lien invalide ou expiré' });

    const hashed = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password = ?, is_active = 1, first_login = 0 WHERE email = ?', [hashed, rows[0].email]);
    await db.query('UPDATE password_resets SET used = 1 WHERE token = ?', [token]);

    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
