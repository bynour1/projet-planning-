require('dotenv').config();
const nodemailer = require('nodemailer');
const db         = require('../config/db');

// ─── Regex de détection d'adresses personnelles ────────────────
const PERSONAL_EMAIL_REGEX = /@(gmail\.com|yahoo\.[a-z]+|hotmail\.[a-z]+|outlook\.[a-z]+)$/i;

// ─── Helpers pour le parsing d'adresses email ───────────────────
function parseEmailAddress(str) {
  if (!str || typeof str !== 'string') return { email: '' };
  const trimmed = str.trim();
  const angledMatch = trimmed.match(/^(?:["']?([^"']+)["']?\s+)?<([^>]+)>$/);
  if (angledMatch) {
    const name = angledMatch[1] ? angledMatch[1].trim() : undefined;
    const email = angledMatch[2].trim();
    return name ? { name, email } : { email };
  }
  const cleanEmail = trimmed.replace(/^["']|["']$/g, '').trim();
  return { email: cleanEmail };
}

function parseRecipients(to) {
  const list = Array.isArray(to) ? to : (typeof to === 'string' ? to.split(',') : []);
  return list
    .map(entry => {
      const parsed = parseEmailAddress(entry);
      if (!parsed.email) return null;
      return parsed.name ? { email: parsed.email, name: parsed.name } : { email: parsed.email };
    })
    .filter(Boolean);
}

// ─── Validation de la configuration email ──────────────────────
function validateMailerConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  const emailProvider = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const isGmailMode = emailProvider === 'gmail';
  const isBrevoApiMode = emailProvider === 'brevo-api' || emailProvider === 'brevo_api';
  const isResendMode = emailProvider === 'resend';
  const emailHost = (process.env.EMAIL_HOST || '').trim();
  const emailUser = (process.env.EMAIL_USER || '').trim();
  const emailPass = (process.env.EMAIL_PASS || '').trim();
  const emailFrom = (process.env.EMAIL_FROM || '').trim();
  const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();

  // Mode Brevo API HTTP (HTTPS Port 443 - Contournement du blocage SMTP Render)
  if (isBrevoApiMode) {
    if (isProd) {
      const missing = [];
      if (!brevoApiKey) missing.push('BREVO_API_KEY');
      if (!emailFrom) missing.push('EMAIL_FROM');

      if (missing.length > 0) {
        const errorMsg = `[Mailer FATAL] Variables d'environnement email manquantes en production (mode Brevo API HTTP) : ${missing.join(', ')}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    }
    return;
  }

  // Mode Resend API HTTP (HTTPS Port 443)
  if (isResendMode) {
    if (isProd) {
      const missing = [];
      if (!resendApiKey) missing.push('RESEND_API_KEY');
      if (!emailFrom) missing.push('EMAIL_FROM');

      if (missing.length > 0) {
        const errorMsg = `[Mailer FATAL] Variables d'environnement email manquantes en production (mode Resend API HTTP) : ${missing.join(', ')}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    }
    return;
  }

  // Mode Gmail dédié : usage interne sans nom de domaine propre
  if (isGmailMode) {
    console.warn('[Mailer] ⚠️ Mode Gmail dédié : usage interne, ~500 emails/jour');

    if (isProd) {
      const missing = [];
      if (!emailUser) missing.push('EMAIL_USER');
      if (!emailPass) missing.push('EMAIL_PASS');

      if (missing.length > 0) {
        const errorMsg = `[Mailer FATAL] Variables d'environnement email manquantes en production (mode Gmail) : ${missing.join(', ')}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    }

    // L'expéditeur doit être EMAIL_USER (règle imposée par Google / Gmail)
    if (emailFrom && emailUser) {
      const match = emailFrom.match(/<([^>]+)>/) || [null, emailFrom];
      const rawFrom = (match[1] || emailFrom).trim().toLowerCase();
      if (rawFrom !== emailUser.toLowerCase()) {
        console.warn(`[Mailer AVERTISSEMENT] Gmail impose que l'expéditeur corresponde à EMAIL_USER (${emailUser}). EMAIL_FROM actuel (${rawFrom}) a une adresse différente.`);
      }
    }

    // Le blocage @gmail.com ne s'applique pas en mode Gmail dédié
    return;
  }

  // Comportement standard Brevo / domaine d'entreprise (SMTP)
  if (isProd) {
    const missing = [];
    if (!emailHost) missing.push('EMAIL_HOST');
    if (!emailUser) missing.push('EMAIL_USER');
    if (!emailPass) missing.push('EMAIL_PASS');
    if (!emailFrom) missing.push('EMAIL_FROM');

    if (missing.length > 0) {
      const errorMsg = `[Mailer FATAL] Variables d'environnement email manquantes en production : ${missing.join(', ')}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Extraction et validation de l'adresse email dans EMAIL_FROM
    const match = emailFrom.match(/<([^>]+)>/) || [null, emailFrom];
    const rawFrom = (match[1] || emailFrom).trim();
    if (PERSONAL_EMAIL_REGEX.test(rawFrom)) {
      const errorMsg = `[Mailer FATAL] EMAIL_FROM (${rawFrom}) ne peut pas être une adresse personnelle (@gmail, @yahoo, @hotmail, @outlook). Utilisez obligatoirement une adresse de votre domaine professionnel.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }
}

// ─── Transports Email (Brevo API HTTP, Resend API HTTP, Brevo SMTP, Gmail SMTP & Ethereal dev) ──
let brevoApiTransporter = null;
let resendApiTransporter = null;
let brevoTransporter = null;
let gmailTransporter = null;
let etherealAccount = null;
let etherealTransporter = null;

function createBrevoApiTransport() {
  return {
    isHttpApi: true,
    provider: 'brevo-api',
    async verify() {
      const apiKey = (process.env.BREVO_API_KEY || '').trim();
      if (!apiKey) {
        throw new Error('[Brevo API] BREVO_API_KEY non configurée.');
      }
      const response = await fetch('https://api.brevo.com/v3/account', {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
        },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const errMsg = data.message || `Code HTTP ${response.status}`;
        const err = new Error(`[Brevo API] Échec de vérification API (HTTP ${response.status}) : ${errMsg}`);
        err.code = data.code || `HTTP_${response.status}`;
        err.status = response.status;
        throw err;
      }
      return true;
    },
    async sendMail(mailOptions) {
      const apiKey = (process.env.BREVO_API_KEY || '').trim();
      if (!apiKey) {
        throw new Error('[Mailer FATAL] BREVO_API_KEY est obligatoire pour envoyer un email via l\'API Brevo.');
      }

      const senderParsed = parseEmailAddress(mailOptions.from || process.env.EMAIL_FROM || '');
      if (!senderParsed.email) {
        throw new Error('[Brevo API] Adresse expéditeur (from / EMAIL_FROM) invalide ou manquante.');
      }
      const sender = senderParsed.name
        ? { email: senderParsed.email, name: senderParsed.name }
        : { email: senderParsed.email };

      const recipients = parseRecipients(mailOptions.to);
      if (!recipients.length) {
        throw new Error('[Brevo API] Aucun destinataire valide (to) fourni.');
      }

      const payload = {
        sender,
        to: recipients,
        subject: mailOptions.subject || '(Sans objet)',
      };

      if (mailOptions.html) {
        payload.htmlContent = mailOptions.html;
      }
      if (mailOptions.text) {
        payload.textContent = mailOptions.text;
      }
      if (!payload.htmlContent && !payload.textContent) {
        payload.textContent = ' ';
      }

      if (mailOptions.replyTo) {
        const replyParsed = parseEmailAddress(mailOptions.replyTo);
        if (replyParsed.email) {
          payload.replyTo = replyParsed.name
            ? { email: replyParsed.email, name: replyParsed.name }
            : { email: replyParsed.email };
        }
      }

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errMsg = data.message || data.error || `Erreur HTTP ${response.status}`;
        const err = new Error(`[Brevo API] ${errMsg}`);
        err.code = data.code || `HTTP_${response.status}`;
        err.status = response.status;
        throw err;
      }

      return {
        messageId: data.messageId || `<brevo-${Date.now()}@api>`,
        response: JSON.stringify(data),
      };
    },
  };
}

function createResendApiTransport() {
  return {
    isHttpApi: true,
    provider: 'resend',
    async verify() {
      const apiKey = (process.env.RESEND_API_KEY || '').trim();
      if (!apiKey) {
        throw new Error('[Resend API] RESEND_API_KEY non configurée.');
      }
      const response = await fetch('https://api.resend.com/api-keys', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const errMsg = data.message || `Code HTTP ${response.status}`;
        const err = new Error(`[Resend API] Échec de vérification API (HTTP ${response.status}) : ${errMsg}`);
        err.code = data.name || `HTTP_${response.status}`;
        err.status = response.status;
        throw err;
      }
      return true;
    },
    async sendMail(mailOptions) {
      const apiKey = (process.env.RESEND_API_KEY || '').trim();
      if (!apiKey) {
        throw new Error('[Mailer FATAL] RESEND_API_KEY est obligatoire pour envoyer un email via l\'API Resend.');
      }

      const sender = mailOptions.from || process.env.EMAIL_FROM;
      const recipients = parseRecipients(mailOptions.to);
      if (!recipients.length) {
        throw new Error('[Resend API] Aucun destinataire valide (to) fourni.');
      }

      const payload = {
        from: sender,
        to: recipients.map(r => r.email),
        subject: mailOptions.subject || '(Sans objet)',
        html: mailOptions.html || undefined,
        text: mailOptions.text || undefined,
        reply_to: mailOptions.replyTo || undefined,
      };

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errMsg = data.message || `Erreur HTTP ${response.status}`;
        const err = new Error(`[Resend API] ${errMsg}`);
        err.code = data.name || `HTTP_${response.status}`;
        err.status = response.status;
        throw err;
      }

      return {
        messageId: data.id || `<resend-${Date.now()}@api>`,
        response: JSON.stringify(data),
      };
    },
  };
}

function createBrevoTransport() {
  const host = (process.env.EMAIL_HOST || 'smtp-relay.brevo.com').trim();
  const port = Number(process.env.EMAIL_PORT) || 587;
  const secure = process.env.EMAIL_SECURE === 'true' || port === 465;
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').trim();

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
    socketTimeout: 15000,
  });
}

