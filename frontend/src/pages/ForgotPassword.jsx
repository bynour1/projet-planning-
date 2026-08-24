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
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ width:56, height:56, background:'var(--primary)', borderRadius:16,
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            fontSize:28, marginBottom:12, boxShadow:'0 4px 14px rgba(14,165,233,.4)' }}>🏥</div>
          <h1 style={{ fontSize:20, fontWeight:800 }}>Planning Médical</h1>
          <p style={{ fontSize:13, color:'var(--text-2)', marginTop:4 }}>Réinitialisation du mot de passe</p>
        </div>

        <div className="card" style={{ boxShadow:'var(--shadow-lg)' }}>
          {!sent ? (
            <>
              <div style={{ textAlign:'center', marginBottom:20 }}>
                <div style={{ fontSize:40 }}>🔒</div>
                <h2 style={{ fontSize:17, fontWeight:700, marginTop:8 }}>Mot de passe oublié ?</h2>
                <p style={{ fontSize:13, color:'var(--text-2)', marginTop:6 }}>
                  Entrez votre email ou votre numéro de téléphone pour réinitialiser vos accès.
                </p>
              </div>
              <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div className="form-group">
                  <label>Email ou N° Téléphone</label>
                  <input className="input" type="text" placeholder="vous@exemple.com ou 98 123 456"
                    value={email} onChange={e=>setEmail(e.target.value)} required autoFocus />
                </div>
                <button className="btn btn-primary" type="submit" disabled={loading||!email} style={{ height:42 }}>
                  {loading ? <span className="spinner" style={{ width:18, height:18 }}/> : '🚀 Envoyer le lien / SMS'}
                </button>
                <a href="/login" style={{ textAlign:'center', fontSize:13, color:'var(--primary)', textDecoration:'none' }}>
                  ← Retour à la connexion
                </a>
              </form>
            </>
          ) : (
            <div style={{ textAlign:'center', padding:'8px 0' }}>
              <div style={{ width:64, height:64, background:'var(--accent-lt)', borderRadius:'50%',
                display:'inline-flex', alignItems:'center', justifyContent:'center',
                fontSize:32, marginBottom:16 }}>✅</div>
              <h3 style={{ fontSize:17, fontWeight:700, marginBottom:8 }}>Email envoyé !</h3>
              <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>
                Si cet email correspond à un compte actif,
                vous recevrez un lien de réinitialisation.
              </p>
              <p style={{ fontSize:12, color:'var(--text-3)', marginTop:6 }}>
                Adresse demandée : <strong>{email}</strong>
              </p>
              <p style={{ fontSize:12, color:'var(--text-3)', marginTop:10 }}>
                ⏱ Le lien expire dans <strong>1 heure</strong>. Vérifiez vos spams.
              </p>
              <a href="/login" style={{
                display:'inline-block', marginTop:20, padding:'9px 20px',
                background:'var(--primary)', color:'#fff', borderRadius:8,
                textDecoration:'none', fontSize:14, fontWeight:600,
              }}>← Retour à la connexion</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}