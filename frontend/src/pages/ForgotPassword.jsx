import { useState } from 'react';
import axios from 'axios';

export default function ForgotPassword({ toast }) {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return toast('Veuillez entrer votre email', 'error');
    setLoading(true);
    try {
      await axios.post('/api/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur serveur', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'linear-gradient(135deg,#e0f2fe 0%,#f0f9ff 50%,#ecfdf5 100%)', padding:16,
    }}>
      <div style={{ width:'100%', maxWidth:440 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{
            width:56, height:56, background:'var(--primary)', borderRadius:16,
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            fontSize:28, marginBottom:12, boxShadow:'0 4px 14px rgba(14,165,233,.4)'
          }}>
            🏥
          </div>
          <h1 style={{ fontSize:20, fontWeight:800 }}>Planning Médical</h1>
          <p style={{ fontSize:13, color:'var(--text-2)', marginTop:4 }}>GMT Ariana — Médecine du Travail</p>
        </div>

        <div className="card" style={{ boxShadow:'var(--shadow-lg)' }}>
          {!sent ? (
            <>
              <div style={{ textAlign:'center', marginBottom:20 }}>
                <div style={{ fontSize:40 }}>🔒</div>
                <h2 style={{ fontSize:17, fontWeight:700, marginTop:8 }}>Mot de passe oublié ?</h2>
                <p style={{ fontSize:13, color:'var(--text-2)', marginTop:6, lineHeight:1.4 }}>
                  Entrez votre adresse email ou votre numéro de téléphone pour recevoir un lien de réinitialisation sécurisé.
                </p>
              </div>
              <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div className="form-group">
                  <label>Email ou N° Téléphone</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="vous@exemple.com ou 98 123 456"
                    value={email}
                    onChange={e=>setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={loading||!email}
                  style={{ height:42, justifyContent:'center' }}
                >
                  {loading ? <span className="spinner" style={{ width:18, height:18 }}/> : '✉️ Envoyer le lien sécurisé'}
                </button>
                <a href="/login" style={{ textAlign:'center', fontSize:13, color:'var(--primary)', textDecoration:'none', marginTop:4 }}>
                  ← Retour à la connexion
                </a>
              </form>
            </>
          ) : (
            <div style={{ textAlign:'center', padding:'8px 0' }}>
              <div style={{
                width:64, height:64, background:'#f0fdf4', borderRadius:'50%',
                border:'2px solid #bbf7d0', display:'inline-flex', alignItems:'center',
                justifyContent:'center', fontSize:30, marginBottom:16
              }}>
                📬
              </div>
              <h3 style={{ fontSize:17, fontWeight:700, marginBottom:8, color:'var(--text)' }}>
                Vérifiez votre boîte de réception
              </h3>
              <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6, margin:'0 0 14px' }}>
                Si cet email correspond à un compte actif, un lien de réinitialisation sécurisé et privé vous a été envoyé.
              </p>

              <div style={{
                padding:'12px 14px', background:'#f8fafc', border:'1px solid #e2e8f0',
                borderRadius:10, fontSize:12, color:'#475569', textAlign:'left', lineHeight:1.5
              }}>
                <div style={{ fontWeight:700, color:'#0f172a', marginBottom:4, display:'flex', alignItems:'center', gap:6 }}>
                  <span>🛡️</span> Sécurité du compte :
                </div>
                <ul style={{ margin:'0 0 0 18px', padding:0 }}>
                  <li>Le lien expire dans <strong>1 heure</strong>.</li>
                  <li>Le mot de passe ne peut être réinitialisé que depuis l'e-mail privé reçu.</li>
                  <li>Vérifiez votre dossier <em>Courriers indésirables (Spam)</em> si nécessaire.</li>
                </ul>
              </div>

              <div style={{ marginTop:20 }}>
                <a
                  href="/login"
                  style={{
                    display:'inline-block', padding:'10px 20px',
                    background:'var(--primary)', color:'#ffffff',
                    borderRadius:8, textDecoration:'none', fontSize:13, fontWeight:700,
                    boxShadow:'0 2px 8px rgba(14,165,233,.3)'
                  }}
                >
                  ← Retour à la connexion
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}