function createGmailTransport() {
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').trim();

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    connectionTimeout: 15000,
    socketTimeout: 15000,
  });
}

async function getTransporterAsync() {
  validateMailerConfig();

  const emailProvider = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const isGmailMode = emailProvider === 'gmail';
  const isBrevoApiMode = emailProvider === 'brevo-api' || emailProvider === 'brevo_api';
  const isResendMode = emailProvider === 'resend';
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').trim();
  const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();

  // Mode Brevo API HTTP (Port 443 HTTPS)
  if (isBrevoApiMode) {
    if (brevoApiKey && !brevoApiKey.includes('votre_cle')) {
      if (!brevoApiTransporter) {
        brevoApiTransporter = createBrevoApiTransport();
        try {
          await brevoApiTransporter.verify();
          console.log('[Mailer] ✅ Connexion API Brevo HTTP OK (Port 443 HTTPS)');
        } catch (err) {
          console.error('[Mailer] ❌ Erreur connexion API Brevo :', {
            code: err.code || err.status,
            message: err.message,
          });
          if (process.env.NODE_ENV === 'production') {
            throw err;
          }
        }
      }
      return {
        transporter: brevoApiTransporter,
        isEthereal: false,
        user: process.env.EMAIL_FROM || 'brevo-api',
      };
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Mailer FATAL] BREVO_API_KEY est obligatoire en production en mode brevo-api.');
    }
  }

  // Mode Resend API HTTP (Port 443 HTTPS)
  if (isResendMode) {
    if (resendApiKey && !resendApiKey.includes('votre_cle')) {
      if (!resendApiTransporter) {
        resendApiTransporter = createResendApiTransport();
        try {
          await resendApiTransporter.verify();
          console.log('[Mailer] ✅ Connexion API Resend HTTP OK (Port 443 HTTPS)');
        } catch (err) {
          console.error('[Mailer] ❌ Erreur connexion API Resend :', {
            code: err.code || err.status,
            message: err.message,
          });
          if (process.env.NODE_ENV === 'production') {
            throw err;
          }
        }
      }
      return {
        transporter: resendApiTransporter,
        isEthereal: false,
        user: process.env.EMAIL_FROM || 'resend-api',
      };
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Mailer FATAL] RESEND_API_KEY est obligatoire en production en mode resend.');
    }
  }

  // Mode Gmail dédié
  if (isGmailMode) {
    if (user && pass && !user.includes('votre_login') && !pass.includes('votre_cle')) {
      if (!gmailTransporter) {
        gmailTransporter = createGmailTransport();
        try {
          await gmailTransporter.verify();
          console.log(`[Mailer] ✅ Connexion SMTP Gmail OK`);
        } catch (err) {
          console.error('[Mailer] ❌ Erreur connexion SMTP Gmail :', {
            code: err.code,
            message: err.message,
            response: err.response,
          });
          if (process.env.NODE_ENV === 'production') {
            throw err;
          }
        }
      }
      return {
        transporter: gmailTransporter,
        isEthereal: false,
        user,
      };
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Mailer FATAL] EMAIL_USER et EMAIL_PASS sont obligatoires en mode Gmail dédié en production.');
    }
  }

  // Mode production ou si identifiants fournis dans .env : SMTP Brevo
  if (user && pass && !user.includes('votre_login') && !pass.includes('votre_cle')) {
    if (!brevoTransporter) {
      brevoTransporter = createBrevoTransport();
      try {
        await brevoTransporter.verify();
        const host = process.env.EMAIL_HOST || 'smtp-relay.brevo.com';
        const port = process.env.EMAIL_PORT || 587;
        console.log(`[Mailer] ✅ Connexion SMTP Brevo OK (${host}:${port})`);
      } catch (err) {
        console.error('[Mailer] ❌ Erreur connexion SMTP :', {
          code: err.code,
          message: err.message,
          response: err.response,
        });
        if (process.env.NODE_ENV === 'production') {
          throw err;
        }
      }
    }
    return {
      transporter: brevoTransporter,
      isEthereal: false,
      user,
    };
  }

  // Interdiction formelle d'Ethereal en production
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[Mailer FATAL] Ethereal est strictement interdit en production. Configurez Brevo API (brevo-api), Brevo SMTP ou le mode Gmail dédié.');
  }

  // Passerelle test automatique (Ethereal) autorisée UNIQUEMENT en développement
  if (!etherealTransporter) {
    try {
      etherealAccount = await nodemailer.createTestAccount();
      console.log(`[Mailer] 📧 Compte SMTP de test (Ethereal dev) initialisé : ${etherealAccount.user}`);
      etherealTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: etherealAccount.user,
          pass: etherealAccount.pass,
        },
      });
    } catch (e) {
      console.warn('[Mailer] Initialisation compte Ethereal impossible :', e.message);
    }
  }

  return {
    transporter: etherealTransporter || createBrevoTransport(),
    isEthereal: !!etherealTransporter,
    user: etherealAccount ? etherealAccount.user : 'ethereal@local',
  };
}

