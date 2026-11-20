jest.mock('../config/db', () => require('./__mocks__/db'));
jest.mock('../config/mailer', () => ({
  notifyAllUsers: jest.fn(),
  planningEmailHtml: jest.fn(() => ''),
  eventEmailHtml: jest.fn(() => ''),
  sendOTP: jest.fn(),
  sendPasswordReset: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const app = require('../app');
const db = require('../config/db');
const {
  generateSignedDocumentUrl,
} = require('../middleware/documentSecurity');

// Helper to generate auth tokens
function tok(role = 'administrateur', id = 1, email = `${role}@gmt-test.tn`) {
  return (
    'Bearer ' +
    jwt.sign({ id, email, role, nom: 'Test', prenom: role }, process.env.JWT_SECRET || 'secret', {
      expiresIn: '1h',
    })
  );
}

const ADM = tok('administrateur', 1);
const MED = tok('medecin', 2);
const HSE = tok('hse', 3);
const TEC = tok('technicien', 4);
const CHF = tok('chauffeur', 5);

// Mock data
const ENT_1 = { id: 1, nom: 'Entreprise Alpha' };
const ENT_2 = { id: 2, nom: 'Entreprise Beta' };
const PAT_1 = { id: 10, entreprise_id: 1, nom: 'Ben Salah', prenom: 'Ahmed' };
const PAT_2 = { id: 20, entreprise_id: 2, nom: 'Trabelsi', prenom: 'Sami' };

// Create a real temp file so res.sendFile does not fail with 404 on disk
const uploadsDir = path.join(__dirname, '..', 'uploads', 'patients');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const testFilename = 'test_sample_security_doc.pdf';
const testFilePath = path.join(uploadsDir, testFilename);
fs.writeFileSync(testFilePath, '%PDF-1.4 Mock PDF Content For Security Test');

const DOC_MEDICAL = {
  id: 101,
  patient_id: 10,
  entreprise_id: 1,
  nom_fichier: testFilename,
  nom_original: 'Bilan_Sanguin_Ahmed.pdf',
  url: '',
  type_mime: 'application/pdf',
  taille: 1024,
  categorie: 'bilan', // Dossier médical
  description: 'Bilan complet',
};

const DOC_HSE = {
  id: 102,
  patient_id: 10,
  entreprise_id: 1,
  nom_fichier: testFilename,
  nom_original: 'Rapport_Poste_Ergonomie.pdf',
  url: '',
  type_mime: 'application/pdf',
  taille: 2048,
  categorie: 'rapport_hse', // Rapport HSE
  description: 'Étude de poste',
};

beforeEach(() => {
  jest.resetAllMocks();
  if (!fs.existsSync(testFilePath)) {
    fs.writeFileSync(testFilePath, '%PDF-1.4 Mock PDF Content For Security Test');
  }
  db.query.mockResolvedValue([[], {}]);
});

afterAll(() => {
  try {
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
  } catch (_) {}
});

describe('🔒 SÉCURITÉ DES DOCUMENTS — CONTROLES SERVEUR STRICTS', () => {
  // ── 1. TENTATIVE D\'ACCÈS SANS AUTHENTIFICATION (401) ──
  describe('1. Accès sans jeton (401 Unauthorized)', () => {
    it('refuse la liste des documents sans token', async () => {
      const res = await request(app).get('/api/entreprises/1/patients/10/documents');
      expect(res.status).toBe(401);
    });

    it('refuse le téléversement sans token', async () => {
      const res = await request(app).post('/api/entreprises/1/patients/10/documents');
      expect(res.status).toBe(401);
    });

    it('refuse la consultation (/view) sans token', async () => {
      const res = await request(app).get('/api/entreprises/1/patients/10/documents/101/view');
      expect(res.status).toBe(401);
    });

    it('refuse le téléchargement (/download) sans token', async () => {
      const res = await request(app).get('/api/entreprises/1/patients/10/documents/101/download');
      expect(res.status).toBe(401);
    });

    it('refuse la suppression sans token', async () => {
      const res = await request(app).delete('/api/entreprises/1/patients/10/documents/101');
      expect(res.status).toBe(401);
    });
  });

  // ── 2. BLOCAGE D\'ACCÈS DIRECT À L\'ANCIEN DOSSIER STATIQUE /uploads/ ──
  describe('2. Blocage des accès directs à /uploads/ (Suppression express.static)', () => {
    it('interdit l\'accès direct à /uploads/patients/secret.pdf (401)', async () => {
      const res = await request(app).get('/uploads/patients/secret.pdf');
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/accès non autorisé/i);
    });

    it('interdit l\'accès direct à /uploads/fichier_medical.pdf (401)', async () => {
      const res = await request(app).get('/uploads/fichier_medical.pdf');
      expect(res.status).toBe(401);
    });
  });

  // ── 3. REFUS SYSTÉMATIQUE POUR TECHNICIEN ET CHAUFFEUR (403) ──
  describe('3. Rôles technicien et chauffeur (aucun accès)', () => {
    it('interdit au technicien de lister les documents (403)', async () => {
      const res = await request(app)
        .get('/api/entreprises/1/patients/10/documents')
        .set('Authorization', TEC);
      expect(res.status).toBe(403);
    });

    it('interdit au chauffeur de lister les documents (403)', async () => {
      const res = await request(app)
        .get('/api/entreprises/1/patients/10/documents')
        .set('Authorization', CHF);
      expect(res.status).toBe(403);
    });

    it('interdit au technicien de téléverser un document (403)', async () => {
      const res = await request(app)
        .post('/api/entreprises/1/patients/10/documents')
        .set('Authorization', TEC);
      expect(res.status).toBe(403);
    });

    it('interdit au technicien de supprimer un document (403)', async () => {
      const res = await request(app)
        .delete('/api/entreprises/1/patients/10/documents/101')
        .set('Authorization', TEC);
      expect(res.status).toBe(403);
    });
  });

  // ── 4. CONTRÔLE PAR CATÉGORIE POUR LE RÔLE HSE ──
  describe('4. Rôle HSE — Cloisonnement strict médical vs HSE', () => {
    it('filtre la liste : le rôle HSE ne reçoit aucun document médical', async () => {
      db.query.mockResolvedValueOnce([[PAT_1]]); // patient check
      db.query.mockResolvedValueOnce([[DOC_HSE]]); // SQL filtered query returns only HSE docs

      const res = await request(app)
        .get('/api/entreprises/1/patients/10/documents')
        .set('Authorization', HSE);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].categorie).toBe('rapport_hse');
    });

    it('interdit au rôle HSE de consulter un document médical (403)', async () => {
      db.query.mockResolvedValueOnce([[DOC_MEDICAL]]); // document is 'bilan'

      const res = await request(app)
        .get('/api/entreprises/1/patients/10/documents/101/view')
        .set('Authorization', HSE);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/accès refusé/i);
    });

    it('interdit au rôle HSE de télécharger un document médical (403)', async () => {
      db.query.mockResolvedValueOnce([[DOC_MEDICAL]]);

      const res = await request(app)
        .get('/api/entreprises/1/patients/10/documents/101/download')
        .set('Authorization', HSE);

      expect(res.status).toBe(403);
    });

    it('interdit au rôle HSE de supprimer un document médical (403)', async () => {
      db.query.mockResolvedValueOnce([[DOC_MEDICAL]]);

      const res = await request(app)
        .delete('/api/entreprises/1/patients/10/documents/101')
        .set('Authorization', HSE);

      expect(res.status).toBe(403);
    });

    it('autorise le rôle HSE à consulter un Rapport HSE (200)', async () => {
      db.query.mockResolvedValueOnce([[DOC_HSE]]); // document is 'rapport_hse'
      db.query.mockResolvedValueOnce([[]]); // audit log insert

      const res = await request(app)
        .get('/api/entreprises/1/patients/10/documents/102/view')
        .set('Authorization', HSE);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('autorise le rôle HSE à télécharger un Rapport HSE (200)', async () => {
      db.query.mockResolvedValueOnce([[DOC_HSE]]);
      db.query.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .get('/api/entreprises/1/patients/10/documents/102/download')
        .set('Authorization', HSE);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
    });
  });

  // ── 5. RÔLE MÉDECIN ET ADMINISTRATEUR ──
  describe('5. Rôles Médecin et Administrateur (accès dossier médical et HSE)', () => {
    it('autorise le médecin à consulter un document médical (200)', async () => {
      db.query.mockResolvedValueOnce([[DOC_MEDICAL]]);
      db.query.mockResolvedValueOnce([[]]); // audit log

      const res = await request(app)
        .get('/api/entreprises/1/patients/10/documents/101/view')
        .set('Authorization', MED);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('autorise l\'administrateur à consulter et supprimer un document médical', async () => {
      db.query.mockResolvedValueOnce([[DOC_MEDICAL]]);
      db.query.mockResolvedValueOnce([[]]); // DB delete
      db.query.mockResolvedValueOnce([[]]); // audit log

      const res = await request(app)
        .delete('/api/entreprises/1/patients/10/documents/101')
        .set('Authorization', ADM);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/supprimé avec succès/i);
    });
  });

  // ── 6. PROTECTION ANTI-IDOR (CROSS-TENANT / CROSS-PATIENT) ──
  describe('6. Protection contre l\'accès par identifiant (IDOR)', () => {
    it('renvoie 404 si le patient n\'appartient pas à l\'entreprise demandée', async () => {
      // Patient 10 belongs to Entreprise 1, request asks for Entreprise 2
      db.query.mockResolvedValueOnce([[]]); // No patient matching id=10 AND entreprise_id=2

      const res = await request(app)
        .get('/api/entreprises/2/patients/10/documents')
        .set('Authorization', MED);

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/introuvable/i);
    });

    it('renvoie 404 si le document n\'appartient pas au patient demandé', async () => {
      // Document 101 belongs to Patient 10, request asks for Patient 99
      db.query.mockResolvedValueOnce([[]]); // No doc matching id=101 AND patient_id=99

      const res = await request(app)
        .get('/api/entreprises/1/patients/99/documents/101/view')
        .set('Authorization', MED);

      expect(res.status).toBe(404);
    });

    it('renvoie 404 lors de la suppression si l\'entreprise ne correspond pas', async () => {
      db.query.mockResolvedValueOnce([[]]);

      const res = await request(app)
        .delete('/api/entreprises/2/patients/10/documents/101')
        .set('Authorization', ADM);

      expect(res.status).toBe(404);
    });
  });

  // ── 7. URL SIGNÉE DE 5 MINUTES (HMAC) ──
  describe('7. Accès via URL signée de 5 minutes', () => {
    it('permet l\'accès sécurisé avec un jeton signé valide', async () => {
      const userObj = { id: 2, role: 'medecin', email: 'medecin@gmt-test.tn' };
      const signedUrl = generateSignedDocumentUrl(DOC_MEDICAL, userObj);

      db.query.mockResolvedValueOnce([[userObj]]); // User check
      db.query.mockResolvedValueOnce([[DOC_MEDICAL]]); // Doc check
      db.query.mockResolvedValueOnce([[]]); // Audit log

      const res = await request(app).get(signedUrl);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('refuse un jeton falsifié (401)', async () => {
      const res = await request(app).get('/api/documents/signed-access?token=invalid_token_123');
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expiré ou invalide/i);
    });

    it('refuse l\'accès via URL signée si le rôle utilisateur associé n\'est pas autorisé (403)', async () => {
      // User is HSE, but document is medical (bilan)
      const userHse = { id: 3, role: 'hse', email: 'hse@gmt-test.tn' };
      const signedUrl = generateSignedDocumentUrl(DOC_MEDICAL, userHse);

      db.query.mockResolvedValueOnce([[userHse]]);
      db.query.mockResolvedValueOnce([[DOC_MEDICAL]]);

      const res = await request(app).get(signedUrl);
      expect(res.status).toBe(403);
    });
  });

  // ── 8. JOURNAL D'AUDIT ──
  describe('8. Journal d\'audit', () => {
    it('enregistre l\'accès dans document_audit_logs lors de la consultation', async () => {
      db.query.mockResolvedValueOnce([[DOC_MEDICAL]]);
      db.query.mockResolvedValueOnce([[]]); // audit insert

      const res = await request(app)
        .get('/api/entreprises/1/patients/10/documents/101/view')
        .set('Authorization', MED);

      expect(res.status).toBe(200);

      // Verify db.query was called with INSERT INTO document_audit_logs
      const auditCalls = db.query.mock.calls.filter((call) =>
        String(call[0]).includes('document_audit_logs')
      );
      expect(auditCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 9. SÉCURITÉ DES AVATARS (ROUTE DÉDIÉE) ──
  describe('9. Sécurité des Avatars (Route dédiée /api/auth/avatar)', () => {
    const avatarDir = path.join(__dirname, '..', 'uploads', 'avatars');
    const testAvatarName = 'avatar-test-sample.png';
    const testAvatarPath = path.join(avatarDir, testAvatarName);

    beforeAll(() => {
      if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });
      fs.writeFileSync(testAvatarPath, 'fake-png-content');
    });

    afterAll(() => {
      try {
        if (fs.existsSync(testAvatarPath)) fs.unlinkSync(testAvatarPath);
      } catch (_) {}
    });

    it('sert un avatar via la route dédiée /api/auth/avatar/:filename (200)', async () => {
      const res = await request(app).get(`/api/auth/avatar/${testAvatarName}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
    });

    it('renvoie 404 si l\'avatar n\'existe pas', async () => {
      const res = await request(app).get('/api/auth/avatar/non-existent-avatar.png');
      expect(res.status).toBe(404);
    });

    it('protège contre les attaques par saut de répertoire (path traversal)', async () => {
      const res = await request(app).get('/api/auth/avatar/..%2f..%2fserver.js');
      expect([400, 404]).toContain(res.status);
    });

    it('redirige les anciennes requêtes /uploads/avatars/ vers la route dédiée (302)', async () => {
      const res = await request(app).get(`/uploads/avatars/${testAvatarName}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`/api/auth/avatar/${testAvatarName}`);
    });
  });
});
