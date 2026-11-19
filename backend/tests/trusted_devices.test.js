// tests/trusted_devices.test.js — Tests unitaires et d'intégration pour les Appareils de Confiance & Sessions Persistantes
jest.mock('../config/db', () => require('./__mocks__/db'));
jest.mock('../config/mailer', () => {
  const actual = jest.requireActual('../config/mailer');
  return {
    ...actual,
    sendOTP: jest.fn(),
    sendSMS: jest.fn(),
    sendPasswordReset: jest.fn(),
  };
});

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { authenticator } = require('otplib');
const app = require('../app');
const db = require('../config/db');
const {
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
} = require('../utils/trustedDevices');
const { encryptSecret } = require('../utils/totp');

const HASH = bcrypt.hashSync('Password123!', 10);

const TEST_USER = {
  id: 42,
  nom: 'Ben Salah',
  prenom: 'Sami',
  email: 'sami.test@gmt-ariana.tn',
  password: HASH,
  role: 'medecin',
  is_active: 1,
  totp_enabled: 1,
  totp_secret_enc: null,
  totp_last_step: null,
  token_version: 1,
};

const ADMIN_USER = {
  id: 1,
  nom: 'Admin',
  prenom: 'Principal',
  email: 'admin.trusted@gmt-ariana.tn',
  password: HASH,
  role: 'administrateur',
  is_active: 1,
  totp_enabled: 1,
  totp_secret_enc: null,
  totp_last_step: null,
  token_version: 1,
};

