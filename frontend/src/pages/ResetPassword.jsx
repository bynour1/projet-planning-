import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8083';

export default function ResetPassword({ toast }) {
  const [params]  = useSearchParams();
  const token     = params.get('token');
  const [step,    setStep]    = useState('checking');
  const [email,   setEmail]   = useState('');
  const [form,    setForm]    = useState({ new_password:'', confirm:'' });
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    if (!token) { setStep('invalid'); return; }
    axios.get(`${API_BASE}/api/auth/reset-password?token=${token}`)
      .then(r => { setEmail(r.data.email); setStep('valid'); })
      .catch(() => setStep('invalid'));
  }, [token]);

  function strength(p) {
    let s=0;
    if(p.length>=6) s++; if(p.length>=8) s++;
    if(/[A-Z]/.test(p)) s++; if(/[0-9]/.test(p)) s++;
    return s;
  }
  const COLORS = ['','#ef4444','#f59e0b','#22c55e','#10b981'];
  const LABELS = ['','Faible','Moyen','Bon','Fort'];
  const s = strength(form.new_password);

  async function handleReset(e) {
    e.preventDefault();
    if (form.new_password !== form.confirm) return toast('Les mots de passe ne correspondent pas','error');
    if (form.new_password.length < 6)       return toast('Minimum 6 caractères','error');
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/api/auth/reset-password`, { token, password: form.new_password });
      toast('Mot de passe réinitialisé avec succès', 'success');
      setStep('done');
    } catch(err) {
      toast(err.response?.data?.message || 'Lien invalide ou expiré','error');
      setStep('invalid');
    } finally { setLoading(false); }
  }

  const wrap = (content) => (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'linear-gradient(135deg,#e0f2fe,#f0f9ff,#ecfdf5)', padding:16 }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ width:52, height:52, background:'var(--primary)', color:'#fff', borderRadius:14,
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            marginBottom:12, boxShadow:'0 4px 14px rgba(2,132,199,.25)' }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h1 style={{ fontSize:20, fontWeight:800, margin:0, color:'var(--text)' }}>Planning Médical</h1>
          <p style={{ fontSize:13, color:'var(--text-2)', marginTop:4 }}>GMT Ariana — Médecine du Travail</p>
        </div>
        <div className="card" style={{ boxShadow:'var(--shadow-lg)' }}>{content}</div>
      </div>
    </div>
  );

  if (step==='checking') return wrap(
    <div style={{ textAlign:'center', padding:'24px 0' }}>
      <div className="spinner" style={{ width:32, height:32, margin:'0 auto 12px' }}/>
      <p style={{ color:'var(--text-2)', fontSize:14 }}>Vérification du lien...</p>
    </div>
  );

  if (step==='invalid') return wrap(
    <div style={{ textAlign:'center', padding:'8px 0' }}>
      <div style={{
        width: 54, height: 54, borderRadius: '50%', background: '#fee2e2', color: '#dc2626',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px'
      }}>
        <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h3 style={{ fontSize:17, fontWeight:700, color:'var(--danger)', marginBottom:8 }}>Lien invalide ou expiré</h3>
      <p style={{ fontSize:13, color:'var(--text-2)', marginBottom:20 }}>
        Le lien de réinitialisation est invalide ou a expiré.
      </p>
      <a href="/forgot-password" style={{
        display:'inline-block', padding:'9px 20px', background:'var(--primary)',
        color:'#fff', borderRadius:8, textDecoration:'none', fontSize:14, fontWeight:600,
      }}>Demander un nouveau lien</a>
      <br/>
      <a href="/login" style={{ fontSize:13, color:'var(--text-3)', marginTop:12, display:'inline-block' }}>
        ← Retour à la connexion
      </a>
    </div>
  );

  if (step==='done') return wrap(
    <div style={{ textAlign:'center', padding:'8px 0' }}>
      <div style={{ width:56, height:56, background:'#f0fdf4', color:'#16a34a', border:'2px solid #bbf7d0', borderRadius:'50%',
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        marginBottom:16 }}>
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h3 style={{ fontSize:17, fontWeight:700, marginBottom:8 }}>Mot de passe réinitialisé</h3>
      <p style={{ fontSize:13, color:'var(--text-2)', marginBottom:20 }}>
        Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
      </p>
      <a href="/login" style={{
        display:'inline-block', padding:'10px 24px', background:'var(--primary)',
        color:'#fff', borderRadius:8, textDecoration:'none', fontSize:14, fontWeight:600,
      }}>Se connecter</a>
    </div>
  );

  return wrap(
    <>
      <div style={{ textAlign:'center', marginBottom:20 }}>
        <h2 style={{ fontSize:18, fontWeight:700, margin:0, color:'var(--text)' }}>Nouveau mot de passe</h2>
        {email && <p style={{ fontSize:13, color:'var(--text-2)', marginTop:4 }}>Pour : <strong>{email}</strong></p>}
      </div>
      <form onSubmit={handleReset} style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div className="form-group">
          <label>Nouveau mot de passe</label>
          <div style={{ position:'relative' }}>
            <input className="input" type={showPwd?'text':'password'} placeholder="Nouveau mot de passe"
              value={form.new_password} onChange={e=>setForm(p=>({...p,new_password:e.target.value}))}
              required style={{ paddingRight:40 }}/>
            <button type="button" onClick={()=>setShowPwd(v=>!v)}
              style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', display:'flex', alignItems:'center' }}>
              {showPwd ? (
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {form.new_password && (
            <div style={{ marginTop:6 }}>
              <div style={{ display:'flex', gap:3, marginBottom:3 }}>
                {[1,2,3,4].map(i=>(
                  <div key={i} style={{ flex:1, height:3, borderRadius:2,
                    background: s>=i ? COLORS[s] : 'var(--border)', transition:'background .2s' }}/>
                ))}
              </div>
              <span style={{ fontSize:11, color:COLORS[s], fontWeight:600 }}>{LABELS[s]}</span>
            </div>
          )}
        </div>
        <div className="form-group">
          <label>Confirmer le mot de passe</label>
          <input className="input" type="password" placeholder="Confirmer le mot de passe"
            value={form.confirm} onChange={e=>setForm(p=>({...p,confirm:e.target.value}))} required
            style={{ borderColor: form.confirm&&form.confirm!==form.new_password?'var(--danger)':'' }}/>
          {form.confirm && form.confirm!==form.new_password &&
            <span style={{ fontSize:12, color:'var(--danger)' }}>✗ Ne correspondent pas</span>}
          {form.confirm && form.confirm===form.new_password &&
            <span style={{ fontSize:12, color:'var(--accent)' }}>✓ Identiques</span>}
        </div>
        <button className="btn btn-primary" type="submit"
          disabled={loading||!form.new_password||!form.confirm} style={{ height:42 }}>
          {loading ? <span className="spinner" style={{ width:18, height:18 }}/> : 'Mettre à jour le mot de passe'}
        </button>
      </form>
    </>
  );
}