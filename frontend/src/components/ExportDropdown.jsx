import { useState, useRef, useEffect } from 'react';

/**
 * Composant de menu déroulant professionnel et unifié pour les exports et l'impression.
 * Regroupe Imprimer, PDF, Excel et Word dans un bouton compact et moderne (style Linear / Stripe).
 */
export default function ExportDropdown({
  onPrint,
  onPDF,
  onExcel,
  onWord,
  onICS,
  label = 'Exporter & Imprimer',
  buttonStyle = {},
  align = 'right',
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: 600,
          fontSize: 12.5,
          padding: '6px 12px',
          borderRadius: 8,
          background: open ? 'var(--surface2)' : 'var(--surface)',
          borderColor: open ? 'var(--primary)' : 'var(--border)',
          color: 'var(--text)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          transition: 'all 0.15s ease',
          ...buttonStyle,
        }}
        title="Options d'exportation et d'impression"
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>{label}</span>
        <svg
          width="12"
          height="12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          style={{
            opacity: 0.6,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            [align === 'right' ? 'right' : 'left']: 0,
            zIndex: 1000,
            minWidth: 220,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)',
            padding: 5,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            animation: 'fadeIn 0.12s ease-out',
          }}
        >
          {onPDF && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOpen(false);
                onPDF();
              }}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                padding: '8px 12px',
                borderRadius: 7,
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--text)',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: '#fef2f2', border: '1px solid #fecaca',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#dc2626', flexShrink: 0
              }}>
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div>Document PDF (.pdf)</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 400 }}>Format officiel A4 Paysage</div>
              </div>
            </button>
          )}

          {onExcel && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOpen(false);
                onExcel();
              }}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                padding: '8px 12px',
                borderRadius: 7,
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--text)',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#16a34a', flexShrink: 0
              }}>
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div>Tableur Excel (.xlsx)</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 400 }}>Données et calculs bruts</div>
              </div>
            </button>
          )}

          {onWord && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOpen(false);
                onWord();
              }}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                padding: '8px 12px',
                borderRadius: 7,
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--text)',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: '#eff6ff', border: '1px solid #bfdbfe',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#2563eb', flexShrink: 0
              }}>
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div>Document Word (.doc)</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 400 }}>Rapport éditable</div>
              </div>
            </button>
          )}

          {onPrint && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOpen(false);
                onPrint();
              }}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                padding: '8px 12px',
                borderRadius: 7,
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--text)',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text)', flexShrink: 0
              }}>
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div>Imprimer</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 400 }}>Aperçu d'impression</div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
