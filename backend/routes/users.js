const crypto     = require('crypto');
const router     = require('express').Router();
const bcrypt     = require('bcryptjs');
const db         = require('../config/db');
const { authenticate, authorize, invalidateUserCache } = require('../middleware/auth');
const { sendWelcomeEmail, sendOTP, sendSMS, getTransporter } = require('../config/mailer');
const { emailRateLimiter, emailGlobalIpLimiter } = require('../middleware/security');
const { revokeTrustedDevicesForUser } = require('../utils/trustedDevices');

// Fast in-memory cache for by-role users
const roleCache = new Map();
const ROLE_CACHE_TTL = 30 * 1000;

function invalidateRolesCache() {
  roleCache.clear();
}

// Génération cryptographiquement sécurisée d'un code à 6 chiffres
function generateOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}

const { generateTempPassword } = require('../utils/passwordGenerator');

// ─── GET /api/users ───────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nom, prenom, email, role, telephone, is_active, totp_enabled, must_change_password, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/users Error]:', err.message);
    // Résilience immédiate si une ou plusieurs colonnes (ex: must_change_password, totp_enabled) manquent en production
    try {
      const [rows] = await db.query('SELECT * FROM users ORDER BY id DESC');
      const safeRows = rows.map(u => ({
        id: u.id,
        nom: u.nom,
        prenom: u.prenom,
        email: u.email,
        role: u.role,
        telephone: u.telephone || null,
        is_active: u.is_active !== undefined ? u.is_active : 1,
        totp_enabled: u.totp_enabled !== undefined ? u.totp_enabled : 0,
        must_change_password: u.must_change_password !== undefined ? u.must_change_password : 0,
        created_at: u.created_at || null,
      }));
      return res.json(safeRows);
    } catch (fallbackErr) {
      console.error('[GET /api/users Fallback Error]:', fallbackErr.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
});

// GET /api/users/by-role/:role
router.get('/by-role/:role', authenticate, async (req, res) => {
  try {
    const role = req.params.role;
    const now = Date.now();
    const cached = roleCache.get(role);
    if (cached && (now - cached.ts < ROLE_CACHE_TTL)) {
      return res.json(cached.data);
    }
    const [rows] = await db.query(
      'SELECT id, nom, prenom, email, role FROM users WHERE role = ? AND is_active = 1',
      [role]
    );
    roleCache.set(role, { data: rows, ts: now });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/users/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nom, prenom, email, role, telephone, is_active, must_change_password FROM users WHERE id = ?',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Utilisateur introuvable' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /api/users/:id Error]:', err.message);
    try {
      const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ message: 'Utilisateur introuvable' });
      const u = rows[0];
      return res.json({
        id: u.id,
        nom: u.nom,
        prenom: u.prenom,
        email: u.email,
        role: u.role,
        telephone: u.telephone || null,
        is_active: u.is_active !== undefined ? u.is_active : 1,
        must_change_password: u.must_change_password !== undefined ? u.must_change_password : 0,
      });
    } catch (fallbackErr) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
});

