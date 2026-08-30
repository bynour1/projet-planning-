import { useState } from 'react';
import axios from 'axios';

export default function ForgotPassword({ toast }) {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const [resetData, setResetData] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return toast('Veuillez entrer votre email', 'error');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/forgot-password', { email });
      setResetData(res.data);
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
              <h3 style={{ fontSize:17, fontWeight:700, marginBottom:8 }}>Demande traitée avec succès</h3>
              <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>
                Si cet email correspond à un compte actif, l'e-mail avec le lien de réinitialisation a été expédié.
              </p>
              <p style={{ fontSize:12, color:'var(--text-3)', marginTop:6 }}>
                Identifiant recherché : <strong>{resetData?.email || email}</strong>
              </p>

              {resetData?.resetUrl && (
                <div style={{
                  marginTop: 16, padding: '14px', background: '#f0f9ff',
                  border: '1px solid #bae6fd', borderRadius: 10, textAlign: 'left',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1', marginBottom: 6 }}>
                    ⚡ Lien d'accès direct de réinitialisation :
                  </div>
                  <p style={{ fontSize: 11.5, color: '#0c4a6e', marginBottom: 12, lineHeight: 1.4 }}>
                    Si vous ne recevez pas l'e-mail (filtres anti-spam ou boîte jetable), vous pouvez utiliser le bouton ci-dessous pour changer votre mot de passe immédiatement :
                  </p>
                  <a
                    href={resetData.resetUrl}
                    style={{
                      display: 'block', textAlign: 'center', padding: '10px 16px',
                      background: 'var(--primary)', color: '#fff', borderRadius: 8,
                      textDecoration: 'none', fontSize: 13, fontWeight: 700,
                      boxShadow: '0 2px 8px rgba(14,165,233,.3)',
                    }}
                  >
                    🔗 Réinitialiser mon mot de passe maintenant
                  </a>
                </div>
              )}

              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 14 }}>
                ⏱ Le lien expire dans <strong>1 heure</strong>.
              </p>

              <a href="/login" style={{
                display:'inline-block', marginTop:16, padding:'9px 20px',
                background:'var(--bg)', border:'1px solid var(--border)', color:'var(--text-1)',
                borderRadius:8, textDecoration:'none', fontSize:13, fontWeight:600,
              }}>← Retour à la connexion</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}