// tests/webauthn.test.js — Tests complets de sécurité et robustesse WebAuthn / FIDO2
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
jest.mock('@simplewebauthn/server', () => {
  const actual = jest.requireActual('@simplewebauthn/server');
  return {
    ...actual,
    verifyAuthenticationResponse: jest.fn((...args) => actual.verifyAuthenticationResponse(...args)),
    verifyRegistrationResponse: jest.fn((...args) => actual.verifyRegistrationResponse(...args)),
  };
});

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../app');
const db = require('../config/db');
const {
  getWebAuthnConfig,
  validateWebAuthnConfig,
  saveChallenge,
  consumeChallenge,
  isoBase64URL,
  CHALLENGE_TTL_MS,
} = require('../config/webauthn');

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
  token_version: 1,
  must_change_password: 0,
};

const ADMIN_USER = {
  id: 1,
  nom: 'Admin',
  prenom: 'Principal',
  email: 'admin.webauthn@gmt-ariana.tn',
  password: HASH,
  role: 'administrateur',
  is_active: 1,
  totp_enabled: 1,
  token_version: 1,
  must_change_password: 0,
};

const userToken = jwt.sign(
  { id: TEST_USER.id, email: TEST_USER.email, role: TEST_USER.role },
  process.env.JWT_SECRET || 'test_jwt_secret',
  { expiresIn: '1h' }
);

const adminToken = jwt.sign(
  { id: ADMIN_USER.id, email: ADMIN_USER.email, role: ADMIN_USER.role },
  process.env.JWT_SECRET || 'test_jwt_secret',
  { expiresIn: '1h' }
);

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockResolvedValue([[], {}]);
});

describe('WebAuthn / FIDO2 Configuration & Validation', () => {
  const oldEnv = process.env;

  beforeEach(() => {
    process.env = { ...oldEnv };
  });

  afterAll(() => {
    process.env = oldEnv;
  });

  it('accepte localhost en développement sans erreur', () => {
    process.env.NODE_ENV = 'development';
    process.env.WEBAUTHN_ORIGIN = 'http://localhost:5173';
    expect(() => validateWebAuthnConfig()).not.toThrow();
  });

  it('refuse de démarrer en production si les variables obligatoires manquent', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.WEBAUTHN_RP_ID;
    delete process.env.WEBAUTHN_RP_NAME;
    delete process.env.WEBAUTHN_ORIGIN;

    expect(() => validateWebAuthnConfig()).toThrow(/Variables obligatoires manquantes en production/);
  });

  it('refuse de démarrer en production si WEBAUTHN_ORIGIN n\'est pas en HTTPS', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEBAUTHN_RP_ID = 'planning.gmt-ariana.tn';
    process.env.WEBAUTHN_RP_NAME = 'GMT Ariana';
    process.env.WEBAUTHN_ORIGIN = 'http://planning.gmt-ariana.tn'; // HTTP non sécurisé

    expect(() => validateWebAuthnConfig()).toThrow(/doit impérativement utiliser le protocole HTTPS/);
  });

  it('valide avec succès en production si tout est configuré en HTTPS', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEBAUTHN_RP_ID = 'planning.gmt-ariana.tn';
    process.env.WEBAUTHN_RP_NAME = 'GMT Ariana';
    process.env.WEBAUTHN_ORIGIN = 'https://planning.gmt-ariana.tn';

    expect(() => validateWebAuthnConfig()).not.toThrow();
  });
});

