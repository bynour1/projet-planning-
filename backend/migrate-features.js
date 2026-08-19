require('dotenv').config();
const db = require('./config/db');
async function migrate() {
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(255) NULL');
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled TINYINT(1) DEFAULT 0');
  console.log('Migration done');
  process.exit(0);
}
migrate().catch(e => { console.error(e); process.exit(1); });
