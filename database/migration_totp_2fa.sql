-- ================================================================
--  Migration TOTP 2FA (Two-Factor Authentication)
--  Base : planning
-- ================================================================

-- ─── Colonnes TOTP dans users ──────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS totp_enabled TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS totp_last_step BIGINT DEFAULT NULL;

-- ─── Table CODES DE SECOURS (Backup Codes) ─────────────────────
CREATE TABLE IF NOT EXISTS totp_backup_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  used_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_totp_backup_user (user_id),
  CONSTRAINT fk_totp_backup_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
