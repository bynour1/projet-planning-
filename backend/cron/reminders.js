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
        const smsText  = `GMT Ariana - Rappel 24h : Intervention planifiée demain (${dateStr}${heureStr ? ' à ' + heureStr : ''}). Connectez-vous à la plateforme pour les détails.`;
        const subject  = `⏰ Rappel 24h — Intervention planifiée pour demain (GMT Ariana)`;
        const appUrl   = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';

        const html = `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
            <div style="text-align:center;margin-bottom:20px">
              <span style="display:inline-block;background:#0284c7;color:#ffffff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px;text-transform:uppercase">📋 Rappel 24h — Planning</span>
              <h2 style="color:#0f172a;margin:10px 0 0 0">Intervention Planifiée</h2>
            </div>
            <p>Bonjour,</p>
            <p>Ceci est un rappel automatique concernant votre intervention programmée pour <strong>demain</strong> :</p>
            <table style="width:100%;font-size:14px;border-collapse:collapse;margin:15px 0">
              <tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Date</td><td style="padding:8px;font-weight:600">${dateStr}</td></tr>
              ${heureStr ? `<tr><td style="padding:8px;color:#64748b">Horaire</td><td style="padding:8px;font-weight:600">${heureStr}${row.heure_fin ? ' → ' + String(row.heure_fin).slice(0,5) : ''}</td></tr>` : ''}
              ${row.adresse ? `<tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Lieu / Entreprise</td><td style="padding:8px;font-weight:600">${row.adresse}</td></tr>` : ''}
            </table>

            <div style="margin:20px 0;padding:12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:12px;color:#0369a1;line-height:1.4">
              🔒 <strong>Secret médical & Confidentialité :</strong> Conformément aux règles de déontologie, aucun dossier nominatif ni détail médical n'est transmis par e-mail. Veuillez vous connecter à votre espace sécurisé pour consulter le dossier complet.
            </div>

            <div style="text-align:center;margin:20px 0">
              <a href="${appUrl}/planning" style="background:#0284c7;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:13px;display:inline-block">
                Accéder au Planning Sécurisé
              </a>
            </div>

            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:11px;color:#94a3b8;text-align:center">GMT Ariana — Groupement de Médecine du Travail</p>
          </div>`;

        // -- Medecin assigné uniquement --
        const replyTo = process.env.EMAIL_REPLY_TO ? process.env.EMAIL_REPLY_TO.trim() : undefined;
        if (row.medecin_email && (process.env.EMAIL_USER || process.env.NODE_ENV !== 'production') && isDeliverableEmail(row.medecin_email)) {
          try {
            await getTransporter().sendMail({
              from:    getFromAddress('Rappels Planning'),
              ...(replyTo ? { replyTo } : {}),
              to:      row.medecin_email,
              subject,
              html,
            });
          } catch (err) { console.error('[Reminders] Email medecin:', { code: err.code, message: err.message }); }
        }
        if (row.medecin_tel) await sendSMS(row.medecin_tel, smsText);

        // -- Technicien assigné uniquement --
        if (row.tech_email && row.tech_email !== row.medecin_email && (process.env.EMAIL_USER || process.env.NODE_ENV !== 'production') && isDeliverableEmail(row.tech_email)) {
          try {
            await getTransporter().sendMail({
              from:    getFromAddress('Rappels Planning'),
              ...(replyTo ? { replyTo } : {}),
              to:      row.tech_email,
              subject,
              html,
            });
          } catch (err) { console.error('[Reminders] Email technicien:', { code: err.code, message: err.message }); }
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

        const subject = `⏰ Rappel 24h — Rendez-vous / Mission programmée demain (GMT Ariana)`;
        const smsText = `GMT Ariana - Rappel 24h : Mission/Rendez-vous prévu demain (${dateStr}${heureStr ? ' à ' + heureStr : ''}). Connectez-vous à la plateforme pour les détails.`;
        const appUrl  = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';

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
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff">
            <div style="text-align:center;margin-bottom:20px">
              <span style="display:inline-block;background:#6366f1;color:#ffffff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px;text-transform:uppercase">📅 Rappel 24h — Agenda</span>
              <h2 style="color:#0f172a;margin:10px 0 0 0">Rendez-vous / Mission</h2>
            </div>
            <p>Bonjour,</p>
            <p>Ceci est un rappel automatique concernant votre rendez-vous / mission planifié pour <strong>demain</strong> :</p>
            <table style="width:100%;font-size:14px;border-collapse:collapse;margin:15px 0">
              <tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">Date & Heure</td><td style="padding:8px;font-weight:600">${dateStr}${heureStr ? ' à ' + heureStr : ''}</td></tr>
              ${ev.lieu ? `<tr><td style="padding:8px;color:#64748b">Lieu / Lieu de visite</td><td style="padding:8px;font-weight:600">${ev.lieu}</td></tr>` : ''}
            </table>

            <div style="margin:20px 0;padding:12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:12px;color:#0369a1;line-height:1.4">
              🔒 <strong>Secret médical & Confidentialité :</strong> Conformément aux règles de déontologie, aucun détail médical individuel ni nom de patient n'est transmis par e-mail. Connectez-vous à la plateforme pour consulter les détails complets.
            </div>

            <div style="text-align:center;margin:20px 0">
              <a href="${appUrl}/calendar" style="background:#6366f1;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:13px;display:inline-block">
                Accéder à l'Agenda Sécurisé
              </a>
            </div>

            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
            <p style="font-size:11px;color:#94a3b8;text-align:center">GMT Ariana — Groupement de Médecine du Travail</p>
          </div>`;

        const replyTo = process.env.EMAIL_REPLY_TO ? process.env.EMAIL_REPLY_TO.trim() : undefined;
        for (const user of recipients) {
          if (user.email && (process.env.EMAIL_USER || process.env.NODE_ENV !== 'production') && isDeliverableEmail(user.email)) {
            try {
              await getTransporter().sendMail({
                from:    getFromAddress('Rappels Agenda'),
                ...(replyTo ? { replyTo } : {}),
                to:      user.email,
                subject,
                html,
              });
              console.log(`[Reminders] ✅ Email rappel 24h envoyé à ${user.email} pour l'événement ${ev.titre}`);
            } catch (err) {
              console.error(`[Reminders] ❌ Email événement impossible à ${user.email}:`, { code: err.code, message: err.message });
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
