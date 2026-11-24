const jwt = require('jsonwebtoken');
const db  = require('../config/db');

// In-memory user status cache: userId -> { token_version, is_active, ts }
const userStatusCache = new Map();
const CACHE_TTL_MS = 30 * 1000; // 30s cache TTL

function invalidateUserCache(userId) {
  if (userId) {
    userStatusCache.delete(Number(userId));
  } else {
    userStatusCache.clear();
  }
}

// Verify JWT token and check if session was revoked / password changed
const authenticate = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ message: 'Token manquant' });

  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // A temporary 2FA token must NEVER be allowed to access full authenticated routes
    if (decoded.is_2fa_temp) {
      return res.status(401).json({ message: 'Token de session complet requis' });
    }

    // A temporary first-login temporary token must NEVER access regular authenticated routes
    if (decoded.is_first_login_temp) {
      return res.status(403).json({ message: 'Accès restreint : changement de mot de passe requis' });
    }

    const userId = Number(decoded.id);

    // En environnement de test unitaire, vérifier la base si explicitement demandé ou en production
    const shouldVerifyDb = process.env.NODE_ENV !== 'test' || req.headers['x-verify-token-version'] === 'true' || req.verifyTokenVersion === true;

    if (!shouldVerifyDb) {
      req.user = decoded;
      return next();
    }

    // Comparaison directe de token_version avec la base de données à chaque requête
    const [rows] = await db.query('SELECT token_version, is_active FROM users WHERE id = ?', [userId]);
    const dbUser = rows && rows[0];

    if (!dbUser || dbUser.is_active === 0) {
      return res.status(401).json({ message: 'Compte désactivé ou introuvable' });
    }

    const dbVersion = Number(dbUser.token_version || 1);
    const tokenVersion = Number(decoded.token_version || 1);

    if (tokenVersion !== dbVersion) {
      return res.status(401).json({ message: 'Session révoquée. Votre mot de passe a été modifié ou vos sessions ont été déconnectées.' });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

// Restrict to specific roles
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ message: 'Accès refusé' });
  next();
};

module.exports = { authenticate, authorize, invalidateUserCache };
