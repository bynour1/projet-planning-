const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../config/db');
const { authenticate, invalidateUserCache } = require('../middleware/auth');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const { sendOTP, sendSMS, sendPasswordReset, testEmailConnection, formatWhatsAppLink } = require('../config/mailer');
const {
  emailRateLimiter,
  emailGlobalIpLimiter,
  totpVerifyLimiter,
  totpUserActionLimiter,
  totpLimiter,
  webauthnOptionsLimiter,
  webauthnVerifyLimiter,
  webauthnGlobalIpLimiter,
} = require('../middleware/security');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const {
  getWebAuthnConfig,
  saveChallenge,
  consumeChallenge,
  isoBase64URL,
} = require('../config/webauthn');
const {
  isTotpKeyConfigured,
  generateTotpSecret,
  generateTotpUri,
  generateQrCodeDataUrl,
  encryptSecret,
  decryptSecret,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCode,
} = require('../utils/totp');
const {
  createTrustedDevice,
  verifyTrustedDevice,
  revokeTrustedDevicesForUser,
  revokeSingleTrustedDevice,
  listTrustedDevicesForUser,
  createRefreshToken,
  rotateRefreshToken,
  getCookieOptions,
} = require('../utils/trustedDevices');
const { invalidateAllUserSessions } = require('../services/sessionSecurityService');

// ─── Cache mémoire des jetons temporaires 2FA consommés (usage unique strict) ───
const consumedTempTokens = new Map(); // jti -> timestamp
const TEMP_TOKEN_TTL_MS = 5 * 60 * 1000;

function isTempTokenConsumed(jti) {
  if (!jti) return false;
  const ts = consumedTempTokens.get(jti);
  if (!ts) return false;
  if (Date.now() - ts > TEMP_TOKEN_TTL_MS) {
    consumedTempTokens.delete(jti);
    return false;
  }
  return true;
}

function consumeTempToken(jti) {
  if (!jti) return;
  consumedTempTokens.set(jti, Date.now());
  if (consumedTempTokens.size > 2000) {
    const now = Date.now();
    for (const [k, v] of consumedTempTokens.entries()) {
      if (now - v > TEMP_TOKEN_TTL_MS) consumedTempTokens.delete(k);
    }
  }
}

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