describe('Gestion des Challenges à usage unique et TTL', () => {
  it('enregistre et consomme un challenge une seule fois', () => {
    const ch = 'unique_challenge_' + Math.random();
    saveChallenge(ch, { userId: 42, type: 'registration' });

    const consumed1 = consumeChallenge(ch);
    expect(consumed1).toBeTruthy();
    expect(consumed1.userId).toBe(42);

    // Deuxième tentative : doit retourner null car déjà consommé
    const consumed2 = consumeChallenge(ch);
    expect(consumed2).toBeNull();
  });

  it('refuse un challenge expiré (> 2 minutes)', () => {
    const ch = 'expired_challenge_' + Math.random();
    saveChallenge(ch, { userId: 42, type: 'registration' });

    // Forcer l'expiration
    const item = consumeChallenge(ch);
    expect(item).toBeTruthy();

    saveChallenge(ch, { userId: 42, type: 'registration' });
    // Manipuler l'objet pour tester l'expiration
    const realDateNow = Date.now;
    try {
      Date.now = () => realDateNow() + CHALLENGE_TTL_MS + 1000;
      const expired = consumeChallenge(ch);
      expect(expired).toBeNull();
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('Flux d\'enregistrement WebAuthn (Registration)', () => {
  it('génère des options d\'enregistrement FIDO2 pour un utilisateur authentifié', async () => {
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, transports FROM webauthn_credentials')) {
        return [[], {}];
      }
      if (sql.includes('SELECT id, email, nom, prenom FROM users')) {
        return [[TEST_USER], {}];
      }
      return [[], {}];
    });

    const res = await request(app)
      .post('/api/auth/biometric/register/options')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.challenge).toBeDefined();
    expect(res.body.rp).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.authenticatorSelection.userVerification).toBe('required');
  });

  it('refuse l\'enregistrement sans authentification (401)', async () => {
    const res = await request(app).post('/api/auth/biometric/register/options');
    expect(res.status).toBe(401);
  });

  it('refuse la vérification si les données ou le challenge sont manquants/invalides', async () => {
    const res = await request(app)
      .post('/api/auth/biometric/register/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalides/i);
  });

  it('refuse la vérification avec un challenge expiré ou déjà consommé', async () => {
    const clientDataJSON = Buffer.from(JSON.stringify({ challenge: 'unknown_or_consumed_challenge' })).toString('base64');

    const res = await request(app)
      .post('/api/auth/biometric/register/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        response: {
          response: {
            clientDataJSON,
          },
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expirée ou invalide/i);
  });
});

describe('Flux de connexion WebAuthn (Login) — Anti-énumération & Sécurité', () => {
  it('renvoie des options FIDO2 de même forme que le compte existe ou non (anti-énumération)', async () => {
    // Cas 1 : Compte inexistant
    db.query.mockResolvedValueOnce([[], {}]);
    const resInexistant = await request(app)
      .post('/api/auth/biometric/login/options')
      .send({ email: 'inconnu@gmt.tn' });

    expect(resInexistant.status).toBe(200);
    expect(resInexistant.body.challenge).toBeDefined();
    expect(resInexistant.body.allowCredentials).toHaveLength(1);
    expect(resInexistant.body.userVerification).toBe('required');

    // Cas 2 : Compte existant avec un appareil
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users')) {
        return [[TEST_USER], {}];
      }
      if (sql.includes('FROM webauthn_credentials')) {
        return [[{ id: 'cred_123', transports: JSON.stringify(['internal']) }], {}];
      }
      return [[], {}];
    });

    const resExistant = await request(app)
      .post('/api/auth/biometric/login/options')
      .send({ email: TEST_USER.email });

    expect(resExistant.status).toBe(200);
    expect(resExistant.body.challenge).toBeDefined();
    expect(resExistant.body.allowCredentials).toHaveLength(1);
    expect(resExistant.body.userVerification).toBe('required');

    // Les réponses ont la même structure
    expect(Object.keys(resInexistant.body).sort()).toEqual(Object.keys(resExistant.body).sort());
  });

  it('refuse la connexion biométrique si le challenge était factice (anti-énumération)', async () => {
    // Créer un challenge factice comme généré pour un inconnu
    const dummyChallenge = 'dummy_challenge_' + Math.random();
    saveChallenge(dummyChallenge, { dummy: true, type: 'authentication' });

    const clientDataJSON = Buffer.from(JSON.stringify({ challenge: dummyChallenge })).toString('base64');

    const res = await request(app)
      .post('/api/auth/biometric/login/verify')
      .send({
        response: {
          id: 'fake_cred',
          response: { clientDataJSON },
        },
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/non reconnus/i);
  });

  it('refuse la connexion biométrique si le compte est désactivé (is_active = 0)', async () => {
    const challenge = 'valid_challenge_' + Math.random();
    saveChallenge(challenge, { userId: TEST_USER.id, type: 'authentication' });

    const clientDataJSON = Buffer.from(JSON.stringify({ challenge })).toString('base64');

    db.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM webauthn_credentials c')) {
        return [[{
          id: 'cred_active_test',
          user_id: TEST_USER.id,
          public_key: Buffer.from('mock_public_key').toString('base64'),
          counter: 10,
          is_active: 0, // Désactivé !
        }], {}];
      }
      return [[], {}];
    });

    const res = await request(app)
      .post('/api/auth/biometric/login/verify')
      .send({
        response: {
          id: 'cred_active_test',
          response: { clientDataJSON },
        },
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/désactivé/i);
  });

  it('exige le changement de mot de passe si must_change_password=1', async () => {
    const challenge = 'change_pwd_challenge_' + Math.random();
    saveChallenge(challenge, { userId: TEST_USER.id, type: 'authentication' });

    const clientDataJSON = Buffer.from(JSON.stringify({ challenge })).toString('base64');

    // On mock la vérification FIDO2 pour ce test
    const { verifyAuthenticationResponse } = require('@simplewebauthn/server');
    verifyAuthenticationResponse.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { newCounter: 11 },
    });

    db.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM webauthn_credentials c')) {
        return [[{
          ...TEST_USER,
          u_id: TEST_USER.id,
          u_email: TEST_USER.email,
          id: 'cred_must_change',
          user_id: TEST_USER.id,
          public_key: Buffer.from('mock_pub').toString('base64'),
          counter: 10,
          is_active: 1,
          must_change_password: 1, // Changement forcé
        }], {}];
      }
      return [[], {}];
    });

    const res = await request(app)
      .post('/api/auth/biometric/login/verify')
      .send({
        response: {
          id: 'cred_must_change',
          response: { clientDataJSON },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.requiresPasswordChange).toBe(true);
    expect(res.body.tempToken).toBeDefined();

    // Vérifier que le jeton temporaire porte le flag is_first_login_temp
    const decoded = jwt.decode(res.body.tempToken);
    expect(decoded.is_first_login_temp).toBe(true);
  });
});

