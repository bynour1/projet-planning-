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
        <div style={{ marginTop: 6 }}>
          {deferredPrompt ? (
            <button
              onClick={handleInstallClick}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#fff',
                color: '#0284c7',
                border: 'none',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              📲 Installer l'Application
            </button>
          ) : (
            <button
              onClick={() => setShowIOSModal(true)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#fff',
                color: '#0284c7',
                border: 'none',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              📷 Ouvrir sur Mobile (QR Code)
            </button>
          )}
        </div>
      </div>

      {/* Modal d'instructions & QR Code */}
      {showIOSModal && (
        <div className="modal-overlay" onClick={() => setShowIOSModal(false)}>
          <div className="modal" style={{ maxWidth: 440, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                📱 Accès & Installation Mobile
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowIOSModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
              
              <div style={{ margin: '10px auto 16px', padding: 12, background: '#fff', borderRadius: 12, display: 'inline-block', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`}
                  alt="QR Code Planning Médical"
                  style={{ width: 190, height: 190, display: 'block', borderRadius: 8 }}
                />
                <p style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: '#0284c7' }}>
                  Scannez avec l'appareil photo du téléphone
                </p>
              </div>

              <div style={{ textAlign: 'center', background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                {deferredPrompt ? (
                  <button
                    onClick={() => {
                      handleInstallClick();
                      setShowIOSModal(false);
                    }}
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '10px 16px', fontSize: 13, fontWeight: 800, borderRadius: 10, justifyContent: 'center' }}
                  >
                    📲 Installer l'Application Maintenant
                  </button>
                ) : isIOS ? (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'left', width: '100%' }}>
                    <strong style={{ color: '#0284c7' }}>Sur iPhone / iPad :</strong> Appuyez sur <strong>Partager 📤</strong> puis <strong>« Sur l'écran d'accueil » ➕</strong>.
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center', width: '100%' }}>
                    Scannez le QR code ou ouvrez le lien sur votre smartphone pour l'installer directement sur votre écran d'accueil.
                  </div>
                )}
              </div>

              <div style={{ marginTop: 12, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534', fontSize: 11 }}>
                ✅ Installation directe et rapide en 1 clic.
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn btn-outline" onClick={() => setShowIOSModal(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
