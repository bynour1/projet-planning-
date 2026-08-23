import React, { useRef, useState, useEffect } from 'react';

export default function SignaturePadModal({ event, onClose, onSave, toast }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signataire, setSignataire] = useState('');
  const [observation, setObservation] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleValidate = () => {
    if (!hasDrawn) {
      toast?.('Veuillez apposer votre signature avant de valider', 'error');
      return;
    }
    const signatureDataUrl = canvasRef.current.toDataURL('image/png');
    onSave?.({
      eventId: event?.id,
      signataire: signataire.trim() || 'Responsable sur site',
      observation: observation.trim(),
      signature: signatureDataUrl,
      validatedAt: new Date().toISOString(),
    });
    toast?.('Intervention validée avec signature tactile ✓', 'success');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              ✍️ Validation & Signature sur site
            </h3>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {event?.titre || 'Intervention'} • {event?.date_fmt || event?.date || ''}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ gap: 12 }}>
          <div style={{ background: 'var(--surface2, #f1f5f9)', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
            <div><strong>Intervention :</strong> {event?.titre || '—'}</div>
            {event?.medecin_nom && <div><strong>Médecin :</strong> {event.medecin_nom}</div>}
            {event?.technicien_nom && <div><strong>Technicien :</strong> {event.technicien_nom}</div>}
            {event?.adresse && <div><strong>Lieu :</strong> {event.adresse}</div>}
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
              Nom et fonction du signataire
            </label>
            <input
              type="text"
              className="input"
              placeholder="Ex: M. Ben Ali — Responsable RH"
              value={signataire}
              onChange={e => setSignataire(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
              Observations / Compte-rendu rapide (optionnel)
            </label>
            <textarea
              className="input"
              rows={2}
              placeholder="Visite effectuée sans incident, 15 examens réalisés..."
              value={observation}
              onChange={e => setObservation(e.target.value)}
              style={{ width: '100%', resize: 'none' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
                Signature tactile (Doigt / Stylet / Souris)
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, color: 'var(--danger)', padding: '2px 6px' }}
                onClick={clearCanvas}
              >
                Effacer ↺
              </button>
            </div>

            <div style={{
              border: '2px dashed var(--border, #cbd5e1)',
              borderRadius: 8,
              background: '#ffffff',
              touchAction: 'none',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <canvas
                ref={canvasRef}
                width={440}
                height={160}
                style={{ width: '100%', height: 160, display: 'block', cursor: 'crosshair' }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              {!hasDrawn && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94a3b8',
                  fontSize: 13,
                  pointerEvents: 'none'
                }}>
                  Signer ici avec le doigt ou la souris ✍️
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleValidate} disabled={!hasDrawn}>
            ✓ Valider l'intervention
          </button>
        </div>
      </div>
    </div>
  );
}
