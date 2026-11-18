// tests/totp.test.js — Tests unitaires et d'intégration TOTP 2FA
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
const { authenticator } = require('otplib');
const app = require('../app');
const db = require('../config/db');
const {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  generateTotpUri,
  generateQrCodeDataUrl,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCode,
} = require('../utils/totp');

const HASH = bcrypt.hashSync('MotDePasseTest123!', 10);

const TEST_USER = {
  id: 42,
  nom: 'Ben Salah',
  prenom: 'Sami',
  email: 'sami.test@gmt-ariana.tn',
  password: HASH,
  role: 'medecin',
  is_active: 1,
  totp_enabled: 0,
  totp_secret_enc: null,
  totp_last_step: null,
  token_version: 1,
};

const ADMIN_USER = {
  id: 1,
  nom: 'Admin',
  prenom: 'Principal',
  email: 'admin.totp@gmt-ariana.tn',
  password: HASH,
  role: 'administrateur',
  is_active: 1,
  totp_enabled: 0,
  token_version: 1,
};

function makeSessionToken(user = TEST_USER) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom, token_version: 1 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function makeTemp2FAToken(userId = TEST_USER.id) {
  return jwt.sign(
    { id: userId, is_2fa_temp: true, jti: require('crypto').randomBytes(16).toString('hex') },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
}

describe('Module TOTP (utils/totp.js) — Tests unitaires', () => {
  it('Chiffre et déchiffre un secret TOTP via AES-256-GCM', () => {
    const secret = generateTotpSecret();
    const encrypted = encryptSecret(secret);
    expect(encrypted).toBeDefined();
    expect(encrypted.split(':')).toHaveLength(3); // iv:tag:ciphertext

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('Génère une URI otpauth conforme GMT Ariana', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const uri = generateTotpUri('sami@gmt-ariana.tn', secret, 'GMT Ariana');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('GMT%20Ariana');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
  });

  it('Génère un QR code Data URL base64', async () => {
    const uri = 'otpauth://totp/GMT%20Ariana:test@gmt.tn?secret=ABC';
    const dataUrl = await generateQrCodeDataUrl(uri);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('Vérifie un code valide et rejette un code invalide', () => {
    const secret = authenticator.generateSecret();
    const validCode = authenticator.generate(secret);

    const validResult = verifyTotpCode(validCode, secret);
    expect(validResult.valid).toBe(true);
    expect(validResult.timeStep).toBeDefined();

    const invalidResult = verifyTotpCode('000000', secret);
    expect(invalidResult.valid).toBe(false);
  });

  it('Rejette le rejeu d\'un code TOTP déjà utilisé au même pas', () => {
    const secret = authenticator.generateSecret();
    const validCode = authenticator.generate(secret);

    const firstCheck = verifyTotpCode(validCode, secret);
    expect(firstCheck.valid).toBe(true);

    // Tentative de rejeu avec le même step enregistré
    const replayCheck = verifyTotpCode(validCode, secret, firstCheck.timeStep);
    expect(replayCheck.valid).toBe(false);
    expect(replayCheck.replayed).toBe(true);
  });

  it('Génère 10 codes de secours de 8 caractères uniques et hachés en SHA-256', () => {
    const { rawCodes, hashedCodes } = generateBackupCodes(10);
    expect(rawCodes).toHaveLength(10);
    expect(hashedCodes).toHaveLength(10);

    for (let i = 0; i < 10; i++) {
      expect(rawCodes[i]).toHaveLength(8);
      expect(hashedCodes[i]).toHaveLength(64); // SHA-256 hex
      expect(hashBackupCode(rawCodes[i])).toBe(hashedCodes[i]);
    }
  });

  it('Sécurité Point 3 : isTotpKeyConfigured rejette les clés manquantes, non hex ou factices de .env.example', () => {
    const { isTotpKeyConfigured } = require('../utils/totp');
    const originalKey = process.env.TOTP_ENCRYPTION_KEY;

    delete process.env.TOTP_ENCRYPTION_KEY;
    expect(isTotpKeyConfigured()).toBe(false);

    process.env.TOTP_ENCRYPTION_KEY = 'cle_hex_de_64_caracteres_pour_chiffrement_aes_256_gcm_totp';
    expect(isTotpKeyConfigured()).toBe(false);

    process.env.TOTP_ENCRYPTION_KEY = 'a1b2c3d4';
    expect(isTotpKeyConfigured()).toBe(false);

    process.env.TOTP_ENCRYPTION_KEY = 'z'.repeat(64);
    expect(isTotpKeyConfigured()).toBe(false);

    process.env.TOTP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    expect(isTotpKeyConfigured()).toBe(true);

    if (originalKey) {
      process.env.TOTP_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.TOTP_ENCRYPTION_KEY;
    }
  });
});

describe('Intégration API TOTP 2FA — Routes auth & users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/2fa/setup', () => {
    it('Refuse l\'accès sans token d\'authentification (401)', async () => {
      const res = await request(app).post('/api/auth/2fa/setup');
      expect(res.status).toBe(401);
    });

    it('Génère le secret, le QR code et met à jour users.totp_secret_enc (200)', async () => {
      db.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE users

      const token = makeSessionToken(TEST_USER);
      const res = await request(app)
        .post('/api/auth/2fa/setup')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('otpauth_url');
      expect(res.body).toHaveProperty('qr_code');
      expect(res.body).toHaveProperty('manual_key');
      expect(res.body.qr_code).toMatch(/^data:image\/png;base64,/);

      // Vérifie que db.query a été appelé avec un secret chiffré (pas en clair)
      const sqlCall = db.query.mock.calls[0];
      expect(sqlCall[0]).toContain('UPDATE users SET totp_secret_enc = ?');
      expect(sqlCall[1][0]).not.toBe(res.body.manual_key); // Chiffré AES-GCM
    });
  });

  describe('POST /api/auth/2fa/enable', () => {
    it('Refuse si aucun code n\'est fourni (400)', async () => {
      const token = makeSessionToken(TEST_USER);
      const res = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('Refuse un code incorrect (400)', async () => {
      const secret = authenticator.generateSecret();
      const encSecret = encryptSecret(secret);

      db.query.mockResolvedValueOnce([[{ totp_secret_enc: encSecret, totp_enabled: 0, totp_last_step: null }]]);

      const token = makeSessionToken(TEST_USER);
      const res = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '999999' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalide/i);
    });

    it('Active la 2FA et génère 10 codes de secours pour un code valide (200)', async () => {
      const secret = authenticator.generateSecret();
      const encSecret = encryptSecret(secret);
      const validCode = authenticator.generate(secret);

      db.query
        .mockResolvedValueOnce([[{ totp_secret_enc: encSecret, totp_enabled: 0, totp_last_step: null }]]) // SELECT
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE totp_enabled = 1
        .mockResolvedValueOnce([{ affectedRows: 0 }]); // DELETE old backup codes

      // Mock 10 INSERTs for backup codes
      for (let i = 0; i < 10; i++) {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      }

      const token = makeSessionToken(TEST_USER);
      const res = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validCode });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.backup_codes).toHaveLength(10);
    });
  });

  describe('Connexion en deux étapes (POST /api/auth/login + POST /api/auth/2fa/verify)', () => {
    it('Connexion étape 1 : renvoie tempToken si totp_enabled = 1 sans créer de session complète', async () => {
      const user2FA = { ...TEST_USER, totp_enabled: 1 };
      db.query.mockResolvedValueOnce([[user2FA]]); // SELECT users

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_USER.email, password: 'MotDePasseTest123!' });

      expect(res.status).toBe(200);
      expect(res.body.requires2FA).toBe(true);
      expect(res.body).toHaveProperty('tempToken');
      expect(res.body).not.toHaveProperty('token'); // Session non créée !

      // Vérifie que tempToken est bien un jeton temporaire 2FA
      const decoded = jwt.verify(res.body.tempToken, process.env.JWT_SECRET);
      expect(decoded.is_2fa_temp).toBe(true);
      expect(decoded.id).toBe(TEST_USER.id);
    });

    it('Le tempToken ne peut pas être utilisé sur les routes authentifiées normales (401)', async () => {
      const tempToken = makeTemp2FAToken(TEST_USER.id);
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${tempToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/complet requis/i);
    });

    it('Vérifie le code TOTP avec succès et délivre la session complète 8h (200)', async () => {
      const secret = authenticator.generateSecret();
      const encSecret = encryptSecret(secret);
      const validCode = authenticator.generate(secret);
      const tempToken = makeTemp2FAToken(TEST_USER.id);

      const userInDb = {
        ...TEST_USER,
        totp_enabled: 1,
        totp_secret_enc: encSecret,
        totp_last_step: null,
      };

      db.query
        .mockResolvedValueOnce([[userInDb]]) // SELECT user
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE totp_last_step

      const res = await request(app)
        .post('/api/auth/2fa/verify')
        .send({ tempToken, code: validCode });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(TEST_USER.email);
      expect(res.body.user.totp_enabled).toBe(true);
    });

    it('Rejette le rejeu d\'un code TOTP déjà utilisé (anti-rejeu)', async () => {
      const secret = authenticator.generateSecret();
      const encSecret = encryptSecret(secret);
      const validCode = authenticator.generate(secret);
      const tempToken = makeTemp2FAToken(TEST_USER.id);

      // Calcul du pas actuel
      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const userInDb = {
        ...TEST_USER,
        totp_enabled: 1,
        totp_secret_enc: encSecret,
        totp_last_step: currentStep, // Déjà consommé pour ce pas !
      };

      db.query
        .mockResolvedValueOnce([[userInDb]]) // SELECT user
        .mockResolvedValueOnce([{ affectedRows: 0 }]); // Atomic backup code UPDATE not matching

      const res = await request(app)
        .post('/api/auth/2fa/verify')
        .send({ tempToken, code: validCode });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalide ou expiré/i);
    });

    it('Valide la connexion avec un code de secours et le marque used_at de façon ATOMIQUE (usage unique)', async () => {
      const secret = authenticator.generateSecret();
      const encSecret = encryptSecret(secret);
      const tempToken = makeTemp2FAToken(TEST_USER.id);

      const rawBackupCode = 'A9F23E1B';

      const userInDb = {
        ...TEST_USER,
        totp_enabled: 1,
        totp_secret_enc: encSecret,
        totp_last_step: null,
      };

      db.query
        .mockResolvedValueOnce([[userInDb]]) // SELECT user
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Atomic UPDATE totp_backup_codes WHERE used_at IS NULL

      const res = await request(app)
        .post('/api/auth/2fa/verify')
        .send({ tempToken, code: rawBackupCode });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(TEST_USER.email);

      // Vérifie que la mise à jour atomique a bien été appelée
      const updateCall = db.query.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE totp_backup_codes SET used_at = NOW()');
      expect(updateCall[0]).toContain('used_at IS NULL');
    });

    it('Sécurité Point 4 : Le tempToken devient inutilisable immédiatement après un succès (usage unique strict)', async () => {
      const secret = authenticator.generateSecret();
      const encSecret = encryptSecret(secret);
      const validCode = authenticator.generate(secret);
      const tempToken = makeTemp2FAToken(TEST_USER.id);

      const userInDb = {
        ...TEST_USER,
        totp_enabled: 1,
        totp_secret_enc: encSecret,
        totp_last_step: null,
      };

      // 1er appel : succès
      db.query
        .mockResolvedValueOnce([[userInDb]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      const firstRes = await request(app)
        .post('/api/auth/2fa/verify')
        .send({ tempToken, code: validCode });
      expect(firstRes.status).toBe(200);

      // 2ème appel avec le même tempToken : doit être rejeté (brûlé)
      const secondRes = await request(app)
        .post('/api/auth/2fa/verify')
        .send({ tempToken, code: validCode });
      expect(secondRes.status).toBe(400);
      expect(secondRes.body.message).toMatch(/invalide ou expiré/i);
    });
  });

  describe('POST /api/auth/2fa/disable', () => {
    it('Refuse la désactivation si le mot de passe est incorrect (401)', async () => {
      db.query.mockResolvedValueOnce([[TEST_USER]]);

      const token = makeSessionToken(TEST_USER);
      const res = await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'MauvaisMotDePasse', code: '123456' });

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/mot de passe incorrect/i);
    });

    it('Désactive la 2FA avec mot de passe et code TOTP valides (200)', async () => {
      const secret = authenticator.generateSecret();
      const encSecret = encryptSecret(secret);
      const validCode = authenticator.generate(secret);

      const userWith2FA = {
        ...TEST_USER,
        totp_enabled: 1,
        totp_secret_enc: encSecret,
      };

      db.query
        .mockResolvedValueOnce([[userWith2FA]]) // SELECT user
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE totp_enabled = 0
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE backup codes

      const token = makeSessionToken(userWith2FA);
      const res = await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'MotDePasseTest123!', code: validCode });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/users/:id/reset-2fa (Administration)', () => {
    it('Interdit l\'accès aux non-administrateurs (403)', async () => {
      const medecinToken = makeSessionToken(TEST_USER); // role: medecin
      const res = await request(app)
        .post('/api/users/42/reset-2fa')
        .set('Authorization', `Bearer ${medecinToken}`);

      expect(res.status).toBe(403);
    });

    it('Permet à un administrateur de réinitialiser la 2FA d\'un utilisateur (200)', async () => {
      const adminToken = makeSessionToken(ADMIN_USER); // role: administrateur

      db.query
        .mockResolvedValueOnce([[TEST_USER]]) // SELECT target user
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users SET totp_enabled = 0
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE backup codes

      const res = await request(app)
        .post(`/api/users/${TEST_USER.id}/reset-2fa`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Vérifie les requêtes de réinitialisation
      expect(db.query.mock.calls[1][0]).toContain('UPDATE users SET totp_enabled = 0');
      expect(db.query.mock.calls[2][0]).toContain('DELETE FROM totp_backup_codes WHERE user_id = ?');
    });

    it('Sécurité Point 6 : Empêche un administrateur de réinitialiser sa propre 2FA via reset-2fa (anti-lockout) (400)', async () => {
      const adminToken = makeSessionToken(ADMIN_USER); // id: 1
      const res = await request(app)
        .post(`/api/users/${ADMIN_USER.id}/reset-2fa`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/propre 2FA/i);
    });
  });

  describe('Protection Rate Limit (totpLimiter)', () => {
    it('Bloque après 5 tentatives avec code HTTP 429', async () => {
      process.env.TEST_RATE_LIMIT = 'true';
      const tempToken = makeTemp2FAToken(999);

      // Effectuer 5 requêtes
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/2fa/verify')
          .send({ tempToken, code: '000000' });
      }

      // La 6ème tentative doit renvoyer 429
      const res = await request(app)
        .post('/api/auth/2fa/verify')
        .send({ tempToken, code: '000000' });

      delete process.env.TEST_RATE_LIMIT;
      expect(res.status).toBe(429);
      expect(res.body.message).toMatch(/trop de tentatives/i);
    });
  });

  describe('Onboarding 2FA obligatoire (REQUIRE_2FA_ROLES)', () => {
    it('Guide l\'utilisateur vers la configuration 2FA sans session exposée, et délivre la session après enable', async () => {
      process.env.REQUIRE_2FA_ROLES = 'medecin';
      const userWithout2FA = { ...TEST_USER, totp_enabled: 0 };

      // 1. Login : renvoie requires2FASetup et tempToken (pas de token de session)
      db.query.mockResolvedValueOnce([[userWithout2FA]]);
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_USER.email, password: 'MotDePasseTest123!' });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.requires2FASetup).toBe(true);
      expect(loginRes.body).toHaveProperty('tempToken');
      expect(loginRes.body).not.toHaveProperty('token');

      const tempToken = loginRes.body.tempToken;

      // 2. Setup via tempToken : retourne le QR code
      db.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE totp_secret_enc
      const setupRes = await request(app)
        .post('/api/auth/2fa/setup')
        .send({ tempToken });

      expect(setupRes.status).toBe(200);
      expect(setupRes.body).toHaveProperty('qr_code');
      expect(setupRes.body).toHaveProperty('manual_key');

      // 3. Enable via tempToken avec code valide : active et délivre la session complète
      const secret = setupRes.body.manual_key;
      const validCode = authenticator.generate(secret);
      const encSecret = encryptSecret(secret);

      db.query
        .mockResolvedValueOnce([[{ totp_secret_enc: encSecret, totp_enabled: 0, totp_last_step: null }]]) // SELECT
        .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE totp_enabled = 1
        .mockResolvedValueOnce([{ affectedRows: 0 }]); // DELETE backup codes

      for (let i = 0; i < 10; i++) {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      }
      db.query.mockResolvedValueOnce([[userWithout2FA]]); // fresh user rows

      const enableRes = await request(app)
        .post('/api/auth/2fa/enable')
        .send({ code: validCode, tempToken });

      expect(enableRes.status).toBe(200);
      expect(enableRes.body.success).toBe(true);
      expect(enableRes.body).toHaveProperty('token'); // Session complète délivrée !
      expect(enableRes.body).toHaveProperty('backup_codes');
      expect(enableRes.body.backup_codes).toHaveLength(10);

      delete process.env.REQUIRE_2FA_ROLES;
    });
  });
});