function getTransporter() {
  const emailProvider = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const isGmailMode = emailProvider === 'gmail';
  const isBrevoApiMode = emailProvider === 'brevo-api' || emailProvider === 'brevo_api';
  const isResendMode = emailProvider === 'resend';
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').trim();
  const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();

  if (isBrevoApiMode) {
    if (brevoApiTransporter) return brevoApiTransporter;
    if (brevoApiKey && !brevoApiKey.includes('votre_cle')) {
      brevoApiTransporter = createBrevoApiTransport();
      return brevoApiTransporter;
    }
  }

  if (isResendMode) {
    if (resendApiTransporter) return resendApiTransporter;
    if (resendApiKey && !resendApiKey.includes('votre_cle')) {
      resendApiTransporter = createResendApiTransport();
      return resendApiTransporter;
    }
  }

  if (isGmailMode) {
    if (gmailTransporter) return gmailTransporter;
    if (user && pass && !user.includes('votre_login')) {
      gmailTransporter = createGmailTransport();
      return gmailTransporter;
    }
  }

  if (brevoTransporter) return brevoTransporter;
  if (etherealTransporter) return etherealTransporter;
  if (user && pass && !user.includes('votre_login')) {
    brevoTransporter = createBrevoTransport();
    return brevoTransporter;
  }
  return etherealTransporter || createBrevoTransport();
}

