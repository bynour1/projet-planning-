-- ============================================================================
-- MIGRATION TABLES POUR TIDB (COMPATIBLE MYSQL)
-- Fichier 1/2 : Uniquement les CREATE TABLE IF NOT EXISTS
-- Base de données : planning
--
-- RÈGLES DE SÉCURITÉ :
-- - Aucun DROP, DELETE ni TRUNCATE
-- - Ne bloque pas les tables existantes
-- ============================================================================

-- ─── 1. Table USERS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  prenom VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  telephone VARCHAR(30) DEFAULT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('administrateur', 'medecin', 'technicien', 'chauffeur') NOT NULL,
  avatar VARCHAR(255) DEFAULT NULL,
  totp_enabled TINYINT(1) NOT NULL DEFAULT 0,
  totp_secret_enc TEXT DEFAULT NULL,
  totp_last_step BIGINT DEFAULT NULL,
  biometric_credential TEXT DEFAULT NULL,
  token_version INT NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  first_login TINYINT(1) NOT NULL DEFAULT 0,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  temp_password_expires_at DATETIME NULL DEFAULT NULL,
  last_login DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 2. Table CODES (OTP de confirmation / activation) ───────────────────────
CREATE TABLE IF NOT EXISTS codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_codes_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 3. Table PASSWORD_RESETS (Réinitialisation mot de passe) ────────────────
CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_resets_email (email),
  INDEX idx_resets_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 4. Table TOTP_BACKUP_CODES (Codes de secours 2FA) ───────────────────────
CREATE TABLE IF NOT EXISTS totp_backup_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  used_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_totp_backup_user (user_id),
  CONSTRAINT fk_totp_backup_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 5. Table TRUSTED_DEVICES (Appareils de confiance 30j / 7j) ──────────────
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

-- ─── 6. Table REFRESH_TOKENS (Sessions persistantes avec rotation) ───────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  trusted_device_id INT NULL,
  is_trusted TINYINT(1) NOT NULL DEFAULT 0,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL DEFAULT NULL,
  INDEX idx_refresh_user (user_id),
  INDEX idx_refresh_token_hash (token_hash),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 7. Table WEBAUTHN_CREDENTIALS (Biométrie / Passkeys) ────────────────────
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id VARCHAR(255) PRIMARY KEY,
  user_id INT NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_name VARCHAR(150) NULL,
  transports VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL DEFAULT NULL,
  INDEX idx_webauthn_user (user_id),
  CONSTRAINT fk_webauthn_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 8. Table PUSH_SUBSCRIPTIONS (Web Push / VAPID) ──────────────────────────
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

