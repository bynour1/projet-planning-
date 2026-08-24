const nodemailer = require('nodemailer');
const db         = require('../config/db');

// ─── Email transporter ─────────────────────────────────────────
function getTransporter() {
  if (process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 465,
      secure: process.env.EMAIL_SECURE === 'true' || Number(process.env.EMAIL_PORT) === 465,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  // Default to reliable Gmail SSL on port 465
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    tls: { rejectUnauthorized: false }
  });
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
    // Normalize phone number (add + if missing)
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
        if (!u.email || !u.email.includes('@')) continue;
        try {
          await transporter.sendMail({
            from:    `"GMT Ariana 🏥" <${process.env.EMAIL_USER}>`,
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

// Send OTP — Email + SMS
async function sendOTP(email, code, nom, prenom, telephone = null) {
  // Email
  if (process.env.EMAIL_USER) {
    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from:    `"GMT Ariana 🏥" <${process.env.EMAIL_USER}>`,
        to:      email,
        subject: '🔑 Confirmation de votre compte — GMT Ariana',
        html: `
          <div style="font-family:DM Sans,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
            <div style="text-align:center;margin-bottom:24px">
              <div style="font-size:40px">🏥</div>
              <h2 style="color:#1e3a8a;margin:8px 0">GMT Ariana — Santé de l'employé</h2>
            </div>
            <p>Bonjour <strong>${prenom} ${nom}</strong>,</p>
            <p>Votre compte a été créé. Voici votre code de confirmation :</p>
            <div style="font-size:36px;font-weight:900;letter-spacing:10px;color:#0f172a;background:#f1f5f9;padding:20px;border-radius:10px;text-align:center;margin:20px 0">
              ${code}
            </div>
            <p style="color:#64748b;font-size:13px">⏱ Ce code expire dans <strong>15 minutes</strong>.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:12px;color:#94a3b8;text-align:center">GMT Ariana — Groupement de Médecine du Travail de l'Ariana</p>
          </div>`,
      });
    } catch (err) {
      console.warn('[Email OTP] :', err.message);
    }
  }

  // SMS OTP
  if (telephone) {
    await sendSMS(telephone, `GMT Ariana - Votre code de confirmation : ${code}\nValable 15 minutes. Ne le partagez pas.`);
  }
}

// Send password reset link — Email + SMS
async function sendPasswordReset(email, nom, prenom, token, telephone = null) {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

  // Email
  if (process.env.EMAIL_USER) {
    try {
      const transporter = getTransporter();
      const info = await transporter.sendMail({
        from:    `"GMT Ariana 🏥" <${process.env.EMAIL_USER}>`,
        to:      email,
        subject: '🔒 Réinitialisation de mot de passe — GMT Ariana',
        html: `
          <div style="font-family:DM Sans,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
            <div style="text-align:center;margin-bottom:24px">
              <div style="display:inline-block;background:#0284c7;border-radius:12px;padding:12px 24px">
                <span style="color:#ffffff;font-size:18px;font-weight:800">🏥 GMT Ariana</span>
              </div>
            </div>
            <p style="font-size:15px;color:#0f172a">Bonjour <strong>${prenom} ${nom}</strong>,</p>
            <p style="color:#475569;font-size:14px;line-height:1.5">Vous avez demandé une réinitialisation de votre mot de passe pour accéder à votre espace GMT Ariana.</p>
            <div style="text-align:center;margin:24px 0">
              <a href="${resetUrl}" style="background:#0284c7;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
                🔑 Réinitialiser mon mot de passe
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

  // SMS reset link
  if (telephone) {
    await sendSMS(telephone, `GMT Ariana - Réinitialisez votre mot de passe ici :\n${resetUrl}\nLien valable 1 heure.`);
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
  const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      const transporter = getTransporter();
      const info = await transporter.sendMail({
        from: `"GMT Ariana 🏥" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '🏥 Vos identifiants de connexion — GMT Ariana',
        html: `
          <div style="font-family:DM Sans,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
            <div style="text-align:center;margin-bottom:24px">
              <div style="display:inline-block;background:#0284c7;border-radius:12px;padding:12px 24px">
                <span style="color:#ffffff;font-size:18px;font-weight:800">🏥 GMT Ariana — Médecine du Travail</span>
              </div>
            </div>
            <p style="font-size:15px;color:#0f172a">Bonjour <strong>${prenom} ${nom}</strong>,</p>
            <p style="color:#475569;font-size:14px;line-height:1.5">Un compte a été créé pour vous sur la plateforme officielle du <strong>Groupement de Médecine du Travail de l'Ariana</strong>.</p>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;margin:20px 0">
              <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#166534">🔑 Vos informations de connexion :</p>
              <table style="width:100%;font-size:14px;border-collapse:collapse">
                <tr><td style="color:#64748b;padding:6px 0;width:40%">Identifiant (Email) :</td><td style="font-weight:700;color:#0f172a">${email}</td></tr>
                <tr><td style="color:#64748b;padding:6px 0">Mot de passe initial :</td><td><code style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:6px;font-size:15px;font-weight:800;letter-spacing:1px">${tempPassword}</code></td></tr>
              </table>
            </div>

            <div style="text-align:center;margin:20px 0">
              <a href="${loginUrl}" style="background:#0284c7;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">
                🚀 Accéder à la plateforme
              </a>
            </div>

            <p style="font-size:13px;color:#475569;margin-top:20px">Pour finaliser l'activation de votre compte, communiquez ce <strong>code de confirmation</strong> à votre administrateur :</p>
            <div style="font-size:32px;font-weight:900;letter-spacing:8px;color:#0f172a;background:#f8fafc;padding:16px;border-radius:10px;text-align:center;margin:12px 0;border:2px dashed #cbd5e1">
              ${otp}
            </div>
            <p style="color:#94a3b8;font-size:12px;text-align:center">⏱ Ce code de confirmation expire dans 15 minutes.</p>

            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:12px;color:#94a3b8;text-align:center;line-height:1.4">
              ⚠️ Lors de votre première connexion, il vous sera demandé de choisir un nouveau mot de passe personnalisé.<br/>
              Ne partagez jamais vos identifiants.
            </p>
          </div>
        `,
      });
      console.log(`[Email Welcome] Envoyé à ${email} (ID: ${info.messageId})`);
    } catch (err) {
      console.error(`[Email Welcome] Erreur envoi à ${email}:`, err.message);
    }
  }

  // SMS
  if (telephone) {
    await sendSMS(telephone,
      `GMT Ariana - Bonjour ${prenom} ${nom} !\nVotre compte a été créé.\nEmail : ${email}\nMot de passe provisoire : ${tempPassword}\nCode de confirmation : ${otp}\nValable 15 min.`
    );
  }
}

module.exports = {
  getTransporter,
  notifyAllUsers,
  sendOTP,
  sendPasswordReset,
  sendWelcomeEmail,
  sendSMS,
  planningEmailHtml,
  planningSmsText,
  eventEmailHtml,
};
