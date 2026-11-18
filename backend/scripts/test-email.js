#!/usr/bin/env node
/**
 * scripts/test-email.js
 * Script de test d'envoi d'email via Brevo SMTP pour GMT Ariana
 * 
 * Usage : node scripts/test-email.js <destinataire@exemple.com>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const nodemailer = require('nodemailer');

const PERSONAL_EMAIL_REGEX = /@(gmail\.com|yahoo\.[a-z]+|hotmail\.[a-z]+|outlook\.[a-z]+)$/i;

async function main() {
  const recipient = (process.argv[2] || '').trim();
  const emailProvider = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const isGmail = emailProvider === 'gmail';

  console.log('================================================================');
  if (isGmail) {
    console.log('🧪 GMT Ariana — Test d\'envoi SMTP Gmail dédié');
  } else {
    console.log('🧪 GMT Ariana — Test d\'envoi SMTP Professionnel (Brevo)');
  }
  console.log('================================================================');

  if (isGmail) {
    console.warn('\n⚠️ Mode Gmail dédié : usage interne, environ 500 emails/jour');
  }

  if (!recipient || !recipient.includes('@') || !recipient.includes('.')) {
    console.error('\n❌ Erreur : Veuillez fournir une adresse email de test valide.');
    console.error('👉 Usage : node scripts/test-email.js destinataire@exemple.com\n');
    process.exit(1);
  }

  const host    = isGmail ? 'smtp.gmail.com' : (process.env.EMAIL_HOST || 'smtp-relay.brevo.com').trim();
  const port    = isGmail ? 465 : (Number(process.env.EMAIL_PORT) || 587);
  const secure  = isGmail ? true : (process.env.EMAIL_SECURE === 'true' || port === 465);
  const user    = (process.env.EMAIL_USER || '').trim();
  const pass    = (process.env.EMAIL_PASS || '').trim();
  const from    = (process.env.EMAIL_FROM || '').trim();
  const replyTo = (process.env.EMAIL_REPLY_TO || '').trim() || undefined;

  const effectiveFrom = from || (isGmail && user ? `"GMT Ariana" <${user}>` : '');

  console.log(`\n📋 Paramètres détectés :`);
  console.log(`   - Fournisseur  : ${isGmail ? 'Gmail (service: gmail)' : 'Brevo SMTP standard'}`);
  console.log(`   - Serveur SMTP : ${host}:${port} (secure: ${secure})`);
  console.log(`   - Identifiant  : ${user ? user.slice(0, 4) + '***' : '(NON DÉFINI)'}`);
  console.log(`   - Expéditeur   : ${effectiveFrom || '(NON DÉFINI)'}`);
  console.log(`   - Destinataire : ${recipient}`);
  if (replyTo) {
    console.log(`   - Reply-To     : ${replyTo}`);
  }

  // 1. Validation de l'expéditeur
  if (isGmail) {
    // Mode Gmail dédié : l'expéditeur est EMAIL_USER (règle Google)
    if (!effectiveFrom) {
      console.error('\n❌ ERREUR : La variable EMAIL_USER ou EMAIL_FROM est requise dans backend/.env !');
      process.exit(1);
    }
    const match = effectiveFrom.match(/<([^>]+)>/) || [null, effectiveFrom];
    const rawFromEmail = (match[1] || effectiveFrom).trim();
    if (user && rawFromEmail.toLowerCase() !== user.toLowerCase()) {
      console.warn(`\n⚠️ AVERTISSEMENT : Gmail impose que l'expéditeur corresponde à EMAIL_USER (${user}).`);
      console.warn(`   EMAIL_FROM actuel (${rawFromEmail}) a une adresse différente et sera probablement écrasé par Gmail.`);
    }
    console.log(`\n🔒 Mode Gmail validé : Expéditeur "${rawFromEmail}" (pas de blocage @gmail.com).`);
  } else {
    // Mode Brevo standard : validation du domaine professionnel
    if (!from) {
      console.error('\n❌ ERREUR : La variable EMAIL_FROM est vide dans votre fichier backend/.env !');
      console.error('👉 Veuillez définir : EMAIL_FROM="GMT Ariana" <no-reply@votre-domaine.tn>');
      process.exit(1);
    }

    const match = from.match(/<([^>]+)>/) || [null, from];
    const rawFromEmail = (match[1] || from).trim();

    if (PERSONAL_EMAIL_REGEX.test(rawFromEmail)) {
      console.error(`\n❌ ERREUR DE SÉCURITÉ : L'expéditeur "${rawFromEmail}" est une adresse personnelle !`);
      console.error('⛔ Conformément à la règle principale, aucun email ne doit être envoyé depuis Gmail, Yahoo, Hotmail ou Outlook.');
      console.error('👉 Utilisez obligatoirement une adresse de votre domaine professionnel dans EMAIL_FROM.\n');
      console.error('💡 Astuce : Pour activer le mode d\'envoi Gmail dédié (usage interne), définissez EMAIL_PROVIDER=gmail dans backend/.env.\n');
      process.exit(1);
    }

    console.log(`\n🔒 Règle de domaine validée : L'expéditeur "${rawFromEmail}" est bien un domaine professionnel.`);
  }

  // 2. Validation des identifiants SMTP
  if (!user || !pass || user.includes('votre_login') || pass.includes('votre_cle')) {
    console.error('\n❌ ERREUR : Identifiants EMAIL_USER ou EMAIL_PASS manquants dans backend/.env !');
    if (isGmail) {
      console.error('👉 Renseignez votre adresse Gmail et votre mot de passe d\'application (16 caractères) dans backend/.env.');
    } else {
      console.error('👉 Renseignez vos identifiants Brevo SMTP dans backend/.env avant de tester.');
    }
    process.exit(1);
  }

  // 3. Connexion au serveur SMTP
  console.log(`\n⏳ [1/2] Test de connexion et d'authentification au serveur ${isGmail ? 'Gmail (smtp.gmail.com)' : 'Brevo'}...`);
  const transporter = isGmail
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
        connectionTimeout: 15000,
      })
    : nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 15000,
      });

  try {
    await transporter.verify();
    console.log(`✅ Connexion SMTP ${isGmail ? 'Gmail' : 'Brevo'} validée avec succès !`);
  } catch (err) {
    console.error(`\n❌ Échec d'authentification SMTP ${isGmail ? 'Gmail' : 'Brevo'} :`);
    console.error({
      code: err.code,
      message: err.message,
      response: err.response,
    });
    process.exit(1);
  }

  // 4. Envoi de l'email de test
  console.log(`\n⏳ [2/2] Envoi de l'e-mail de test à ${recipient}...`);
  try {
    const subject = isGmail
      ? '✅ Test réussi — Service Email Gmail Dédié GMT Ariana'
      : '✅ Test réussi — Service Email Brevo GMT Ariana';

    const info = await transporter.sendMail({
      from: effectiveFrom,
      ...(replyTo ? { replyTo } : {}),
      to: recipient,
      subject,
      text: `Bonjour,\n\nCeci est un email de test confirmant que la configuration ${isGmail ? 'Gmail Dédié' : 'Brevo SMTP'} de la plateforme GMT Ariana fonctionne parfaitement.\n\nExpéditeur officiel : ${effectiveFrom}\nDestinataire : ${recipient}\n\nGroupement de Médecine du Travail de l'Ariana`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;padding:28px;border:1px solid #e2e8f0;border-radius:10px;background:#ffffff">
          <div style="text-align:center;margin-bottom:20px">
            <h2 style="color:#0284c7;margin:0">✅ Configuration ${isGmail ? 'Gmail Dédié' : 'Brevo'} Validée</h2>
            <p style="color:#64748b;font-size:13px;margin:4px 0">GMT Ariana — Plateforme Médicale</p>
          </div>
          <p>Bonjour,</p>
          <p>Ce message confirme que votre passerelle email <strong>${isGmail ? 'Gmail Dédié' : 'Brevo SMTP'}</strong> est correctement configurée et opérationnelle.</p>
          <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0;font-size:13px;margin:20px 0">
            <p style="margin:4px 0"><strong>Fournisseur :</strong> ${isGmail ? 'Gmail (smtp.gmail.com)' : 'Brevo'}</p>
            <p style="margin:4px 0"><strong>Expéditeur :</strong> ${effectiveFrom}</p>
            <p style="margin:4px 0"><strong>Destinataire :</strong> ${recipient}</p>
            ${replyTo ? `<p style="margin:4px 0"><strong>Répondre à (Reply-To) :</strong> ${replyTo}</p>` : ''}
            <p style="margin:4px 0"><strong>Serveur SMTP :</strong> ${host}:${port}</p>
          </div>
          ${isGmail ? `
          <p style="font-size:13px;color:#854d0e;background:#fefce8;border:1px solid #fef08a;padding:10px;border-radius:6px">
            ℹ️ Mode Gmail dédié actif : réservé à un usage interne (environ 500 emails/jour maximum).
          </p>` : `
          <p style="font-size:13px;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;padding:10px;border-radius:6px">
            🔒 Expéditeur validé : Domaine professionnel certifié Brevo.
          </p>`}
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
          <p style="color:#94a3b8;font-size:11px;text-align:center">GMT Ariana — Groupement de Médecine du Travail de l'Ariana</p>
        </div>
      `,
    });

    console.log('\n================================================================');
    console.log('🎉 E-MAIL ENVOYÉ AVEC SUCCÈS !');
    console.log('================================================================');
    console.log(`🆔 Message ID   : ${info.messageId}`);
    console.log(`📧 Expéditeur   : ${effectiveFrom}`);
    console.log(`📬 Destinataire : ${recipient}`);
    console.log('\n📋 Liste de vérification :');
    console.log('   1. Vérifiez la boîte de réception de ' + recipient);
    console.log('   2. Vérifiez le dossier Spam / Courrier indésirable');
    if (!isGmail) {
      console.log('   3. Consultez le tableau de bord Brevo (Transactional → Logs) pour suivre la délivrabilité en temps réel.');
    }
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ Échec de l\'envoi du message :');
    console.error({
      code: err.code,
      message: err.message,
      response: err.response,
    });
    process.exit(1);
  }
}

main();