// ─── POST /api/users  (Admin only) ───────────────────────────
router.post('/', authenticate, authorize('administrateur'), emailGlobalIpLimiter, async (req, res) => {
  const { nom, prenom, email, role, telephone } = req.body;
  if (!nom || !prenom || !email || !role)
    return res.status(400).json({ message: 'Tous les champs obligatoires doivent être renseignés' });

  try {
    const cleanEmail = String(email).trim().toLowerCase();
    // Check existing email
    const [exists] = await db.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (exists.length) return res.status(409).json({ message: 'Email déjà utilisé' });

    // Mot de passe provisoire : 14 caractères aléatoires (crypto.randomInt, sans caractères ambigus)
    const tempPassword = generateTempPassword(14);
    const tempHash = await bcrypt.hash(tempPassword, 10);

    let result;
    try {
      const [insertRes] = await db.query(
        `INSERT INTO users (nom, prenom, email, password, role, telephone, is_active, first_login, must_change_password, temp_password_expires_at) 
         VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1, DATE_ADD(NOW(), INTERVAL 48 HOUR))`,
        [nom.trim(), prenom.trim(), cleanEmail, tempHash, role, telephone ? String(telephone).trim() : null]
      );
      result = insertRes;
    } catch (insertErr) {
      console.warn('[Create User Error, attempting fallback query]:', insertErr.message);
      try {
        const [insertRes2] = await db.query(
          `INSERT INTO users (nom, prenom, email, password, role, telephone, is_active, first_login) 
           VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
          [nom.trim(), prenom.trim(), cleanEmail, tempHash, role, telephone ? String(telephone).trim() : null]
        );
        result = insertRes2;
      } catch (insertErr2) {
        try {
          const [insertRes3] = await db.query(
            `INSERT INTO users (nom, prenom, email, password, role, telephone) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [nom.trim(), prenom.trim(), cleanEmail, tempHash, role, telephone ? String(telephone).trim() : null]
          );
          result = insertRes3;
        } catch (insertErr3) {
          if (insertErr3.message && (insertErr3.message.includes('role') || insertErr3.message.includes('Data truncated'))) {
            return res.status(400).json({
              message: "Le rôle '" + role + "' n'est pas encore accepté par votre base de données. Exécutez : ALTER TABLE users MODIFY COLUMN role ENUM('administrateur','medecin','technicien','chauffeur','hse') NOT NULL;"
            });
          }
          throw insertErr3;
        }
      }
    }

    // Envoyer l'email de bienvenue à l'utilisateur uniquement (jamais de mot de passe à l'admin)
    let mailRes = {};
    try {
      mailRes = (await sendWelcomeEmail({
        email: cleanEmail,
        prenom: prenom.trim(),
        nom: nom.trim(),
        tempPassword,
        telephone: telephone || null,
      })) || {};
    } catch (mailErr) {
      console.warn('[Create User Mail Warning]:', mailErr.message);
      mailRes = { emailSent: false, emailError: mailErr.message };
    }
    const emailSent = mailRes.emailSent ?? true;
    const emailError = mailRes.emailError || null;

    // L'API ne renvoie JAMAIS le mot de passe (ni dans la réponse, ni dans les logs)
    res.status(201).json({
      message: emailSent
        ? `Accès envoyé par email à ${cleanEmail}`
        : `Compte créé avec succès ! Attention : E-mail non délivré (${emailError || 'Vérifier la configuration SMTP'}).`,
      userId: result.insertId,
      id: result.insertId,
      email: cleanEmail,
      prenom: prenom.trim(),
      nom: nom.trim(),
      role,
      telephone: telephone || null,
      email_sent: !!emailSent,
      email_error: emailError || null,
    });
  } catch (err) {
    console.error('[Create User Error]:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── POST /api/users/:id/resend-welcome (Admin only) ─────────
router.post('/:id/resend-welcome', authenticate, authorize('administrateur'), emailGlobalIpLimiter, emailRateLimiter, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Utilisateur introuvable' });
    const user = rows[0];

    // Générer nouveau mot de passe provisoire (14 caractères, invalide l'ancien)
    const tempPassword = generateTempPassword(14);
    const tempHash = await bcrypt.hash(tempPassword, 10);
    const newVersion = (user.token_version || 1) + 1;

    try {
      await db.query(
        `UPDATE users 
         SET password = ?, 
             must_change_password = 1, 
             first_login = 1, 
             is_active = 1, 
             temp_password_expires_at = DATE_ADD(NOW(), INTERVAL 48 HOUR), 
             token_version = ? 
         WHERE id = ?`,
        [tempHash, newVersion, user.id]
      );
    } catch (updateErr) {
      console.warn('[Resend Welcome Warning, fallbacking to basic UPDATE]:', updateErr.message);
      await db.query(
        `UPDATE users SET password = ? WHERE id = ?`,
        [tempHash, user.id]
      );
    }

    // Révocation de toutes les sessions actives et appareils de confiance
    await revokeTrustedDevicesForUser(db, user.id);
    await db.query('DELETE FROM refresh_tokens WHERE user_id = ?', [user.id]).catch(() => {});
    invalidateUserCache(user.id);

    let mailRes = {};
    try {
      mailRes = (await sendWelcomeEmail({
        email: user.email,
        prenom: user.prenom,
        nom: user.nom,
        tempPassword,
        telephone: user.telephone,
      })) || {};
    } catch (mailErr) {
      console.warn('[Resend Welcome Mail Warning]:', mailErr.message);
      mailRes = { emailSent: false, emailError: mailErr.message };
    }
    const emailSent = mailRes.emailSent ?? true;
    const emailError = mailRes.emailError || null;

    // L'API ne renvoie JAMAIS le mot de passe
    res.json({
      message: emailSent
        ? `Accès envoyé par email à ${user.email}`
        : `Nouveaux accès générés. Attention : E-mail non délivré (${emailError || 'Vérifier la configuration SMTP'}).`,
      userId: user.id,
      id: user.id,
      email: user.email,
      prenom: user.prenom,
      nom: user.nom,
      role: user.role,
      telephone: user.telephone,
      email_sent: !!emailSent,
      email_error: emailError || null,
    });
  } catch (err) {
    console.error('[resend-welcome error]:', err.message);
    res.status(500).json({ message: 'Erreur lors du renvoi de l\'e-mail' });
  }
});

// ─── POST /api/users/:id/reset-password (Admin only) ─────────
router.post('/:id/reset-password', authenticate, authorize('administrateur'), emailGlobalIpLimiter, emailRateLimiter, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Utilisateur introuvable' });
    const user = rows[0];

    const newPassword = req.body?.password || generateTempPassword(14);
    const hash = await bcrypt.hash(newPassword, 10);
    const newVersion = (user.token_version || 1) + 1;

    try {
      await db.query(
        `UPDATE users 
         SET password = ?, 
             must_change_password = 1, 
             first_login = 1, 
             is_active = 1, 
             temp_password_expires_at = DATE_ADD(NOW(), INTERVAL 48 HOUR), 
             token_version = ? 
         WHERE id = ?`,
        [hash, newVersion, user.id]
      );
    } catch (updateErr) {
      console.warn('[Reset Password Warning, fallbacking to basic UPDATE]:', updateErr.message);
      await db.query(
        `UPDATE users SET password = ? WHERE id = ?`,
        [hash, user.id]
      );
    }

    await revokeTrustedDevicesForUser(db, user.id);
    await db.query('DELETE FROM refresh_tokens WHERE user_id = ?', [user.id]).catch(() => {});
    invalidateUserCache(user.id);

    let mailRes = {};
    try {
      mailRes = (await sendWelcomeEmail({
        email: user.email,
        prenom: user.prenom,
        nom: user.nom,
        tempPassword: newPassword,
        telephone: user.telephone,
      })) || {};
    } catch (mailErr) {
      console.warn('[Reset Password Mail Warning]:', mailErr.message);
      mailRes = { emailSent: false, emailError: mailErr.message };
    }
    const emailSent = mailRes.emailSent ?? true;
    const emailError = mailRes.emailError || null;

    // L'API ne renvoie JAMAIS le mot de passe
    res.json({
      message: emailSent
        ? `Accès envoyé par email à ${user.email}`
        : `Mot de passe réinitialisé. Attention : E-mail non délivré (${emailError || 'Vérifier la configuration SMTP'}).`,
      userId: user.id,
      id: user.id,
      email: user.email,
      prenom: user.prenom,
      nom: user.nom,
      role: user.role,
      telephone: user.telephone,
      email_sent: !!emailSent,
      email_error: emailError || null,
    });
  } catch (err) {
    console.error('[reset-password error]:', err.message);
    res.status(500).json({ message: 'Erreur lors de la réinitialisation' });
  }
});