-- ─── 9. Table ENTREPRISES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entreprises (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  code VARCHAR(100) DEFAULT NULL,
  secteur VARCHAR(255) DEFAULT NULL,
  adresse TEXT DEFAULT NULL,
  telephone VARCHAR(255) DEFAULT NULL,
  email VARCHAR(255) DEFAULT NULL,
  site_web VARCHAR(255) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  convensionne TINYINT(1) NOT NULL DEFAULT 1,
  date_debut_convention DATE DEFAULT NULL,
  date_fin_convention DATE DEFAULT NULL,
  renouvelable TINYINT(1) NOT NULL DEFAULT 1,
  annee_campagne INT DEFAULT 2026,
  date_derniere_visite DATE DEFAULT NULL,
  effectif_total INT NOT NULL DEFAULT 0,
  nb_visites_faites INT NOT NULL DEFAULT 0,
  nb_bilans_faits INT NOT NULL DEFAULT 0,
  nb_bilans_manquants INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 10. Table ENTREPRISE_CAMPAGNES_ANNUELLES ────────────────────────────────
CREATE TABLE IF NOT EXISTS entreprise_campagnes_annuelles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entreprise_id INT NOT NULL,
  annee INT NOT NULL,
  effectif_total INT NOT NULL DEFAULT 0,
  nb_visites_faites INT NOT NULL DEFAULT 0,
  nb_bilans_faits INT NOT NULL DEFAULT 0,
  taux_realisation DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  date_cloture DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_campagnes_ent (entreprise_id),
  INDEX idx_campagnes_annee (annee),
  CONSTRAINT fk_campagnes_ent FOREIGN KEY (entreprise_id) REFERENCES entreprises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 11. Table ENTREPRISE_AVIS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entreprise_avis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entreprise_id INT NOT NULL,
  user_id INT NOT NULL,
  note TINYINT(1) DEFAULT NULL COMMENT '1 à 5 étoiles',
  commentaire TEXT NOT NULL,
  type_avis ENUM('avis','remarque','suggestion') NOT NULL DEFAULT 'avis',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_avis_ent (entreprise_id),
  INDEX idx_avis_user (user_id),
  CONSTRAINT fk_avis_ent FOREIGN KEY (entreprise_id) REFERENCES entreprises(id) ON DELETE CASCADE,
  CONSTRAINT fk_avis_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 12. Table ENTREPRISE_PATIENTS (Salariés des entreprises) ────────────────
CREATE TABLE IF NOT EXISTS entreprise_patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entreprise_id INT NOT NULL,
  nom VARCHAR(255) NOT NULL,
  prenom VARCHAR(255) NOT NULL,
  cin VARCHAR(50) DEFAULT NULL,
  matricule VARCHAR(50) DEFAULT NULL,
  date_naissance DATE DEFAULT NULL,
  genre ENUM('M', 'F') NOT NULL DEFAULT 'M',
  poste VARCHAR(255) DEFAULT NULL,
  departement VARCHAR(255) DEFAULT NULL,
  telephone VARCHAR(50) DEFAULT NULL,
  email VARCHAR(255) DEFAULT NULL,
  statut_visite VARCHAR(50) NOT NULL DEFAULT 'En attente',
  type_visite VARCHAR(100) NOT NULL DEFAULT 'Visite Périodique',
  resultat_visite VARCHAR(50) NOT NULL DEFAULT 'Non effectuée',
  duree_temporaire VARCHAR(100) DEFAULT NULL,
  date_revoir DATE DEFAULT NULL,
  date_derniere_visite DATE DEFAULT NULL,
  medecin_nom VARCHAR(255) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  has_visio TINYINT(1) NOT NULL DEFAULT 0,
  has_audio TINYINT(1) NOT NULL DEFAULT 0,
  has_ecg TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT DEFAULT NULL,
  created_by_nom VARCHAR(255) DEFAULT NULL,
  created_by_role VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_patient_entreprise (entreprise_id),
  INDEX idx_patient_cin (cin),
  INDEX idx_patient_matricule (matricule),
  CONSTRAINT fk_patient_entreprise FOREIGN KEY (entreprise_id) REFERENCES entreprises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 13. Table ENTREPRISE_PATIENT_DOCUMENTS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS entreprise_patient_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  entreprise_id INT NOT NULL,
  nom_fichier VARCHAR(255) NOT NULL,
  nom_original VARCHAR(255) NOT NULL,
  url VARCHAR(500) NOT NULL,
  type_mime VARCHAR(100) DEFAULT NULL,
  taille BIGINT DEFAULT NULL,
  categorie VARCHAR(100) NOT NULL DEFAULT 'autre',
  description TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_doc_patient (patient_id),
  INDEX idx_doc_entreprise (entreprise_id),
  CONSTRAINT fk_doc_patient FOREIGN KEY (patient_id) REFERENCES entreprise_patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_entreprise FOREIGN KEY (entreprise_id) REFERENCES entreprises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 14. Table PLANNING_EVENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titre VARCHAR(255) DEFAULT NULL,
  date DATE NOT NULL,
  heure_debut TIME DEFAULT NULL,
  heure_fin TIME DEFAULT NULL,
  adresse VARCHAR(255) DEFAULT NULL,
  medecin_id INT DEFAULT NULL,
  technicien_id INT DEFAULT NULL,
  entreprise_id INT DEFAULT NULL,
  commentaire TEXT DEFAULT NULL,
  is_clino TINYINT(1) NOT NULL DEFAULT 0,
  clino_id INT DEFAULT NULL,
  nb_examines INT NOT NULL DEFAULT 0,
  nb_embauche INT NOT NULL DEFAULT 0,
  nb_periodique INT NOT NULL DEFAULT 0,
  nb_reprise INT NOT NULL DEFAULT 0,
  nb_spontanee INT NOT NULL DEFAULT 0,
  statut VARCHAR(30) NOT NULL DEFAULT 'confirme',
  type VARCHAR(50) NOT NULL DEFAULT 'visite',
  INDEX idx_pe_date (date),
  INDEX idx_pe_medecin (medecin_id),
  INDEX idx_pe_technicien (technicien_id),
  INDEX idx_pe_entreprise (entreprise_id),
  CONSTRAINT fk_pe_medecin FOREIGN KEY (medecin_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_pe_technicien FOREIGN KEY (technicien_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 15. Table CLINO_MOBILE (Tournées Clino Mobile) ──────────────────────────
CREATE TABLE IF NOT EXISTS clino_mobile (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titre VARCHAR(255) DEFAULT NULL,
  date DATE NOT NULL,
  heure TIME DEFAULT NULL,
  adresse VARCHAR(255) NOT NULL,
  medecin_id INT DEFAULT NULL,
  technicien_id INT DEFAULT NULL,
  medecin_nom VARCHAR(255) DEFAULT NULL,
  technicien_nom VARCHAR(255) DEFAULT NULL,
  commentaire TEXT DEFAULT NULL,
  planning_id INT DEFAULT NULL,
  nb_examines INT NOT NULL DEFAULT 0,
  entreprise_id INT DEFAULT NULL,
  INDEX idx_clino_date (date),
  INDEX idx_clino_medecin (medecin_id),
  INDEX idx_clino_technicien (technicien_id),
  INDEX idx_clino_planning (planning_id),
  CONSTRAINT fk_clino_medecin FOREIGN KEY (medecin_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_clino_technicien FOREIGN KEY (technicien_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 16. Table ENTREPRISE_VISITES (Rapports médicaux et HSE) ─────────────────
CREATE TABLE IF NOT EXISTS entreprise_visites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entreprise_id INT NOT NULL,
  date DATE NOT NULL,
  heure TIME DEFAULT NULL,
  medecin_id INT DEFAULT NULL,
  technicien_id INT DEFAULT NULL,
  medecin_nom VARCHAR(255) DEFAULT NULL,
  technicien_nom VARCHAR(255) DEFAULT NULL,
  type_visite VARCHAR(100) NOT NULL DEFAULT 'Visite Médicale Périodique',
  nb_examines INT NOT NULL DEFAULT 0,
  nb_bilans INT NOT NULL DEFAULT 0,
  nb_visio INT NOT NULL DEFAULT 0,
  nb_audio INT NOT NULL DEFAULT 0,
  nb_ecg INT NOT NULL DEFAULT 0,
  nb_embauche INT NOT NULL DEFAULT 0,
  nb_periodique INT NOT NULL DEFAULT 0,
  nb_reprise INT NOT NULL DEFAULT 0,
  nb_spontanee INT NOT NULL DEFAULT 0,
  statut VARCHAR(50) NOT NULL DEFAULT 'effectuee',
  commentaire TEXT DEFAULT NULL,
  planning_id INT DEFAULT NULL,
  clino_id INT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_by_nom VARCHAR(255) DEFAULT NULL,
  created_by_role VARCHAR(50) DEFAULT NULL,
  lieu_poste VARCHAR(255) DEFAULT NULL,
  risques_identifies TEXT DEFAULT NULL,
  recommandations TEXT DEFAULT NULL,
  rapport_type VARCHAR(50) NOT NULL DEFAULT 'medical',
  patient_id INT DEFAULT NULL,
  patient_nom VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_visites_entreprise (entreprise_id),
  INDEX idx_visites_date (date),
  INDEX idx_visites_planning (planning_id),
  INDEX idx_visites_clino (clino_id),
  INDEX idx_visites_patient (patient_id),
  CONSTRAINT fk_visites_entreprise FOREIGN KEY (entreprise_id) REFERENCES entreprises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 17. Table EVENTS (Calendrier) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titre VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'ponctuel',
  date_debut DATETIME NOT NULL,
  date_fin DATETIME DEFAULT NULL,
  lieu VARCHAR(255) DEFAULT NULL,
  recurrence VARCHAR(50) NOT NULL DEFAULT 'none',
  medecin_id INT DEFAULT NULL,
  technicien_id INT DEFAULT NULL,
  is_clino TINYINT(1) NOT NULL DEFAULT 0,
  clino_id INT DEFAULT NULL,
  participants TEXT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  INDEX idx_events_debut (date_debut),
  CONSTRAINT fk_events_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 18. Table MESSAGES (Chat interne) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  nom VARCHAR(255) DEFAULT NULL,
  role VARCHAR(50) DEFAULT NULL,
  content TEXT NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'text',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_messages_user (user_id),
  INDEX idx_messages_created (created_at),
  CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 19. Table ROUTINES (Rappels récurrents) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS routines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  time VARCHAR(10) DEFAULT NULL,
  days VARCHAR(200) NOT NULL DEFAULT '[]',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_routines_user (user_id),
  CONSTRAINT fk_routines_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
