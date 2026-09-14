import { useEffect, useState, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  format, startOfWeek, addDays, addWeeks, subWeeks,
  startOfMonth, endOfMonth, eachDayOfInterval, endOfWeek,
  isSameMonth, isToday as isTodayFn, addMonths, subMonths, parseISO,
  getISOWeek, differenceInCalendarWeeks,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth }   from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AddressAutocomplete from '../components/AddressAutocomplete';
import EnterpriseAutocomplete from '../components/EnterpriseAutocomplete';
import NavigationSelector from '../components/NavigationSelector';
import ExportDropdown from '../components/ExportDropdown';

const DAYS_FULL_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAYS_SHORT_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ── Helper : Sélecteur Navigation GPS ───────────────────────────
function MapLink({ addr, style = {} }) {
  if (!addr) return null;
  return <NavigationSelector addr={addr} style={style} />;
}

const TYPE_COLORS = {
  ponctuel:  { bg:'#dbeafe', border:'#3b82f6', text:'#1d4ed8' },
  reunion:   { bg:'#dcfce7', border:'#22c55e', text:'#15803d' },
  formation: { bg:'#fef9c3', border:'#eab308', text:'#854d0e' },
  conges:    { bg:'#fee2e2', border:'#ef4444', text:'#b91c1c' },
  autre:     { bg:'#f3e8ff', border:'#a855f7', text:'#7e22ce' },
};

const CLINO_COLOR = { bg:'#d1fae5', border:'#059669', text:'#065f46' };

/* ── helpers ──────────────────────────────────────────────── */
function toRaw(d) {
  if (!d) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (typeof d === 'string' && d.includes('/')) {
    const [dd,mm,yyyy] = d.split('/'); return `${yyyy}-${mm}-${dd}`;
  }
  try { return format(new Date(d),'yyyy-MM-dd'); } catch { return ''; }
}

function fmtDisplay(dateStr) {
  if (!dateStr) return '—';
  try {
    const raw = toRaw(dateStr);
    if (!raw) return dateStr;
    return format(parseISO(raw), 'dd/MM/yyyy');
  } catch {
    return dateStr;
  }
}

function fmtDisplayWithDay(dateStr) {
  if (!dateStr) return '—';
  try {
    const raw = toRaw(dateStr);
    if (!raw) return dateStr;
    const parsed = parseISO(raw);
    const dayName = format(parsed, 'EEEE', { locale: fr });
    const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    return `${capDay} ${format(parsed, 'dd/MM/yyyy')}`;
  } catch {
    return dateStr;
  }
}