function makeSessionToken(user = TEST_USER) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom, token_version: user.token_version || 1 },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function makeTemp2FAToken(userId = TEST_USER.id) {
  return jwt.sign(
    { id: userId, is_2fa_temp: true, jti: crypto.randomBytes(16).toString('hex') },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
}

describe('Module Appareils de Confiance (utils/trustedDevices.js) — Tests unitaires', () => {
  it('hashToken génère un hash SHA-256 hexadécimal déterministe', () => {
    const raw = 'test-token-123456';
    const hash1 = hashToken(raw);
    const hash2 = hashToken(raw);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(crypto.createHash('sha256').update(raw).digest('hex'));
  });

  it('generateRandomToken génère 32 octets aléatoires en hexadécimal (64 caractères)', () => {
    const token1 = generateRandomToken();
    const token2 = generateRandomToken();
    expect(token1).toHaveLength(64);
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
  });

  it('getTrustedDeviceDurationDays applique 7 jours pour administrateur et 30 jours pour les autres rôles', () => {
    expect(getTrustedDeviceDurationDays('administrateur')).toBe(7);
    expect(getTrustedDeviceDurationDays('medecin')).toBe(30);
    expect(getTrustedDeviceDurationDays('chauffeur')).toBe(30);
    expect(getTrustedDeviceDurationDays('hse')).toBe(30);
  });

  it('parseUserAgentDevice extrait correctement le navigateur et l\'OS', () => {
    const chromeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
    expect(parseUserAgentDevice(chromeWin)).toContain('Chrome');
    expect(parseUserAgentDevice(chromeWin)).toContain('Windows');

    const safariIphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';
    expect(parseUserAgentDevice(safariIphone)).toContain('Safari');
    expect(parseUserAgentDevice(safariIphone)).toContain('iPhone');
  });

  it('getCookieOptions retourne les options sécurisées httpOnly et SameSite=Lax par défaut', () => {
    const originalSameSite = process.env.COOKIE_SAMESITE;
    delete process.env.COOKIE_SAMESITE;
    const opts = getCookieOptions(3600000);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
    expect(opts.maxAge).toBe(3600000);
    process.env.COOKIE_SAMESITE = originalSameSite || '';
  });

  it('getCookieOptions supporte COOKIE_SAMESITE=none et force secure=true (cross-domain Vercel/Render)', () => {
    const originalSameSite = process.env.COOKIE_SAMESITE;
    process.env.COOKIE_SAMESITE = 'none';
    const opts = getCookieOptions(3600000);
    expect(opts.sameSite).toBe('none');
    expect(opts.secure).toBe(true);
    expect(opts.httpOnly).toBe(true);
    process.env.COOKIE_SAMESITE = originalSameSite || '';
  });

  it('getCookieOptions supporte COOKIE_SAMESITE=strict', () => {
    const originalSameSite = process.env.COOKIE_SAMESITE;
    process.env.COOKIE_SAMESITE = 'strict';
    const opts = getCookieOptions(3600000);
    expect(opts.sameSite).toBe('strict');
    process.env.COOKIE_SAMESITE = originalSameSite || '';
  });
});

describe('Intégration API Appareils de Confiance & Sessions Persistantes', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue([[], {}]);
  });

  describe('Connexion (POST /api/auth/login) avec appareil de confiance', () => {
    it('Saute l\'étape 2FA si le cookie trusted_device est valide et non expiré pour cet utilisateur', async () => {
      const rawToken = generateRandomToken();
      const hashed = hashToken(rawToken);

      // 1. SELECT user par email
      // 2. verifyTrustedDevice : SELECT trusted_devices où token_hash correspond
      // 3. UPDATE trusted_devices SET last_used_at = NOW()
      // 4. createRefreshToken : INSERT into refresh_tokens
      db.query
        .mockResolvedValueOnce([[TEST_USER]])
        .mockResolvedValueOnce([[{ id: 10, user_id: TEST_USER.id, token_hash: hashed, expires_at: new Date(Date.now() + 10000000) }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [`trusted_device=${rawToken}`])
        .send({ email: TEST_USER.email, password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(TEST_USER.email);
      expect(res.body.trusted_device).toBe(true);
      // Vérifie qu'aucun tempToken n'est renvoyé (2FA sautée)
      expect(res.body.requires2FA).toBeUndefined();
    });

    it('Exige le 2FA si le cookie trusted_device est expiré en base de données', async () => {
      const rawToken = generateRandomToken();

      db.query
        .mockResolvedValueOnce([[TEST_USER]])
        .mockResolvedValueOnce([[]]); // aucun appareil valide

      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [`trusted_device=${rawToken}`])
        .send({ email: TEST_USER.email, password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.requires2FA).toBe(true);
      expect(res.body).toHaveProperty('tempToken');
      expect(res.body.token).toBeUndefined(); // Pas de session complète
    });

    it('Exige le 2FA si le cookie appartient à un autre compte (vol de cookie entre utilisateurs)', async () => {
      const rawToken = generateRandomToken();

      db.query
        .mockResolvedValueOnce([[TEST_USER]])
        .mockResolvedValueOnce([[]]); // Aucune correspondance pour TEST_USER.id

      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', [`trusted_device=${rawToken}`])
        .send({ email: TEST_USER.email, password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.requires2FA).toBe(true);
      expect(res.body.token).toBeUndefined();
    });
  });

  describe('Validation 2FA (POST /api/auth/2fa/verify) avec rememberDevice', () => {
    it('Crée un appareil de confiance et définit le cookie si rememberDevice = true', async () => {
      const secret = authenticator.generateSecret();
      const encSecret = encryptSecret(secret);
      const code = authenticator.generate(secret);
      const tempToken = makeTemp2FAToken(TEST_USER.id);

      const userWithSecret = {
        ...TEST_USER,
        totp_secret_enc: encSecret,
        totp_last_step: null,
      };

      // 1. SELECT user
      // 2. UPDATE totp_last_step
      // 3. createTrustedDevice (INSERT INTO trusted_devices)
      // 4. createRefreshToken (INSERT INTO refresh_tokens)
      db.query
        .mockResolvedValueOnce([[userWithSecret]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1, insertId: 77 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/auth/2fa/verify')
        .send({ tempToken, code, rememberDevice: true });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(TEST_USER.email);
      expect(res.body.trusted_device).toBe(true);

      const setCookies = res.headers['set-cookie'] || [];
      const hasTrustedCookie = setCookies.some(c => c.startsWith('trusted_device='));
      expect(hasTrustedCookie).toBe(true);
    });

    it('Ne crée pas d\'appareil de confiance si rememberDevice = false', async () => {
      const secret = authenticator.generateSecret();
      const encSecret = encryptSecret(secret);
      const code = authenticator.generate(secret);
      const tempToken = makeTemp2FAToken(TEST_USER.id);

      const userWithSecret = {
        ...TEST_USER,
        totp_secret_enc: encSecret,
        totp_last_step: null,
      };

      db.query
        .mockResolvedValueOnce([[userWithSecret]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT refresh_tokens (session normale 8h)

      const res = await request(app)
        .post('/api/auth/2fa/verify')
        .send({ tempToken, code, rememberDevice: false });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(TEST_USER.email);
      expect(res.body.trusted_device).toBe(false);

      const setCookies = res.headers['set-cookie'] || [];
      const hasTrustedCookie = setCookies.some(c => c.startsWith('trusted_device='));
      expect(hasTrustedCookie).toBe(false);
    });
  });

  describe('Révocation des appareils de confiance lors des actions critiques', () => {
    it('Changement de mot de passe (POST /api/auth/change-password) révoque tous les appareils de confiance', async () => {
      const token = makeSessionToken(TEST_USER);

      // 1. SELECT user
      // 2. UPDATE password, token_version
      // 3. DELETE FROM trusted_devices WHERE user_id = ?
      // 4. UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?
      db.query
        .mockResolvedValueOnce([[{ password: HASH, token_version: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 2 }]) // revokeTrustedDevices
        .mockResolvedValueOnce([{ affectedRows: 2 }]); // revoke refresh_tokens

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ current_password: 'Password123!', new_password: 'NewStrongPassword456!' });

      expect(res.status).toBe(200);

      const calls = db.query.mock.calls;
      const revokedTrusted = calls.some(c => typeof c[0] === 'string' && c[0].includes('DELETE FROM trusted_devices'));
      expect(revokedTrusted).toBe(true);

      const setCookies = res.headers['set-cookie'] || [];
      const clearedTrustedCookie = setCookies.some(c => c.includes('trusted_device=;'));
      expect(clearedTrustedCookie).toBe(true);
    });

    it('Désactivation du 2FA (POST /api/auth/2fa/disable) révoque tous les appareils de confiance', async () => {
      const secret = authenticator.generateSecret();
      const encSecret = encryptSecret(secret);
      const validCode = authenticator.generate(secret);
      const token = makeSessionToken(TEST_USER);

      const userWithSecret = {
        ...TEST_USER,
        password: HASH,
        totp_secret_enc: encSecret,
        totp_last_step: null,
      };

      // 1. SELECT user
      // 2. UPDATE users totp_enabled = 0
      // 3. DELETE FROM totp_backup_codes
      // 4. DELETE FROM trusted_devices
      // 5. UPDATE refresh_tokens
      db.query
        .mockResolvedValueOnce([[userWithSecret]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'Password123!', code: validCode });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const calls = db.query.mock.calls;
      const revokedTrusted = calls.some(c => typeof c[0] === 'string' && c[0].includes('DELETE FROM trusted_devices'));
      expect(revokedTrusted).toBe(true);
    });

    it('Réinitialisation 2FA par un admin (POST /api/users/:id/reset-2fa) révoque les appareils de confiance de la cible', async () => {
      const adminToken = makeSessionToken(ADMIN_USER);
      const targetUserId = 42;

      db.query
        .mockResolvedValueOnce([[{ id: targetUserId, email: 'target@gmt.tn', role: 'medecin', nom: 'Target', prenom: 'Dr' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post(`/api/users/${targetUserId}/reset-2fa`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const calls = db.query.mock.calls;
      const revokedForTarget = calls.some(
        c => typeof c[0] === 'string' && c[0].includes('DELETE FROM trusted_devices') && c[1][0] === targetUserId
      );
      expect(revokedForTarget).toBe(true);
    });
  });

  describe('Renouvellement de session persistante (POST /api/auth/refresh)', () => {
    it('Effectue une rotation du jeton de renouvellement à chaque usage et délivre un nouveau JWT', async () => {
      const oldRefreshToken = generateRandomToken();
      const oldHash = hashToken(oldRefreshToken);

      db.query
        .mockResolvedValueOnce([[
          {
            id: 55,
            uid: TEST_USER.id,
            user_id: TEST_USER.id,
            is_active: 1,
            token_hash: oldHash,
            is_trusted: 1,
            trusted_device_id: 12,
            revoked_at: null,
            expires_at: new Date(Date.now() + 10000000),
            email: TEST_USER.email,
            role: TEST_USER.role,
            nom: TEST_USER.nom,
            prenom: TEST_USER.prenom,
            token_version: 1,
            totp_enabled: 1,
          }
        ]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // revoke old
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // insert new

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${oldRefreshToken}`]);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.trusted_device).toBe(true);

      const setCookies = res.headers['set-cookie'] || [];
      const hasNewRefresh = setCookies.some(c => c.startsWith('refresh_token='));
      expect(hasNewRefresh).toBe(true);
    });

    it('Rejette le renouvellement si le refresh token a déjà été révoqué', async () => {
      const revokedToken = generateRandomToken();

      db.query.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${revokedToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expirée ou invalide/i);
    });
  });

  describe('Gestion des appareils dans Paramètres (GET, DELETE, POST /revoke-all)', () => {
    it('GET /api/auth/trusted-devices renvoie la liste avec statut is_current', async () => {
      const token = makeSessionToken(TEST_USER);
      const rawCurrentToken = generateRandomToken();
      const currentHash = hashToken(rawCurrentToken);

      db.query.mockResolvedValueOnce([[
        {
          id: 1,
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          token_hash: currentHash,
          created_at: new Date(),
          last_used_at: new Date(),
          expires_at: new Date(Date.now() + 86400000),
        },
        {
          id: 2,
          user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
          token_hash: hashToken('other-token'),
          created_at: new Date(),
          last_used_at: new Date(),
          expires_at: new Date(Date.now() + 86400000),
        }
      ]]);

      const res = await request(app)
        .get('/api/auth/trusted-devices')
        .set('Authorization', `Bearer ${token}`)
        .set('Cookie', [`trusted_device=${rawCurrentToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.devices).toHaveLength(2);
      expect(res.body.devices[0].is_current).toBe(true);
      expect(res.body.devices[1].is_current).toBe(false);
      expect(res.body.devices[0].device_name).toContain('Chrome');
      expect(res.body.devices[1].device_name).toContain('iPhone');
    });

    it('DELETE /api/auth/trusted-devices/:id révoque l\'appareil ciblé', async () => {
      const token = makeSessionToken(TEST_USER);

      db.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .delete('/api/auth/trusted-devices/1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/auth/trusted-devices/revoke-all déconnecte tous les appareils et incrémente token_version', async () => {
      const token = makeSessionToken(TEST_USER);

      db.query
        .mockResolvedValueOnce([{ affectedRows: 3 }])
        .mockResolvedValueOnce([{ affectedRows: 3 }])
        .mockResolvedValueOnce([[{ token_version: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const res = await request(app)
        .post('/api/auth/trusted-devices/revoke-all')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('token');
    });
  });

  describe('Protection stricte des actions sensibles', () => {
    it('Désactiver la 2FA refuse la requête sans mot de passe, même sur appareil de confiance', async () => {
      const token = makeSessionToken(TEST_USER);

      const res = await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/mot de passe.*requis/i);
    });

    it('Changer le mot de passe refuse si le mot de passe actuel est erroné', async () => {
      const token = makeSessionToken(TEST_USER);

      db.query.mockResolvedValueOnce([[{ password: HASH, token_version: 1 }]]);

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ current_password: 'FauxMotDePasse!', new_password: 'NouveauMotDePasse!' });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/incorrect/i);
    });
  });
});
