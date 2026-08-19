/**
 * seed.js — Crée l'admin + les comptes de démonstration
 * Usage : node seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('./config/db');

const USERS = [
  // ─── ADMINISTRATEUR ───────────────────────────────────────
  {
    prenom:    'Admin',
    nom:       'Système',
    email:     'admin@planning.com',
    password:  'Admin123!',
    role:      'administrateur',
    is_active: 1,
    first_login: 0,
  },

  // ─── MÉDECINS ─────────────────────────────────────────────
  {
    prenom:    'Sophie',
    nom:       'Benali',
    email:     'sophie.benali@planning.com',
    password:  'Medecin123!',
    role:      'medecin',
    is_active: 1,
    first_login: 0,
  },
  {
    prenom:    'Karim',
    nom:       'Mansouri',
    email:     'karim.mansouri@planning.com',
    password:  'Medecin123!',
    role:      'medecin',
    is_active: 1,
    first_login: 0,
  },
  {
    prenom:    'Leila',
    nom:       'Trabelsi',
    email:     'leila.trabelsi@planning.com',
    password:  'Medecin123!',
    role:      'medecin',
    is_active: 1,
    first_login: 0,
  },

  // ─── TECHNICIENS ──────────────────────────────────────────
  {
    prenom:    'Youssef',
    nom:       'Hamdi',
    email:     'youssef.hamdi@planning.com',
    password:  'Tech123!',
    role:      'technicien',
    is_active: 1,
    first_login: 0,
  },
  {
    prenom:    'Nadia',
    nom:       'Cherif',
    email:     'nadia.cherif@planning.com',
    password:  'Tech123!',
    role:      'technicien',
    is_active: 1,
    first_login: 0,
  },
];

async function seed() {
  console.log('\n🌱  Initialisation des comptes...\n');

  try {
    // Vider les tables dépendantes d'abord
    await db.query('DELETE FROM messages');
    await db.query('DELETE FROM planning_events');
    await db.query('DELETE FROM clino_mobile');
    await db.query('DELETE FROM events');
    await db.query('DELETE FROM codes');
    await db.query('DELETE FROM users');

    const created = [];

    for (const u of USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      await db.query(
        `INSERT INTO users (nom, prenom, email, password, role, is_active, first_login)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [u.nom, u.prenom, u.email, hash, u.role, u.is_active, u.first_login]
      );
      created.push(u);
    }

    // ─── Affichage du tableau récap ─────────────────────────
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log('│                  COMPTES CRÉÉS AVEC SUCCÈS                      │');
    console.log('├──────────────────┬──────────────────────────────┬───────────────┤');
    console.log('│  Rôle            │  Email                       │  Mot de passe │');
    console.log('├──────────────────┼──────────────────────────────┼───────────────┤');
    for (const u of created) {
      const role  = u.role.padEnd(16);
      const email = u.email.padEnd(28);
      const pwd   = u.password.padEnd(13);
      console.log(`│  ${role}  │  ${email}  │  ${pwd}  │`);
    }
    console.log('└──────────────────┴──────────────────────────────┴───────────────┘');
    console.log('\n⚠️  Changez les mots de passe après la première connexion !');
    console.log('✅  Serveur prêt — lancez : npm run dev\n');

  } catch (err) {
    console.error('❌  Erreur :', err.message);
  } finally {
    process.exit(0);
  }
}

seed();
