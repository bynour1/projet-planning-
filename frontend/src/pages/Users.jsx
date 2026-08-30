import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';

function UserModal({ user: editUser, onSave, onClose }) {
  const [form, setForm] = useState(editUser || { nom: '', prenom: '', email: '', role: 'medecin', telephone: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const isEdit = !!editUser?.id;

  async function handleSave() {
    if (!form.nom || !form.prenom || !form.email || !form.role) return;
    setSaving(true);
    try {
      if (isEdit) {
        await axios.put(`/api/users/${editUser.id}`, form);
        onSave(null);
      } else {
        const res = await axios.post('/api/users', form);
        onSave(res.data);
      }
    } catch (err) { alert(err.response?.data?.message || 'Erreur'); }
    finally { setSaving(false); }
  }

  const roleConfig = {
    medecin:        { icon: '👨‍⚕️', label: 'Médecin',        color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' },
    technicien:     { icon: '🔧', label: 'Technicien',     color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' },
    administrateur: { icon: '🛡️', label: 'Administrateur', color: '#0ea5e9', bg: '#f0f9ff', border: '#bae6fd' },
    chauffeur:      { icon: '🚗', label: 'Chauffeur',      color: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
  };
  const rc = roleConfig[form.role] || roleConfig.medecin;
  const initials = `${(form.prenom?.[0]||'').toUpperCase()}${(form.nom?.[0]||'').toUpperCase()}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

        {/* ── Header coloré avec avatar ── */}
        <div style={{
          background: `linear-gradient(135deg, ${rc.color}22, ${rc.color}08)`,
          borderBottom: `1px solid ${rc.border}`,
          padding: '20px 24px 16px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          {/* Avatar dynamique */}
          <div style={{
            width: 54, height: 54, borderRadius: '50%',
            background: rc.bg, border: `2px solid ${rc.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: initials ? 18 : 24, fontWeight: 800, color: rc.color,
            flexShrink: 0, transition: 'all .2s',
          }}>
            {initials || rc.icon}
          </div>

          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>
              {isEdit ? 'Modifier l\'utilisateur' : 'Créer un utilisateur'}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
              {isEdit
                ? `Modification de ${editUser.prenom} ${editUser.nom}`
                : 'Remplissez les informations du nouveau membre'}
            </p>
          </div>

          <button
            style={{
              width: 30, height: 30, border: 'none', borderRadius: 8,
              background: 'var(--bg)', cursor: 'pointer', fontSize: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-2)', transition: 'background .15s',
            }}
            onClick={onClose}
            onMouseEnter={e => e.currentTarget.style.background='var(--border)'}
            onMouseLeave={e => e.currentTarget.style.background='var(--bg)'}
          >✕</button>
        </div>

        {/* ── Corps ── */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Info email */}
          {!isEdit && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 14px',
              background: 'linear-gradient(135deg,#e0f2fe,#f0fdf4)',
              border: '1px solid #bae6fd', borderRadius: 10,
            }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>📧</span>
              <span style={{ fontSize: 12.5, color: '#0369a1', lineHeight: 1.5 }}>
                Un <strong>e-mail officiel GMT Ariana</strong> avec identifiant, mot de passe initial et code d'activation sera automatiquement expédié.
              </span>
            </div>
          )}

          {/* Prénom + Nom */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'block' }}>
                Prénom <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                className="input"
                placeholder="ex: Sophie"
                value={form.prenom}
                onChange={e => set('prenom', e.target.value)}
                style={{ height: 40 }}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'block' }}>
                Nom <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                className="input"
                placeholder="ex: Benali"
                value={form.nom}
                onChange={e => set('nom', e.target.value)}
                style={{ height: 40 }}
              />
            </div>
          </div>

          {/* Email */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'block' }}>
              Adresse email <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15 }}>✉️</span>
              <input
                className="input"
                type="email"
                placeholder="exemple@gmail.com"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                style={{ paddingLeft: 36, height: 40 }}
              />
            </div>
          </div>

          {/* Téléphone */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'block' }}>
              Numéro de téléphone
            </label>
            <div style={{ position: 'relative', display: 'flex', gap: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '0 10px', height: 40, borderRadius: '8px 0 0 8px',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRight: 'none', fontSize: 13, fontWeight: 700,
                color: 'var(--text-2)', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                🇹🇳 +216
              </div>
              <input
                className="input"
                type="tel"
                placeholder="XX XXX XXX"
                value={(form.telephone || '').replace(/^\+216\s?/, '')}
                onChange={e => {
                  const raw = e.target.value.replace(/[^\d]/g, '').slice(0, 8);
                  const fmt = raw.replace(/(\d{2})(\d{3})?(\d{3})?/, (_, a, b, c) =>
                    [a, b, c].filter(Boolean).join(' ')
                  );
                  set('telephone', raw ? `+216 ${fmt}` : '');
                }}
                style={{
                  height: 40, borderRadius: '0 8px 8px 0',
                  borderLeft: '1px solid var(--border)', flex: 1,
                }}
              />
            </div>
            {form.telephone && !/^\+216 \d{2} \d{3} \d{3}$/.test(form.telephone) && form.telephone.replace(/[^\d]/g,'').length >= 8 && (
              <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>⚠️ Format attendu : +216 XX XXX XXX</div>
            )}
          </div>

          {/* Rôle — boutons visuels */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'block' }}>
              Rôle <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(roleConfig).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('role', key)}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${form.role === key ? cfg.color : 'var(--border)'}`,
                    background: form.role === key ? cfg.bg : 'var(--surface)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    transition: 'all .15s', outline: 'none',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{cfg.icon}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: form.role === key ? cfg.color : 'var(--text-2)',
                  }}>{cfg.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Statut (modification uniquement) */}
          {isEdit && (
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'block' }}>
                Statut du compte
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['1','✅  Actif','#10b981','#f0fdf4'],['0','⛔  Inactif','#ef4444','#fef2f2']].map(([v,l,c,bg]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set('is_active', v === '1')}
                    style={{
                      flex: 1, padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                      border: `2px solid ${(form.is_active ? '1' : '0') === v ? c : 'var(--border)'}`,
                      background: (form.is_active ? '1' : '0') === v ? bg : 'var(--surface)',
                      fontSize: 13, fontWeight: 600,
                      color: (form.is_active ? '1' : '0') === v ? c : 'var(--text-2)',
                      transition: 'all .15s', outline: 'none',
                    }}
                  >{l}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '14px 24px', borderTop: '1px solid var(--border)',
          background: 'var(--bg)',
        }}>
          <button className="btn btn-outline" onClick={onClose} style={{ minWidth: 90 }}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !form.nom || !form.prenom || !form.email}
            style={{ minWidth: 140 }}
          >
            {saving
              ? <><span className="spinner" style={{ width: 15, height: 15 }}/> Enregistrement…</>
              : <>{isEdit ? '💾 Mettre à jour' : '✅ Créer le compte'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function OtpVerifyModal({ otpData, onClose, onVerified, toast }) {
  const email = typeof otpData === 'string' ? otpData : otpData?.email;
  const [tempPass, setTempPass] = useState(typeof otpData === 'object' ? otpData?.tempPassword : null);
  const [currentOtp, setCurrentOtp] = useState(typeof otpData === 'object' ? otpData?.otp : null);
  const [code, setCode] = useState(typeof otpData === 'object' && otpData?.otp ? otpData.otp : '');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');

  async function handleVerify() {
    if (!code || code.length < 6) { setError('Entrez le code à 6 chiffres'); return; }
    setVerifying(true); setError('');
    try {
      const res = await axios.post('/api/users/verify-otp', { email, code });
      toast(res.data?.message || 'Compte activé !', 'success');
      onVerified();
    } catch (err) {
      setError(err.response?.data?.message || 'Code invalide ou expiré');
    } finally { setVerifying(false); }
  }

  async function handleResendOtp() {
    setResending(true); setError('');
    try {
      const res = await axios.post('/api/users/resend-otp', { email });
      if (res.data?.otp) {
        setCurrentOtp(res.data.otp);
        setCode(res.data.otp);
      }
      toast(res.data?.message || 'Nouveau code envoyé par e-mail', 'success');
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'envoi');
    } finally { setResending(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ background: 'linear-gradient(135deg,#e0f2fe,#f0fdf4)', borderBottom: '1px solid #bae6fd', padding: '20px 24px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>Activation & Identifiants du compte</h3>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>{email}</p>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tempPass && (
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                🔑 Mot de passe provisoire d'accès :
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <code style={{ fontSize: 15, fontWeight: 800, color: '#0284c7', letterSpacing: 1 }}>{tempPass}</code>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(tempPass);
                    toast('Mot de passe copié !', 'info');
                  }}
                  style={{ fontSize: 11, padding: '3px 10px', height: 28 }}
                >
                  📋 Copier
                </button>
              </div>
              <p style={{ fontSize: 11, color: '#64748b', margin: '6px 0 0', lineHeight: 1.4 }}>
                Transmettez ce mot de passe temporaire à l'utilisateur s'il ne reçoit pas l'e-mail.
              </p>
            </div>
          )}

          <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 12, color: '#166534', lineHeight: 1.5 }}>
            📧 Un e-mail d'activation a été envoyé. Saisissez ou validez le code à 6 chiffres ci-dessous pour activer le compte.
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
                Code de confirmation OTP
              </label>
              {currentOtp && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(currentOtp);
                    toast('Code OTP copié !', 'info');
                  }}
                  style={{ fontSize: 11, padding: '1px 6px', height: 22, color: '#0284c7' }}
                >
                  📋 Copier OTP ({currentOtp})
                </button>
              )}
            </div>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="• • • • • •"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              style={{ height: 48, fontSize: 24, fontWeight: 800, letterSpacing: 10, textAlign: 'center' }}
              autoFocus
            />
          </div>

          {error && <div style={{ fontSize: 13, color: '#ef4444', textAlign: 'center', fontWeight: 600 }}>⚠️ {error}</div>}

          <button className="btn btn-primary" onClick={handleVerify} disabled={verifying || code.length < 6} style={{ width: '100%', height: 42, fontSize: 14 }}>
            {verifying ? <><span className="spinner" style={{ width: 15, height: 15 }}/> Vérification…</> : '✅ Activer le compte'}
          </button>
          <button className="btn btn-ghost" onClick={handleResendOtp} disabled={resending} style={{ width: '100%', fontSize: 12 }}>
            {resending ? 'Envoi…' : '🔄 Renvoyer un nouveau code OTP'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Users({ toast }) {
  const { user: me } = useAuth();
  const [users,   setUsers]   = useState([]);
  const [modal,   setModal]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');
  const [otpModal, setOtpModal] = useState(null); // { email, tempPassword, otp }

  async function load() {
    try { const { data } = await axios.get('/api/users'); setUsers(data); }
    catch { toast('Erreur chargement', 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreated(data) {
    setModal(null);
    await load();
    toast(data?.message || 'Compte créé ! E-mail d\'accès envoyé.', 'success');
    if (data?.email) {
      setOtpModal({ email: data.email, tempPassword: data.tempPassword, otp: data.otp });
    }
  }

  async function handleResendEmail(u) {
    try {
      const res = await axios.post(`/api/users/${u.id}/resend-welcome`);
      toast(res.data?.message || `E-mail d'accès renvoyé à ${u.email}`, 'success');
      setOtpModal({ email: u.email, tempPassword: res.data?.tempPassword, otp: res.data?.otp });
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors du renvoi', 'error');
    }
  }

  async function handleDelete(id) {
    try { await axios.delete(`/api/users/${id}`); setConfirm(null); load(); toast('Supprimé', 'success'); }
    catch (err) { toast(err.response?.data?.message || 'Erreur', 'error'); }
  }

  function roleBadge(role) {
    const map = {
      administrateur: ['badge-blue',   'Admin'],
      medecin:        ['badge-green',  'Médecin'],
      technicien:     ['badge-yellow', 'Tech.'],
      chauffeur:      ['badge-orange', 'Chauffeur'],
    };
    const [cls, label] = map[role] || ['badge-blue', role];
    return <span className={`badge ${cls}`}>{label}</span>;
  }

  const filtered = users.filter(u => {
    const matchSearch = (`${u.nom} ${u.prenom} ${u.email}`).toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || u.role === filter;
    return matchSearch && matchFilter;
  });

  const stats = {
    total:        users.length,
    actifs:       users.filter(u => u.is_active).length,
    medecins:     users.filter(u => u.role === 'medecin').length,
    techniciens:  users.filter(u => u.role === 'technicien').length,
    chauffeurs:   users.filter(u => u.role === 'chauffeur').length,
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h2>👥 Utilisateurs</h2>
          <p>Gérer les membres de l'équipe</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({})}>+ Créer un utilisateur</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total',       value: stats.total,       color: '#0ea5e9' },
          { label: 'Actifs',      value: stats.actifs,      color: '#10b981' },
          { label: 'Médecins',    value: stats.medecins,    color: '#10b981' },
          { label: 'Techniciens', value: stats.techniciens, color: '#8b5cf6' },
          { label: 'Chauffeurs',  value: stats.chauffeurs,  color: '#f97316' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</span>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="🔍 Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 8, padding: 3, overflowX: 'auto' }}>
          {[['all','Tous'],['medecin','Médecins'],['technicien','Techniciens'],['administrateur','Admins'],['chauffeur','Chauffeurs']].map(([v,l]) => (
            <button key={v} className={`btn btn-sm ${filter === v ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(v)} style={{ padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">👥</div><p>Aucun utilisateur trouvé</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nom</th><th>Email</th><th>Téléphone</th><th>Rôle</th><th>Statut</th><th>Créé le</th><th>Actions</th>
              </tr>

            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      <span>{u.prenom}</span>{' '}
                      <span>{u.nom}</span>
                    </div>
                    {u.id === me?.id && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Vous</span>}
                  </td>
                  <td style={{ fontSize: 13 }}>{u.email}</td>
                  <td style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    {u.telephone
                      ? <span>📞 {u.telephone}</span>
                      : <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td>{roleBadge(u.role)}</td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>
                      {u.is_active ? '● Actif' : '○ Inactif'}
                    </span>
                    {!u.is_active && (
                      <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4, fontSize: 11, color: '#0284c7', fontWeight: 700 }}
                        onClick={() => setOtpModal({ email: u.email })}>🔐 Vérifier</button>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {new Date(u.created_at).toLocaleDateString('fr')}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-outline btn-sm" title="Renvoyer l'e-mail avec nouveaux identifiants" onClick={() => handleResendEmail(u)}>
                        ✉️
                      </button>
                      <button className="btn btn-outline btn-sm" title="Modifier" onClick={() => setModal(u)}>
                        ✏️
                      </button>
                      {u.id !== me?.id && (
                        <button className="btn btn-danger btn-sm" title="Supprimer" onClick={() => setConfirm(u.id)}>
                          🗑
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <UserModal user={modal?.id ? modal : null} onSave={modal?.id ? () => { setModal(null); load(); toast('Mis à jour', 'success'); } : handleCreated} onClose={() => setModal(null)} />
      )}
      {otpModal && (
        <OtpVerifyModal otpData={otpModal} toast={toast} onClose={() => setOtpModal(null)} onVerified={() => { setOtpModal(null); load(); }} />
      )}
      {confirm && (
        <ConfirmDialog title="Supprimer l'utilisateur ?" message="Cette action est irréversible." danger
          onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
