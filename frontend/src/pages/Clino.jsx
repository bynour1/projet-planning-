import { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  format,
  startOfWeek,
  endOfWeek,
  getISOWeek,
  addDays,
  addWeeks,
  subWeeks,
  isToday as isTodayFn,
} from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AddressAutocomplete from '../components/AddressAutocomplete';
import EnterpriseAutocomplete from '../components/EnterpriseAutocomplete';
import NavigationSelector from '../components/NavigationSelector';
import ExportDropdown from '../components/ExportDropdown';

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

function toRawDate(d) {
  if (!d) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  try {
    return String(d).slice(0, 10);
  } catch {
    return '';
  }
}

function parseDateSafe(dateStr) {
  if (!dateStr) return new Date();
  const raw = toRawDate(dateStr);
  const [y, m, d] = raw.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

function getDayName(date) {
  return DAYS_FR[date.getDay()];
}

function getMonthName(date) {
  return MONTHS_FR[date.getMonth()];
}

function fmtDateFr(date) {
  return `${date.getDate()} ${getMonthName(date)} ${date.getFullYear()}`;
}

function fmtDisplayWithDay(dateStr) {
  if (!dateStr) return '-';
  try {
    const raw = toRawDate(dateStr);
    if (!raw) return dateStr;
    const parsed = parseDateSafe(raw);
    const day = getDayName(parsed);
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = parsed.getFullYear();
    return `${day} ${dd}/${mm}/${yyyy}`;
  } catch {
    return dateStr;
  }
}

function formatSafeDateTitle(dateStr) {
  if (!dateStr) return '';
  try {
    const raw = toRawDate(dateStr);
    const parsed = parseDateSafe(raw);
    return `${getDayName(parsed)} ${fmtDateFr(parsed)}`;
  } catch {
    return dateStr;
  }
}

function shiftDate(currDateStr, deltaDays) {
  try {
    const [y, m, d] = toRawDate(currDateStr).split('-').map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
    date.setDate(date.getDate() + deltaDays);
    const yStr = date.getFullYear();
    const mStr = String(date.getMonth() + 1).padStart(2, '0');
    const dStr = String(date.getDate()).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
  } catch {
    return currDateStr;
  }
}

/* ── Clino Modal ─────────────────────────────────────────────── */
function ClinoModal({ item, medecins, techniciens, onSave, onClose }) {
  const init = item || {};
  const [f, setF] = useState({
    date: init.date ? toRawDate(init.date) : format(new Date(), 'yyyy-MM-dd'),
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
    Promise.resolve()
      .then(() => axios.get('/api/entreprises'))
      .then(r => setAllEnts(r?.data || []))
      .catch(() => {});
  }, []);

  async function save() {
    if (!f.date || !f.heure || !f.adresse) return;
    setSaving(true);
    try {
      if (init.id) await axios.put(`/api/clino/${init.id}`, f);
      else await axios.post('/api/clino', f);
      onSave();
    } catch (e) {
      alert(e.response?.data?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540, width: '92%' }} onClick={e => e.stopPropagation()}>
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
          {/* Entreprise conventionnée / Titre de mission */}
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Date de déplacement *</label>
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
              <label style={{ fontWeight: 600 }}>Heure de passage *</label>
              <input
                className="input"
                type="time"
                value={f.heure}
                onChange={e => s('heure', e.target.value)}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Adresse / Destination de l'Unité Mobile *</label>
            <AddressAutocomplete
              value={f.adresse}
              onChange={v => s('adresse', v)}
              placeholder="Adresse du site d'intervention..."
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Médecin (optionnel)</label>
              <select className="input" value={f.medecin_id} onChange={e => s('medecin_id', e.target.value)}>
                <option value="">— Aucun médecin —</option>
                {medecins?.map(m => (
                  <option key={m.id} value={m.id}>
                    👨‍⚕️ Dr. {m.prenom} {m.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Technicien (optionnel)</label>
              <select className="input" value={f.technicien_id} onChange={e => s('technicien_id', e.target.value)}>
                <option value="">— Aucun technicien —</option>
                {techniciens?.map(t => (
                  <option key={t.id} value={t.id}>
                    🔧 {t.prenom} {t.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Commentaire / Notes de mission</label>
            <textarea
              className="input"
              placeholder="Matériel embarqué, consignes d'accès ou détails du programme..."
              value={f.commentaire}
              onChange={e => s('commentaire', e.target.value)}
              rows={2}
            />
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

/* ── Single Clino Tour Card ───────────────────────────────────── */
function ClinoCard({ item, isAdmin, onEdit, onDelete }) {
  const displayName = item.entreprise_nom || item.planning_titre || item.titre || 'Mission Clino Mobile';
  const docName = item.medecin_full || item.medecin_nom;
  const tecName = item.technicien_full || item.technicien_nom;
  const timeStr = item.heure ? String(item.heure).slice(0, 5) : '—';
  const itemDateStr = toRawDate(item.date);
  let isToday = false;
  let formattedDisplayDate = '—';
  try {
    if (itemDateStr) {
      const parsed = parseDateSafe(itemDateStr);
      isToday = isTodayFn(parsed);
      const dd = String(parsed.getDate()).padStart(2, '0');
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const yyyy = parsed.getFullYear();
      formattedDisplayDate = `${dd}/${mm}/${yyyy}`;
    }
  } catch {}

  return (
    <div
      className="card clino-card"
      style={{
        padding: '13px 15px',
        borderLeft: '5px solid #0284c7',
        background: 'var(--surface)',
        borderRadius: 12,
        border: '1px solid var(--border)',
        borderLeftWidth: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Time Badge */}
          <span
            className="badge badge-blue"
            style={{
              fontSize: 12.5,
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: 7,
              background: '#e0f2fe',
              color: '#0369a1',
              border: '1px solid #bae6fd',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            🚗 {timeStr}
          </span>

          {/* Date formatted */}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
            {formattedDisplayDate}
          </span>

          {isToday && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: '#fff',
                background: '#059669',
                padding: '1px 6px',
                borderRadius: 5,
                letterSpacing: 0.3,
              }}
            >
              AUJOURD'HUI
            </span>
          )}
        </div>

        {/* Actions & GPS */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {item.adresse && <NavigationSelector addr={item.adresse} compact />}
          {isAdmin && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className="btn btn-outline btn-sm"
                style={{ padding: '3px 7px', fontSize: 11, borderRadius: 6 }}
                onClick={() => onEdit(item)}
                title="Modifier"
              >
                ✏️
              </button>
              <button
                className="btn btn-danger btn-sm"
                style={{ padding: '3px 7px', fontSize: 11, borderRadius: 6 }}
                onClick={() => onDelete(item.id)}
                title="Supprimer"
              >
                🗑
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Enterprise Title */}
      <div style={{ fontSize: 14.5, fontWeight: 900, color: 'var(--text)', lineHeight: 1.3 }}>
        {displayName}
      </div>

      {/* Address */}
      {item.adresse && (
        <div style={{ fontSize: 12, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 5, wordBreak: 'break-word' }}>
          <span>📍</span>
          <span style={{ fontWeight: 600 }}>{item.adresse}</span>
        </div>
      )}

      {/* Medical Staff Badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
        {docName && (
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: '#0369a1',
              background: 'rgba(2, 132, 199, 0.1)',
              border: '1px solid rgba(2, 132, 199, 0.2)',
              padding: '2px 8px',
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            👨‍⚕️ {docName.startsWith('Dr.') ? docName : `Dr. ${docName}`}
          </span>
        )}
        {tecName && (
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: '#059669',
              background: 'rgba(5, 150, 105, 0.1)',
              border: '1px solid rgba(5, 150, 105, 0.2)',
              padding: '2px 8px',
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            🔧 {tecName}
          </span>
        )}
        {!docName && !tecName && (
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
            Sans intervenant assigné
          </span>
        )}
      </div>

      {/* Notes / Comments */}
      {item.commentaire && (
        <div
          style={{
            fontSize: 11.5,
            color: 'var(--text-2)',
            fontStyle: 'italic',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            padding: '5px 8px',
            borderRadius: 7,
            marginTop: 2,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
          }}
        >
          <span>💬</span>
          <span style={{ wordBreak: 'break-word' }}>{item.commentaire}</span>
        </div>
      )}
    </div>
  );
}

/* ── Daily Program Panel (Timeline View) ─────────────────────── */
function DailyProgram({ selectedDate, clinoItems, isAdmin, onAddClino, onEditClino, onDeleteClino }) {
  const dayClino = clinoItems
    .filter(c => toRawDate(c.date) === selectedDate)
    .sort((a, b) => (a.heure || '').localeCompare(b.heure || ''));

  const total = dayClino.length;

  return (
    <div
      style={{
        flex: 1,
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, #0f172a, #0369a1)',
          color: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
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
            style={{
              background: '#ffffff',
              color: '#0f172a',
              fontWeight: 800,
              fontSize: 12,
              borderRadius: 8,
              padding: '6px 14px',
            }}
          >
            + Nouvelle tournée
          </button>
        )}
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
        {dayClino.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '40px 10px' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🚗</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-2)' }}>
              Aucune mission Clino ce jour
            </div>
            <p style={{ margin: '6px 0 16px', color: 'var(--text-3)', fontSize: 12 }}>
              Aucune mission Clino Mobile enregistrée pour le {formatSafeDateTitle(selectedDate)}.
            </p>
            {isAdmin && (
              <button className="btn btn-outline btn-sm" onClick={onAddClino} style={{ fontWeight: 700, padding: '6px 14px' }}>
                + Planifier une tournée
              </button>
            )}
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: 28,
                top: 0,
                bottom: 0,
                width: 2,
                background: 'var(--border)',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 2 }}>
              {dayClino.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 54,
                      height: 36,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11.5,
                      fontWeight: 900,
                      flexShrink: 0,
                      background: '#e0f2fe',
                      color: '#0369a1',
                      border: '2px solid #0284c7',
                      zIndex: 1,
                    }}
                  >
                    {c.heure ? String(c.heure).slice(0, 5) : '—'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <ClinoCard
                      item={c}
                      isAdmin={isAdmin}
                      onEdit={onEditClino}
                      onDelete={onDeleteClino}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Weekly Grid View (7 days) ───────────────────────────────── */
function WeeklyGridView({ currentWeekDate, clinoItems, isAdmin, onAddForDate, onEditClino, onDeleteClino }) {
  const weekStart = startOfWeek(currentWeekDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="clino-weekly-grid">
      {days.map(day => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const dayItems = clinoItems
          .filter(c => toRawDate(c.date) === dateKey)
          .sort((a, b) => (a.heure || '').localeCompare(b.heure || ''));
        const isToday = isTodayFn(day);
        const dayName = getDayName(day).toUpperCase();
        const dd = String(day.getDate()).padStart(2, '0');
        const mm = String(day.getMonth() + 1).padStart(2, '0');

        return (
          <div
            key={dateKey}
            style={{
              background: isToday ? 'var(--surface)' : 'var(--surface2)',
              borderRadius: 14,
              border: isToday ? '2px solid #0284c7' : '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: isToday ? '0 4px 16px rgba(2, 132, 199, 0.12)' : 'none',
            }}
          >
            {/* Day Header */}
            <div
              style={{
                padding: '11px 14px',
                background: isToday
                  ? 'linear-gradient(135deg, #0284c7, #0369a1)'
                  : 'var(--surface)',
                color: isToday ? '#fff' : 'var(--text)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 900,
                    letterSpacing: 0.3,
                  }}
                >
                  {dayName}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    opacity: isToday ? 0.95 : 0.65,
                  }}
                >
                  {dd}/{mm}
                </span>
                {isToday && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      background: '#10b981',
                      color: '#fff',
                      padding: '1px 6px',
                      borderRadius: 4,
                    }}
                  >
                    AUJ
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  className="badge"
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    background: dayItems.length > 0 ? (isToday ? '#ffffff' : '#0284c7') : 'transparent',
                    color: dayItems.length > 0 ? (isToday ? '#0369a1' : '#ffffff') : 'var(--text-3)',
                    border: dayItems.length === 0 ? '1px dashed var(--border)' : 'none',
                    padding: '2px 7px',
                    borderRadius: 10,
                  }}
                >
                  {dayItems.length}
                </span>
                {isAdmin && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{
                      padding: '2px 8px',
                      fontSize: 12,
                      fontWeight: 800,
                      color: isToday ? '#fff' : 'var(--text-2)',
                    }}
                    onClick={() => onAddForDate(dateKey)}
                    title={`Ajouter une tournée pour le ${dayName} ${dd}/${mm}`}
                  >
                    +
                  </button>
                )}
              </div>
            </div>

            {/* Day Items List */}
            <div
              style={{
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                flex: 1,
                minHeight: 110,
              }}
            >
              {dayItems.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--text-3)',
                    fontSize: 12,
                    fontStyle: 'italic',
                    padding: '18px 0',
                  }}
                >
                  Aucune tournée ce jour
                </div>
              ) : (
                dayItems.map(item => (
                  <ClinoCard
                    key={item.id}
                    item={item}
                    isAdmin={isAdmin}
                    onEdit={onEditClino}
                    onDelete={onDeleteClino}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── MAIN COMPONENT ─────────────────────────────────────────── */
export default function Clino({ toast }) {
  const { user } = useAuth();
  const { on } = useSocket();
  const isAdmin = user?.role === 'administrateur';

  const [items, setItems] = useState([]);
  const [planning, setPlanning] = useState([]);
  const [medecins, setMedecins] = useState([]);
  const [techniciens, setTechniciens] = useState([]);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [filters, setFilters] = useState({ role: '', search: '', date: '' });
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [currentWeekDate, setCurrentWeekDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState('semaine'); // 'semaine' (Grille Hebdo) | 'programme' (Programme jour)

  const load = useCallback(async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        axios.get('/api/clino'),
        axios.get('/api/planning'),
      ]);
      const cData = cRes.data || [];
      setItems(cData);
      setPlanning(pRes.data || []);
      if (cData.length > 0 && cData[0].date) {
        setCurrentWeekDate(parseDateSafe(cData[0].date));
        setSelectedDate(toRawDate(cData[0].date));
      }
    } catch {
      toast?.('Erreur chargement', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const u1 = on?.('clino:created', load);
    const u2 = on?.('clino:updated', load);
    const u3 = on?.('clino:deleted', load);
    return () => {
      u1?.();
      u2?.();
      u3?.();
    };
  }, [on, load]);

  useEffect(() => {
    axios
      .get('/api/users/by-role/medecin')
      ?.then?.(r => setMedecins(r?.data || []))
      ?.catch?.(() => {});
    axios
      .get('/api/users/by-role/technicien')
      ?.then?.(r => setTechniciens(r?.data || []))
      ?.catch?.(() => {});
  }, []);

  async function handleDelete(id) {
    try {
      await axios.delete(`/api/clino/${id}`);
      setConfirm(null);
      load();
      toast('Supprimé', 'success');
    } catch {
      toast('Erreur', 'error');
    }
  }

  // Filtered items
  const filtered = useMemo(() => {
    return items.filter(it => {
      if (filters.date) {
        const itemDate = toRawDate(it.date);
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
        const match =
          (it.adresse || '').toLowerCase().includes(q) ||
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
  }, [items, filters]);

  // Smart week focus when search or filters change
  useEffect(() => {
    if (filters.search && filtered.length > 0) {
      const first = filtered[0];
      if (first?.date) {
        setCurrentWeekDate(parseDateSafe(first.date));
        setSelectedDate(toRawDate(first.date));
      }
    }
  }, [filters.search, filtered]);

  const hasActiveFilters = Boolean(filters.role || filters.search || filters.date);

  const allDates = useMemo(() => {
    return [...new Set(items.map(i => toRawDate(i.date)).filter(Boolean))].sort().reverse();
  }, [items]);

  const exportClinoItems = useMemo(() => {
    return filtered
      .map(it => ({
        ...it,
        _t: 'cl',
        type_label: 'Clino Mobile',
        date: toRawDate(it.date),
        date_display: fmtDisplayWithDay(it.date),
        heure_debut: it.heure ? String(it.heure).slice(0, 5) : '',
        heure_fin: '',
        heure_display: it.heure ? String(it.heure).slice(0, 5) : '-',
        titre: it.entreprise_nom || it.planning_titre || it.titre || 'Programme Clino Mobile',
        medecin_nom: it.medecin_full || it.medecin_nom || '-',
        technicien_nom: it.technicien_full || it.technicien_nom || '-',
        adresse: it.adresse || '-',
        commentaire: it.commentaire || '',
      }))
      .sort(
        (a, b) =>
          (a.date || '').localeCompare(b.date || '') ||
          (a.heure_debut || '').localeCompare(b.heure_debut || '')
      );
  }, [filtered]);

  const currWeekStart = startOfWeek(currentWeekDate, { weekStartsOn: 1 });
  const currWeekEnd = endOfWeek(currentWeekDate, { weekStartsOn: 1 });
  const currWeekNum = getISOWeek(currentWeekDate);

  // Total tours for current week
  const weekItemsCount = useMemo(() => {
    const wStartStr = format(currWeekStart, 'yyyy-MM-dd');
    const wEndStr = format(currWeekEnd, 'yyyy-MM-dd');
    return filtered.filter(it => {
      const d = toRawDate(it.date);
      return d >= wStartStr && d <= wEndStr;
    }).length;
  }, [filtered, currWeekStart, currWeekEnd]);

  return (
    <div className="page-content clino-container">
      {/* Executive Header Banner */}
      <div className="clino-banner">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
            <span
              style={{
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: 6,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              🚗 Unité Médicale Mobile
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
              Planning & Tournées Terrain
            </span>
          </div>
          <h1 style={{ fontSize: 23, fontWeight: 900, margin: 0, color: 'var(--text)', letterSpacing: -0.5 }}>
            Clino Mobile
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
            Organisation des tournées hebdomadaires, planning journalier et interventions médicales
          </p>
        </div>

        <div className="clino-banner-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Export dropdown */}
          <ExportDropdown
            label="Exporter"
            onPDF={() => {
              import('../utils/exportUtils').then(({ exportToPDF }) => {
                exportToPDF(
                  exportClinoItems,
                  [
                    { header: 'Date', key: 'date_display' },
                    { header: 'Horaire', key: 'heure_display' },
                    { header: 'Titre / Entreprise', key: 'titre' },
                    { header: 'Médecin', key: 'medecin_nom' },
                    { header: 'Technicien', key: 'technicien_nom' },
                    { header: 'Adresse / Destination', key: 'adresse' },
                  ],
                  'Tournees Clino Mobile GMT Ariana'
                );
              });
            }}
            onExcel={() => {
              import('../utils/exportUtils').then(({ exportToExcel }) => {
                exportToExcel(
                  exportClinoItems,
                  [
                    { header: 'Date', key: 'date_display' },
                    { header: 'Heure', key: 'heure_debut' },
                    { header: 'Entreprise / Programme', key: 'titre' },
                    { header: 'Médecin', key: 'medecin_nom' },
                    { header: 'Technicien', key: 'technicien_nom' },
                    { header: 'Adresse / Destination', key: 'adresse' },
                    { header: 'Commentaires / Notes', key: 'commentaire' },
                  ],
                  'Tournees_Clino_Mobile_GMT_Ariana'
                );
              });
            }}
            onWord={() => {
              import('../utils/exportUtils').then(({ exportToWord }) => {
                exportToWord(
                  exportClinoItems,
                  [
                    { header: 'Date', key: 'date_display' },
                    { header: 'Heure', key: 'heure_debut' },
                    { header: 'Entreprise / Programme', key: 'titre' },
                    { header: 'Médecin', key: 'medecin_nom' },
                    { header: 'Technicien', key: 'technicien_nom' },
                    { header: 'Adresse / Destination', key: 'adresse' },
                    { header: 'Commentaires / Notes', key: 'commentaire' },
                  ],
                  'Tournees Clino Mobile GMT Ariana'
                );
              });
            }}
          />

          {/* View Tab Switcher: Only 2 views (Grille Hebdo & Programme jour) */}
          <div className="clino-nav-tabs">
            {[
              ['semaine', '📊 Grille Hebdo'],
              ['programme', '📅 Programme jour'],
            ].map(([v, l]) => (
              <button
                key={v}
                className={`btn btn-sm ${activeTab === v ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab(v)}
                style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700 }}
              >
                {l}
              </button>
            ))}
          </div>

          {isAdmin && (
            <button
              className="btn btn-primary"
              style={{
                padding: '8px 16px',
                fontWeight: 800,
                fontSize: 13,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
              onClick={() => setModal({})}
            >
              + Programme
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="clino-filters-bar">
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          🏷️ Filtres :
        </span>

        {/* Filter by Role */}
        <select
          className="input"
          style={{
            width: 'auto',
            fontSize: 12,
            padding: '6px 10px',
            height: 38,
            borderRadius: 8,
            fontWeight: 600,
          }}
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
            onChange={e => {
              const val = e.target.value;
              setFilters(f => ({ ...f, date: val }));
              if (val) {
                const parsed = parseDateSafe(val);
                setCurrentWeekDate(parsed);
                setSelectedDate(val);
              }
            }}
            style={{ width: 'auto', fontSize: 12, padding: '4px 8px', height: 38, borderRadius: 8 }}
            title="Filtrer par date de tournée"
          />
        </div>

        {/* Search input */}
        <input
          className="input"
          type="text"
          placeholder="🔍 Rechercher entreprise, mot-clé, médecin, adresse..."
          style={{ flex: 1, minWidth: 200, fontSize: 12, padding: '6px 12px', height: 38, borderRadius: 8 }}
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
        />

        {hasActiveFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setFilters({ role: '', search: '', date: '' })}
              style={{ fontSize: 12, padding: '5px 10px', color: 'var(--danger)', fontWeight: 700 }}
              title="Réinitialiser tous les filtres"
            >
              ✕ Réinitialiser
            </button>
            <span className="badge badge-blue" style={{ fontSize: 11, fontWeight: 800 }}>
              {filtered.length} tournée{filtered.length > 1 ? 's' : ''} trouvée{filtered.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div className="loading-center">
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🚗</div>
            <p style={{ fontWeight: 700, fontSize: 16 }}>Aucun programme trouvé</p>
            {hasActiveFilters && (
              <button
                className="btn btn-outline btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => setFilters({ role: '', search: '', date: '' })}
              >
                Effacer les filtres
              </button>
            )}
          </div>
        ) : (
          <>
            {/* VIEW 1: Vue Grille Hebdomadaire (7 jours) */}
            {activeTab === 'semaine' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Week Navigation Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    flexWrap: 'wrap',
                    background: 'var(--surface)',
                    padding: '12px 18px',
                    borderRadius: 14,
                    border: '1px solid var(--border)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setCurrentWeekDate(d => subWeeks(d, 1))}
                      title="Semaine précédente"
                      style={{ fontWeight: 800, fontSize: 13, height: 34, padding: '4px 10px' }}
                    >
                      ‹ Préc.
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setCurrentWeekDate(new Date())}
                      style={{ fontWeight: 700, fontSize: 12, height: 34, padding: '4px 12px' }}
                    >
                      Cette semaine
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setCurrentWeekDate(d => addWeeks(d, 1))}
                      title="Semaine suivante"
                      style={{ fontWeight: 800, fontSize: 13, height: 34, padding: '4px 10px' }}
                    >
                      Suiv. ›
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span
                      style={{
                        background: '#0284c7',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: 6,
                        textTransform: 'uppercase',
                      }}
                    >
                      Semaine {currWeekNum}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--text)' }}>
                      Du {currWeekStart.getDate()} {getMonthName(currWeekStart)} au{' '}
                      {currWeekEnd.getDate()} {getMonthName(currWeekEnd)} {currWeekEnd.getFullYear()}
                    </span>
                    <span
                      className="badge badge-blue"
                      style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 8px' }}
                    >
                      {weekItemsCount} tournée{weekItemsCount > 1 ? 's' : ''}
                    </span>
                  </div>

                  {isAdmin && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setModal({ date: format(currentWeekDate, 'yyyy-MM-dd') })}
                      style={{ fontWeight: 700, height: 34 }}
                    >
                      + Ajouter sur cette semaine
                    </button>
                  )}
                </div>

                <WeeklyGridView
                  currentWeekDate={currentWeekDate}
                  clinoItems={filtered}
                  isAdmin={isAdmin}
                  onAddForDate={dateKey => setModal({ date: dateKey })}
                  onEditClino={item => setModal(item)}
                  onDeleteClino={id => setConfirm(id)}
                />
              </div>
            )}

            {/* VIEW 2: Vue Programme Jour (Timeline) */}
            {activeTab === 'programme' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Day Navigation Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    flexWrap: 'wrap',
                    background: 'var(--surface)',
                    padding: '12px 16px',
                    borderRadius: 14,
                    border: '1px solid var(--border)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ padding: '6px 12px', fontWeight: 800, fontSize: 13, height: 36 }}
                        onClick={() => setSelectedDate(d => shiftDate(d, -1))}
                        title="Jour précédent"
                      >
                        ‹
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ padding: '6px 14px', fontWeight: 700, fontSize: 12, height: 36 }}
                        onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
                      >
                        Aujourd'hui
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ padding: '6px 12px', fontWeight: 800, fontSize: 13, height: 36 }}
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
                      style={{
                        width: 'auto',
                        padding: '4px 8px',
                        height: 36,
                        fontSize: 12,
                        borderRadius: 8,
                        fontWeight: 600,
                      }}
                    />
                  </div>

                  {/* Date quick-select pills */}
                  {allDates.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        overflowX: 'auto',
                        maxWidth: '100%',
                        padding: '2px 0',
                        WebkitOverflowScrolling: 'touch',
                        scrollbarWidth: 'none',
                      }}
                    >
                      {allDates.slice(0, 10).map(d => {
                        const count = items.filter(i => toRawDate(i.date) === d).length;
                        const isToday = d === format(new Date(), 'yyyy-MM-dd');
                        return (
                          <button
                            key={d}
                            onClick={() => setSelectedDate(d)}
                            className={`btn btn-sm ${selectedDate === d ? 'btn-primary' : 'btn-ghost'}`}
                            style={{
                              fontSize: 11.5,
                              padding: '4px 10px',
                              height: 32,
                              flexShrink: 0,
                              whiteSpace: 'nowrap',
                              borderRadius: 8,
                              fontWeight: 700,
                            }}
                          >
                            {isToday ? 'Auj.' : d.slice(8, 10) + '/' + d.slice(5, 7)}
                            {count > 0 && (
                              <span style={{ marginLeft: 4, opacity: 0.85, fontWeight: 900 }}>
                                ({count})
                              </span>
                            )}
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
          </>
        )}
      </div>

      {modal !== null && (
        <ClinoModal
          item={modal?.id ? modal : modal?.date ? { date: modal.date } : null}
          medecins={medecins}
          techniciens={techniciens}
          onSave={() => {
            setModal(null);
            load();
            toast('Enregistré', 'success');
          }}
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
