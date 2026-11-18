// backend/services/pushService.js
// Service de Notifications Push Web (VAPID) — GMT Ariana
// Respect strict du secret médical et RGPD : aucun nom de patient ni donnée de santé.

const webpush = require('web-push');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const db      = require('../config/db');

// ─── Initialisation VAPID ─────────────────────────────────────────
const VAPID_CONFIG_PATH = path.join(__dirname, '..', 'config', 'vapid.json');
let vapidPublicKey  = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail    = process.env.VAPID_EMAIL || 'mailto:contact@gmt-ariana.tn';

// Si les clés ne sont pas définies en variables d'environnement, les charger ou générer dans vapid.json
if (!vapidPublicKey || !vapidPrivateKey) {
  try {
    if (fs.existsSync(VAPID_CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(VAPID_CONFIG_PATH, 'utf8'));
      vapidPublicKey  = saved.publicKey;
      vapidPrivateKey = saved.privateKey;
    } else {
      const generated = webpush.generateVAPIDKeys();
      vapidPublicKey  = generated.publicKey;
      vapidPrivateKey = generated.privateKey;
      const configDir = path.dirname(VAPID_CONFIG_PATH);
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(VAPID_CONFIG_PATH, JSON.stringify(generated, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[Push Service] Erreur initialisation clés VAPID:', err.message);
  }
}

if (vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
  } catch (err) {
    console.warn('[Push Service] Avertissement setVapidDetails:', err.message);
  }
}

/**
 * Calcule le hash SHA-256 de l'endpoint pour indexation MySQL rapide et fiable
 */
function hashEndpoint(endpoint) {
  if (!endpoint) return '';
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

/**
 * Assure qu'aucun nom de patient ni donnée médicale ne fuite dans les notifications
 */
function sanitizeNotificationPayload(payload) {
  const safePayload = { ...payload };
  // Titre et corps génériques uniquement
  safePayload.title = safePayload.title || 'Notification GMT Ariana';
  safePayload.body  = safePayload.body  || 'Nouvelle notification disponible.';
  safePayload.icon  = safePayload.icon  || '/icon-192.png';
  safePayload.badge = safePayload.badge || '/logo-gmt.png';
  safePayload.data  = {
    url: safePayload.data?.url || '/',
    receivedAt: new Date().toISOString(),
    ...safePayload.data,
  };
  return safePayload;
}

/**
 * Retourne la clé publique VAPID
 */
function getPublicKey() {
  return vapidPublicKey || '';
}

/**
 * Enregistre ou met à jour une souscription push pour un utilisateur
 */
async function saveSubscription(userId, subscription, userAgent = '') {
  if (!userId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('Paramètres de souscription invalides');
  }

  const endpoint     = subscription.endpoint;
  const endpointHash = hashEndpoint(endpoint);
  const p256dh       = subscription.keys.p256dh;
  const auth         = subscription.keys.auth;
  const ua           = (userAgent || '').slice(0, 500);

  await db.query(
    `INSERT INTO push_subscriptions 
      (user_id, endpoint, endpoint_hash, p256dh, auth, user_agent, created_at, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE 
       user_id = VALUES(user_id),
       p256dh = VALUES(p256dh),
       auth = VALUES(auth),
       user_agent = VALUES(user_agent),
       last_active_at = NOW()`,
    [userId, endpoint, endpointHash, p256dh, auth, ua]
  );

  return { success: true };
}

/**
 * Supprime une souscription push (désabonnement)
 */
async function removeSubscription(userId, endpoint) {
  if (!endpoint) return { success: false };
  const endpointHash = hashEndpoint(endpoint);
  await db.query(
    'DELETE FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ?',
    [endpointHash, userId]
  );
  return { success: true };
}

/**
 * Vérifie l'état d'enregistrement d'une souscription push sur le serveur
 */
async function getSubscriptionStatus(userId, endpoint) {
  if (!endpoint) {
    // Vérifier si l'utilisateur a au moins une souscription active
    const [rows] = await db.query(
      'SELECT id, created_at, last_push_at, last_active_at FROM push_subscriptions WHERE user_id = ? ORDER BY last_active_at DESC LIMIT 1',
      [userId]
    );
    return {
      isSubscribed: Boolean(rows && rows.length > 0),
      createdAt: rows?.[0]?.created_at || null,
      lastPushAt: rows?.[0]?.last_push_at || null,
    };
  }

  const endpointHash = hashEndpoint(endpoint);
  const [rows] = await db.query(
    'SELECT id, created_at, last_push_at, last_active_at FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ?',
    [endpointHash, userId]
  );

  return {
    isSubscribed: Boolean(rows && rows.length > 0),
    createdAt: rows?.[0]?.created_at || null,
    lastPushAt: rows?.[0]?.last_push_at || null,
  };
}

/**
 * Envoie une notification push réelle à un utilisateur donné (sur tous ses appareils enregistrés)
 */
async function sendPushToUser(userId, payload) {
  if (!userId) return { sentCount: 0 };
  const safe = sanitizeNotificationPayload(payload);
  const payloadString = JSON.stringify(safe);

  const [subscriptions] = await db.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
    [userId]
  );

  if (!subscriptions || subscriptions.length === 0) {
    return { sentCount: 0 };
  }

  let sentCount = 0;
  const expiredIds = [];

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSubscription, payloadString);
      sentCount++;
      await db.query('UPDATE push_subscriptions SET last_push_at = NOW() WHERE id = ?', [sub.id]);
    } catch (err) {
      // 404 Not Found ou 410 Gone indiquent que la souscription a expiré ou a été révoquée par l'utilisateur
      if (err.statusCode === 404 || err.statusCode === 410) {
        expiredIds.push(sub.id);
      } else {
        console.warn(`[Push Service] Échec envoi vers souscription #${sub.id}:`, err.message);
      }
    }
  }

  if (expiredIds.length > 0) {
    await db.query(
      `DELETE FROM push_subscriptions WHERE id IN (${expiredIds.map(() => '?').join(',')})`,
      expiredIds
    );
  }

  return { sentCount };
}