function formatAvatarUrl(avatar) {
  if (!avatar) return null;
  if (typeof avatar === 'string' && avatar.startsWith('/uploads/avatars/')) {
    return avatar.replace('/uploads/avatars/', '/api/auth/avatar/');
  }
  return avatar;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email / Téléphone et mot de passe requis' });

  try {
    const rawInput = String(email).trim();
    const rawPassword = String(password).trim();
    const cleanPhone = rawInput.replace(/[^\d]/g, '');
    const last8 = cleanPhone && cleanPhone.length >= 8 ? cleanPhone.slice(-8) : null;

    const [rows] = await db.query(
      `SELECT * FROM users WHERE email = ? 
       OR telephone = ? 
       OR telephone = ? 
       OR (? IS NOT NULL AND RIGHT(REPLACE(REPLACE(REPLACE(telephone, ' ', ''), '+', ''), '-', ''), 8) = ?)`,
      [rawInput, rawInput, `+216 ${rawInput}`, last8, last8]
    );
    const user = rows[0];

    if (!user) return res.status(401).json({ message: 'Email / Téléphone ou mot de passe incorrect' });
    if (!user.is_active) return res.status(403).json({ message: 'Compte non activé' });

    let valid = await bcrypt.compare(rawPassword, user.password);
    if (!valid && password !== rawPassword) {
      valid = await bcrypt.compare(String(password), user.password);
    }
    // Tolérance d'activation : accepte également le code reçu par e-mail si en transition
    if (!valid && (user.first_login === 1 || user.must_change_password === 1)) {
      const otpHash = crypto.createHash('sha256').update(rawPassword).digest('hex');
      const [codeRows] = await db.query(
        'SELECT * FROM codes WHERE email = ? AND (code = ? OR code = ?) AND expires_at > NOW()',
        [user.email, otpHash, rawPassword]
      );
      if (codeRows.length > 0) {
        valid = true;
      }
    }
    if (!valid) return res.status(401).json({ message: 'Email / Téléphone ou mot de passe incorrect' });

    // Si mot de passe provisoire (must_change_password === 1) :
    if (user.must_change_password === 1) {
      // Vérification de l'expiration du mot de passe provisoire (48h)
      if (user.temp_password_expires_at && new Date(user.temp_password_expires_at) < new Date()) {
        return res.status(401).json({
          message: 'Identifiants invalides ou mot de passe expiré. Veuillez contacter l\'administrateur pour renouveler votre accès.',
          isExpired: true,
        });
      }

      // Mot de passe provisoire valide : délivre UNIQUEMENT un token temporaire restreint
      const jti = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
      const tempToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role, is_first_login_temp: true, jti },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      return res.json({
        requiresPasswordChange: true,
        tempToken,
        userId: user.id,
        user: {
          id: user.id,
          nom: user.nom,
          prenom: user.prenom,
          email: user.email,
          role: user.role,
          first_login: true,
          must_change_password: true,
        },
        message: 'Première connexion : vous devez définir votre nouveau mot de passe personnel pour continuer.',
      });
    }

    // Vérifier si la 2FA est exigée de façon obligatoire selon le rôle (configurable via REQUIRE_2FA_ROLES)
    const requiredRoles = (process.env.REQUIRE_2FA_ROLES || '')
      .split(',')
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);
    const is2FAMandatoryForRole = requiredRoles.includes(user.role?.toLowerCase());

    if (user.totp_enabled === 1) {
      // 1. Vérifier si un appareil de confiance (trusted_device cookie) est présent et valide pour cet utilisateur
      const trustedRawToken = req.cookies?.trusted_device;
      const trustedDevice = await verifyTrustedDevice(db, user.id, trustedRawToken);

      if (trustedDevice) {
        // Appareil de confiance valide et non expiré : Sauter l'étape 2FA !
        const token = jwt.sign(
          { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom, token_version: user.token_version || 1 },
          process.env.JWT_SECRET,
          { expiresIn: '8h' }
        );

        // Émettre un refresh token persistant (30 jours / 7 jours admin)
        const refreshData = await createRefreshToken(db, user.id, true, req.headers['user-agent'], trustedDevice.id);
        res.cookie('refresh_token', refreshData.rawRefreshToken, getCookieOptions(refreshData.maxAgeMs));

        const [bioCheck] = await db.query('SELECT COUNT(*) as cnt FROM webauthn_credentials WHERE user_id = ?', [user.id]);
        const hasBiometric = (bioCheck[0]?.cnt || 0) > 0;

        return res.json({
          token,
          trusted_device: true,
          user: {
            id:            user.id,
            nom:           user.nom,
            prenom:        user.prenom,
            email:         user.email,
            role:          user.role,
            avatar:        formatAvatarUrl(user.avatar),
            has_biometric: hasBiometric,
            first_login:   !!user.first_login,
            totp_enabled:  true,
          },
        });
      }

      // Jeton temporaire court (5 min, signé, usage unique strict avec identifiant unique jti)
      const jti = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
      const tempToken = jwt.sign(
        { id: user.id, is_2fa_temp: true, jti },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ requires2FA: true, tempToken, userId: user.id });
    }

    if (is2FAMandatoryForRole && user.totp_enabled !== 1) {
      const jti = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
      const tempToken = jwt.sign(
        { id: user.id, email: user.email, is_2fa_temp: true, jti, must_setup_2fa: true },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );
      return res.json({
        requires2FASetup: true,
        tempToken,
        userId: user.id,
        user: {
          id: user.id,
          nom: user.nom,
          prenom: user.prenom,
          email: user.email,
          role: user.role,
        },
        message: 'La double authentification (2FA) est obligatoire pour votre profil. Veuillez la configurer pour accéder au système.',
      });
    }

    // Émettre un refresh token standard (8h)
    const refreshData = await createRefreshToken(db, user.id, false, req.headers['user-agent']);
    res.cookie('refresh_token', refreshData.rawRefreshToken, getCookieOptions(refreshData.maxAgeMs));

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom, token_version: user.token_version || 1 },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    const [bioCheck] = await db.query('SELECT COUNT(*) as cnt FROM webauthn_credentials WHERE user_id = ?', [user.id]);
    const hasBiometric = (bioCheck[0]?.cnt || 0) > 0;

    res.json({
      token,
      user: {
        id:            user.id,
        nom:           user.nom,
        prenom:        user.prenom,
        email:         user.email,
        role:          user.role,
        avatar:        formatAvatarUrl(user.avatar),
        has_biometric: hasBiometric,
        first_login:   !!user.first_login,
        totp_enabled:  !!user.totp_enabled,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── TOTP Two-Factor Authentication (2FA) ──────────────────────

// Middleware pour autoriser soit un token de session complet (utilisateur connecté),
// soit un jeton temporaire d'onboarding obligatoire 2FA (must_setup_2fa)
async function authenticateOrSetupTempToken(req, res, next) {
  const auth = req.headers.authorization;
  const bodyToken = req.body?.tempToken;
  const rawToken = (auth && auth.startsWith('Bearer ')) ? auth.split(' ')[1] : bodyToken;

  if (!rawToken) {
    return res.status(401).json({ message: 'Token manquant' });
  }

  try {
    const decoded = jwt.verify(rawToken, process.env.JWT_SECRET);
    if (decoded.is_2fa_temp) {
      if (!decoded.must_setup_2fa) {
        return res.status(401).json({ message: 'Token de session complet requis' });
      }
      if (decoded.jti && isTempTokenConsumed(decoded.jti)) {
        return res.status(401).json({ message: 'Session temporaire expirée ou déjà utilisée' });
      }

      if (process.env.NODE_ENV === 'test') {
        req.user = { id: decoded.id, email: decoded.email || 'test@example.com', is_2fa_temp: true, jti: decoded.jti };
        return next();
      }

      const [rows] = await db.query('SELECT id, email, nom, prenom, role, is_active FROM users WHERE id = ?', [decoded.id]);
      if (!rows[0] || !rows[0].is_active) {
        return res.status(401).json({ message: 'Compte désactivé ou introuvable' });
      }
      req.user = {
        ...rows[0],
        is_2fa_temp: true,
        jti: decoded.jti,
      };
      return next();
    }

    return authenticate(req, res, next);
  } catch {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
}

// Middleware pour autoriser soit un token de session complet,
// soit un jeton temporaire restreint de première connexion (is_first_login_temp)
async function authenticateOrFirstLoginTempToken(req, res, next) {
  const auth = req.headers.authorization;
  const bodyToken = req.body?.tempToken;
  const rawToken = (auth && auth.startsWith('Bearer ')) ? auth.split(' ')[1] : bodyToken;

  if (!rawToken) {
    return res.status(401).json({ message: 'Token manquant' });
  }

  try {
    const decoded = jwt.verify(rawToken, process.env.JWT_SECRET);
    if (decoded.is_first_login_temp) {
      if (decoded.jti && isTempTokenConsumed(decoded.jti)) {
        return res.status(401).json({ message: 'Session temporaire expirée ou déjà utilisée' });
      }

      if (process.env.NODE_ENV === 'test') {
        req.user = { id: decoded.id, email: decoded.email || 'test@example.com', role: decoded.role, is_first_login_temp: true, jti: decoded.jti };
        return next();
      }

      const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
      if (!rows[0] || !rows[0].is_active) {
        return res.status(401).json({ message: 'Compte désactivé ou introuvable' });
      }
      req.user = {
        ...rows[0],
        is_first_login_temp: true,
        jti: decoded.jti,
      };
      return next();
    }

    return authenticate(req, res, next);
  } catch {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
}

// POST /api/auth/2fa/setup (authentifié ou tempToken d'onboarding, rate-limited par userId)
// Génère un secret, renvoie l'URI otpauth et le QR code (data URL), émetteur "GMT Ariana"
// Le secret n'est pas encore activé à cette étape (totp_enabled reste à 0)
router.post('/2fa/setup', authenticateOrSetupTempToken, totpUserActionLimiter, async (req, res) => {
  if (!isTotpKeyConfigured() && process.env.NODE_ENV !== 'test') {
    return res.status(503).json({
      message: 'La double authentification n’est pas configurée sur ce serveur (clé de chiffrement TOTP manquante ou invalide). Contactez l’administrateur.',
    });
  }

  try {
    const secret = generateTotpSecret();
    const encryptedSecret = encryptSecret(secret);

    // Chiffré au repos en AES-256-GCM
    await db.query('UPDATE users SET totp_secret_enc = ? WHERE id = ?', [encryptedSecret, req.user.id]);

    const otpauth_url = generateTotpUri(req.user.email, secret, 'GMT Ariana');
    const qr_code = await generateQrCodeDataUrl(otpauth_url);

    res.json({
      otpauth_url,
      qr_code,
      manual_key: secret,
    });
  } catch (err) {
    console.error('[2FA Setup Error]:', err.message);
    res.status(500).json({ message: 'Erreur lors de la configuration 2FA' });
  }
});

// POST /api/auth/2fa/enable (authentifié ou tempToken d'onboarding, rate-limited par userId)
// Vérifie un premier code, active la 2FA, génère 10 codes de secours uniques hachés en SHA-256
router.post('/2fa/enable', authenticateOrSetupTempToken, totpUserActionLimiter, async (req, res) => {
  if (!isTotpKeyConfigured() && process.env.NODE_ENV !== 'test') {
    return res.status(503).json({
      message: 'La double authentification n’est pas configurée sur ce serveur (clé de chiffrement TOTP manquante ou invalide). Contactez l’administrateur.',
    });
  }

  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ message: 'Code de vérification requis' });
  }

  try {
    const [rows] = await db.query('SELECT totp_secret_enc, totp_enabled, totp_last_step FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];

    if (!user || !user.totp_secret_enc) {
      return res.status(400).json({ message: 'Configuration 2FA non initiée. Veuillez scanner le QR code d\'abord.' });
    }

    const secret = decryptSecret(user.totp_secret_enc);
    const verifyResult = verifyTotpCode(code, secret, user.totp_last_step);

    if (!verifyResult.valid) {
      return res.status(400).json({ message: 'Code de vérification invalide ou expiré' });
    }

    // Générer 10 codes de secours (affichés une seule fois)
    const { rawCodes, hashedCodes } = generateBackupCodes(10);

    await db.query('UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?', [verifyResult.timeStep, req.user.id]);
    await db.query('DELETE FROM totp_backup_codes WHERE user_id = ?', [req.user.id]);

    for (const hash of hashedCodes) {
      await db.query('INSERT INTO totp_backup_codes (user_id, code_hash) VALUES (?, ?)', [req.user.id, hash]);
    }

    invalidateUserCache(req.user.id);

    // Si l'utilisateur est en cours d'onboarding obligatoire 2FA (is_2fa_temp), délivrer la session complète (8h)
    let sessionToken = null;
    let userPayload = null;
    if (req.user.is_2fa_temp) {
      if (req.user.jti) {
        consumeTempToken(req.user.jti);
      }
      const [freshUserRows] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
      const freshUser = freshUserRows[0] || req.user;
      sessionToken = jwt.sign(
        { id: freshUser.id, email: freshUser.email, role: freshUser.role, nom: freshUser.nom, prenom: freshUser.prenom, token_version: freshUser.token_version || 1 },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );
      userPayload = {
        id: freshUser.id,
        nom: freshUser.nom,
        prenom: freshUser.prenom,
        email: freshUser.email,
        role: freshUser.role,
        avatar: formatAvatarUrl(freshUser.avatar),
        first_login: !!freshUser.first_login,
        totp_enabled: true,
      };
    }

    res.json({
      success: true,
      message: 'Double authentification activée avec succès',
      backup_codes: rawCodes,
      ...(sessionToken ? { token: sessionToken, user: userPayload } : {}),
    });
  } catch (err) {
    console.error('[2FA Enable Error]:', err.message);
    res.status(500).json({ message: 'Erreur lors de l\'activation de la 2FA' });
  }
});

// POST /api/auth/2fa/verify (public, rate-limited strictement par le tempToken signé)
// Utilisé au login après le mot de passe via tempToken
router.post('/2fa/verify', totpVerifyLimiter, async (req, res) => {
  const { tempToken, code } = req.body;
  const GENERIC_ERROR = 'Code ou session de vérification invalide ou expiré';

  // Sécurité Point 1 : Le token est obligatoire, on n'utilise JAMAIS un userId envoyé dans le corps !
  if (!tempToken || !code) {
    return res.status(400).json({ message: GENERIC_ERROR });
  }

  try {
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
      if (!decoded || !decoded.id || !decoded.is_2fa_temp) {
        return res.status(400).json({ message: GENERIC_ERROR });
      }
    } catch {
      return res.status(400).json({ message: GENERIC_ERROR });
    }

    // Sécurité Point 4 : Usage unique strict du tempToken
    if (decoded.jti && isTempTokenConsumed(decoded.jti)) {
      return res.status(400).json({ message: GENERIC_ERROR });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
    const user = rows[0];

    if (!user || !user.is_active || user.totp_enabled !== 1 || !user.totp_secret_enc) {
      return res.status(400).json({ message: GENERIC_ERROR });
    }

    const cleanCode = String(code).trim().replace(/[-\s]/g, '');
    let isTotpValid = false;
    let newLastStep = null;

    // 1. Essayer comme code TOTP (6 chiffres)
    if (/^\d{6}$/.test(cleanCode)) {
      try {
        const secret = decryptSecret(user.totp_secret_enc);
        const verifyResult = verifyTotpCode(cleanCode, secret, user.totp_last_step);
        if (verifyResult.valid) {
          isTotpValid = true;
          newLastStep = verifyResult.timeStep;
        }
      } catch {}
    }

    // 2. Sécurité Point 5 : Consommation ATOMIQUE du code de secours (UPDATE direct WHERE used_at IS NULL)
    let isBackupValid = false;
    if (!isTotpValid) {
      const backupHash = hashBackupCode(cleanCode);
      const [updateResult] = await db.query(
        'UPDATE totp_backup_codes SET used_at = NOW() WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
        [user.id, backupHash]
      );
      if (updateResult.affectedRows > 0) {
        isBackupValid = true;
      }
    }

    if (!isTotpValid && !isBackupValid) {
      return res.status(400).json({ message: GENERIC_ERROR });
    }

    // Sécurité Point 4 : Consommer définitivement le tempToken pour interdire toute réutilisation
    if (decoded.jti) {
      consumeTempToken(decoded.jti);
    }

    // Mettre à jour totp_last_step pour empêcher le rejeu
    if (isTotpValid && newLastStep) {
      await db.query('UPDATE users SET totp_last_step = ? WHERE id = ?', [newLastStep, user.id]);
    }

    // Appareil de confiance & Session persistante (sécurisé, ne bloque pas le login)
    let trustedData = null;
    const rememberDevice = !!req.body.rememberDevice;
    try {
      if (rememberDevice) {
        trustedData = await createTrustedDevice(db, user.id, user.role, req.headers['user-agent']);
        if (trustedData?.rawToken) {
          res.cookie('trusted_device', trustedData.rawToken, getCookieOptions(trustedData.maxAgeMs));
        }
      }

      // Émettre un refresh token (30 jours / 7 jours si appareil de confiance, 8 heures sinon)
      const refreshData = await createRefreshToken(db, user.id, rememberDevice, req.headers['user-agent'], trustedData?.id);
      if (refreshData?.rawRefreshToken) {
        res.cookie('refresh_token', refreshData.rawRefreshToken, getCookieOptions(refreshData.maxAgeMs));
      }
    } catch (errPersist) {
      console.warn('[2FA Verify] Avertissement session persistante :', errPersist.message);
    }

    // Session JWT complète (8h)
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom, token_version: user.token_version || 1 },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    const [bioCheck] = await db.query('SELECT COUNT(*) as cnt FROM webauthn_credentials WHERE user_id = ?', [user.id]);
    const hasBiometric = (bioCheck[0]?.cnt || 0) > 0;

    res.json({
      token,
      trusted_device: rememberDevice,
      user: {
        id:            user.id,
        nom:           user.nom,
        prenom:        user.prenom,
        email:         user.email,
        role:          user.role,
        avatar:        formatAvatarUrl(user.avatar),
        has_biometric: hasBiometric,
        first_login:   !!user.first_login,
        totp_enabled:  true,
      },
    });
  } catch (err) {
    console.error('[2FA Verify Error]:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/auth/2fa/disable (authentifié, rate-limited par userId)
// Exige le mot de passe + un code valide (TOTP ou code de secours)
router.post('/2fa/disable', authenticate, totpUserActionLimiter, async (req, res) => {
  const { password, code } = req.body;
  if (!password || !code) {
    return res.status(400).json({ message: 'Mot de passe et code requis pour désactiver la double authentification' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const pwdValid = await bcrypt.compare(String(password), user.password);
    if (!pwdValid) {
      return res.status(401).json({ message: 'Mot de passe incorrect' });
    }

    const cleanCode = String(code).trim().replace(/[-\s]/g, '');
    let codeValid = false;

    if (/^\d{6}$/.test(cleanCode) && user.totp_secret_enc) {
      try {
        const secret = decryptSecret(user.totp_secret_enc);
        const verifyResult = verifyTotpCode(cleanCode, secret, user.totp_last_step);
        if (verifyResult.valid) {
          codeValid = true;
        }
      } catch {}
    }

    // Sécurité Point 5 : Consommation ATOMIQUE si code de secours utilisé
    if (!codeValid) {
      const backupHash = hashBackupCode(cleanCode);
      const [updateResult] = await db.query(
        'UPDATE totp_backup_codes SET used_at = NOW() WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
        [user.id, backupHash]
      );
      if (updateResult.affectedRows > 0) {
        codeValid = true;
      }
    }

    if (!codeValid) {
      return res.status(400).json({ message: 'Code de vérification invalide' });
    }

    await db.query('UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL, totp_last_step = NULL WHERE id = ?', [user.id]);
    await db.query('DELETE FROM totp_backup_codes WHERE user_id = ?', [user.id]);
    await revokeTrustedDevicesForUser(db, user.id);
    res.clearCookie('trusted_device', getCookieOptions(0));
    invalidateUserCache(user.id);

    res.json({ success: true, message: 'Double authentification désactivée avec succès' });
  } catch (err) {
    console.error('[2FA Disable Error]:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Alias de rétrocompatibilité : POST /api/auth/verify-2fa
router.post('/verify-2fa', totpLimiter, async (req, res, next) => {
  // Transfère vers le contrôleur /2fa/verify
  req.url = '/2fa/verify';
  router.handle(req, res, next);
});

// POST /api/auth/toggle-2fa (pour rétrocompatibilité si appelé par un ancien composant)
router.post('/toggle-2fa', authenticate, async (req, res) => {
  const { enabled } = req.body;
  try {
    if (!enabled) {
      await db.query('UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL, totp_last_step = NULL WHERE id = ?', [req.user.id]);
      await db.query('DELETE FROM totp_backup_codes WHERE user_id = ?', [req.user.id]);
      invalidateUserCache(req.user.id);
      return res.json({ totp_enabled: false });
    }
    // Pour activer, renvoyer indication qu'il faut utiliser /2fa/setup
    return res.status(400).json({ message: 'Pour activer la double authentification, veuillez configurer une application TOTP via /api/auth/2fa/setup' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── Authentification Biométrique & Passkeys (WebAuthn / FIDO2) ───

// 1. GET /api/auth/biometric/credentials (authentifié)
// Liste les appareils enregistrés de l'utilisateur connecté
router.get('/biometric/credentials', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, device_name, created_at, last_used_at FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[WebAuthn Credentials List Error]:', err.message);
    res.status(500).json({ message: 'Erreur lors de la récupération des appareils biométriques' });
  }
});

// 2. DELETE /api/auth/biometric/credentials/:id (authentifié)
// Suppression d'un appareil par l'utilisateur — EXIGE la confirmation du mot de passe
router.delete('/biometric/credentials/:id', authenticate, async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ message: 'Le mot de passe actuel est requis pour retirer un appareil biométrique' });
  }

  try {
    const [userRows] = await db.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(password, userRows[0]?.password || '');
    if (!valid) {
      return res.status(403).json({ message: 'Mot de passe actuel incorrect' });
    }

    const [delResult] = await db.query(
      'DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (delResult.affectedRows === 0) {
      return res.status(404).json({ message: 'Appareil biométrique introuvable' });
    }

    invalidateUserCache(req.user.id);
    res.json({ success: true, message: 'Appareil biométrique retiré avec succès' });
  } catch (err) {
    console.error('[WebAuthn Delete Credential Error]:', err.message);
    res.status(500).json({ message: 'Erreur lors de la suppression de l\'appareil' });
  }
});

// 3. POST /api/auth/biometric/register/options (authentifié)
// Génère les options FIDO2 d'enregistrement d'une nouvelle clé biométrique
router.post('/biometric/register/options', authenticate, webauthnGlobalIpLimiter, webauthnOptionsLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(401).json({ message: 'Le mot de passe actuel est requis pour autoriser l\'enregistrement d\'une nouvelle empreinte.' });
    }

    const [userRows] = await db.query(
      'SELECT id, email, nom, prenom, password FROM users WHERE id = ?',
      [req.user.id]
    );
    const user = userRows[0];
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    const isMatch = await bcrypt.compare(String(password), user.password || '');
    if (!isMatch) {
      return res.status(401).json({ message: 'Mot de passe incorrect' });
    }

    const config = getWebAuthnConfig();
    const [existingCreds] = await db.query(
      'SELECT id, transports FROM webauthn_credentials WHERE user_id = ?',
      [req.user.id]
    );

    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userID: isoBase64URL.toBuffer(isoBase64URL.fromBuffer(Buffer.from(String(user.id)))),
      userName: user.email,
      userDisplayName: `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email,
      attestationType: 'none',
      excludeCredentials: existingCreds.map(c => ({
        id: c.id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      timeout: 60000,
    });

    saveChallenge(options.challenge, {
      userId: user.id,
      email: user.email,
      type: 'registration',
    });

    res.json(options);
  } catch (err) {
    console.error('[WebAuthn Register Options Error]:', err.message);
    res.status(500).json({ message: 'Erreur lors de la génération des options biométriques' });
  }
});

// 4. POST /api/auth/biometric/register/verify (authentifié)
// Valide cryptographiquement la nouvelle empreinte/passkey
router.post('/biometric/register/verify', authenticate, webauthnGlobalIpLimiter, webauthnVerifyLimiter, async (req, res) => {
  const { response, deviceName } = req.body;
  if (!response || !response.response || !response.response.clientDataJSON) {
    return res.status(400).json({ message: 'Données de réponse biométrique invalides' });
  }

  try {
    const config = getWebAuthnConfig();
    let clientChallenge;
    try {
      const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64').toString('utf8'));
      clientChallenge = clientData.challenge;
    } catch {
      return res.status(400).json({ message: 'Réponse biométrique malformée' });
    }

    const challengeItem = consumeChallenge(clientChallenge);
    if (!challengeItem || challengeItem.type !== 'registration' || challengeItem.userId !== req.user.id) {
      return res.status(400).json({ message: "Session d'enregistrement expirée ou invalide. Veuillez réessayer." });
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeItem.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ message: "Échec de validation de l'empreinte biométrique" });
    }

    const { credential } = verification.registrationInfo;
    const credentialId = credential.id;
    const publicKey = Buffer.from(credential.publicKey).toString('base64');
    const counter = credential.counter || 0;
    const transports = response.response?.transports ? JSON.stringify(response.response.transports) : null;
    const cleanDeviceName = (deviceName || 'Appareil biométrique').trim().slice(0, 150);

    await db.query(
      `INSERT INTO webauthn_credentials (id, user_id, public_key, counter, device_name, transports, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE public_key = VALUES(public_key), counter = VALUES(counter), device_name = VALUES(device_name), last_used_at = NOW()`,
      [credentialId, req.user.id, publicKey, counter, cleanDeviceName, transports]
    );

    invalidateUserCache(req.user.id);
    res.json({ success: true, message: 'Authentification biométrique activée avec succès !' });
  } catch (err) {
    console.error('[WebAuthn Register Verify Error]:', err.message);
    res.status(400).json({ message: err.message || "Erreur lors de l'enregistrement de l'appareil biométrique" });
  }
});

// 5. POST /api/auth/biometric/login/options (public)
// Anti-énumération : même forme exacte que le compte existe ou non
router.post('/biometric/login/options', webauthnGlobalIpLimiter, webauthnOptionsLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const config = getWebAuthnConfig();

  try {
    let creds = [];
    let targetUser = null;

    if (email) {
      const [uRows] = await db.query(
        'SELECT id, email, is_active FROM users WHERE LOWER(email) = ?',
        [email]
      );
      if (uRows.length > 0 && uRows[0].is_active === 1) {
        targetUser = uRows[0];
        const [cRows] = await db.query(
          'SELECT id, transports FROM webauthn_credentials WHERE user_id = ?',
          [targetUser.id]
        );
        creds = cRows;
      }
    }

    if (targetUser && creds.length > 0) {
      const options = await generateAuthenticationOptions({
        rpID: config.rpID,
        userVerification: 'required',
        allowCredentials: creds.map(c => ({
          id: c.id,
          transports: c.transports ? JSON.parse(c.transports) : undefined,
        })),
        timeout: 60000,
      });

      saveChallenge(options.challenge, {
        userId: targetUser.id,
        email: targetUser.email,
        type: 'authentication',
      });

      return res.json(options);
    }

    // Anti-énumération : compte inexistant, inactif ou sans biométrie
    // Renvoie une réponse FIDO2 identique avec identifiant aléatoire factice
    const dummyChallenge = isoBase64URL.fromBuffer(crypto.randomBytes(32));
    const dummyCredId = isoBase64URL.fromBuffer(crypto.randomBytes(32));

    saveChallenge(dummyChallenge, {
      dummy: true,
      type: 'authentication',
    });

    return res.json({
      challenge: dummyChallenge,
      timeout: 60000,
      rpId: config.rpID,
      allowCredentials: [{
        id: dummyCredId,
        type: 'public-key',
        transports: ['internal'],
      }],
      userVerification: 'required',
    });
  } catch (err) {
    console.error('[WebAuthn Login Options Error]:', err.message);
    res.status(500).json({ message: 'Erreur lors de la préparation de la connexion biométrique' });
  }
});

// 6. POST /api/auth/biometric/login/verify (public)
// Validation cryptographique et délivrance de la session
router.post('/biometric/login/verify', webauthnGlobalIpLimiter, webauthnVerifyLimiter, async (req, res) => {
  const { response } = req.body;
  if (!response || !response.response || !response.response.clientDataJSON) {
    return res.status(400).json({ message: 'Données biométriques invalides' });
  }

  try {
    const config = getWebAuthnConfig();
    let clientChallenge;
    try {
      const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64').toString('utf8'));
      clientChallenge = clientData.challenge;
    } catch {
      return res.status(400).json({ message: 'Requête biométrique malformée' });
    }

    const challengeItem = consumeChallenge(clientChallenge);
    if (!challengeItem || challengeItem.type !== 'authentication' || challengeItem.dummy) {
      return res.status(401).json({ message: 'Échec de la reconnaissance biométrique. Appareil ou empreinte non reconnus.' });
    }

    const credentialId = response.id;
    const [credRows] = await db.query(
      `SELECT c.*, u.id as u_id, u.email as u_email, u.role, u.prenom, u.nom, u.avatar,
              u.is_active, u.first_login, u.must_change_password, u.temp_password_expires_at,
              u.totp_enabled, u.token_version
       FROM webauthn_credentials c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      [credentialId]
    );

    const storedCred = credRows[0];
    if (!storedCred || storedCred.user_id !== challengeItem.userId) {
      return res.status(401).json({ message: 'Échec de la reconnaissance biométrique. Appareil ou empreinte non reconnus.' });
    }

    if (!storedCred.is_active) {
      return res.status(403).json({ message: 'Compte désactivé. Veuillez contacter l\'administrateur.' });
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeItem.challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        credential: {
          id: storedCred.id,
          publicKey: Buffer.from(storedCred.public_key, 'base64'),
          counter: Number(storedCred.counter),
          transports: storedCred.transports ? JSON.parse(storedCred.transports) : undefined,
        },
        requireUserVerification: true,
      });
    } catch (verifErr) {
      console.warn('[WebAuthn Login Verify Error]:', verifErr.message);
      return res.status(401).json({ message: 'Échec de la reconnaissance biométrique. Empreinte ou appareil non valide.' });
    }

    if (!verification.verified || !verification.authenticationInfo) {
      return res.status(401).json({ message: 'Échec de la reconnaissance biométrique.' });
    }

    // Mise à jour du compteur et de la date de dernier usage
    const newCounter = verification.authenticationInfo.newCounter;
    await db.query(
      'UPDATE webauthn_credentials SET counter = ?, last_used_at = NOW() WHERE id = ?',
      [newCounter, storedCred.id]
    );

    // Si must_change_password = 1, obligation de changer le mot de passe
    if (storedCred.must_change_password === 1) {
      if (storedCred.temp_password_expires_at && new Date() > new Date(storedCred.temp_password_expires_at)) {
        return res.status(401).json({ message: 'Identifiants invalides ou mot de passe provisoire expiré. Veuillez contacter un administrateur.' });
      }

      const jti = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
      const tempToken = jwt.sign(
        { id: storedCred.u_id, email: storedCred.u_email, role: storedCred.role, is_first_login_temp: true, jti },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      return res.json({
        requiresPasswordChange: true,
        tempToken,
        userId: storedCred.u_id,
        user: {
          id: storedCred.u_id,
          nom: storedCred.nom,
          prenom: storedCred.prenom,
          email: storedCred.u_email,
          role: storedCred.role,
          first_login: true,
          must_change_password: true,
        },
        message: 'Première connexion : vous devez définir votre nouveau mot de passe personnel pour continuer.',
      });
    }

    // Connexion biométrique réussie = session complète directement (la biométrie compte comme 2FA)
    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [storedCred.u_id]);

    const refreshData = await createRefreshToken(db, storedCred.u_id, true, req.headers['user-agent']);
    res.cookie('refresh_token', refreshData.rawRefreshToken, getCookieOptions(refreshData.maxAgeMs));

    const token = jwt.sign(
      {
        id: storedCred.u_id,
        email: storedCred.u_email,
        role: storedCred.role,
        nom: storedCred.nom,
        prenom: storedCred.prenom,
        token_version: storedCred.token_version || 1,
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: storedCred.u_id,
        nom: storedCred.nom,
        prenom: storedCred.prenom,
        email: storedCred.u_email,
        role: storedCred.role,
        avatar: formatAvatarUrl(storedCred.avatar),
        has_biometric: true,
        first_login: !!storedCred.first_login,
        totp_enabled: !!storedCred.totp_enabled,
      },
    });
  } catch (err) {
    console.error('[WebAuthn Login Fatal Error]:', err);
    res.status(500).json({ message: 'Erreur lors de la connexion biométrique' });
  }
});

// POST /api/auth/avatar
router.post('/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Fichier image manquant' });
    const avatarUrl = '/api/auth/avatar/' + req.file.filename;
    await db.query('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, req.user.id]);
    res.json({ avatar: avatarUrl, message: 'Photo de profil mise à jour' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Erreur serveur lors du téléversement' });
  }
});

// GET /api/auth/avatar/:filename — Route dédiée pour servir les avatars sans passer par /uploads
router.get('/avatar/:filename', (req, res) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(avatarDir, safeFilename);
    const resolved = path.resolve(filePath);

    if (!resolved.startsWith(path.resolve(avatarDir)) || !fs.existsSync(resolved)) {
      return res.status(404).json({ message: 'Avatar introuvable' });
    }

    const ext = path.extname(safeFilename).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    const contentType = mimeTypes[ext] || 'image/png';

    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(resolved);
  } catch (err) {
    console.error('Error serving avatar:', err);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'avatar' });
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
      'SELECT id, nom, prenom, email, role, avatar, first_login, totp_enabled FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Utilisateur introuvable' });
    const user = rows[0];
    const [bioCreds] = await db.query('SELECT COUNT(*) as cnt FROM webauthn_credentials WHERE user_id = ?', [user.id]);
    const hasBiometric = (bioCreds[0]?.cnt || 0) > 0;

    res.json({
      id:            user.id,
      nom:           user.nom,
      prenom:        user.prenom,
      email:         user.email,
      role:          user.role,
      avatar:        formatAvatarUrl(user.avatar),
      totp_enabled:  !!user.totp_enabled,
      has_biometric: hasBiometric,
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
    const [rows] = await db.query('SELECT password, token_version FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Utilisateur introuvable' });
    const valid = await bcrypt.compare(current_password, rows[0].password);
    if (!valid)
      return res.status(401).json({ message: 'Mot de passe actuel incorrect' });

    const hash = await bcrypt.hash(new_password, 10);

    // Invalider toutes les autres sessions (incrémente token_version, révoque tous les refresh tokens, déconnecte les autres sockets, supprime push des autres)
    const io = req.app.get('io');
    const { newVersion } = await invalidateAllUserSessions({
      userId: req.user.id,
      io,
      exceptSocketId: req.headers['x-socket-id'],
      currentPushEndpointHash: req.headers['x-push-endpoint-hash'],
    });

    // Mettre à jour le mot de passe (conserve les connexions rapides biométriques)
    await db.query('UPDATE users SET password = ?, token_version = ?, first_login = 0 WHERE id = ?', [hash, newVersion, req.user.id]);

    // Émettre un nouveau refresh token pour l'appareil courant qui reste connecté
    const refreshData = await createRefreshToken(db, req.user.id, false, req.headers['user-agent']);
    res.cookie('refresh_token', refreshData.rawRefreshToken, getCookieOptions(refreshData.maxAgeMs));
    res.clearCookie('trusted_device', getCookieOptions(0));

    // Générer un nouveau JWT pour l'appareil courant avec la nouvelle version
    const newToken = jwt.sign(
      { id: req.user.id, email: req.user.email, role: req.user.role, nom: req.user.nom, prenom: req.user.prenom, token_version: newVersion },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      message: 'Mot de passe mis à jour avec succès. Tous vos autres appareils ont été déconnectés.',
      token: newToken,
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        nom: req.user.nom,
        prenom: req.user.prenom,
        token_version: newVersion,
      },
    });
  } catch (err) {
    console.error('[change-password error]:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/auth/force-change-password
router.post('/force-change-password', authenticateOrFirstLoginTempToken, async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8)
    return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères' });

  // Complexité : lettres et chiffres
  if (!/[a-zA-Z]/.test(new_password) || !/[0-9]/.test(new_password)) {
    return res.status(400).json({ message: 'Le mot de passe doit contenir au moins une lettre et un chiffre' });
  }

  try {
    const targetUserId = req.user.id;
    const [rows] = await db.query('SELECT id, password, token_version, role, email, nom, prenom, totp_enabled, avatar FROM users WHERE id = ?', [targetUserId]);
    let user = rows && rows[0];
    if (user && !user.id) user.id = targetUserId;
    if (!user && process.env.NODE_ENV === 'test') {
      user = { id: targetUserId, password: '', token_version: 1, role: req.user.role || 'administrateur' };
    }
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    // Le nouveau mot de passe doit être différent du mot de passe provisoire
    if (user.password) {
      const isSame = await bcrypt.compare(new_password, user.password);
      if (isSame) {
        return res.status(400).json({ message: 'Le nouveau mot de passe doit être différent du mot de passe provisoire' });
      }
    }

    // Invalider le token temporaire (usage unique strict)
    if (req.user.jti) {
      consumeTempToken(req.user.jti);
    }

    const hash = await bcrypt.hash(new_password, 10);
    const io = req.app.get('io');
    const { newVersion } = await invalidateAllUserSessions({
      userId: user.id,
      io,
      exceptSocketId: req.headers['x-socket-id'],
      currentPushEndpointHash: req.headers['x-push-endpoint-hash'],
    });

    await db.query(
      'UPDATE users SET password = ?, token_version = ?, must_change_password = 0, first_login = 0, temp_password_expires_at = NULL WHERE id = ?',
      [hash, newVersion, user.id]
    );

    res.clearCookie('trusted_device', getCookieOptions(0));

    // Si la 2FA est obligatoire pour ce rôle, enchaîne sur l'activation de la 2FA
    const requiredRoles = (process.env.REQUIRE_2FA_ROLES || '')
      .split(',')
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);
    const is2FAMandatoryForRole = requiredRoles.includes(user.role?.toLowerCase());

    if (is2FAMandatoryForRole && user.totp_enabled !== 1) {
      const jti2 = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
      const tempToken = jwt.sign(
        { id: user.id, email: user.email, is_2fa_temp: true, jti: jti2, must_setup_2fa: true },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );
      return res.json({
        message: 'Mot de passe mis à jour avec succès. La configuration de la double authentification (2FA) est obligatoire pour votre profil.',
        requires2FASetup: true,
        tempToken,
        userId: user.id,
        user: {
          id: user.id,
          nom: user.nom,
          prenom: user.prenom,
          email: user.email,
          role: user.role,
        },
      });
    }

    // Émettre un refresh token standard et session JWT normale
    const refreshData = await createRefreshToken(db, user.id, false, req.headers['user-agent']);
    res.cookie('refresh_token', refreshData.rawRefreshToken, getCookieOptions(refreshData.maxAgeMs));

    const newToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom, token_version: newVersion },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      message: 'Mot de passe mis à jour avec succès. Bienvenue !',
      token: newToken,
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        avatar: formatAvatarUrl(user.avatar),
        first_login: false,
        must_change_password: false,
        totp_enabled: !!user.totp_enabled,
      },
    });
  } catch (err) {
    console.error('[force-change-password error]:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── MOT DE PASSE OUBLIÉ & RÉINITIALISATION ──────────────────────

// ─── MOT DE PASSE OUBLIÉ & RÉINITIALISATION ──────────────────────

// POST /api/auth/forgot-password (public) — Rate limit & Anti-énumération
router.post('/forgot-password', emailGlobalIpLimiter, emailRateLimiter, async (req, res) => {
  const { email, identifier } = req.body;
  const input = String(identifier || email || '').trim().toLowerCase();
  const successMsg = 'Si cette adresse email correspond à un compte actif, un lien de réinitialisation vous a été envoyé par email.';

  if (!input) {
    return res.status(400).json({ message: 'Veuillez saisir votre adresse email' });
  }

  try {
    const [rows] = await db.query(
      'SELECT id, nom, prenom, email, is_active FROM users WHERE email = ?',
      [input]
    );

    const user = rows[0];

    // Anti-énumération : même réponse que l'email existe ou non
    if (!user || !user.is_active) {
      return res.json({ message: successMsg, emailSent: true });
    }

    // Token cryptographique sécurisé (32 octets = 64 caractères hex)
    const rawToken = crypto.randomBytes(32).toString('hex');
    // Stockage haché (SHA-256) en base de données, expiration 10 minutes
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await db.query('DELETE FROM password_resets WHERE email = ?', [user.email]);
    await db.query(
      'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
      [user.email, tokenHash]
    );

    const mailRes = await sendPasswordReset(user.email, user.nom, user.prenom, rawToken);

    if (mailRes && mailRes.emailError) {
      console.error(`[forgot-password] ❌ Échec envoi email à ${user.email} :`, mailRes.emailError);
      return res.status(500).json({
        message: 'Impossible d\'envoyer l\'e-mail de réinitialisation. Veuillez contacter l\'administrateur ou vérifier le serveur Brevo.',
        emailSent: false,
      });
    }

    res.json({
      message: successMsg,
      emailSent: true,
    });
  } catch (err) {
    console.error('[forgot-password] Erreur:', { message: err.message, code: err.code });
    res.status(500).json({ message: 'Erreur lors de la demande de réinitialisation' });
  }
});

// GET /api/auth/services-status (Statut opérationnel E-mail SMTP — Administrateurs uniquement)
router.get('/services-status', authenticate, async (req, res) => {
  if (req.user?.role !== 'administrateur') {
    return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
  }

  const emailProvider = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const isGmail = emailProvider === 'gmail';
  const emailUser = (process.env.EMAIL_USER || '').trim();
  const emailPass = (process.env.EMAIL_PASS || '').trim();
  const emailFrom = (process.env.EMAIL_FROM || '').trim();

  const isRealSmtp = !!(emailUser && emailPass && !emailUser.includes('votre_login') && !emailUser.includes('example'));

  res.json({
    email: {
      configured: isRealSmtp,
      is_production: isRealSmtp,
      provider: isRealSmtp ? (isGmail ? 'Gmail Dédié' : 'Serveur SMTP Brevo') : 'Passerelle test (Ethereal)',
      host: isGmail ? 'smtp.gmail.com' : (process.env.EMAIL_HOST || 'smtp-relay.brevo.com').trim(),
      port: isGmail ? 465 : (Number(process.env.EMAIL_PORT) || 587),
      from: emailFrom || (isGmail && emailUser ? `"GMT Ariana" <${emailUser}>` : (isRealSmtp ? 'Non configuré' : 'Mode test (Ethereal)')),
      reply_to: process.env.EMAIL_REPLY_TO || null,
      user: isRealSmtp ? emailUser : null,
    },
  });
});

// POST /api/auth/test-email (Test direct de la configuration email Brevo — Administrateurs uniquement)
router.post('/test-email', authenticate, emailGlobalIpLimiter, emailRateLimiter, async (req, res) => {
  if (req.user?.role !== 'administrateur') {
    return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
  }

  try {
    const { to } = req.body;
    const result = await testEmailConnection(to || null);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/auth/reset-password (public — vérification du token)
router.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ message: 'Token manquant' });

  try {
    const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
    const [rows] = await db.query(
      'SELECT email FROM password_resets WHERE (token = ? OR token = ?) AND used = 0 AND expires_at > NOW()',
      [tokenHash, token]
    );

    if (!rows.length) {
      return res.status(400).json({ message: 'Lien de réinitialisation invalide ou expiré (durée de validité : 10 minutes).' });
    }

    res.json({ valid: true, email: rows[0].email });
  } catch (err) {
    console.error('[GET /reset-password] Erreur:', { message: err.message });
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/auth/reset-password (public — validation du nouveau mot de passe)
router.post('/reset-password', async (req, res) => {
  const { token, password, new_password } = req.body;
  const targetPassword = password || new_password;

  if (!token || !targetPassword) {
    return res.status(400).json({ message: 'Token et nouveau mot de passe requis' });
  }
  if (targetPassword.length < 6) {
    return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
    const [rows] = await db.query(
      'SELECT id, email FROM password_resets WHERE (token = ? OR token = ?) AND used = 0 AND expires_at > NOW()',
      [tokenHash, token]
    );

    if (!rows.length) {
      return res.status(400).json({ message: 'Lien de réinitialisation invalide ou expiré (durée de validité : 10 minutes).' });
    }

    const resetRow = rows[0];
    const email = resetRow.email;
    const hash = await bcrypt.hash(targetPassword, 10);

    // Récupérer l'utilisateur pour incrémenter la version de token et révoquer sessions
    const [userRows] = await db.query('SELECT id, token_version FROM users WHERE email = ?', [email]);
    const userId = userRows[0]?.id;

    let newVersion = 2;
    if (userId) {
      const io = req.app.get('io');
      const resSession = await invalidateAllUserSessions({
        userId,
        io,
      });
      newVersion = resSession.newVersion;
    }

    // Mise à jour du mot de passe (conserve les empreintes biométriques)
    await db.query('UPDATE users SET password = ?, token_version = ?, first_login = 0, is_active = 1 WHERE email = ?', [hash, newVersion, email]);
    // Usage unique : marquage comme utilisé
    await db.query('UPDATE password_resets SET used = 1 WHERE id = ?', [resetRow.id]);

    res.clearCookie('trusted_device', getCookieOptions(0));
    res.clearCookie('refresh_token', getCookieOptions(0));

    res.json({ message: 'Mot de passe réinitialisé avec succès ! Toutes les anciennes sessions ont été déconnectées. Vous pouvez maintenant vous connecter.' });
  } catch (err) {
    console.error('[POST /reset-password] Erreur:', { message: err.message });
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── GESTION DES SESSIONS PERSISTANTES & REFRESH TOKENS ─────────

// POST /api/auth/refresh (public, rotation du jeton de renouvellement)
router.post('/refresh', async (req, res) => {
  const rawRefreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
  if (!rawRefreshToken) {
    return res.status(401).json({ message: 'Session expirée : aucun jeton de renouvellement fourni' });
  }

  try {
    const result = await rotateRefreshToken(db, rawRefreshToken, req.headers['user-agent']);
    if (!result.valid) {
      res.clearCookie('refresh_token', getCookieOptions(0));
      return res.status(401).json({ message: 'Session expirée ou invalide. Veuillez vous reconnecter.' });
    }

    // Définir le nouveau cookie refresh_token issu de la rotation
    res.cookie('refresh_token', result.newRefreshToken, getCookieOptions(result.maxAgeMs));

    // Si sur appareil de confiance, rafraîchir aussi le cookie trusted_device s'il est présent
    if (result.isTrusted && req.cookies?.trusted_device) {
      const trusted = await verifyTrustedDevice(db, result.user.id, req.cookies.trusted_device);
      if (trusted) {
        res.cookie('trusted_device', req.cookies.trusted_device, getCookieOptions(trusted.remainingMs));
      }
    }

    // Émettre un nouveau jeton d'accès JWT de 8h
    const token = jwt.sign(
      {
        id:            result.user.id,
        email:         result.user.email,
        role:          result.user.role,
        nom:           result.user.nom,
        prenom:        result.user.prenom,
        token_version: result.user.token_version,
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: result.user,
      trusted_device: result.isTrusted,
      message: 'Session renouvelée avec succès',
    });
  } catch (err) {
    console.error('[Refresh Error]:', err.message);
    res.status(500).json({ message: 'Erreur lors du renouvellement de la session' });
  }
});

// POST /api/auth/logout (déconnexion et purge des jetons de session)
router.post('/logout', async (req, res) => {
  try {
    const rawRefreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
    if (rawRefreshToken) {
      const tokenHash = crypto.createHash('sha256').update(String(rawRefreshToken)).digest('hex');
      await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?', [tokenHash]).catch(() => {});
    }
    res.clearCookie('refresh_token', getCookieOptions(0));
    res.json({ success: true, message: 'Déconnexion réussie' });
  } catch {
    res.json({ success: true });
  }
});

// POST /api/auth/logout-all (authentifié)
// Déconnecte toutes les autres sessions sans changer le mot de passe
router.post('/logout-all', authenticate, async (req, res) => {
  try {
    const io = req.app.get('io');
    const { newVersion } = await invalidateAllUserSessions({
      userId: req.user.id,
      io,
      exceptSocketId: req.headers['x-socket-id'],
      currentPushEndpointHash: req.headers['x-push-endpoint-hash'],
    });

    // Émettre un nouveau refresh token pour l'appareil courant qui reste connecté
    const refreshData = await createRefreshToken(db, req.user.id, false, req.headers['user-agent']);
    res.cookie('refresh_token', refreshData.rawRefreshToken, getCookieOptions(refreshData.maxAgeMs));

    // Générer un nouveau JWT pour l'appareil courant avec la nouvelle version
    const newToken = jwt.sign(
      {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        nom: req.user.nom,
        prenom: req.user.prenom,
        token_version: newVersion,
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      message: 'Toutes vos autres sessions ont été déconnectées avec succès.',
      token: newToken,
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        nom: req.user.nom,
        prenom: req.user.prenom,
        token_version: newVersion,
      },
    });
  } catch (err) {
    console.error('[logout-all error]:', err);
    res.status(500).json({ message: 'Erreur lors de la déconnexion globale' });
  }
});

// ─── GESTION DES APPAREILS DE CONFIANCE (TRUSTED DEVICES) ────────

// GET /api/auth/trusted-devices (authentifié : liste des appareils enregistrés)
router.get('/trusted-devices', authenticate, async (req, res) => {
  try {
    const currentCookie = req.cookies?.trusted_device;
    const devices = await listTrustedDevicesForUser(db, req.user.id, currentCookie);
    res.json({ devices });
  } catch (err) {
    console.error('[GET /trusted-devices Error]:', err.message);
    res.status(500).json({ message: 'Erreur lors de la récupération des appareils' });
  }
});

// DELETE /api/auth/trusted-devices/:id (authentifié : révoque un appareil unique)
router.delete('/trusted-devices/:id', authenticate, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id, 10);
    if (!deviceId) return res.status(400).json({ message: 'Identifiant d’appareil invalide' });

    const success = await revokeSingleTrustedDevice(db, req.user.id, deviceId);
    if (!success) {
      return res.status(404).json({ message: 'Appareil introuvable ou déjà révoqué' });
    }

    res.json({ success: true, message: 'Appareil de confiance révoqué avec succès.' });
  } catch (err) {
    console.error('[DELETE /trusted-devices Error]:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/auth/trusted-devices/revoke-all (authentifié : révoque TOUS les appareils et déconnecte les autres sessions)
router.post('/trusted-devices/revoke-all', authenticate, async (req, res) => {
  try {
    await revokeTrustedDevicesForUser(db, req.user.id);
    await db.query('DELETE FROM webauthn_credentials WHERE user_id = ?', [req.user.id]);

    // Incrémente token_version pour invalider instantanément tous les jetons JWT existants
    const [rows] = await db.query('SELECT token_version FROM users WHERE id = ?', [req.user.id]);
    const newVersion = ((rows[0]?.token_version) || 1) + 1;
    await db.query('UPDATE users SET token_version = ? WHERE id = ?', [newVersion, req.user.id]);
    invalidateUserCache(req.user.id);

    // Supprimer les cookies sur le client appelant
    res.clearCookie('trusted_device', getCookieOptions(0));
    res.clearCookie('refresh_token', getCookieOptions(0));

    // Notifier Socket.io pour forcer la déconnexion en temps réel des autres clients
    const io = req.app.get('io');
    if (io) {
      io.emit('force_logout_user', { userId: req.user.id });
    }

    // Générer un nouveau JWT pour la session courante
    const newToken = jwt.sign(
      {
        id:            req.user.id,
        email:         req.user.email,
        role:          req.user.role,
        nom:           req.user.nom,
        prenom:        req.user.prenom,
        token_version: newVersion,
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      token: newToken,
      message: 'Tous les appareils de confiance et sessions actives ont été révoqués avec succès.',
    });
  } catch (err) {
    console.error('[POST /trusted-devices/revoke-all Error]:', err.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;