// ─── Expéditeur professionnel & Reply-To ────────────────────────
function getFromAddress(prefix = 'Administration') {
  const isProd = process.env.NODE_ENV === 'production';
  const emailProvider = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const isGmailMode = emailProvider === 'gmail';
  const isBrevoApiMode = emailProvider === 'brevo-api' || emailProvider === 'brevo_api';
  const isResendMode = emailProvider === 'resend';
  const emailUser = (process.env.EMAIL_USER || '').trim();
  const fromConfig = (process.env.EMAIL_FROM || '').trim();

  // Mode Brevo API ou Resend : Expéditeur = EMAIL_FROM (adresse vérifiée chez le fournisseur)
  if (isBrevoApiMode || isResendMode) {
    if (fromConfig) {
      if (fromConfig.includes('<') && fromConfig.includes('>')) {
        return fromConfig;
      }
      return `"GMT Ariana — ${prefix}" <${fromConfig}>`;
    }
    if (isProd) {
      throw new Error('[Mailer FATAL] EMAIL_FROM est obligatoire en production en mode API HTTP (adresse vérifiée).');
    }
    return `"GMT Ariana — ${prefix}" <no-reply@gmt-ariana.tn>`;
  }

  if (isGmailMode) {
    if (fromConfig) {
      const match = fromConfig.match(/<([^>]+)>/) || [null, fromConfig];
      const rawFrom = (match[1] || fromConfig).trim().toLowerCase();
      if (emailUser && rawFrom !== emailUser.toLowerCase()) {
        console.warn(`[Mailer AVERTISSEMENT] Gmail impose que l'expéditeur corresponde à EMAIL_USER (${emailUser}). EMAIL_FROM (${rawFrom}) a une adresse différente.`);
        const nameMatch = fromConfig.match(/^"([^"]+)"|^([^<]+)</);
        const displayName = nameMatch ? (nameMatch[1] || nameMatch[2]).trim() : `GMT Ariana — ${prefix}`;
        return `"${displayName}" <${emailUser}>`;
      }
      if (fromConfig.includes('<') && fromConfig.includes('>')) {
        return fromConfig;
      }
      return `"GMT Ariana — ${prefix}" <${fromConfig}>`;
    }
    if (emailUser) {
      return `"GMT Ariana — ${prefix}" <${emailUser}>`;
    }
  }

  if (fromConfig) {
    if (fromConfig.includes('<') && fromConfig.includes('>')) {
      return fromConfig;
    }
    return `"GMT Ariana — ${prefix}" <${fromConfig}>`;
  }

  if (isProd) {
    throw new Error('[Mailer FATAL] EMAIL_FROM est obligatoire en production.');
  }

  if (etherealAccount) {
    return `"GMT Ariana — ${prefix}" <${etherealAccount.user}>`;
  }
  return `"GMT Ariana — ${prefix}" <no-reply@gmt-ariana.tn>`;
}

