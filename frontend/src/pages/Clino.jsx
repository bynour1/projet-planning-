import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth }   from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AddressAutocomplete from '../components/AddressAutocomplete';

/* ── Clino Modal ─────────────────────────────────────────────── */
function ClinoModal({ item, medecins, onSave, onClose }) {
  const init = item || {};
  const [f, setF] = useState({
    date: init.date || format(new Date(), 'yyyy-MM-dd'),
    heure: init.heure?.slice(0,5) || '',
    adresse: init.adresse || '',
    medecin_id: init.medecin_id || '',
    commentaire: init.commentaire || '',
  });
  const [saving, setSaving] = useState(false);
  const s = (k,v) => setF(p=>({...p,[k]:v}));
  async function save() {
    if (!f.date||!f.heure||!f.adresse) return;
    setSaving(true);
    try {
      if (init.id) await axios.put(`/api/clino/${init.id}`, f);
      else         await axios.post('/api/clino', f);
      onSave();
    } catch(e){ alert(e.response?.data?.message||'Erreur'); }
    finally { setSaving(false); }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>{init.id?'✏️ Modifier':'➕ Nouvelle intervention Clino'}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="form-group"><label>Date *</label>
              <input className="input" type="date" value={f.date} onChange={e=>s('date',e.target.value)} required/></div>
            <div className="form-group"><label>Heure *</label>
              <input className="input" type="time" value={f.heure} onChange={e=>s('heure',e.target.value)} required/></div>
          </div>
          <div className="form-group"><label>Adresse *</label>
            <AddressAutocomplete value={f.adresse} onChange={v=>s('adresse',v)} placeholder="Adresse de l'intervention" required /></div>
          <div className="form-group"><label>Médecin</label>
            <select className="input" value={f.medecin_id} onChange={e=>s('medecin_id',e.target.value)}>
              <option value="">— Sélectionner —</option>
              {medecins.map(m=><option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
            </select></div>
          <div className="form-group"><label>Commentaire</label>
            <textarea className="input" placeholder="Commentaire..." value={f.commentaire} onChange={e=>s('commentaire',e.target.value)}/></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save} disabled={saving||!f.date||!f.heure||!f.adresse}>
            {saving?<span className="spinner" style={{width:16,height:16}}/>:'💾 Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Daily Program Panel ─────────────────────────────────────── */
function DailyProgram({ selectedDate, clinoItems, planningItems, isAdmin, onAddClino }) {
  const dayClino   = clinoItems.filter(c => c.date === selectedDate)
    .sort((a,b)=>(a.heure||'').localeCompare(b.heure||''));
  const dayPlanning = planningItems.filter(p => p.date === selectedDate)
    .sort((a,b)=>(a.heure_debut||'').localeCompare(b.heure_debut||''));

  const total = dayClino.length + dayPlanning.length;

  // Build merged timeline
  const timeline = [
    ...dayPlanning.map(p=>({ time: p.heure_debut||'00:00', type:'planning', data:p })),
    ...dayClino.map(c=>({ time: c.heure||'00:00', type:'clino', data:c })),
  ].sort((a,b)=>a.time.localeCompare(b.time));

  return (
    <div style={{ width: 300, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', color: '#fff' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          📅 Programme du {format(parseISO(selectedDate), 'd MMMM yyyy', { locale: fr })}
        </div>
        <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>{total} intervention(s)</div>
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {timeline.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, marginTop: 30 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
            Aucune intervention ce jour
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Vertical line */}
            <div style={{ position: 'absolute', left: 32, top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 4 }}>
              {timeline.map((item, i) => {
                const isC = item.type === 'clino';
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {/* Time bubble */}
                    <div style={{
                      width: 56, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0,
                      background: isC ? '#e0f2fe' : '#dcfce7',
                      color: isC ? '#0284c7' : '#059669',
                      border: `2px solid ${isC ? '#0ea5e9' : '#22c55e'}`,
                      zIndex: 1,
                    }}>
                      {item.time.slice(0,5)}
                    </div>
                    {/* Card */}
                    <div style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8,
                      background: isC ? '#f0f9ff' : '#f0fdf4',
                      border: `1px solid ${isC ? '#bae6fd' : '#bbf7d0'}`,
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: isC ? '#0284c7' : '#059669' }}>
                        {isC ? '🚗 Clino' : '📋 Intervention'}
                      </div>
                      {isC ? (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{item.data.adresse}</div>
                          {item.data.medecin_full && <div style={{ fontSize: 11, color: 'var(--text-2)' }}>👨‍⚕️ {item.data.medecin_full}</div>}
                          {item.data.commentaire && <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>{item.data.commentaire}</div>}
                        </>
                      ) : (
                        <>
                          {item.data.titre && <div style={{ fontSize: 12, fontWeight: 600 }}>{item.data.titre}</div>}
                          {item.data.medecin_nom && <div style={{ fontSize: 11, color: 'var(--text-2)' }}>👨‍⚕️ {item.data.medecin_nom}</div>}
                          {item.data.technicien_nom && <div style={{ fontSize: 11, color: 'var(--text-2)' }}>🔧 {item.data.technicien_nom}</div>}
                          {item.data.adresse && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>📍 {item.data.adresse}</div>}
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
            + Ajouter Clino pour ce jour
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
  const [modal,       setModal]       = useState(null);
  const [confirm,     setConfirm]     = useState(null);
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const [selectedDate,setSelectedDate]= useState(format(new Date(),'yyyy-MM-dd'));
  const [activeTab,   setActiveTab]   = useState('list'); // 'list'|'programme'

  const load = useCallback(async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        axios.get('/api/clino'),
        axios.get('/api/planning'),
      ]);
      setItems(cRes.data);
      setPlanning(pRes.data);
    } catch { toast('Erreur chargement', 'error'); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const off = on('planning_refresh', () => load());
    return () => off?.();
  }, [on, load]);

  useEffect(() => {
    if (isAdmin) axios.get('/api/users/by-role/medecin').then(r => setMedecins(r.data));
  }, [isAdmin]);

  async function handleDelete(id) {
    try { await axios.delete(`/api/clino/${id}`); setConfirm(null); load(); toast('Supprimé', 'success'); }
    catch { toast('Erreur', 'error'); }
  }

  const filtered = items.filter(it =>
    (it.adresse||'').toLowerCase().includes(search.toLowerCase()) ||
    (it.medecin_full||it.medecin_nom||'').toLowerCase().includes(search.toLowerCase())
  );

  // Group by date for programme view
  const allDates = [...new Set([
    ...items.map(i=>i.date),
    ...planning.map(p=>p.date),
  ])].filter(Boolean).sort().reverse();

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ fontSize:18, fontWeight:700 }}>🚗 Clino Mobile</h2>
          <p style={{ fontSize:12, color:'var(--text-2)' }}>Interventions à domicile & planning journalier</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          {/* Tab switcher */}
          <div style={{ display:'flex', gap:2, background:'var(--bg)', borderRadius:8, padding:3 }}>
            {[['list','📋 Liste'],['programme','📅 Programme jour']].map(([v,l])=>(
              <button key={v} className={`btn btn-sm ${activeTab===v?'btn-primary':'btn-ghost'}`}
                onClick={()=>setActiveTab(v)} style={{padding:'4px 10px',fontSize:12}}>{l}</button>
            ))}
          </div>
          {isAdmin && <button className="btn btn-primary btn-sm" onClick={()=>setModal({})}>+ Intervention</button>}
        </div>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* Main content */}
        <div style={{ flex:1, overflowY:'auto', padding:20 }}>
          {activeTab === 'list' && (
            <>
              <div style={{ marginBottom:14, maxWidth:380 }}>
                <input className="input" placeholder="🔍 Rechercher par adresse ou médecin..." value={search} onChange={e=>setSearch(e.target.value)}/>
              </div>
              {loading ? <div className="loading-center"><div className="spinner"/></div>
              : filtered.length===0 ? <div className="empty-state"><div className="empty-icon">🚗</div><p>Aucune intervention</p></div>
              : <div className="table-wrap"><table>
                  <thead><tr>
                    <th>Date</th><th>Heure</th><th>Adresse</th>
                    <th>Médecin</th><th>Commentaire</th>
                    {isAdmin&&<th>Actions</th>}
                  </tr></thead>
                  <tbody>
                    {filtered.map(it=>(
                      <tr key={it.id}>
                        <td style={{whiteSpace:'nowrap',fontWeight:600}}>
                          {it.date ? format(parseISO(it.date),'dd/MM/yyyy') : '—'}
                        </td>
                        <td>{it.heure?.slice(0,5)||'—'}</td>
                        <td>{it.adresse}</td>
                        <td>{it.medecin_full||it.medecin_nom||'—'}</td>
                        <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text-2)',fontSize:13}}>
                          {it.commentaire||'—'}
                        </td>
                        {isAdmin&&<td>
                          <div style={{display:'flex',gap:4}}>
                            <button className="btn btn-outline btn-sm" onClick={()=>setModal(it)}>✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={()=>setConfirm(it.id)}>🗑</button>
                          </div>
                        </td>}
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              }
            </>
          )}

          {activeTab === 'programme' && (
            <div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:13, fontWeight:600, color:'var(--text-2)', marginRight:10 }}>Sélectionner une date :</label>
                <input className="input" type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
                  style={{ display:'inline-block', width:'auto' }}/>
              </div>
              {/* Date quick-select pills */}
              {allDates.length>0 && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
                  {allDates.slice(0,14).map(d=>{
                    const count = items.filter(i=>i.date===d).length + planning.filter(p=>p.date===d).length;
                    const isToday = d===format(new Date(),'yyyy-MM-dd');
                    return(
                      <button key={d} onClick={()=>setSelectedDate(d)}
                        className={`btn btn-sm ${selectedDate===d?'btn-primary':'btn-outline'}`}
                        style={{fontSize:12}}>
                        {isToday?'Aujourd\'hui':format(parseISO(d),'dd/MM',{locale:fr})}
                        {count>0&&<span style={{marginLeft:4,background:'rgba(255,255,255,.3)',borderRadius:10,padding:'0 5px',fontSize:10}}>{count}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              <p style={{ fontSize:13, color:'var(--text-2)' }}>
                Sélectionnez une date pour voir le programme détaillé à droite →
              </p>
            </div>
          )}
        </div>

        {/* Daily program panel (visible in programme tab or always as sidebar) */}
        {(activeTab==='programme' || activeTab==='list') && selectedDate && (
          <DailyProgram
            selectedDate={selectedDate}
            clinoItems={items}
            planningItems={planning}
            isAdmin={isAdmin}
            onAddClino={()=>setModal({ date: selectedDate })}
          />
        )}
      </div>

      {modal!==null&&<ClinoModal item={modal?.id?modal:modal?.date?{date:modal.date}:null} medecins={medecins}
        onSave={()=>{setModal(null);load();toast('Enregistré','success');}} onClose={()=>setModal(null)}/>}
      {confirm&&<ConfirmDialog title="Supprimer?" message="Action irréversible." danger
        onConfirm={()=>handleDelete(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
