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
  role        ENUM('administrateur', 'medecin', 'technicien') NOT NULL,
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
  id          INT AUTO_INCREMENT PRIMARY KEY,
  date        DATE         NOT NULL,
  heure       TIME         NOT NULL,
  adresse     VARCHAR(255) NOT NULL,
  medecin_id  INT          DEFAULT NULL,
  medecin_nom VARCHAR(255) DEFAULT NULL,
  commentaire TEXT         DEFAULT NULL,
  FOREIGN KEY (medecin_id) REFERENCES users(id) ON DELETE SET NULL
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
