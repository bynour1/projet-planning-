// tests/auth.test.js
jest.mock('../config/db', () => require('./__mocks__/db'));
jest.mock('../config/mailer', () => ({
  sendOTP: jest.fn(), sendPasswordReset: jest.fn(),
  notifyAllUsers: jest.fn(), planningEmailHtml: jest.fn(() => ''),
  eventEmailHtml: jest.fn(() => ''),
}));

const request = require('supertest');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const app     = require('../app');
const db      = require('../config/db');

const HASH = bcrypt.hashSync('TestAuthSecretPass123!', 10);

const ADMIN = {
  id: 1, nom: 'Admin', prenom: 'Système', email: 'admin.test@gmt-ariana.tn',
  password: HASH, role: 'administrateur', is_active: 1, first_login: 0,
};

function makeToken(user = ADMIN) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, nom: user.nom, prenom: user.prenom },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// ─── Health check ──────────────────────────────────────────────
describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ─── POST /api/auth/login ──────────────────────────────────────
describe('POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 if fields missing', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@a.com' });
    expect(res.status).toBe(400);
  });

  it('returns 401 if user not found', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com', password: '123' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/incorrect/i);
  });

  it('returns 403 if account inactive', async () => {
    db.query.mockResolvedValueOnce([[{ ...ADMIN, is_active: 0 }]]);
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'TestAuthSecretPass123!' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/activé/i);
  });

  it('returns 401 if wrong password', async () => {
    db.query.mockResolvedValueOnce([[ADMIN]]);
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns token on valid login', async () => {
    db.query.mockResolvedValueOnce([[ADMIN]]);
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'TestAuthSecretPass123!' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.role).toBe('administrateur');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('returns first_login flag correctly', async () => {
    db.query.mockResolvedValueOnce([[{ ...ADMIN, first_login: 1 }]]);
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'TestAuthSecretPass123!' });
    expect(res.status).toBe(200);
    expect(res.body.user.first_login).toBe(true);
  });
});

// ─── GET /api/auth/me ──────────────────────────────────────────
describe('GET /api/auth/me', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns user data with valid token', async () => {
    db.query.mockResolvedValueOnce([[{ id:1, nom:'Admin', prenom:'Système', email:'admin.test@gmt-ariana.tn', role:'administrateur', first_login:0 }]]);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('admin.test@gmt-ariana.tn');
  });

  it('returns 404 if user deleted between login and request', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/auth/change-password ───────────────────────────
describe('POST /api/auth/change-password', () => {
  it('returns 400 if fields missing', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ current_password: 'old' });
    expect(res.status).toBe(400);
  });

  it('returns 400 if new password too short', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ current_password: 'TestAuthSecretPass123!', new_password: 'abc' });
    expect(res.status).toBe(400);
  });

  it('returns 401 if current password wrong', async () => {
    db.query.mockResolvedValueOnce([[{ password: HASH }]]);
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ current_password: 'wrong', new_password: 'NewPass123' });
    expect(res.status).toBe(401);
  });

  it('returns 200 on valid password change', async () => {
    db.query.mockResolvedValueOnce([[{ password: HASH }]]);
    db.query.mockResolvedValueOnce([{}]);
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ current_password: 'TestAuthSecretPass123!', new_password: 'NewPass123' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/mis à jour/i);
  });
});

// ─── POST /api/auth/force-change-password ─────────────────────
describe('POST /api/auth/force-change-password', () => {
  it('returns 400 if password too short', async () => {
    const res = await request(app)
      .post('/api/auth/force-change-password')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ new_password: 'abc' });
    expect(res.status).toBe(400);
  });

  it('returns 200 on success', async () => {
    db.query.mockResolvedValueOnce([{}]);
    const res = await request(app)
      .post('/api/auth/force-change-password')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ new_password: 'Secure123' });
    expect(res.status).toBe(200);
  });
});

// ─── Password reset flow ───────────────────────────────────────
describe('Password Reset Flow', () => {
  it('POST /forgot-password always returns 200 (no enum)', async () => {
    db.query.mockResolvedValue([[]]); // user not found — still 200
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@x.com' });
    expect(res.status).toBe(200);
  });

  it('GET /reset-password returns 400 for invalid token', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = await request(app).get('/api/auth/reset-password?token=badtoken');
    expect(res.status).toBe(400);
  });

  it('GET /reset-password returns 200 for valid token', async () => {
    db.query.mockResolvedValueOnce([[{ token: 'goodtoken', email: 'a@a.com' }]]);
    const res = await request(app).get('/api/auth/reset-password?token=goodtoken');
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });

  it('POST /reset-password returns 400 for expired token', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'bad', new_password: 'NewPass123' });
    expect(res.status).toBe(400);
  });

  it('POST /reset-password resets successfully', async () => {
    db.query.mockResolvedValueOnce([[{ email: 'a@a.com' }]]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([{}]);
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'valid', new_password: 'NewPass123' });
    expect(res.status).toBe(200);
  });
});
