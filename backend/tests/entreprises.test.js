jest.mock('../config/db', () => require('./__mocks__/db'));
jest.mock('../config/mailer', () => ({
  notifyAllUsers: jest.fn(), planningEmailHtml: jest.fn(()=>''),
  eventEmailHtml: jest.fn(()=>''), sendOTP: jest.fn(), sendPasswordReset: jest.fn(),
}));

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../app');
const db      = require('../config/db');

function tok(role='administrateur', id=1) {
  return 'Bearer ' + jwt.sign({ id, email:'a@a.com', role, nom:'Admin', prenom:'S' }, process.env.JWT_SECRET, { expiresIn:'1h' });
}
const ADM = tok('administrateur',1);
const MED = tok('medecin',2);

const ENT = { id:1, nom:'Clinique Les Oliviers', secteur:'Médical', adresse:'Tunis', telephone:'71000000', email:'c@c.tn', site_web:null, description:'Clinique', convensionne:1, nb_avis:2, note_moyenne:4.5 };
const AVIS = { id:1, entreprise_id:1, user_id:1, note:5, commentaire:'Excellent', type_avis:'avis', user_nom:'Admin', user_prenom:'S', user_role:'administrateur', created_at:new Date() };

beforeEach(() => { jest.resetAllMocks(); db.query.mockResolvedValue([[],{}]); });

