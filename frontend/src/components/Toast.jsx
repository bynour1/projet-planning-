import { useState, useCallback } from 'react';

let _addToast = null;

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 3500, options = {}) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, ...options }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  _addToast = addToast;

  return { toasts, addToast };
}

// Can be called from anywhere after mounting
export function toast(message, type = 'info', duration = 3500, options = {}) {
  _addToast?.(message, type, duration, options);
}

export function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          onClick={() => {
            if (t.onClick) t.onClick();
          }}
          style={{
            cursor: t.onClick ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : (t.icon || 'ℹ')}
          </span>
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
            {t.message}
          </div>
          {t.actionLabel && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (t.onAction) t.onAction();
              }}
              style={{
                marginLeft: 4,
                background: 'rgba(255,255,255,0.22)',
                border: '1px solid rgba(255,255,255,0.4)',
                color: '#fff',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {t.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

