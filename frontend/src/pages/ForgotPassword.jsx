import { useState } from 'react';
import axios from 'axios';

export default function ForgotPassword({ toast }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const val = email.trim();
    if (!val) {
      return toast('Veuillez entrer votre adresse email', 'error');
    }
    setLoading(true);
    try {
      await axios.post('/api/auth/forgot-password', {
        email: val,
        identifier: val,
        method: 'email',
      });
      setSentEmail(val);
      setSent(true);
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors de la demande de réinitialisation', 'error');
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
            width: 52,
            height: 52,
            background: 'var(--primary)',
            color: '#fff',
            borderRadius: 14,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 10,
            boxShadow: '0 4px 14px rgba(2,132,199,.25)'
          }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text)' }}>Planning Médical</h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>GMT Ariana — Médecine du Travail</p>
        </div>

        <div className="card" style={{ boxShadow: 'var(--shadow-lg)', padding: '26px 28px' }}>
          {!sent ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', color: 'var(--text)' }}>
                  Mot de passe oublié
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.45 }}>
                  Saisissez l'adresse email associée à votre compte pour recevoir un lien de réinitialisation sécurisé :
                </p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    Adresse e-mail du compte *
                  </label>
                  <input
                    className="input"
                    type="email"
                    placeholder="exemple@gmt-ariana.tn ou votre@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    style={{ height: 44, fontSize: 14, fontWeight: 600 }}
                  />
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
                    Un lien de réinitialisation à usage unique valable 1 heure vous sera transmis par e-mail.
                  </div>
                </div>

                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={loading || !email.trim()}
                  style={{
                    height: 44,
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {loading ? (
                    <span className="spinner" style={{ width: 18, height: 18 }} />
                  ) : (
                    'Envoyer le lien de réinitialisation'
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
                    marginTop: 4,
                  }}
                >
                  ← Retour à la connexion
                </a>
              </form>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{
                width: 60,
                height: 60,
                background: '#f0fdf4',
                borderRadius: '50%',
                border: '2px solid #bbf7d0',
                color: '#16a34a',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16
              }}>
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>

              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>
                Vérifiez votre boîte de réception
              </h3>

              <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 18px' }}>
                Si un compte actif correspond à <strong>{sentEmail}</strong>, un e-mail contenant votre lien de réinitialisation sécurisé vient de vous être envoyé.
              </p>

              <div style={{
                padding: '14px 16px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                fontSize: 12.5,
                color: 'var(--text)',
                textAlign: 'left',
                lineHeight: 1.55,
                marginBottom: 20
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)' }}>
                  Instructions de sécurité :
                </div>
                <ul style={{ margin: '0 0 0 18px', padding: 0 }}>
                  <li>Le lien d'accès expire dans <strong>1 heure</strong>.</li>
                  <li>Vérifiez également votre dossier <em>Courriers indésirables / Spams</em>.</li>
                  <li>Si vous n'êtes pas à l'origine de la demande, vous pouvez ignorer cet e-mail.</li>
                </ul>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => { setSent(false); setEmail(''); }}
                  style={{ fontSize: 13 }}
                >
                  Renvoyer un autre e-mail
                </button>
                <a
                  href="/login"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '10px 20px',
                    background: 'var(--primary)',
                    color: '#ffffff',
                    borderRadius: 8,
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    boxShadow: '0 2px 8px rgba(14,165,233,.3)'
                  }}
                >
                  ← Page de connexion
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}