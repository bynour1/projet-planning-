/**
 * trustedDevices.js — Gestion des appareils de confiance (Trusted Devices 30j / 7j)
 * et des sessions persistantes (Refresh Tokens avec rotation).
 */

const crypto = require('crypto');

/**
 * Calcule le hachage SHA-256 d'un jeton brut.
 * Le jeton en clair ne réside JAMAIS en base de données.
 */
function hashToken(token) {
  if (!token) return '';
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Génère un jeton cryptographique aléatoire de 32 octets (64 caractères hexadécimaux).
 */
function generateRandomToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Retourne la durée de confiance en jours selon le rôle :
 * 7 jours pour les administrateurs, 30 jours pour les autres utilisateurs.
 * Configurable via variables d'environnement TRUSTED_DEVICE_ADMIN_DAYS et TRUSTED_DEVICE_DAYS.
 */
function getTrustedDeviceDurationDays(role) {
  if (role === 'administrateur') {
    return parseInt(process.env.TRUSTED_DEVICE_ADMIN_DAYS, 10) || 7;
  }
  return parseInt(process.env.TRUSTED_DEVICE_DAYS, 10) || 30;
}

/**
 * Analyse une chaîne User-Agent pour fournir une désignation conviviale de l'appareil.
 */
function parseUserAgentDevice(ua) {
  if (!ua || typeof ua !== 'string') return 'Navigateur Inconnu';

  let browser = 'Navigateur Web';
  if (/edg/i.test(ua)) browser = 'Microsoft Edge';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';
  else if (/samsung/i.test(ua)) browser = 'Samsung Internet';
  else if (/chrome|crios/i.test(ua)) browser = 'Google Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';
  else if (/safari/i.test(ua)) browser = 'Apple Safari';

  let os = '';
  if (/windows phone/i.test(ua)) os = 'Windows Phone';
  else if (/win/i.test(ua)) os = 'Windows';
  else if (/iphone/i.test(ua)) os = 'iPhone';
  else if (/ipad/i.test(ua)) os = 'iPad';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/mac/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  return os ? `${browser} sur ${os}` : browser;
}

/**
 * Configuration des cookies sécurisés httpOnly, SameSite=Lax.
 */
function getCookieOptions(maxAgeMs) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}

/**
 * Enregistre un appareil de confiance pour un utilisateur donné.
 */
async function createTrustedDevice(db, userId, role, userAgent) {
  const rawToken = generateRandomToken();
  const tokenHash = hashToken(rawToken);
  const days = getTrustedDeviceDurationDays(role);
  const maxAgeMs = days * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + maxAgeMs);
  const cleanUa = userAgent ? String(userAgent).slice(0, 500) : null;

  const [res] = await db.query(
    'INSERT INTO trusted_devices (user_id, token_hash, user_agent, created_at, last_used_at, expires_at) VALUES (?, ?, ?, NOW(), NOW(), ?)',
    [userId, tokenHash, cleanUa, expiresAt]
  );

  return {
    id: res?.insertId,
    rawToken,
    expiresAt,
    maxAgeMs,
    days,
  };
}

/**
 * Vérifie si le cookie d'appareil de confiance correspond à un appareil valide et non expiré de l'utilisateur.
 * Si valide, met à jour last_used_at.
 */
