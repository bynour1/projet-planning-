const pool = require('../config/db');

async function run() {
  console.log('[Migration] Vérification et création des tables trusted_devices, refresh_tokens, push_subscriptions...');
  const conn = await pool.getConnection();
  try {
    // 1. Table trusted_devices
    await conn.query(`
      CREATE TABLE IF NOT EXISTS trusted_devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        user_agent VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        INDEX idx_trusted_user (user_id),
        INDEX idx_trusted_token_hash (token_hash),
        CONSTRAINT fk_trusted_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Migration] ✅ Table trusted_devices prête.');

    // 2. Table refresh_tokens
    await conn.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        trusted_device_id INT NULL,
        is_trusted TINYINT(1) DEFAULT 0,
        user_agent VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL DEFAULT NULL,
        INDEX idx_refresh_user (user_id),
        INDEX idx_refresh_token_hash (token_hash),
        CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Migration] ✅ Table refresh_tokens prête.');

    // 3. Table push_subscriptions
    await conn.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        endpoint TEXT NOT NULL,
        endpoint_hash VARCHAR(64) NOT NULL UNIQUE,
        p256dh VARCHAR(255) NOT NULL,
        auth VARCHAR(255) NOT NULL,
        user_agent VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_active_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_push_at DATETIME NULL DEFAULT NULL,
        INDEX idx_push_user (user_id),
        INDEX idx_push_endpoint_hash (endpoint_hash),
        CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Migration] ✅ Table push_subscriptions prête.');

    console.log('[Migration] 🎉 Toutes les tables ont été créées avec succès !');
  } catch (err) {
    console.error('[Migration] ❌ Erreur :', err.message);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
}

run();
