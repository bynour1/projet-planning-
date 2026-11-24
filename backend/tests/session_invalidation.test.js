// tests/session_invalidation.test.js — Tests de sécurisation des sessions et invalidation transversale
jest.mock('../config/db', () => require('./__mocks__/db'));
jest.mock('../config/mailer', () => {
  const actual = jest.requireActual('../config/mailer');
  return {
    ...actual,
    sendOTP: jest.fn(),
    sendSMS: jest.fn(),
    sendPasswordReset: jest.fn(),
    sendWelcomeEmail: jest.fn().mockResolvedValue({ emailSent: true }),
  };
});

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../app');
const db = require('../config/db');
const { invalidateAllUserSessions } = require('../services/sessionSecurityService');
const { hashToken } = require('../utils/trustedDevices');

const HASH = bcrypt.hashSync('Password123!', 10);

const TEST_USER = {
  id: 42,
  nom: 'Ben Salah',
  prenom: 'Sami',
  email: 'sami.test@gmt-ariana.tn',
  password: HASH,
  role: 'medecin',
  is_active: 1,
  totp_enabled: 0,
  token_version: 1,
  must_change_password: 0,
};

const ADMIN_USER = {
  id: 1,
  nom: 'Admin',
  prenom: 'Security',
  email: 'admin.sec@gmt-ariana.tn',
  password: HASH,
  role: 'administrateur',
  is_active: 1,
  totp_enabled: 0,
  token_version: 1,
};

function createJwt(user, tokenVersion = user.token_version || 1) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      nom: user.nom,
      prenom: user.prenom,
      token_version: tokenVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