function getReplyToAddress() {
  const replyTo = (process.env.EMAIL_REPLY_TO || '').trim();
  return replyTo || undefined;
}

// Test / Diagnostic de la configuration email
async function testEmailConnection(toEmail = null) {
  try {
    const { transporter, isEthereal, user } = await getTransporterAsync();
    // En l'absence de destinataire de test, on teste uniquement la connexion / validation des identifiants
    if (!toEmail) {
      await transporter.verify();
    }
    const emailProvider = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
    const isGmailMode = emailProvider === 'gmail';
    const isBrevoApiMode = emailProvider === 'brevo-api' || emailProvider === 'brevo_api';
    const isResendMode = emailProvider === 'resend';

    const providerLabel = isBrevoApiMode
      ? 'Brevo API (HTTPS 443)'
      : (isResendMode ? 'Resend API (HTTPS 443)' : (isGmailMode ? 'Gmail Dédié (SMTP)' : 'Brevo (SMTP)'));

    const modeName = isEthereal
      ? 'test_ethereal'
      : (isBrevoApiMode ? 'brevo_api' : (isResendMode ? 'resend_api' : (isGmailMode ? 'gmail_dedicated' : 'production_smtp')));

    if (toEmail) {
      const fromAddr = isEthereal ? `"GMT Ariana — Test" <${user}>` : getFromAddress('Test Système');
      const replyTo = getReplyToAddress();
      const info = await transporter.sendMail({
        from: fromAddr,
        ...(replyTo ? { replyTo } : {}),
        to: toEmail,
        subject: `✅ Test réussi — GMT Ariana Planning (${providerLabel})`,
        text: 'La configuration email fonctionne parfaitement sur votre serveur !',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px">
            <h2 style="color:#0284c7;margin-top:0">✅ Configuration Email Validée</h2>
            <p>La transmission des e-mails (mots de passe, codes de sécurité, alertes planning) est active et fonctionnelle.</p>
            <p style="color:#64748b;font-size:12px">Serveur/Passerelle : ${isEthereal ? 'Passerelle test SMTP Ethereal' : providerLabel}</p>
          </div>
        `,
      });
      const previewUrl = isEthereal ? nodemailer.getTestMessageUrl(info) : null;
      return {
        ok: true,
        configured: true,
        sent: true,
        messageId: info.messageId,
        previewUrl,
        mode: modeName,
      };
    }
    return {
      ok: true,
      configured: true,
      message: isEthereal
        ? `Passerelle email active (mode test : ${user}).`
        : `Connexion ${providerLabel} validée avec succès.`,
      mode: modeName,
    };
  } catch (err) {
    return { ok: false, configured: false, error: err.message, code: err.code || err.status };
  }
}

// ─── Service SMS (Totalement désactivé) ─────────────────────────
async function sendSMS() {
  return null;
}



// Helper: Vérifier si l'adresse email a un format valide
function isDeliverableEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
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
    try {
      const { transporter, isEthereal, user: senderUser } = await getTransporterAsync();
      const fromAddr = isEthereal ? `"GMT Ariana — Santé" <${senderUser}>` : getFromAddress('Santé au Travail');
      const replyTo = getReplyToAddress();
      for (const u of users) {
        if (!isDeliverableEmail(u.email)) continue;
        try {
          await transporter.sendMail({
            from: fromAddr,
            ...(replyTo ? { replyTo } : {}),
            to:      u.email,
            subject,
            html,
          });
        } catch (err) {
          console.error(`[Mailer] ❌ Envoi impossible à ${u.email} :`, { code: err.code, message: err.message });
        }
      }
    } catch (err) {
      console.error('[notifyAllUsers Email] :', { code: err.code, message: err.message });
    }

    // ── SMS ──
    if (smsText && getTwilioClient()) {
      const usersWithPhone = users.filter(u => u.telephone);
      for (const u of usersWithPhone) {
        await sendSMS(u.telephone, smsText);
      }
    }
  } catch (err) {
    console.error('[Notify] Erreur :', { message: err.message });
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
    try {
      const { transporter, isEthereal, user: senderUser } = await getTransporterAsync();
      const fromAddr = isEthereal ? `"GMT Ariana — Planning" <${senderUser}>` : getFromAddress('Planning Médical');
      const replyTo = getReplyToAddress();
      for (const u of users) {
        if (!isDeliverableEmail(u.email)) continue;
        try {
          await transporter.sendMail({
            from: fromAddr,
            ...(replyTo ? { replyTo } : {}),
            to:      u.email,
            subject,
            html,
          });
          console.log(`[Planning Notify] ✅ Email envoyé à ${u.email}`);
        } catch (err) {
          console.error(`[Planning Notify] ❌ Envoi impossible à ${u.email} :`, { code: err.code, message: err.message });
        }
      }
    } catch (err) {
      console.error('[notifyAssignedIntervenants Email] :', { code: err.code, message: err.message });
    }

    // ── SMS ──
    if (smsText && getTwilioClient()) {
      for (const u of users) {
        if (u.telephone) await sendSMS(u.telephone, smsText);
      }
    }
  } catch (err) {
    console.error('[notifyAssignedIntervenants] Erreur :', { message: err.message });
  }
}

// Send OTP — Email + SMS
async function sendOTP(email, code, nom, prenom, telephone = null) {
  let emailSent = false;
  let emailError = null;

  // Email
  if (email && isDeliverableEmail(email)) {
    try {
      const { transporter, isEthereal, user: senderUser } = await getTransporterAsync();
      const fromAddr = isEthereal ? `"GMT Ariana — Sécurité" <${senderUser}>` : getFromAddress('Sécurité');
      const replyTo = getReplyToAddress();
      const info = await transporter.sendMail({
        from: fromAddr,
        ...(replyTo ? { replyTo } : {}),
        to:      email,
        subject: 'Confirmation de votre compte — GMT Ariana',
        text:    `Bonjour ${prenom} ${nom},\n\nVotre compte GMT Ariana a été créé.\nCode de confirmation : ${code}\nCe code expire dans 10 minutes.\n\nGMT Ariana — Groupement de Médecine du Travail`,
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
            <p style="color:#64748b;font-size:13px;text-align:center">⏱ Ce code de sécurité expire dans <strong>10 minutes</strong>.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:12px;color:#94a3b8;text-align:center">GMT Ariana — Groupement de Médecine du Travail de l'Ariana</p>
          </div>`,
      });
      emailSent = true;
      if (isEthereal) {
        console.log(`[Email OTP] ✅ Envoyé à ${email} (Preview: ${nodemailer.getTestMessageUrl(info)})`);
      } else {
        console.log(`[Email OTP] ✅ Envoyé à ${email}`);
      }
    } catch (err) {
      console.error(`[Email OTP] ❌ Échec envoi à ${email}:`, {
        code: err.code,
        message: err.message,
        response: err.response,
      });
      emailError = err.message;
    }
  }

  // SMS OTP
  if (telephone) {
    const msg = `GMT Ariana 🏥\nVotre code de confirmation : ${code}\n(Valable 10 minutes)`;
    await sendSMS(telephone, msg);
  }

  return { emailSent, emailError };
}