// ══════════════════════════════════════════════════════════════
// ENTREPRISES CRUD
// ══════════════════════════════════════════════════════════════
describe('GET /api/entreprises', () => {
  it('401 without token', async () => {
    expect((await request(app).get('/api/entreprises')).status).toBe(401);
  });
  it('returns list for authenticated user', async () => {
    db.query.mockResolvedValueOnce([[ENT]]);
    const res = await request(app).get('/api/entreprises').set('Authorization', MED);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
  it('medecin can access entreprises list', async () => {
    db.query.mockResolvedValueOnce([[ENT]]);
    expect((await request(app).get('/api/entreprises').set('Authorization', MED)).status).toBe(200);
  });
});

describe('GET /api/entreprises/:id', () => {
  it('returns entreprise with avis', async () => {
    db.query.mockResolvedValueOnce([[ENT]]);
    db.query.mockResolvedValueOnce([[AVIS]]);
    const res = await request(app).get('/api/entreprises/1').set('Authorization', MED);
    expect(res.status).toBe(200);
    expect(res.body.nom).toBe('Clinique Les Oliviers');
    expect(Array.isArray(res.body.avis)).toBe(true);
  });
  it('404 for unknown entreprise', async () => {
    db.query.mockResolvedValueOnce([[]]); // no entreprise
    expect((await request(app).get('/api/entreprises/99').set('Authorization', MED)).status).toBe(404);
  });
});

describe('POST /api/entreprises (Admin)', () => {
  it('403 for medecin', async () => {
    expect((await request(app).post('/api/entreprises').set('Authorization', MED).send({ nom:'X' })).status).toBe(403);
  });
  it('400 if nom missing', async () => {
    expect((await request(app).post('/api/entreprises').set('Authorization', ADM).send({ secteur:'X' })).status).toBe(400);
  });
  it('400 if nom empty string', async () => {
    expect((await request(app).post('/api/entreprises').set('Authorization', ADM).send({ nom:'  ' })).status).toBe(400);
  });
  it('creates entreprise', async () => {
    db.query.mockResolvedValueOnce([{ insertId:5 }]);
    const res = await request(app).post('/api/entreprises').set('Authorization', ADM)
      .send({ nom:'Clinique X', secteur:'Médical', convensionne:true });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(5);
  });
  it('creates entreprise with convention dates and renouvelable', async () => {
    db.query.mockResolvedValueOnce([{ insertId:7 }]);
    const res = await request(app).post('/api/entreprises').set('Authorization', ADM)
      .send({
        nom: 'Société Tech',
        convensionne: true,
        date_debut_convention: '2026-01-01',
        date_fin_convention: '2026-12-31',
        renouvelable: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(7);
  });
});

describe('PUT /api/entreprises/:id (Admin)', () => {
  it('403 for medecin', async () => {
    expect((await request(app).put('/api/entreprises/1').set('Authorization', MED).send({ nom:'X' })).status).toBe(403);
  });
  it('400 if nom missing', async () => {
    expect((await request(app).put('/api/entreprises/1').set('Authorization', ADM).send({ secteur:'X' })).status).toBe(400);
  });
  it('updates entreprise with convention dates and renouvelable', async () => {
    db.query.mockResolvedValueOnce([{}]);
    const res = await request(app).put('/api/entreprises/1').set('Authorization', ADM)
      .send({
        nom: 'Clinique Modifiée',
        secteur: 'Médical',
        convensionne: true,
        date_debut_convention: '2026-02-01',
        date_fin_convention: '2027-02-01',
        renouvelable: false,
      });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/entreprises/:id (Admin)', () => {
  it('403 for medecin', async () => {
    expect((await request(app).delete('/api/entreprises/1').set('Authorization', MED)).status).toBe(403);
  });
  it('deletes entreprise', async () => {
    db.query.mockResolvedValueOnce([{}]);
    expect((await request(app).delete('/api/entreprises/1').set('Authorization', ADM)).status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════
// AVIS
// ══════════════════════════════════════════════════════════════
describe('GET /api/entreprises/:id/avis', () => {
  it('returns avis list', async () => {
    db.query.mockResolvedValueOnce([[AVIS]]);
    const res = await request(app).get('/api/entreprises/1/avis').set('Authorization', MED);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
  it('401 without token', async () => {
    expect((await request(app).get('/api/entreprises/1/avis')).status).toBe(401);
  });
});

describe('POST /api/entreprises/:id/avis', () => {
  it('401 without token', async () => {
    expect((await request(app).post('/api/entreprises/1/avis').send({ commentaire:'X' })).status).toBe(401);
  });
  it('400 if commentaire missing', async () => {
    db.query.mockResolvedValueOnce([[ENT]]);
    const res = await request(app).post('/api/entreprises/1/avis').set('Authorization', MED).send({ note:4 });
    expect(res.status).toBe(400);
  });
  it('400 if commentaire empty', async () => {
    db.query.mockResolvedValueOnce([[ENT]]);
    const res = await request(app).post('/api/entreprises/1/avis').set('Authorization', MED).send({ commentaire:'  ' });
    expect(res.status).toBe(400);
  });
  it('400 if note out of range', async () => {
    db.query.mockResolvedValueOnce([[ENT]]);
    const res = await request(app).post('/api/entreprises/1/avis').set('Authorization', MED).send({ commentaire:'Test', note:6 });
    expect(res.status).toBe(400);
  });
  it('404 if entreprise not found', async () => {
    // SELECT returns empty rows → ent.length = 0 → 404
    db.query.mockResolvedValueOnce([[]]); 
    const res = await request(app).post('/api/entreprises/99/avis').set('Authorization', MED).send({ commentaire:'Test' });
    expect(res.status).toBe(404);
  });
  it('creates avis with note', async () => {
    db.query.mockResolvedValueOnce([[ENT]]);
    db.query.mockResolvedValueOnce([{ insertId:10 }]);
    const res = await request(app).post('/api/entreprises/1/avis').set('Authorization', MED)
      .send({ note:5, commentaire:'Excellent service', type_avis:'avis' });
    expect(res.status).toBe(201);
  });
  it('creates remarque without note', async () => {
    db.query.mockResolvedValueOnce([[ENT]]);
    db.query.mockResolvedValueOnce([{ insertId:11 }]);
    const res = await request(app).post('/api/entreprises/1/avis').set('Authorization', MED)
      .send({ commentaire:'Parking difficile', type_avis:'remarque' });
    expect(res.status).toBe(201);
  });
  it('any authenticated user can post avis (not admin-only)', async () => {
    db.query.mockResolvedValueOnce([[ENT]]);
    db.query.mockResolvedValueOnce([{ insertId:12 }]);
    const techToken = 'Bearer ' + jwt.sign({ id:3, role:'technicien', nom:'T', prenom:'T', email:'t@t.com' }, process.env.JWT_SECRET, { expiresIn:'1h' });
    const res = await request(app).post('/api/entreprises/1/avis').set('Authorization', techToken)
      .send({ commentaire:'Bon service' });
    expect(res.status).toBe(201);
  });
});

describe('PUT /api/entreprises/:id/avis/:avisId', () => {
  it('403 if not owner and not admin', async () => {
    db.query.mockResolvedValueOnce([[{ ...AVIS, user_id:99 }]]); // owned by someone else
    const res = await request(app).put('/api/entreprises/1/avis/1').set('Authorization', MED)
      .send({ commentaire:'Modifié' });
    expect(res.status).toBe(403);
  });
  it('owner can update own avis', async () => {
    db.query.mockResolvedValueOnce([[{ ...AVIS, user_id:2 }]]); // SELECT: owned by medecin
    // UPDATE uses default mock [[],{}]
    const res = await request(app).put('/api/entreprises/1/avis/1').set('Authorization', MED)
      .send({ commentaire:'Modifié', type_avis:'avis' });
    expect(res.status).toBe(200);
  });
  it('admin can update any avis', async () => {
    db.query.mockResolvedValueOnce([[{ ...AVIS, user_id:99 }]]); // SELECT: owned by other
    // UPDATE uses default mock
    const res = await request(app).put('/api/entreprises/1/avis/1').set('Authorization', ADM)
      .send({ commentaire:'Modifié par admin', type_avis:'remarque' });
    expect(res.status).toBe(200);
  });
  it('404 if avis not found', async () => {
    db.query.mockResolvedValueOnce([[]]); // avis not found
    const res = await request(app).put('/api/entreprises/1/avis/99').set('Authorization', ADM)
      .send({ commentaire:'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/entreprises/:id/avis/:avisId', () => {
  it('403 if not owner and not admin', async () => {
    db.query.mockResolvedValueOnce([[{ ...AVIS, user_id:99 }]]);
    expect((await request(app).delete('/api/entreprises/1/avis/1').set('Authorization', MED)).status).toBe(403);
  });
  it('owner can delete own avis', async () => {
    db.query.mockResolvedValueOnce([[{ ...AVIS, user_id:2 }]]); // SELECT: owned by medecin
    // DELETE uses default mock
    expect((await request(app).delete('/api/entreprises/1/avis/1').set('Authorization', MED)).status).toBe(200);
  });
  it('admin can delete any avis', async () => {
    db.query.mockResolvedValueOnce([[{ ...AVIS, user_id:99 }]]); // SELECT: owned by other
    // DELETE uses default mock
    expect((await request(app).delete('/api/entreprises/1/avis/1').set('Authorization', ADM)).status).toBe(200);
  });
  it('404 if avis not found', async () => {
    db.query.mockResolvedValueOnce([[]]); // SELECT returns empty
    expect((await request(app).delete('/api/entreprises/1/avis/99').set('Authorization', ADM)).status).toBe(404);
  });
});
