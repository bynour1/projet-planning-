const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const {
  verifySignedDocumentToken,
  canUserAccessCategory,
} = require('../middleware/documentSecurity');
const { logDocumentAudit, getDocumentAuditLogs } = require('../services/auditService');

const PATIENTS_UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'patients');

// ── GET /api/documents/signed-access?token=... ─────────────────
// Accès temporaire sécurisé (durée 5 minutes) généré par signature cryptographique
router.get('/signed-access', async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(401).json({ message: 'Jeton d\'accès signé manquant' });
  }

  // 1. Vérification cryptographique et validité temporelle (5 minutes)
  const tokenData = verifySignedDocumentToken(token);
  if (!tokenData) {
    return res.status(401).json({
      message: 'Lien expiré ou invalide. Les URL sécurisées ont une durée de validité de 5 minutes.',
    });
  }

  const { docId, userId } = tokenData;

  try {
    // 2. Vérification de l'utilisateur émetteur
    const [userRows] = await db.query('SELECT id, email, role, is_active FROM users WHERE id = ?', [userId]);
    const user = userRows[0];
    if (!user || user.is_active === 0) {
      return res.status(401).json({ message: 'Compte utilisateur inactif ou introuvable' });
    }

    // 3. Récupération du document
    const [docRows] = await db.query('SELECT * FROM entreprise_patient_documents WHERE id = ?', [docId]);
    const doc = docRows[0];
    if (!doc) {
      return res.status(404).json({ message: 'Document introuvable' });
    }

    // 4. Contrôle d'autorisation par catégorie (refus par défaut)
    if (!canUserAccessCategory(user.role, doc.categorie)) {
      console.warn(`[SECURITY ALERT] Tentative d'accès non autorisé au document #${doc.id} (catégorie: ${doc.categorie}) par l'utilisateur #${user.id} (${user.role})`);
      return res.status(403).json({
        message: 'Accès refusé : Votre rôle n\'est pas autorisé à accéder à cette catégorie de document.',
      });
    }

    // 5. Vérification du fichier physique (protection anti directory-traversal)
    const filename = doc?.nom_fichier || doc?.nom_original || '';
    if (!filename) {
      return res.status(404).json({ message: 'Fichier physique introuvable sur le serveur' });
    }
    const safeBasename = path.basename(filename);
    const filePath = path.join(PATIENTS_UPLOADS_DIR, safeBasename);
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(path.resolve(PATIENTS_UPLOADS_DIR)) || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: 'Fichier physique introuvable sur le serveur' });
    }

    // 6. Journal d'audit (consultation/téléchargement)
    const action = req.query.download === 'true' ? 'telechargement' : 'consultation';
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

    await logDocumentAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      action,
      documentId: doc.id,
      documentName: doc.nom_original,
      documentCategory: doc.categorie,
      patientId: doc.patient_id,
      entrepriseId: doc.entreprise_id,
      ip: clientIp,
      userAgent: req.headers['user-agent'],
    });

    // 7. Envoi sécurisé du fichier
    res.setHeader('Content-Type', doc.type_mime || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    if (req.query.download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.nom_original)}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.nom_original)}"`);
    }

    return res.sendFile(resolvedPath);
  } catch (err) {
    console.error('Error serving signed document:', err);
    return res.status(500).json({ message: 'Erreur serveur lors de la récupération du document' });
  }
});

// ── GET /api/documents/audit-logs (Administrateur uniquement) ────
router.get('/audit-logs', authenticate, authorize('administrateur'), async (req, res) => {
  try {
    const logs = await getDocumentAuditLogs({
      limit: req.query.limit,
      documentId: req.query.document_id,
      patientId: req.query.patient_id,
      entrepriseId: req.query.entreprise_id,
    });
    res.json({ logs });
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    res.status(500).json({ message: 'Erreur lors de la récupération des journaux d\'audit' });
  }
});

module.exports = router;
