import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';

const DAYS_FULL   = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const DAYS_LABELS = ['L','M','M','J','V','S','D'];

function RoutineModal({ item, onSave, onClose }) {
  const init = item || {};
  const [form, setForm] = useState({
    title:  init.title  || '',
    time:   init.time   || '',
    days:   Array.isArray(init.days) ? init.days
            : (() => { try { return JSON.parse(init.days||'[]'); } catch { return []; } })(),
    active: init.active !== undefined ? !!init.active : true,
  });
  const [saving, setSaving] = useState(false);

  function toggleDay(i) {
    setForm(p => ({
      ...p,
      days: p.days.includes(i) ? p.days.filter(d => d !== i) : [...p.days, i],
    }));
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (init.id) await axios.put(`/api/routines/${init.id}`, form);
      else         await axios.post('/api/routines', form);
      onSave();
    } catch (err) { alert(err.response?.data?.message || 'Erreur'); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{init.id ? '✏️ Modifier la routine' : '➕ Nouvelle routine'}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Titre *</label>
            <input
              className="input"
              placeholder="Ex : Rappel réunion hebdo"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Heure</label>
            <input
              className="input"
              type="time"
              value={form.time}
              onChange={e => setForm(p => ({ ...p, time: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label>Jours actifs</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
              {DAYS_FULL.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  className={`btn btn-sm ${form.days.includes(i) ? 'btn-primary' : 'btn-outline'}`}
                  style={{ minWidth:54, fontSize:12 }}
                  onClick={() => toggleDay(i)}
                >
                  {d.slice(0,3)}
                </button>
              ))}
            </div>
            {form.days.length === 0 && (
              <span style={{ fontSize:12, color:'var(--text-3)', marginTop:4, display:'block' }}>
                Aucun jour sélectionné
              </span>
            )}
          </div>

          <div className="form-group">
            <label>Statut</label>
            <div style={{ display:'flex', gap:8 }}>
              <button
                type="button"
                className={`btn btn-sm ${form.active ? 'btn-success' : 'btn-outline'}`}
                onClick={() => setForm(p => ({ ...p, active: true }))}
              >
                ✅ Active
              </button>
              <button
                type="button"
                className={`btn btn-sm ${!form.active ? 'btn-danger' : 'btn-outline'}`}
                onClick={() => setForm(p => ({ ...p, active: false }))}
              >
                ⏸ Inactive
              </button>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
          >
            {saving ? <span className="spinner" style={{ width:16, height:16 }}/> : '💾 Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Routines({ toast }) {
  const { user } = useAuth();
  const [routines, setRoutines] = useState([]);
  const [modal,    setModal]    = useState(null);
  const [confirm,  setConfirm]  = useState(null);
  const [loading,  setLoading]  = useState(true);

  async function load() {
    try {
      const { data } = await axios.get('/api/routines');
      setRoutines(data);
    } catch { toast?.('Erreur chargement', 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(r) {
    try {
      const days = parseDays(r);
      await axios.put(`/api/routines/${r.id}`, { title:r.title, time:r.time, days, active: !r.active });
      load();
    } catch { toast?.('Erreur', 'error'); }
  }

  async function handleDelete(id) {
    try {
      await axios.delete(`/api/routines/${id}`);
      setConfirm(null);
      load();
      toast?.('Routine supprimée', 'success');
    } catch { toast?.('Erreur suppression', 'error'); }
  }

  function parseDays(r) {
    try {
      return Array.isArray(r.days) ? r.days : JSON.parse(r.days || '[]');
    } catch { return []; }
  }

  // Stats
  const activeCount   = routines.filter(r => r.active).length;
  const inactiveCount = routines.filter(r => !r.active).length;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h2>🔄 Mes Routines</h2>
          <p>Rappels hebdomadaires personnels</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({})}>
          + Nouvelle routine
        </button>
      </div>

      {/* Stats */}
      {routines.length > 0 && (
        <div style={{ display:'flex', gap:10, marginBottom:16 }}>
          {[
            { label:'Total',    value:routines.length, color:'#0ea5e9' },
            { label:'Actives',  value:activeCount,     color:'#10b981' },
            { label:'Inactives',value:inactiveCount,   color:'#94a3b8' },
          ].map(s => (
            <div key={s.label} style={{
              background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:10, padding:'10px 16px',
              display:'flex', gap:10, alignItems:'center',
            }}>
              <span style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.value}</span>
              <span style={{ fontSize:13, color:'var(--text-2)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : routines.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔄</div>
          <p>Aucune routine. Créez votre premier rappel !</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {routines.map(r => {
            const days = parseDays(r);
            return (
              <div key={r.id} className="card" style={{
                display:'flex', alignItems:'center', gap:14,
                opacity: r.active ? 1 : 0.6,
                borderLeft: `3px solid ${r.active ? 'var(--accent)' : 'var(--border-dark)'}`,
              }}>
                {/* Status toggle */}
                <button
                  className={`btn btn-sm ${r.active ? 'btn-success' : 'btn-outline'}`}
                  style={{ flexShrink:0, padding:'6px 10px' }}
                  onClick={() => handleToggle(r)}
                  title={r.active ? 'Désactiver' : 'Activer'}
                >
                  {r.active ? '✅' : '⏸'}
                </button>

                {/* Content */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:15, color:'var(--text)', marginBottom:3 }}>
                    {r.title}
                  </div>

                  {r.time && (
                    <div style={{ fontSize:13, color:'var(--primary)', fontWeight:600, marginBottom:6 }}>
                      ⏰ {r.time}
                    </div>
                  )}

                  {/* Days pills */}
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                    {DAYS_LABELS.map((d, i) => (
                      <div key={i} style={{
                        width:22, height:22, borderRadius:'50%',
                        fontSize:9, fontWeight:800,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        background: days.includes(i) ? 'var(--primary)' : 'var(--border)',
                        color: days.includes(i) ? '#fff' : 'var(--text-3)',
                      }}>
                        {d}
                      </div>
                    ))}
                    {days.length === 0 && (
                      <span style={{ fontSize:11, color:'var(--text-3)', fontStyle:'italic' }}>
                        Aucun jour
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setModal(r)}
                    title="Modifier"
                  >✏️</button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => setConfirm(r.id)}
                    title="Supprimer"
                  >🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal !== null && (
        <RoutineModal
          item={modal?.id ? modal : null}
          onSave={() => { setModal(null); load(); toast?.('Routine enregistrée', 'success'); }}
          onClose={() => setModal(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title="Supprimer la routine ?"
          message="Cette routine sera définitivement supprimée."
          danger
          onConfirm={() => handleDelete(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
