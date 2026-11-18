/**
 * Script CLI d'urgence pour réinitialiser la double authentification (2FA TOTP)
 * d'un compte utilisateur en cas de perte de téléphone ou de verrouillage.
 *
 * Utilisation :
 *   cd backend
 *   node scripts/reset-user-2fa.js <email-ou-id-utilisateur>
 *
 * Exemple :
 *   node scripts/reset-user-2fa.js admin@gmt-ariana.tn
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/db');

async function resetUser2FA() {
  const target = process.argv[2];

  if (!target || !target.trim()) {
    console.error('\n❌ Paramètre manquant.');
    console.log('Usage : node scripts/reset-user-2fa.js <email-ou-id>');
    console.log('Exemple : node scripts/reset-user-2fa.js admin@gmt-ariana.tn\n');
    process.exit(1);
  }

  const queryParam = target.trim();
  const isNumeric = /^\d+$/.test(queryParam);

  try {
    const [rows] = await db.query(
      isNumeric
        ? 'SELECT id, email, nom, prenom, role, totp_enabled FROM users WHERE id = ?'
        : 'SELECT id, email, nom, prenom, role, totp_enabled FROM users WHERE LOWER(email) = LOWER(?)',
      [queryParam]
    );

    if (!rows.length) {
      console.error(`\n❌ Aucun utilisateur trouvé pour : "${queryParam}".\n`);
      process.exit(1);
    }

    const user = rows[0];

    console.log('\n======================================================');
    console.log(' 🛡️  GMT ARIANA — RÉINITIALISATION D\'URGENCE 2FA TOTP');
    console.log('======================================================');
    console.log(`Utilisateur : ${user.prenom} ${user.nom}`);
    console.log(`Email       : ${user.email}`);
    console.log(`Rôle        : ${user.role}`);
    console.log(`Statut 2FA  : ${user.totp_enabled ? 'Activée (1)' : 'Désactivée (0)'}`);
    console.log('------------------------------------------------------');

    // 1. Réinitialiser la table users
    await db.query(
      'UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL, totp_last_step = NULL WHERE id = ?',
      [user.id]
    );

    // 2. Supprimer tous les codes de secours
    const [deleteResult] = await db.query(
      'DELETE FROM totp_backup_codes WHERE user_id = ?',
      [user.id]
    );

    // 3. Révoquer tous les appareils de confiance, biométriques et sessions
    await db.query('DELETE FROM trusted_devices WHERE user_id = ?', [user.id]);
    await db.query('DELETE FROM webauthn_credentials WHERE user_id = ?', [user.id]);
    await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [user.id]);

    console.log(`✅ 2FA TOTP désactivée avec succès.`);
    console.log(`✅ Secret chiffré révoqué et supprimé.`);
    console.log(`✅ Codes de secours supprimés (${deleteResult.affectedRows} code(s) purgé(s)).`);
    console.log(`✅ Appareils biométriques (WebAuthn) révoqués.`);
    console.log(`✅ Appareils de confiance et sessions actives révoqués.`);
    console.log('------------------------------------------------------');
    console.log(`L'utilisateur peut maintenant se reconnecter avec son mot de passe`);
    console.log(`et reconfigurer son application Authenticator.`);
    console.log('======================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Erreur lors de la réinitialisation :', err.message, '\n');
    process.exit(1);
  }
}

resetUser2FA();
