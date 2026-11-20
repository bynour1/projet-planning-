const crypto = require('crypto');

// Catégories autorisées pour le Responsable HSE
const HSE_CATEGORIES = new Set([
  'rapport_hse',
  'hse',
  'etude_poste',
  'visite_lieux',
]);

// Catégories du dossier médical
const MEDICAL_CATEGORIES = new Set([
  'certificat',
  'bilan',
  'radio',
  'ecg',
  'audiogramme',
  'fiche_aptitude',
  'ordonnance',
  'medical',
  'autre',
  'cin',
]);

function isHseCategory(category) {
  if (!category) return false;
  return HSE_CATEGORIES.has(String(category).toLowerCase().trim());
}

function isMedicalCategory(category) {
  // Tout ce qui n'est pas explicitement un Rapport HSE relève du dossier médical par défaut (refus par défaut)
  return !isHseCategory(category);
}

/**
 * Vérifie si un rôle utilisateur a le droit d'accéder à une catégorie de document
 * @param {string} role
 * @param {string} category
 * @returns {boolean}
 */
function canUserAccessCategory(role, category) {
  if (!role) return false;
  const r = String(role).toLowerCase().trim();

  // Technicien et Chauffeur : aucun accès aux documents (médicaux ou HSE)
  if (r === 'technicien' || r === 'chauffeur') {
    return false;
  }

  // Administrateur et Médecin : accès complet (dossier médical + rapports HSE)
  if (r === 'administrateur' || r === 'medecin') {
    return true;
  }

  // Rôle HSE : accès UNIQUEMENT aux rapports HSE
  if (r === 'hse') {
    return isHseCategory(category);
  }

  // Tout autre rôle : refus par défaut
  return false;
}

/**
 * Middleware vérifiant les autorisations de rôle pour les documents en fonction de la catégorie
 * @param {'list'|'upload'|'view'|'download'|'delete'} action
 */
function authorizeDocumentAction(action = 'view') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    const role = req.user.role;

    // 1. Technicien et chauffeur : AUCUN accès aux documents
    if (role === 'technicien' || role === 'chauffeur') {
      return res.status(403).json({
        message: 'Accès refusé : Les techniciens et chauffeurs n\'ont pas accès aux documents.',
      });
    }

    // 2. Administrateur et médecin : toujours autorisés
    if (role === 'administrateur' || role === 'medecin') {
      return next();
    }

    // 3. Rôle HSE :
    if (role === 'hse') {
      // Pour la liste : la route filtre automatiquement par catégorie HSE
      if (action === 'list') {
        return next();
      }

      // Pour l'upload : vérifier la catégorie soumise
      if (action === 'upload') {
        const cat = req.body?.categorie || 'autre';
        if (!isHseCategory(cat)) {
          return res.status(403).json({
            message: 'Accès refusé : Le rôle HSE n\'est pas autorisé à téléverser des documents médicaux.',
          });
        }
        return next();
      }

      // Pour view, download, delete : la vérification fine de la catégorie du document se fait avec les données de la base
      return next();
    }

    // Refus par défaut
    return res.status(403).json({ message: 'Accès interdit pour ce rôle' });
  };
}

/**
 * Génère une URL signée d'une durée de validité de 5 minutes (300 secondes)
 * @param {Object} doc - Document de la table entreprise_patient_documents
 * @param {Object} user - Utilisateur connecté
 * @param {Object} req - Requête Express
 * @returns {string}
 */
function generateSignedDocumentUrl(doc, user, req) {
  const secret = process.env.JWT_SECRET || 'gmt-secret-doc-key';
  const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutes = 300 secondes
  const payload = `${doc.id}:${user.id}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const tokenData = {
    d: doc.id,
    u: user.id,
    e: expiresAt,
    s: hmac,
  };

  const token = Buffer.from(JSON.stringify(tokenData)).toString('base64url');
  return `/api/documents/signed-access?token=${token}`;
}

/**
 * Vérifie l'authenticité et la validité temporelle d'un jeton d'accès signé
 * @param {string} token
 * @returns {{ docId: number, userId: number } | null}
 */
function verifySignedDocumentToken(token) {
  if (!token || typeof token !== 'string') return null;

  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    const docId = Number(parsed.d);
    const userId = Number(parsed.u);
    const exp = Number(parsed.e);
    const sig = String(parsed.s || '');

    if (!docId || !userId || !exp || !sig) return null;

    // Vérifier l'expiration (5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (now > exp) {
      return null; // Jeton expiré
    }

    const secret = process.env.JWT_SECRET || 'gmt-secret-doc-key';
    const payload = `${docId}:${userId}:${exp}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return { docId, userId };
    }
    return null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  HSE_CATEGORIES,
  MEDICAL_CATEGORIES,
  isHseCategory,
  isMedicalCategory,
  canUserAccessCategory,
  authorizeDocumentAction,
  generateSignedDocumentUrl,
  verifySignedDocumentToken,
};