// Send password reset link — Email + SMS
async function sendPasswordReset(email, nom, prenom, token, telephone = null) {
  const appUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${appUrl}/reset-password?token=${token}`;
  let emailSent = false;
  let emailError = null;

  // Email
  if (email && isDeliverableEmail(email)) {
    try {
      const { transporter, isEthereal, user: senderUser } = await getTransporterAsync();
      const fromAddr = isEthereal ? `"GMT Ariana — Sécurité" <${senderUser}>` : getFromAddress('Sécurité Compte');
      const replyTo = getReplyToAddress();
      const info = await transporter.sendMail({
        from: fromAddr,
        ...(replyTo ? { replyTo } : {}),
        to:      email,
        subject: 'Réinitialisation de mot de passe — GMT Ariana',
        text:    `Bonjour ${prenom} ${nom},\n\nVous avez demandé une réinitialisation de votre mot de passe pour accéder à votre espace GMT Ariana.\nLien de réinitialisation : ${resetUrl}\nCe lien expire dans 10 minutes.\n\nSi vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.\n\nGMT Ariana`,
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
            <p style="color:#64748b;font-size:13px">⏱ Ce lien de sécurité expire dans <strong>10 minutes</strong>.</p>
            <p style="color:#94a3b8;font-size:12px">Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:11px;color:#94a3b8;word-break:break-all">Lien direct : ${resetUrl}</p>
          </div>`,
      });
      emailSent = true;
      if (isEthereal) {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log(`[Email Reset] ✅ Envoyé avec succès à ${email} (ID: ${info.messageId})`);
        console.log(`[Email Reset] 🌐 Prévisualisation Ethereal : ${previewUrl}`);
      } else {
        console.log(`[Email Reset] ✅ Envoyé avec succès à ${email} (ID: ${info.messageId})`);
      }
    } catch (err) {
      console.error(`[Email Reset] ❌ Échec envoi à ${email}:`, {
        code: err.code,
        message: err.message,
        response: err.response,
      });
      emailError = err.message;
    }
  }

  // SMS reset link (si configuré)
  if (telephone) {
    const msg = `GMT Ariana 🏥\nRéinitialisez votre mot de passe ici :\n${resetUrl}\n(Lien valable 10 minutes)`;
    await sendSMS(telephone, msg);
  }

  return { emailSent, emailError };
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

