-- ============================================================================
-- MIGRATION COLONNES POUR TIDB (COMPATIBLE MYSQL & TIDB)
-- Fichier 2/2 : Ajout de colonnes sans procédure stockée
-- Base de données : planning
--
-- RÈGLES DE SÉCURITÉ :
-- - Aucun DROP, DELETE ni TRUNCATE
-- - Une instruction par ligne
-- - Valeur par défaut 0 pour must_change_password pour ne bloquer aucun compte existant
-- - Le rôle ENUM n'est pas modifié ici (fourni séparément)
-- ============================================================================

-- Table users
ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN temp_password_expires_at DATETIME NULL DEFAULT NULL;
ALTER TABLE users ADD COLUMN totp_enabled TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_secret_enc TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN totp_last_step BIGINT DEFAULT NULL;
ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN avatar VARCHAR(255) DEFAULT NULL;
ALTER TABLE users ADD COLUMN telephone VARCHAR(30) DEFAULT NULL;
ALTER TABLE users ADD COLUMN biometric_credential TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN first_login TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_login DATETIME NULL DEFAULT NULL;

-- Table codes
ALTER TABLE codes ADD COLUMN attempts INT NOT NULL DEFAULT 0;
ALTER TABLE codes MODIFY COLUMN code VARCHAR(64) NOT NULL;

-- Table entreprises
ALTER TABLE entreprises ADD COLUMN code VARCHAR(100) DEFAULT NULL;
ALTER TABLE entreprises ADD COLUMN secteur VARCHAR(255) DEFAULT NULL;
ALTER TABLE entreprises ADD COLUMN adresse TEXT DEFAULT NULL;
ALTER TABLE entreprises ADD COLUMN telephone VARCHAR(255) DEFAULT NULL;
ALTER TABLE entreprises ADD COLUMN email VARCHAR(255) DEFAULT NULL;
ALTER TABLE entreprises ADD COLUMN site_web VARCHAR(255) DEFAULT NULL;
ALTER TABLE entreprises ADD COLUMN description TEXT DEFAULT NULL;
ALTER TABLE entreprises ADD COLUMN convensionne TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE entreprises ADD COLUMN date_debut_convention DATE DEFAULT NULL;
ALTER TABLE entreprises ADD COLUMN date_fin_convention DATE DEFAULT NULL;
ALTER TABLE entreprises ADD COLUMN renouvelable TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE entreprises ADD COLUMN annee_campagne INT DEFAULT 2026;
ALTER TABLE entreprises ADD COLUMN date_derniere_visite DATE DEFAULT NULL;
ALTER TABLE entreprises ADD COLUMN effectif_total INT NOT NULL DEFAULT 0;
ALTER TABLE entreprises ADD COLUMN nb_visites_faites INT NOT NULL DEFAULT 0;
ALTER TABLE entreprises ADD COLUMN nb_bilans_faits INT NOT NULL DEFAULT 0;
ALTER TABLE entreprises ADD COLUMN nb_bilans_manquants INT NOT NULL DEFAULT 0;

-- Table planning_events
ALTER TABLE planning_events ADD COLUMN commentaire TEXT DEFAULT NULL;
ALTER TABLE planning_events ADD COLUMN is_clino TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE planning_events ADD COLUMN clino_id INT DEFAULT NULL;
ALTER TABLE planning_events ADD COLUMN entreprise_id INT DEFAULT NULL;
ALTER TABLE planning_events ADD COLUMN nb_examines INT NOT NULL DEFAULT 0;
ALTER TABLE planning_events ADD COLUMN nb_embauche INT NOT NULL DEFAULT 0;
ALTER TABLE planning_events ADD COLUMN nb_periodique INT NOT NULL DEFAULT 0;
ALTER TABLE planning_events ADD COLUMN nb_reprise INT NOT NULL DEFAULT 0;
ALTER TABLE planning_events ADD COLUMN nb_spontanee INT NOT NULL DEFAULT 0;
ALTER TABLE planning_events ADD COLUMN statut VARCHAR(30) NOT NULL DEFAULT 'confirme';
ALTER TABLE planning_events ADD COLUMN type VARCHAR(50) NOT NULL DEFAULT 'visite';

-- Table clino_mobile
ALTER TABLE clino_mobile ADD COLUMN titre VARCHAR(255) DEFAULT NULL;
ALTER TABLE clino_mobile ADD COLUMN technicien_id INT DEFAULT NULL;
ALTER TABLE clino_mobile ADD COLUMN technicien_nom VARCHAR(255) DEFAULT NULL;
ALTER TABLE clino_mobile ADD COLUMN medecin_nom VARCHAR(255) DEFAULT NULL;
ALTER TABLE clino_mobile ADD COLUMN planning_id INT DEFAULT NULL;
ALTER TABLE clino_mobile ADD COLUMN nb_examines INT NOT NULL DEFAULT 0;
ALTER TABLE clino_mobile ADD COLUMN entreprise_id INT DEFAULT NULL;
ALTER TABLE clino_mobile MODIFY COLUMN heure TIME NULL DEFAULT NULL;

-- Table events
ALTER TABLE events ADD COLUMN medecin_id INT DEFAULT NULL;
ALTER TABLE events ADD COLUMN technicien_id INT DEFAULT NULL;
ALTER TABLE events ADD COLUMN is_clino TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN clino_id INT DEFAULT NULL;
ALTER TABLE events ADD COLUMN participants TEXT DEFAULT NULL;

-- Table messages
ALTER TABLE messages ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'text';
