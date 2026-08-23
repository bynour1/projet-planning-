import React from 'react';
import NavigationSelector from './NavigationSelector';

export default function LocationMessage({ content, isMine }) {
  let data = null;
  try {
    data = typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    return <span>📍 Position : {content}</span>;
  }

  if (!data || (data.type !== 'location' && !data.lat)) {
    return <span>📍 Position partagée</span>;
  }

  const { lat, lng, address, accuracy, timestamp } = data;
  const coordStr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const displayAddress = address || `Coordonnées : ${coordStr}`;
  const mapQuery = encodeURIComponent(`${lat},${lng}`);
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minWidth: 240,
      maxWidth: 300,
      padding: '10px 12px',
      borderRadius: 14,
      background: isMine ? 'rgba(255, 255, 255, 0.15)' : 'var(--surface2)',
      border: isMine ? '1px solid rgba(255,255,255,0.3)' : '1px solid var(--border)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: isMine ? 'rgba(255,255,255,0.9)' : 'var(--text-2)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, color: isMine ? '#fff' : '#0284c7' }}>
          📍 Position GPS en direct
        </span>
        {accuracy && <span style={{ fontSize: 10, opacity: 0.8 }}>±{Math.round(accuracy)}m</span>}
      </div>

      {/* Map visual preview card */}
      <a
        href={osmUrl}
        target="_blank"
        rel="noreferrer"
        style={{
          position: 'relative',
          height: 120,
          borderRadius: 10,
          overflow: 'hidden',
          display: 'block',
          background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
          border: '1px solid rgba(0,0,0,0.08)',
          textDecoration: 'none',
          cursor: 'pointer',
        }}
        title="Ouvrir la carte OpenStreetMap"
      >
        {/* Map grid background pattern */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(#0284c7 0.75px, transparent 0.75px)',
          backgroundSize: '12px 12px',
          opacity: 0.35,
        }} />

        {/* Center pin with pulse */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#ef4444',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.5)',
            border: '2px solid #fff',
          }}>
            📍
          </div>
          <span style={{
            fontSize: 10,
            fontWeight: 800,
            color: '#0f172a',
            background: 'rgba(255,255,255,0.9)',
            padding: '1px 6px',
            borderRadius: 10,
            marginTop: 4,
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}>
            {coordStr}
          </span>
        </div>
      </a>

      {/* Address description */}
      <div style={{ fontSize: 12, fontWeight: 600, color: isMine ? '#fff' : 'var(--text)', lineHeight: 1.4 }}>
        {displayAddress}
      </div>

      {/* 1-Click Navigation selector */}
      <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <NavigationSelector
          addr={`${lat},${lng}`}
          lat={lat}
          lng={lng}
          compact
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            navigator.clipboard.writeText(`${lat}, ${lng}`);
            alert('Coordonnées copiées dans le presse-papier !');
          }}
          style={{
            fontSize: 11,
            padding: '3px 6px',
            color: isMine ? '#fff' : 'var(--text-3)',
            opacity: 0.85,
          }}
          title="Copier les coordonnées GPS"
        >
          📋 Copier
        </button>
      </div>
    </div>
  );
}
