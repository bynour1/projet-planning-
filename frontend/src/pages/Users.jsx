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
          </div>

          {/* Mot de passe initial (création uniquement) */}
          {!isEdit && (
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'block' }}>
                Mot de passe initial (optionnel)
              </label>
              <input
                className="input"
                type="text"
                placeholder="Laisser vide pour générer automatiquement (ex: Med@4827)"
                value={form.password || ''}
                onChange={e => set('password', e.target.value)}
                style={{ height: 40 }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                💡 Si vide, un mot de passe sécurisé sera généré et affiché à l'écran pour l'envoyer sur WhatsApp.
              </div>
            </div>
          )}

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

function CredentialsModal({ data, onClose, toast }) {
  const [copied, setCopied] = useState(false);
  if (!data) return null;

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://projet-planning-pi.vercel.app';
  const fullName = `${data.prenom || ''} ${data.nom || ''}`.trim() || 'Collaborateur';
  const phoneRaw = (data.telephone || '').replace(/[^\d+]/g, '');
  let waPhone = phoneRaw;
  if (!waPhone.startsWith('+')) {
    waPhone = waPhone.replace(/^0+/, '');
    if (waPhone.length === 8) waPhone = '216' + waPhone;
  } else {
    waPhone = waPhone.replace(/^\+/, '');
  }

  const shareText = `🏥 *GMT Ariana — Planning Médical*\n\nBonjour *${fullName}*,\nVotre compte d'accès a été créé avec succès.\n\n🔗 *Lien de connexion :* ${appUrl}/login\n📧 *Identifiant :* ${data.email}\n🔑 *Mot de passe initial :* ${data.tempPassword}\n🔒 *Code confirmation (OTP) :* ${data.otp || 'Non requis'}\n\n⚠️ _Lors de votre première connexion, il vous sera demandé de modifier votre mot de passe._`;

  function copyText() {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast && toast('Informations copiées dans le presse-papier !', 'success');
  }

  function openWhatsApp() {
    const url = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(shareText)}`
      : `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 490, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{
          background: 'linear-gradient(135deg, #0284c7, #0ea5e9)',
          padding: '20px 24px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>🔑</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Accès Compte & Partage WhatsApp</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.9 }}>Transmission directe à l'utilisateur</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Status banner */}
          <div style={{
            padding: '10px 14px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.4,
            background: data.email_sent ? '#f0fdf4' : '#fffbeb',
            border: `1px solid ${data.email_sent ? '#bbf7d0' : '#fde68a'}`,
            color: data.email_sent ? '#166534' : '#92400e',
            display: 'flex', alignItems: 'flex-start', gap: 8
          }}>
            <span style={{ fontSize: 16 }}>{data.email_sent ? '✅' : '⚠️'}</span>
            <span>
              {data.email_sent
                ? `E-mail envoyé avec succès à ${data.email}`
                : `E-mail automatique non expédié (${data.email_error || 'Configuration SMTP non active'}). Transmettez directement les accès ci-dessous via WhatsApp.`}
            </span>
          </div>

          {/* Credentials box */}
          <div style={{ background: 'var(--surface2)', padding: 16, borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13 }}><strong>Collaborateur :</strong> {fullName} {data.role ? `(${data.role})` : ''}</div>
            <div style={{ fontSize: 13 }}><strong>Email (Identifiant) :</strong> <code style={{ color: 'var(--primary)', fontWeight: 700 }}>{data.email}</code></div>
            <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div><strong>Mot de passe initial :</strong> <code style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: 4, fontWeight: 800, fontSize: 14 }}>{data.tempPassword}</code></div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  navigator.clipboard.writeText(data.tempPassword);
                  toast && toast('Mot de passe copié', 'success');
                }}
              >
                Copier 📋
              </button>
            </div>
            {data.otp && (
              <div style={{ fontSize: 13 }}><strong>Code OTP :</strong> <code style={{ letterSpacing: 2, fontWeight: 700 }}>{data.otp}</code></div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <button
              onClick={openWhatsApp}
              style={{
                width: '100%', padding: '12px 16px', background: '#25D366', color: '#fff',
                border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 2px 8px rgba(37,211,102,.3)'
              }}
            >
              <span style={{ fontSize: 20 }}>💬</span> Envoyer les accès sur WhatsApp (Gratuit)
            </button>

            <button
              onClick={copyText}
              className="btn btn-outline"
              style={{ width: '100%', padding: '10px 16px', justifyContent: 'center', fontWeight: 700 }}
            >
              {copied ? '✅ Message copié dans le presse-papier !' : '📋 Copier le message d\'accès'}
            </button>
          </div>
        </div>

        <div style={{ padding: '12px 24px', background: 'var(--bg)', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
          <button className="btn btn-outline" onClick={onClose}>Fermer</button>
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
  const [credentialsModal, setCredentialsModal] = useState(null);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');

  async function load() {
    try { const { data } = await axios.get('/api/users'); setUsers(data); }
    catch { toast('Erreur chargement', 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreated(data) {
    setModal(null);
    await load();
    if (data?.tempPassword) {
      setCredentialsModal(data);
    } else {
      toast(data?.message || 'Compte créé avec succès !', 'success');
    }
  }

  async function handleResendEmail(u) {
    try {
      const res = await axios.post(`/api/users/${u.id}/resend-welcome`);
      await load();
      if (res.data?.tempPassword) {
        setCredentialsModal(res.data);
      } else {
        toast(res.data?.message || `E-mail d'accès renvoyé à ${u.email}`, 'success');
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors du renvoi', 'error');
    }
  }

  async function handleResetPassword(u) {
    const custom = window.prompt(`Définir un nouveau mot de passe pour ${u.prenom} ${u.nom} (minimum 6 caractères) :\n\nLaissez vide pour générer automatiquement un mot de passe aléatoire :`);
    if (custom === null) return;
    try {
      const res = await axios.post(`/api/users/${u.id}/reset-password`, { password: custom || undefined });
      await load();
      setCredentialsModal(res.data);
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur réinitialisation', 'error');
    }
  }

  function openWhatsAppForUser(u) {
    const fullName = `${u.prenom || ''} ${u.nom || ''}`.trim() || 'Collaborateur';
    const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://projet-planning-pi.vercel.app';
    let phone = (u.telephone || '').replace(/[^\d+]/g, '');
    if (!phone.startsWith('+')) {
      phone = phone.replace(/^0+/, '');
      if (phone.length === 8) phone = '216' + phone;
    } else {
      phone = phone.replace(/^\+/, '');
    }
    const msg = `🏥 *GMT Ariana — Planning Médical*\n\nBonjour *${fullName}*,\nVoici le lien d'accès à votre espace Planning GMT Ariana :\n🔗 *Lien :* ${appUrl}/login\n📧 *Identifiant :* ${u.email}\n\nSi vous avez besoin d'aide ou de réinitialiser votre mot de passe, contactez l'administration.`;
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
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
    <div className="page-content" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* ── BANNIÈRE EXECUTIVE HEADER ── */}
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          padding: '22px 26px',
          border: '1px solid var(--border)',
          borderTop: '4px solid #0284c7',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ flex: '1 1 400px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                color: '#fff',
                padding: '3px 10px',
                borderRadius: 6,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                boxShadow: '0 2px 6px rgba(2,132,199,0.2)',
              }}
            >
              Équipes & Accès Sécurisés
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>• Annuaire du personnel médical</span>
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5, margin: 0 }}>
            👥 Utilisateurs
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, margin: 0 }}>
            Gérer les membres de l'équipe, rôles (médecins, techniciens, chauffeurs, administrateurs) et accès au planning.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={() => setModal({})}
            style={{
              fontWeight: 800,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 18px',
              borderRadius: 10,
              boxShadow: '0 4px 14px rgba(14,165,233,.35)',
            }}
          >
            <span>➕</span> + Créer un utilisateur
          </button>
        </div>
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
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {new Date(u.created_at).toLocaleDateString('fr')}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="btn btn-sm"
                        style={{ background: '#25D366', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 6, fontWeight: 700 }}
                        title="Partager le lien d'accès sur WhatsApp (Gratuit)"
                        onClick={() => openWhatsAppForUser(u)}
                      >
                        💬
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        title="Réinitialiser le mot de passe et voir les accès"
                        onClick={() => handleResetPassword(u)}
                      >
                        🔑
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        title="Renvoyer l'e-mail avec nouveaux identifiants"
                        onClick={() => handleResendEmail(u)}
                      >
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
      {credentialsModal && (
        <CredentialsModal data={credentialsModal} onClose={() => setCredentialsModal(null)} toast={toast} />
      )}
      {confirm && (
        <ConfirmDialog title="Supprimer l'utilisateur ?" message="Cette action est irréversible." danger
          onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