describe('Gestion des appareils & Révocations de sécurité', () => {
  it('liste les appareils biométriques de l\'utilisateur connecté', async () => {
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, device_name, created_at, last_used_at FROM webauthn_credentials')) {
        return [[
          { id: 'cred_1', device_name: 'iPhone 15 - Safari', created_at: new Date(), last_used_at: new Date() },
          { id: 'cred_2', device_name: 'Chrome sur Windows', created_at: new Date(), last_used_at: null },
        ], {}];
      }
      return [[], {}];
    });

    const res = await request(app)
      .get('/api/auth/biometric/credentials')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].device_name).toBe('iPhone 15 - Safari');
  });

  it('exige la confirmation du mot de passe pour retirer un appareil (action sensible)', async () => {
    // 1. Sans mot de passe
    const resNoPwd = await request(app)
      .delete('/api/auth/biometric/credentials/cred_1')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(resNoPwd.status).toBe(400);
    expect(resNoPwd.body.message).toMatch(/mot de passe actuel est requis/i);

    // 2. Avec un mauvais mot de passe
    db.query.mockResolvedValueOnce([[{ password: HASH }], {}]);
    const resWrongPwd = await request(app)
      .delete('/api/auth/biometric/credentials/cred_1')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ password: 'WrongPassword!' });

    expect(resWrongPwd.status).toBe(403);
    expect(resWrongPwd.body.message).toMatch(/incorrect/i);

    // 3. Avec le bon mot de passe
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT password FROM users')) {
        return [[{ password: HASH }], {}];
      }
      if (sql.includes('DELETE FROM webauthn_credentials')) {
        return [{ affectedRows: 1 }, {}];
      }
      return [[], {}];
    });

    const resSuccess = await request(app)
      .delete('/api/auth/biometric/credentials/cred_1')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ password: 'Password123!' });

    expect(resSuccess.status).toBe(200);
    expect(resSuccess.body.success).toBe(true);
  });

  it('permet à l\'administrateur de révoquer les biométries d\'un utilisateur (journalisé)', async () => {
    // Non-admin refusé
    const resNonAdmin = await request(app)
      .delete('/api/users/42/biometrics')
      .set('Authorization', `Bearer ${userToken}`);

    expect(resNonAdmin.status).toBe(403);

    // Admin autorisé avec log d'audit
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, email, nom, prenom FROM users WHERE id = ?')) {
        return [[TEST_USER], {}];
      }
      if (sql.includes('DELETE FROM webauthn_credentials WHERE user_id = ?')) {
        return [{ affectedRows: 2 }, {}];
      }
      return [[], {}];
    });

    const resAdmin = await request(app)
      .delete('/api/users/42/biometrics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.success).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Admin Biometric Reset] AUDIT SÉCURITÉ'));
    consoleSpy.mockRestore();
  });

  it('révoque les identifiants biométriques lors de la réinitialisation 2FA par un admin', async () => {
    let deletedWebAuthn = false;
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, email, nom, prenom, totp_enabled FROM users WHERE id = ?')) {
        return [[TEST_USER], {}];
      }
      if (sql.includes('DELETE FROM webauthn_credentials WHERE user_id = ?')) {
        deletedWebAuthn = true;
        return [{ affectedRows: 1 }, {}];
      }
      return [[], {}];
    });

    const res = await request(app)
      .post('/api/users/42/reset-2fa')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(deletedWebAuthn).toBe(true);
  });

  it('révoque les identifiants biométriques lors du clic sur "Me déconnecter partout"', async () => {
    let deletedWebAuthn = false;
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('DELETE FROM webauthn_credentials WHERE user_id = ?')) {
        deletedWebAuthn = true;
        return [{ affectedRows: 2 }, {}];
      }
      if (sql.includes('SELECT token_version FROM users')) {
        return [[{ token_version: 1 }], {}];
      }
      return [[], {}];
    });

    const res = await request(app)
      .post('/api/auth/trusted-devices/revoke-all')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(deletedWebAuthn).toBe(true);
  });
});

