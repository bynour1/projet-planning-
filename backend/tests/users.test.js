// tests/users.test.js
jest.mock('../config/db', () => require('./__mocks__/db'));
jest.mock('../config/mailer', () => ({
  sendOTP: jest.fn().mockResolvedValue({ emailSent: true }),
  sendWelcomeEmail: jest.fn().mockResolvedValue({ emailSent: true }),
  notifyAllUsers: jest.fn().mockResolvedValue(undefined),
  planningEmailHtml: jest.fn(() => ''),
  eventEmailHtml: jest.fn(() => ''),
}));

// Mock nodemailer used directly in mailer/users
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
  })),
}));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const app     = require('../app');
const db      = require('../config/db');
const { generateTempPassword } = require('../utils/passwordGenerator');
const { sendWelcomeEmail } = require('../config/mailer');

function makeToken(role = 'administrateur', id = 1) {
  return jwt.sign(
    { id, email: 'admin.test@gmt-ariana.tn', role, nom: 'Admin', prenom: 'Sys' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const adminToken  = makeToken('administrateur', 1);
const medecinToken = makeToken('medecin', 2);

const USER_ROW = {
  id: 2,
  nom: 'Docteur',
  prenom: 'Test',
  email: 'doctor.test@gmt-ariana.tn',
  password: bcrypt.hashSync('TempPassword123!', 10),
  role: 'medecin',
  is_active: 1,
  first_login: 1,
  must_change_password: 1,
  temp_password_expires_at: new Date(Date.now() + 48 * 3600 * 1000),
  created_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockReset();
  db.query.mockResolvedValue([[], {}]);
});

// ─── 1. Test du générateur de mot de passe provisoire (14 chars sécurisés) ───
describe('Générateur de mot de passe provisoire (passwordGenerator)', () => {
  it('génère un mot de passe de 14 caractères', () => {
    const pwd = generateTempPassword(14);
    expect(pwd).toHaveLength(14);
  });

  it('contient majuscules, minuscules, chiffres et symboles', () => {
    const pwd = generateTempPassword(14);
    expect(/[A-Z]/.test(pwd)).toBe(true);
    expect(/[a-z]/.test(pwd)).toBe(true);
    expect(/[0-9]/.test(pwd)).toBe(true);
    expect(/[!@#$%*-_+=?]/.test(pwd)).toBe(true);
  });

  it('ne contient AUCUN caractère ambigu (0, O, o, l, 1, I)', () => {
    for (let i = 0; i < 50; i++) {
      const pwd = generateTempPassword(14);
      expect(pwd).not.toMatch(/[0Ol1I]/);
    }
  });
});

// ─── 2. GET /api/users ──────────────────────────────────────────
describe('GET /api/users', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('returns user list for any authenticated user', async () => {
    db.query.mockResolvedValueOnce([[USER_ROW]]);
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${medecinToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── 3. GET /api/users/by-role/:role ─────────────────────────────
describe('GET /api/users/by-role/:role', () => {
  it('returns medecins', async () => {
    db.query.mockResolvedValueOnce([[USER_ROW]]);
    const res = await request(app).get('/api/users/by-role/medecin').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body[0].role).toBe('medecin');
  });
});

// ─── 4. POST /api/users (Création de compte sécurisée) ─────────────
describe('POST /api/users (Admin only)', () => {
  it('returns 403 for non-admin', async () => {
    const res = await request(app).post('/api/users').set('Authorization', `Bearer ${medecinToken}`)
      .send({ nom:'X', prenom:'Y', email:'xy@x.com', role:'medecin' });
    expect(res.status).toBe(403);
  });

  it('returns 400 if fields missing', async () => {
    const res = await request(app).post('/api/users').set('Authorization', `Bearer ${adminToken}`)
      .send({ nom:'X' });
    expect(res.status).toBe(400);
  });

  it('returns 409 if email already exists', async () => {
    db.query.mockResolvedValueOnce([[{ id: 99 }]]); // email check
    const res = await request(app).post('/api/users').set('Authorization', `Bearer ${adminToken}`)
      .send({ nom:'X', prenom:'Y', email:'exists@x.com', role:'medecin' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/déjà/i);
  });

  it('crée l\'utilisateur, envoie l\'email de bienvenue et NE renvoie JAMAIS le mot de passe ni à l\'admin ni dans la réponse', async () => {
    db.query.mockResolvedValueOnce([[]]); // no existing email
    db.query.mockResolvedValueOnce([{ insertId: 99 }]); // INSERT user avec must_change_password=1 et 48h

    const res = await request(app).post('/api/users').set('Authorization', `Bearer ${adminToken}`)
      .send({ nom:'Dupont', prenom:'Jean', email:'jean@gmt-ariana.tn', role:'medecin' });

    expect(res.status).toBe(201);
    expect(res.body.email_sent).toBe(true);
    expect(res.body.message).toMatch(/Accès envoyé par email/i);

    // Sécurité stricte : Mot de passe et OTP ABSENTS de la réponse admin
    expect(res.body.tempPassword).toBeUndefined();
    expect(res.body.otp).toBeUndefined();
    expect(res.body.password).toBeUndefined();

    // Vérifier que l'email a bien été transmis à l'utilisateur avec un mot de passe temporaire de 14 caractères
    expect(sendWelcomeEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: 'jean@gmt-ariana.tn',
      prenom: 'Jean',
      nom: 'Dupont',
      tempPassword: expect.stringMatching(/^[A-Za-z0-9!@#$%*-_+=?]{14}$/),
    }));
  });
});

// ─── 5. POST /api/users/:id/resend-welcome ────────────────────────
describe('POST /api/users/:id/resend-welcome', () => {
  it('renvoie les accès par email, invalide l\'ancien provisoire et ne renvoie aucun mot de passe à l\'admin', async () => {
    db.query.mockResolvedValueOnce([[USER_ROW]]); // select user
    db.query.mockResolvedValueOnce([{}]); // update user
    db.query.mockResolvedValueOnce([{}]); // revoke trusted devices
    db.query.mockResolvedValueOnce([{}]); // delete refresh tokens

    const res = await request(app).post('/api/users/2/resend-welcome').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // Ne renvoie JAMAIS le mot de passe
    expect(res.body.tempPassword).toBeUndefined();
    expect(res.body.otp).toBeUndefined();
    expect(res.body.password).toBeUndefined();
    expect(res.body.email_sent).toBe(true);
    expect(res.body.message).toMatch(/Accès envoyé par email/i);

    expect(sendWelcomeEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: USER_ROW.email,
      tempPassword: expect.stringMatching(/^[A-Za-z0-9!@#$%*-_+=?]{14}$/),
    }));
  });
});

// ─── 6. POST /api/users/:id/reset-password ────────────────────────
describe('POST /api/users/:id/reset-password', () => {
  it('réinitialise le mot de passe sans le divulguer dans la réponse', async () => {
    db.query.mockResolvedValueOnce([[USER_ROW]]); // select user
    db.query.mockResolvedValueOnce([{}]); // update user
    db.query.mockResolvedValueOnce([{}]); // revoke trusted
    db.query.mockResolvedValueOnce([{}]); // delete refresh tokens

    const res = await request(app).post('/api/users/2/reset-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'CustomPassword123!' });

    expect(res.status).toBe(200);
    expect(res.body.tempPassword).toBeUndefined();
    expect(res.body.password).toBeUndefined();
    expect(res.body.message).toMatch(/Accès envoyé par email|réinitialisé/i);
  });
});

// ─── 7. Tests du flux complet de connexion avec mot de passe provisoire ──
describe('Flux de première connexion & mot de passe provisoire', () => {
  const plainTemp = 'Sec#7492Abcd!x';
  const hashedTemp = bcrypt.hashSync(plainTemp, 10);

  it('refuse la connexion si le mot de passe provisoire a expiré (> 48h)', async () => {
    const expiredUser = {
      ...USER_ROW,
      password: hashedTemp,
      must_change_password: 1,
      temp_password_expires_at: new Date(Date.now() - 3600 * 1000), // Expiré il y a 1h
    };

    db.query.mockResolvedValueOnce([[expiredUser]]);

    const res = await request(app).post('/api/auth/login')
      .send({ email: expiredUser.email, password: plainTemp });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expiré|renouveler/i);
  });

  it('si must_change_password=1 et non expiré : délivre UNIQUEMENT un token temporaire restreint', async () => {
    const activeTempUser = {
      ...USER_ROW,
      password: hashedTemp,
      must_change_password: 1,
      temp_password_expires_at: new Date(Date.now() + 24 * 3600 * 1000), // Valable 24h
    };

    db.query.mockResolvedValueOnce([[activeTempUser]]);

    const res = await request(app).post('/api/auth/login')
      .send({ email: activeTempUser.email, password: plainTemp });

    expect(res.status).toBe(200);
    expect(res.body.requiresPasswordChange).toBe(true);
    expect(res.body.tempToken).toBeDefined();

    // Vérifier que le token temporaire est bien restreint avec is_first_login_temp
    const decoded = jwt.decode(res.body.tempToken);
    expect(decoded.is_first_login_temp).toBe(true);
  });

  it('le jeton temporaire de première connexion est REFUSÉ sur les routes normales (ex: GET /api/users)', async () => {
    const tempToken = jwt.sign(
      { id: USER_ROW.id, email: USER_ROW.email, role: USER_ROW.role, is_first_login_temp: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const res = await request(app).get('/api/users')
      .set('Authorization', `Bearer ${tempToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/restreint|changement de mot de passe/i);
  });

  it('POST /api/auth/force-change-password refuse si le nouveau mot de passe est identique au provisoire', async () => {
    const tempToken = jwt.sign(
      { id: USER_ROW.id, email: USER_ROW.email, role: USER_ROW.role, is_first_login_temp: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Mock query user for current password comparison
    db.query.mockResolvedValueOnce([[{ ...USER_ROW, password: hashedTemp }]]);

    const res = await request(app).post('/api/auth/force-change-password')
      .set('Authorization', `Bearer ${tempToken}`)
      .send({ new_password: plainTemp });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/différent/i);
  });

  it('POST /api/auth/force-change-password refuse si le nouveau mot de passe fait moins de 8 caractères', async () => {
    const tempToken = jwt.sign(
      { id: USER_ROW.id, email: USER_ROW.email, role: USER_ROW.role, is_first_login_temp: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const res = await request(app).post('/api/auth/force-change-password')
      .set('Authorization', `Bearer ${tempToken}`)
      .send({ new_password: 'Short1' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/8 caractères/i);
  });

  it('POST /api/auth/force-change-password valide le nouveau mot de passe, remet must_change_password=0 et délivre la session', async () => {
    const tempToken = jwt.sign(
      { id: USER_ROW.id, email: USER_ROW.email, role: USER_ROW.role, is_first_login_temp: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const newPassword = 'MyNewStrongPass2026!';

    db.query.mockResolvedValueOnce([[{ ...USER_ROW, password: hashedTemp, token_version: 1 }]]); // SELECT user
    db.query.mockResolvedValueOnce([{}]); // UPDATE users
    db.query.mockResolvedValueOnce([{}]); // revoke trusted devices
    db.query.mockResolvedValueOnce([{}]); // delete refresh tokens
    db.query.mockResolvedValueOnce([{}]); // insert new refresh token

    const res = await request(app).post('/api/auth/force-change-password')
      .set('Authorization', `Bearer ${tempToken}`)
      .send({ new_password: newPassword });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.first_login).toBe(false);
    expect(res.body.user.must_change_password).toBe(false);

    // Vérifier que le nouveau token est un vrai token de session sans restriction
    const decoded = jwt.decode(res.body.token);
    expect(decoded.is_first_login_temp).toBeUndefined();
  });
});
