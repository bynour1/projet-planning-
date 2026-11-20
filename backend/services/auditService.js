const db = require('../config/db');

let tableCreated = false;

async function ensureAuditTableExists() {
  if (tableCreated) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS document_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        user_email VARCHAR(255) NULL,
        user_role VARCHAR(50) NOT NULL,
        action VARCHAR(50) NOT NULL,
        document_id INT NULL,
        document_name VARCHAR(255) NULL,
        document_category VARCHAR(100) NULL,
        patient_id INT NULL,
        entreprise_id INT NULL,
        ip_address VARCHAR(100) NULL,
        user_agent VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_user (user_id),
        INDEX idx_audit_doc (document_id),
        INDEX idx_audit_date (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    tableCreated = true;
  } catch (err) {
    // Non-blocking if already created
  }
}

/**
 * Enregistre une entrée dans le journal d'audit des documents
 * @param {Object} params
 * @param {number|null} params.userId
 * @param {string|null} params.userEmail
 * @param {string} params.userRole
 * @param {'consultation'|'telechargement'|'upload'|'suppression'} params.action
 * @param {number|null} params.documentId
 * @param {string|null} params.documentName
 * @param {string|null} params.documentCategory
 * @param {number|null} params.patientId
 * @param {number|null} params.entrepriseId
 * @param {string|null} params.ip
 * @param {string|null} params.userAgent
 */
async function logDocumentAudit({
  userId,
  userEmail,
  userRole,
  action,
  documentId,
  documentName,
  documentCategory,
  patientId,
  entrepriseId,
  ip,
  userAgent,
}) {
  try {
    await ensureAuditTableExists();

    const cleanIp = String(ip || '127.0.0.1').slice(0, 100);
    const cleanUa = userAgent ? String(userAgent).slice(0, 500) : null;
    const cleanAction = String(action || 'consultation').toLowerCase();

    console.log(
      `[AUDIT DOCUMENT] User #${userId || 'anon'} (${userRole || 'inconnu'}) -> ${cleanAction.toUpperCase()} on Doc #${documentId || 'N/A'} ("${documentName || 'Sans titre'}", catégorie: ${documentCategory || 'N/A'}) - IP: ${cleanIp} - Date: ${new Date().toISOString()}`
    );

    await db.query(
      `
      INSERT INTO document_audit_logs (
        user_id, user_email, user_role, action, document_id, document_name,
        document_category, patient_id, entreprise_id, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        userId || null,
        userEmail || null,
        userRole || 'inconnu',
        cleanAction,
        documentId || null,
        documentName || null,
        documentCategory || null,
        patientId || null,
        entrepriseId || null,
        cleanIp,
        cleanUa,
      ]
    );
  } catch (err) {
    console.error('[AUDIT ERROR]:', err.message);
  }
}

/**
 * Récupère les entrées du journal d'audit (réservé administrateur)
 */
async function getDocumentAuditLogs({ limit = 100, documentId = null, patientId = null, entrepriseId = null } = {}) {
  await ensureAuditTableExists();
  let sql = 'SELECT * FROM document_audit_logs WHERE 1=1';
  const params = [];

  if (documentId) {
    sql += ' AND document_id = ?';
    params.push(documentId);
  }
  if (patientId) {
    sql += ' AND patient_id = ?';
    params.push(patientId);
  }
  if (entrepriseId) {
    sql += ' AND entreprise_id = ?';
    params.push(entrepriseId);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Math.min(500, Math.max(1, parseInt(limit, 10) || 100)));

  const [rows] = await db.query(sql, params);
  return rows || [];
}

module.exports = {
  logDocumentAudit,
  getDocumentAuditLogs,
  ensureAuditTableExists,
};
