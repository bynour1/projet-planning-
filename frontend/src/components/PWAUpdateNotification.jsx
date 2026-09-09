import { useState, useEffect } from 'react';

export default function PWAUpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    // Disable automatic prompts on local dev server to avoid interference with Ctrl+R and HMR
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return;
    }

    if (!('serviceWorker' in navigator)) return;

    let registration = null;

    navigator.serviceWorker.ready.then((reg) => {
      registration = reg;

      // Check if there is already a waiting service worker
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setUpdateAvailable(true);
      }

      // Detect when a new service worker is installing/installed
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setUpdateAvailable(true);
          }
        });
      });
    }).catch(() => {});

    // Periodic check for updates (every 10 minutes)
    const interval = setInterval(() => {
      if (registration) {
        registration.update().catch(() => {});
      }
    }, 10 * 60 * 1000);

    // Check for update on window focus
    const handleFocus = () => {
      if (registration) {
        registration.update().catch(() => {});
      }
    };
    window.addEventListener('focus', handleFocus);

    // Custom event to manually check update
    const handleManualCheck = () => {
      if (registration) {
        registration.update().then(() => {
          if (registration.waiting) {
            setWaitingWorker(registration.waiting);
            setUpdateAvailable(true);
          }
        }).catch(() => {});
      }
    };
    window.addEventListener('check-pwa-update', handleManualCheck);

    // Listen for controllerchange to reload page when new service worker takes over
    let refreshing = false;
    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('check-pwa-update', handleManualCheck);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  async function handleUpdate() {
    setIsUpdating(true);
    try {
      if (waitingWorker) {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      } else if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch {
      window.location.reload();
    }
  }

  if (!updateAvailable) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 99999,
        maxWidth: 400,
        width: 'calc(100vw - 48px)',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: '#ffffff',
        padding: '16px 20px',
        borderRadius: 16,
        boxShadow: '0 10px 35px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, background: '#0284c7',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
          }}>
            🚀
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14.5, letterSpacing: '-0.2px' }}>
              Mise à jour disponible !
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, lineHeight: 1.3 }}>
              Une nouvelle version de l'application est prête à être installée.
            </div>
          </div>
        </div>
        <button
          onClick={() => setUpdateAvailable(false)}
          style={{
            background: 'none', border: 'none', color: '#94a3b8', fontSize: 18,
            cursor: 'pointer', padding: 0, lineHeight: 1
          }}
          title="Fermer"
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        <button
          onClick={handleUpdate}
          disabled={isUpdating}
          style={{
            flex: 1,
            padding: '9px 14px',
            background: 'linear-gradient(90deg, #0ea5e9, #0284c7)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            boxShadow: '0 2px 10px rgba(14, 165, 233, 0.4)'
          }}
        >
          {isUpdating ? (
            <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Installation…</>
          ) : (
            <>🔄 Mettre à jour maintenant</>
          )}
        </button>
        <button
          onClick={() => setUpdateAvailable(false)}
          style={{
            padding: '9px 14px',
            background: 'rgba(255, 255, 255, 0.1)',
            color: '#e2e8f0',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 12.5,
            cursor: 'pointer'
          }}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
