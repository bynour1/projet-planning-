require('dotenv').config();
const nodemailer = require('nodemailer');
const db         = require('../config/db');

// ─── Email transporter ─────────────────────────────────────────
function getTransporter() {
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').trim();

  if (process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
  }

  // Optimized for Render / Cloud host environment (supports port 587 & service: 'gmail')
  if (process.env.EMAIL_SERVICE === 'gmail' || !process.env.EMAIL_SERVICE) {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // STARTTLS
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
    });
  }

  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: { user, pass },
  });
}

// Helper: Obtenir l'adresse expéditeur officielle (Compte Administration GMT Ariana)
function getFromAddress(prefix = 'Administration') {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@gmt-ariana.tn';
  return `"GMT Ariana — ${prefix}" <${adminEmail}>`;
}

// ─── Twilio SMS client ─────────────────────────────────────────
function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN ||
      process.env.TWILIO_ACCOUNT_SID.startsWith('ACxxxxxxx')) {
    return null;
  }
  try {
    const twilio = require('twilio');
    return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch {
    return null;
  }
}

// Send SMS to a single phone number
async function sendSMS(to, message) {
  const client = getTwilioClient();
  if (!client || !to) return;
  try {
    let phone = String(to).trim();
    if (!phone.startsWith('+')) phone = '+216' + phone.replace(/^0+/, '');
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to:   phone,
    });
  } catch (err) {
    console.warn('[SMS] Envoi impossible à', to, ':', err.message);
  }
}

// Send WhatsApp message to a single phone number
async function sendWhatsApp(to, message) {
  const client = getTwilioClient();
  if (!client || !to) return false;
  try {
    let phone = String(to).trim();
    if (!phone.startsWith('+')) phone = '+216' + phone.replace(/^0+/, '');

    const fromWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER 
      ? (process.env.TWILIO_WHATSAPP_NUMBER.startsWith('whatsapp:') ? process.env.TWILIO_WHATSAPP_NUMBER : `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`)
      : 'whatsapp:+14155238886'; // Default Twilio Sandbox WhatsApp number

    await client.messages.create({
      body: message,
      from: fromWhatsApp,
      to:   `whatsapp:${phone}`,
    });
    console.log(`[WhatsApp] ✅ Message envoyé avec succès à whatsapp:${phone}`);
    return true;
  } catch (err) {
    console.warn('[WhatsApp] Envoi impossible à', to, ':', err.message);
    return false;
  }
}

// Helper: Vérifier si l'adresse email est valide et délivrable (pas un domaine factice/test)
function isDeliverableEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return false;
  const domain = trimmed.split('@')[1];
  const blockedDomains = [
    'planning.com',
    'example.com',
    'example.org',
    'example.net',
    'test.com',
    'test.fr',
    'local.dev',
    'localhost',
    'domain.com',
    'fake.com',
    'nomail.com',
  ];
  if (blockedDomains.includes(domain)) return false;
  return true;
}

// Send to all active users (except optionally sender) — Email + SMS
async function notifyAllUsers({ subject, html, smsText = null, excludeId = null }) {
  try {
    const [users] = await db.query(
      'SELECT email, telephone FROM users WHERE is_active = 1' + (excludeId ? ' AND id != ?' : ''),
      excludeId ? [excludeId] : []
    );
    if (!users.length) return;

    // ── Email ──
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const transporter = getTransporter();
      for (const u of users) {
        if (!isDeliverableEmail(u.email)) continue;
        try {
          await transporter.sendMail({
            from:    getFromAddress('Santé au Travail'),
            replyTo: process.env.ADMIN_EMAIL || 'admin@gmt-ariana.tn',
            to:      u.email,
            subject,
            html,
          });
        } catch (err) {
          console.warn(`[Email] Envoi impossible à ${u.email} :`, err.message);
        }
      }
    }

    // ── SMS ──
    if (smsText && getTwilioClient()) {
      const usersWithPhone = users.filter(u => u.telephone);
      for (const u of usersWithPhone) {
        await sendSMS(u.telephone, smsText);
      }
    }
  } catch (err) {
    console.warn('[Notify] Erreur :', err.message);
  }
}

