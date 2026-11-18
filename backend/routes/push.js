// backend/routes/push.js
// Routes API pour la gestion des notifications push et le diagnostic en temps réel

const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const pushService = require('../services/pushService');

// ── GET /api/push/public-key (Authentifié) ────────────────────────
router.get('/public-key', authenticate, (req, res) => {
  try {
    const key = pushService.getPublicKey();
    res.json({ publicKey: key });
  } catch (err) {
    res.status(500).json({ message: 'Erreur récupération clé VAPID' });
  }
});

// ── POST /api/push/subscribe (Authentifié) ───────────────────────
router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ message: 'Données de souscription invalides' });
    }
    const userAgent = req.headers['user-agent'] || '';
    await pushService.saveSubscription(req.user.id, subscription, userAgent);
    res.status(201).json({ success: true, message: 'Abonnement push enregistré sur le serveur' });
  } catch (err) {
    console.error('[Push API /subscribe] Erreur:', err.message);
    res.status(500).json({ message: 'Impossible d\'enregistrer l\'abonnement push' });
  }
});

// ── POST /api/push/unsubscribe (Authentifié) ─────────────────────
router.post('/unsubscribe', authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body;
    await pushService.removeSubscription(req.user.id, endpoint);
    res.json({ success: true, message: 'Abonnement supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors du désabonnement' });
  }
});

// ── POST /api/push/status (Authentifié) ──────────────────────────
router.post('/status', authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body;
    const status = await pushService.getSubscriptionStatus(req.user.id, endpoint);
    const isAdmin = req.user.role === 'administrateur';

    if (!isAdmin) {
      // Utilisateurs standards : aucune métadonnée technique retournée
      return res.json({
        isSubscribed: Boolean(status?.isSubscribed),
      });
    }

    // Administrateurs : métadonnées techniques de diagnostic
    res.json({
      isSubscribed: Boolean(status?.isSubscribed),
      createdAt: status?.createdAt || null,
      lastPushAt: status?.lastPushAt || null,
      diagnostics: {
        serverTime: new Date().toISOString(),
        vapidConfigured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      }
    });
  } catch (err) {
    console.error('[Push API /status] Erreur:', err.message);
    res.status(500).json({ message: 'Erreur vérification statut abonnement' });
  }
});

// ── POST /api/push/test (Authentifié) ────────────────────────────
// Envoie une VRAIE notification push depuis le serveur VAPID
router.post('/test', authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body;
    const result = await pushService.sendTestPush(req.user.id, endpoint);
    res.json(result);
  } catch (err) {
    console.error('[Push API /test] Erreur:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Échec de l\'envoi de la notification push de test.',
    });
  }
});

module.exports = router;