describe('Contrôles cryptographiques stricts (Compteur, Origine, rpID, Rejeu)', () => {
  it('refuse une signature avec compteur régressif (attaque par rejeu / clone)', async () => {
    const challenge = 'counter_regression_' + Math.random();
    saveChallenge(challenge, { userId: TEST_USER.id, type: 'authentication' });
    const clientDataJSON = Buffer.from(JSON.stringify({ challenge })).toString('base64');

    const { verifyAuthenticationResponse } = require('@simplewebauthn/server');
    verifyAuthenticationResponse.mockRejectedValueOnce(
      new Error('Response counter value 5 was less than or equal to stored counter value 10')
    );

    db.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM webauthn_credentials c')) {
        return [[{
          ...TEST_USER,
          u_id: TEST_USER.id,
          id: 'cred_regress',
          user_id: TEST_USER.id,
          public_key: Buffer.from('mock_pub').toString('base64'),
          counter: 10,
          is_active: 1,
        }], {}];
      }
      return [[], {}];
    });

    const res = await request(app)
      .post('/api/auth/biometric/login/verify')
      .send({
        response: {
          id: 'cred_regress',
          response: { clientDataJSON },
        },
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/non valide|Échec/i);
  });

  it('refuse une authentification avec une origine incorrecte (phishing)', async () => {
    const challenge = 'bad_origin_' + Math.random();
    saveChallenge(challenge, { userId: TEST_USER.id, type: 'authentication' });
    const clientDataJSON = Buffer.from(JSON.stringify({ challenge })).toString('base64');

    const { verifyAuthenticationResponse } = require('@simplewebauthn/server');
    verifyAuthenticationResponse.mockRejectedValueOnce(
      new Error('Unexpected authentication response origin "https://evil-phishing.com", expected "http://localhost:5173"')
    );

    db.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM webauthn_credentials c')) {
        return [[{
          ...TEST_USER,
          u_id: TEST_USER.id,
          id: 'cred_bad_orig',
          user_id: TEST_USER.id,
          public_key: Buffer.from('mock_pub').toString('base64'),
          counter: 5,
          is_active: 1,
        }], {}];
      }
      return [[], {}];
    });

    const res = await request(app)
      .post('/api/auth/biometric/login/verify')
      .send({
        response: {
          id: 'cred_bad_orig',
          response: { clientDataJSON },
        },
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/non valide|Échec/i);
  });

  it('refuse une authentification avec un rpId incorrect', async () => {
    const challenge = 'bad_rpid_' + Math.random();
    saveChallenge(challenge, { userId: TEST_USER.id, type: 'authentication' });
    const clientDataJSON = Buffer.from(JSON.stringify({ challenge })).toString('base64');

    const { verifyAuthenticationResponse } = require('@simplewebauthn/server');
    verifyAuthenticationResponse.mockRejectedValueOnce(
      new Error('Unexpected RP ID hash')
    );

    db.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM webauthn_credentials c')) {
        return [[{
          ...TEST_USER,
          u_id: TEST_USER.id,
          id: 'cred_bad_rpid',
          user_id: TEST_USER.id,
          public_key: Buffer.from('mock_pub').toString('base64'),
          counter: 5,
          is_active: 1,
        }], {}];
      }
      return [[], {}];
    });

    const res = await request(app)
      .post('/api/auth/biometric/login/verify')
      .send({
        response: {
          id: 'cred_bad_rpid',
          response: { clientDataJSON },
        },
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/non valide|Échec/i);
  });

  it('refuse une signature rejouée (challenge consommé dès la première tentative)', async () => {
    const challenge = 'replay_challenge_' + Math.random();
    saveChallenge(challenge, { userId: TEST_USER.id, type: 'authentication' });
    const clientDataJSON = Buffer.from(JSON.stringify({ challenge })).toString('base64');

    const { verifyAuthenticationResponse } = require('@simplewebauthn/server');
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 15 },
    });

    db.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM webauthn_credentials c')) {
        return [[{
          ...TEST_USER,
          u_id: TEST_USER.id,
          id: 'cred_replay',
          user_id: TEST_USER.id,
          public_key: Buffer.from('mock_pub').toString('base64'),
          counter: 10,
          is_active: 1,
          must_change_password: 0,
        }], {}];
      }
      return [[], {}];
    });

    // 1ère tentative : réussie
    const res1 = await request(app)
      .post('/api/auth/biometric/login/verify')
      .send({
        response: {
          id: 'cred_replay',
          response: { clientDataJSON },
        },
      });
    expect(res1.status).toBe(200);

    // 2ème tentative avec EXACTEMENT le même payload (rejeu)
    const res2 = await request(app)
      .post('/api/auth/biometric/login/verify')
      .send({
        response: {
          id: 'cred_replay',
          response: { clientDataJSON },
        },
      });
    expect(res2.status).toBe(401);
    expect(res2.body.message).toMatch(/Échec de la reconnaissance biométrique/i);
  });
});

