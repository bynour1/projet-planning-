import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth }   from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AddressAutocomplete from '../components/AddressAutocomplete';
import NavigationSelector from '../components/NavigationSelector';
import SignaturePadModal from '../components/SignaturePadModal';

function fmtDisplayWithDay(dateStr) {
  if (!dateStr) return '-';
  try {
    const raw = String(dateStr).slice(0, 10);
    if (!raw) return dateStr;
    const parsed = parseISO(raw);
    const dayName = format(parsed, 'EEEE', { locale: fr });
    const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    return `${capDay} ${format(parsed, 'dd/MM/yyyy')}`;
  } catch {
    return dateStr;
  }
}

/* ── Clino Modal ─────────────────────────────────────────────── */
function ClinoModal({ item, medecins, techniciens, onSave, onClose }) {
  const init = item || {};
  const [f, setF] = useState({
    date: init.date ? String(init.date).slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
    heure: init.heure?.slice(0, 5) || '',
    adresse: init.adresse || '',
    medecin_id: init.medecin_id || '',
    technicien_id: init.technicien_id || '',
    commentaire: init.commentaire || '',
  });
  const [saving, setSaving] = useState(false);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    if (!f.date || !f.heure || !f.adresse) return;
    setSaving(true);
    try {
      if (init.id) await axios.put(`/api/clino/${init.id}`, f);
      else         await axios.post('/api/clino', f);
      onSave();
    } catch(e) { 
      alert(e.response?.data?.message || 'Erreur lors de l\'enregistrement'); 
    } finally { 
      setSaving(false); 
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{init.id ? '✏️ Modifier le programme Clino' : '➕ Nouveau programme Clino Mobile'}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Date *</label>
              <input className="input" type="date" value={f.date} onChange={e => s('date', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Heure *</label>
              <input className="input" type="time" value={f.heure} onChange={e => s('heure', e.target.value)} required />
            </div>
          </div>
          <div className="form-group">
            <label>Adresse / Destination *</label>
            <AddressAutocomplete value={f.adresse} onChange={v => s('adresse', v)} placeholder="Adresse du déplacement..." required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Médecin (optionnel)</label>
              <select className="input" value={f.medecin_id} onChange={e => s('medecin_id', e.target.value)}>
                <option value="">— Aucun médecin —</option>
                {medecins?.map(m => (
                  <option key={m.id} value={m.id}>👨‍⚕️ Dr. {m.prenom} {m.nom}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Technicien (optionnel)</label>
              <select className="input" value={f.technicien_id} onChange={e => s('technicien_id', e.target.value)}>
                <option value="">— Aucun technicien —</option>
                {techniciens?.map(t => (
                  <option key={t.id} value={t.id}>🔧 {t.prenom} {t.nom}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Commentaire / Notes</label>
            <textarea className="input" placeholder="Notes, matériel ou détails du programme..." value={f.commentaire} onChange={e => s('commentaire', e.target.value)} rows={3} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !f.date || !f.heure || !f.adresse}>
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '💾 Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Daily Program Panel ─────────────────────────────────────── */
function DailyProgram({ selectedDate, clinoItems, planningItems, isAdmin, onAddClino }) {
  const dayClino = clinoItems.filter(c => String(c.date || '').slice(0, 10) === selectedDate)
    .sort((a, b) => (a.heure || '').localeCompare(b.heure || ''));
  const dayPlanning = planningItems.filter(p => String(p.date || '').slice(0, 10) === selectedDate)
    .sort((a, b) => (a.heure_debut || '').localeCompare(b.heure_debut || ''));

  const total = dayClino.length + dayPlanning.length;

  // Build merged timeline
  const timeline = [
    ...dayPlanning.map(p => ({ time: p.heure_debut || '00:00', type: 'planning', data: p })),
    ...dayClino.map(c => ({ time: c.heure || '00:00', type: 'clino', data: c })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div style={{ flex: 1, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', color: '#fff' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          📅 Programme du {format(parseISO(selectedDate), 'd MMMM yyyy', { locale: fr })}
        </div>
        <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>{total} programme(s)</div>
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {timeline.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '30px 10px' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
            Aucun programme ce jour
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Vertical line */}
            <div style={{ position: 'absolute', left: 28, top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 2 }}>
              {timeline.map((item, i) => {
                const isC = item.type === 'clino';
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {/* Time bubble */}
                    <div style={{
                      width: 52, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0,
                      background: isC ? '#e0f2fe' : '#dcfce7',
                      color: isC ? '#0284c7' : '#059669',
                      border: `2px solid ${isC ? '#0ea5e9' : '#22c55e'}`,
                      zIndex: 1,
                    }}>
                      {item.time.slice(0, 5)}
                    </div>
                    {/* Card */}
                    <div style={{
                      flex: 1, padding: '10px 12px', borderRadius: 10,
                      background: isC ? '#f0f9ff' : '#f0fdf4',
                      border: `1px solid ${isC ? '#bae6fd' : '#bbf7d0'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: isC ? '#0284c7' : '#059669' }}>
                          {isC ? '🚗 Clino Mobile' : '📋 Planning'}
                        </div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          {item.data.adresse && (
                            <NavigationSelector addr={item.data.adresse} compact />
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '2px 6px', fontSize: 11, color: isC ? '#0284c7' : '#059669', fontWeight: 600 }}
                            title="Valider & Signer sur site"
                            onClick={() => setSigModal({
                              id: item.data.id,
                              titre: isC ? 'Visite Clino Mobile' : item.data.titre,
                              adresse: item.data.adresse,
                              medecin_nom: item.data.medecin_full || item.data.medecin_nom,
                              technicien_nom: item.data.technicien_full || item.data.technicien_nom,
                              date: selectedDate
                            })}
                          >
                            ✍️ Signer
                          </button>
                        </div>
                      </div>
                      {isC ? (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.data.adresse}</div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                            {item.data.medecin_full && (
                              <span style={{ fontSize: 11, color: 'var(--text-2)', background: 'rgba(2, 132, 199, 0.1)', padding: '2px 6px', borderRadius: 4 }}>
                                👨‍⚕️ {item.data.medecin_full}
                              </span>
                            )}
                            {(item.data.technicien_full || item.data.technicien_nom) && (
                              <span style={{ fontSize: 11, color: 'var(--text-2)', background: 'rgba(5, 150, 105, 0.1)', padding: '2px 6px', borderRadius: 4 }}>
                                🔧 {item.data.technicien_full || item.data.technicien_nom}
                              </span>
                            )}
                            {!item.data.medecin_full && !item.data.technicien_full && !item.data.technicien_nom && (
                              <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
                                Sans intervenant assigné
                              </span>
                            )}
                          </div>
                          {item.data.commentaire && <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 4 }}>{item.data.commentaire}</div>}
                        </>
                      ) : (
                        <>
                          {item.data.titre && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.data.titre}</div>}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                            {item.data.medecin_nom && <span style={{ fontSize: 11, color: 'var(--text-2)' }}>👨‍⚕️ {item.data.medecin_nom}</span>}
                            {item.data.technicien_nom && <span style={{ fontSize: 11, color: 'var(--text-2)' }}>🔧 {item.data.technicien_nom}</span>}
                          </div>
                          {item.data.adresse && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>📍 {item.data.adresse}</div>}
                          {item.data.heure_fin && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>→ {item.data.heure_fin}</div>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {isAdmin && (
        <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={onAddClino}>
            + Ajouter au programme
          </button>
        </div>
      )}
    </div>
  );
}

/* ── MAIN ────────────────────────────────────────────────────── */
export default function Clino({ toast }) {
  const { user } = useAuth();
  const { on }   = useSocket();
  const isAdmin  = user?.role === 'administrateur';

  const [items,       setItems]       = useState([]);
  const [planning,    setPlanning]    = useState([]);
  const [medecins,    setMedecins]    = useState([]);
  const [techniciens, setTechniciens] = useState([]);
  const [modal,       setModal]       = useState(null);
  const [sigModal,    setSigModal]    = useState(null);
  const [confirm,     setConfirm]     = useState(null);
  const [filters,     setFilters]     = useState({ role: '', search: '' });
  const [loading,     setLoading]     = useState(true);
  const [selectedDate,setSelectedDate]= useState(format(new Date(),'yyyy-MM-dd'));
  const [activeTab,   setActiveTab]   = useState('list'); // 'list'|'programme'

  const load = useCallback(async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        axios.get('/api/clino'),
        axios.get('/api/planning'),
      ]);
      setItems(cRes.data || []);
      setPlanning(pRes.data || []);
    } catch { toast?.('Erreur chargement', 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const off = on('clino_refresh', load);
    const offP = on('planning_refresh', load);
    return () => { off?.(); offP?.(); };
  }, [on, load]);

  useEffect(() => {
    axios.get('/api/users/by-role/medecin')?.then?.(r => setMedecins(r?.data || []))?.catch?.(() => {});
    axios.get('/api/users/by-role/technicien')?.then?.(r => setTechniciens(r?.data || []))?.catch?.(() => {});
  }, []);

  async function handleDelete(id) {
    try { await axios.delete(`/api/clino/${id}`); setConfirm(null); load(); toast('Supprimé', 'success'); }
    catch { toast('Erreur', 'error'); }
  }

  const filtered = items.filter(it => {
    if (filters.role === 'medecin') {
      const hasMed = Boolean(it.medecin_id || it.medecin_nom || it.medecin_full);
      if (!hasMed) return false;
    }
    if (filters.role === 'technicien') {
      const hasTec = Boolean(it.technicien_id || it.technicien_nom || it.technicien_full);
      if (!hasTec) return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const match = (it.adresse || '').toLowerCase().includes(q) ||
                    (it.medecin_full || it.medecin_nom || '').toLowerCase().includes(q) ||
                    (it.technicien_full || it.technicien_nom || '').toLowerCase().includes(q) ||
                    (it.commentaire || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const hasActiveFilters = Boolean(filters.role || filters.search);

  const allDates = [...new Set([
    ...items.map(i => i.date ? String(i.date).slice(0, 10) : null),
    ...planning.map(p => p.date ? String(p.date).slice(0, 10) : null),
  ])].filter(Boolean).sort().reverse();

  const exportClinoItems = filtered.map(it => ({
    ...it,
    _t: 'cl',
    type_label: 'Clino Mobile',
    date: String(it.date || '').slice(0, 10),
    date_display: fmtDisplayWithDay(it.date),
    heure_debut: it.heure ? String(it.heure).slice(0, 5) : '',
    heure_fin: '',
    heure_display: it.heure ? String(it.heure).slice(0, 5) : '-',
    titre: 'Programme Clino Mobile',
    medecin_nom: it.medecin_full || it.medecin_nom || '-',
    technicien_nom: it.technicien_full || it.technicien_nom || '-',
    adresse: it.adresse || '-',
    commentaire: it.commentaire || '',
  })).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.heure_debut || '').localeCompare(b.heure_debut || ''));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🚗 Clino Mobile</h2>
          <p style={{ fontSize: 12, color: 'var(--text-2)' }}>Planning journalier & programme des tournées</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Export buttons */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                import('../utils/exportUtils').then(({ exportToPDF }) => {
                  exportToPDF(exportClinoItems, [
                    { header: 'Date', key: 'date_display' },
                    { header: 'Horaire', key: 'heure_display' },
                    { header: 'Titre / Sujet', key: 'titre' },
                    { header: 'Médecin', key: 'medecin_nom' },
                    { header: 'Technicien', key: 'technicien_nom' },
                    { header: 'Adresse / Destination', key: 'adresse' },
                  ], 'Tournees Clino Mobile GMT Ariana');
                });
              }}
              title="Exporter Clino Mobile en PDF"
            >
              📄 PDF
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                import('../utils/exportUtils').then(({ exportToExcel }) => {
                  exportToExcel(exportClinoItems, [
                    { header: 'Date', key: 'date_display' },
                    { header: 'Heure', key: 'heure_debut' },
                    { header: 'Programme', key: 'titre' },
                    { header: 'Médecin', key: 'medecin_nom' },
                    { header: 'Technicien', key: 'technicien_nom' },
                    { header: 'Adresse / Destination', key: 'adresse' },
                    { header: 'Commentaires / Notes', key: 'commentaire' },
                  ], 'Tournees_Clino_Mobile_GMT_Ariana');
                });
              }}
              title="Exporter Clino Mobile en Excel"
            >
              📊 Excel
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                import('../utils/exportUtils').then(({ exportToICS }) => exportToICS(exportClinoItems));
              }}
              title="Exporter Clino Mobile au format Calendrier .ics"
            >
              📅 .ics
            </button>
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 8, padding: 3 }}>
            {[['list', '📋 Liste'], ['programme', '📅 Programme jour']].map(([v, l]) => (
              <button key={v} className={`btn btn-sm ${activeTab === v ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab(v)} style={{ padding: '4px 10px', fontSize: 12 }}>{l}</button>
            ))}
          </div>
          {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setModal({})}>+ Programme</button>}
        </div>
      </div>

      {/* Filter Bar (Rôle: Médecins / Techniciens, Recherche) */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
          🏷️ Filtres :
        </span>

        {/* Filter by Category: All / Medecins / Techniciens */}
        <select
          className="input"
          style={{ width: 'auto', fontSize: 12, padding: '5px 10px', height: 32, borderRadius: 8, fontWeight: 600 }}
          value={filters.role}
          onChange={e => setFilters(f => ({ ...f, role: e.target.value }))}
        >
          <option value="">👥 Tous les intervenants</option>
          <option value="medecin">👨‍⚕️ Médecins uniquement</option>
          <option value="technicien">🔧 Techniciens uniquement</option>
        </select>

        {/* Search input */}
        <input
          className="input"
          type="text"
          placeholder="🔍 Rechercher par mot-clé, médecin ou adresse..."
          style={{ width: 260, fontSize: 12, padding: '5px 10px', height: 32, borderRadius: 8 }}
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
        />

        {hasActiveFilters && (
          <>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setFilters({ role: '', search: '' })}
              style={{ fontSize: 12, padding: '4px 8px', color: 'var(--danger)' }}
              title="Réinitialiser tous les filtres"
            >
              ✕ Réinitialiser
            </button>
            <span className="badge badge-blue" style={{ fontSize: 11 }}>
              {filtered.length} tournée{filtered.length > 1 ? 's' : ''} trouvée{filtered.length > 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', padding: 14 }}>
        {/* Main content */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {activeTab === 'list' && (
            <>
              {loading ? <div className="loading-center"><div className="spinner" /></div>
              : filtered.length === 0 ? <div className="empty-state"><div className="empty-icon">🚗</div><p>Aucun programme trouvé</p></div>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filtered.map(it => (
                    <div key={it.id} className="card" style={{ padding: '12px 14px', borderLeft: '4px solid #059669', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="badge badge-green">🚗 {it.heure?.slice(0, 5) || '—'}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
                            {it.date ? format(parseISO(String(it.date).slice(0, 10)), 'dd/MM/yyyy') : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {it.adresse && (
                            <NavigationSelector addr={it.adresse} compact />
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '3px 8px', fontSize: 11, color: '#059669', fontWeight: 600 }}
                            title="Valider & Signer sur site"
                            onClick={() => setSigModal({
                              id: it.id,
                              titre: 'Visite Clino Mobile',
                              adresse: it.adresse,
                              medecin_nom: it.medecin_full || it.medecin_nom,
                              technicien_nom: it.technicien_full || it.technicien_nom,
                              date: it.date
                            })}
                          >
                            ✍️ Signer
                          </button>
                          {isAdmin && (
                            <>
                              <button className="btn btn-outline btn-sm" style={{ padding: '3px 7px' }} onClick={() => setModal(it)}>✏️</button>
                              <button className="btn btn-danger btn-sm" style={{ padding: '3px 7px' }} onClick={() => setConfirm(it.id)}>🗑</button>
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                        {it.adresse}
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {(it.medecin_full || it.medecin_nom) && (
                          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                            👨‍⚕️ {it.medecin_full || it.medecin_nom}
                          </div>
                        )}
                        {(it.technicien_full || it.technicien_nom) && (
                          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                            🔧 {it.technicien_full || it.technicien_nom}
                          </div>
                        )}
                        {!it.medecin_full && !it.medecin_nom && !it.technicien_full && !it.technicien_nom && (
                          <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
                            Sans intervenant assigné
                          </div>
                        )}
                      </div>
                      {it.commentaire && (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', background: 'var(--surface2)', padding: '4px 8px', borderRadius: 6 }}>
                          {it.commentaire}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'programme' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>Sélectionner une date :</label>
                <input className="input" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                  style={{ width: 'auto', padding: '5px 10px', height: 34 }} />
              </div>
              {/* Date quick-select pills */}
              {allDates.length > 0 && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                  {allDates.slice(0, 14).map(d => {
                    const count = items.filter(i => String(i.date || '').slice(0, 10) === d).length + planning.filter(p => String(p.date || '').slice(0, 10) === d).length;
                    const isToday = d === format(new Date(), 'yyyy-MM-dd');
                    return (
                      <button key={d} onClick={() => setSelectedDate(d)}
                        className={`btn btn-sm ${selectedDate === d ? 'btn-primary' : 'btn-outline'}`}
                        style={{ fontSize: 12, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {isToday ? 'Aujourd\'hui' : format(parseISO(d), 'dd/MM', { locale: fr })}
                        {count > 0 && <span style={{ marginLeft: 4, background: 'rgba(255,255,255,.3)', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>{count}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Daily program full width */}
              <DailyProgram
                selectedDate={selectedDate}
                clinoItems={filtered}
                planningItems={planning}
                isAdmin={isAdmin}
                onAddClino={() => setModal({ date: selectedDate })}
              />
            </div>
          )}
        </div>
      </div>

      {modal !== null && (
        <ClinoModal
          item={modal?.id ? modal : modal?.date ? { date: modal.date } : null}
          medecins={medecins}
          techniciens={techniciens}
          onSave={() => { setModal(null); load(); toast('Enregistré', 'success'); }}
          onClose={() => setModal(null)}
        />
      )}
      {sigModal && (
        <SignaturePadModal
          event={sigModal}
          onClose={() => setSigModal(null)}
          onSave={() => { setSigModal(null); load(); }}
          toast={toast}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title="Supprimer?"
          message="Action irréversible."
          danger
          onConfirm={() => handleDelete(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
