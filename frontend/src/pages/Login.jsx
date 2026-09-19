import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import PWAInstallBanner from '../components/PWAInstallBanner';

export default function Login({ toast }) {
  const { login } = useAuth();
  const [form,    setForm]    = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [twoFA, setTwoFA] = useState({ required: false, userId: null, code: '', loading: false });

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(form.email, form.password);
      if (res?.requires2FA) {
        setTwoFA(t => ({ ...t, required: true, userId: res.userId }));
        toast('Code 2FA envoyé par email et SMS', 'info');
      }
    } catch (err) {
      toast(err.response?.data?.message || err.message || 'Identifiants incorrects', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometricLogin() {
    if (!window.PublicKeyCredential) {
      return toast("Votre appareil ne supporte pas l'authentification biométrique (WebAuthn)", "error");
    }

    const savedId = localStorage.getItem('gmt_bio_id');
    const savedEmail = localStorage.getItem('gmt_bio_email') || form.email;

    if (!savedId) {
      return toast("Aucune empreinte enregistrée sur cet appareil. Connectez-vous d'abord avec votre mot de passe, puis activez la biométrie dans vos Paramètres ⚙️.", "info");
    }

    setBioLoading(true);
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      // Prompt device biometric sensor (Face ID, Touch ID, Windows Hello, Fingerprint)
      await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: "preferred",
        }
      });

      const { data } = await axios.post('/api/auth/biometric/login', {
        credentialId: savedId,
        email: savedEmail,
      });

      sessionStorage.setItem('pm_token', data.token);
      sessionStorage.setItem('pm_user', JSON.stringify(data.user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
      window.location.reload();
    } catch (err) {
      console.warn(err);
      toast(err.response?.data?.message || err.message || 'Échec de la reconnaissance biométrique', 'error');
    } finally {
      setBioLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #ecfdf5 100%)',
      padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo GMT Ariana */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/logo-gmt.png"
            alt="GMT Ariana"
            style={{
              width: 110, height: 110, borderRadius: '50%', objectFit: 'cover',
              marginBottom: 14, boxShadow: '0 4px 18px rgba(14,100,180,.25)',
              border: '3px solid var(--border)',
            }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Planning Médical</h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>GMT Ariana — Groupement de Médecine du Travail</p>
        </div>

        <div className="card" style={{ boxShadow: 'var(--shadow-lg)' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label>Email ou N° Téléphone</label>
              <input
                className="input"
                type="text"
                placeholder="vous@exemple.com ou 98 123 456"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Mot de passe</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  required
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(p => !p)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
                >
                  {showPwd ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <button className="btn btn-primary" type="submit" disabled={loading || bioLoading}
              style={{ marginTop: 4, height: 42, fontSize: 15, justifyContent: 'center' }}>
              {loading ? <span className="spinner" style={{ width: 18, height: 18, marginRight: 8, display: 'inline-block', verticalAlign: 'middle' }} /> : '🔐 '}
              <span>Se connecter</span>
            </button>

            {/* Biometric Login Button (Face ID / Fingerprint / Windows Hello) */}
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleBiometricLogin}
              disabled={loading || bioLoading}
              style={{ height: 40, fontSize: 14, justifyContent: 'center', borderColor: '#0ea5e9', color: '#0284c7' }}
            >
              {bioLoading ? <span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} /> : '👆 '}
              <span>Connexion Empreinte / Face ID</span>
            </button>

            <div style={{ textAlign: 'center', marginTop: 4 }}>
              <a href="/forgot-password" style={{
                fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500,
              }}>
                🔑 Mot de passe oublié ?
              </a>
            </div>
          </form>
        </div>

        {twoFA.required && (
          <div className="card" style={{boxShadow:'var(--shadow-lg)',marginTop:16}}>
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:12}}>🔐 Vérification 2FA</h3>
            <p style={{fontSize:13,color:'var(--text-2)',marginBottom:16}}>Un code a été envoyé à votre email et téléphone. Saisissez-le ci-dessous :</p>
            <form onSubmit={async(e)=>{
              e.preventDefault();
              setTwoFA(t=>({...t,loading:true}));
              try {
                const {data} = await axios.post('/api/auth/verify-2fa', {userId:twoFA.userId, code:twoFA.code});
                sessionStorage.setItem('pm_token', data.token);
                sessionStorage.setItem('pm_user', JSON.stringify(data.user));
                axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
                window.location.reload();
              } catch(err) {
                toast(err.response?.data?.message||'Code invalide','error');
              } finally {
                setTwoFA(t=>({...t,loading:false}));
              }
            }} style={{display:'flex',flexDirection:'column',gap:12}}>
              <input className="input" type="text" maxLength={6} placeholder="123456"
                value={twoFA.code}
                onChange={e=>setTwoFA(t=>({...t,code:e.target.value}))}
                style={{textAlign:'center',fontSize:24,letterSpacing:8,fontWeight:700}}
                required autoFocus />
              <button className="btn btn-primary" type="submit" disabled={twoFA.loading}>
                {twoFA.loading ? 'Vérification...' : '✔️ Vérifier'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setTwoFA({required:false,userId:null,code:'',loading:false})}>
                Annuler
              </button>
            </form>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <PWAInstallBanner />
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 20 }}>
          Accès réservé au personnel autorisé
        </p>
      </div>
    </div>
  );
}
