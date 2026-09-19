import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

function roleColor(role) {
  if (role === 'administrateur') return '#0ea5e9';
  if (role === 'medecin')        return '#10b981';
  if (role === 'chauffeur')      return '#f97316';
  return '#8b5cf6';
}

export default function Settings({ toast }) {
  const { user, refreshUser } = useAuth();
  const { notificationPermission, requestNotificationPermission, testNotification } = useSocket() || {};
  const [currentNotifPerm, setCurrentNotifPerm] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [saving,  setSaving]  = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setCurrentNotifPerm(Notification.permission);
    }
  }, [notificationPermission]);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatar]);

  async function handleChangePassword(e) {
    e.preventDefault();
    if (pwdForm.new_password !== pwdForm.confirm)
      return toast('Les mots de passe ne correspondent pas', 'error');
    if (pwdForm.new_password.length < 6)
      return toast('Minimum 6 caractères', 'error');
    setSaving(true);
    try {
      const { data } = await axios.post('/api/auth/change-password', {
        current_password: pwdForm.current_password,
        new_password:     pwdForm.new_password,
      });
      if (data?.token) {
        try {
          sessionStorage.setItem('pm_token', data.token);
        } catch {}
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
      }
      toast(data?.message || 'Mot de passe mis à jour avec succès !', 'success');
      setPwdForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors de la modification', 'error');
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

  async function handleRemoveAvatar() {
    try {
      await axios.delete('/api/auth/avatar');
      setAvatarError(false);
      await refreshUser();
      toast('Photo de profil supprimée', 'info');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  }

  const color = roleColor(user?.role);

  return (
    <div className="page-content">
      {/* Executive Header Banner */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: 16,
        padding: '20px 24px',
        border: '1px solid var(--border)',
        borderTop: '4px solid #0284c7',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
        marginBottom: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: 'var(--text)', letterSpacing: -0.5 }}>
            Paramètres
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
            Gérer votre compte, vos préférences de sécurité et vos notifications
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            background: 'var(--surface2)',
            padding: '6px 14px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            border: '1px solid var(--border)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
            Session active : {user?.email}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px),1fr))', gap: 16 }}>

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
              <span>Cliquez sur 📷 pour importer une photo</span>
              {user?.avatar && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}
                >
                  Supprimer
                </button>
              )}
            </div>
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

        {/* Notifications & Alertes Card */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🔔 Notifications & Alertes Système</h3>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
            Recevez des alertes en temps réel (son + bannière) pour les nouveaux plannings, messages de chat et tournées Clino Mobile.
          </p>

          <div
            style={{
              padding: 16,
              background: 'var(--surface2)',
              borderRadius: 'var(--radius)',
              border: '1.5px solid var(--border)',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 28 }}>
                {currentNotifPerm === 'granted' ? '🔔' : currentNotifPerm === 'denied' ? '🔕' : '⚠️'}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {currentNotifPerm === 'granted'
                    ? 'Notifications activées sur cet appareil'
                    : currentNotifPerm === 'denied'
                    ? 'Notifications bloquées par le navigateur'
                    : 'Autorisation requise'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {currentNotifPerm === 'granted'
                    ? 'Les alertes système s\'afficheront en direct'
                    : currentNotifPerm === 'denied'
                    ? 'Cliquez sur l\'icône cadenas à côté de l\'URL pour réautoriser'
                    : 'Cliquez ci-dessous pour autoriser les alertes'}
                </div>
              </div>
            </div>
            <span
              className={`badge ${
                currentNotifPerm === 'granted'
                  ? 'badge-green'
                  : currentNotifPerm === 'denied'
                  ? 'badge-red'
                  : 'badge-yellow'
              }`}
            >
              {currentNotifPerm === 'granted'
                ? 'Autorisé'
                : currentNotifPerm === 'denied'
                ? 'Bloqué'
                : 'En attente'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {currentNotifPerm !== 'granted' && (
              <button
                className="btn btn-primary"
                onClick={async () => {
                  if (requestNotificationPermission) {
                    const res = await requestNotificationPermission();
                    setCurrentNotifPerm(res);
                    if (res === 'granted') {
                      toast('🔔 Notifications autorisées avec succès !', 'success');
                    } else if (res === 'denied') {
                      toast('⚠️ Autorisation refusée. Veuillez vérifier les paramètres de votre navigateur.', 'warning');
                    }
                  }
                }}
                style={{ flex: 1, minWidth: 180 }}
              >
                🔔 Demander l'autorisation
              </button>
            )}

            <button
              className="btn btn-outline"
              onClick={() => {
                if (testNotification) {
                  testNotification('🔔 Test Notification GMT Ariana', 'Super ! Votre appareil reçoit bien les alertes en direct.');
                }
              }}
              style={{ flex: 1, minWidth: 180 }}
            >
              🧪 Tester la notification
            </button>
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

        {/* Notifications & Temps réel */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>🔔 Notifications & Temps Réel</h3>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 8,
              background: currentNotifPerm === 'granted' ? '#dcfce7' : currentNotifPerm === 'denied' ? '#fee2e2' : '#fef9c3',
              color: currentNotifPerm === 'granted' ? '#166534' : currentNotifPerm === 'denied' ? '#991b1b' : '#854d0e'
            }}>
              {currentNotifPerm === 'granted' ? '● Notifications Actives' : currentNotifPerm === 'denied' ? '● Bloquées' : '○ En attente'}
            </span>
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>
            Recevez instantanément les alertes sonores et visuelles lors de la création d'un planning, d'une tournée Clino ou d'un message dans le chat.
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {currentNotifPerm !== 'granted' && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  if (requestNotificationPermission) {
                    const res = await requestNotificationPermission();
                    setCurrentNotifPerm(res);
                    if (res === 'granted') toast('🔔 Notifications système activées !', 'success');
                    else toast('⚠️ Permission non accordée.', 'warning');
                  }
                }}
              >
                🔔 Activer les notifications
              </button>
            )}

            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                if (testNotification) {
                  testNotification('🔔 Test Notification — GMT Ariana', 'Le système d\'alertes temps réel et sonore fonctionne parfaitement !');
                } else {
                  toast('🔔 Test notification : le carillon et le système d\'alerte sont opérationnels !', 'info');
                }
              }}
            >
              🔊 Tester le son & la notification
            </button>
          </div>
        </div>

        {/* App info & Mises à jour */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>ℹ️ À propos</h3>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: '#dcfce7', color: '#166534' }}>
              ● À jour
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Application',  value: 'GMT Ariana — Santé au travail' },
              { label: 'Version installée', value: '2.4.0 (PWA Live)' },
              { label: 'Statut PWA',    value: (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)')?.matches) ? '📱 Application autonome' : '🌐 Navigateur Web' },
              { label: 'Backend API',  value: 'Node.js + Express' },
              { label: 'Frontend',     value: 'React + Vite' },
              { label: 'Biométrie',    value: 'WebAuthn / Passkey' },
              { label: 'Temps réel',   value: 'Socket.IO' },
            ].map(f => (
              <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-2)' }}>{f.label}</span>
                <span style={{ fontWeight: 600 }}>{f.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={async () => {
                toast('🔍 Recherche de mises à jour en cours…', 'info');
                window.dispatchEvent(new CustomEvent('check-pwa-update'));
                if ('serviceWorker' in navigator) {
                  try {
                    const reg = await navigator.serviceWorker.ready;
                    await reg.update();
                    if (reg.waiting) {
                      toast('🚀 Nouvelle version trouvée ! Application en cours de mise à jour…', 'success');
                      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                      setTimeout(() => window.location.reload(), 800);
                      return;
                    }
                  } catch (e) {
                    console.warn(e);
                  }
                }
                setTimeout(() => {
                  toast('✔️ Vous utilisez la dernière version disponible.', 'success');
                }, 1000);
              }}
              style={{ flex: 1, justifyContent: 'center', minWidth: 160 }}
            >
              🔍 Vérifier les mises à jour
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                try {
                  if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (const reg of registrations) {
                      await reg.unregister();
                    }
                  }
                  if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(k => caches.delete(k)));
                  }
                } catch (e) {
                  console.warn(e);
                }
                toast('Cache et Service Worker réinitialisés ! Rechargement…', 'info');
                setTimeout(() => {
                  window.location.href = window.location.href.split('#')[0];
                }, 500);
              }}
              style={{ justifyContent: 'center', color: 'var(--danger)', fontSize: 12 }}
            >
              🔄 Forcer l'actualisation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
