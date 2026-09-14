import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth }   from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AddressAutocomplete from '../components/AddressAutocomplete';
import EnterpriseAutocomplete from '../components/EnterpriseAutocomplete';
import NavigationSelector from '../components/NavigationSelector';
import ExportDropdown from '../components/ExportDropdown';

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
    titre: init.entreprise_nom || init.planning_titre || init.titre || '',
    adresse: init.adresse || '',
    medecin_id: init.medecin_id || '',
    technicien_id: init.technicien_id || '',
    commentaire: init.commentaire || '',
  });
  const [allEnts, setAllEnts] = useState([]);
  const [saving, setSaving] = useState(false);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    axios.get('/api/entreprises')
      ?.then?.(r => setAllEnts(r?.data || []))
      ?.catch?.(() => {});
  }, []);

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
      <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              {init.id ? '✏️ Modifier le programme Clino' : '➕ Nouveau programme Clino Mobile'}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              Mission de l'unité médicale mobile sur site d'entreprise
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Entreprise conventionnée / Titre de mission avec autocomplétion directe */}
          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Nom de l'Entreprise / Titre de la Mission *</label>
            <EnterpriseAutocomplete
              value={f.titre}
              entreprises={allEnts}
              placeholder="Tapez le nom de l'entreprise conventionnée..."
              onChange={val => s('titre', val)}
              onSelect={ent => {
                s('titre', ent.nom);
                if (ent.adresse) s('adresse', ent.adresse);
              }}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Date de déplacement *</label>
              <input className="input" type="date" value={f.date} onChange={e => s('date', e.target.value)} required style={{ fontWeight: 600 }} />
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Heure de passage *</label>
              <input className="input" type="time" value={f.heure} onChange={e => s('heure', e.target.value)} required />
            </div>
          </div>
          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Adresse / Destination de l'Unité Mobile *</label>
            <AddressAutocomplete value={f.adresse} onChange={v => s('adresse', v)} placeholder="Adresse du site d'intervention..." required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Médecin (optionnel)</label>
              <select className="input" value={f.medecin_id} onChange={e => s('medecin_id', e.target.value)}>
                <option value="">— Aucun médecin —</option>
                {medecins?.map(m => (
                  <option key={m.id} value={m.id}>👨‍⚕️ Dr. {m.prenom} {m.nom}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Technicien (optionnel)</label>
              <select className="input" value={f.technicien_id} onChange={e => s('technicien_id', e.target.value)}>
                <option value="">— Aucun technicien —</option>
                {techniciens?.map(t => (
                  <option key={t.id} value={t.id}>🔧 {t.prenom} {t.nom}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Commentaire / Notes de mission</label>
            <textarea className="input" placeholder="Matériel embarqué, consignes d'accès ou détails du programme..." value={f.commentaire} onChange={e => s('commentaire', e.target.value)} rows={2} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !f.date || !f.heure || !f.adresse}>
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '💾 Enregistrer la tournée'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatSafeDateTitle(dateStr) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    const dayName = dt.toLocaleDateString('fr-FR', { weekday: 'long' });
    const cap = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    return `${cap} ${dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  } catch {
    return dateStr;
  }
}

function shiftDate(currDateStr, deltaDays) {
  try {
    const [y, m, d] = currDateStr.split('-').map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    date.setDate(date.getDate() + deltaDays);
    const yStr = date.getFullYear();
    const mStr = String(date.getMonth() + 1).padStart(2, '0');
    const dStr = String(date.getDate()).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
  } catch {
    return currDateStr;
  }
}

/* ── Daily Program Panel ─────────────────────────────────────── */
function DailyProgram({ selectedDate, clinoItems, isAdmin, onAddClino, onEditClino, onDeleteClino }) {
  const dayClino = clinoItems.filter(c => String(c.date || '').slice(0, 10) === selectedDate)
    .sort((a, b) => (a.heure || '').localeCompare(b.heure || ''));

  const total = dayClino.length;

  return (
    <div style={{ flex: 1, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, #0f172a, #0369a1)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.3 }}>
            📅 {formatSafeDateTitle(selectedDate)}
          </div>
          <div style={{ fontSize: 12, color: '#bae6fd', marginTop: 2 }}>
            {total} tournée{total > 1 ? 's' : ''} Clino Mobile au programme
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={onAddClino}
            style={{ background: '#ffffff', color: '#0f172a', fontWeight: 800, fontSize: 11.5, borderRadius: 8, padding: '5px 12px' }}
          >
            + Nouvelle tournée
          </button>
        )}
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {dayClino.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '40px 10px' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🚗</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-2)' }}>Aucune mission Clino ce jour</div>
            <p style={{ margin: '6px 0 16px', color: 'var(--text-3)', fontSize: 12 }}>Aucune mission Clino Mobile enregistrée pour le {formatSafeDateTitle(selectedDate)}.</p>
            {isAdmin && (
              <button className="btn btn-outline btn-sm" onClick={onAddClino} style={{ fontWeight: 700 }}>
                + Planifier une tournée
              </button>
            )}
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Vertical line */}
            <div style={{ position: 'absolute', left: 28, top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 2 }}>
              {dayClino.map(c => {
                const displayName = c.entreprise_nom || c.planning_titre || c.titre || 'Mission Clino Mobile';
                const docName = c.medecin_full || c.medecin_nom;
                const tecName = c.technicien_full || c.technicien_nom;
                const timeStr = c.heure ? String(c.heure).slice(0, 5) : '—';

                return (
                  <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    {/* Time bubble */}
                    <div style={{
                      width: 54, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 11.5, fontWeight: 900, flexShrink: 0,
                      background: '#e0f2fe',
                      color: '#0369a1',
                      border: '2px solid #0284c7',
                      zIndex: 1,
                    }}>
                      {timeStr}
                    </div>
                    {/* Card */}
                    <div style={{
                      flex: 1, padding: '12px 14px', borderRadius: 10,
                      background: '#f0f9ff',
                      border: '1px solid #bae6fd',
                      borderLeft: '4px solid #0284c7',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ fontWeight: 800, fontSize: 12, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>🚗 Clino Mobile</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {c.adresse && (
                            <NavigationSelector addr={c.adresse} compact />
                          )}
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '2px 6px', fontSize: 11 }}
                                title="Modifier"
                                onClick={() => onEditClino?.(c)}
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '2px 6px', fontSize: 11, color: 'var(--danger)' }}
                                title="Supprimer"
                                onClick={() => onDeleteClino?.(c.id)}
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div style={{ fontSize: 13.5, fontWeight: 900, color: '#0f172a' }}>
                        {displayName}
                      </div>

                      {c.adresse && (
                        <div style={{ fontSize: 12, color: '#0369a1', marginTop: 3 }}>
                          📍 {c.adresse}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                        {docName && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', background: 'rgba(2, 132, 199, 0.1)', padding: '2px 8px', borderRadius: 6 }}>
                            👨‍⚕️ {docName.startsWith('Dr.') ? docName : `Dr. ${docName}`}
                          </span>
                        )}
                        {tecName && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: 'rgba(5, 150, 105, 0.1)', padding: '2px 8px', borderRadius: 6 }}>
                            🔧 {tecName}
                          </span>
                        )}
                        {!docName && !tecName && (
                          <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
                            Sans intervenant assigné
                          </span>
                        )}
                      </div>

                      {c.commentaire && (
                        <div style={{ fontSize: 11.5, color: '#475569', fontStyle: 'italic', background: 'rgba(0,0,0,0.03)', padding: '4px 8px', borderRadius: 6, marginTop: 6 }}>
                          💬 {c.commentaire}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
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
  const [confirm,     setConfirm]     = useState(null);
  const [filters,     setFilters]     = useState({ role: '', search: '', date: '' });
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
    const u1 = on?.('clino:created', load);
    const u2 = on?.('clino:updated', load);
    const u3 = on?.('clino:deleted', load);
    return () => { u1?.(); u2?.(); u3?.(); };
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
    if (filters.date) {
      const itemDate = String(it.date || '').slice(0, 10);
      if (itemDate !== filters.date) return false;
    }
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
                    (it.titre || '').toLowerCase().includes(q) ||
                    (it.entreprise_nom || '').toLowerCase().includes(q) ||
                    (it.planning_titre || '').toLowerCase().includes(q) ||
                    (it.medecin_full || it.medecin_nom || '').toLowerCase().includes(q) ||
                    (it.technicien_full || it.technicien_nom || '').toLowerCase().includes(q) ||
                    (it.commentaire || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const hasActiveFilters = Boolean(filters.role || filters.search || filters.date);

  const allDates = [...new Set(
    items.map(i => i.date ? String(i.date).slice(0, 10) : null)
  )].filter(Boolean).sort().reverse();

  const exportClinoItems = filtered.map(it => ({
    ...it,
    _t: 'cl',
    type_label: 'Clino Mobile',
    date: String(it.date || '').slice(0, 10),
    date_display: fmtDisplayWithDay(it.date),
    heure_debut: it.heure ? String(it.heure).slice(0, 5) : '',
    heure_fin: '',
    heure_display: it.heure ? String(it.heure).slice(0, 5) : '-',
    titre: it.entreprise_nom || it.planning_titre || it.titre || 'Programme Clino Mobile',
    medecin_nom: it.medecin_full || it.medecin_nom || '-',
    technicien_nom: it.technicien_full || it.technicien_nom || '-',
    adresse: it.adresse || '-',
    commentaire: it.commentaire || '',
  })).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.heure_debut || '').localeCompare(b.heure_debut || ''));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Executive Header Banner */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: 16,
        padding: '20px 24px',
        margin: '16px 20px 12px',
        border: '1px solid var(--border)',
        borderTop: '4px solid #0284c7',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
        flexShrink: 0
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: 6,
              textTransform: 'uppercase',
              letterSpacing: 0.5
            }}>
              🚗 Unité Médicale Mobile
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
              Logistique & Déplacements Terrain
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: 'var(--text)', letterSpacing: -0.5 }}>
            Clino Mobile
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
            Planning journalier, tournées médicales et programme des interventions sur site
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Export dropdown */}
          <ExportDropdown
            label="Exporter"
            onPDF={() => {
              import('../utils/exportUtils').then(({ exportToPDF }) => {
                exportToPDF(exportClinoItems, [
                  { header: 'Date', key: 'date_display' },
                  { header: 'Horaire', key: 'heure_display' },
                  { header: 'Titre / Entreprise', key: 'titre' },
                  { header: 'Médecin', key: 'medecin_nom' },
                  { header: 'Technicien', key: 'technicien_nom' },
                  { header: 'Adresse / Destination', key: 'adresse' },
                ], 'Tournees Clino Mobile GMT Ariana');
              });
            }}
            onExcel={() => {
              import('../utils/exportUtils').then(({ exportToExcel }) => {
                exportToExcel(exportClinoItems, [
                  { header: 'Date', key: 'date_display' },
                  { header: 'Heure', key: 'heure_debut' },
                  { header: 'Entreprise / Programme', key: 'titre' },
                  { header: 'Médecin', key: 'medecin_nom' },
                  { header: 'Technicien', key: 'technicien_nom' },
                  { header: 'Adresse / Destination', key: 'adresse' },
                  { header: 'Commentaires / Notes', key: 'commentaire' },
                ], 'Tournees_Clino_Mobile_GMT_Ariana');
              });
            }}
            onWord={() => {
              import('../utils/exportUtils').then(({ exportToWord }) => {
                exportToWord(exportClinoItems, [
                  { header: 'Date', key: 'date_display' },
                  { header: 'Heure', key: 'heure_debut' },
                  { header: 'Entreprise / Programme', key: 'titre' },
                  { header: 'Médecin', key: 'medecin_nom' },
                  { header: 'Technicien', key: 'technicien_nom' },
                  { header: 'Adresse / Destination', key: 'adresse' },
                  { header: 'Commentaires / Notes', key: 'commentaire' },
                ], 'Tournees Clino Mobile GMT Ariana');
              });
            }}
          />

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
            {[['list', '📋 Liste'], ['programme', '📅 Programme jour']].map(([v, l]) => (
              <button key={v} className={`btn btn-sm ${activeTab === v ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab(v)} style={{ padding: '4px 10px', fontSize: 12 }}>{l}</button>
            ))}
          </div>
          {isAdmin && (
            <button
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontWeight: 800, fontSize: 13, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setModal({})}
            >
              + Programme
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar (Rôle: Médecins / Techniciens, Recherche) */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 20px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
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

        {/* Filter by Date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>📅</span>
          <input
            type="date"
            className="input"
            value={filters.date}
            onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
            style={{ width: 'auto', fontSize: 12, padding: '4px 8px', height: 32, borderRadius: 8 }}
            title="Filtrer par date de tournée"
          />
        </div>

        {/* Search input */}
        <input
          className="input"
          type="text"
          placeholder="🔍 Rechercher par entreprise, mot-clé, médecin ou adresse..."
          style={{ width: 280, fontSize: 12, padding: '5px 10px', height: 32, borderRadius: 8 }}
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
        />

        {hasActiveFilters && (
          <>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setFilters({ role: '', search: '', date: '' })}
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
                  {filtered.map(it => {
                    const displayName = it.entreprise_nom || it.planning_titre || it.titre || 'Mission Clino Mobile';
                    return (
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
                            {isAdmin && (
                              <>
                                <button className="btn btn-outline btn-sm" style={{ padding: '3px 7px' }} onClick={() => setModal(it)}>✏️</button>
                                <button className="btn btn-danger btn-sm" style={{ padding: '3px 7px' }} onClick={() => setConfirm(it.id)}>🗑</button>
                              </>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                          {displayName}
                        </div>
                        {it.adresse && (
                          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                            📍 {it.adresse}
                          </div>
                        )}
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
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === 'programme' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
              {/* Day Navigation Bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
                background: 'var(--surface)',
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ padding: '4px 10px', fontWeight: 800, fontSize: 13, height: 32 }}
                      onClick={() => setSelectedDate(d => shiftDate(d, -1))}
                      title="Jour précédent"
                    >
                      ‹
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ padding: '4px 12px', fontWeight: 700, fontSize: 12, height: 32 }}
                      onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
                    >
                      Aujourd'hui
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ padding: '4px 10px', fontWeight: 800, fontSize: 13, height: 32 }}
                      onClick={() => setSelectedDate(d => shiftDate(d, 1))}
                      title="Jour suivant"
                    >
                      ›
                    </button>
                  </div>
                  <input
                    className="input"
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    style={{ width: 'auto', padding: '4px 8px', height: 32, fontSize: 12, borderRadius: 8 }}
                  />
                </div>

                {/* Date quick-select pills */}
                {allDates.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, overflowX: 'auto', maxWidth: '100%', padding: '2px 0' }}>
                    {allDates.slice(0, 10).map(d => {
                      const count = items.filter(i => String(i.date || '').slice(0, 10) === d).length;
                      const isToday = d === format(new Date(), 'yyyy-MM-dd');
                      return (
                        <button
                          key={d}
                          onClick={() => setSelectedDate(d)}
                          className={`btn btn-sm ${selectedDate === d ? 'btn-primary' : 'btn-ghost'}`}
                          style={{ fontSize: 11.5, padding: '3px 8px', height: 28, flexShrink: 0, whiteSpace: 'nowrap', borderRadius: 6 }}
                        >
                          {isToday ? 'Auj.' : d.slice(8, 10) + '/' + d.slice(5, 7)}
                          {count > 0 && <span style={{ marginLeft: 4, opacity: 0.85, fontWeight: 800 }}>({count})</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Daily program full width */}
              <DailyProgram
                selectedDate={selectedDate}
                clinoItems={filtered}
                isAdmin={isAdmin}
                onAddClino={() => setModal({ date: selectedDate })}
                onEditClino={item => setModal(item)}
                onDeleteClino={id => setConfirm(id)}
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
