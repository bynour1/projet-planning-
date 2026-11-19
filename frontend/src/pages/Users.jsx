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
    medecin: {
      label: 'Médecin', color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0', desc: 'Médecin du travail',
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      )
    },
    technicien: {
      label: 'Technicien', color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', desc: 'Technicien de santé',
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    },
    hse: {
      label: 'HSE', color: '#d97706', bg: '#fffbeb', border: '#fde68a', desc: 'Hygiène, Sécurité et Environnement',
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
    chauffeur: {
      label: 'Chauffeur', color: '#f97316', bg: '#fff7ed', border: '#fed7aa', desc: 'Chauffeur Clino',
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 17a2 2 0 100-4 2 2 0 000 4zm8 0a2 2 0 100-4 2 2 0 000 4z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l2-4h10l3 4h3a1 1 0 011 1v6a1 1 0 01-1 1h-1a3 3 0 01-6 0H10a3 3 0 01-6 0H3a1 1 0 01-1-1v-6a1 1 0 011-1h1z" />
        </svg>
      )
    },
    administrateur: {
      label: 'Admin', color: '#0ea5e9', bg: '#f0f9ff', border: '#bae6fd', desc: 'Administrateur système',
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )
    },
  };
  const rc = roleConfig[form.role] || roleConfig.medecin;
  const initials = `${(form.prenom?.[0]||'').toUpperCase()}${(form.nom?.[0]||'').toUpperCase()}`;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', zIndex: 1100 }}>
      <div
        className="modal"
        style={{
          maxWidth: 540,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 16,
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header coloré avec avatar ── */}
        <div style={{
          background: `linear-gradient(135deg, ${rc.color}22, ${rc.color}08)`,
          borderBottom: `1px solid ${rc.border}`,
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 14,
          flexShrink: 0,
        }}>
          {/* Avatar dynamique */}
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            background: rc.bg, border: `2px solid ${rc.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: initials ? 16 : 20, fontWeight: 800, color: rc.color,
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

        {/* ── Corps défilable ── */}
        <div style={{
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          flex: 1,
        }}>

          {/* Info email */}
          {!isEdit && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 14px',
              background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: 10,
            }}>
              <span style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>
                Un e-mail officiel GMT Ariana avec identifiant et mot de passe provisoire (valable 48h) sera automatiquement expédié.
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
            <input
              className="input"
              type="email"
              placeholder="exemple@gmail.com"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              style={{ height: 40 }}
            />
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
                +216
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

          {/* Sécurité du mot de passe (généré et expédié exclusivement par e-mail) */}
          {!isEdit && (
            <div style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 12,
              color: 'var(--text-2)',
              lineHeight: 1.45,
            }}>
              <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 2 }}>
                Sécurité & Authentification E-mail
              </strong>
              <span>
                Pour garantir la sécurité, aucun mot de passe n'est saisi par l'administrateur. Un mot de passe provisoire valable 48h est généré automatiquement par le système et transmis par e-mail au collaborateur.
              </span>
            </div>
          )}

          {/* Rôle — boutons visuels */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'block' }}>
              Rôle <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {Object.entries(roleConfig).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  title={cfg.desc || cfg.label}
                  onClick={() => set('role', key)}
                  style={{
                    padding: '9px 4px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${form.role === key ? cfg.color : 'var(--border)'}`,
                    background: form.role === key ? cfg.bg : 'var(--surface)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    transition: 'all .15s', outline: 'none',
                  }}
                >
                  <span style={{ color: form.role === key ? cfg.color : 'var(--text-3)' }}>{cfg.icon}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: form.role === key ? cfg.color : 'var(--text-2)',
                    whiteSpace: 'nowrap',
                  }}>{cfg.label}</span>
                </button>
              ))}
            </div>
            {form.role === 'hse' && (
              <div style={{
                marginTop: 8, padding: '7px 11px', borderRadius: 8,
                background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-2)',
                fontSize: 12,
              }}>
                <strong>Responsable HSE :</strong> Hygiène, Sécurité et Environnement.
              </div>
            )}
          </div>

          {/* Statut (modification uniquement) */}
          {isEdit && (
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'block' }}>
                Statut du compte
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['1','Actif','#10b981','#f0fdf4'],['0','Inactif','#ef4444','#fef2f2']].map(([v,l,c,bg]) => (
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
          padding: '14px 20px', borderTop: '1px solid var(--border)',
          background: 'var(--bg)',
          flexShrink: 0,
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
              : (isEdit ? 'Mettre à jour' : 'Créer le compte')}
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

  async function load() {
    try {
      const { data } = await axios.get('/api/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[Users load error]:', err);
      if (toast) toast(err.response?.data?.message || 'Erreur chargement', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreated(data) {
    setModal(null);
    await load();
    if (data?.email_sent === false) {
      toast('Compte créé avec succès ! Note : L\'e-mail d\'accès n\'a pas pu être délivré.', 'warning');
    } else {
      toast('Compte créé avec succès ! Les accès ont été envoyés par e-mail au collaborateur.', 'success');
    }
  }

  async function handleResendEmail(u) {
    try {
      const res = await axios.post(`/api/users/${u.id}/resend-welcome`);
      await load();
      if (res.data?.email_sent === false) {
        toast('Nouveaux identifiants générés, mais l\'e-mail n\'a pas pu être acheminé.', 'warning');
      } else {
        toast(`E-mail d'accès renvoyé avec succès à ${u.email}`, 'success');
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors du renvoi de l\'e-mail', 'error');
    }
  }

  async function handleDelete(id) {
    try { await axios.delete(`/api/users/${id}`); setConfirm(null); load(); toast('Supprimé', 'success'); }
    catch (err) { toast(err.response?.data?.message || 'Erreur', 'error'); }
  }

  function roleBadge(role) {
    if (role === 'hse') {
      return (
        <span
          className="badge"
          style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontWeight: 700 }}
        >
          HSE
        </span>
      );
    }
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
    hse:          users.filter(u => u.role === 'hse').length,
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
            Utilisateurs
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, margin: 0 }}>
            Gérer les membres de l'équipe, rôles (médecins, techniciens, HSE, chauffeurs, administrateurs) et accès au planning.
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
            <span>Nouvel utilisateur</span>
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
          { label: 'HSE',         value: stats.hse,         color: '#d97706' },
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
        <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 8, padding: 3, overflowX: 'auto' }}>
          {[['all','Tous'],['medecin','Médecins'],['technicien','Techniciens'],['hse','HSE'],['chauffeur','Chauffeurs'],['administrateur','Admins']].map(([v,l]) => (
            <button key={v} className={`btn btn-sm ${filter === v ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(v)} style={{ padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>Aucun utilisateur trouvé</p></div>
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
                      ? <span>{u.telephone}</span>
                      : <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td>{roleBadge(u.role)}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                      <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>
                        {u.is_active ? '● Actif' : '○ Inactif'}
                      </span>
                      {u.totp_enabled ? (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}>
                          2FA active
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {new Date(u.created_at).toLocaleDateString('fr')}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ padding: '4px 8px' }}
                        title="Renvoyer l'e-mail avec nouveaux identifiants"
                        onClick={() => handleResendEmail(u)}
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button className="btn btn-outline btn-sm" style={{ padding: '4px 8px' }} title="Modifier" onClick={() => setModal(u)}>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {u.totp_enabled ? (
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ borderColor: '#f59e0b', color: '#d97706', padding: '4px 8px' }}
                          title="Réinitialiser la double authentification (2FA)"
                          onClick={async () => {
                            if (window.confirm(`Réinitialiser la 2FA pour ${u.prenom} ${u.nom} ?\nL'utilisateur pourra se reconnecter avec son mot de passe et reconfigurer la 2FA.`)) {
                              try {
                                const { data } = await axios.post(`/api/users/${u.id}/reset-2fa`);
                                toast(data.message || '2FA réinitialisée avec succès', 'success');
                                load();
                              } catch (err) {
                                toast(err.response?.data?.message || 'Erreur réinitialisation 2FA', 'error');
                              }
                            }
                          }}
                        >
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </button>
                      ) : null}
                      {u.id !== me?.id && (
                        <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} title="Supprimer" onClick={() => setConfirm(u.id)}>
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
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
      {confirm && (
        <ConfirmDialog title="Supprimer l'utilisateur ?" message="Cette action est irréversible." danger
          onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