describe('Sécurité des sessions & Invalidation transversale', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue([[], {}]);
  });

  describe('1. Middleware d\'authentification & token_version', () => {
    it('refuse immédiatement (401) un JWT dont le token_version est obsolète', async () => {
      // Jeton émis avec token_version = 1
      const oldToken = createJwt(TEST_USER, 1);

      // En base de données, token_version est passé à 2
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT token_version, is_active FROM users WHERE id = ?')) {
          return [[{ is_active: 1, token_version: 2 }], {}];
        }
        return [[], {}];
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${oldToken}`)
        .set('x-verify-token-version', 'true');

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/session révoquée/i);
    });

    it('autorise (200) un JWT dont le token_version correspond à la base de données', async () => {
      const validToken = createJwt(TEST_USER, 2);

      db.query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT token_version, is_active FROM users WHERE id = ?')) {
          return [[{ is_active: 1, token_version: 2 }], {}];
        }
        if (sql.includes('SELECT id, nom, prenom, email, role, avatar, first_login, totp_enabled FROM users')) {
          return [[{ ...TEST_USER, token_version: 2 }], {}];
        }
        return [[], {}];
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`)
        .set('x-verify-token-version', 'true');

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(TEST_USER.email);
    });
  });

  describe('2. Invalidation de toutes les sessions via invalidateAllUserSessions', () => {
    it('incrémente token_version, révoque les refresh tokens et déconnecte les sockets des autres appareils', async () => {
      const mockSocket1 = { id: 'sock_1', disconnect: jest.fn() };
      const mockSocket2 = { id: 'sock_2', disconnect: jest.fn() };
      const mockIo = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
        sockets: {
          sockets: new Map([
            ['sock_1', { id: 'sock_1', data: { userId: 42 }, disconnect: mockSocket1.disconnect }],
            ['sock_2', { id: 'sock_2', data: { userId: 42 }, disconnect: mockSocket2.disconnect }],
            ['sock_3', { id: 'sock_3', data: { userId: 99 }, disconnect: jest.fn() }],
          ]),
        },
      };

      db.query.mockImplementation(async (sql) => {
        if (sql.includes('UPDATE users SET token_version =')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('SELECT token_version FROM users WHERE id = ?')) {
          return [[{ token_version: 2 }], {}];
        }
        if (sql.includes('UPDATE refresh_tokens SET revoked_at = NOW()')) {
          return [{ affectedRows: 2 }, {}];
        }
        if (sql.includes('DELETE FROM trusted_devices')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('DELETE FROM push_subscriptions')) {
          return [{ affectedRows: 1 }, {}];
        }
        return [[], {}];
      });

      const result = await invalidateAllUserSessions({
        userId: 42,
        io: mockIo,
        exceptSocketId: 'sock_1', // Socket de l'appareil courant
        currentPushEndpointHash: 'hash_curr',
      });

      expect(result.newVersion).toBe(2);
      expect(result.revokedRefreshTokens).toBe(2);

      // Vérifie l'événement socket émis aux autres appareils
      expect(mockIo.to).toHaveBeenCalledWith('user:42');

      // La socket courante 'sock_1' n'est PAS déconnectée
      expect(mockSocket1.disconnect).not.toHaveBeenCalled();
      // La socket distante 'sock_2' EST déconnectée
      expect(mockSocket2.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('3. Changement de mot de passe utilisateur (POST /api/auth/change-password)', () => {
    it('invalide les autres sessions, délivre un nouveau JWT valide et un refresh token à l\'appareil courant', async () => {
      const oldToken = createJwt(TEST_USER, 1);

      db.query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT password, token_version FROM users WHERE id = ?')) {
          return [[{ password: HASH, token_version: 1 }], {}];
        }
        if (sql.includes('UPDATE users SET token_version =')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('SELECT token_version FROM users WHERE id = ?')) {
          return [[{ token_version: 2 }], {}];
        }
        if (sql.includes('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?')) {
          return [{ affectedRows: 3 }, {}];
        }
        if (sql.includes('DELETE FROM trusted_devices WHERE user_id = ?')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('DELETE FROM push_subscriptions WHERE user_id = ?')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('UPDATE users SET password = ?, token_version = ?, first_login = 0 WHERE id = ?')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('INSERT INTO refresh_tokens')) {
          return [{ insertId: 101 }, {}];
        }
        return [[], {}];
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({
          current_password: 'Password123!',
          new_password: 'NewStrongPassword789!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();

      // Nouveau jeton décodé a token_version = 2
      const decodedNew = jwt.decode(res.body.token);
      expect(decodedNew.token_version).toBe(2);

      // Un cookie de refresh token a été émis pour l'appareil courant
      const setCookies = res.headers['set-cookie'] || [];
      const hasRefreshCookie = setCookies.some(c => c.startsWith('refresh_token='));
      expect(hasRefreshCookie).toBe(true);
    });
  });

  describe('4. Option « Me déconnecter partout » (POST /api/auth/logout-all)', () => {
    it('invalide toutes les autres sessions sans changer le mot de passe et maintient la session courante', async () => {
      const currentToken = createJwt(TEST_USER, 1);

      db.query.mockImplementation(async (sql) => {
        if (sql.includes('UPDATE users SET token_version =')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('SELECT token_version FROM users WHERE id = ?')) {
          return [[{ token_version: 2 }], {}];
        }
        if (sql.includes('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?')) {
          return [{ affectedRows: 2 }, {}];
        }
        if (sql.includes('DELETE FROM trusted_devices WHERE user_id = ?')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('DELETE FROM push_subscriptions WHERE user_id = ?')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('INSERT INTO refresh_tokens')) {
          return [{ insertId: 102 }, {}];
        }
        return [[], {}];
      });

      const res = await request(app)
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${currentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();

      const decodedNew = jwt.decode(res.body.token);
      expect(decodedNew.token_version).toBe(2);

      const setCookies = res.headers['set-cookie'] || [];
      const hasRefreshCookie = setCookies.some(c => c.startsWith('refresh_token='));
      expect(hasRefreshCookie).toBe(true);
    });
  });

  describe('5. Scénario réaliste Deux Appareils (Appareil A vs Appareil B)', () => {
    it('Appareil A change son mot de passe -> Appareil B est rejeté en 401 sur token et sur refresh', async () => {
      // ÉTAT INITIAL : Appareil A et Appareil B ont chacun un token_version = 1
      const tokenDeviceA = createJwt(TEST_USER, 1);
      const tokenDeviceB = createJwt(TEST_USER, 1);
      const rawRefreshB = 'refresh_token_device_b_hex_1234567890abcdef1234567890abcdef';

      // 1. Appareil A change son mot de passe
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT password, token_version FROM users WHERE id = ?')) {
          return [[{ password: HASH, token_version: 1 }], {}];
        }
        if (sql.includes('UPDATE users SET token_version =')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('SELECT token_version FROM users WHERE id = ?')) {
          return [[{ token_version: 2 }], {}];
        }
        if (sql.includes('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?')) {
          return [{ affectedRows: 2 }, {}]; // Révocation des refresh tokens
        }
        if (sql.includes('DELETE FROM trusted_devices WHERE user_id = ?')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('DELETE FROM push_subscriptions WHERE user_id = ?')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('UPDATE users SET password = ?, token_version = ?, first_login = 0 WHERE id = ?')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('INSERT INTO refresh_tokens')) {
          return [{ insertId: 103 }, {}];
        }
        return [[], {}];
      });

      const resChangeA = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${tokenDeviceA}`)
        .send({
          current_password: 'Password123!',
          new_password: 'BrandNewPassword123!',
        });

      expect(resChangeA.status).toBe(200);
      const newTokenDeviceA = resChangeA.body.token;

      // 2. Appareil B tente d'accéder à l'API avec son ancien token
      // La base de données contient maintenant token_version = 2
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT token_version, is_active FROM users WHERE id = ?')) {
          return [[{ is_active: 1, token_version: 2 }], {}];
        }
        return [[], {}];
      });

      const resApiDeviceB = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokenDeviceB}`)
        .set('x-verify-token-version', 'true');

      // Rejeté immédiatement avec 401
      expect(resApiDeviceB.status).toBe(401);
      expect(resApiDeviceB.body.message).toMatch(/session révoquée/i);

      // 3. Appareil B tente de renouveler son token via /api/auth/refresh
      // Le refresh token en base a revoked_at != NULL
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT r.*, u.id AS u_id')) {
          // Refresh token révoqué lors du changement de mot de passe
          return [[], {}]; // rotateRefreshToken cherche WHERE revoked_at IS NULL
        }
        return [[], {}];
      });

      const resRefreshDeviceB = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${rawRefreshB}`]);

      // Rejeté immédiatement avec 401
      expect(resRefreshDeviceB.status).toBe(401);
      expect(resRefreshDeviceB.body.message).toMatch(/session expirée/i);

      // 4. Appareil A, quant à lui, peut toujours accéder à l'API avec son nouveau token
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT token_version, is_active FROM users WHERE id = ?')) {
          return [[{ is_active: 1, token_version: 2 }], {}];
        }
        if (sql.includes('SELECT id, nom, prenom, email, role, avatar, first_login, totp_enabled FROM users')) {
          return [[{ ...TEST_USER, token_version: 2 }], {}];
        }
        return [[], {}];
      });

      const resApiDeviceA = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${newTokenDeviceA}`)
        .set('x-verify-token-version', 'true');

      expect(resApiDeviceA.status).toBe(200);
      expect(resApiDeviceA.body.email).toBe(TEST_USER.email);
    });
  });

  describe('6. Sécurisation de l\'ajout d\'une empreinte rapide (WebAuthn)', () => {
    it('conserve les clés biométriques existantes mais exige le mot de passe pour enregistrer un nouvel appareil', async () => {
      const userToken = createJwt(TEST_USER, 1);

      // Sans mot de passe -> 401
      const resNoPwd = await request(app)
        .post('/api/auth/biometric/register/options')
        .set('Authorization', `Bearer ${userToken}`)
        .send({});

      expect(resNoPwd.status).toBe(401);
      expect(resNoPwd.body.message).toMatch(/mot de passe actuel est requis/i);

      // Avec mauvais mot de passe -> 401
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('FROM users WHERE id = ?')) {
          return [[TEST_USER], {}];
        }
        return [[], {}];
      });

      const resWrongPwd = await request(app)
        .post('/api/auth/biometric/register/options')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ password: 'WrongPassword!' });

      expect(resWrongPwd.status).toBe(401);
      expect(resWrongPwd.body.message).toMatch(/incorrect/i);

      // Avec bon mot de passe -> 200 avec challenge FIDO2
      db.query.mockImplementation(async (sql) => {
        if (sql.includes('FROM users WHERE id = ?')) {
          return [[TEST_USER], {}];
        }
        if (sql.includes('SELECT id, transports FROM webauthn_credentials')) {
          return [[], {}];
        }
        return [[], {}];
      });

      const resSuccess = await request(app)
        .post('/api/auth/biometric/register/options')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ password: 'Password123!' });

      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.challenge).toBeDefined();
    });
  });

  describe('7. Invalidation lors de la réinitialisation par un admin ou désactivation de compte', () => {
    it('l\'administrateur réinitialise le mot de passe d\'un utilisateur -> ses sessions sont toutes invalidées', async () => {
      const adminToken = createJwt(ADMIN_USER, 1);
      let sessionInvalidated = false;

      db.query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM users WHERE id = ?') || sql.includes('FROM users WHERE id = ?')) {
          return [[TEST_USER], {}];
        }
        if (sql.includes('UPDATE users SET token_version =')) {
          sessionInvalidated = true;
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('SELECT token_version FROM users WHERE id = ?')) {
          return [[{ token_version: 2 }], {}];
        }
        if (sql.includes('UPDATE refresh_tokens SET revoked_at = NOW()')) {
          return [{ affectedRows: 2 }, {}];
        }
        if (sql.includes('UPDATE users')) {
          return [{ affectedRows: 1 }, {}];
        }
        return [[], {}];
      });

      const res = await request(app)
        .post('/api/users/42/reset-password')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(sessionInvalidated).toBe(true);
    });

    it('la désactivation d\'un compte utilisateur (is_active = 0) invalide immédiatement toutes ses sessions', async () => {
      const adminToken = createJwt(ADMIN_USER, 1);
      let sessionInvalidated = false;

      db.query.mockImplementation(async (sql) => {
        if (sql.includes('UPDATE users SET nom=?, prenom=?') || sql.includes('UPDATE users SET nom = ?')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('UPDATE users SET token_version =')) {
          sessionInvalidated = true;
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('SELECT token_version FROM users WHERE id = ?')) {
          return [[{ token_version: 2 }], {}];
        }
        if (sql.includes('UPDATE refresh_tokens SET revoked_at = NOW()')) {
          return [{ affectedRows: 1 }, {}];
        }
        if (sql.includes('FROM users WHERE id = ?')) {
          return [[TEST_USER], {}];
        }
        return [[], {}];
      });

      const res = await request(app)
        .put('/api/users/42')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nom: 'Ben Salah',
          prenom: 'Sami',
          email: 'sami.test@gmt-ariana.tn',
          role: 'medecin',
          is_active: 0, // Désactivation
        });

      expect(res.status).toBe(200);
      expect(sessionInvalidated).toBe(true);
    });
  });
});
