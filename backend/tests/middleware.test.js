// tests/middleware.test.js
jest.mock('../config/db', () => require('./__mocks__/db'));

const jwt = require('jsonwebtoken');
const { authenticate, authorize } = require('../middleware/auth');

function mockReqRes(token = null, user = null) {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    user,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json:   jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

const PAYLOAD = { id:1, email:'admin@test.com', role:'administrateur', nom:'Admin', prenom:'S' };

describe('authenticate middleware', () => {
  it('calls next() with valid token', () => {
    const token = jwt.sign(PAYLOAD, process.env.JWT_SECRET, { expiresIn:'1h' });
    const { req, res, next } = mockReqRes(token);
    authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe(1);
    expect(req.user.role).toBe('administrateur');
  });

  it('returns 401 if no Authorization header', () => {
    const { req, res, next } = mockReqRes();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if header is not Bearer', () => {
    const req = { headers: { authorization: 'Basic abc' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 for expired token', () => {
    const token = jwt.sign(PAYLOAD, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const { req, res, next } = mockReqRes(token);
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/invalide|expiré/i) }));
  });

  it('returns 401 for tampered token', () => {
    const token = jwt.sign(PAYLOAD, 'wrong_secret', { expiresIn:'1h' });
    const { req, res, next } = mockReqRes(token);
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 for malformed token', () => {
    const { req, res, next } = mockReqRes('not.a.jwt');
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('authorize middleware', () => {
  it('calls next() when role matches', () => {
    const { req, res, next } = mockReqRes(null, { role:'administrateur' });
    authorize('administrateur')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next() when one of multiple roles matches', () => {
    const { req, res, next } = mockReqRes(null, { role:'medecin' });
    authorize('administrateur','medecin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when role does not match', () => {
    const { req, res, next } = mockReqRes(null, { role:'technicien' });
    authorize('administrateur')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for medecin on admin-only route', () => {
    const { req, res, next } = mockReqRes(null, { role:'medecin' });
    authorize('administrateur')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
