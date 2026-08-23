import React, { useState } from 'react';

export default function CalendarSyncModal({ user, onClose, toast }) {
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const userId = user?.id || '';
  const isMedecin = user?.role === 'medecin';
  const isTechnicien = user?.role === 'technicien';

  let feedParam = '';
  if (isMedecin) feedParam = `?medecin_id=${userId}`;
  else if (isTechnicien) feedParam = `?technicien_id=${userId}`;

  const httpFeedUrl = `${origin}/api/planning/feed.ics${feedParam}`;
  const webcalUrl = httpFeedUrl.replace(/^https?:\/\//i, 'webcal://');

  const googleSyncUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(httpFeedUrl)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(httpFeedUrl);
    setCopied(true);
    toast?.('Lien de synchronisation copié dans le presse-papier !', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            📅 Synchronisation Calendrier
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Connectez votre planning GMT Ariana à votre agenda personnel sur smartphone ou ordinateur. Toute nouvelle intervention sera automatiquement synchronisée en temps réel.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Google Calendar */}
            <a
              href={googleSyncUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#1e293b',
                fontWeight: 600,
                padding: '10px',
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: 16 }}>🗓️</span> S'abonner avec Google Agenda
            </a>

            {/* Apple Calendar / iPhone */}
            <a
              href={webcalUrl}
              className="btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: '#0ea5e9',
                color: '#ffffff',
                fontWeight: 600,
                padding: '10px',
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: 16 }}>🍎</span> S'abonner sur iPhone / Mac (Apple Calendar)
            </a>

            {/* Outlook / Direct .ics */}
            <a
              href={httpFeedUrl}
              download="gmt_planning.ics"
              className="btn btn-outline"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontWeight: 600,
                padding: '10px',
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: 16 }}>📥</span> Télécharger le fichier iCal (.ics)
            </a>
          </div>

          <div style={{ marginTop: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>
              Lien de flux direct (iCal / Webcal)
            </label>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input
                type="text"
                readOnly
                value={httpFeedUrl}
                className="input"
                style={{ fontSize: 12, flex: 1, background: 'var(--surface2, #f8fafc)' }}
              />
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: 12, padding: '0 12px' }}
                onClick={handleCopy}
              >
                {copied ? '✓ Copié' : 'Copier'}
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--surface2, #f1f5f9)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--text-2)' }}>
            💡 <strong>Astuce :</strong> Sur iPhone/iPad, cliquez simplement sur le bouton bleu Apple Calendar pour ajouter le calendrier en 1 seconde à l'application Calendrier d'Apple.
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