// ─── POST /api/users/verify-otp  (Admin only) ────────────────
router.post('/verify-otp', authenticate, authorize('administrateur'), async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code)
    return res.status(400).json({ message: 'Champs requis manquants' });

  try {
    const [rows] = await db.query(
      'SELECT * FROM codes WHERE email = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email]
    );
    if (!rows.length) return res.status(400).json({ message: 'Code invalide ou expiré' });

    const row = rows[0];
    const attempts = row.attempts || 0;

    // Protection anti-bruteforce (max 5 tentatives)
    if (attempts >= 5) {
      await db.query('DELETE FROM codes WHERE id = ?', [row.id]);
      return res.status(400).json({ message: 'Nombre maximal de tentatives dépassé (5/5). Veuillez demander un nouveau code.' });
    }

    const inputHash = crypto.createHash('sha256').update(String(code).trim()).digest('hex');
    const isMatch = row.code === inputHash || row.code === String(code).trim();

    if (!isMatch) {
      const newAttempts = attempts + 1;
      await db.query('UPDATE codes SET attempts = ? WHERE id = ?', [newAttempts, row.id]);
      const remaining = 5 - newAttempts;
      if (remaining <= 0) {
        await db.query('DELETE FROM codes WHERE id = ?', [row.id]);
        return res.status(400).json({ message: 'Code incorrect. Nombre maximal de tentatives atteint.' });
      }
      return res.status(400).json({ message: `Code incorrect. Il vous reste ${remaining} tentative${remaining > 1 ? 's' : ''}.` });
    }

    // Succès : activation du compte et suppression à usage unique
    await db.query('UPDATE users SET is_active = 1 WHERE email = ?', [email]);
    await db.query('DELETE FROM codes WHERE id = ?', [row.id]);

    res.json({ message: 'Compte activé avec succès.' });
  } catch (err) {
    console.error('[verify-otp]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── POST /api/users/resend-otp  (Admin only) ────────────────
router.post('/resend-otp', authenticate, authorize('administrateur'), emailGlobalIpLimiter, emailRateLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email requis' });

  try {
    const [userRows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!userRows.length) return res.status(404).json({ message: 'Utilisateur introuvable' });
    const user = userRows[0];

    const otp = generateOTP();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    await db.query('DELETE FROM codes WHERE email = ?', [email]);
    await db.query('INSERT INTO codes (email, code, attempts, expires_at) VALUES (?, ?, 0, DATE_ADD(NOW(), INTERVAL 10 MINUTE))', [email, otpHash]);

    // Envoyer uniquement le code OTP par email
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
    invalidateUserCache(req.params.id);
    invalidateRolesCache();
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
    invalidateUserCache(req.params.id);
    invalidateRolesCache();
    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── POST /api/users/:id/reset-2fa (Admin only) ──────────────
router.post('/:id/reset-2fa', authenticate, authorize('administrateur'), async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (!targetId) {
    return res.status(400).json({ message: 'Identifiant utilisateur invalide' });
  }

  // Empêcher l'administrateur de réinitialiser sa propre 2FA depuis la gestion des utilisateurs (risque d'auto-verrouillage)
  if (targetId === req.user.id) {
    return res.status(400).json({
      message: 'Impossible de réinitialiser votre propre 2FA depuis cette interface. Utilisez vos Paramètres personnels avec confirmation de votre mot de passe.',
    });
  }

  try {
    const [rows] = await db.query('SELECT id, email, nom, prenom, totp_enabled FROM users WHERE id = ?', [targetId]);
    const targetUser = rows[0];

    if (!targetUser) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    // Réinitialisation TOTP : désactive la 2FA, supprime le secret et tous les codes de secours
    await db.query(
      'UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL, totp_last_step = NULL WHERE id = ?',
      [targetId]
    );
    await db.query('DELETE FROM totp_backup_codes WHERE user_id = ?', [targetId]);
    await db.query('DELETE FROM webauthn_credentials WHERE user_id = ?', [targetId]);
    await revokeTrustedDevicesForUser(db, targetId);

    invalidateUserCache(targetId);
    invalidateRolesCache();

    console.log(`[Admin 2FA Reset] AUDIT SÉCURITÉ : L'administrateur #${req.user.id} (${req.user.email}) a réinitialisé la double authentification de l'utilisateur #${targetId} (${targetUser.email}) le ${new Date().toISOString()}`);

    res.json({
      success: true,
      message: `La double authentification de ${targetUser.prenom} ${targetUser.nom} a été réinitialisée avec succès.`,
    });
  } catch (err) {
    console.error('[Admin Reset-2FA Error]:', err.message);
    res.status(500).json({ message: 'Erreur lors de la réinitialisation de la 2FA' });
  }
});

// DELETE /api/users/:id/biometrics (Admin uniquement : révoque les appareils biométriques d'un utilisateur)
router.delete('/:id/biometrics', authenticate, authorize('administrateur'), async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    return res.status(400).json({ message: 'Identifiant utilisateur invalide' });
  }

  try {
    const [rows] = await db.query('SELECT id, email, nom, prenom FROM users WHERE id = ?', [targetId]);
    const targetUser = rows[0];

    if (!targetUser) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const [deleteResult] = await db.query('DELETE FROM webauthn_credentials WHERE user_id = ?', [targetId]);
    invalidateUserCache(targetId);

    console.log(`[Admin Biometric Reset] AUDIT SÉCURITÉ : L'administrateur #${req.user.id} (${req.user.email}) a révoqué tous les appareils biométriques (${deleteResult.affectedRows || 0}) de l'utilisateur #${targetId} (${targetUser.email}) le ${new Date().toISOString()}`);

    res.json({
      success: true,
      message: `Les identifiants biométriques de ${targetUser.prenom} ${targetUser.nom} ont été révoqués avec succès.`,
    });
  } catch (err) {
    console.error('[Admin Reset-Biometrics Error]:', err.message);
    res.status(500).json({ message: 'Erreur lors de la révocation biométrique' });
  }
});

router.generateTempPassword = generateTempPassword;

module.exports = router;
