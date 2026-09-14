import { useState, useRef, useEffect } from 'react';

/**
 * Composant de menu déroulant professionnel et unifié pour les exports et l'impression.
 * Regroupe Imprimer, PDF, Excel et Word dans un bouton compact et moderne.
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
          fontWeight: 800,
          fontSize: 12,
          padding: '6px 12px',
          borderRadius: 8,
          background: open ? 'var(--surface2)' : 'var(--surface)',
          borderColor: open ? 'var(--primary)' : 'var(--border)',
          color: 'var(--text)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          transition: 'all 0.15s ease',
          ...buttonStyle,
        }}
        title="Options d'exportation et d'impression"
      >
        <span style={{ fontSize: 13 }}>📄</span>
        <span>{label}</span>
        <span style={{ fontSize: 10, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
          ▼
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            [align === 'right' ? 'right' : 'left']: 0,
            zIndex: 1000,
            minWidth: 200,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.04)',
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
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                color: '#991b1b',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 15 }}>📕</span>
              <div style={{ flex: 1 }}>
                <div>Document PDF (.pdf)</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>Format officiel A4 Paysage</div>
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
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                color: '#166534',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 15 }}>📗</span>
              <div style={{ flex: 1 }}>
                <div>Tableur Excel (.xlsx)</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>Données et calculs bruts</div>
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
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                color: '#1e40af',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 15 }}>📘</span>
              <div style={{ flex: 1 }}>
                <div>Document Word (.doc)</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>Rapport éditable</div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
