require('dotenv').config();
const db = require('./config/db');
async function migrate() {
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(255) NULL');
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled TINYINT(1) DEFAULT 0');
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_credential TEXT NULL');
  try {
    await db.query("ALTER TABLE users MODIFY COLUMN role ENUM('administrateur', 'medecin', 'technicien', 'chauffeur') NOT NULL");
  } catch (err) {
    console.warn('Role column modification note:', err.message);
  }
  console.log('Migration done');
  process.exit(0);
}
migrate().catch(e => { console.error(e); process.exit(1); });