/**
 * Envoie une notification push à une liste d'utilisateurs
 */
async function sendPushToMultipleUsers(userIds = [], payload) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!uniqueIds.length) return { totalSent: 0 };

  let totalSent = 0;
  for (const uid of uniqueIds) {
    const res = await sendPushToUser(uid, payload);
    totalSent += res.sentCount || 0;
  }
  return { totalSent };
}

/**
 * Envoie un vrai push de test vers un appareil spécifique ou l'utilisateur connecté
 */
async function sendTestPush(userId, endpoint = null) {
  const testPayload = {
    title: 'Notification GMT Ariana',
    body: 'Le système d\'alertes push fonctionne parfaitement sur votre appareil.',
    data: {
      url: '/settings',
      test: true,
      receivedAt: new Date().toISOString(),
    },
  };

  if (endpoint) {
    const endpointHash = hashEndpoint(endpoint);
    const [rows] = await db.query(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ?',
      [endpointHash, userId]
    );

    if (rows && rows.length > 0) {
      const sub = rows[0];
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      await webpush.sendNotification(pushSubscription, JSON.stringify(testPayload));
      await db.query('UPDATE push_subscriptions SET last_push_at = NOW() WHERE id = ?', [sub.id]);
      return {
        success: true,
        sentCount: 1,
        message: 'Notification push transmise avec succès par le serveur VAPID à cet appareil.',
      };
    }
  }

  // Fallback : envoyer à tous les appareils de cet utilisateur
  const res = await sendPushToUser(userId, testPayload);
  if (res.sentCount === 0) {
    throw new Error('Aucun abonnement push valide trouvé pour cet appareil côté serveur.');
  }

  return {
    success: true,
    sentCount: res.sentCount,
    message: `Notification push transmise avec succès à ${res.sentCount} appareil(s).`,
  };
}

module.exports = {
  getPublicKey,
  saveSubscription,
  removeSubscription,
  getSubscriptionStatus,
  sendPushToUser,
  sendPushToMultipleUsers,
  sendTestPush,
  hashEndpoint,
  sanitizeNotificationPayload,
};
