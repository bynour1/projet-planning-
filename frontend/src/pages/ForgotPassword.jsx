import { useState } from 'react';
import axios from 'axios';

export default function ForgotPassword({ toast }) {
  const [method, setMethod] = useState('email'); // 'email' | 'phone'
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentMethod, setSentMethod] = useState('email');

  async function handleSubmit(e) {
    e.preventDefault();
    const val = identifier.trim();
    if (!val) {
      return toast(
        method === 'email' ? 'Veuillez entrer votre adresse email' : 'Veuillez entrer votre numéro de téléphone',
        'error'
      );
    }
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/forgot-password', {
        identifier: val,
        email: val,
        method,
      });
      setSentMethod(res.data?.method || method);
      setSent(true);
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors de la demande', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg,#e0f2fe 0%,#f0f9ff 50%,#ecfdf5 100%)',
      padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56,
            height: 56,
            background: 'var(--primary)',
            borderRadius: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            marginBottom: 10,
            boxShadow: '0 4px 14px rgba(14,165,233,.4)'
          }}>
            🏥
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Planning Médical</h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>GMT Ariana — Médecine du Travail</p>
        </div>

        <div className="card" style={{ boxShadow: 'var(--shadow-lg)', padding: '24px 26px' }}>
          {!sent ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <div style={{ fontSize: 36 }}>🔒</div>
                <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 6, color: 'var(--text)' }}>
                  Mot de passe oublié ?
                </h2>
                <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.4 }}>
                  Choisissez comment vous souhaitez recevoir votre lien ou code de réinitialisation sécurisé :
                </p>
              </div>

              {/* ── Choix du mode : Email ou SMS ── */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 6,
                background: 'var(--surface2)',
                padding: 4,
                borderRadius: 10,
                border: '1px solid var(--border)',
                marginBottom: 18,
              }}>
                <button
                  type="button"
                  onClick={() => { setMethod('email'); setIdentifier(''); }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: method === 'email' ? 'var(--surface)' : 'transparent',
                    color: method === 'email' ? 'var(--primary-dk)' : 'var(--text-2)',
                    boxShadow: method === 'email' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>✉️</span> Par Email
                </button>
                <button
                  type="button"
                  onClick={() => { setMethod('phone'); setIdentifier(''); }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: method === 'phone' ? 'var(--surface)' : 'transparent',
                    color: method === 'phone' ? '#0d9488' : 'var(--text-2)',
                    boxShadow: method === 'phone' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>📱</span> Par Téléphone (SMS)
                </button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {method === 'email' ? (
                      <><span>✉️</span> Adresse Email du compte *</>
                    ) : (
                      <><span>📱</span> Numéro de Téléphone portable *</>
                    )}
                  </label>
                  <input
                    className="input"
                    type={method === 'email' ? 'email' : 'tel'}
                    placeholder={method === 'email' ? 'Ex: medecin@gmt-ariana.tn' : 'Ex: 98 123 456 ou +216 98 123 456'}
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    required
                    autoFocus
                    style={{ height: 42, fontSize: 14, fontWeight: 600 }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                    {method === 'email'
                      ? 'Un lien de réinitialisation unique et crypté sera envoyé à cette adresse.'
                      : 'Un SMS contenant le lien d\'accès sécurisé sera envoyé sur ce numéro.'}
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={loading || !identifier.trim()}
                  style={{
                    height: 42,
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 13.5,
                    background: method === 'phone' ? 'linear-gradient(135deg, #0d9488, #059669)' : undefined,
                  }}
                >
                  {loading ? (
                    <span className="spinner" style={{ width: 18, height: 18 }} />
                  ) : method === 'email' ? (
                    '✉️ Recevoir le lien par Email'
                  ) : (
                    '📱 Recevoir le lien par SMS'
                  )}
                </button>

                <a
                  href="/login"
                  style={{
                    textAlign: 'center',
                    fontSize: 13,
                    color: 'var(--primary)',
                    textDecoration: 'none',
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  ← Retour à la connexion
                </a>
              </form>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{
                width: 64,
                height: 64,
                background: sentMethod === 'phone' ? '#ecfdf5' : '#f0fdf4',
                borderRadius: '50%',
                border: sentMethod === 'phone' ? '2px solid #a7f3d0' : '2px solid #bbf7d0',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 30,
                marginBottom: 16
              }}>
                {sentMethod === 'phone' ? '📱' : '📬'}
              </div>

              <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>
                {sentMethod === 'phone'
                  ? 'Vérifiez vos messages SMS'
                  : 'Vérifiez votre boîte de réception'}
              </h3>

              <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 16px' }}>
                {sentMethod === 'phone'
                  ? 'Si ce numéro correspond à un compte actif dans GMT Ariana, vous recevrez un SMS avec le lien sécurisé.'
                  : 'Si cette adresse email correspond à un compte actif, un lien de réinitialisation sécurisé vous a été envoyé.'}
              </p>

              <div style={{
                padding: '12px 14px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                fontSize: 12,
                color: 'var(--text)',
                textAlign: 'left',
                lineHeight: 1.5
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🛡️</span> Informations de sécurité :
                </div>
                <ul style={{ margin: '0 0 0 18px', padding: 0 }}>
                  <li>Le lien d'accès expire dans <strong>1 heure</strong>.</li>
                  {sentMethod === 'email' && (
                    <li>Vérifiez aussi votre dossier <em>Courriers indésirables (Spam)</em> si besoin.</li>
                  )}
                  {sentMethod === 'phone' && (
                    <li>Assurez-vous que votre téléphone capte le réseau mobile.</li>
                  )}
                </ul>
              </div>

              <div style={{ marginTop: 20 }}>
                <a
                  href="/login"
                  style={{
                    display: 'inline-block',
                    padding: '10px 22px',
                    background: 'var(--primary)',
                    color: '#ffffff',
                    borderRadius: 8,
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    boxShadow: '0 2px 8px rgba(14,165,233,.3)'
                  }}
                >
                  ← Retour à la page de connexion
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}