/**
 * seed.js — Initialisation sécurisée du compte administrateur
 * Usage : node seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db     = require('./config/db');

async function seed() {
  console.log('\n🔒  Vérification / Initialisation du compte Administrateur...\n');

  try {
    const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || process.env.EMAIL_USER || 'admin@gmt-ariana.tn').trim();
    const adminPassword = (process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(8).toString('hex') + 'A1!').trim();

    const [existing] = await db.query('SELECT id, email FROM users WHERE role = ? LIMIT 1', ['administrateur']);
    
    if (existing.length > 0) {
      console.log(`ℹ️  Un administrateur existe déjà dans la base (${existing[0].email}).`);
      console.log('Aucune modification apportée.');
      return;
    }

    const hash = await bcrypt.hash(adminPassword, 10);
    await db.query(
      `INSERT INTO users (nom, prenom, email, password, role, is_active, first_login)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['Ariana', 'Admin', adminEmail, hash, 'administrateur', 1, 0]
    );

    console.log('✅ Compte Administrateur initial créé avec succès :');
    console.log(`- Email : ${adminEmail}`);
    if (process.env.INITIAL_ADMIN_PASSWORD) {
      console.log('- Mot de passe : [Défini par INITIAL_ADMIN_PASSWORD]');
    } else {
      console.log(`- Mot de passe généré : ${adminPassword}`);
    }
    console.log('\n⚠️  Veuillez vous connecter et modifier vos accès si nécessaire.\n');

  } catch (err) {
    console.error('❌  Erreur :', err.message);
  } finally {
    process.exit(0);
  }
}

seed();

