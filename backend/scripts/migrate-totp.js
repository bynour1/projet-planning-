const pool = require('../config/db');

async function runMigration() {
  console.log('[Migration TOTP] Début de la migration...');
  const connection = await pool.getConnection();
  try {
    // 1. Vérifier et ajouter totp_secret_enc dans users
    const [cols1] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'totp_secret_enc'
    `);
    if (cols1.length === 0) {
      await connection.query(`ALTER TABLE users ADD COLUMN totp_secret_enc TEXT NULL DEFAULT NULL`);
      console.log('[Migration TOTP] Colonne totp_secret_enc ajoutée dans users.');
    } else {
      console.log('[Migration TOTP] Colonne totp_secret_enc existe déjà.');
    }

    // 2. Vérifier et ajouter totp_last_step dans users
    const [cols2] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'totp_last_step'
    `);
    if (cols2.length === 0) {
      await connection.query(`ALTER TABLE users ADD COLUMN totp_last_step BIGINT NULL DEFAULT NULL`);
      console.log('[Migration TOTP] Colonne totp_last_step ajoutée dans users.');
    } else {
      console.log('[Migration TOTP] Colonne totp_last_step existe déjà.');
    }

    // 3. Vérifier et ajouter totp_enabled dans users si absent
    const [cols3] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'totp_enabled'
    `);
    if (cols3.length === 0) {
      await connection.query(`ALTER TABLE users ADD COLUMN totp_enabled TINYINT(1) DEFAULT 0`);
      console.log('[Migration TOTP] Colonne totp_enabled ajoutée dans users.');
    } else {
      console.log('[Migration TOTP] Colonne totp_enabled existe déjà.');
    }

    // 4. Créer la table totp_backup_codes
    await connection.query(`
      CREATE TABLE IF NOT EXISTS totp_backup_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        code_hash VARCHAR(64) NOT NULL,
        used_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_totp_backup_user (user_id),
        CONSTRAINT fk_totp_backup_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Migration TOTP] Table totp_backup_codes vérifiée/créée.');

    console.log('[Migration TOTP] Migration terminée avec succès.');
  } catch (error) {
    console.error('[Migration TOTP] Erreur lors de la migration:', error);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

runMigration();
