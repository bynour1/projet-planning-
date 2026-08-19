const nodemailer = require('nodemailer');
const db         = require('../config/db');

// ─── Email transporter ─────────────────────────────────────────
function getTransporter() {
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
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
      try {
        const transporter = getTransporter();
        await transporter.sendMail({
          from:    `"GMT Ariana 🏥" <${process.env.EMAIL_USER}>`,
          to:      users.map(u => u.email).join(','),
          subject,
          html,
        });
      } catch (err) {
        console.warn('[Email] Envoi impossible :', err.message);
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
      await transporter.sendMail({
        from:    `"GMT Ariana 🏥" <${process.env.EMAIL_USER}>`,
        to:      email,
        subject: '🔒 Réinitialisation de mot de passe — GMT Ariana',
        html: `
          <div style="font-family:DM Sans,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
            <div style="text-align:center;margin-bottom:24px">
              <div style="font-size:40px">🔒</div>
              <h2 style="color:#1e3a8a;margin:8px 0">GMT Ariana</h2>
            </div>
            <p>Bonjour <strong>${prenom} ${nom}</strong>,</p>
            <p>Vous avez demandé une réinitialisation de votre mot de passe.</p>
            <div style="text-align:center;margin:24px 0">
              <a href="${resetUrl}" style="background:#1e3a8a;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
                🔑 Réinitialiser mon mot de passe
              </a>
            </div>
            <p style="color:#64748b;font-size:13px">⏱ Ce lien expire dans <strong>1 heure</strong>.</p>
            <p style="color:#64748b;font-size:13px">Si vous n'avez pas fait cette demande, ignorez cet email.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:12px;color:#94a3b8;word-break:break-all">Lien : ${resetUrl}</p>
          </div>`,
      });
    } catch (err) {
      console.warn('[Email Reset] :', err.message);
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

module.exports = {
  notifyAllUsers,
  sendOTP,
  sendPasswordReset,
  sendSMS,
  planningEmailHtml,
  planningSmsText,
  eventEmailHtml,
};