// Notifier uniquement les intervenants assignés (Médecins, Techniciens, Participants spécifiques)
async function notifyAssignedIntervenants({ medecin_id, technicien_id, userIds: extraUserIds = [], subject, html, smsText = null }) {
  try {
    const rawIds = [medecin_id, technicien_id, ...(Array.isArray(extraUserIds) ? extraUserIds : [])].filter(Boolean);
    const userIds = Array.from(new Set(rawIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0)));
    if (!userIds.length) return;

    const [users] = await db.query(
      'SELECT id, email, telephone, prenom, nom FROM users WHERE id IN (?) AND is_active = 1',
      [userIds]
    );
    if (!users.length) return;

    // ── Email ──
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const transporter = getTransporter();
      for (const u of users) {
        if (!isDeliverableEmail(u.email)) continue;
        try {
          await transporter.sendMail({
            from:    getFromAddress('Planning Médical'),
            replyTo: process.env.ADMIN_EMAIL || 'admin@gmt-ariana.tn',
            to:      u.email,
            subject,
            html,
          });
          console.log(`[Planning Notify] ✅ Email envoyé à ${u.email}`);
        } catch (err) {
          console.warn(`[Planning Notify] ⚠️ Envoi impossible à ${u.email} :`, err.message);
        }
      }
    }

    // ── SMS ──
    if (smsText && getTwilioClient()) {
      for (const u of users) {
        if (u.telephone) await sendSMS(u.telephone, smsText);
      }
    }
  } catch (err) {
    console.warn('[notifyAssignedIntervenants] Erreur :', err.message);
  }
}

// Send OTP — Email + SMS
async function sendOTP(email, code, nom, prenom, telephone = null) {
  // Email
  if (process.env.EMAIL_USER && isDeliverableEmail(email)) {
    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from:    getFromAddress('Sécurité'),
        replyTo: process.env.ADMIN_EMAIL || 'admin@gmt-ariana.tn',
        to:      email,
        subject: 'Confirmation de votre compte — GMT Ariana',
        text:    `Bonjour ${prenom} ${nom},\n\nVotre compte GMT Ariana a été créé.\nCode de confirmation : ${code}\nCe code expire dans 15 minutes.\n\nGMT Ariana — Groupement de Médecine du Travail`,
        html: `
          <div style="font-family:DM Sans,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
            <div style="text-align:center;margin-bottom:24px">
              <div style="display:inline-block;background:#0284c7;border-radius:10px;padding:10px 20px">
                <span style="color:#ffffff;font-size:16px;font-weight:700">GMT Ariana — Santé de l'employé</span>
              </div>
            </div>
            <p style="font-size:15px;color:#0f172a">Bonjour <strong>${prenom} ${nom}</strong>,</p>
            <p style="color:#475569;font-size:14px;line-height:1.5">Votre compte a été créé. Voici votre code de confirmation :</p>
            <div style="font-size:36px;font-weight:900;letter-spacing:10px;color:#0f172a;background:#f1f5f9;padding:20px;border-radius:10px;text-align:center;margin:20px 0;border:1px solid #e2e8f0">
              ${code}
            </div>
            <p style="color:#64748b;font-size:13px;text-align:center">⏱ Ce code expire dans <strong>15 minutes</strong>.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:12px;color:#94a3b8;text-align:center">GMT Ariana — Groupement de Médecine du Travail de l'Ariana</p>
          </div>`,
      });
    } catch (err) {
      console.warn('[Email OTP] :', err.message);
    }
  }

  // SMS & WhatsApp OTP
  if (telephone) {
    const msg = `GMT Ariana 🏥\nVotre code de confirmation : ${code}\n(Valable 15 minutes)`;
    await sendSMS(telephone, msg);
    await sendWhatsApp(telephone, msg);
  }
}

// Send password reset link — Email + SMS + WhatsApp
async function sendPasswordReset(email, nom, prenom, token, telephone = null) {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

  // Email
  if (process.env.EMAIL_USER && isDeliverableEmail(email)) {
    try {
      const transporter = getTransporter();
      const info = await transporter.sendMail({
        from:    getFromAddress('Sécurité Compte'),
        replyTo: process.env.ADMIN_EMAIL || 'admin@gmt-ariana.tn',
        to:      email,
        subject: 'Réinitialisation de mot de passe — GMT Ariana',
        text:    `Bonjour ${prenom} ${nom},\n\nVous avez demandé une réinitialisation de votre mot de passe pour accéder à votre espace GMT Ariana.\nLien de réinitialisation : ${resetUrl}\nCe lien expire dans 1 heure.\n\nSi vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.\n\nGMT Ariana`,
        html: `
          <div style="font-family:DM Sans,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
            <div style="text-align:center;margin-bottom:24px">
              <div style="display:inline-block;background:#0284c7;border-radius:12px;padding:12px 24px">
                <span style="color:#ffffff;font-size:18px;font-weight:800">GMT Ariana</span>
              </div>
            </div>
            <p style="font-size:15px;color:#0f172a">Bonjour <strong>${prenom} ${nom}</strong>,</p>
            <p style="color:#475569;font-size:14px;line-height:1.5">Vous avez demandé une réinitialisation de votre mot de passe pour accéder à votre espace GMT Ariana.</p>
            <div style="text-align:center;margin:24px 0">
              <a href="${resetUrl}" style="background:#0284c7;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
                Réinitialiser mon mot de passe
              </a>
            </div>
            <p style="color:#64748b;font-size:13px">⏱ Ce lien de sécurité expire dans <strong>1 heure</strong>.</p>
            <p style="color:#94a3b8;font-size:12px">Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:11px;color:#94a3b8;word-break:break-all">Lien direct : ${resetUrl}</p>
          </div>`,
      });
      console.log(`[Email Reset] Envoyé avec succès à ${email} (ID: ${info.messageId})`);
    } catch (err) {
      console.error(`[Email Reset] Erreur envoi à ${email}:`, err.message);
    }
  }

  // SMS & WhatsApp reset link
  if (telephone) {
    const msg = `GMT Ariana 🏥\nRéinitialisez votre mot de passe ici :\n${resetUrl}\n(Lien valable 1 heure)`;
    await sendSMS(telephone, msg);
    await sendWhatsApp(telephone, msg);
  }
}

