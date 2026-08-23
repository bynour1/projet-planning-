import { useState, useEffect } from 'react';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode (installed PWA)
    if (typeof window !== 'undefined' && ((typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)')?.matches) || window.navigator?.standalone === true)) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (isInstalled) return null;

  async function handleInstallClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      setShowIOSModal(true);
    }
  }

  return (
    <>
      <div
        style={{
          margin: '8px 8px 4px',
          padding: '10px 12px',
          background: 'linear-gradient(135deg, #0284c7, #0ea5e9)',
          borderRadius: 10,
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          boxShadow: '0 2px 8px rgba(14,165,233,.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
          <span>📱</span> Installer sur mobile
        </div>
        <div style={{ fontSize: 11, opacity: 0.9, lineHeight: 1.3 }}>
          Installez l'app sur votre téléphone pour un accès rapide.
        </div>
        <button
          onClick={handleInstallClick}
          style={{
            marginTop: 2,
            padding: '6px 10px',
            background: '#fff',
            color: '#0284c7',
            border: 'none',
            borderRadius: 8,
            fontWeight: 800,
            fontSize: 11,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          📲 Installer l'App
        </button>
      </div>

      {/* Modal d'instructions */}
      {showIOSModal && (
        <div className="modal-overlay" onClick={() => setShowIOSModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📱 Installation sur votre téléphone</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowIOSModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
              {isIOS ? (
                <>
                  <p style={{ fontWeight: 700, color: '#0284c7', marginBottom: 6 }}>Sur iPhone / iPad (Safari) :</p>
                  <ol style={{ paddingLeft: 20, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li>Ouvrez cette page dans <strong>Safari</strong>.</li>
                    <li>Appuyez sur le bouton <strong>Partager</strong> (carré avec flèche 📤 en bas).</li>
                    <li>Sélectionnez <strong>« Sur l'écran d'accueil »</strong> (ou <i>Add to Home Screen</i> ➕).</li>
                    <li>Appuyez sur <strong>Ajouter</strong> en haut à droite.</li>
                  </ol>
                </>
              ) : (
                <>
                  <p style={{ fontWeight: 700, color: '#0284c7', marginBottom: 6 }}>Sur Android (Google Chrome) :</p>
                  <ol style={{ paddingLeft: 20, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li>Appuyez sur les <strong>3 points ⋮</strong> en haut à droite de Chrome.</li>
                    <li>Sélectionnez <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>.</li>
                    <li>Confirmez en appuyant sur <strong>Installer</strong>.</li>
                  </ol>
                </>
              )}
              <div style={{ marginTop: 14, padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534', fontSize: 12 }}>
                ✅ L'icône GMT Ariana apparaîtra sur votre écran d'accueil comme une application native.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowIOSModal(false)}>Compris !</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
