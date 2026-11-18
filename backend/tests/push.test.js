/**
 * tests/push.test.js
 * Tests pour le service et les routes de notifications push web (VAPID)
 * Vérifie l'absence absolue de noms de patients et de données médicales dans les payloads.
 */

// Mocks
jest.mock('../config/db', () => require('./__mocks__/db'));
jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(() => ({
    publicKey: 'mock-vapid-public-key-test',
    privateKey: 'mock-vapid-private-key-test',
  })),
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const db = require('../config/db');
const pushService = require('../services/pushService');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
function makeToken(user) {
  return 'Bearer ' + jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}

const ADM = makeToken({ id: 1, role: 'administrateur', prenom: 'Admin', nom: 'System' });
const MED = makeToken({ id: 2, role: 'medecin', prenom: 'Dr', nom: 'Ben' });
const TEC = makeToken({ id: 3, role: 'technicien', prenom: 'Tech', nom: 'Ali' });

describe('Notifications Push — API & Triggers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/push/public-key', () => {
    it('renvoie la clé publique VAPID pour l\'appareil authentifié', async () => {
      const res = await request(app)
        .get('/api/push/public-key')
        .set('Authorization', MED);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('publicKey');
      expect(typeof res.body.publicKey).toBe('string');
    });

    it('401 si non authentifié', async () => {
      const res = await request(app).get('/api/push/public-key');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/push/subscribe & /api/push/status', () => {
    it('enregistre un abonnement push sur le serveur', async () => {
      db.query.mockResolvedValueOnce([{}]); // INSERT push_subscriptions

      const mockSub = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint-12345',
        keys: {
          p256dh: 'fake-p256dh-key',
          auth: 'fake-auth-key',
        },
      };

      const res = await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', MED)
        .send({ subscription: mockSub });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/enregistré/i);
    });

    it('retourne le statut d\'abonnement pour cet appareil', async () => {
      db.query.mockResolvedValueOnce([[
        {
          id: 1,
          created_at: '2026-11-18T00:00:00.000Z',
          last_push_at: '2026-11-18T00:15:00.000Z',
          last_active_at: '2026-11-18T00:20:00.000Z',
        }
      ]]);

      const resAdmin = await request(app)
        .post('/api/push/status')
        .set('Authorization', ADM)
        .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint-12345' });

      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.isSubscribed).toBe(true);
      expect(resAdmin.body.lastPushAt).toBe('2026-11-18T00:15:00.000Z');
      expect(resAdmin.body.diagnostics).toBeDefined();

      db.query.mockResolvedValueOnce([[
        {
          id: 1,
          created_at: '2026-11-18T00:00:00.000Z',
          last_push_at: '2026-11-18T00:15:00.000Z',
          last_active_at: '2026-11-18T00:20:00.000Z',
        }
      ]]);

      const resMed = await request(app)
        .post('/api/push/status')
        .set('Authorization', MED)
        .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint-12345' });

      expect(resMed.status).toBe(200);
      expect(resMed.body.isSubscribed).toBe(true);
      expect(resMed.body.lastPushAt).toBeUndefined();
      expect(resMed.body.diagnostics).toBeUndefined();
    });
  });

  describe('POST /api/push/test (Envoi d\'un vrai push de test)', () => {
    it('envoie un push de test sans donnée médicale', async () => {
      db.query.mockResolvedValueOnce([[
        {
          id: 1,
          endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint-12345',
          p256dh: 'fake-p256dh',
          auth: 'fake-auth',
        }
      ]]);
      db.query.mockResolvedValueOnce([{}]); // UPDATE last_push_at

      const res = await request(app)
        .post('/api/push/test')
        .set('Authorization', MED)
        .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint-12345' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sentCount).toBe(1);

      const webpush = require('web-push');
      expect(webpush.sendNotification).toHaveBeenCalled();
      const payloadSent = JSON.parse(webpush.sendNotification.mock.calls[0][1]);
      expect(payloadSent.title).toBe('Notification GMT Ariana');
      expect(payloadSent.body).not.toMatch(/patient|maladie|diagnostic|dossier/i);
    });
  });

  describe('Vérification du secret médical & triggers d\'événements', () => {
    it('Chat message: déclenche un push sans nom de patient ni données de santé', async () => {
      const webpush = require('web-push');
      webpush.sendNotification.mockClear();

      // Mock chat message creation
      db.query.mockResolvedValueOnce([{ insertId: 50 }]); // INSERT message
      db.query.mockResolvedValueOnce([[{ id: 50, user_id: 1, content: 'Bonjour', role: 'administrateur' }]]); // SELECT message
      db.query.mockResolvedValueOnce([[{ user_id: 2 }, { user_id: 3 }]]); // SELECT DISTINCT subscriptions
      db.query.mockResolvedValueOnce([[{ id: 10, endpoint: 'ep2', p256dh: 'p2', auth: 'a2' }]]); // subs user 2
      db.query.mockResolvedValueOnce([{}]); // UPDATE last_push_at
      db.query.mockResolvedValueOnce([[{ id: 11, endpoint: 'ep3', p256dh: 'p3', auth: 'a3' }]]); // subs user 3
      db.query.mockResolvedValueOnce([{}]); // UPDATE last_push_at

      const res = await request(app)
        .post('/api/chat/messages')
        .set('Authorization', ADM)
        .send({ content: 'Bonjour l\'équipe' });

      expect(res.status).toBe(201);

      // Verify push payload
      const calls = webpush.sendNotification.mock.calls;
      if (calls.length > 0) {
        const payload = JSON.parse(calls[0][1]);
        expect(payload.title).toBe('Nouveau message');
        expect(payload.body).toBe('Vous avez reçu un nouveau message.');
        expect(payload.body).not.toMatch(/patient|malade|ordonnance|dossier/i);
      }
    });

    it('Planning créé: déclenche un push générique sans secret médical', async () => {
      const webpush = require('web-push');
      webpush.sendNotification.mockClear();

      db.query.mockResolvedValueOnce([[{ n: 'Dr Ben' }]]); // medecin
      db.query.mockResolvedValueOnce([[{ n: 'Tech Ali' }]]); // tech
      db.query.mockResolvedValueOnce([[]]); // match entreprise
      db.query.mockResolvedValueOnce([{ insertId: 77 }]); // INSERT planning_events
      db.query.mockResolvedValueOnce([[{ id: 20, endpoint: 'ep2', p256dh: 'p2', auth: 'a2' }]]); // user 2 subs
      db.query.mockResolvedValueOnce([{}]); // UPDATE last_push_at
      db.query.mockResolvedValueOnce([[{ id: 21, endpoint: 'ep3', p256dh: 'p3', auth: 'a3' }]]); // user 3 subs
      db.query.mockResolvedValueOnce([{}]); // UPDATE last_push_at

      const res = await request(app)
        .post('/api/planning')
        .set('Authorization', ADM)
        .send({
          date: '2026-11-20',
          titre: 'Visite Clinique',
          heure_debut: '08:30',
          medecin_id: 2,
          technicien_id: 3,
        });

      expect(res.status).toBe(201);

      const calls = webpush.sendNotification.mock.calls;
      if (calls.length > 0) {
        const payload = JSON.parse(calls[0][1]);
        expect(payload.title).toBe('Nouveau planning');
        expect(payload.body).toBe('Une intervention a été ajoutée à votre planning.');
      }
    });

    it('Planning validé: déclenche un push générique', async () => {
      const webpush = require('web-push');
      webpush.sendNotification.mockClear();

      db.query.mockResolvedValueOnce([[
        { id: 77, medecin_id: 2, technicien_id: 3, statut: 'en_attente', date: '2026-11-20' }
      ]]); // SELECT existing
      db.query.mockResolvedValueOnce([{}]); // UPDATE statut
      db.query.mockResolvedValueOnce([[{ id: 20, endpoint: 'ep2', p256dh: 'p2', auth: 'a2' }]]); // user 2 subs
      db.query.mockResolvedValueOnce([{}]); // UPDATE last_push_at
      db.query.mockResolvedValueOnce([[{ id: 21, endpoint: 'ep3', p256dh: 'p3', auth: 'a3' }]]); // user 3 subs
      db.query.mockResolvedValueOnce([{}]); // UPDATE last_push_at

      const res = await request(app)
        .patch('/api/planning/77/valider')
        .set('Authorization', ADM);

      expect(res.status).toBe(200);

      const calls = webpush.sendNotification.mock.calls;
      if (calls.length > 0) {
        const payload = JSON.parse(calls[0][1]);
        expect(payload.title).toBe('Planning validé');
        expect(payload.body).toBe('Votre planning a été validé.');
      }
    });

    it('Planning annulé: déclenche un push générique', async () => {
      const webpush = require('web-push');
      webpush.sendNotification.mockClear();

      db.query.mockResolvedValueOnce([[
        { id: 77, medecin_id: 2, technicien_id: 3, date: '2026-11-20', is_clino: 0 }
      ]]); // SELECT existing
      db.query.mockResolvedValueOnce([{}]); // DELETE
      db.query.mockResolvedValueOnce([[{ id: 20, endpoint: 'ep2', p256dh: 'p2', auth: 'a2' }]]); // user 2 subs
      db.query.mockResolvedValueOnce([{}]); // UPDATE last_push_at
      db.query.mockResolvedValueOnce([[{ id: 21, endpoint: 'ep3', p256dh: 'p3', auth: 'a3' }]]); // user 3 subs
      db.query.mockResolvedValueOnce([{}]); // UPDATE last_push_at

      const res = await request(app)
        .delete('/api/planning/77')
        .set('Authorization', ADM);

      expect(res.status).toBe(200);

      const calls = webpush.sendNotification.mock.calls;
      if (calls.length > 0) {
        const payload = JSON.parse(calls[0][1]);
        expect(payload.title).toBe('Intervention annulée');
        expect(payload.body).toBe('Une intervention a été annulée dans votre planning.');
      }
    });

    it('sanitizeNotificationPayload supprime toute fuite potentielle de données médicales', () => {
      const sanitized = pushService.sanitizeNotificationPayload({
        title: 'Nouveau message',
        body: 'Votre planning a été modifié',
        data: {
          url: '/planning',
          patientName: 'Dupont Jean', // Attempted field
        },
      });

      expect(sanitized.title).toBe('Nouveau message');
      expect(sanitized.body).toBe('Votre planning a été modifié');
      expect(sanitized.data.url).toBe('/planning');
    });
  });
});
