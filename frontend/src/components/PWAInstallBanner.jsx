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
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          color: 'var(--text)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--primary)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Application mobile
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.3 }}>
          Accédez directement à vos plannings depuis votre smartphone.
        </div>
        <div style={{ marginTop: 4 }}>
          {deferredPrompt ? (
            <button
              onClick={handleInstallClick}
              className="btn btn-primary btn-sm"
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: 11.5,
                fontWeight: 700,
                justifyContent: 'center',
                borderRadius: 7,
              }}
            >
              Installer l'application
            </button>
          ) : (
            <button
              onClick={() => setShowIOSModal(true)}
              className="btn btn-outline btn-sm"
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: 11.5,
                fontWeight: 600,
                justifyContent: 'center',
                borderRadius: 7,
                background: 'var(--surface)',
              }}
            >
              Ouvrir sur mobile
            </button>
          )}
        </div>
      </div>

      {/* Modal d'instructions & QR Code */}
      {showIOSModal && (
        <div className="modal-overlay" onClick={() => setShowIOSModal(false)}>
          <div className="modal" style={{ maxWidth: 440, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                Accès & installation mobile
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowIOSModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
              
              <div style={{ margin: '10px auto 16px', padding: 12, background: '#fff', borderRadius: 12, display: 'inline-block', border: '1px solid var(--border)' }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`}
                  alt="QR Code Planning Médical"
                  style={{ width: 180, height: 180, display: 'block', borderRadius: 6 }}
                />
                <p style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>
                  Scannez avec l'appareil photo de votre smartphone
                </p>
              </div>

              <div style={{ textAlign: 'center', background: 'var(--surface2)', padding: 14, borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                {deferredPrompt ? (
                  <button
                    onClick={() => {
                      handleInstallClick();
                      setShowIOSModal(false);
                    }}
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '10px 16px', fontSize: 13, fontWeight: 700, borderRadius: 8, justifyContent: 'center' }}
                  >
                    Installer l'application
                  </button>
                ) : isIOS ? (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'left', width: '100%' }}>
                    <strong>Sur iPhone / iPad :</strong> Appuyez sur le bouton <em>Partager</em> dans Safari puis sélectionnez <em>« Sur l'écran d'accueil »</em>.
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center', width: '100%' }}>
                    Scannez le QR code ou ouvrez le lien sur votre smartphone pour installer l'application sur votre écran d'accueil.
                  </div>
                )}
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
