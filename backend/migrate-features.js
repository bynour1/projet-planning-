require('dotenv').config();
const db = require('./config/db');
async function migrate() {
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(255) NULL');
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled TINYINT(1) DEFAULT 0');
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_credential TEXT NULL');
  try {
    await db.query("ALTER TABLE users MODIFY COLUMN role ENUM('administrateur', 'medecin', 'technicien', 'chauffeur') NOT NULL");
  } catch (err) {
    console.warn('Role column modification note:', err.message);
  }

  // Entreprises : Effectif, Visites médicales, Bilans & Dates Convention
  try {
    await db.query('ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS effectif_total INT DEFAULT 0');
    await db.query('ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS nb_visites_faites INT DEFAULT 0');
    await db.query('ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS nb_bilans_faits INT DEFAULT 0');
    await db.query('ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS nb_bilans_manquants INT DEFAULT 0');
    await db.query('ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS date_debut_convention DATE NULL');
    await db.query('ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS date_fin_convention DATE NULL');
    await db.query('ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS renouvelable TINYINT(1) DEFAULT 1');
    await db.query('ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS annee_campagne INT NULL');
    await db.query('ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS date_derniere_visite DATE NULL');
    await db.query('ALTER TABLE entreprises MODIFY COLUMN telephone VARCHAR(255) NULL');
    await db.query('ALTER TABLE entreprises MODIFY COLUMN secteur VARCHAR(255) NULL');
    await db.query('ALTER TABLE entreprises MODIFY COLUMN adresse TEXT NULL');
    await db.query('ALTER TABLE entreprises MODIFY COLUMN nom VARCHAR(255) NOT NULL');
    await db.query('ALTER TABLE entreprises MODIFY COLUMN code VARCHAR(100) NULL');
  } catch (err) {
    console.warn('Entreprises columns note:', err.message);
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS entreprise_campagnes_annuelles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entreprise_id INT NOT NULL,
        annee INT NOT NULL,
        effectif_total INT DEFAULT 0,
        nb_visites_faites INT DEFAULT 0,
        nb_bilans_faits INT DEFAULT 0,
        taux_realisation DECIMAL(5,2) DEFAULT 0.00,
        date_cloture DATE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (entreprise_id),
        INDEX (annee)
      )
    `);
  } catch (err) {
    console.warn('Campagnes annuelles table note:', err.message);
  }

  console.log('Migration done');
  process.exit(0);
}
migrate().catch(e => { console.error(e); process.exit(1); });
