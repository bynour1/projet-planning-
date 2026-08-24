const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../config/db');
const { authenticate } = require('../middleware/auth');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { sendOTP, sendSMS } = require('../config/mailer');

// ─── Multer Storage for Avatars ────────────────────────────────
const avatarDir = path.join(__dirname, '../uploads/avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `avatar-${req.user?.id || 'user'}-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont acceptées'));
  },
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email / Téléphone et mot de passe requis' });

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
    const user = rows[0];

    if (!user) return res.status(401).json({ message: 'Email / Téléphone ou mot de passe incorrect' });
    if (!user.is_active) return res.status(403).json({ message: 'Compte non activé' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Email / Téléphone ou mot de passe incorrect' });

    if (user.role === 'administrateur' && user.totp_enabled === 1) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await db.query('DELETE FROM codes WHERE email = ?', [user.email]);
      await db.query('INSERT INTO codes (email, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))', [user.email, code]);
      
      await sendOTP(user.email, code, user.nom, user.prenom, user.telephone);
      
      return res.json({ requires2FA: true, userId: user.id });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id:            user.id,
        nom:           user.nom,
        prenom:        user.prenom,
        email:         user.email,
        role:          user.role,
        avatar:        user.avatar,
        has_biometric: !!user.biometric_credential,
        first_login:   !!user.first_login,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/auth/verify-2fa
router.post('/verify-2fa', async (req, res) => {
  const { userId, code } = req.body;
  try {
    const [userRows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    const user = userRows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [codeRows] = await db.query('SELECT * FROM codes WHERE email = ? AND code = ? AND expires_at > NOW() ORDER BY id DESC LIMIT 1', [user.email, code]);
    
    if (codeRows.length === 0) {
      return res.status(400).json({ message: 'Code invalide ou expiré' });
    }

    await db.query('DELETE FROM codes WHERE id = ?', [codeRows[0].id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id:            user.id,
        nom:           user.nom,
        prenom:        user.prenom,
        email:         user.email,
        role:          user.role,
        avatar:        user.avatar,
        has_biometric: !!user.biometric_credential,
        first_login:   !!user.first_login,
      },
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/auth/toggle-2fa
router.post('/toggle-2fa', authenticate, async (req, res) => {
  const { enabled } = req.body;
  try {
    const totp_enabled = enabled ? 1 : 0;
    await db.query('UPDATE users SET totp_enabled = ? WHERE id = ?', [totp_enabled, req.user.id]);
    res.json({ totp_enabled: !!totp_enabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── Biometric (Face ID / Empreinte / Windows Hello / Passkey) ───

// POST /api/auth/biometric/register (authenticated)
router.post('/biometric/register', authenticate, async (req, res) => {
  const { credentialId, credentialName } = req.body;
  if (!credentialId) return res.status(400).json({ message: 'Identifiant biométrique manquant' });

  try {
    const payload = JSON.stringify({
      credentialId,
      name: credentialName || 'Appareil biométrique',
      registeredAt: new Date().toISOString(),
    });
    await db.query('UPDATE users SET biometric_credential = ? WHERE id = ?', [payload, req.user.id]);
    res.json({ success: true, message: 'Authentification biométrique activée avec succès !' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/auth/biometric (authenticated)
router.delete('/biometric', authenticate, async (req, res) => {
  try {
    await db.query('UPDATE users SET biometric_credential = NULL WHERE id = ?', [req.user.id]);
    res.json({ success: true, message: 'Authentification biométrique désactivée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/auth/biometric/login (public)
router.post('/biometric/login', async (req, res) => {
  const { credentialId, email } = req.body;
  if (!credentialId) return res.status(400).json({ message: 'Identifiant biométrique manquant' });

  try {
    let [rows] = await db.query(
      'SELECT * FROM users WHERE biometric_credential LIKE ? AND is_active = 1',
      [`%"credentialId":"${credentialId}"%`]
    );

    // If not found by credentialId and email was provided, try by email as fallback
    if (rows.length === 0 && email) {
      const [emailRows] = await db.query('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
      if (emailRows.length > 0 && emailRows[0].biometric_credential) {
        try {
          const bio = JSON.parse(emailRows[0].biometric_credential);
          if (bio.credentialId === credentialId) {
            rows = emailRows;
          }
        } catch {}
      }
    }

    const user = rows[0];

    if (!user || !user.biometric_credential) {
      return res.status(401).json({ message: 'Appareil ou empreinte non reconnus' });
    }

    const bioData = JSON.parse(user.biometric_credential);
    if (bioData.credentialId !== credentialId) {
      return res.status(401).json({ message: 'Empreinte non reconnue sur ce compte' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id:            user.id,
        nom:           user.nom,
        prenom:        user.prenom,
        email:         user.email,
        role:          user.role,
        avatar:        user.avatar,
        has_biometric: true,
        first_login:   !!user.first_login,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur lors de la connexion biométrique' });
  }
});

// POST /api/auth/avatar
router.post('/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Fichier image manquant' });
    const avatarUrl = '/uploads/avatars/' + req.file.filename;
    await db.query('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, req.user.id]);
    res.json({ avatar: avatarUrl, message: 'Photo de profil mise à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Erreur serveur lors du téléversement' });
  }
});

// DELETE /api/auth/avatar
router.delete('/avatar', authenticate, async (req, res) => {
  try {
    await db.query('UPDATE users SET avatar = NULL WHERE id = ?', [req.user.id]);
    res.json({ avatar: null, message: 'Photo de profil supprimée' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur lors de la suppression' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nom, prenom, email, role, avatar, first_login, totp_enabled, biometric_credential FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Utilisateur introuvable' });
    const user = rows[0];
    res.json({
      id:            user.id,
      nom:           user.nom,
      prenom:        user.prenom,
      email:         user.email,
      role:          user.role,
      avatar:        user.avatar,
      totp_enabled:  !!user.totp_enabled,
      has_biometric: !!user.biometric_credential,
      first_login:   !!user.first_login,
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ message: 'Tous les champs sont requis' });
  if (new_password.length < 6)
    return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères' });

  try {
    const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Utilisateur introuvable' });
    const valid = await bcrypt.compare(current_password, rows[0].password);
    if (!valid)
      return res.status(401).json({ message: 'Mot de passe actuel incorrect' });

    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password = ?, first_login = 0 WHERE id = ?', [hash, req.user.id]);
    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/auth/force-change-password
router.post('/force-change-password', authenticate, async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères' });

  try {
    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password = ?, first_login = 0 WHERE id = ?', [hash, req.user.id]);
    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
