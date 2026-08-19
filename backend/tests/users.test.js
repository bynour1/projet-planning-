// tests/users.test.js
jest.mock('../config/db', () => require('./__mocks__/db'));
jest.mock('../config/mailer', () => ({
  sendOTP: jest.fn().mockResolvedValue(undefined),
  notifyAllUsers: jest.fn().mockResolvedValue(undefined),
  planningEmailHtml: jest.fn(()=>''), eventEmailHtml: jest.fn(()=>''),
}));

// Mock nodemailer used directly in users.js
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
  })),
}));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../app');
const db      = require('../config/db');

function makeToken(role = 'administrateur', id = 1) {
  return jwt.sign({ id, email: 'admin@planning.com', role, nom: 'Admin', prenom: 'Sys' }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

const adminToken  = makeToken('administrateur', 1);
const medecinToken = makeToken('medecin', 2);

const USER_ROW = { id: 2, nom: 'Benali', prenom: 'Sophie', email: 'sophie@planning.com', role: 'medecin', is_active: 1, created_at: new Date() };

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockResolvedValue([[], {}]);
});

// ─── GET /api/users ────────────────────────────────────────────
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

// ─── GET /api/users/by-role/:role ─────────────────────────────
describe('GET /api/users/by-role/:role', () => {
  it('returns medecins', async () => {
    db.query.mockResolvedValueOnce([[USER_ROW]]);
    const res = await request(app).get('/api/users/by-role/medecin').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body[0].role).toBe('medecin');
  });
});

// ─── POST /api/users ───────────────────────────────────────────
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
    db.query.mockResolvedValueOnce([[{ id:99 }]]); // email check
    const res = await request(app).post('/api/users').set('Authorization', `Bearer ${adminToken}`)
      .send({ nom:'X', prenom:'Y', email:'exists@x.com', role:'medecin' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/déjà/i);
  });

  it('creates user and sends OTP email', async () => {
    db.query.mockResolvedValueOnce([[]]); // no existing email
    db.query.mockResolvedValueOnce([{ insertId: 99 }]); // INSERT user
    db.query.mockResolvedValueOnce([{}]); // DELETE old codes
    db.query.mockResolvedValueOnce([{}]); // INSERT code

    const res = await request(app).post('/api/users').set('Authorization', `Bearer ${adminToken}`)
      .send({ nom:'Dupont', prenom:'Jean', email:'jean@x.com', role:'medecin' });
    expect(res.status).toBe(201);
    expect(res.body.otp_sent).toBe(true);
  });
});

// ─── POST /api/users/verify-otp ───────────────────────────────
describe('POST /api/users/verify-otp', () => {
  it('returns 400 if fields missing', async () => {
    const res = await request(app).post('/api/users/verify-otp').set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'a@a.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid/expired code', async () => {
    db.query.mockResolvedValueOnce([[]]); // no matching code
    const res = await request(app).post('/api/users/verify-otp').set('Authorization', `Bearer ${adminToken}`)
      .send({ email:'a@a.com', code:'000000', temp_password:'Pass123' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalide|expiré/i);
  });

  it('activates account on valid OTP', async () => {
    db.query.mockResolvedValueOnce([[{ id:1, email:'a@a.com', code:'123456' }]]); // valid code
    db.query.mockResolvedValueOnce([{}]); // UPDATE user
    db.query.mockResolvedValueOnce([{}]); // DELETE codes
    const res = await request(app).post('/api/users/verify-otp').set('Authorization', `Bearer ${adminToken}`)
      .send({ email:'a@a.com', code:'123456', temp_password:'Pass123' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/activé/i);
  });
});

// ─── PUT /api/users/:id ────────────────────────────────────────
describe('PUT /api/users/:id', () => {
  it('returns 403 for non-admin', async () => {
    const res = await request(app).put('/api/users/2').set('Authorization', `Bearer ${medecinToken}`)
      .send({ nom:'X', prenom:'Y', email:'e@e.com', role:'medecin', is_active: 1 });
    expect(res.status).toBe(403);
  });

  it('updates user as admin', async () => {
    db.query.mockResolvedValueOnce([{}]);
    const res = await request(app).put('/api/users/2').set('Authorization', `Bearer ${adminToken}`)
      .send({ nom:'Benali', prenom:'Sophie', email:'sophie@x.com', role:'medecin', is_active:1 });
    expect(res.status).toBe(200);
  });
});

// ─── DELETE /api/users/:id ─────────────────────────────────────
describe('DELETE /api/users/:id', () => {
  it('returns 400 if deleting own account', async () => {
    const res = await request(app).delete('/api/users/1').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/propre compte/i);
  });

  it('deletes another user', async () => {
    db.query.mockResolvedValueOnce([{}]);
    const res = await request(app).delete('/api/users/2').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});
