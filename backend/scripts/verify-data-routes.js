// backend/scripts/verify-data-routes.js
// Script de vérification exhaustif des routes de données (Data Routes)
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../app');
const db = require('../config/db');

async function testDataRoutes() {
  console.log('====================================================');
  console.log('🔍 AUDIT ET VÉRIFICATION DES ROUTES DE DONNÉES (DATA ROUTES)');
  console.log('====================================================\n');

  try {
    // 1. Utilisateur administrateur réel
    const [adminRows] = await db.query("SELECT id, email, role, nom, prenom, token_version FROM users WHERE role = 'administrateur' AND is_active = 1 LIMIT 1");
    if (!adminRows.length) {
      console.error('❌ Aucun compte administrateur actif trouvé dans la base.');
      process.exit(1);
    }
    const admin = adminRows[0];
    const adminToken = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role, nom: admin.nom, prenom: admin.prenom, token_version: admin.token_version || 1 },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );
    console.log(`👤 Administrateur test : ${admin.prenom} ${admin.nom} (${admin.email})`);

    // 2. Médecin réel
    const [medecinRows] = await db.query("SELECT id, email, role, nom, prenom, token_version FROM users WHERE role = 'medecin' AND is_active = 1 LIMIT 1");
    let medecinToken = null;
    if (medecinRows.length) {
      const medecin = medecinRows[0];
      medecinToken = jwt.sign(
        { id: medecin.id, email: medecin.email, role: medecin.role, nom: medecin.nom, prenom: medecin.prenom, token_version: medecin.token_version || 1 },
        process.env.JWT_SECRET,
        { expiresIn: '2h' }
      );
      console.log(`👨‍⚕️ Médecin test        : ${medecin.prenom} ${medecin.nom} (${medecin.email})`);
    }

    // Récupérer un ID d'entreprise pour tester le détail
    const [entList] = await db.query('SELECT id, nom FROM entreprises LIMIT 1');
    const firstEntId = entList[0]?.id || 1;

    console.log('\n--- Vérification des endpoints de données de l\'API ---');

    const endpoints = [
      { name: 'Planning (Interventions)', url: '/api/planning', method: 'get', token: adminToken },
      { name: 'Planning (Mes visites)', url: '/api/planning/mine', method: 'get', token: medecinToken || adminToken },
      { name: 'Événements Calendrier', url: '/api/events', method: 'get', token: adminToken },
      { name: 'Clino (Sorties Clinique)', url: '/api/clino', method: 'get', token: adminToken },
      { name: 'Entreprises (Adhérents)', url: '/api/entreprises', method: 'get', token: adminToken },
      { name: 'Entreprise Détail & Visites', url: `/api/entreprises/${firstEntId}`, method: 'get', token: adminToken },
      { name: 'Dashboard Résumé', url: '/api/stats/dashboard-summary', method: 'get', token: adminToken },
      { name: 'Stats Mensuelles', url: '/api/stats/monthly', method: 'get', token: adminToken },
      { name: 'Stats par Médecin', url: '/api/stats/by-medecin', method: 'get', token: adminToken },
      { name: 'Utilisateurs (Annuaire)', url: '/api/users', method: 'get', token: adminToken },
      { name: 'Utilisateurs par rôle', url: '/api/users/by-role/medecin', method: 'get', token: adminToken },
      { name: 'Routines hebdomadaires', url: '/api/routines', method: 'get', token: adminToken },
      { name: 'Recherche Globale', url: '/api/search?q=gmt', method: 'get', token: adminToken },
      { name: 'Chat (Messages)', url: '/api/chat/messages', method: 'get', token: adminToken },
    ];

    let passedCount = 0;
    let failedCount = 0;

    for (const ep of endpoints) {
      try {
        const reqBuilder = request(app)[ep.method](ep.url);
        if (ep.token) reqBuilder.set('Authorization', `Bearer ${ep.token}`);
        const res = await reqBuilder;

        if (res.status >= 200 && res.status < 300) {
          const detail = Array.isArray(res.body)
            ? `${res.body.length} enregistrements`
            : (typeof res.body === 'object' && res.body !== null
                ? `${Object.keys(res.body).length} champs`
                : 'OK');
          console.log(`✅ [${res.status}] ${ep.name.padEnd(28)} ${ep.url.padEnd(36)} -> ${detail}`);
          passedCount++;
        } else {
          console.error(`❌ [${res.status}] ${ep.name.padEnd(28)} ${ep.url.padEnd(36)} -> ${JSON.stringify(res.body)}`);
          failedCount++;
        }
      } catch (err) {
        console.error(`💥 [ERR] ${ep.name.padEnd(28)} ${ep.url.padEnd(36)} -> ${err.message}`);
        failedCount++;
      }
    }

    console.log('\n====================================================');
    console.log(`RÉSULTAT DE L'AUDIT DES ROUTES DE DONNÉES : ${passedCount}/${endpoints.length} routes 100% opérationnelles.`);
    console.log('====================================================');

    process.exit(failedCount > 0 ? 1 : 0);
  } catch (err) {
    console.error('Erreur globale script:', err);
    process.exit(1);
  }
}

testDataRoutes();
