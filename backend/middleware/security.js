const rateLimit  = require('express-rate-limit');
const helmet     = require('helmet');
const { body, validationResult } = require('express-validator');

// ─── Helmet — HTTP Security Headers ──────────────────────────
const helmetMiddleware = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // désactivé car API REST
});

// ─── Rate Limiters ────────────────────────────────────────────

// Login : max 10 tentatives / 15 minutes par IP
const loginLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            10,
  message:        { message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
});

// OTP : max 15 vérifications / 15 minutes par IP et par compte (adapté aux réseaux partagés de cliniques)
const otpLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            15,
  keyGenerator: (req) => {
    const identifier = (req.body?.email || req.body?.identifier || req.body?.userId || '').trim().toLowerCase();
    return `${req.ip}_${identifier}`;
  },
  message:        { message: 'Trop de demandes de vérification pour ce compte. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Emails : max 5 demandes / 15 minutes par IP et par adresse email
const emailRateLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            5,
  keyGenerator: (req) => {
    const email = (req.body?.email || req.body?.identifier || '').trim().toLowerCase();
    return `${req.ip}_${email}`;
  },
  message:        { message: 'Trop de demandes pour cette adresse ou depuis cette IP. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// TOTP 2FA Verify (Route publique) : rate limit STRICT par userId extrait du tempToken signé
// Ne JAMAIS utiliser req.body.userId qui peut être falsifié par un attaquant
const jwt = require('jsonwebtoken');
const totpVerifyLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            5,
  skip:           () => process.env.NODE_ENV === 'test' && !process.env.TEST_RATE_LIMIT,
  keyGenerator: (req) => {
    if (req.body?.tempToken) {
      try {
        const decoded = jwt.verify(req.body.tempToken, process.env.JWT_SECRET);
        if (decoded?.id && decoded.is_2fa_temp) {
          return `totp_verify_user_${decoded.id}`;
        }
      } catch {}
    }
    // Si pas de tempToken valide ou altéré : bloquer par IP
    return `totp_verify_ip_${req.ip}`;
  },
  message:        { message: 'Trop de tentatives de vérification 2FA (5/5). Compte bloqué pour 15 minutes.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// TOTP 2FA Actions authentifiées (setup, enable, disable) : rate limit par userId (req.user.id)
const totpUserActionLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            5,
  skip:           () => process.env.NODE_ENV === 'test' && !process.env.TEST_RATE_LIMIT,
  keyGenerator: (req) => {
    return req.user?.id ? `totp_action_user_${req.user.id}` : `totp_action_ip_${req.ip}`;
  },
  message:        { message: 'Trop de requêtes 2FA pour ce compte. Veuillez patienter 15 minutes.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Alias pour compatibilité
const totpLimiter = totpVerifyLimiter;

// API générale : max 200 req / 1 minute
const apiLimiter = rateLimit({
  windowMs:       60 * 1000,
  max:            200,
  message:        { message: 'Trop de requêtes. Ralentissez.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// WebAuthn Options : max 20 demandes / 15 minutes par IP et par compte
const webauthnOptionsLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            20,
  skip:           () => process.env.NODE_ENV === 'test' && !process.env.TEST_RATE_LIMIT,
  keyGenerator: (req) => {
    const ident = (req.body?.email || req.user?.email || '').trim().toLowerCase();
    return `${req.ip}_${ident}`;
  },
  message:        { message: 'Trop de demandes de session biométrique. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// WebAuthn Verify : max 10 tentatives / 15 minutes par IP et par compte
const webauthnVerifyLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            10,
  skip:           () => process.env.NODE_ENV === 'test' && !process.env.TEST_RATE_LIMIT,
  keyGenerator: (req) => {
    const ident = (req.body?.email || req.user?.email || '').trim().toLowerCase();
    return `${req.ip}_${ident}`;
  },
  message:        { message: 'Trop de tentatives de vérification biométrique. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ─── Input Validators ─────────────────────────────────────────

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Mot de passe requis'),
];

const validateRegister = [
  body('nom').trim().notEmpty().isLength({ max: 100 }).withMessage('Nom requis (max 100 car.)'),
  body('prenom').trim().notEmpty().isLength({ max: 100 }).withMessage('Prénom requis'),
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('role').isIn(['medecin', 'technicien', 'administrateur', 'chauffeur', 'hse']).withMessage('Rôle invalide'),
];

const validatePassword = [
  body('new_password')
    .isLength({ min: 8 })
    .matches(/[A-Z]/).withMessage('Au moins une majuscule')
    .matches(/[0-9]/).withMessage('Au moins un chiffre')
    .withMessage('Mot de passe : min 8 car., 1 majuscule, 1 chiffre'),
];

const validateForgotPassword = [
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
];

// ─── Validation result handler ────────────────────────────────
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      message: errors.array()[0].msg,
      errors:  errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

module.exports = {
  helmetMiddleware,
  loginLimiter,
  otpLimiter,
  totpLimiter,
  totpVerifyLimiter,
  totpUserActionLimiter,
  emailRateLimiter,
  webauthnOptionsLimiter,
  webauthnVerifyLimiter,
  apiLimiter,
  validateLogin,
  validateRegister,
  validatePassword,
  validateForgotPassword,
  handleValidation,
};
