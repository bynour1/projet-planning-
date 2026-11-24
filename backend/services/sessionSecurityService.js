const db = require('../config/db');
const { invalidateUserCache } = require('../middleware/auth');
const { revokeTrustedDevicesForUser } = require('../utils/trustedDevices');

/**
 * Invalide toutes les autres sessions d'un utilisateur :
 * 1. Incrémente users.token_version en base (invalide tous les JWT antérieurs)
 * 2. Révoque tous les refresh tokens existants de l'utilisateur
 * 3. Déconnecte en direct ses sockets Socket.IO ouvertes sur les autres appareils
 * 4. Supprime ses abonnements push des autres appareils
 * 5. Invalide le cache utilisateur en mémoire
 *
 * @param {Object} options
 * @param {number} options.userId - ID de l'utilisateur
 * @param {Object} [options.io] - Instance Socket.IO
 * @param {string} [options.exceptSocketId] - Socket ID de l'appareil courant à préserver
 * @param {string} [options.currentPushEndpointHash] - Hash d'endpoint push de l'appareil courant à préserver
 * @returns {Promise<{ newVersion: number }>}
 */
async function invalidateAllUserSessions({
  userId,
  io = null,
  exceptSocketId = null,
  currentPushEndpointHash = null,
}) {
  const uid = Number(userId);
  if (!uid) return { newVersion: 1 };

  // 1. Incrémenter token_version
  await db.query(
    'UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?',
    [uid]
  );
  const [rows] = await db.query('SELECT token_version FROM users WHERE id = ?', [uid]);
  const newVersion = rows && rows[0] && rows[0].token_version ? Number(rows[0].token_version) : 2;
  invalidateUserCache(uid);

  // 2. Révoquer tous les refresh tokens de l'utilisateur
  const [refreshRes] = await db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [uid]
  );
  const revokedRefreshTokens = refreshRes && refreshRes.affectedRows !== undefined ? refreshRes.affectedRows : 0;
  await revokeTrustedDevicesForUser(db, uid).catch(() => {});

  // 3. Déconnecter en direct les sockets Socket.IO ouvertes sur les autres appareils
  if (io) {
    try {
      if (typeof io.to === 'function') {
        io.to(`user:${uid}`).emit('force_logout_user', {
          userId: uid,
          exceptSocketId,
          reason: 'sessions_invalidated',
          message: 'Session expirée : votre mot de passe a été modifié ou vos sessions ont été déconnectées.',
        });
      }
      const sockets = io.sockets?.sockets;
      if (sockets) {
        const socketIterable = typeof sockets.values === 'function' ? sockets.values() : Object.values(sockets);
        for (const socket of socketIterable) {
          const sUid = socket.user?.id || socket.data?.userId;
          if (sUid && Number(sUid) === uid) {
            if (exceptSocketId && socket.id === exceptSocketId) {
              continue; // Ne pas déconnecter l'appareil courant
            }
            if (typeof socket.emit === 'function') {
              socket.emit('force_logout_user', {
                userId: uid,
                exceptSocketId,
                reason: 'sessions_invalidated',
                message: 'Session expirée : votre mot de passe a été modifié ou vos sessions ont été déconnectées.',
              });
            }
            try {
              if (typeof socket.disconnect === 'function') {
                socket.disconnect(true);
              }
            } catch (_) {}
          }
        }
      } else if (typeof io.emit === 'function') {
        io.emit('force_logout_user', {
          userId: uid,
          exceptSocketId,
          reason: 'sessions_invalidated',
        });
      }
    } catch (socketErr) {
      console.warn('[SessionSecurity] Erreur déconnexion sockets:', socketErr.message);
    }
  }

  // 4. Supprimer les abonnements push des autres appareils
  try {
    if (currentPushEndpointHash) {
      await db.query(
        'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash != ?',
        [uid, currentPushEndpointHash]
      );
    } else {
      await db.query('DELETE FROM push_subscriptions WHERE user_id = ?', [uid]);
    }
  } catch (pushErr) {
    console.warn('[SessionSecurity] Erreur suppression push_subscriptions:', pushErr.message);
  }

  return { newVersion, revokedRefreshTokens };
}

module.exports = {
  invalidateAllUserSessions,
};
