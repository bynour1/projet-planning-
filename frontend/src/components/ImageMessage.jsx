import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function ImageMessage({ url, originalname, isMine }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl = null;

    async function loadImage() {
      try {
        setLoading(true);
        const res = await axios.get(url, { responseType: 'blob' });
        if (!active) return;
        createdUrl = URL.createObjectURL(res.data);
        setBlobUrl(createdUrl);
      } catch (err) {
        console.error('Erreur chargement image:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadImage();

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  return (
    <>
      <div
        onClick={() => { if (blobUrl) setLightbox(true); }}
        style={{
          cursor: loading ? 'wait' : 'pointer',
          borderRadius: 12,
          overflow: 'hidden',
          maxWidth: 260,
          background: isMine ? 'rgba(255,255,255,0.1)' : 'var(--surface2)',
          border: isMine ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border)',
          transition: 'transform .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {loading ? (
          <div style={{
            height: 140,
            width: 220,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 12,
            color: isMine ? '#fff' : 'var(--text-3)'
          }}>
            <span className="spinner" style={{ width: 16, height: 16 }} />
            Chargement photo...
          </div>
        ) : blobUrl ? (
          <div>
            <img
              src={blobUrl}
              alt={originalname}
              style={{
                width: '100%',
                maxHeight: 220,
                objectFit: 'cover',
                display: 'block',
              }}
            />
            <div style={{
              padding: '4px 8px',
              fontSize: 10,
              color: isMine ? 'rgba(255,255,255,0.85)' : 'var(--text-3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: isMine ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.03)',
            }}>
              <span>📸 {originalname?.length > 25 ? originalname.slice(0, 22) + '...' : originalname}</span>
              <span style={{ opacity: 0.7 }}>🔍 Agrandir</span>
            </div>
          </div>
        ) : (
          <div style={{ padding: 12, fontSize: 12, color: 'var(--danger)' }}>
            ⚠️ Image indisponible
          </div>
        )}
      </div>

      {/* Lightbox / Zoom Modal */}
      {lightbox && blobUrl && (
        <div
          className="modal-overlay"
          onClick={() => setLightbox(false)}
          style={{ zIndex: 10001, background: 'rgba(0,0,0,0.85)' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setLightbox(false)}
              style={{
                position: 'absolute',
                top: -40,
                right: 0,
                color: '#fff',
                fontSize: 22,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
            <img
              src={blobUrl}
              alt={originalname}
              style={{
                maxWidth: '100%',
                maxHeight: '85vh',
                borderRadius: 12,
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                objectFit: 'contain',
              }}
            />
            <div style={{
              marginTop: 10,
              color: '#fff',
              fontSize: 13,
              display: 'flex',
              gap: 12,
              alignItems: 'center',
            }}>
              <span>📸 {originalname}</span>
              <a
                href={blobUrl}
                download={originalname}
                className="btn btn-sm btn-outline"
                style={{ color: '#fff', borderColor: '#fff', padding: '2px 8px', fontSize: 11 }}
              >
                💾 Télécharger
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
