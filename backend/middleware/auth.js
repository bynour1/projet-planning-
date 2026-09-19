const jwt = require('jsonwebtoken');
const db  = require('../config/db');

// Verify JWT token and check if session was revoked / password changed
const authenticate = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ message: 'Token manquant' });

  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user is active and token_version is current
    const [rows] = await db.query('SELECT token_version, is_active FROM users WHERE id = ?', [decoded.id]);
    const dbUser = rows[0];
    
    if (!dbUser || !dbUser.is_active) {
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

module.exports = { authenticate, authorize };
