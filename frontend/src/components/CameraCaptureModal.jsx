import React, { useState, useEffect, useRef } from 'react';

export default function CameraCaptureModal({ isOpen, onClose, onCapture }) {
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // 'user' | 'environment'
  const [photoBlob, setPhotoBlob] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    startCamera(facingMode);
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  async function startCamera(mode) {
    stopCamera();
    setError(null);
    setLoading(true);
    try {
      const constraints = {
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn('Camera facingMode error, fallback to any video stream:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setStream(fallbackStream);
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
        }
      } catch (err2) {
        console.error('Camera access error:', err2);
        setError("Impossible d'accéder à la caméra. Veuillez vérifier les permissions de votre navigateur.");
      }
    } finally {
      setLoading(false);
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }

  function takePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        setPhotoBlob(blob);
        setPhotoPreview(URL.createObjectURL(blob));
        stopCamera();
      }
    }, 'image/jpeg', 0.88);
  }

  function retake() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoBlob(null);
    setPhotoPreview(null);
    startCamera(facingMode);
  }

  function confirmPhoto() {
    if (photoBlob) {
      const file = new File([photoBlob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
      handleClose();
    }
  }

  function toggleCamera() {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }

  function handleClose() {
    stopCamera();
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoBlob(null);
    setPhotoPreview(null);
    setError(null);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose} style={{ zIndex: 10000 }}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 500,
          width: '95%',
          background: '#0f172a',
          color: '#fff',
          borderRadius: 16,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            📸 Appareil Photo / Caméra
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={handleClose}
            style={{ color: '#fff', fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        {/* Viewport */}
        <div style={{
          position: 'relative',
          background: '#000',
          aspectRatio: '4/3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {error ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#f87171', fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
              {error}
            </div>
          ) : photoPreview ? (
            <img
              src={photoPreview}
              alt="Photo prise"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <>
              {loading && <div style={{ color: '#94a3b8', fontSize: 13 }}>Activation de la caméra...</div>}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: loading ? 'none' : 'block',
                  transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                }}
              />
            </>
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {/* Action Controls */}
        <div style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#1e293b',
          gap: 10,
        }}>
          {!photoPreview && !error ? (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={toggleCamera}
                title="Changer de caméra"
                style={{ color: '#94a3b8', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                🔄 Retourner
              </button>

              {/* Shutter Button */}
              <button
                type="button"
                onClick={takePhoto}
                disabled={loading || error}
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  border: '4px solid #fff',
                  background: '#ef4444',
                  boxShadow: '0 0 15px rgba(239,68,68,0.6)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  transition: 'transform .1s',
                }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                title="Prendre la photo"
              >
                📸
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleClose}
                style={{ color: '#94a3b8', fontSize: 13 }}
              >
                Annuler
              </button>
            </>
          ) : photoPreview ? (
            <>
              <button
                type="button"
                className="btn btn-outline"
                onClick={retake}
                style={{ flex: 1, borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
              >
                🔄 Reprendre
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmPhoto}
                style={{ flex: 1, background: '#059669', borderColor: '#059669' }}
              >
                ✅ Envoyer la photo
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleClose}
              style={{ width: '100%', color: '#fff' }}
            >
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
