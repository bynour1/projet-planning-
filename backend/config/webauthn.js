// backend/config/webauthn.js
// Configuration et gestionnaire de challenges pour l'authentification WebAuthn / FIDO2

const { isoBase64URL } = require('@simplewebauthn/server/helpers');

/**
 * Durée de validité d'un challenge WebAuthn (2 minutes)
 */
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

/**
 * Cache mémoire pour les challenges à usage unique
 * Map<challengeString, { challenge, userId, email, type, createdAt, expiresAt }>
 */
const challengesMap = new Map();

/**
 * Nettoyage périodique des challenges expirés (toutes les 60 secondes)
 */
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, item] of challengesMap.entries()) {
    if (item.expiresAt <= now) {
      challengesMap.delete(key);
    }
  }
}, 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

function sanitizeEnvValue(val) {
  if (!val) return '';
  return String(val).trim().replace(/^["']|["']$/g, '').replace(/,+$/, '').trim();
}

function getWebAuthnConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  const rpID = sanitizeEnvValue(process.env.WEBAUTHN_RP_ID) || (isProd ? '' : 'localhost');
  const rpName = sanitizeEnvValue(process.env.WEBAUTHN_RP_NAME) || 'GMT Ariana — Santé au Travail';
  const origin = sanitizeEnvValue(process.env.WEBAUTHN_ORIGIN) || (isProd ? '' : (sanitizeEnvValue(process.env.FRONTEND_URL) || 'http://localhost:5173'));

  return { rpID, rpName, origin, isProd };
}

/**
 * Valide la configuration WebAuthn au démarrage du serveur.
 * En production, refuse de démarrer si les variables sont absentes ou si l'origine n'est pas en https.
 */
function validateWebAuthnConfig() {
  const { rpID, rpName, origin, isProd } = getWebAuthnConfig();

  if (isProd) {
    const missing = [];
    if (!process.env.WEBAUTHN_RP_ID) missing.push('WEBAUTHN_RP_ID');
    if (!process.env.WEBAUTHN_RP_NAME) missing.push('WEBAUTHN_RP_NAME');
    if (!process.env.WEBAUTHN_ORIGIN) missing.push('WEBAUTHN_ORIGIN');

    if (missing.length > 0) {
      throw new Error(`[WebAuthn] Variables obligatoires manquantes en production : ${missing.join(', ')}`);
    }

    if (!origin.startsWith('https://')) {
      throw new Error(`[WebAuthn] En production, WEBAUTHN_ORIGIN doit impérativement utiliser le protocole HTTPS : ${origin}`);
    }
  }
}

/**
 * Enregistre un challenge à usage unique avec expiration à 2 minutes
 */
function saveChallenge(challenge, metadata = {}) {
  const now = Date.now();
  challengesMap.set(challenge, {
    challenge,
    ...metadata,
    createdAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
  });
}

/**
 * Récupère ET supprime immédiatement le challenge (garantie d'usage unique absolu).
 * Si le challenge est introuvable ou expiré, renvoie null.
 */
function consumeChallenge(challenge) {
  if (!challenge) return null;
  const item = challengesMap.get(challenge);
  challengesMap.delete(challenge); // Suppression immédiate pour usage unique

  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    return null; // Expiré
  }
  return item;
}

/**
 * Supprime manuellement un challenge
 */
function clearChallenge(challenge) {
  if (challenge) challengesMap.delete(challenge);
}

module.exports = {
  getWebAuthnConfig,
  validateWebAuthnConfig,
  saveChallenge,
  consumeChallenge,
  clearChallenge,
  CHALLENGE_TTL_MS,
  isoBase64URL,
};
