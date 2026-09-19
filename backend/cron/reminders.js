const cron = require('node-cron');
const { getTransporter, getFromAddress, sendSMS, isDeliverableEmail } = require('../config/mailer');

module.exports = function startReminders(db) {
  cron.schedule('0 8 * * *', async () => {
    try {
      console.log('[Reminders] Cron 8h — vérification des interventions et événements de demain...');

      // ─────────────────────────────────────────────────────────────
      // 1. RAPPELS DES PROGRAMMES MÉDICAUX (planning_events)
      // ─────────────────────────────────────────────────────────────
      const [planningRows] = await db.query(`
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

      console.log(`[Reminders] ${planningRows.length} intervention(s) planning demain.`);

      for (const row of planningRows) {
        const dateStr  = row.date ? String(row.date).slice(0, 10) : '';
        const heureStr = row.heure_debut ? String(row.heure_debut).slice(0, 5) : '';
        const smsText  = `GMT Ariana - Rappel 24h\nIntervention demain ${dateStr}${heureStr ? ' a ' + heureStr : ''}${row.adresse ? '\n' + row.adresse : ''}`;
        const subject  = `⏰ Rappel 24h — Intervention demain : ${row.titre || 'Programme Médical'}`;

        const html = `
          <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
            <div style="text-align:center;margin-bottom:20px">
              <span style="display:inline-block;background:#0284c7;color:#ffffff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px;text-transform:uppercase">📋 Rappel 24h — Planning</span>
              <h2 style="color:#0f172a;margin:10px 0 0 0">${row.titre || 'Intervention Médicale'}</h2>
            </div>
            <p>Bonjour,</p>
            <p>Ceci est un rappel pour votre intervention planifiée pour <strong>demain</strong> :</p>
            <table style="width:100%;font-size:14px;border-collapse:collapse;margin:15px 0">
              <tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Date</td><td style="padding:8px;font-weight:600">${dateStr}</td></tr>
              ${heureStr ? `<tr><td style="padding:8px;color:#64748b">Heure</td><td style="padding:8px;font-weight:600">${heureStr}${row.heure_fin ? ' → ' + String(row.heure_fin).slice(0,5) : ''}</td></tr>` : ''}
              ${row.titre ? `<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Titre / Mission</td><td style="padding:8px;font-weight:600">${row.titre}</td></tr>` : ''}
              ${row.adresse ? `<tr><td style="padding:8px;color:#64748b">Adresse / Lieu</td><td style="padding:8px;font-weight:600">${row.adresse}</td></tr>` : ''}
            </table>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:12px;color:#94a3b8;text-align:center">GMT Ariana — Groupement de Médecine du Travail</p>
          </div>`;

        // -- Medecin assigné uniquement --
        if (row.medecin_email && process.env.EMAIL_USER && isDeliverableEmail(row.medecin_email)) {
          try {
            await getTransporter().sendMail({
              from:    getFromAddress('Rappels Planning'),
              replyTo: process.env.ADMIN_EMAIL || 'admin@gmt-ariana.tn',
              to:      row.medecin_email,
              subject,
              html,
            });
          } catch (err) { console.warn('[Reminders] Email medecin:', err.message); }
        }
        if (row.medecin_tel) await sendSMS(row.medecin_tel, smsText);

        // -- Technicien assigné uniquement --
        if (row.tech_email && row.tech_email !== row.medecin_email && process.env.EMAIL_USER && isDeliverableEmail(row.tech_email)) {
          try {
            await getTransporter().sendMail({
              from:    getFromAddress('Rappels Planning'),
              replyTo: process.env.ADMIN_EMAIL || 'admin@gmt-ariana.tn',
              to:      row.tech_email,
              subject,
              html,
            });
          } catch (err) { console.warn('[Reminders] Email technicien:', err.message); }
        }
        if (row.tech_tel && row.tech_tel !== row.medecin_tel) {
          await sendSMS(row.tech_tel, smsText);
        }
      }

      // ─────────────────────────────────────────────────────────────
      // 2. RAPPELS DES ÉVÉNEMENTS & RENDEZ-VOUS CALENDRIER (events)
      // ─────────────────────────────────────────────────────────────
      const [eventRows] = await db.query(`
        SELECT e.*,
               u1.email as medecin_email, u1.telephone as medecin_tel,
               u2.email as tech_email, u2.telephone as tech_tel
        FROM events e
        LEFT JOIN users u1 ON u1.id = e.medecin_id
        LEFT JOIN users u2 ON u2.id = e.technicien_id
        WHERE DATE(e.date_debut) = DATE(NOW() + INTERVAL 1 DAY)
      `);

      console.log(`[Reminders] ${eventRows.length} événement(s) calendrier demain.`);

      for (const ev of eventRows) {
        const startDt = ev.date_debut ? new Date(ev.date_debut) : null;
        const dateStr = startDt && !isNaN(startDt) ? startDt.toISOString().slice(0, 10) : String(ev.date_debut || '').slice(0, 10);
        const heureStr = ev.date_debut && String(ev.date_debut).includes('T')
          ? String(ev.date_debut).split('T')[1].slice(0, 5)
          : (startDt && !isNaN(startDt) ? startDt.toTimeString().slice(0, 5) : '');

        const subject = `⏰ Rappel 24h — Événement demain : ${ev.titre}`;
        const smsText = `GMT Ariana - Rappel 24h\nÉvénement : ${ev.titre}\nDate : ${dateStr}${heureStr ? ' à ' + heureStr : ''}${ev.lieu ? '\nLieu : ' + ev.lieu : ''}`;

        // Récupérer tous les identifiants d'utilisateurs assignés à cet événement
        const recipientIds = new Set();
        if (ev.medecin_id) recipientIds.add(Number(ev.medecin_id));
        if (ev.technicien_id) recipientIds.add(Number(ev.technicien_id));

        if (ev.participants) {
          try {
            const parts = typeof ev.participants === 'string' ? JSON.parse(ev.participants) : ev.participants;
            if (Array.isArray(parts)) {
              parts.forEach(p => { if (p?.id) recipientIds.add(Number(p.id)); });
            }
          } catch (e) {}
        }

        let recipients = [];
        if (recipientIds.size > 0) {
          const [uRows] = await db.query(
            'SELECT id, email, telephone, prenom, nom FROM users WHERE id IN (?) AND is_active = 1',
            [Array.from(recipientIds)]
          );
          recipients = uRows;
        }

        const html = `
          <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
            <div style="text-align:center;margin-bottom:20px">
              <span style="display:inline-block;background:#6366f1;color:#ffffff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px;text-transform:uppercase">📅 Rappel 24h — Agenda</span>
              <h2 style="color:#0f172a;margin:10px 0 0 0">${ev.titre}</h2>
            </div>
            <p>Bonjour,</p>
            <p>Ceci est un rappel pour votre événement / visite planifié pour <strong>demain</strong> :</p>
            <table style="width:100%;font-size:14px;border-collapse:collapse;margin:15px 0">
              <tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Type</td><td style="padding:8px;font-weight:600">${ev.type || 'Visite médicale'}</td></tr>
              <tr><td style="padding:8px;color:#64748b">Date & Heure</td><td style="padding:8px;font-weight:600">${dateStr}${heureStr ? ' à ' + heureStr : ''}</td></tr>
              ${ev.lieu ? `<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Lieu / Adresse</td><td style="padding:8px;font-weight:600">${ev.lieu}</td></tr>` : ''}
            </table>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:12px;color:#94a3b8;text-align:center">GMT Ariana — Groupement de Médecine du Travail</p>
          </div>`;

        for (const user of recipients) {
          if (user.email && process.env.EMAIL_USER && isDeliverableEmail(user.email)) {
            try {
              await getTransporter().sendMail({
                from:    getFromAddress('Rappels Agenda'),
                replyTo: process.env.ADMIN_EMAIL || 'admin@gmt-ariana.tn',
                to:      user.email,
                subject,
                html,
              });
              console.log(`[Reminders] ✅ Email rappel 24h envoyé à ${user.email} pour l'événement ${ev.titre}`);
            } catch (err) {
              console.warn(`[Reminders] Email événement impossible à ${user.email}:`, err.message);
            }
          }
          if (user.telephone) {
            await sendSMS(user.telephone, smsText);
          }
        }
      }
    } catch (err) {
      console.error('[Reminders] Erreur cron:', err.message);
    }
  });

  console.log('[Reminders] Cron 8h00 démarré (rappels 24h avant interventions & événements)');
};
