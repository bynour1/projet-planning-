-- ================================================================
--  Planning Médical — Base Schema Definition
--  Base : planning
-- ================================================================

CREATE DATABASE IF NOT EXISTS planning;
USE planning;

-- ─── Table USERS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nom         VARCHAR(255) NOT NULL,
  prenom      VARCHAR(255) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  telephone   VARCHAR(30)  DEFAULT NULL,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('administrateur', 'medecin', 'technicien', 'chauffeur') NOT NULL,
  avatar      VARCHAR(255) DEFAULT NULL,
  totp_enabled TINYINT(1)   DEFAULT 0,
  biometric_credential TEXT DEFAULT NULL,
  is_active   TINYINT(1)   DEFAULT 0,
  first_login TINYINT(1)   DEFAULT 1,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;


-- ─── Table CODES (OTP) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS codes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  code        VARCHAR(10)  NOT NULL,
  expires_at  TIMESTAMP    DEFAULT (CURRENT_TIMESTAMP + INTERVAL 15 MINUTE),
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ─── Table PASSWORD_RESETS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_resets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  token       VARCHAR(255) NOT NULL,
  used        TINYINT(1)   DEFAULT 0,
  expires_at  TIMESTAMP    DEFAULT (CURRENT_TIMESTAMP + INTERVAL 1 HOUR),
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ─── Table PLANNING_EVENTS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning_events (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  titre         VARCHAR(255) DEFAULT NULL,
  date          DATE         NOT NULL,
  heure_debut   TIME         DEFAULT NULL,
  heure_fin     TIME         DEFAULT NULL,
  adresse       VARCHAR(255) DEFAULT NULL,
  medecin_id    INT          DEFAULT NULL,
  technicien_id INT          DEFAULT NULL,
  FOREIGN KEY (medecin_id)    REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (technicien_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ─── Table EVENTS (Calendar) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  titre       VARCHAR(255) NOT NULL,
  type        VARCHAR(50)  DEFAULT 'ponctuel',
  date_debut  DATETIME     NOT NULL,
  date_fin    DATETIME     DEFAULT NULL,
  lieu        VARCHAR(255) DEFAULT NULL,
  recurrence  VARCHAR(50)  DEFAULT 'none',
  created_by  INT          DEFAULT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ─── Table CLINO_MOBILE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clino_mobile (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  date           DATE         NOT NULL,
  heure          TIME         NOT NULL,
  adresse        VARCHAR(255) NOT NULL,
  medecin_id     INT          DEFAULT NULL,
  technicien_id  INT          DEFAULT NULL,
  medecin_nom    VARCHAR(255) DEFAULT NULL,
  technicien_nom VARCHAR(255) DEFAULT NULL,
  commentaire    TEXT         DEFAULT NULL,
  FOREIGN KEY (medecin_id)    REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (technicien_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ─── Table MESSAGES (Chat) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL,
  nom         VARCHAR(255) DEFAULT NULL,
  role        VARCHAR(50)  DEFAULT NULL,
  content     TEXT         NOT NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Table ENTREPRISES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entreprises (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  nom                   VARCHAR(255) NOT NULL,
  secteur               VARCHAR(100) DEFAULT NULL,
  adresse               VARCHAR(255) DEFAULT NULL,
  telephone             VARCHAR(50)  DEFAULT NULL,
  email                 VARCHAR(255) DEFAULT NULL,
  site_web              VARCHAR(255) DEFAULT NULL,
  description           TEXT         DEFAULT NULL,
  convensionne          TINYINT(1)   DEFAULT 1,
  date_debut_convention DATE         DEFAULT NULL,
  date_fin_convention   DATE         DEFAULT NULL,
  renouvelable          TINYINT(1)   DEFAULT 0,
  annee_campagne        INT          DEFAULT 2026,
  date_derniere_visite  DATE         DEFAULT NULL,
  effectif_total        INT          DEFAULT 0,
  nb_visites_faites     INT          DEFAULT 0,
  nb_bilans_faits       INT          DEFAULT 0,
  nb_bilans_manquants   INT          DEFAULT 0,
  created_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ─── Table ENTREPRISE_CAMPAGNES_ANNUELLES (Historique) ───────────
CREATE TABLE IF NOT EXISTS entreprise_campagnes_annuelles (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  entreprise_id     INT NOT NULL,
  annee             INT NOT NULL,
  effectif_total    INT NOT NULL,
  nb_visites_faites INT NOT NULL,
  nb_bilans_faits   INT DEFAULT 0,
  taux_realisation  DECIMAL(5,2) DEFAULT 0,
  date_cloture      DATE NOT NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entreprise_id) REFERENCES entreprises(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Table ENTREPRISE_AVIS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS entreprise_avis (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  entreprise_id  INT NOT NULL,
  user_id        INT NOT NULL,
  note           TINYINT(1) DEFAULT NULL COMMENT '1 à 5 étoiles',
  commentaire    TEXT NOT NULL,
  type_avis      ENUM('avis','remarque','suggestion') DEFAULT 'avis',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entreprise_id) REFERENCES entreprises(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE
) ENGINE=InnoDB;


