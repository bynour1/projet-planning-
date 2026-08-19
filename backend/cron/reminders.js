const cron      = require('node-cron');
const nodemailer = require('nodemailer');
const { sendSMS } = require('../config/mailer');

function getTransporter() {
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

module.exports = function startReminders(db) {
  cron.schedule('0 8 * * *', async () => {
    try {
      console.log('[Reminders] Cron 8h — vérification des interventions de demain...');
      const [rows] = await db.query(`
        SELECT pe.*,
               u1.email as medecin_email, u1.telephone as medecin_tel,
               u1.prenom as medecin_prenom, u1.nom as medecin_nom,
               u2.email as tech_email, u2.telephone as tech_tel,
               u2.prenom as tech_prenom, u2.nom as tech_nom
        FROM planning_events pe
        LEFT JOIN users u1 ON u1.id = pe.medecin_id
        LEFT JOIN users u2 ON u2.id = pe.technicien_id
        WHERE DATE(pe.date) = DATE(NOW() + INTERVAL 1 DAY)
      `);

      console.log(`[Reminders] ${rows.length} intervention(s) demain.`);

      for (const row of rows) {
        const dateStr  = row.date ? String(row.date).slice(0, 10) : '';
        const heureStr = row.heure_debut ? String(row.heure_debut).slice(0, 5) : '';
        const smsText  = `GMT Ariana - Rappel 24h\nIntervention demain ${dateStr}${heureStr ? ' a ' + heureStr : ''}${row.adresse ? '\n' + row.adresse : ''}`;
        const subject  = 'Rappel 24h - Intervention demain - GMT Ariana';

        const html = `
          <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
            <div style="text-align:center;margin-bottom:20px">
              <h2 style="color:#1e3a8a">&#9200; Rappel 24h - GMT Ariana</h2>
            </div>
            <p>Bonjour,</p>
            <p>Ceci est un rappel pour votre intervention de <strong>demain</strong> :</p>
            <table style="width:100%;font-size:14px;border-collapse:collapse">
              <tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Date</td><td style="padding:8px;font-weight:600">${dateStr}</td></tr>
              ${heureStr ? `<tr><td style="padding:8px;color:#64748b">Heure</td><td style="padding:8px;font-weight:600">${heureStr}</td></tr>` : ''}
              ${row.titre ? `<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Titre</td><td style="padding:8px;font-weight:600">${row.titre}</td></tr>` : ''}
              ${row.adresse ? `<tr><td style="padding:8px;color:#64748b">Adresse</td><td style="padding:8px;font-weight:600">${row.adresse}</td></tr>` : ''}
            </table>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:12px;color:#94a3b8;text-align:center">GMT Ariana - Sante de l employe</p>
          </div>`;

        // -- Medecin --
        if (row.medecin_email && process.env.EMAIL_USER) {
          try {
            await getTransporter().sendMail({
              from: `"GMT Ariana" <${process.env.EMAIL_USER}>`,
              to:   row.medecin_email,
              subject, html,
            });
          } catch (err) { console.warn('[Reminders] Email medecin:', err.message); }
        }
        if (row.medecin_tel) await sendSMS(row.medecin_tel, smsText);

        // -- Technicien --
        if (row.tech_email && row.tech_email !== row.medecin_email && process.env.EMAIL_USER) {
          try {
            await getTransporter().sendMail({
              from: `"GMT Ariana" <${process.env.EMAIL_USER}>`,
              to:   row.tech_email,
              subject, html,
            });
          } catch (err) { console.warn('[Reminders] Email technicien:', err.message); }
        }
        if (row.tech_tel && row.tech_tel !== row.medecin_tel) {
          await sendSMS(row.tech_tel, smsText);
        }
      }
    } catch (err) {
      console.error('[Reminders] Erreur cron:', err.message);
    }
  });

  console.log('[Reminders] Cron 8h00 demarré (rappels 24h avant intervention)');
};
