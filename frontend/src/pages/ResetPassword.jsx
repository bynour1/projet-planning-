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
          <div style={{ width:56, height:56, background:'var(--primary)', borderRadius:16,
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            fontSize:28, marginBottom:12 }}>🏥</div>
          <h1 style={{ fontSize:20, fontWeight:800 }}>Planning Médical</h1>
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
      <div style={{ fontSize:48, marginBottom:12 }}>⛔</div>
      <h3 style={{ fontSize:17, fontWeight:700, color:'var(--danger)', marginBottom:8 }}>Lien invalide ou expiré</h3>
      <p style={{ fontSize:13, color:'var(--text-2)', marginBottom:20 }}>
        Le lien de réinitialisation est invalide ou a expiré.
      </p>
      <a href="/forgot-password" style={{
        display:'inline-block', padding:'9px 20px', background:'var(--primary)',
        color:'#fff', borderRadius:8, textDecoration:'none', fontSize:14, fontWeight:600,
      }}>🔁 Demander un nouveau lien</a>
      <br/>
      <a href="/login" style={{ fontSize:13, color:'var(--text-3)', marginTop:12, display:'inline-block' }}>
        ← Retour à la connexion
      </a>
    </div>
  );

  if (step==='done') return wrap(
    <div style={{ textAlign:'center', padding:'8px 0' }}>
      <div style={{ width:64, height:64, background:'var(--accent-lt)', borderRadius:'50%',
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        fontSize:32, marginBottom:16 }}>✅</div>
      <h3 style={{ fontSize:17, fontWeight:700, marginBottom:8 }}>Mot de passe réinitialisé !</h3>
      <p style={{ fontSize:13, color:'var(--text-2)', marginBottom:20 }}>
        Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
      </p>
      <a href="/login" style={{
        display:'inline-block', padding:'10px 24px', background:'var(--primary)',
        color:'#fff', borderRadius:8, textDecoration:'none', fontSize:14, fontWeight:600,
      }}>🔐 Se connecter</a>
    </div>
  );

  return wrap(
    <>
      <div style={{ textAlign:'center', marginBottom:20 }}>
        <div style={{ fontSize:40 }}>🔑</div>
        <h2 style={{ fontSize:17, fontWeight:700, marginTop:8 }}>Nouveau mot de passe</h2>
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
                background:'none', border:'none', cursor:'pointer', fontSize:16 }}>
              {showPwd?'🙈':'👁'}
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
          {loading ? <span className="spinner" style={{ width:18, height:18 }}/> : '🔐 Mettre à jour le mot de passe'}
        </button>
      </form>
    </>
  );
}