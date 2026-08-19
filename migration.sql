-- ================================================================
--  Planning Médical — Migration à exécuter dans phpMyAdmin
--  Base : planning
-- ================================================================

-- ─── Table ROUTINES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routines (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  title      VARCHAR(255) NOT NULL,
  time       VARCHAR(10)  DEFAULT NULL,
  days       VARCHAR(200) DEFAULT '[]',
  active     TINYINT(1)   DEFAULT 1,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Colonne commentaire dans planning_events ─────────────────────
ALTER TABLE planning_events
  ADD COLUMN IF NOT EXISTS commentaire TEXT DEFAULT NULL;

-- ─── Colonne type dans messages (pour fichiers) ───────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'text';

-- ─── ENTREPRISES CONVENTIONNÉES ──────────────────────────────
CREATE TABLE IF NOT EXISTS entreprises (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  nom          VARCHAR(255) NOT NULL,
  secteur      VARCHAR(100) DEFAULT NULL,
  adresse      VARCHAR(255) DEFAULT NULL,
  telephone    VARCHAR(50)  DEFAULT NULL,
  email        VARCHAR(255) DEFAULT NULL,
  site_web     VARCHAR(255) DEFAULT NULL,
  description  TEXT         DEFAULT NULL,
  convensionne TINYINT(1)   DEFAULT 1,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ─── AVIS SUR LES ENTREPRISES ────────────────────────────────
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

-- ─── Colonne téléphone dans users ────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telephone VARCHAR(30) DEFAULT NULL AFTER email;

