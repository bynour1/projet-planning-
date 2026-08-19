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

// OTP : max 5 envois / 15 minutes par IP
const otpLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            5,
  message:        { message: 'Trop de demandes OTP. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// API générale : max 200 req / 1 minute
const apiLimiter = rateLimit({
  windowMs:       60 * 1000,
  max:            200,
  message:        { message: 'Trop de requêtes. Ralentissez.' },
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
  body('role').isIn(['medecin', 'technicien', 'administrateur']).withMessage('Rôle invalide'),
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
  apiLimiter,
  validateLogin,
  validateRegister,
  validatePassword,
  validateForgotPassword,
  handleValidation,
};
