import React, { useState } from 'react';

export default function NavigationSelector({ addr, style = {}, compact = false }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!addr) return null;

  const cleanAddr = addr.trim();
  const encodedAddr = encodeURIComponent(cleanAddr);

  // URLs for various navigation providers
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddr}`;
  const wazeUrl       = `https://waze.com/ul?q=${encodedAddr}&navigate=yes`;
  const appleMapsUrl  = `maps://maps.apple.com/?q=${encodedAddr}`;

  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cleanAddr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className="nav-selector-btn no-print"
        onClick={() => setOpen(!open)}
        title="Ouvrir dans Google Maps / Waze / GPS"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          background: 'rgba(14, 165, 233, 0.08)',
          color: '#0284c7',
          border: '1px solid rgba(14, 165, 233, 0.25)',
          borderRadius: 6,
          padding: compact ? '2px 7px' : '4px 9px',
          fontSize: compact ? 11 : 12,
          fontWeight: 600,
          cursor: 'pointer',
          textDecoration: 'none',
          transition: 'all 0.15s ease',
          maxWidth: '100%',
        }}
      >
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 180,
          textAlign: 'left'
        }}>
          {cleanAddr}
        </span>
        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ opacity: 0.7, flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Version texte nette et propre pour l'impression papier */}
      <span className="nav-selector-print-text" style={{ display: 'none' }}>
        {cleanAddr}
      </span>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1050 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: 'var(--surface, #ffffff)',
              borderRadius: 8,
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
              border: '1px solid var(--border, #e2e8f0)',
              padding: 6,
              zIndex: 1060,
              minWidth: 190,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3, #94a3b8)', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Itinéraire GPS
            </div>

            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text, #1e293b)',
                textDecoration: 'none',
                background: 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2, rgba(14, 165, 233, 0.08))'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Google Maps
            </a>

            <a
              href={wazeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text, #1e293b)',
                textDecoration: 'none',
                background: 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2, rgba(14, 165, 233, 0.08))'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Waze Navigation
            </a>

            {isIOS && (
              <a
                href={appleMapsUrl}
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text, #1e293b)',
                  textDecoration: 'none',
                  background: 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2, rgba(14, 165, 233, 0.08))'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                Apple Plans
              </a>
            )}

            <div style={{ height: 1, background: 'var(--border, #e2e8f0)', margin: '3px 0' }} />

            <button
              type="button"
              onClick={handleCopy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                color: copied ? '#16a34a' : 'var(--text-2, #64748b)',
                border: 'none',
                background: copied ? '#dcfce7' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              {copied ? 'Adresse copiée !' : 'Copier l\'adresse'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
