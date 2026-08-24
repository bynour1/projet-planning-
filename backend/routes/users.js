const router     = require('express').Router();
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');
const db         = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { sendSMS } = require('../config/mailer');


// ─── Email transporter ────────────────────────────────────────
function getTransporter() {
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

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

    // Générer un mot de passe provisoire lisible et le hasher
    const tempPassword = generateTempPassword();
    const tempHash = await bcrypt.hash(tempPassword, 10);

    const [result] = await db.query(
      'INSERT INTO users (nom, prenom, email, password, role, telephone, is_active, first_login) VALUES (?,?,?,?,?,?,1,1)',
      [nom, prenom, email, tempHash, role, telephone || null]
    );

    // Générer l'OTP de confirmation
    const otp = generateOTP();
    await db.query('DELETE FROM codes WHERE email = ?', [email]);
    await db.query('INSERT INTO codes (email, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))', [email, otp]);

    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;

    // Envoyer l'email avec OTP + mot de passe provisoire
    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"GMT Ariana 🏥" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '🏥 Vos identifiants de connexion — GMT Ariana',
        html: `
          <div style="font-family:DM Sans,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
            <div style="text-align:center;margin-bottom:24px">
              <div style="display:inline-block;background:#0284c7;border-radius:12px;padding:12px 24px">
                <span style="color:#ffffff;font-size:18px;font-weight:800">🏥 GMT Ariana — Médecine du Travail</span>
              </div>
            </div>
            <p style="font-size:15px;color:#0f172a">Bonjour <strong>${prenom} ${nom}</strong>,</p>
            <p style="color:#475569;font-size:14px;line-height:1.5">Un compte a été créé pour vous sur la plateforme officielle du <strong>Groupement de Médecine du Travail de l'Ariana</strong>.</p>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;margin:20px 0">
              <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#166534">🔑 Vos informations de connexion :</p>
              <table style="width:100%;font-size:14px;border-collapse:collapse">
                <tr><td style="color:#64748b;padding:6px 0;width:40%">Identifiant (Email) :</td><td style="font-weight:700;color:#0f172a">${email}</td></tr>
                <tr><td style="color:#64748b;padding:6px 0">Mot de passe initial :</td><td><code style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:6px;font-size:15px;font-weight:800;letter-spacing:1px">${tempPassword}</code></td></tr>
              </table>
            </div>

            <div style="text-align:center;margin:20px 0">
              <a href="${loginUrl}" style="background:#0284c7;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">
                🚀 Accéder à la plateforme
              </a>
            </div>

            <p style="font-size:13px;color:#475569;margin-top:20px">Pour finaliser l'activation de votre compte, communiquez ce <strong>code de confirmation</strong> à votre administrateur :</p>
            <div style="font-size:32px;font-weight:900;letter-spacing:8px;color:#0f172a;background:#f8fafc;padding:16px;border-radius:10px;text-align:center;margin:12px 0;border:2px dashed #cbd5e1">
              ${otp}
            </div>
            <p style="color:#94a3b8;font-size:12px;text-align:center">⏱ Ce code de confirmation expire dans 15 minutes.</p>

            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:12px;color:#94a3b8;text-align:center;line-height:1.4">
              ⚠️ Lors de votre première connexion, il vous sera demandé de choisir un nouveau mot de passe personnalisé.<br/>
              Ne partagez jamais vos identifiants.
            </p>
          </div>
        `,
      });
    } catch (mailErr) {
      console.warn('Email non envoyé (vérifiez .env EMAIL_*):', mailErr.message);
    }

    // SMS notification si numéro de téléphone fourni
    if (telephone) {
      await sendSMS(telephone,
        `GMT Ariana - Bonjour ${prenom} ${nom} !\nVotre compte a été créé.\nEmail : ${email}\nMot de passe provisoire : ${tempPassword}\nCode de confirmation : ${otp}\nValable 15 min.`
      );
    }

    res.status(201).json({
      message: 'Utilisateur créé. Email de connexion envoyé avec le mot de passe provisoire.',
      userId: result.insertId,
      otp_sent: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── POST /api/users/verify-otp  (Admin only) ────────────────
// Le mot de passe provisoire est déjà enregistré lors de la création.
// L'admin saisit seulement l'OTP pour confirmer et activer le compte.
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

    // Activer le compte (le mot de passe provisoire est déjà hashé et stocké)
    await db.query(
      'UPDATE users SET is_active = 1 WHERE email = ?',
      [email]
    );
    await db.query('DELETE FROM codes WHERE email = ?', [email]);

    res.json({ message: 'Compte activé avec succès. L\'utilisateur peut se connecter avec son mot de passe provisoire.' });
  } catch (err) {
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
