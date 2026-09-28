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
    
    // In test environment, skip DB queries for fast unit testing
    if (process.env.NODE_ENV === 'test') {
      req.user = decoded;
      return next();
    }

    const userId = Number(decoded.id);

    // Fast-path: Check memory cache first
    const now = Date.now();
    let dbUser = userStatusCache.get(userId);

    if (!dbUser || (now - dbUser.ts > CACHE_TTL_MS)) {
      const [rows] = await db.query('SELECT token_version, is_active FROM users WHERE id = ?', [userId]);
      if (!rows[0]) {
        return res.status(401).json({ message: 'Compte désactivé ou introuvable' });
      }
      dbUser = { token_version: rows[0].token_version, is_active: rows[0].is_active, ts: now };
      userStatusCache.set(userId, dbUser);
    }
    
    if (!dbUser.is_active) {
      return res.status(401).json({ message: 'Compte désactivé ou introuvable' });
    }
    
    // If token has a version and doesn't match DB token_version (because password was changed), reject!
    if (decoded.token_version !== undefined && dbUser.token_version !== null && dbUser.token_version !== decoded.token_version) {
      return res.status(401).json({ message: 'Mot de passe modifié. Session expirée sur cet appareil.' });
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
