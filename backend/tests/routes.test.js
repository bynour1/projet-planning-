// tests/routes.test.js
jest.mock('../config/db', () => require('./__mocks__/db'));
jest.mock('../config/mailer', () => ({
  notifyAllUsers: jest.fn().mockResolvedValue(undefined),
  notifyAssignedIntervenants: jest.fn().mockResolvedValue(undefined),
  planningEmailHtml: jest.fn(() => ''),
  eventEmailHtml: jest.fn(() => ''),
  sendOTP: jest.fn(), sendPasswordReset: jest.fn(),
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
const TEC = tok('technicien',3);

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockReset();
  db.query.mockResolvedValue([[], {}]);
});

// ══════════════════════════════════════════════════════════════
// PLANNING
// ══════════════════════════════════════════════════════════════
describe('Planning routes', () => {
  const P = { id:1, titre:'Test', date:'2026-05-17', heure_debut:'08:00:00', heure_fin:'10:00:00', adresse:'Paris', medecin_id:null, technicien_id:null };

  describe('GET /api/planning', () => {
    it('401 without token', async () => {
      expect((await request(app).get('/api/planning')).status).toBe(401);
    });
    it('returns array for authenticated user', async () => {
      db.query.mockResolvedValueOnce([[P]]);
      const res = await request(app).get('/api/planning').set('Authorization', MED);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
    it('dates are normalised (no ISO T string)', async () => {
      db.query.mockResolvedValueOnce([[P]]);
      const res = await request(app).get('/api/planning').set('Authorization', MED);
      expect(res.body[0].date).toBe('2026-05-17');
    });
    it('filters by start/end', async () => {
      db.query.mockResolvedValueOnce([[]]);
      const res = await request(app).get('/api/planning?start=2026-05-01&end=2026-05-31').set('Authorization', MED);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/planning/today', () => {
    it('returns today items', async () => {
      db.query.mockResolvedValueOnce([[P]]);
      const res = await request(app).get('/api/planning/today').set('Authorization', MED);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/planning/mine', () => {
    it('returns own planning', async () => {
      db.query.mockResolvedValueOnce([[P]]);
      const res = await request(app).get('/api/planning/mine').set('Authorization', MED);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/planning', () => {
    it('403 for medecin', async () => {
      expect((await request(app).post('/api/planning').set('Authorization',MED).send({date:'2026-05-17'})).status).toBe(403);
    });
    it('400 if date missing', async () => {
      expect((await request(app).post('/api/planning').set('Authorization',ADM).send({titre:'X'})).status).toBe(400);
    });
    it('creates event and returns 201', async () => {
      db.query.mockResolvedValueOnce([[]]); // medecin name
      db.query.mockResolvedValueOnce([[]]); // tech name
      db.query.mockResolvedValueOnce([{ insertId:10 }]); // INSERT
      const res = await request(app).post('/api/planning').set('Authorization',ADM).send({ date:'2026-05-17', titre:'ECG', heure_debut:'09:00' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe(10);
    });
  });

  describe('PUT /api/planning/:id', () => {
    it('403 for technicien', async () => {
      expect((await request(app).put('/api/planning/1').set('Authorization',TEC).send({ date:'2026-05-17' })).status).toBe(403);
    });
    it('updates for admin', async () => {
      db.query.mockResolvedValueOnce([[ { id: 1, is_clino: 0, clino_id: null } ]]); // existing
      db.query.mockResolvedValueOnce([[]]); // medecin name
      db.query.mockResolvedValueOnce([[]]); // tech name
      db.query.mockResolvedValueOnce([{}]); // UPDATE
      expect((await request(app).put('/api/planning/1').set('Authorization',ADM).send({ titre:'X', date:'2026-05-17' })).status).toBe(200);
    });
  });

  describe('DELETE /api/planning/:id', () => {
    it('deletes for admin', async () => {
      db.query.mockResolvedValueOnce([{}]);
      expect((await request(app).delete('/api/planning/1').set('Authorization',ADM)).status).toBe(200);
    });
    it('403 for medecin', async () => {
      expect((await request(app).delete('/api/planning/1').set('Authorization',MED)).status).toBe(403);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// EVENTS (Calendar)
// ══════════════════════════════════════════════════════════════
describe('Events routes', () => {
  const EV = { id:1, titre:'Réunion', type:'reunion', date_debut:'2026-05-20T10:00:00', date_fin:null, lieu:'Tunis', recurrence:'none', created_by:1 };

  describe('GET /api/events', () => {
    it('401 without token', async () => {
      expect((await request(app).get('/api/events')).status).toBe(401);
    });
    it('returns events array', async () => {
      db.query.mockResolvedValueOnce([[EV]]);
      const res = await request(app).get('/api/events').set('Authorization', MED);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/events', () => {
    it('400 if titre missing', async () => {
      const res = await request(app).post('/api/events').set('Authorization',ADM).send({ date_debut:'2026-05-20T10:00:00' });
      expect(res.status).toBe(400);
    });
    it('403 for medecin', async () => {
      const res = await request(app).post('/api/events').set('Authorization',MED).send({ titre:'X', date_debut:'2026-05-20T10:00:00' });
      expect(res.status).toBe(403);
    });
    it('creates event', async () => {
      db.query.mockResolvedValueOnce([{ insertId:5 }]);
      const res = await request(app).post('/api/events').set('Authorization',ADM).send({ titre:'Formation', date_debut:'2026-05-20T10:00:00', type:'formation' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe(5);
    });
  });

  describe('PUT /api/events/:id', () => {
    it('updates event', async () => {
      db.query.mockResolvedValueOnce([{}]);
      const res = await request(app).put('/api/events/1').set('Authorization',ADM).send({ titre:'X', date_debut:'2026-05-20T10:00:00' });
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/events/:id', () => {
    it('deletes event', async () => {
      db.query.mockResolvedValueOnce([{}]);
      const res = await request(app).delete('/api/events/1').set('Authorization',ADM);
      expect(res.status).toBe(200);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// CLINO MOBILE
// ══════════════════════════════════════════════════════════════
describe('Clino Mobile routes', () => {
  const C = { id:1, date:'2026-05-17', heure:'09:00:00', adresse:'Rue de la Paix, Tunis', medecin_id:2, medecin_nom:'Sophie Benali', commentaire:null };

  describe('GET /api/clino', () => {
    it('401 without token', async () => {
      expect((await request(app).get('/api/clino')).status).toBe(401);
    });
    it('returns clino list', async () => {
      db.query.mockResolvedValueOnce([[C]]);
      expect((await request(app).get('/api/clino').set('Authorization',MED)).status).toBe(200);
    });
  });

  describe('POST /api/clino', () => {
    it('403 for technicien', async () => {
      expect((await request(app).post('/api/clino').set('Authorization',TEC).send({ date:'2026-05-17', heure:'09:00', adresse:'X' })).status).toBe(403);
    });
    it('400 if fields missing', async () => {
      expect((await request(app).post('/api/clino').set('Authorization',ADM).send({ date:'2026-05-17' })).status).toBe(400);
    });
    it('creates clino intervention', async () => {
      db.query.mockResolvedValueOnce([[{ fullname:'Sophie Benali' }]]); // medecin name
      db.query.mockResolvedValueOnce([{ insertId:7 }]);
      const res = await request(app).post('/api/clino').set('Authorization',ADM).send({ date:'2026-05-17', heure:'09:00', adresse:'Rue X', medecin_id:2 });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe(7);
    });
  });

  describe('PUT /api/clino/:id', () => {
    it('updates clino', async () => {
      db.query.mockResolvedValueOnce([[{ fullname:'Sophie Benali' }]]);
      db.query.mockResolvedValueOnce([{}]);
      expect((await request(app).put('/api/clino/1').set('Authorization',ADM).send({ date:'2026-05-17', heure:'09:00', adresse:'X' })).status).toBe(200);
    });
  });

  describe('DELETE /api/clino/:id', () => {
    it('deletes clino', async () => {
      db.query.mockResolvedValueOnce([{}]);
      expect((await request(app).delete('/api/clino/1').set('Authorization',ADM)).status).toBe(200);
    });
    it('403 for medecin', async () => {
      expect((await request(app).delete('/api/clino/1').set('Authorization',MED)).status).toBe(403);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// CHAT
// ══════════════════════════════════════════════════════════════
describe('Chat routes', () => {
  const MSG = { id:1, user_id:1, nom:'Admin Sys', role:'administrateur', content:'Bonjour', created_at: new Date() };

  describe('GET /api/chat/messages', () => {
    it('401 without token', async () => {
      expect((await request(app).get('/api/chat/messages')).status).toBe(401);
    });
    it('returns messages', async () => {
      db.query.mockResolvedValueOnce([[MSG]]);
      const res = await request(app).get('/api/chat/messages').set('Authorization',ADM);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
    it('respects limit query param', async () => {
      db.query.mockResolvedValueOnce([[MSG]]);
      const res = await request(app).get('/api/chat/messages?limit=10').set('Authorization',ADM);
      expect(res.status).toBe(200);
      // Check the query was called with limit 10
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT'), [10]);
    });
  });

  describe('POST /api/chat/messages', () => {
    it('400 for empty content', async () => {
      const res = await request(app).post('/api/chat/messages').set('Authorization',MED).send({ content:'  ' });
      expect(res.status).toBe(400);
    });
    it('creates message', async () => {
      db.query.mockResolvedValueOnce([{ insertId:5 }]);
      db.query.mockResolvedValueOnce([[{ ...MSG, id:5 }]]);
      const res = await request(app).post('/api/chat/messages').set('Authorization',MED).send({ content:'Hello team' });
      expect(res.status).toBe(201);
      expect(res.body.content).toBe('Bonjour'); // from mock
    });
  });

  describe('DELETE /api/chat/messages/:id', () => {
    it('404 for non-existent message', async () => {
      db.query.mockResolvedValueOnce([[]]); // message not found
      const res = await request(app).delete('/api/chat/messages/99').set('Authorization',ADM);
      expect(res.status).toBe(404);
    });
    it('403 if not owner and not admin', async () => {
      db.query.mockResolvedValueOnce([[{ ...MSG, user_id:99 }]]); // owned by someone else
      const res = await request(app).delete('/api/chat/messages/1').set('Authorization',MED);
      expect(res.status).toBe(403);
    });
    it('admin can delete any message', async () => {
      db.query.mockResolvedValueOnce([[{ ...MSG, user_id:99 }]]);
      db.query.mockResolvedValueOnce([{}]);
      const res = await request(app).delete('/api/chat/messages/1').set('Authorization',ADM);
      expect(res.status).toBe(200);
    });
    it('owner can delete own message', async () => {
      db.query.mockResolvedValueOnce([[{ ...MSG, user_id:1 }]]);
      db.query.mockResolvedValueOnce([{}]);
      const res = await request(app).delete('/api/chat/messages/1').set('Authorization',ADM);
      expect(res.status).toBe(200);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// ROUTINES
// ══════════════════════════════════════════════════════════════
describe('Routines routes', () => {
  const ROUTINE = { id:1, user_id:1, title:'Rappel réunion', time:'09:00', days:'[0,1,2]', active:1 };

  describe('GET /api/routines', () => {
    it('401 without token', async () => {
      expect((await request(app).get('/api/routines')).status).toBe(401);
    });
    it('returns routines for authenticated user', async () => {
      db.query.mockResolvedValueOnce([[ROUTINE]]);
      const res = await request(app).get('/api/routines').set('Authorization', MED);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
    it('parses days JSON correctly', async () => {
      db.query.mockResolvedValueOnce([[{ ...ROUTINE, days:'[0,2,4]' }]]);
      const res = await request(app).get('/api/routines').set('Authorization', MED);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body[0].days)).toBe(true);
      expect(res.body[0].days).toContain(0);
    });
    it('returns empty array when no routines', async () => {
      db.query.mockResolvedValueOnce([[]]); 
      const res = await request(app).get('/api/routines').set('Authorization', MED);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('POST /api/routines', () => {
    it('401 without token', async () => {
      expect((await request(app).post('/api/routines').send({ title:'X' })).status).toBe(401);
    });
    it('400 if title missing', async () => {
      const res = await request(app).post('/api/routines').set('Authorization', MED).send({ time:'09:00' });
      expect(res.status).toBe(400);
    });
    it('400 if title is empty string', async () => {
      const res = await request(app).post('/api/routines').set('Authorization', MED).send({ title:'   ' });
      expect(res.status).toBe(400);
    });
    it('creates routine and returns 201', async () => {
      db.query.mockResolvedValueOnce([{ insertId: 5 }]);
      const res = await request(app).post('/api/routines').set('Authorization', MED)
        .send({ title:'Rappel', time:'08:00', days:[0,1,4] });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe(5);
    });
    it('creates routine without time (optional)', async () => {
      db.query.mockResolvedValueOnce([{ insertId: 6 }]);
      const res = await request(app).post('/api/routines').set('Authorization', ADM)
        .send({ title:'Rappel sans heure' });
      expect(res.status).toBe(201);
    });
  });

  describe('PUT /api/routines/:id', () => {
    it('401 without token', async () => {
      expect((await request(app).put('/api/routines/1').send({ title:'X' })).status).toBe(401);
    });
    it('400 if title missing', async () => {
      const res = await request(app).put('/api/routines/1').set('Authorization', MED).send({ time:'09:00' });
      expect(res.status).toBe(400);
    });
    it('404 if routine not found or not owner', async () => {
      db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
      const res = await request(app).put('/api/routines/99').set('Authorization', MED)
        .send({ title:'X', days:[], active:true });
      expect(res.status).toBe(404);
    });
    it('updates routine successfully', async () => {
      db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).put('/api/routines/1').set('Authorization', MED)
        .send({ title:'Nouveau titre', time:'10:00', days:[0,1], active:true });
      expect(res.status).toBe(200);
    });
    it('can toggle active to false', async () => {
      db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).put('/api/routines/1').set('Authorization', MED)
        .send({ title:'Test', days:[], active:false });
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/routines/:id', () => {
    it('401 without token', async () => {
      expect((await request(app).delete('/api/routines/1')).status).toBe(401);
    });
    it('404 if routine not found or not owner', async () => {
      db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
      const res = await request(app).delete('/api/routines/99').set('Authorization', MED);
      expect(res.status).toBe(404);
    });
    it('deletes own routine', async () => {
      db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = await request(app).delete('/api/routines/1').set('Authorization', MED);
      expect(res.status).toBe(200);
    });
    it('cannot delete another user routine (404)', async () => {
      db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
      const res = await request(app).delete('/api/routines/5').set('Authorization', ADM);
      expect(res.status).toBe(404);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// CHAT - FILE UPLOAD
// ══════════════════════════════════════════════════════════════
describe('Chat upload route', () => {
  it('401 without token on /api/chat/messages', async () => {
    expect((await request(app).get('/api/chat/messages')).status).toBe(401);
  });

  it('returns messages array', async () => {
    db.query.mockResolvedValueOnce([[
      { id:1, user_id:1, nom:'Admin S', role:'administrateur', content:'Bonjour', type:'text', created_at:new Date() }
    ]]);
    const res = await request(app).get('/api/chat/messages').set('Authorization', ADM);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('400 for empty content', async () => {
    const res = await request(app).post('/api/chat/messages').set('Authorization', MED).send({ content:'  ' });
    expect(res.status).toBe(400);
  });

  it('401 on upload without token', async () => {
    expect((await request(app).post('/api/chat/upload')).status).toBe(401);
  });

  it('400 on upload without file', async () => {
    const res = await request(app).post('/api/chat/upload').set('Authorization', MED);
    expect(res.status).toBe(400);
  });

  it('GET /api/chat/files/:filename 401 without token', async () => {
    expect((await request(app).get('/api/chat/files/test.pdf')).status).toBe(401);
  });

  it('GET /api/chat/files/:filename 404 for missing file', async () => {
    const res = await request(app).get('/api/chat/files/nonexistent_file_xyz.pdf').set('Authorization', ADM);
    expect(res.status).toBe(404);
  });

  it('DELETE message 404 for nonexistent', async () => {
    db.query.mockResolvedValueOnce([[]]); // not found
    const res = await request(app).delete('/api/chat/messages/999').set('Authorization', ADM);
    expect(res.status).toBe(404);
  });

  it('DELETE message 403 if not owner and not admin', async () => {
    db.query.mockResolvedValueOnce([[{ id:5, user_id:99, type:'text' }]]);
    const res = await request(app).delete('/api/chat/messages/5').set('Authorization', MED);
    expect(res.status).toBe(403);
  });

  it('DELETE message success for owner', async () => {
    db.query.mockResolvedValueOnce([[{ id:5, user_id:2, type:'text' }]]);
    db.query.mockResolvedValueOnce([{}]);
    const res = await request(app).delete('/api/chat/messages/5').set('Authorization', MED);
    expect(res.status).toBe(200);
  });

  it('DELETE message success for admin (any message)', async () => {
    db.query.mockResolvedValueOnce([[{ id:5, user_id:99, type:'text' }]]);
    db.query.mockResolvedValueOnce([{}]);
    const res = await request(app).delete('/api/chat/messages/5').set('Authorization', ADM);
    expect(res.status).toBe(200);
  });
});