/* ── Detail Modal for Interventions ─────────────────────────── */
function DetailModal({ item, isAdmin, onEdit, onDelete, onClose }) {
  if (!item) return null;
  const isClino = item._t === 'cl' || item._t === 'clino' || Boolean(item.is_clino || item.clino_id);
  const isProg = item._t === 'p' || (!isClino && item.date && !item.heure);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: isClino ? '#059669' : isProg ? '#0284c7' : '#6366f1',
              color: '#fff',
              fontSize: 11,
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: 6,
              textTransform: 'uppercase',
            }}>
              {isClino ? '🚗 Clino Mobile' : isProg ? '📋 Programme Médical' : '📅 Événement'}
            </span>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>Détails de l'intervention</h3>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Title & Date Banner */}
          <div style={{ background: 'var(--surface2)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>
                {item.titre || (isClino ? 'Tournée Clino Mobile' : 'Intervention Médicale')}
              </div>
              {(item.is_clino || item.clino_id) && (
                <span style={{
                  background: '#059669',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  🚗 Clino Lié
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
              📅 {fmtDisplayWithDay(item.date || item.date_debut?.slice(0, 10))}
              {item.heure_debut && ` • ⏰ ${item.heure_debut}${item.heure_fin ? ' → ' + item.heure_fin : ''}`}
              {item.heure && ` • ⏰ ${String(item.heure).slice(0, 5)}`}
            </div>
          </div>

          {/* Medical Team */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: '#f0f9ff', padding: '10px 12px', borderRadius: 8, border: '1px solid #bae6fd' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', marginBottom: 2 }}>
                👨‍⚕️ Médecin
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                {item.medecin_nom || item.medecin_full ? `Dr. ${item.medecin_nom || item.medecin_full}` : 'Non assigné'}
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 2 }}>
                🔧 Technicien
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                {item.technicien_nom || item.technicien_full || 'Non assigné'}
              </div>
            </div>
          </div>

          {/* Location & Navigation */}
          {(item.adresse || item.lieu) && (
            <div style={{ background: 'var(--surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>
                📍 Lieu / Adresse de rendez-vous
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                {item.adresse || item.lieu}
              </div>
              <MapLink addr={item.adresse || item.lieu} />
            </div>
          )}

          {/* Notes / Commentaire */}
          {item.commentaire && (
            <div style={{ background: 'var(--surface2)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 2 }}>
                💬 Instructions & Commentaires
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', fontStyle: 'italic' }}>
                {item.commentaire}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isAdmin && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => { onDelete(item); onClose(); }}
                style={{ fontWeight: 700 }}
              >
                🗑️ Supprimer
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {isAdmin && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => { onEdit(item); onClose(); }}
                style={{ fontWeight: 700 }}
              >
                ✏️ Modifier
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Planning modal (Formulaire de programmation) ───────────── */
function PlanningModal({ event, medecins, techniciens, entreprises = [], defaultDate, defaultMedecinId, defaultTechnicienId, onSave, onClose, toast }) {
  const init = event || {};
  const [is_clino, setIsClino] = useState(Boolean(init.is_clino || init.clino_id || init._t === 'clino' || init._t === 'cl'));
  const [f, setF] = useState({
    titre: init.titre || '',
    date: toRaw(init.date) || defaultDate || format(new Date(), 'yyyy-MM-dd'),
    heure_debut: init.heure_debut || '',
    heure_fin: init.heure_fin || '',
    adresse: init.adresse || '',
    medecin_id: init.medecin_id || defaultMedecinId || '',
    technicien_id: init.technicien_id || defaultTechnicienId || '',
  });
  const [allEnts, setAllEnts] = useState(entreprises || []);

  useEffect(() => {
    if (entreprises && entreprises.length > 0) {
      setAllEnts(entreprises);
    } else {
      axios.get('/api/entreprises').then(r => setAllEnts(r.data || [])).catch(() => {});
    }
  }, [entreprises]);

  const [saving, setSaving] = useState(false);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    if (!f.date || !f.titre) return;
    setSaving(true);
    try {
      const payload = { ...f, is_clino: is_clino ? 1 : 0 };
      if (init.id) await axios.put(`/api/planning/${init.id}`, payload);
      else         await axios.post('/api/planning', payload);
      onSave();
    } catch(e) {
      const msg = e.response?.data?.message || 'Erreur lors de l\'enregistrement';
      toast ? toast(msg, 'error') : alert(msg);
    }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              {init.id ? '✏️ Modifier le programme' : '➕ Nouveau programme / visite'}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              Planification d'intervention médicale ou visite d'entreprise
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Bouton de liaison Clino Mobile */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderRadius: 10,
            border: is_clino ? '2px solid #059669' : '1px solid var(--border)',
            background: is_clino ? '#ecfdf5' : 'var(--surface2)',
            transition: 'all 0.2s ease',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: is_clino ? '#059669' : 'var(--border)',
                color: is_clino ? '#fff' : 'var(--text-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0,
              }}>
                🚗
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: is_clino ? '#065f46' : 'var(--text)' }}>
                  Lier au Clino Mobile (Unité Mobile)
                </div>
                <div style={{ fontSize: 11, color: is_clino ? '#047857' : 'var(--text-3)', marginTop: 2 }}>
                  {is_clino
                    ? '✓ Visible dans le planning du médecin ET sur le planning Clino Mobile'
                    : 'Activer pour associer ce programme à l\'unité mobile Clino'}
                </div>
              </div>
            </div>
            <button
              type="button"
              className={`btn btn-sm ${is_clino ? 'btn-primary' : 'btn-outline'}`}
              style={{
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: 8,
                background: is_clino ? '#059669' : 'transparent',
                borderColor: is_clino ? '#059669' : 'var(--border)',
                color: is_clino ? '#fff' : 'var(--text-2)',
                flexShrink: 0,
              }}
              onClick={() => setIsClino(!is_clino)}
            >
              {is_clino ? '✓ Clino Actif' : '+ Bouton Clino'}
            </button>
          </div>

          {/* Entreprise avec autocomplétion en direct lors de la saisie */}
          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Entreprise conventionnée / Titre de la visite *</label>
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
              <label style={{ fontWeight: 600 }}>Date de l'intervention *</label>
              <input
                className="input"
                type="date"
                value={f.date}
                onChange={e => s('date', e.target.value)}
                required
                style={{ fontWeight: 600 }}
              />
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Adresse / Lieu</label>
              <AddressAutocomplete
                value={f.adresse}
                onChange={v => s('adresse', v)}
                placeholder="Lieu de l'intervention"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Heure début (optionnel)</label>
              <input
                className="input"
                type="time"
                value={f.heure_debut}
                onChange={e => s('heure_debut', e.target.value)}
                placeholder="--:--"
              />
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Heure fin (optionnel)</label>
              <input
                className="input"
                type="time"
                value={f.heure_fin}
                onChange={e => s('heure_fin', e.target.value)}
                placeholder="--:--"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Médecin assigné</label>
              <select className="input" value={f.medecin_id} onChange={e => s('medecin_id', e.target.value)}>
                <option value="">— Aucun médecin —</option>
                {medecins?.map(m => (
                  <option key={m.id} value={m.id}>👨‍⚕️ Dr. {m.prenom} {m.nom}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Technicien assigné</label>
              <select className="input" value={f.technicien_id} onChange={e => s('technicien_id', e.target.value)}>
                <option value="">— Aucun technicien —</option>
                {techniciens?.map(t => (
                  <option key={t.id} value={t.id}>🔧 {t.prenom} {t.nom}</option>
                ))}
              </select>
            </div>
          </div>

          {!init.id && (
            <div style={{ padding: '8px 12px', background: '#e0f2fe', borderRadius: 8, fontSize: 12, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📧</span>
              <span>Une notification email sera automatiquement envoyée aux intervenants.</span>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !f.date || !f.titre}>
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '💾 Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Event (calendar) modal ─────────────────────────────────── */
function EventModal({ event, defaultDate, onSave, onClose, toast }) {
  const init = event || {};
  const defaultDt = defaultDate ? `${defaultDate}T08:00` : '';
  const [f, setF] = useState({
    titre: init.titre || '',
    type: init.type || 'ponctuel',
    date_debut: init.date_debut?.slice(0, 16) || defaultDt,
    date_fin: init.date_fin?.slice(0, 16) || '',
    lieu: init.lieu || '',
    recurrence: init.recurrence || 'none',
  });
  const [saving, setSaving] = useState(false);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    if (!f.titre || !f.date_debut) return;
    setSaving(true);
    try {
      if (init.id) await axios.put(`/api/events/${init.id}`, f);
      else         await axios.post('/api/events', f);
      onSave();
    } catch(e) {
      const msg = e.response?.data?.message || 'Erreur lors de l\'enregistrement';
      toast ? toast(msg, 'error') : alert(msg);
    }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            {init.id ? '✏️ Modifier l\'événement' : '➕ Nouvel événement calendrier'}
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Titre de l'événement *</label>
            <input
              className="input"
              placeholder="Ex: Réunion de service, Formation secourisme..."
              value={f.titre}
              onChange={e => s('titre', e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Type</label>
              <select className="input" value={f.type} onChange={e => s('type', e.target.value)}>
                <option value="ponctuel">📌 Ponctuel</option>
                <option value="reunion">👥 Réunion</option>
                <option value="formation">🎓 Formation</option>
                <option value="conges">🏖️ Congés</option>
                <option value="autre">📝 Autre</option>
              </select>
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Récurrence</label>
              <select className="input" value={f.recurrence} onChange={e => s('recurrence', e.target.value)}>
                <option value="none">Aucune</option>
                <option value="daily">Quotidienne</option>
                <option value="weekly">Hebdomadaire</option>
                <option value="monthly">Mensuelle</option>
              </select>
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Date début *</label>
              <input
                className="input"
                type="datetime-local"
                value={f.date_debut}
                onChange={e => s('date_debut', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Date fin</label>
              <input
                className="input"
                type="datetime-local"
                value={f.date_fin}
                onChange={e => s('date_fin', e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Lieu / Adresse</label>
            <AddressAutocomplete value={f.lieu} onChange={v => s('lieu', v)} placeholder="Lieu de l'événement" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !f.titre || !f.date_debut}>
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '💾 Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Today banner ────────────────────────────────────────────── */
function TodayBanner({ pe, ce, cl = [] }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const tp = pe.filter(e => e.date === today).sort((a, b) => (a.heure_debut || '').localeCompare(b.heure_debut || ''));
  const tc = ce.filter(e => e.date_debut?.slice(0, 10) === today);
  const tcl = cl.filter(e => e.date === today);
  if (!tp.length && !tc.length && !tcl.length) return null;
  return (
    <div style={{
      padding: '10px 20px',
      background: 'linear-gradient(90deg, #0284c7, #0d9488)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
      flexWrap: 'wrap',
      boxShadow: '0 2px 8px rgba(2,132,199,0.15)'
    }}>
      <span style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
        ⚡ Aujourd'hui :
      </span>
      {tp.map(e => (
        <span key={'tp' + e.id} style={{ background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(4px)', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
          📋 {e.heure_debut ? e.heure_debut + ' ' : ''}{e.titre || 'Programme'}{e.medecin_nom ? ' · 👨‍⚕️ ' + e.medecin_nom : ''}{e.technicien_nom ? ' · 🔧 ' + e.technicien_nom : ''}
        </span>
      ))}
      {tc.map(e => (
        <span key={'tc' + e.id} style={{ background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>
          📅 {e.titre}{e.lieu ? ' · ' + e.lieu : ''}
        </span>
      ))}
      {tcl.map(e => (
        <span key={'tcl' + e.id} style={{ background: 'rgba(255,255,255,0.25)', padding: '3px 10px', borderRadius: 20, fontSize: 12, border: '1px solid rgba(255,255,255,0.4)', fontWeight: 600 }}>
          🚗 {e.entreprise_nom || e.planning_titre || e.titre || 'Clino Mobile'}{e.heure ? ' · ⏰ ' + String(e.heure).slice(0, 5) : ''}{e.medecin_nom ? ' · 👨‍⚕️ ' + e.medecin_nom : ''}{e.technicien_nom ? ' · 🔧 ' + e.technicien_nom : ''}
        </span>
      ))}
    </div>
  );
}

/* ── 1. MATRIX VIEW (MÉDECINS OU TECHNICIENS EN HAUT, JOURS EN LIGNES) ── */
function DoctorMatrixView({
  view = 'doctor_matrix',
  days,
  periodLabel,
  periodSubtitle,
  pe,
  ce,
  cl = [],
  medecins = [],
  techniciens = [],
  isAdmin,
  onRefresh,
  toast,
  onSelectDetail,
  defaultRole = 'medecin',
  activeFilterSummary = '',
}) {
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [staffRole, setStaffRole] = useState(defaultRole === 'technicien' ? 'technicien' : 'medecin');

  useEffect(() => {
    if (defaultRole === 'technicien' || defaultRole === 'medecin') {
      setStaffRole(defaultRole);
    }
  }, [defaultRole]);

  // 1. Extract distinct doctors
  const doctorsList = useMemo(() => {
    const list = [...medecins];
    const seenIds = new Set(list.map(m => String(m.id)));
    const seenNames = new Set(list.map(m => `${m.prenom || ''} ${m.nom || ''}`.toLowerCase().replace(/^dr\.?\s*/i, '').trim()));

    [...pe, ...cl].forEach(item => {
      const rawName = item.medecin_nom || item.medecin_full;
      const cleanNom = rawName ? rawName.replace(/^dr\.?\s*/i, '').trim() : '';
      const norm = cleanNom.toLowerCase();

      if (item.medecin_id && !seenIds.has(String(item.medecin_id))) {
        seenIds.add(String(item.medecin_id));
        if (norm) seenNames.add(norm);
        list.push({
          id: item.medecin_id,
          nom: cleanNom || 'Médecin',
          prenom: '',
        });
      } else if (cleanNom && cleanNom !== '—' && cleanNom !== '-') {
        if (!seenNames.has(norm)) {
          seenNames.add(norm);
          list.push({
            id: 'nom_' + norm,
            nom: cleanNom,
            prenom: '',
            isVirtual: true,
          });
        }
      }
    });

    return list;
  }, [medecins, pe, cl]);

  // 2. Extract distinct technicians
  const techniciansList = useMemo(() => {
    const list = [...techniciens];
    const seenIds = new Set(list.map(t => String(t.id)));
    const seenNames = new Set(list.map(t => `${t.prenom || ''} ${t.nom || ''}`.toLowerCase().trim()));

    [...pe, ...cl].forEach(item => {
      if (item.technicien_id && !seenIds.has(String(item.technicien_id))) {
        seenIds.add(String(item.technicien_id));
        list.push({
          id: item.technicien_id,
          nom: item.technicien_nom || item.technicien_full || 'Technicien',
          prenom: '',
        });
      } else if (item.technicien_nom && item.technicien_nom !== '—' && item.technicien_nom !== '-') {
        const norm = item.technicien_nom.toLowerCase().trim();
        if (!seenNames.has(norm)) {
          seenNames.add(norm);
          list.push({
            id: 'nom_' + norm,
            nom: item.technicien_nom,
            prenom: '',
            isVirtual: true,
          });
        }
      }
    });

    return list;
  }, [techniciens, pe, cl]);

  const isTechnician = staffRole === 'technicien';
  const activeStaffList = isTechnician ? techniciansList : doctorsList;

  const hasUnassignedEvents = useMemo(() => {
    if (isTechnician) {
      return [...pe, ...cl].some(e => !e.technicien_id && (!e.technicien_nom || e.technicien_nom === '—' || e.technicien_nom === '-'));
    }
    return [...pe, ...cl].some(e => !e.medecin_id && (!e.medecin_nom || e.medecin_nom === '—' || e.medecin_nom === '-'));
  }, [pe, cl, isTechnician]);

  function getStaffEvents(staffMember, dayKey) {
    if (isTechnician) {
      const tecId = staffMember ? String(staffMember.id) : null;
      const tecName = staffMember ? `${staffMember.prenom || ''} ${staffMember.nom || ''}`.toLowerCase().trim() : null;

      const pEvents = pe.filter(e => {
        if (e.date !== dayKey) return false;
        if (tecId && e.technicien_id && String(e.technicien_id) === tecId) return true;
        if (tecName && e.technicien_nom && e.technicien_nom.toLowerCase().includes(tecName)) return true;
        if (!staffMember && !e.technicien_id && (!e.technicien_nom || e.technicien_nom === '—' || e.technicien_nom === '-')) return true;
        return false;
      });

      const clEvents = cl.filter(e => {
        if (e.date !== dayKey) return false;
        if (tecId && e.technicien_id && String(e.technicien_id) === tecId) return true;
        if (tecName && (e.technicien_nom || e.technicien_full) && (e.technicien_nom || e.technicien_full).toLowerCase().includes(tecName)) return true;
        if (!staffMember && !e.technicien_id && !e.technicien_nom && !e.technicien_full) return true;
        return false;
      });

      return { pEvents, clEvents };
    } else {
      const docId = staffMember ? String(staffMember.id) : null;
      const docName = staffMember ? `${staffMember.prenom || ''} ${staffMember.nom || ''}`.toLowerCase().trim() : null;

      const pEvents = pe.filter(e => {
        if (e.date !== dayKey) return false;
        if (docId && e.medecin_id && String(e.medecin_id) === docId) return true;
        if (docName && e.medecin_nom && e.medecin_nom.toLowerCase().includes(docName)) return true;
        if (!staffMember && !e.medecin_id && (!e.medecin_nom || e.medecin_nom === '—' || e.medecin_nom === '-')) return true;
        return false;
      });

      const clEvents = cl.filter(e => {
        if (e.date !== dayKey) return false;
        if (docId && e.medecin_id && String(e.medecin_id) === docId) return true;
        if (docName && (e.medecin_nom || e.medecin_full) && (e.medecin_nom || e.medecin_full).toLowerCase().includes(docName)) return true;
        if (!staffMember && !e.medecin_id && !e.medecin_nom && !e.medecin_full) return true;
        return false;
      });

      return { pEvents, clEvents };
    }
  }

  const staffStats = useMemo(() => {
    const stats = {};
    activeStaffList.forEach(staff => {
      let count = 0;
      days.forEach(d => {
        const key = typeof d === 'string' ? d : format(d, 'yyyy-MM-dd');
        const { pEvents, clEvents } = getStaffEvents(staff, key);
        count += pEvents.length + clEvents.length;
      });
      stats[staff.id] = count;
    });
    return stats;
  }, [activeStaffList, days, pe, cl, isTechnician]);

  async function del(item) {
    try {
      const type = item._t || item.t;
      if (type === 'p') await axios.delete(`/api/planning/${item.id}`);
      else if (type === 'cl' || type === 'clino') await axios.delete(`/api/clino/${item.id}`);
      else await axios.delete(`/api/events/${item.id}`);
      onRefresh();
      toast('Supprimé avec succès', 'success');
    } catch (err) {
      console.error(err);
      toast('Erreur lors de la suppression', 'error');
    } finally {
      setConfirm(null);
    }
  }

  const handleExportPDF = () => {
    import('../utils/exportUtils').then(({ exportMatrixToPDF }) => {
      exportMatrixToPDF({
        days,
        staffList: activeStaffList,
        staffRole,
        hasUnassigned: hasUnassignedEvents,
        getStaffEvents,
        title: `Planning ${isTechnician ? 'Technique' : 'Médical'} : ${periodLabel}`,
        subtitle: `GROUPEMENT DE MÉDECINE DU TRAVAIL DE L'ARIANA — Matrice ${isTechnician ? 'Techniciens' : 'Médecins'} & Jours`,
      });
    });
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', padding: '10px 14px' }}>
      {/* Sleek Navy Print Header matching PDF and Word */}
      <div className="print-only print-header-banner" style={{
        background: '#0f172a',
        color: '#ffffff',
        padding: '8px 12px',
        borderRadius: '4px',
        borderBottom: `3px solid ${isTechnician ? '#0d9488' : '#0284c7'}`,
        marginBottom: 6,
      }}>
        <div className="print-header-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="print-header-left">
            <div className="print-header-brand" style={{ fontSize: 11.5, fontWeight: 900, color: '#ffffff', letterSpacing: 0.5 }}>
              GROUPEMENT DE MÉDECINE DU TRAVAIL DE L'ARIANA
            </div>
            <div className="print-header-sub" style={{ fontSize: 8.5, fontWeight: 600, color: isTechnician ? '#99f6e4' : '#bae6fd', marginTop: 2 }}>
              {isTechnician ? 'Planning Technique Opérationnel — Techniciens & Jours' : 'Planning Médical Opérationnel — Médecins & Jours'}
            </div>
          </div>
          <div className="print-header-right" style={{ textAlign: 'right' }}>
            <div className="print-header-date" style={{ fontSize: 7.5, color: '#e2e8f0' }}>
              Édité le {format(new Date(), 'dd/MM/yyyy à HH:mm')}
            </div>
            <div className="print-header-period" style={{ fontSize: 8.5, fontWeight: 800, color: '#ffffff', marginTop: 2 }}>
              {periodLabel} {activeFilterSummary ? `(${activeFilterSummary})` : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="print-matrix-wrapper" style={{
        flex: 1,
        overflow: 'auto',
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
      }}>
        <table className="print-matrix-table" style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          textAlign: 'left',
          minWidth: Math.max(600, 80 + (activeStaffList.length + (hasUnassignedEvents ? 1 : 0)) * 180),
        }}>
          {/* ── TOP HEADER : NOMS DES MÉDECINS OU TECHNICIENS ── */}
          <thead>
            <tr>
              <th style={{
                position: 'sticky',
                top: 0,
                left: 0,
                zIndex: 30,
                background: 'var(--surface2)',
                borderRight: '2px solid var(--border)',
                borderBottom: '2px solid var(--border)',
                padding: '8px 4px',
                width: 80,
                minWidth: 80,
                maxWidth: 85,
                textAlign: 'center',
                boxShadow: '2px 2px 6px rgba(0,0,0,0.04)',
              }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: isTechnician ? '#0d9488' : 'var(--primary-dk)', textTransform: 'uppercase' }}>
                  🗓️ Jour
                </div>
                <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text)' }}>
                  {view === 'week' ? 'Sem.' : 'Mois'}
                </div>
              </th>

              {activeStaffList.map((staff) => {
                const count = staffStats[staff.id] || 0;
                const cleanDocNom = (staff.nom || '').replace(/^dr\.?\s*/i, '').trim();
                const cleanDocPrenom = (staff.prenom || '').replace(/^dr\.?\s*/i, '').trim();
                const fullDocName = (cleanDocPrenom && cleanDocNom.toLowerCase().startsWith(cleanDocPrenom.toLowerCase()))
                  ? cleanDocNom
                  : [cleanDocPrenom, cleanDocNom].filter(Boolean).join(' ');
                const initials = cleanDocPrenom
                  ? `${cleanDocPrenom.charAt(0)}${cleanDocNom.charAt(0)}`
                  : (cleanDocNom.charAt(0) || (isTechnician ? 'T' : 'D'));
                const displayName = isTechnician
                  ? ([staff.prenom, staff.nom].filter(Boolean).join(' ') || 'Technicien')
                  : (fullDocName ? `Dr. ${fullDocName}` : 'Dr.');

                return (
                  <th
                    key={staff.id}
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 20,
                      background: 'var(--surface2)',
                      borderRight: '1px solid var(--border)',
                      borderBottom: '2px solid var(--border)',
                      padding: '8px 10px',
                      minWidth: 175,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="no-print" style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        background: isTechnician
                          ? 'linear-gradient(135deg, #0d9488, #059669)'
                          : 'linear-gradient(135deg, #0284c7, #0369a1)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: 11,
                        flexShrink: 0,
                      }}>
                        {initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="matrix-staff-name" style={{
                          fontSize: 12.5,
                          fontWeight: 800,
                          color: 'var(--text)',
                          whiteSpace: 'normal',
                          lineHeight: 1.2,
                        }}>
                          {displayName}
                        </div>
                        <div className="matrix-staff-count" style={{ fontSize: 10, fontWeight: 700, color: count > 0 ? (isTechnician ? '#0f766e' : '#0369a1') : 'var(--text-3)', marginTop: 2 }}>
                          {count} {isTechnician ? `mission${count > 1 ? 's' : ''}` : `visite${count > 1 ? 's' : ''}`}
                        </div>
                      </div>
                    </div>
                  </th>
                );
              })}

              {hasUnassignedEvents && (
                <th style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 20,
                  background: 'var(--surface2)',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '2px solid var(--border)',
                  padding: '8px 10px',
                  minWidth: 160,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: '#e2e8f0',
                      color: '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 12,
                    }}>
                      {isTechnician ? '🔧' : '🏥'}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>
                        {isTechnician ? 'Sans tech.' : 'Non assigné'}
                      </div>
                    </div>
                  </div>
                </th>
              )}
            </tr>
          </thead>

          {/* ── ROWS : LES JOURS ── */}
          <tbody>
            {days.map(dayObj => {
              const day = typeof dayObj === 'string' ? parseISO(dayObj) : dayObj;
              const dayKey = format(day, 'yyyy-MM-dd');
              const isToday = isTodayFn(day);
              const dayOfWeek = day.getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const dayShort = format(day, 'EEE', { locale: fr });
              const capDayShort = dayShort.charAt(0).toUpperCase() + dayShort.slice(1);

              return (
                <tr
                  key={dayKey}
                  style={{
                    background: isToday
                      ? 'rgba(2,132,199,0.03)'
                      : isWeekend
                        ? 'var(--surface2)'
                        : 'var(--surface)',
                    transition: 'background .15s ease',
                  }}
                >
                  {/* Left Sticky Day Column - Compact 80px */}
                  <td style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 10,
                    background: isToday
                      ? '#f0f9ff'
                      : isWeekend
                        ? 'var(--surface2)'
                        : 'var(--surface)',
                    borderRight: '2px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                    padding: '6px 4px',
                    width: 80,
                    minWidth: 80,
                    maxWidth: 85,
                    textAlign: 'center',
                    verticalAlign: 'top',
                    boxShadow: '2px 0 6px rgba(0,0,0,0.03)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                      <span style={{
                        fontSize: 15,
                        fontWeight: 900,
                        color: isToday ? (isTechnician ? '#0d9488' : '#0284c7') : isWeekend ? 'var(--text-3)' : 'var(--text)',
                        lineHeight: 1.1,
                      }}>
                        {format(day, 'dd')}
                      </span>
                      <span style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        color: isToday ? (isTechnician ? '#0d9488' : '#0284c7') : isWeekend ? 'var(--text-3)' : 'var(--text-2)',
                        textTransform: 'capitalize',
                      }}>
                        {capDayShort}
                      </span>
                      {isToday && (
                        <span style={{
                          fontSize: 8,
                          fontWeight: 900,
                          background: isTechnician ? '#0d9488' : '#0284c7',
                          color: '#fff',
                          padding: '1px 4px',
                          borderRadius: 4,
                          marginTop: 2,
                          textTransform: 'uppercase',
                        }}>
                          Auj.
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Staff Cells */}
                  {activeStaffList.map(staff => {
                    const { pEvents, clEvents } = getStaffEvents(staff, dayKey);
                    const totalCellEvents = pEvents.length + clEvents.length;

                    return (
                      <td
                        key={staff.id}
                        style={{
                          borderRight: '1px solid var(--border)',
                          borderBottom: '1px solid var(--border)',
                          padding: 8,
                          verticalAlign: 'top',
                          background: totalCellEvents > 0 ? (isTechnician ? 'rgba(13,148,136,0.02)' : 'rgba(2,132,199,0.02)') : 'transparent',
                          minHeight: 60,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {pEvents.map(ev => {
                            const isCl = Boolean(ev.is_clino || ev.clino_id);
                            return (
                              <div
                                key={'p' + ev.id}
                                onClick={() => onSelectDetail?.({ ...ev, _t: 'p' })}
                                style={{
                                  background: isCl ? '#ecfdf5' : '#f0f9ff',
                                  borderRadius: 8,
                                  padding: '8px 10px',
                                  borderLeft: isCl ? '3.5px solid #059669' : '3.5px solid #0284c7',
                                  border: isCl ? '1px solid #a7f3d0' : '1px solid #bae6fd',
                                  borderLeftWidth: 3.5,
                                  cursor: 'pointer',
                                  boxShadow: isCl ? '0 1px 3px rgba(5,150,105,0.08)' : '0 1px 3px rgba(2,132,199,0.06)',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{
                                    fontSize: 9,
                                    fontWeight: 800,
                                    background: isCl ? '#059669' : '#0284c7',
                                    color: '#fff',
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}>
                                    {isCl ? '🚗 Clino' : '📋'} {ev.heure_debut || ''}
                                  </span>
                                  {ev.heure_fin && (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: isCl ? '#047857' : '#0369a1' }}>
                                      → {ev.heure_fin}
                                    </span>
                                  )}
                                </div>

                                <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginTop: 4, lineHeight: 1.25 }}>
                                  {ev.titre || ev.entreprise_nom || 'Visite médicale'}
                                </div>

                                {/* Counterpart info: Show medecin if viewing technician, or technicien if viewing medecin */}
                                {isTechnician ? (
                                  ev.medecin_nom && (
                                    <div style={{ fontSize: 10, fontWeight: 600, color: '#0369a1', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                                      <span>👨‍⚕️</span>
                                      <span>{ev.medecin_nom}</span>
                                    </div>
                                  )
                                ) : (
                                  ev.technicien_nom && (
                                    <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                                      <span>🔧</span>
                                      <span>{ev.technicien_nom}</span>
                                    </div>
                                  )
                                )}

                                {ev.adresse && (
                                  <div style={{ marginTop: 3 }}>
                                    <MapLink addr={ev.adresse} style={{ fontSize: 10 }} />
                                  </div>
                                )}

                                {isAdmin && (
                                  <div className="no-print" style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid #e0f2fe' }}>
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      style={{ padding: '1px 5px', fontSize: 10, color: 'var(--text-2)' }}
                                      title="Modifier"
                                      onClick={e => { e.stopPropagation(); setModal({ t: 'p', data: ev }); }}
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      style={{ padding: '1px 5px', fontSize: 10, color: 'var(--danger)' }}
                                      title="Supprimer"
                                      onClick={e => { e.stopPropagation(); setConfirm({ _t: 'p', t: 'p', id: ev.id, titre: ev.titre }); }}
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {clEvents.map(ev => (
                            <div
                              key={'cl' + ev.id}
                              onClick={() => onSelectDetail?.({ ...ev, _t: 'cl' })}
                              style={{
                                background: '#ecfdf5',
                                borderRadius: 8,
                                padding: '8px 10px',
                                borderLeft: '3.5px solid #059669',
                                border: '1px solid #a7f3d0',
                                borderLeftWidth: 3.5,
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 9, fontWeight: 800, background: '#059669', color: '#fff', padding: '1px 5px', borderRadius: 4 }}>
                                  🚗 Clino {ev.heure ? String(ev.heure).slice(0, 5) : ''}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginTop: 4, lineHeight: 1.25 }}>
                                {ev.entreprise_nom || ev.planning_titre || ev.titre || 'Mission Clino Mobile'}
                              </div>
                              {isTechnician ? (
                                (ev.medecin_full || ev.medecin_nom) && (
                                  <div style={{ fontSize: 10, color: '#0369a1', marginTop: 2 }}>
                                    👨‍⚕️ {ev.medecin_full || ev.medecin_nom}
                                  </div>
                                )
                              ) : (
                                (ev.technicien_full || ev.technicien_nom) && (
                                  <div style={{ fontSize: 10, color: '#065f46', marginTop: 2 }}>
                                    🔧 {ev.technicien_full || ev.technicien_nom}
                                  </div>
                                )
                              )}
                              {ev.adresse && (
                                <div style={{ marginTop: 3 }}><MapLink addr={ev.adresse} style={{ fontSize: 10 }} /></div>
                              )}
                              {isAdmin && (
                                <div className="no-print" style={{ display: 'flex', gap: 4, marginTop: 4, justifyContent: 'flex-end', borderTop: '1px solid #d1fae5', paddingTop: 2 }}>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ padding: '1px 5px', fontSize: 10, color: 'var(--danger)' }}
                                    onClick={e => { e.stopPropagation(); setConfirm({ _t: 'cl', t: 'cl', id: ev.id, titre: ev.entreprise_nom || ev.planning_titre || 'Clino Mobile' }); }}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}

                          {isAdmin && (
                            <button
                              className="btn btn-ghost btn-sm no-print"
                              style={{
                                opacity: totalCellEvents === 0 ? 0.4 : 0.7,
                                fontSize: 10,
                                padding: '2px 4px',
                                borderRadius: 4,
                                border: '1px dashed var(--border)',
                                width: '100%',
                                justifyContent: 'center',
                              }}
                              onClick={() => setModal({
                                t: 'p',
                                data: {
                                  date: dayKey,
                                  medecin_id: !isTechnician && !staff.isVirtual ? staff.id : '',
                                  technicien_id: isTechnician && !staff.isVirtual ? staff.id : '',
                                  heure_debut: '',
                                  heure_fin: '',
                                },
                              })}
                              title={`Planifier pour ${isTechnician ? staff.nom : `Dr. ${staff.prenom || ''} ${staff.nom}`} le ${format(day, 'dd/MM/yyyy')}`}
                            >
                              + Ajouter
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}

                  {hasUnassignedEvents && (
                    <td style={{
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      padding: 8,
                      verticalAlign: 'top',
                      background: 'var(--surface2)',
                    }}>
                      {(() => {
                        const { pEvents, clEvents } = getStaffEvents(null, dayKey);
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {pEvents.map(ev => (
                              <div key={'un_p' + ev.id} onClick={() => onSelectDetail?.({ ...ev, _t: 'p' })} style={{ background: '#fef3c7', borderRadius: 8, padding: 6, borderLeft: '3px solid #f59e0b', fontSize: 11, cursor: 'pointer' }}>
                                <div style={{ fontWeight: 800, color: '#b45309' }}>📋 {ev.titre}</div>
                                {ev.adresse && <div style={{ marginTop: 2 }}><MapLink addr={ev.adresse} style={{ fontSize: 10 }} /></div>}
                              </div>
                            ))}
                            {clEvents.map(ev => (
                              <div key={'un_cl' + ev.id} onClick={() => onSelectDetail?.({ ...ev, _t: 'cl' })} style={{ background: '#ecfdf5', borderRadius: 8, padding: 6, borderLeft: '3px solid #059669', fontSize: 11, cursor: 'pointer' }}>
                                <div style={{ fontWeight: 800, color: '#065f46' }}>
                                  🚗 {ev.entreprise_nom || ev.planning_titre || ev.titre || 'Mission Clino Mobile'}{ev.heure ? ' ' + String(ev.heure).slice(0, 5) : ''}
                                </div>
                                {ev.adresse && <div style={{ marginTop: 2 }}><MapLink addr={ev.adresse} style={{ fontSize: 10 }} /></div>}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal?.t === 'p' && (
        <PlanningModal
          event={modal.data}
          medecins={medecins}
          techniciens={techniciens}
          defaultDate={modal.data?.date}
          defaultMedecinId={modal.data?.medecin_id}
          defaultTechnicienId={modal.data?.technicien_id}
          onSave={() => { setModal(null); onRefresh(); toast('Enregistré avec succès ✓', 'success'); }}
          onClose={() => setModal(null)}
          toast={toast}
        />
      )}
      {modal?.t === 'e' && (
        <EventModal
          event={modal.data}
          defaultDate={modal.data?.date_debut?.slice(0, 10)}
          onSave={() => { setModal(null); onRefresh(); toast('Enregistré avec succès ✓', 'success'); }}
          onClose={() => setModal(null)}
          toast={toast}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title="Confirmer la suppression"
          message={confirm.titre ? `Supprimer "${confirm.titre}" ? Action irréversible.` : 'Action irréversible.'}
          danger
          onConfirm={() => del(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/* ── 3. MONTH (CALENDAR GRID) view ──────────────────────────── */
function MonthView({ current, pe, ce, cl = [], isAdmin, medecins, techniciens, onRefresh, toast, onSelectDetail }) {
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(current), { weekStartsOn: 1 }),
    end:   endOfWeek(endOfMonth(current), { weekStartsOn: 1 }),
  });

  const gp = d => pe.filter(e => e.date === format(d, 'yyyy-MM-dd'));
  const gc = d => ce.filter(e => e.date_debut?.slice(0, 10) === format(d, 'yyyy-MM-dd'));
  const gcl = d => cl.filter(e => e.date === format(d, 'yyyy-MM-dd'));

  const sp = selected ? pe.filter(e => e.date === selected) : [];
  const sc = selected ? ce.filter(e => e.date_debut?.slice(0, 10) === selected) : [];
  const scl = selected ? cl.filter(e => e.date === selected) : [];

  async function del(item) {
    try {
      const type = item._t || item.t;
      if (type === 'p') await axios.delete(`/api/planning/${item.id}`);
      else if (type === 'cl' || type === 'clino') await axios.delete(`/api/clino/${item.id}`);
      else await axios.delete(`/api/events/${item.id}`);
      onRefresh();
      toast('Supprimé avec succès', 'success');
    } catch (err) {
      console.error(err);
      toast('Erreur lors de la suppression', 'error');
    } finally {
      setConfirm(null);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
          {DAYS_FULL_FR.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, color: 'var(--text-3)', padding: '6px 0', textTransform: 'uppercase' }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {days.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const pEvts = gp(day);
            const cEvts = gc(day);
            const clEvts = gcl(day);
            const total = pEvts.length + cEvts.length + clEvts.length;
            const today = isTodayFn(day);
            const sel = selected === key;
            const inMon = isSameMonth(day, current);
            return (
              <div
                key={key}
                onClick={() => setSelected(sel ? null : key)}
                style={{
                  minHeight: 84,
                  padding: 7,
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: sel ? 'var(--primary-lt)' : today ? '#fff7ed' : 'var(--surface)',
                  border: `1.5px solid ${sel ? 'var(--primary)' : today ? '#f97316' : 'var(--border)'}`,
                  opacity: inMon ? 1 : 0.4,
                  transition: 'all .1s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: today ? 900 : 700, color: today ? '#f97316' : 'var(--text)' }}>
                    {format(day, 'd')}
                  </span>
                  {today && (
                    <span style={{ fontSize: 9, fontWeight: 800, background: '#f97316', color: '#fff', padding: '1px 5px', borderRadius: 10 }}>
                      Aujourd'hui
                    </span>
                  )}
                </div>
                {pEvts.slice(0, 1).map(ev => (
                  <div key={'p' + ev.id} style={{ fontSize: 10, padding: '2px 4px', borderRadius: 4, background: '#e0f2fe', color: '#0284c7', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderLeft: '3px solid #0ea5e9' }}>
                    📋 {ev.titre || 'Programme'}
                  </div>
                ))}
                {clEvts.slice(0, 1).map(ev => (
                  <div key={'cl' + ev.id} style={{ fontSize: 10, padding: '2px 4px', borderRadius: 4, background: CLINO_COLOR.bg, color: CLINO_COLOR.text, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderLeft: `3px solid ${CLINO_COLOR.border}` }}>
                    🚗 {ev.entreprise_nom || ev.planning_titre || ev.titre || 'Clino Mobile'}
                  </div>
                ))}
                {cEvts.slice(0, 1).map(ev => {
                  const c = TYPE_COLORS[ev.type] || TYPE_COLORS.autre;
                  return (
                    <div key={'c' + ev.id} style={{ fontSize: 10, padding: '2px 4px', borderRadius: 4, background: c.bg, color: c.text, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderLeft: `3px solid ${c.border}` }}>
                      {ev.titre}
                    </div>
                  );
                })}
                {total > 2 && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>+{total - 2} autre(s)</div>}
              </div>
            );
          })}
        </div>
      </div>
      {selected && (
        <div style={{ width: 320, borderLeft: '1px solid var(--border)', padding: 16, overflowY: 'auto', background: 'var(--surface)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{format(parseISO(selected), 'd MMMM yyyy', { locale: fr })}</span>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)' }}>Détail des activités de cette journée</p>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelected(null)}>✕</button>
          </div>
          {sp.length === 0 && sc.length === 0 && scl.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>☕</div>
              <p style={{ fontSize: 13 }}>Aucun événement ce jour</p>
            </div>
          )}
          {sp.map(ev => (
            <div key={'sp' + ev.id} onClick={() => onSelectDetail?.({ ...ev, _t: 'p' })} style={{ background: '#f0f9ff', borderRadius: 10, padding: '10px 12px', borderLeft: '4px solid #0284c7', border: '1px solid #bae6fd', borderLeftWidth: 4, marginBottom: 8, cursor: 'pointer' }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#0284c7' }}>📋 {ev.titre || 'Programme'}</div>
              {ev.heure_debut && <div style={{ fontSize: 11, fontWeight: 600, color: '#0369a1', marginTop: 2 }}>⏰ {ev.heure_debut}{ev.heure_fin ? ' → ' + ev.heure_fin : ''}</div>}
              {ev.medecin_nom && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>👨‍⚕️ Dr. {ev.medecin_nom}</div>}
              {ev.technicien_nom && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>🔧 {ev.technicien_nom}</div>}
              {ev.adresse && <div style={{ marginTop: 4 }}><MapLink addr={ev.adresse} style={{ fontSize: 11 }} /></div>}
            </div>
          ))}
          {scl.map(ev => (
            <div key={'scl' + ev.id} onClick={() => onSelectDetail?.({ ...ev, _t: 'cl' })} style={{ background: CLINO_COLOR.bg, borderRadius: 10, padding: '10px 12px', borderLeft: `4px solid ${CLINO_COLOR.border}`, border: `1px solid ${CLINO_COLOR.border}40`, borderLeftWidth: 4, marginBottom: 8, cursor: 'pointer' }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: CLINO_COLOR.text }}>
                🚗 {ev.entreprise_nom || ev.planning_titre || ev.titre || 'Mission Clino Mobile'}
              </div>
              {ev.heure && <div style={{ fontSize: 11, fontWeight: 600, color: '#047857', marginTop: 2 }}>⏰ {String(ev.heure).slice(0, 5)}</div>}
              {ev.medecin_nom && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>👨‍⚕️ Dr. {ev.medecin_nom}</div>}
              {ev.technicien_nom && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>🔧 {ev.technicien_nom}</div>}
              {ev.adresse && <div style={{ marginTop: 4 }}><MapLink addr={ev.adresse} style={{ fontSize: 11 }} /></div>}
            </div>
          ))}
          {sc.map(ev => {
            const c = TYPE_COLORS[ev.type] || TYPE_COLORS.autre;
            return (
              <div key={'sc' + ev.id} onClick={() => onSelectDetail?.({ ...ev, _t: 'e' })} style={{ background: c.bg, borderRadius: 10, padding: '10px 12px', borderLeft: `4px solid ${c.border}`, marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: c.text }}>📅 {ev.titre}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                  ⏰ {format(parseISO(ev.date_debut), 'HH:mm', { locale: fr })}
                </div>
                {ev.lieu && <div style={{ marginTop: 4 }}><MapLink addr={ev.lieu} style={{ fontSize: 11 }} /></div>}
              </div>
            );
          })}
          {isAdmin && (
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" style={{ flex: 1, fontSize: 12, fontWeight: 700 }} onClick={() => setModal({ t: 'p', data: { date: selected, heure_debut: '', heure_fin: '' } })}>+ Visite / Prog.</button>
              <button className="btn btn-outline btn-sm" style={{ flex: 1, fontSize: 12, fontWeight: 700 }} onClick={() => setModal({ t: 'e', data: { date_debut: selected ? `${selected}T08:00` : '' } })}>+ Événement</button>
            </div>
          )}
        </div>
      )}
      {modal?.t === 'p' && (
        <PlanningModal
          event={modal.data}
          medecins={medecins}
          techniciens={techniciens}
          defaultDate={modal.data?.date}
          onSave={() => { setModal(null); onRefresh(); toast('Enregistré avec succès ✓', 'success'); }}
          onClose={() => setModal(null)}
          toast={toast}
        />
      )}
      {modal?.t === 'e' && (
        <EventModal
          event={modal.data}
          defaultDate={modal.data?.date_debut?.slice(0, 10)}
          onSave={() => { setModal(null); onRefresh(); toast('Enregistré avec succès ✓', 'success'); }}
          onClose={() => setModal(null)}
          toast={toast}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title="Supprimer?"
          message={confirm.titre ? `Supprimer "${confirm.titre}" ? Action irréversible.` : 'Action irréversible.'}
          danger
          onConfirm={() => del(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/* ── 4. LIST view ────────────────────────────────────────────── */
function ListView({ pe, ce, cl = [], isAdmin, medecins, techniciens, onRefresh, toast, onSelectDetail }) {
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const all = [
    ...pe.map(e => ({ ...e, _t: 'p', t: 'p' })),
    ...ce.map(e => ({ ...e, _t: 'e', t: 'e', date: e.date_debut?.slice(0, 10) })),
    ...cl.map(e => ({ ...e, _t: 'cl', t: 'cl', titre: e.entreprise_nom || e.planning_titre || e.titre || ('Mission Clino Mobile ' + (e.medecin_nom || '')) })),
  ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  async function del(item) {
    try {
      const type = item._t || item.t;
      if (type === 'p') await axios.delete(`/api/planning/${item.id}`);
      else if (type === 'cl' || type === 'clino') await axios.delete(`/api/clino/${item.id}`);
      else await axios.delete(`/api/events/${item.id}`);
      onRefresh();
      toast('Supprimé avec succès', 'success');
    } catch (err) {
      console.error(err);
      toast('Erreur lors de la suppression', 'error');
    } finally {
      setConfirm(null);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
      {all.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>Aucun événement planifié</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Titre / Entreprise</th>
                <th>Jour & Date</th>
                <th>Horaire</th>
                <th>Médecin / Lieu</th>
                <th>Technicien / Adresse</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {all.map(ev => {
                if (ev._t === 'p') {
                  const isCl = Boolean(ev.is_clino || ev.clino_id);
                  return (
                    <tr key={'p' + ev.id} style={{ cursor: 'pointer' }} onClick={() => onSelectDetail?.(ev)}>
                      <td>
                        {isCl ? (
                          <span className="badge badge-green" style={{ background: CLINO_COLOR.bg, color: CLINO_COLOR.text, border: `1px solid ${CLINO_COLOR.border}` }}>🚗 Clino Mobile</span>
                        ) : (
                          <span className="badge badge-blue">📋 Programme</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 700 }}>{ev.titre || '—'}</td>
                      <td>{fmtDisplayWithDay(ev.date)}</td>
                      <td>{ev.heure_debut ? `${ev.heure_debut}${ev.heure_fin ? ' → ' + ev.heure_fin : ''}` : '—'}</td>
                      <td>{ev.medecin_nom ? `👨‍⚕️ ${ev.medecin_nom}` : '—'}</td>
                      <td>
                        {ev.technicien_nom ? `🔧 ${ev.technicien_nom}` : '—'}
                        {ev.adresse && <MapLink addr={ev.adresse} style={{ fontSize: 11, display: 'block', marginTop: 2 }} />}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                          {isAdmin && (
                            <>
                              <button className="btn btn-outline btn-sm" onClick={() => setModal({ t: 'p', data: ev })}>✏️</button>
                              <button className="btn btn-danger btn-sm" onClick={() => setConfirm(ev)}>🗑</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }
                if (ev._t === 'cl') {
                  return (
                    <tr key={'cl' + ev.id} style={{ cursor: 'pointer' }} onClick={() => onSelectDetail?.(ev)}>
                      <td><span className="badge badge-green" style={{ background: CLINO_COLOR.bg, color: CLINO_COLOR.text, border: `1px solid ${CLINO_COLOR.border}` }}>🚗 Clino Mobile</span></td>
                      <td style={{ fontWeight: 700 }}>{ev.entreprise_nom || ev.planning_titre || ev.titre || 'Mission Clino Mobile'}</td>
                      <td>{fmtDisplayWithDay(ev.date)}</td>
                      <td>{ev.heure ? String(ev.heure).slice(0, 5) : '—'}</td>
                      <td>{ev.medecin_nom ? `👨‍⚕️ ${ev.medecin_nom}` : '—'}</td>
                      <td>
                        {ev.technicien_nom ? `🔧 ${ev.technicien_nom}` : '—'}
                        {ev.adresse && <MapLink addr={ev.adresse} style={{ fontSize: 11, display: 'block', marginTop: 2 }} />}
                        {ev.commentaire && <small style={{ color: 'var(--text-3)' }}>{ev.commentaire}</small>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                          {isAdmin && <button className="btn btn-danger btn-sm" onClick={() => setConfirm(ev)}>🗑</button>}
                        </div>
                      </td>
                    </tr>
                  );
                }
                const c = TYPE_COLORS[ev.type] || TYPE_COLORS.autre;
                return (
                  <tr key={'e' + ev.id} style={{ cursor: 'pointer' }} onClick={() => onSelectDetail?.(ev)}>
                    <td><span className="badge" style={{ background: c.bg, color: c.text }}>📅 {ev.type}</span></td>
                    <td style={{ fontWeight: 700 }}>{ev.titre}</td>
                    <td>{fmtDisplayWithDay(ev.date_debut?.slice(0, 10))}</td>
                    <td>{ev.date_debut ? format(parseISO(ev.date_debut), 'HH:mm', { locale: fr }) : '—'}</td>
                    <td>{ev.lieu ? <MapLink addr={ev.lieu} style={{ fontSize: 12 }} /> : '—'}</td>
                    <td>—</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                        {isAdmin && (
                          <>
                            <button className="btn btn-outline btn-sm" onClick={() => setModal({ t: 'e', data: ev })}>✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => setConfirm(ev)}>🗑</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {modal?.t === 'p' && (
        <PlanningModal
          event={modal.data}
          medecins={medecins}
          techniciens={techniciens}
          defaultDate={modal.data?.date}
          onSave={() => { setModal(null); onRefresh(); toast('Enregistré avec succès ✓', 'success'); }}
          onClose={() => setModal(null)}
          toast={toast}
        />
      )}
      {modal?.t === 'e' && (
        <EventModal
          event={modal.data}
          defaultDate={modal.data?.date_debut?.slice(0, 10)}
          onSave={() => { setModal(null); onRefresh(); toast('Enregistré avec succès ✓', 'success'); }}
          onClose={() => setModal(null)}
          toast={toast}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title="Supprimer?"
          message={confirm.titre ? `Supprimer "${confirm.titre}" ? Action irréversible.` : 'Action irréversible.'}
          danger
          onConfirm={() => del(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/* ── MAIN COMPONENT ──────────────────────────────────────────── */
export default function Planning({ toast }) {
  const { user } = useAuth();
  const { on }   = useSocket();
  const location = useLocation();
  const isAdmin  = user?.role === 'administrateur';

  const [view, setView] = useState('doctor_matrix');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [pe, setPe] = useState([]);
  const [ce, setCe] = useState([]);
  const [cl, setCl] = useState([]);
  const [med, setMed] = useState([]);
  const [tec, setTec] = useState([]);
  const [ents, setEnts] = useState([]);
  const [modal, setModal] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [confirmItem, setConfirmItem] = useState(null);
  const [filters, setFilters] = useState({ role: '', entreprise: '', search: '', date: '' });
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (location.state?.prefillEntreprise || location.state?.prefillAdresse) {
      const today = format(new Date(), 'yyyy-MM-dd');
      setModal({
        t: 'p',
        data: {
          titre: `Visite médicale - ${location.state.prefillEntreprise || ''}`,
          adresse: location.state.prefillAdresse || '',
          date: today,
          heure_debut: '',
          heure_fin: '',
        },
      });
      toast?.(`Planification de la visite pour ${location.state.prefillEntreprise}`, 'info');
    }
  }, [location.state, toast]);

  const loadAll = useCallback(async () => {
    try {
      const [pr, cr, clr] = await Promise.all([
        axios.get('/api/planning'),
        axios.get('/api/events'),
        axios.get('/api/clino'),
      ]);
      const pData = pr.data || [];
      const cData = cr.data || [];
      const clData = clr.data || [];
      const linkedClinoIds = new Set(pData.filter(p => p.clino_id).map(p => String(p.clino_id)));

      setPe(pData);
      setCe(cData);
      setCl(clData.filter(c => !linkedClinoIds.has(String(c.id)) && !c.planning_id).map(c => ({
        ...c,
        _t: 'clino',
        date: c.date ? String(c.date).slice(0, 10) : '',
      })));
    } catch {
      toast?.('Erreur lors du chargement des données', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll, tick]);

  useEffect(() => {
    const off1 = on('planning_refresh', () => setTick(t => t + 1));
    const off2 = on('calendar_refresh', () => setTick(t => t + 1));
    const off3 = on('clino_refresh', () => setTick(t => t + 1));
    return () => { off1?.(); off2?.(); off3?.(); };
  }, [on]);

  useEffect(() => {
    axios.get('/api/users/by-role/medecin').then(r => setMed(r.data || [])).catch(() => {});
    axios.get('/api/users/by-role/technicien').then(r => setTec(r.data || [])).catch(() => {});
    axios.get('/api/entreprises').then(r => setEnts(r.data || [])).catch(() => {});
  }, []);

  const weekEnd = addDays(weekStart, 4); // Lundi à Vendredi (5 jours ouvrables)
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const nextWeekStart = addWeeks(currentWeekStart, 1);

  const isCurrentWeek = format(weekStart, 'yyyy-MM-dd') === format(currentWeekStart, 'yyyy-MM-dd');
  const isNextWeek = format(weekStart, 'yyyy-MM-dd') === format(nextWeekStart, 'yyyy-MM-dd');
  const weekDiff = differenceInCalendarWeeks(weekStart, currentWeekStart, { weekStartsOn: 1 });
  const isoWeekNum = getISOWeek(weekStart);

  const filterWeek = arr => arr.filter(e => {
    const d = toRaw(e.date || e.date_debut?.slice(0, 10) || '');
    return d >= format(weekStart, 'yyyy-MM-dd') && d <= format(weekEnd, 'yyyy-MM-dd');
  });

  const filterMonth = arr => arr.filter(e => {
    const d = toRaw(e.date || e.date_debut?.slice(0, 10) || '');
    if (!d) return false;
    const startStr = format(startOfMonth(monthDate), 'yyyy-MM-dd');
    const endStr   = format(endOfMonth(monthDate), 'yyyy-MM-dd');
    return d >= startStr && d <= endStr;
  });

  const filteredPe = pe.filter(e => {
    if (filters.date && toRaw(e.date) !== filters.date) return false;
    if (filters.role === 'medecin') {
      const hasMed = Boolean(e.medecin_id || (e.medecin_nom && e.medecin_nom !== '—' && e.medecin_nom !== '-'));
      if (!hasMed) return false;
    }
    if (filters.role === 'technicien') {
      const hasTec = Boolean(e.technicien_id || (e.technicien_nom && e.technicien_nom !== '—' && e.technicien_nom !== '-'));
      if (!hasTec) return false;
    }
    if (filters.entreprise) {
      const q = filters.entreprise.toLowerCase();
      const match = (e.titre || '').toLowerCase().includes(q) || (e.adresse || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filters.search) {
      const s = filters.search.toLowerCase();
      const match = (e.titre || '').toLowerCase().includes(s) ||
                    (e.adresse || '').toLowerCase().includes(s) ||
                    (e.medecin_nom || '').toLowerCase().includes(s) ||
                    (e.technicien_nom || '').toLowerCase().includes(s);
      if (!match) return false;
    }
    return true;
  });

  const filteredCl = cl.filter(e => {
    if (filters.date && toRaw(e.date) !== filters.date) return false;
    if (filters.role === 'medecin') {
      const hasMed = Boolean(e.medecin_id || e.medecin_nom || e.medecin_full);
      if (!hasMed) return false;
    }
    if (filters.role === 'technicien') {
      const hasTec = Boolean(e.technicien_id || e.technicien_nom || e.technicien_full);
      if (!hasTec) return false;
    }
    if (filters.entreprise) {
      const q = filters.entreprise.toLowerCase();
      const match = (e.adresse || '').toLowerCase().includes(q) ||
                    (e.titre || '').toLowerCase().includes(q) ||
                    (e.entreprise_nom || '').toLowerCase().includes(q) ||
                    (e.planning_titre || '').toLowerCase().includes(q) ||
                    (e.commentaire || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filters.search) {
      const s = filters.search.toLowerCase();
      const match = (e.adresse || '').toLowerCase().includes(s) ||
                    (e.titre || '').toLowerCase().includes(s) ||
                    (e.entreprise_nom || '').toLowerCase().includes(s) ||
                    (e.planning_titre || '').toLowerCase().includes(s) ||
                    (e.medecin_nom || '').toLowerCase().includes(s) ||
                    (e.medecin_full || '').toLowerCase().includes(s) ||
                    (e.technicien_nom || '').toLowerCase().includes(s) ||
                    (e.technicien_full || '').toLowerCase().includes(s) ||
                    (e.commentaire || '').toLowerCase().includes(s);
      if (!match) return false;
    }
    return true;
  });

  const filteredCe = ce.filter(e => {
    if (filters.date && toRaw(e.date_debut?.slice(0, 10)) !== filters.date) return false;
    if (filters.role) return false;
    if (filters.entreprise) {
      const q = filters.entreprise.toLowerCase();
      const match = (e.titre || '').toLowerCase().includes(q) || (e.lieu || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filters.search) {
      const s = filters.search.toLowerCase();
      const match = (e.titre || '').toLowerCase().includes(s) || (e.lieu || '').toLowerCase().includes(s) || (e.description || '').toLowerCase().includes(s);
      if (!match) return false;
    }
    return true;
  });

  const exportItems = [
    ...filteredPe.map(e => ({
      ...e,
      _t: 'p',
      type_label: 'Programme',
      date: toRaw(e.date),
      date_display: fmtDisplayWithDay(e.date),
      heure_debut: e.heure_debut || '',
      heure_fin: e.heure_fin || '',
      heure_display: e.heure_debut ? `${e.heure_debut}${e.heure_fin ? ' - ' + e.heure_fin : ''}` : '-',
      titre: e.titre || 'Programme',
      medecin_nom: e.medecin_nom || '-',
      technicien_nom: e.technicien_nom || '-',
      adresse: e.adresse || '-',
      commentaire: e.commentaire || '',
    })),
    ...filteredCl.map(e => ({
      ...e,
      _t: 'cl',
      type_label: 'Clino Mobile',
      titre: e.entreprise_nom || e.planning_titre || e.titre || 'Programme Clino Mobile',
      date: toRaw(e.date),
      date_display: fmtDisplayWithDay(e.date),
      heure_debut: e.heure ? String(e.heure).slice(0, 5) : '',
      heure_fin: '',
      heure_display: e.heure ? String(e.heure).slice(0, 5) : '-',
      medecin_nom: e.medecin_full || e.medecin_nom || '-',
      technicien_nom: e.technicien_full || e.technicien_nom || '-',
      adresse: e.adresse || '-',
      commentaire: e.commentaire || '',
    })),
    ...filteredCe.map(e => ({
      ...e,
      _t: 'e',
      type_label: e.type ? `Evenement (${e.type})` : 'Evenement',
      date: toRaw(e.date_debut?.slice(0, 10)),
      date_display: fmtDisplayWithDay(e.date_debut?.slice(0, 10)),
      heure_debut: e.date_debut ? format(parseISO(e.date_debut), 'HH:mm') : '',
      heure_fin: e.date_fin ? format(parseISO(e.date_fin), 'HH:mm') : '',
      heure_display: e.date_debut ? `${format(parseISO(e.date_debut), 'HH:mm')}${e.date_fin ? ' - ' + format(parseISO(e.date_fin), 'HH:mm') : ''}` : '-',
      titre: e.titre || 'Evenement',
      medecin_nom: '-',
      technicien_nom: '-',
      adresse: e.lieu || '-',
      commentaire: e.description || '',
    })),
  ].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.heure_debut || '').localeCompare(b.heure_debut || ''));

  const totalFilteredCount = filteredPe.length + filteredCl.length + filteredCe.length;
  const hasActiveFilters = Boolean(filters.role || filters.entreprise || filters.search || filters.date);

  const activeFilterSummary = useMemo(() => {
    const parts = [];
    if (filters.role) parts.push(`Rôle: ${filters.role === 'medecin' ? 'Médecins' : 'Techniciens'}`);
    if (filters.entreprise) parts.push(`Entreprise: "${filters.entreprise}"`);
    if (filters.search) parts.push(`Recherche: "${filters.search}"`);
    if (filters.date) parts.push(`Date: ${fmtDisplay(filters.date)}`);
    return parts.length > 0 ? parts.join(' | ') : '';
  }, [filters]);

  function handleJumpToDate(dateVal) {
    if (!dateVal) return;
    const parsed = parseISO(dateVal);
    if (!isNaN(parsed.getTime())) {
      setWeekStart(startOfWeek(parsed, { weekStartsOn: 1 }));
      setMonthDate(parsed);
    }
  }

  function handleCreateForCurrentView() {
    const targetDate = view === 'week' ? format(weekStart, 'yyyy-MM-dd') : format(monthDate, 'yyyy-MM-01');
    setModal({
      t: 'p',
      data: {
        date: targetDate,
        heure_debut: '',
        heure_fin: '',
      },
    });
  }

  async function handleDeleteItem(item) {
    try {
      const type = item._t || item.t;
      if (type === 'p') await axios.delete(`/api/planning/${item.id}`);
      else if (type === 'cl' || type === 'clino') await axios.delete(`/api/clino/${item.id}`);
      else await axios.delete(`/api/events/${item.id}`);
      setTick(t => t + 1);
      toast('Supprimé avec succès', 'success');
    } catch (err) {
      console.error(err);
      toast('Erreur lors de la suppression', 'error');
    } finally {
      setConfirmItem(null);
    }
  }

  const getMatrixExportConfig = () => {
    const isTechnician = filters.role === 'technicien';
    const daysInterval = view === 'week'
      ? eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 4) })
      : eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) });
    
    const curPe = view === 'week' ? filterWeek(filteredPe) : filterMonth(filteredPe);
    const curCl = view === 'week' ? filterWeek(filteredCl) : filterMonth(filteredCl);

    const rawList = isTechnician ? [...tec] : [...med];
    const seenIds = new Set(rawList.map(m => String(m.id)));
    const seenNames = new Set(rawList.map(m => `${m.prenom || ''} ${m.nom || ''}`.toLowerCase().replace(/^dr\.?\s*/i, '').trim()));

    [...curPe, ...curCl].forEach(item => {
      const staffId = isTechnician ? item.technicien_id : item.medecin_id;
      const rawStaffNom = isTechnician ? (item.technicien_nom || item.technicien_full) : (item.medecin_nom || item.medecin_full);
      const cleanNom = rawStaffNom ? rawStaffNom.replace(/^dr\.?\s*/i, '').trim() : '';
      const norm = cleanNom.toLowerCase();

      if (staffId && !seenIds.has(String(staffId))) {
        seenIds.add(String(staffId));
        if (norm) seenNames.add(norm);
        rawList.push({
          id: staffId,
          nom: cleanNom || (isTechnician ? 'Technicien' : 'Médecin'),
          prenom: '',
        });
      } else if (cleanNom && cleanNom !== '—' && cleanNom !== '-') {
        if (!seenNames.has(norm)) {
          seenNames.add(norm);
          rawList.push({
            id: 'nom_' + norm,
            nom: cleanNom,
            prenom: '',
            isVirtual: true,
          });
        }
      }
    });

    const getStaffEvs = (staff, dayKey) => {
      const sId = staff ? String(staff.id) : null;
      const sName = staff ? `${staff.prenom || ''} ${staff.nom || ''}`.toLowerCase().trim() : null;

      if (isTechnician) {
        const pEvents = curPe.filter(e => {
          if (e.date !== dayKey) return false;
          if (sId && e.technicien_id && String(e.technicien_id) === sId) return true;
          if (sName && e.technicien_nom && e.technicien_nom.toLowerCase().includes(sName)) return true;
          if (!staff && !e.technicien_id && (!e.technicien_nom || e.technicien_nom === '—' || e.technicien_nom === '-')) return true;
          return false;
        });
        const clEvents = curCl.filter(e => {
          if (e.date !== dayKey) return false;
          if (sId && e.technicien_id && String(e.technicien_id) === sId) return true;
          if (sName && (e.technicien_nom || e.technicien_full) && (e.technicien_nom || e.technicien_full).toLowerCase().includes(sName)) return true;
          if (!staff && !e.technicien_id && !e.technicien_nom && !e.technicien_full) return true;
          return false;
        });
        return { pEvents, clEvents };
      } else {
        const pEvents = curPe.filter(e => {
          if (e.date !== dayKey) return false;
          if (sId && e.medecin_id && String(e.medecin_id) === sId) return true;
          if (sName && e.medecin_nom && e.medecin_nom.toLowerCase().includes(sName)) return true;
          if (!staff && !e.medecin_id && (!e.medecin_nom || e.medecin_nom === '—' || e.medecin_nom === '-')) return true;
          return false;
        });
        const clEvents = curCl.filter(e => {
          if (e.date !== dayKey) return false;
          if (sId && e.medecin_id && String(e.medecin_id) === sId) return true;
          if (sName && (e.medecin_nom || e.medecin_full) && (e.medecin_nom || e.medecin_full).toLowerCase().includes(sName)) return true;
          if (!staff && !e.medecin_id && !e.medecin_nom && !e.medecin_full) return true;
          return false;
        });
        return { pEvents, clEvents };
      }
    };

    return {
      days: daysInterval,
      staffList: rawList,
      staffRole: isTechnician ? 'technicien' : 'medecin',
      hasUnassigned: isTechnician
        ? curPe.some(e => !e.technicien_id) || curCl.some(e => !e.technicien_id)
        : curPe.some(e => !e.medecin_id) || curCl.some(e => !e.medecin_id),
      getStaffEvents: getStaffEvs,
      title: view === 'week'
        ? `Planning Semaine ${isoWeekNum} (${format(weekStart, 'dd/MM/yyyy')} au ${format(weekEnd, 'dd/MM/yyyy')})`
        : `Planning Mensuel : ${format(monthDate, 'MMMM yyyy', { locale: fr }).toUpperCase()}`,
      subtitle: activeFilterSummary ? `Filtre: ${activeFilterSummary}` : '',
    };
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="no-print">
        <TodayBanner pe={pe} ce={ce} cl={cl} />
      </div>


      {/* ── UNIFIED COMPACT TOOLBAR (Single Sleek Bar) ── */}
      <div className="planning-toolbar no-print" style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        flexShrink: 0,
      }}>
        {/* Left: Navigation & Period */}
        <div className="planning-toolbar-nav" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              className="btn btn-outline btn-sm"
              style={{ padding: '4px 8px', fontWeight: 800, fontSize: 13, height: 28 }}
              onClick={() => view === 'week' ? setWeekStart(w => subWeeks(w, 1)) : setMonthDate(d => subMonths(d, 1))}
              title="Précédent"
            >
              ‹
            </button>
            <button
              className="btn btn-outline btn-sm"
              style={{ padding: '4px 10px', fontWeight: 700, fontSize: 11.5, height: 28 }}
              onClick={() => {
                setWeekStart(currentWeekStart);
                setMonthDate(new Date());
              }}
            >
              Aujourd'hui
            </button>
            <button
              className="btn btn-outline btn-sm"
              style={{ padding: '4px 8px', fontWeight: 800, fontSize: 13, height: 28 }}
              onClick={() => view === 'week' ? setWeekStart(w => addWeeks(w, 1)) : setMonthDate(d => addMonths(d, 1))}
              title="Suivant"
            >
              ›
            </button>
          </div>

          <h1 style={{ fontSize: 14.5, fontWeight: 900, margin: 0, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>
              {view === 'week' ? `Sem. ${isoWeekNum} : ${format(weekStart, 'd MMM', { locale: fr })} - ${format(weekEnd, 'd MMM yyyy', { locale: fr })}` : format(monthDate, 'MMMM yyyy', { locale: fr }).toUpperCase()}
            </span>
          </h1>

          <input
            type="date"
            className="input"
            style={{ width: 'auto', fontSize: 11, padding: '2px 6px', height: 28, borderRadius: 6 }}
            value={format(view === 'week' ? weekStart : monthDate, 'yyyy-MM-dd')}
            onChange={e => handleJumpToDate(e.target.value)}
            title="Aller à une date précise"
          />
        </div>

        {/* Center: View Switcher */}
        <div className="planning-view-switcher" style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 8, padding: 2, border: '1px solid var(--border)', overflowX: 'auto', maxWidth: '100%' }}>
          {[
            ['week', '📅 Semaine'],
            ['doctor_matrix', '📊 Grille Mois'],
            ['month', '📆 Calendrier'],
            ['list', '📋 Liste']
          ].map(([v, l]) => (
            <button
              key={v}
              className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setView(v)}
              style={{ padding: '3px 8px', fontSize: 11.5, fontWeight: 700 }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Right: Filters & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <select
            className="input"
            style={{ width: 'auto', fontSize: 11.5, padding: '2px 6px', height: 28, borderRadius: 6, fontWeight: 600 }}
            value={filters.role}
            onChange={e => setFilters(f => ({ ...f, role: e.target.value }))}
          >
            <option value="">👥 Rôle (Tous)</option>
            <option value="medecin">👨‍⚕️ Médecins</option>
            <option value="technicien">🔧 Techniciens</option>
          </select>

          {ents.length > 0 && (
            <select
              className="input"
              style={{ width: 'auto', maxWidth: 140, fontSize: 11.5, padding: '2px 6px', height: 28, borderRadius: 6 }}
              value={filters.entreprise}
              onChange={e => setFilters(f => ({ ...f, entreprise: e.target.value }))}
            >
              <option value="">🏢 Entreprise (Toutes)</option>
              {ents.map(ent => <option key={ent.id} value={ent.nom}>{ent.nom}</option>)}
            </select>
          )}

          <input
            className="input"
            type="text"
            placeholder="🔍 Chercher..."
            style={{ width: 110, fontSize: 11.5, padding: '2px 8px', height: 28, borderRadius: 6 }}
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          />

          {hasActiveFilters && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setFilters({ role: '', entreprise: '', search: '', date: '' })}
              style={{ fontSize: 11, padding: '2px 6px', color: 'var(--danger)', fontWeight: 700 }}
              title="Réinitialiser les filtres"
            >
              ✕ ({totalFilteredCount})
            </button>
          )}

          {isAdmin && (
            <button
              className="btn btn-primary btn-sm"
              style={{ fontWeight: 800, borderRadius: 8, padding: '4px 10px', fontSize: 11.5, height: 28 }}
              onClick={handleCreateForCurrentView}
              title="Ajouter une visite médicale / programme"
            >
              + Programme
            </button>
          )}

          {/* Export dropdown */}
          <ExportDropdown
            label="Exporter"
            buttonStyle={{ height: 28, padding: '4px 10px', fontSize: 11.5 }}
            onPDF={() => {
              import('../utils/exportUtils').then(({ exportMatrixToPDF }) => {
                const config = getMatrixExportConfig();
                exportMatrixToPDF(config);
              });
            }}
            onExcel={() => {
              import('../utils/exportUtils').then(({ exportMatrixToExcel }) => {
                const config = getMatrixExportConfig();
                exportMatrixToExcel(config);
              });
            }}
            onWord={() => {
              import('../utils/exportUtils').then(({ exportMatrixToWord }) => {
                const config = getMatrixExportConfig();
                exportMatrixToWord(config);
              });
            }}
          />
        </div>
      </div>

      {/* Content View */}
      {view === 'doctor_matrix' && (
        <DoctorMatrixView
          view={view}
          days={eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) })}
          periodLabel={format(monthDate, 'MMMM yyyy', { locale: fr }).toUpperCase()}
          periodSubtitle="Jours du mois"
          pe={filterMonth(filteredPe)}
          ce={filterMonth(filteredCe)}
          cl={filterMonth(filteredCl)}
          medecins={med}
          techniciens={tec}
          isAdmin={isAdmin}
          defaultRole={filters.role || 'medecin'}
          activeFilterSummary={activeFilterSummary}
          onRefresh={() => setTick(t => t + 1)}
          toast={toast}
          onSelectDetail={item => setDetailItem(item)}
        />
      )}

      {view === 'week' && (
        <DoctorMatrixView
          view={view}
          days={eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 4) })}
          periodLabel={`Semaine ${isoWeekNum} : Du ${format(weekStart, 'd MMMM', { locale: fr })} au ${format(weekEnd, 'd MMMM yyyy', { locale: fr })}`}
          periodSubtitle="Lundi au Vendredi"
          pe={filterWeek(filteredPe)}
          ce={filterWeek(filteredCe)}
          cl={filterWeek(filteredCl)}
          medecins={med}
          techniciens={tec}
          isAdmin={isAdmin}
          defaultRole={filters.role || 'medecin'}
          activeFilterSummary={activeFilterSummary}
          onRefresh={() => setTick(t => t + 1)}
          toast={toast}
          onSelectDetail={item => setDetailItem(item)}
        />
      )}

      {view === 'month' && (
        <MonthView
          current={monthDate}
          pe={filteredPe}
          ce={filteredCe}
          cl={filteredCl}
          isAdmin={isAdmin}
          medecins={med}
          techniciens={tec}
          onRefresh={() => setTick(t => t + 1)}
          toast={toast}
          onSelectDetail={item => setDetailItem(item)}
        />
      )}

      {view === 'list' && (
        <ListView
          pe={filteredPe}
          ce={filteredCe}
          cl={filteredCl}
          isAdmin={isAdmin}
          medecins={med}
          techniciens={tec}
          onRefresh={() => setTick(t => t + 1)}
          toast={toast}
          onSelectDetail={item => setDetailItem(item)}
        />
      )}

      {/* Modals */}
      {modal?.t === 'p' && (
        <PlanningModal
          event={modal?.data || null}
          medecins={med}
          techniciens={tec}
          entreprises={ents}
          defaultDate={modal?.data?.date}
          defaultMedecinId={modal?.data?.medecin_id}
          onSave={() => { setModal(null); setTick(t => t + 1); toast('Programme enregistré ✓ — Notification envoyée 📧', 'success'); }}
          onClose={() => setModal(null)}
          toast={toast}
        />
      )}

      {modal?.t === 'e' && (
        <EventModal
          event={modal?.data || null}
          defaultDate={modal?.data?.date_debut?.slice(0, 10)}
          onSave={() => { setModal(null); setTick(t => t + 1); toast('Événement créé ✓', 'success'); }}
          onClose={() => setModal(null)}
          toast={toast}
        />
      )}

      {detailItem && (
        <DetailModal
          item={detailItem}
          isAdmin={isAdmin}
          onEdit={item => setModal({ t: item._t === 'e' ? 'e' : 'p', data: item })}
          onDelete={item => setConfirmItem(item)}
          onClose={() => setDetailItem(null)}
        />
      )}

      {confirmItem && (
        <ConfirmDialog
          title="Confirmer la suppression"
          message={confirmItem.titre ? `Supprimer "${confirmItem.titre}" ? Cette action est irréversible.` : 'Action irréversible.'}
          danger
          onConfirm={() => handleDeleteItem(confirmItem)}
          onCancel={() => setConfirmItem(null)}
        />
      )}
    </div>
  );
}
