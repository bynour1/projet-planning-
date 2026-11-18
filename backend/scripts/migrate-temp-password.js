const pool = require('../config/db');

async function run() {
  console.log('[Migration Temp Password] Vérification des colonnes must_change_password et temp_password_expires_at...');
  const conn = await pool.getConnection();
  try {
    const [cols1] = await conn.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_password'
    `);
    if (cols1.length === 0) {
      await conn.query('ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) DEFAULT 0 AFTER first_login');
      console.log('[Migration Temp Password] Colonne must_change_password ajoutée.');
    } else {
      console.log('[Migration Temp Password] Colonne must_change_password existe déjà.');
    }

    const [cols2] = await conn.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'temp_password_expires_at'
    `);
    if (cols2.length === 0) {
      await conn.query('ALTER TABLE users ADD COLUMN temp_password_expires_at DATETIME NULL DEFAULT NULL AFTER must_change_password');
      console.log('[Migration Temp Password] Colonne temp_password_expires_at ajoutée.');
    } else {
      console.log('[Migration Temp Password] Colonne temp_password_expires_at existe déjà.');
    }

    // Synchroniser must_change_password = 1 pour les comptes ayant first_login = 1
    await conn.query('UPDATE users SET must_change_password = 1 WHERE first_login = 1 AND must_change_password = 0');

    console.log('[Migration Temp Password] Migration terminée avec succès.');
  } catch (err) {
    console.error('[Migration Temp Password] Erreur :', err.message);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
}

run();