// Welcome Email — Transmission exclusive du mot de passe provisoire au collaborateur (validité 48h)
async function sendWelcomeEmail({ email, prenom, nom, tempPassword, telephone = null }) {
  let emailSent = false;
  let emailError = null;
  let previewUrl = null;

  if (email && isDeliverableEmail(email)) {
    console.log(`[Email Welcome] Préparation de l'envoi de bienvenue à ${email}...`);
    const appUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';

    try {
      const { transporter, isEthereal, user: senderUser } = await getTransporterAsync();
      const fromAddr = isEthereal ? `"GMT Ariana — Administration" <${senderUser}>` : getFromAddress('Administration');
      const replyTo = getReplyToAddress();

      const info = await transporter.sendMail({
        from: fromAddr,
        ...(replyTo ? { replyTo } : {}),
        to: email,
        subject: 'Bienvenue sur GMT Ariana — Vos identifiants et mot de passe provisoire',
        text: `Bonjour ${prenom} ${nom},\n\nVotre compte d'accès a été créé sur la plateforme GMT Ariana.\n\nVos identifiants de connexion :\n• Identifiant (E-mail) : ${email}\n• Mot de passe provisoire : ${tempPassword}\n\n⏱ Validité : Ce mot de passe provisoire est valable pendant 48 heures.\n⚠️ Consigne : Changez-le dès votre première connexion.\n\nLien d'accès direct : ${appUrl}/login\n\nGroupement de Médecine du Travail de l'Ariana (GMT Ariana)`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px;background:#ffffff">
              <div style="text-align:center;margin-bottom:20px">
                <h2 style="color:#0284c7;margin:0">GMT Ariana — Médecine du Travail</h2>
                <p style="color:#64748b;font-size:13px;margin:4px 0">Portail Médical & Gestion du Planning</p>
              </div>
              <p style="font-size:15px;color:#0f172a">Bonjour <strong>${prenom} ${nom}</strong>,</p>
              <p style="color:#475569;font-size:14px;line-height:1.5">Un compte d'accès a été créé pour vous sur la plateforme du <strong>Groupement de Médecine du Travail de l'Ariana</strong>.</p>

              <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:18px;margin:22px 0">
                <p style="margin:0 0 10px;font-size:12px;font-weight:800;color:#166534;text-transform:uppercase;letter-spacing:1px;text-align:center">
                  Vos identifiants de première connexion
                </p>
                <div style="background:#ffffff;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin:8px 0">
                  <p style="margin:4px 0;font-size:13.5px;color:#334155">
                    <strong>Identifiant (E-mail) :</strong> <code style="color:#0284c7;font-weight:700">${email}</code>
                  </p>
                  <div style="margin:10px 0 4px">
                    <span style="font-size:13.5px;color:#334155;font-weight:700">Mot de passe provisoire :</span>
                    <div style="margin-top:6px;background:#f8fafc;padding:10px 14px;border-radius:6px;border:1.5px dashed #16a34a;text-align:center">
                      <span style="font-size:20px;font-weight:900;color:#15803d;font-family:monospace;letter-spacing:1.5px">${tempPassword}</span>
                    </div>
                  </div>
                </div>
                <p style="margin:10px 0 0;font-size:12px;color:#15803d;line-height:1.4;text-align:center">
                  ⏱ Validité : <strong>48 heures</strong>.<br>
                  ⚠️ <strong>Consigne :</strong> Changez-le dès votre première connexion.
                </p>
              </div>

              ${appUrl ? `
              <div style="text-align:center;margin:24px 0">
                <a href="${appUrl}/login" style="background:#0284c7;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;box-shadow:0 2px 8px rgba(2,132,199,0.3)">
                  Accéder à la plateforme & Me connecter
                </a>
              </div>` : ''}

              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;margin:16px 0;font-size:12px;color:#64748b">
                ℹ️ En cas de difficulté lors de votre connexion, contactez l'administrateur de votre groupement médical.
              </div>

              <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
              <p style="font-size:11px;color:#94a3b8;text-align:center">GMT Ariana — Groupement de Médecine du Travail de l'Ariana</p>
            </div>
          `,
      });

      emailSent = true;
      if (isEthereal) {
        previewUrl = nodemailer.getTestMessageUrl(info);
        console.log(`[Email Welcome] ✅ Envoyé avec succès à ${email} (ID: ${info.messageId})`);
        console.log(`[Email Welcome] 🌐 Prévisualisation Ethereal (Lien web direct) : ${previewUrl}`);
      } else {
        console.log(`[Email Welcome] ✅ Envoyé avec succès à ${email} (ID: ${info.messageId})`);
      }
    } catch (err) {
      console.error(`[Email Welcome] ❌ Échec envoi à ${email}:`, {
        code: err.code,
        message: err.message,
        response: err.response,
      });
      emailError = err.message;
    }
  } else {
    emailError = 'Format d\'adresse email invalide';
    console.warn(`[Email Welcome] ⚠️ ${emailError} : ${email}`);
  }

  // SMS notification (si Twilio disponible)
  if (telephone) {
    const msg = `GMT Ariana 🏥\nBonjour ${prenom} ${nom} !\nVotre compte d'accès a été créé.\nMot de passe provisoire : ${tempPassword}\n(Valable 48 heures - à changer dès votre première connexion)`;
    await sendSMS(telephone, msg);
  }

  return { emailSent, emailError, previewUrl };
}

module.exports = {
  getTransporter,
  getTransporterAsync,
  testEmailConnection,
  getFromAddress,
  validateMailerConfig,
  PERSONAL_EMAIL_REGEX,
  notifyAllUsers,
  notifyAssignedIntervenants,
  sendOTP,
  sendPasswordReset,
  sendWelcomeEmail,
  sendSMS,
  planningEmailHtml,
  planningSmsText,
  eventEmailHtml,
  isDeliverableEmail,
};
