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
      'INSERT INTO users (nom, prenom, email, password, role, telephone, is_active, first_login) VALUES (?,?,?,?,?,?,0,1)',
      [nom, prenom, email, tempHash, role, telephone || null]
    );

    // Générer l'OTP de confirmation
    const otp = generateOTP();
    await db.query('DELETE FROM codes WHERE email = ?', [email]);
    await db.query('INSERT INTO codes (email, code) VALUES (?,?)', [email, otp]);

    // Envoyer l'email avec OTP + mot de passe provisoire
    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"Planning Médical" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Votre compte Planning Médical — Informations de connexion',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;background:#fff">
            <div style="text-align:center;margin-bottom:24px">
              <div style="display:inline-block;background:#0ea5e9;border-radius:12px;padding:10px 20px">
                <span style="color:#fff;font-size:20px;font-weight:800">🏥 Planning Médical</span>
              </div>
            </div>
            <p style="font-size:15px">Bonjour <strong>${prenom} ${nom}</strong>,</p>
            <p style="color:#475569">Un compte a été créé pour vous sur l'application de planning médical.</p>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:20px 0">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#166534">🔑 Vos informations de connexion</p>
              <table style="width:100%;font-size:14px">
                <tr><td style="color:#64748b;padding:4px 0">Email :</td><td style="font-weight:700">${email}</td></tr>
                <tr><td style="color:#64748b;padding:4px 0">Mot de passe provisoire :</td><td><code style="background:#dcfce7;padding:2px 8px;border-radius:4px;font-size:16px;font-weight:800;letter-spacing:2px">${tempPassword}</code></td></tr>
              </table>
            </div>

            <p style="font-size:14px;color:#475569">Pour activer votre compte, votre administrateur a besoin du <strong>code de confirmation</strong> ci-dessous :</p>
            <div style="font-size:36px;font-weight:900;letter-spacing:10px;color:#0f172a;background:#f1f5f9;padding:20px;border-radius:10px;text-align:center;margin:16px 0;border:2px dashed #cbd5e1">
              ${otp}
            </div>
            <p style="color:#94a3b8;font-size:12px;text-align:center">⏱ Ce code de confirmation expire dans 15 minutes.</p>

            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:12px;color:#94a3b8;text-align:center">
              ⚠️ Lors de votre première connexion, vous serez invité à changer votre mot de passe.<br/>
              Ne partagez pas ces informations avec d'autres personnes.
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
        `GMT Ariana - Bonjour ${prenom} ${nom} !\nVotre compte a été créé.\nEmail : ${email}\nMot de passe provisoire : ${tempPassword}\nCode de confirmation (à remettre à l'admin) : ${otp}\nValable 15 min.`
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
