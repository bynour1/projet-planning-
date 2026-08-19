import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

function roleColor(role) {
  if (role === 'administrateur') return '#0ea5e9';
  if (role === 'medecin')        return '#10b981';
  return '#8b5cf6';
}

export default function Settings({ toast }) {
  const { user, refreshUser } = useAuth();
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [saving,  setSaving]  = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);

  async function handleChangePassword(e) {
    e.preventDefault();
    if (pwdForm.new_password !== pwdForm.confirm)
      return toast('Les mots de passe ne correspondent pas', 'error');
    if (pwdForm.new_password.length < 6)
      return toast('Minimum 6 caractères', 'error');
    setSaving(true);
    try {
      await axios.post('/api/auth/change-password', {
        current_password: pwdForm.current_password,
        new_password:     pwdForm.new_password,
      });
      toast('Mot de passe mis à jour !', 'success');
      setPwdForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegisterBiometric() {
    if (!window.PublicKeyCredential) {
      return toast("Votre navigateur ou appareil ne supporte pas l'authentification biométrique (WebAuthn)", "error");
    }
    setBioLoading(true);
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const userId = new Uint8Array(16);
      window.crypto.getRandomValues(userId);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "GMT Ariana", id: window.location.hostname },
          user: {
            id: userId,
            name: user.email,
            displayName: `${user.prenom} ${user.nom}`,
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" }
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "preferred"
          },
          timeout: 60000,
        }
      });

      const rawId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      await axios.post('/api/auth/biometric/register', {
        credentialId: rawId,
        credentialName: 'Appareil ' + (navigator.userAgentData?.platform || navigator.platform || 'Local')
      });
      localStorage.setItem('gmt_bio_id', rawId);
      localStorage.setItem('gmt_bio_email', user.email);
      await refreshUser();
      toast('Empreinte / Face ID activée avec succès sur cet appareil !', 'success');
    } catch (err) {
      console.warn(err);
      toast(err.name === 'NotAllowedError' ? 'Opération annulée par l\'utilisateur' : (err.message || 'Erreur biométrique'), 'error');
    } finally {
      setBioLoading(false);
    }
  }

  async function handleRemoveBiometric() {
    try {
      await axios.delete('/api/auth/biometric');
      localStorage.removeItem('gmt_bio_id');
      localStorage.removeItem('gmt_bio_email');
      await refreshUser();
      toast('Authentification biométrique désactivée', 'info');
    } catch {
      toast('Erreur lors de la désactivation', 'error');
    }
  }

  const color = roleColor(user?.role);

  return (
    <div className="page-content">
      <div className="page-header">
        <div><h2>⚙️ Paramètres</h2><p>Gérer votre compte et la sécurité</p></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px,1fr))', gap: 20 }}>

        {/* Profile card */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>👤 Profil</h3>
          {/* Avatar upload */}
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,marginBottom:16}}>
            <div style={{position:'relative'}}>
              {user?.avatar && !avatarError ? (
                <img
                  src={user.avatar}
                  alt="Avatar"
                  style={{width:80,height:80,borderRadius:'50%',objectFit:'cover',border:'3px solid var(--border)',boxShadow:'var(--shadow-md)'}}
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div style={{width:80,height:80,borderRadius:'50%',background:color+'22',color,fontSize:28,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',border:'3px solid var(--border)',boxShadow:'var(--shadow-md)'}}>
                  {(user?.prenom?.[0]||'').toUpperCase()}{(user?.nom?.[0]||'').toUpperCase()}
                </div>
              )}
              <label style={{position:'absolute',bottom:0,right:0,background:'var(--primary)',color:'#fff',borderRadius:'50%',width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:14,boxShadow:'0 2px 6px rgba(0,0,0,.2)'}} title="Changer la photo">
                📷
                <input type="file" accept="image/*" style={{display:'none'}} onChange={async(e)=>{
                  const file = e.target.files[0]; if(!file) return;
                  const formData = new FormData(); formData.append('avatar',file);
                  try {
                    await axios.post('/api/auth/avatar', formData, {headers:{'Content-Type':'multipart/form-data'}});
                    setAvatarError(false);
                    await refreshUser();
                    toast('Photo de profil mise à jour avec succès !','success');
                  } catch (uploadErr) {
                    toast(uploadErr.response?.data?.message || 'Erreur upload','error');
                  }
                }} />
              </label>
            </div>
            <div style={{fontSize:12,color:'var(--text-3)'}}>Cliquez sur 📷 pour importer une photo</div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                <span>{user?.prenom}</span>{' '}
                <span>{user?.nom}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {`Email: ${user?.email}`}
              </div>
              <span style={{
                display: 'inline-block', marginTop: 4, fontSize: 11, padding: '2px 8px',
                borderRadius: 20, background: color + '22', color, fontWeight: 700,
                textTransform: 'capitalize',
              }}>Compte {user?.role}</span>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Nom complet', value: `${user?.prenom} ${user?.nom}` },
              { label: 'Email',       value: user?.email },
              { label: 'Rôle',        value: user?.role, capitalize: true },
            ].map(f => (
              <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>{f.label}</span>
                <span style={{ fontWeight: 500, textTransform: f.capitalize ? 'capitalize' : 'none' }}>{f.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Biometrics Card (Face ID / Empreinte / Windows Hello) */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>👆 Connexion Biométrique (Empreinte / Face ID)</h3>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
            Connectez-vous instantanément sur cet appareil en utilisant votre empreinte digitale, Touch ID, Face ID ou Windows Hello.
          </p>

          <div style={{
            padding: 16, background: 'var(--surface2)', borderRadius: 'var(--radius)',
            border: '1.5px solid var(--border)', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 28 }}>{user?.has_biometric ? '🛡️' : '🔒'}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {user?.has_biometric ? 'Biométrie active sur ce compte' : 'Biométrie non configurée'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {user?.has_biometric ? 'Prêt pour connexion par empreinte / Face ID' : 'Associez ce terminal en 1 clic'}
                </div>
              </div>
            </div>
            <span className={`badge ${user?.has_biometric ? 'badge-green' : 'badge-yellow'}`}>
              {user?.has_biometric ? 'Actif' : 'Inactif'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={handleRegisterBiometric}
              disabled={bioLoading}
              style={{ flex: 1 }}
            >
              {bioLoading ? 'Vérification en cours...' : '👆 ' + (user?.has_biometric ? 'Mettre à jour cet appareil' : 'Activer Empreinte / Face ID')}
            </button>
            {user?.has_biometric && (
              <button
                className="btn btn-danger btn-sm"
                onClick={handleRemoveBiometric}
                title="Supprimer la clé biométrique"
              >
                Désactiver
              </button>
            )}
          </div>
        </div>

        {/* Change password */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>🔒 Changer le mot de passe</h3>
          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label>Mot de passe actuel</label>
              <input className="input" type="password" placeholder="••••••••"
                value={pwdForm.current_password}
                onChange={e => setPwdForm(p => ({ ...p, current_password: e.target.value }))}
                required />
            </div>
            <div className="form-group">
              <label>Nouveau mot de passe</label>
              <input className="input" type="password" placeholder="Min. 6 caractères"
                value={pwdForm.new_password}
                onChange={e => setPwdForm(p => ({ ...p, new_password: e.target.value }))}
                required />
            </div>
            <div className="form-group">
              <label>Confirmer</label>
              <input className="input" type="password" placeholder="Min. 6 caractères"
                value={pwdForm.confirm}
                onChange={e => setPwdForm(p => ({ ...p, confirm: e.target.value }))}
                required />
            </div>

            {/* Strength indicator */}
            {pwdForm.new_password && (
              <div>
                <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: pwdForm.new_password.length >= i * 2
                        ? i <= 1 ? '#ef4444' : i <= 2 ? '#f59e0b' : i <= 3 ? '#22c55e' : '#10b981'
                        : 'var(--border)',
                      transition: 'background .2s',
                    }} />
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  Force : {pwdForm.new_password.length < 4 ? 'Faible' : pwdForm.new_password.length < 6 ? 'Moyen' : pwdForm.new_password.length < 8 ? 'Bon' : 'Fort'}
                </div>
              </div>
            )}

            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '🔑 Mettre à jour'}
            </button>
          </form>
        </div>

        {/* 2FA for admin */}
        {user?.role === 'administrateur' && (
          <div className="card">
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:16}}>🔐 Double authentification (2FA)</h3>
            <p style={{fontSize:13,color:'var(--text-2)',marginBottom:16}}>Activez la 2FA pour recevoir un code de vérification par email ET SMS à chaque connexion.</p>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:14,fontWeight:600}}>{user?.totp_enabled ? '✅ Activée' : '❌ Désactivée'}</span>
              <button className={`btn ${user?.totp_enabled ? 'btn-danger' : 'btn-primary'} btn-sm`}
                onClick={async()=>{
                  try {
                    const {data} = await axios.post('/api/auth/toggle-2fa',{enabled:!user?.totp_enabled});
                    await refreshUser();
                    toast(`2FA ${data.totp_enabled?'activée':'désactivée'}`,'success');
                  } catch { toast('Erreur','error'); }
                }}>
                {user?.totp_enabled ? 'Désactiver' : 'Activer la 2FA'}
              </button>
            </div>
          </div>
        )}

        {/* App info */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>ℹ️ À propos</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Application',  value: 'GMT Ariana' },
              { label: 'Version',      value: '2.0.0' },
              { label: 'Backend',      value: 'Node.js + Express' },
              { label: 'Frontend',     value: 'React + Vite' },
              { label: 'Base de données', value: 'MySQL (XAMPP)' },
              { label: 'Biométrie',    value: 'WebAuthn / Passkey' },
              { label: 'Temps réel',   value: 'Socket.IO' },
            ].map(f => (
              <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-2)' }}>{f.label}</span>
                <span style={{ fontWeight: 500 }}>{f.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