async function verifyTrustedDevice(db, userId, rawToken) {
  if (!userId || !rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const [rows] = await db.query(
    'SELECT * FROM trusted_devices WHERE user_id = ? AND token_hash = ? AND expires_at > NOW()',
    [userId, tokenHash]
  );

  if (!rows || rows.length === 0) return null;

  const device = rows[0];
  const now = Date.now();
  const expiresAt = new Date(device.expires_at).getTime();
  const remainingMs = Math.max(0, expiresAt - now);

  // Mettre à jour last_used_at
  await db.query('UPDATE trusted_devices SET last_used_at = NOW() WHERE id = ?', [device.id]).catch(() => {});

  return {
    ...device,
    remainingMs,
  };
}

/**
 * Supprime tous les appareils de confiance et révoque les sessions persistantes pour un utilisateur.
 * Utilisé lors du changement de mot de passe, de la désactivation ou réinitialisation 2FA.
 */
async function revokeTrustedDevicesForUser(db, userId) {
  if (!userId) return;
  await db.query('DELETE FROM trusted_devices WHERE user_id = ?', [userId]);
  await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
}

/**
 * Supprime un appareil de confiance spécifique d'un utilisateur.
 */
async function revokeSingleTrustedDevice(db, userId, deviceId) {
  if (!userId || !deviceId) return false;
  const [res] = await db.query('DELETE FROM trusted_devices WHERE id = ? AND user_id = ?', [deviceId, userId]);
  await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE trusted_device_id = ? AND user_id = ?', [deviceId, userId]).catch(() => {});
  return (res?.affectedRows || 0) > 0;
}

/**
 * Liste les appareils de confiance actifs d'un utilisateur.
 */
async function listTrustedDevicesForUser(db, userId, currentRawToken) {
  if (!userId) return [];
  const currentHash = currentRawToken ? hashToken(currentRawToken) : null;

  const [rows] = await db.query(
    'SELECT id, user_agent, created_at, last_used_at, expires_at, token_hash FROM trusted_devices WHERE user_id = ? AND expires_at > NOW() ORDER BY last_used_at DESC',
    [userId]
  );

  return (rows || []).map(r => ({
    id: r.id,
    user_agent: r.user_agent,
    device_name: parseUserAgentDevice(r.user_agent),
    created_at: r.created_at,
    last_used_at: r.last_used_at,
    expires_at: r.expires_at,
    is_current: !!(currentHash && r.token_hash === currentHash),
  }));
}

/**
 * Crée un jeton de renouvellement de session (Refresh Token).
 * Durée : 30 jours sur appareil de confiance (7 jours admin), 8 heures sinon.
 */
async function createRefreshToken(db, userId, isTrusted, userAgent, trustedDeviceId = null) {
  const rawRefreshToken = generateRandomToken();
  const tokenHash = hashToken(rawRefreshToken);

  let maxAgeMs;
  if (isTrusted) {
    // Si l'utilisateur est admin, 7 jours, sinon 30 jours
    const [userRows] = await db.query('SELECT role FROM users WHERE id = ?', [userId]);
    const role = userRows?.[0]?.role;
    const days = getTrustedDeviceDurationDays(role);
    maxAgeMs = days * 24 * 60 * 60 * 1000;
  } else {
    maxAgeMs = 8 * 60 * 60 * 1000; // 8 heures
  }

  const expiresAt = new Date(Date.now() + maxAgeMs);
  const cleanUa = userAgent ? String(userAgent).slice(0, 500) : null;

  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, trusted_device_id, is_trusted, user_agent, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), ?)',
    [userId, tokenHash, trustedDeviceId, isTrusted ? 1 : 0, cleanUa, expiresAt]
  );

  return {
    rawRefreshToken,
    expiresAt,
    maxAgeMs,
  };
}

/**
 * Rotation d'un refresh token : révoque l'ancien et en émet un nouveau.
 * Prolonge la session tant que l'utilisateur est actif.
 */
async function rotateRefreshToken(db, rawToken, userAgent) {
  if (!rawToken) return { valid: false };

  const tokenHash = hashToken(rawToken);
  const [rows] = await db.query(
    `SELECT r.*, u.id AS uid, u.email, u.nom, u.prenom, u.role, u.is_active, u.token_version, u.totp_enabled 
     FROM refresh_tokens r 
     JOIN users u ON u.id = r.user_id 
     WHERE r.token_hash = ? AND r.revoked_at IS NULL AND r.expires_at > NOW()`,
    [tokenHash]
  );

  if (!rows || rows.length === 0) {
    return { valid: false };
  }

  const current = rows[0];
  if (!current.is_active) {
    return { valid: false, inactive: true };
  }

  // 1. Révoquer immédiatement l'ancien token (usage unique strict)
  await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [current.id]);

  // 2. Émettre un NOUVEAU refresh token (Rotation)
  const isTrusted = !!current.is_trusted;
  const days = isTrusted ? getTrustedDeviceDurationDays(current.role) : null;
  const maxAgeMs = isTrusted ? (days * 24 * 60 * 60 * 1000) : (8 * 60 * 60 * 1000);
  const newRawToken = generateRandomToken();
  const newTokenHash = hashToken(newRawToken);
  const expiresAt = new Date(Date.now() + maxAgeMs);
  const cleanUa = userAgent ? String(userAgent).slice(0, 500) : current.user_agent;

  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, trusted_device_id, is_trusted, user_agent, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), ?)',
    [current.uid, newTokenHash, current.trusted_device_id, isTrusted ? 1 : 0, cleanUa, expiresAt]
  );

  return {
    valid: true,
    user: {
      id: current.uid,
      email: current.email,
      nom: current.nom,
      prenom: current.prenom,
      role: current.role,
      token_version: current.token_version || 1,
      totp_enabled: !!current.totp_enabled,
    },
    newRefreshToken: newRawToken,
    expiresAt,
    maxAgeMs,
    isTrusted,
  };
}

module.exports = {
  hashToken,
  generateRandomToken,
  getTrustedDeviceDurationDays,
  parseUserAgentDevice,
  getCookieOptions,
  createTrustedDevice,
  verifyTrustedDevice,
  revokeTrustedDevicesForUser,
  revokeSingleTrustedDevice,
  listTrustedDevicesForUser,
  createRefreshToken,
  rotateRefreshToken,
};