// Planning notification email HTML
function planningEmailHtml({ titre, date, heure_debut, heure_fin, adresse, medecin_nom, technicien_nom, createdBy }) {
  return `
    <div style="font-family:DM Sans,sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:36px">📋</div>
        <h2 style="color:#1e3a8a;margin:8px 0">Nouvelle intervention planifiée</h2>
        <p style="font-size:12px;color:#64748b;margin:0">GMT Ariana — Groupement de Médecine du Travail</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${titre       ? `<tr><td style="padding:8px;color:#64748b;width:40%">📌 Titre</td><td style="padding:8px;font-weight:600">${titre}</td></tr>` : ''}
        <tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">📅 Date</td><td style="padding:8px;font-weight:600">${date}</td></tr>
        ${heure_debut ? `<tr><td style="padding:8px;color:#64748b">⏰ Horaire</td><td style="padding:8px;font-weight:600">${heure_debut}${heure_fin ? ' → ' + heure_fin : ''}</td></tr>` : ''}
        ${adresse     ? `<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">📍 Adresse</td><td style="padding:8px;font-weight:600">${adresse}</td></tr>` : ''}
        ${medecin_nom ? `<tr><td style="padding:8px;color:#64748b">👨‍⚕️ Médecin</td><td style="padding:8px;font-weight:600">${medecin_nom}</td></tr>` : ''}
        ${technicien_nom ? `<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">🔧 Technicien</td><td style="padding:8px;font-weight:600">${technicien_nom}</td></tr>` : ''}
      </table>
      <div style="margin-top:20px;padding:12px;background:#dbeafe;border-radius:8px;font-size:13px;color:#1e40af">
        ✍️ Ajouté par <strong>${createdBy}</strong> — connectez-vous pour voir le planning complet.
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
      <p style="font-size:12px;color:#94a3b8;text-align:center">GMT Ariana — Santé de l'employé</p>
    </div>`;
}

// Planning SMS text
function planningSmsText({ titre, date, heure_debut, heure_fin, adresse }) {
  let msg = `GMT Ariana - Nouvelle intervention\n📅 ${date}`;
  if (heure_debut) msg += ` à ${heure_debut}${heure_fin ? '-' + heure_fin : ''}`;
  if (titre)       msg += `\n📌 ${titre}`;
  if (adresse)     msg += `\n📍 ${adresse}`;
  return msg;
}

// Calendar event notification email HTML
function eventEmailHtml({ titre, type, date_debut, date_fin, lieu, createdBy }) {
  const typeLabels = { ponctuel: 'Ponctuel', reunion: 'Réunion', formation: 'Formation', conges: 'Congés', autre: 'Autre' };
  return `
    <div style="font-family:DM Sans,sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:36px">📅</div>
        <h2 style="color:#1e3a8a;margin:8px 0">Nouvel événement au calendrier</h2>
        <p style="font-size:12px;color:#64748b;margin:0">GMT Ariana — Groupement de Médecine du Travail</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px;color:#64748b;width:40%">📌 Titre</td><td style="padding:8px;font-weight:600">${titre}</td></tr>
        <tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">🏷 Type</td><td style="padding:8px;font-weight:600">${typeLabels[type] || type}</td></tr>
        <tr><td style="padding:8px;color:#64748b">📅 Début</td><td style="padding:8px;font-weight:600">${new Date(date_debut).toLocaleString('fr-FR')}</td></tr>
        ${date_fin ? `<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">📅 Fin</td><td style="padding:8px;font-weight:600">${new Date(date_fin).toLocaleString('fr-FR')}</td></tr>` : ''}
        ${lieu ? `<tr><td style="padding:8px;color:#64748b">📍 Lieu</td><td style="padding:8px;font-weight:600">${lieu}</td></tr>` : ''}
      </table>
      <div style="margin-top:20px;padding:12px;background:#fef9c3;border-radius:8px;font-size:13px;color:#92400e">
        ✍️ Ajouté par <strong>${createdBy}</strong> — connectez-vous pour voir le calendrier complet.
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
      <p style="font-size:12px;color:#94a3b8;text-align:center">GMT Ariana — Santé de l'employé</p>
    </div>`;
}

// Welcome Email with temporary password and OTP
async function sendWelcomeEmail({ email, prenom, nom, tempPassword, otp, telephone = null }) {
  let emailSent = false;

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS && isDeliverableEmail(email)) {
    console.log(`[Email Welcome] Tentative d'envoi à ${email}...`);
    const appUrl = process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')
      ? process.env.FRONTEND_URL
      : null;

    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: getFromAddress('Administration'),
      replyTo: process.env.ADMIN_EMAIL || 'admin@gmt-ariana.tn',
      to: email,
      subject: 'Vos identifiants de connexion — GMT Ariana',
      text: `Bonjour ${prenom} ${nom},\n\nUn compte a été créé pour vous sur la plateforme GMT Ariana.\n\nVos identifiants de connexion :\nIdentifiant (Email) : ${email}\nMot de passe initial : ${tempPassword}\nCode de confirmation : ${otp} (valable 15 minutes)\n${appUrl ? '\nLien d\'accès : ' + appUrl : ''}\n\nLors de votre première connexion, il vous sera demandé de modifier votre mot de passe.\n\nGMT Ariana`,
      html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px;background:#ffffff">
            <h2 style="color:#0284c7;margin-top:0">GMT Ariana — Médecine du Travail</h2>
            <p style="font-size:15px;color:#0f172a">Bonjour <strong>${prenom} ${nom}</strong>,</p>
            <p style="color:#475569;font-size:14px">Un compte a été créé pour vous sur la plateforme du <strong>Groupement de Médecine du Travail de l'Ariana</strong>.</p>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:0 0 10px;font-size:14px;font-weight:bold;color:#166534">Vos informations de connexion :</p>
              <p style="margin:4px 0;font-size:14px"><strong>Email :</strong> ${email}</p>
              <p style="margin:4px 0;font-size:14px"><strong>Mot de passe initial :</strong> <code style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-size:15px;font-weight:bold">${tempPassword}</code></p>
            </div>

            <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin:20px 0;text-align:center">
              <p style="margin:0 0 8px;font-size:13px;color:#475569">Code de confirmation (OTP) :</p>
              <div style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#0f172a">${otp}</div>
              <p style="margin:8px 0 0;font-size:12px;color:#94a3b8">Valable pendant 15 minutes.</p>
            </div>

            ${appUrl ? `
            <div style="text-align:center;margin:20px 0">
              <a href="${appUrl}/login" style="background:#0284c7;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block">
                Accéder à la plateforme
              </a>
            </div>` : ''}

            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:12px;color:#94a3b8;line-height:1.4">
              Pour des raisons de sécurité, veuillez changer votre mot de passe dès votre première connexion.
            </p>
          </div>
        `,
    });
    console.log(`[Email Welcome] ✅ Envoyé avec succès à ${email} (ID: ${info.messageId})`);
    emailSent = true;
  } else if (!isDeliverableEmail(email)) {
    console.warn(`[Email Welcome] ⚠️ Email ignoré (adresse test ou domaine factice non délivrable) : ${email}`);
  } else {
    console.warn('[Email Welcome] ⚠️ EMAIL_USER ou EMAIL_PASS non configuré !');
  }

  // SMS & WhatsApp
  if (telephone) {
    const msg = `GMT Ariana 🏥\nBonjour ${prenom} ${nom} !\nVotre compte a été créé.\n\nEmail : ${email}\nMot de passe provisoire : ${tempPassword}\nCode OTP : ${otp}\n(Valable 15 minutes)`;
    await sendSMS(telephone, msg);
    await sendWhatsApp(telephone, msg);
  }

  return emailSent;
}

module.exports = {
  getTransporter,
  getFromAddress,
  notifyAllUsers,
  notifyAssignedIntervenants,
  sendOTP,
  sendPasswordReset,
  sendWelcomeEmail,
  sendSMS,
  sendWhatsApp,
  planningEmailHtml,
  planningSmsText,
  eventEmailHtml,
  isDeliverableEmail,
};
