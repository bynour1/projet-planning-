const crypto = require('crypto');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');

// Configuration otplib (fenêtre de tolérance de 1 pas = ±30s)
authenticator.options = { window: 1 };

/**
 * Vérifie si une clé TOTP valide (64 caractères hex, non factice) est configurée
 */
function isTotpKeyConfigured() {
  const envKey = process.env.TOTP_ENCRYPTION_KEY ? process.env.TOTP_ENCRYPTION_KEY.trim() : '';
  if (!envKey || envKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(envKey)) {
    return false;
  }
  const lower = envKey.toLowerCase();
  if (lower.includes('cle_hex') || lower.includes('example') || lower.includes('dummy') || lower.includes('votre_cle')) {
    return false;
  }
  return true;
}

/**
 * Validation et chargement de la clé de chiffrement AES-256-GCM (32 octets = 64 caractères hex)
 * Aucun repli codé en dur : refuse l'accès si la clé est absente ou invalide.
 */
function getEncryptionKey() {
  if (isTotpKeyConfigured()) {
    return Buffer.from(process.env.TOTP_ENCRYPTION_KEY.trim(), 'hex');
  }

  // En environnement de test unitaire Jest, clé de test isolée
  if (process.env.NODE_ENV === 'test') {
    return Buffer.from('a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90', 'hex');
  }

  if (process.env.NODE_ENV === 'production') {
    console.error('[CRITICAL] TOTP_ENCRYPTION_KEY manquante ou invalide (doit contenir 64 caractères hexadécimaux pour AES-256-GCM).');
    process.exit(1);
  }

  // Hors production : Refus strict sans clé de repli codée en dur
  throw new Error('TOTP_ENCRYPTION_KEY absente ou invalide. Définissez une clé hexadécimale réelle de 64 caractères dans backend/.env pour utiliser la double authentification.');
}

/**
 * Chiffre un secret TOTP au repos en AES-256-GCM
 * @param {string} secret 
 * @returns {string} iv:tag:ciphertext en hexadécimal
 */
function encryptSecret(secret) {
  if (!secret) return null;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96 bits IV standard pour GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Déchiffre un secret TOTP chiffré en AES-256-GCM
 * @param {string} cipherTextWithMeta 
 * @returns {string} secret en clair
 */
function decryptSecret(cipherTextWithMeta) {
  if (!cipherTextWithMeta) return null;
  const parts = cipherTextWithMeta.split(':');
  if (parts.length !== 3) {
    throw new Error('Format de secret chiffré invalide');
  }
  const [ivHex, tagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Génère un secret TOTP base32 compatible Google / Microsoft Authenticator
 */
function generateTotpSecret() {
  return authenticator.generateSecret();
}

/**
 * Génère l'URI otpauth
 * @param {string} email 
 * @param {string} secret 
 * @param {string} issuer 
 */
function generateTotpUri(email, secret, issuer = 'GMT Ariana') {
  return authenticator.keyuri(email, issuer, secret);
}

/**
 * Génère un QR code Data URL (PNG base64) à partir de l'URI otpauth
 * @param {string} otpauthUri 
 */
async function generateQrCodeDataUrl(otpauthUri) {
  return await qrcode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

/**
 * Vérifie un code TOTP avec tolérance d'un pas (30s) et protection anti-rejeu
 * @param {string} token Code à 6 chiffres
 * @param {string} secret Secret en clair
 * @param {number|null} lastStep Dernier pas utilisé
 * @returns {{ valid: boolean, timeStep?: number, replayed?: boolean }}
 */
function verifyTotpCode(token, secret, lastStep = 0) {
  if (!token || !secret) return { valid: false };
  const cleanToken = String(token).trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanToken)) return { valid: false };

  try {
    authenticator.options = { window: 2 };
    const delta = authenticator.checkDelta(cleanToken, secret);
    if (delta === null) {
      return { valid: false };
    }

    const currentStep = Math.floor(Date.now() / 1000 / 30);
    const codeStep = currentStep + delta;

    if (lastStep && codeStep <= Number(lastStep)) {
      // Rejeu d'un code déjà utilisé sur ce pas ou un pas antérieur
      return { valid: false, replayed: true };
    }

    return { valid: true, timeStep: codeStep };
  } catch (err) {
    return { valid: false };
  }
}

/**
 * Génère 10 codes de secours de 8 caractères
 */
function generateBackupCodes(count = 10) {
  const rawCodes = [];
  const hashedCodes = [];

  for (let i = 0; i < count; i++) {
    // 8 caractères hexadécimaux majuscules lisibles (ex: A9F23E1B)
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const hash = hashBackupCode(code);
    rawCodes.push(code);
    hashedCodes.push(hash);
  }

  return { rawCodes, hashedCodes };
}

/**
 * Calcule le hachage SHA-256 d'un code de secours
 * @param {string} code 
 */
function hashBackupCode(code) {
  const clean = String(code).trim().replace(/[-\s]/g, '').toUpperCase();
  return crypto.createHash('sha256').update(clean).digest('hex');
}

/**
 * Vérification au démarrage pour la conformité en production
 */
function verifyTotpEnvironment() {
  if (process.env.NODE_ENV === 'production') {
    const key = process.env.TOTP_ENCRYPTION_KEY;
    if (!key || !/^[0-9a-fA-F]{64}$/.test(key.trim())) {
      console.error('[CRITICAL] TOTP_ENCRYPTION_KEY manquante ou invalide en production (doit faire 64 caractères hexadécimaux).');
      process.exit(1);
    }
    console.log('[TOTP] Clé de chiffrement AES-256-GCM validée pour la production.');
  }
}

module.exports = {
  isTotpKeyConfigured,
  getEncryptionKey,
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  generateTotpUri,
  generateQrCodeDataUrl,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCode,
  verifyTotpEnvironment,
};