describe('Contrôles du jeton temporaire (tempToken 15 min)', () => {
  const jti = 'jti_temp_token_test_' + Math.random();
  const tempToken = jwt.sign(
    { id: TEST_USER.id, email: TEST_USER.email, role: TEST_USER.role, is_first_login_temp: true, jti },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  it('refuse l\'accès à GET /api/auth/me avec le tempToken (403 Accès restreint)', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tempToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/changement de mot de passe requis/i);
  });

  it('refuse l\'accès à GET /api/users avec le tempToken (403 Accès restreint)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tempToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/changement de mot de passe requis/i);
  });

  it('autorise POST /api/auth/force-change-password avec le tempToken', async () => {
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, password, token_version')) {
        return [[{
          id: TEST_USER.id,
          password: HASH,
          token_version: 1,
          role: 'medecin',
          email: TEST_USER.email,
        }], {}];
      }
      return [[], {}];
    });

    const res = await request(app)
      .post('/api/auth/force-change-password')
      .set('Authorization', `Bearer ${tempToken}`)
      .send({ new_password: 'NewStrongPassword2026!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/mis à jour avec succès/i);
  });

  it('refuse une seconde tentative avec le même tempToken (usage unique strict)', async () => {
    const res = await request(app)
      .post('/api/auth/force-change-password')
      .set('Authorization', `Bearer ${tempToken}`)
      .send({ new_password: 'AnotherPassword2026!' });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expirée ou déjà utilisée/i);
  });
});

