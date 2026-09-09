import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  format, startOfWeek, addDays, addWeeks, subWeeks,
  startOfMonth, endOfMonth, eachDayOfInterval, endOfWeek,
  isSameMonth, isToday as isTodayFn, addMonths, subMonths, parseISO,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth }   from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AddressAutocomplete from '../components/AddressAutocomplete';
import NavigationSelector from '../components/NavigationSelector';
import SignaturePadModal from '../components/SignaturePadModal';

const DAYS_FR = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

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

// Clino Mobile event color (distinct from planning/calendar)
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

/* ── Planning modal ─────────────────────────────────────────── */
function PlanningModal({ event, medecins, techniciens, onSave, onClose }) {
  const init = event || {};
  const [f, setF] = useState({
    titre: init.titre||'', date: toRaw(init.date)||'',
    heure_debut: init.heure_debut||'', heure_fin: init.heure_fin||'',
    adresse: init.adresse||'', medecin_id: init.medecin_id||'', technicien_id: init.technicien_id||'',
  });
  const [saving, setSaving] = useState(false);
  const s = (k,v) => setF(p=>({...p,[k]:v}));
  async function save() {
    if (!f.date) return;
    setSaving(true);
    try {
      if (init.id) await axios.put(`/api/planning/${init.id}`, f);
      else         await axios.post('/api/planning', f);
      onSave();
    } catch(e){ alert(e.response?.data?.message||'Erreur'); }
    finally { setSaving(false); }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>{init.id ? '✏️ Modifier le programme' : '➕ Nouveau programme'}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group"><label>Titre du programme</label>
            <input className="input" placeholder="Titre (ex: Visite médicale, Consultation...)" value={f.titre} onChange={e=>s('titre',e.target.value)}/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="form-group"><label>Date *</label>
              <input className="input" type="date" value={f.date} onChange={e=>s('date',e.target.value)} required/></div>
            <div className="form-group"><label>Adresse / Lieu</label>
              <AddressAutocomplete value={f.adresse} onChange={v=>s('adresse',v)} placeholder="Adresse du programme" /></div>
            <div className="form-group"><label>Heure début</label>
              <input className="input" type="time" value={f.heure_debut} onChange={e=>s('heure_debut',e.target.value)}/></div>
            <div className="form-group"><label>Heure fin</label>
              <input className="input" type="time" value={f.heure_fin} onChange={e=>s('heure_fin',e.target.value)}/></div>
          </div>
          <div className="form-group"><label>Médecin (optionnel)</label>
            <select className="input" value={f.medecin_id} onChange={e=>s('medecin_id',e.target.value)}>
              <option value="">— Aucun médecin (Optionnel) —</option>
              {medecins?.map(m=><option key={m.id} value={m.id}>👨‍⚕️ Dr. {m.prenom} {m.nom}</option>)}
            </select></div>
          <div className="form-group"><label>Technicien (optionnel)</label>
            <select className="input" value={f.technicien_id} onChange={e=>s('technicien_id',e.target.value)}>
              <option value="">— Aucun technicien (Optionnel) —</option>
              {techniciens?.map(t=><option key={t.id} value={t.id}>🔧 {t.prenom} {t.nom}</option>)}
            </select></div>
          {!init.id && <div style={{padding:'8px 12px',background:'#e0f2fe',borderRadius:8,fontSize:12,color:'#0284c7'}}>
            📧 Notification email envoyée à tous les utilisateurs.</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save} disabled={saving||!f.date}>
            {saving?<span className="spinner" style={{width:16,height:16}}/>:'💾 Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Event (calendar) modal ─────────────────────────────────── */
function EventModal({ event, onSave, onClose }) {
  const init = event || {};
  const [f, setF] = useState({
    titre: init.titre||'', type: init.type||'ponctuel',
    date_debut: init.date_debut?.slice(0,16)||'', date_fin: init.date_fin?.slice(0,16)||'',
    lieu: init.lieu||'', recurrence: init.recurrence||'none',
  });
  const [saving, setSaving] = useState(false);
  const s = (k,v) => setF(p=>({...p,[k]:v}));
  async function save() {
    if (!f.titre||!f.date_debut) return;
    setSaving(true);
    try {
      if (init.id) await axios.put(`/api/events/${init.id}`, f);
      else         await axios.post('/api/events', f);
      onSave();
    } catch(e){ alert(e.response?.data?.message||'Erreur'); }
    finally { setSaving(false); }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>{init.id?'✏️ Modifier l\'événement':'➕ Nouvel événement'}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group"><label>Titre *</label>
            <input className="input" placeholder="Titre de l'événement" value={f.titre} onChange={e=>s('titre',e.target.value)} required/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="form-group"><label>Type</label>
              <select className="input" value={f.type} onChange={e=>s('type',e.target.value)}>
                <option value="ponctuel">Ponctuel</option>
                <option value="reunion">Réunion</option>
                <option value="formation">Formation</option>
                <option value="conges">Congés</option>
                <option value="autre">Autre</option>
              </select></div>
            <div className="form-group"><label>Récurrence</label>
              <select className="input" value={f.recurrence} onChange={e=>s('recurrence',e.target.value)}>
                <option value="none">Aucune</option>
                <option value="daily">Quotidienne</option>
                <option value="weekly">Hebdomadaire</option>
                <option value="monthly">Mensuelle</option>
              </select></div>
            <div className="form-group"><label>Date début *</label>
              <input className="input" type="datetime-local" value={f.date_debut} onChange={e=>s('date_debut',e.target.value)} required/></div>
            <div className="form-group"><label>Date fin</label>
              <input className="input" type="datetime-local" value={f.date_fin} onChange={e=>s('date_fin',e.target.value)}/></div>
          </div>
          <div className="form-group"><label>Lieu / Adresse</label>
            <AddressAutocomplete value={f.lieu} onChange={v=>s('lieu',v)} placeholder="Lieu de l'événement" /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save} disabled={saving||!f.titre||!f.date_debut}>
            {saving?<span className="spinner" style={{width:16,height:16}}/>:'💾 Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Today banner ────────────────────────────────────────────── */
function TodayBanner({ pe, ce, cl = [] }) {
  const today = format(new Date(),'yyyy-MM-dd');
  const tp = pe.filter(e=>e.date===today).sort((a,b)=>(a.heure_debut||'').localeCompare(b.heure_debut||''));
  const tc = ce.filter(e=>e.date_debut?.slice(0,10)===today);
  const tcl = cl.filter(e=>e.date===today);
  if (!tp.length && !tc.length && !tcl.length) return null;
  return (
    <div style={{padding:'9px 20px',background:'linear-gradient(90deg,#0ea5e9,#10b981)',color:'#fff',display:'flex',alignItems:'center',gap:10,flexShrink:0,flexWrap:'wrap'}}>
      <span style={{fontWeight:700,fontSize:13}}>📅 Aujourd'hui</span>
      {tp.map(e=>(
        <span key={'tp'+e.id} style={{background:'rgba(255,255,255,.2)',padding:'2px 10px',borderRadius:20,fontSize:12}}>
          📋 {e.heure_debut?e.heure_debut+' ':''}{e.titre||'Programme'}{e.medecin_nom?' · '+e.medecin_nom:''}{e.technicien_nom?' · 🔧 '+e.technicien_nom:''}
        </span>
      ))}
      {tc.map(e=>(
        <span key={'tc'+e.id} style={{background:'rgba(255,255,255,.2)',padding:'2px 10px',borderRadius:20,fontSize:12}}>
          📅 {e.titre}{e.lieu?' · '+e.lieu:''}
        </span>
      ))}
      {tcl.map(e=>(
        <span key={'tcl'+e.id} style={{background:'rgba(255,255,255,.25)',padding:'2px 10px',borderRadius:20,fontSize:12,border:'1px solid rgba(255,255,255,.4)'}}>
          🚗 Clino {e.heure?String(e.heure).slice(0,5)+' ':''}{e.medecin_nom?' · '+e.medecin_nom:''}{e.technicien_nom?' · 🔧 '+e.technicien_nom:''}{e.adresse?' · '+e.adresse:''}
        </span>
      ))}
    </div>
  );
}

/* ── WEEK view ───────────────────────────────────────────────── */
function WeekView({weekStart,pe,ce,cl = [],isAdmin,medecins,techniciens,onRefresh,toast,onSign}){
  const weekEnd=addDays(weekStart,6);
  const [modal,setModal]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const days=Array.from({length:7},(_,i)=>{
    const d=addDays(weekStart,i); const key=format(d,'yyyy-MM-dd');
    return {
      d,
      label:DAYS_FR[i],
      key,
      pEvts:pe.filter(e=>e.date===key),
      cEvts:ce.filter(e=>e.date_debut?.slice(0,10)===key),
      clEvts:cl.filter(e=>e.date===key),
    };
  });
  async function del(item){
    try{
      const type = item._t || item.t;
      if(type === 'p') await axios.delete(`/api/planning/${item.id}`);
      else if(type === 'cl' || type === 'clino') await axios.delete(`/api/clino/${item.id}`);
      else await axios.delete(`/api/events/${item.id}`);
      onRefresh(); toast('Supprimé avec succès','success');
    }catch(err){
      console.error(err);
      toast('Erreur lors de la suppression','error');
    }finally{
      setConfirm(null);
    }
  }
  return (<>
    <div style={{flex:1,overflowX:'auto',overflowY:'auto'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(150px,1fr))',minWidth:1050,height:'100%'}}>
        {days.map(({d,label,key,pEvts,cEvts,clEvts})=>(
          <div key={key} style={{borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)',background:isTodayFn(d)?'#fff7ed':'var(--surface)',position:'sticky',top:0,zIndex:1}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase'}}>{label}</div>
              <div style={{fontSize:20,fontWeight:800,color:isTodayFn(d)?'var(--warn)':'var(--text)'}}>{format(d,'d')}</div>
              {(pEvts.length+cEvts.length+clEvts.length)>0&&<div style={{fontSize:10,color:'var(--text-3)'}}>{pEvts.length+cEvts.length+clEvts.length} item(s)</div>}
            </div>
            <div style={{flex:1,padding:6,display:'flex',flexDirection:'column',gap:4,overflowY:'auto'}}>
              {pEvts.map(ev=>(
                <div key={'p'+ev.id} onClick={()=>isAdmin&&setModal({t:'p',data:ev})}
                  style={{background:'#e0f2fe',borderRadius:8,padding:'7px 9px',borderLeft:'3px solid #0ea5e9',cursor:isAdmin?'pointer':'default'}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#0284c7'}}>📋 {ev.heure_debut?ev.heure_debut+' ':''}{ev.titre||'Programme'}</div>
                  {ev.medecin_nom&&<div style={{fontSize:10,color:'var(--text-2)'}}>👨‍⚕️ {ev.medecin_nom}</div>}
                  {ev.technicien_nom&&<div style={{fontSize:10,color:'var(--text-2)'}}>🔧 {ev.technicien_nom}</div>}
                  {ev.adresse&&<MapLink addr={ev.adresse} style={{fontSize:10}}/>}
                  <div style={{display:'flex',gap:4,marginTop:3,alignItems:'center'}}>
                    <button className="btn btn-ghost" style={{padding:'1px 5px',fontSize:10,color:'#0284c7',fontWeight:600}}
                      title="Valider & Signer sur site" onClick={e=>{e.stopPropagation();onSign?.(ev);}}>✍️ Signer</button>
                    {isAdmin&&<button className="btn btn-ghost" style={{padding:'1px 4px',fontSize:10,color:'var(--danger)',marginLeft:'auto'}}
                      onClick={e=>{e.stopPropagation();setConfirm({_t:'p',t:'p',id:ev.id,titre:ev.titre});}}>✕</button>}
                  </div>
                </div>
              ))}
              {clEvts.map(ev=>(
                <div key={'cl'+ev.id}
                  style={{background:CLINO_COLOR.bg,borderRadius:8,padding:'7px 9px',borderLeft:`3px solid ${CLINO_COLOR.border}`}}>
                  <div style={{fontSize:11,fontWeight:700,color:CLINO_COLOR.text}}>🚗 Clino Mobile {ev.heure?String(ev.heure).slice(0,5):''}</div>
                  {ev.medecin_nom&&<div style={{fontSize:10,color:'var(--text-2)'}}>👨‍⚕️ {ev.medecin_nom}</div>}
                  {ev.technicien_nom&&<div style={{fontSize:10,color:'var(--text-2)'}}>🔧 {ev.technicien_nom}</div>}
                  {ev.adresse&&<MapLink addr={ev.adresse} style={{fontSize:10}}/>}
                  {ev.commentaire&&<div style={{fontSize:9,color:'var(--text-3)',fontStyle:'italic',marginTop:2}}>{ev.commentaire}</div>}
                  <div style={{display:'flex',gap:4,marginTop:3,alignItems:'center'}}>
                    <button className="btn btn-ghost" style={{padding:'1px 5px',fontSize:10,color:'#059669',fontWeight:600}}
                      title="Valider & Signer sur site" onClick={e=>{e.stopPropagation();onSign?.(ev);}}>✍️ Signer</button>
                    {isAdmin&&<button className="btn btn-ghost" style={{padding:'1px 4px',fontSize:10,color:'var(--danger)',marginLeft:'auto'}}
                      onClick={e=>{e.stopPropagation();setConfirm({_t:'cl',t:'cl',id:ev.id,titre:'Clino Mobile '+(ev.medecin_nom||'')});}}>✕</button>}
                  </div>
                </div>
              ))}
              {cEvts.map(ev=>{const c=TYPE_COLORS[ev.type]||TYPE_COLORS.autre; return(
                <div key={'c'+ev.id} onClick={()=>isAdmin&&setModal({t:'e',data:ev})}
                  style={{background:c.bg,borderRadius:8,padding:'7px 9px',borderLeft:`3px solid ${c.border}`,cursor:isAdmin?'pointer':'default'}}>
                  <div style={{fontSize:11,fontWeight:700,color:c.text}}>📅 {ev.titre}</div>
                  {ev.lieu&&<MapLink addr={ev.lieu} style={{fontSize:10}}/>}
                  {isAdmin&&<button className="btn btn-ghost" style={{padding:'1px 4px',fontSize:10,color:'var(--danger)',marginTop:2}}
                    onClick={e=>{e.stopPropagation();setConfirm({_t:'e',t:'e',id:ev.id,titre:ev.titre});}}>✕</button>}
                </div>
              );})}
              {isAdmin&&(
                <div style={{display:'flex',gap:3}}>
                  <button className="btn btn-ghost" style={{fontSize:10,opacity:.5,padding:'2px 5px'}}
                    onClick={()=>setModal({t:'p',data:{date:key}})}>+ Prog.</button>
                  <button className="btn btn-ghost" style={{fontSize:10,opacity:.5,padding:'2px 5px'}}
                    onClick={()=>setModal({t:'e',data:{date_debut:key+'T08:00'}})}>+ Évén.</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
    {modal?.t==='p'&&<PlanningModal event={modal.data} medecins={medecins} techniciens={techniciens}
      onSave={()=>{setModal(null);onRefresh();toast('Enregistré ✓','success');}} onClose={()=>setModal(null)}/>}
    {modal?.t==='e'&&<EventModal event={modal.data}
      onSave={()=>{setModal(null);onRefresh();toast('Enregistré ✓','success');}} onClose={()=>setModal(null)}/>}
    {confirm&&<ConfirmDialog title="Supprimer?" message={confirm.titre ? `Supprimer "${confirm.titre}" ? Action irréversible.` : "Action irréversible."} danger
      onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
  </>);
}

/* ── MONTH view ─────────────────────────────────────────────── */
function MonthView({current,pe,ce,cl = [],isAdmin,medecins,techniciens,onRefresh,toast,onSign}){
  const [selected,setSelected]=useState(null);
  const [modal,setModal]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const days=eachDayOfInterval({
    start:startOfWeek(startOfMonth(current),{weekStartsOn:1}),
    end:  endOfWeek(endOfMonth(current),{weekStartsOn:1}),
  });
  const gp=d=>pe.filter(e=>e.date===format(d,'yyyy-MM-dd'));
  const gc=d=>ce.filter(e=>e.date_debut?.slice(0,10)===format(d,'yyyy-MM-dd'));
  const gcl=d=>cl.filter(e=>e.date===format(d,'yyyy-MM-dd'));
  const sp=selected?pe.filter(e=>e.date===selected):[];
  const sc=selected?ce.filter(e=>e.date_debut?.slice(0,10)===selected):[];
  const scl=selected?cl.filter(e=>e.date===selected):[];
  async function del(item){
    try{
      const type = item._t || item.t;
      if(type==='p') await axios.delete(`/api/planning/${item.id}`);
      else if(type==='cl'||type==='clino') await axios.delete(`/api/clino/${item.id}`);
      else await axios.delete(`/api/events/${item.id}`);
      onRefresh(); toast('Supprimé avec succès','success');
    }catch(err){
      console.error(err);
      toast('Erreur lors de la suppression','error');
    }finally{
      setConfirm(null);
    }
  }
  return(
    <div style={{flex:1,display:'flex',overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto',padding:12}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:4}}>
          {DAYS_FR.map(d=><div key={d} style={{textAlign:'center',fontSize:11,fontWeight:700,color:'var(--text-3)',padding:'4px 0',textTransform:'uppercase'}}>{d}</div>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3}}>
          {days.map(day=>{
            const key=format(day,'yyyy-MM-dd');
            const pEvts=gp(day); const cEvts=gc(day); const clEvts=gcl(day);
            const total=pEvts.length+cEvts.length+clEvts.length;
            const today=isTodayFn(day); const sel=selected===key; const inMon=isSameMonth(day,current);
            return(
              <div key={key} onClick={()=>setSelected(sel?null:key)} style={{
                minHeight:72,padding:5,borderRadius:8,cursor:'pointer',
                background:sel?'var(--primary-lt)':today?'#fff7ed':'var(--surface)',
                border:`1px solid ${sel?'var(--primary)':today?'var(--warn)':'var(--border)'}`,
                opacity:inMon?1:.4,transition:'all .1s',
              }}>
                <div style={{fontSize:12,fontWeight:today?800:500,color:today?'var(--warn)':'var(--text)',marginBottom:2}}>{format(day,'d')}</div>
                {pEvts.slice(0,1).map(ev=>(
                  <div key={'p'+ev.id} style={{fontSize:10,padding:'1px 4px',borderRadius:3,background:'#e0f2fe',color:'#0284c7',fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',borderLeft:'2px solid #0ea5e9',marginBottom:2}}>
                    📋 {ev.titre||'Programme'}
                  </div>
                ))}
                {clEvts.slice(0,1).map(ev=>(
                  <div key={'cl'+ev.id} style={{fontSize:10,padding:'1px 4px',borderRadius:3,background:CLINO_COLOR.bg,color:CLINO_COLOR.text,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',borderLeft:`2px solid ${CLINO_COLOR.border}`,marginBottom:2}}>
                    🚗 Clino {ev.medecin_nom||''}
                  </div>
                ))}
                {cEvts.slice(0,1).map(ev=>{const c=TYPE_COLORS[ev.type]||TYPE_COLORS.autre;return(
                  <div key={'c'+ev.id} style={{fontSize:10,padding:'1px 4px',borderRadius:3,background:c.bg,color:c.text,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',borderLeft:`2px solid ${c.border}`,marginBottom:2}}>
                    {ev.titre}
                  </div>
                );})}
                {total>2&&<div style={{fontSize:9,color:'var(--text-3)'}}>+{total-2}</div>}
              </div>
            );
          })}
        </div>
      </div>
      {selected&&(
        <div style={{width:290,borderLeft:'1px solid var(--border)',padding:14,overflowY:'auto',background:'var(--surface)',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <span style={{fontWeight:700,fontSize:14}}>{format(parseISO(selected),'d MMMM yyyy',{locale:fr})}</span>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setSelected(null)}>✕</button>
          </div>
          {sp.length===0&&sc.length===0&&scl.length===0&&<p style={{fontSize:13,color:'var(--text-3)',textAlign:'center',marginTop:20}}>Aucun événement</p>}
          {sp.map(ev=>(
            <div key={'sp'+ev.id} style={{background:'#e0f2fe',borderRadius:8,padding:'10px 12px',borderLeft:'3px solid #0ea5e9',marginBottom:8}}>
              <div style={{fontWeight:600,fontSize:13,color:'#0284c7'}}>📋 {ev.titre||'Programme'}</div>
              {ev.heure_debut&&<div style={{fontSize:11,color:'var(--text-2)'}}>⏰ {ev.heure_debut}{ev.heure_fin?' → '+ev.heure_fin:''}</div>}
              {ev.medecin_nom&&<div style={{fontSize:11,color:'var(--text-2)'}}>👨‍⚕️ {ev.medecin_nom}</div>}
              {ev.technicien_nom&&<div style={{fontSize:11,color:'var(--text-2)'}}>🔧 {ev.technicien_nom}</div>}
              {ev.adresse&&<MapLink addr={ev.adresse} style={{fontSize:11}}/>}
              <div style={{display:'flex',gap:4,marginTop:6,alignItems:'center',flexWrap:'wrap'}}>
                <button className="btn btn-ghost btn-sm" style={{fontSize:11,color:'#0284c7',fontWeight:600}} onClick={()=>onSign?.(ev)}>✍️ Signer</button>
                {isAdmin&&<>
                  <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>setModal({t:'p',data:ev})}>✏️</button>
                  <button className="btn btn-danger btn-sm" style={{fontSize:11}} onClick={()=>setConfirm({...ev,_t:'p',t:'p'})}>🗑</button>
                </>}
              </div>
            </div>
          ))}
          {scl.map(ev=>(
            <div key={'scl'+ev.id} style={{background:CLINO_COLOR.bg,borderRadius:8,padding:'10px 12px',borderLeft:`3px solid ${CLINO_COLOR.border}`,marginBottom:8}}>
              <div style={{fontWeight:600,fontSize:13,color:CLINO_COLOR.text}}>🚗 Clino Mobile</div>
              {ev.heure&&<div style={{fontSize:11,color:'var(--text-2)'}}>⏰ {String(ev.heure).slice(0,5)}</div>}
              {ev.medecin_nom&&<div style={{fontSize:11,color:'var(--text-2)'}}>👨‍⚕️ {ev.medecin_nom}</div>}
              {ev.technicien_nom&&<div style={{fontSize:11,color:'var(--text-2)'}}>🔧 {ev.technicien_nom}</div>}
              {ev.adresse&&<MapLink addr={ev.adresse} style={{fontSize:11}}/>}
              {ev.commentaire&&<div style={{fontSize:11,color:'var(--text-3)',marginTop:3}}>{ev.commentaire}</div>}
              <div style={{display:'flex',gap:4,marginTop:6,alignItems:'center',flexWrap:'wrap'}}>
                <button className="btn btn-ghost btn-sm" style={{fontSize:11,color:'#059669',fontWeight:600}} onClick={()=>onSign?.(ev)}>✍️ Signer</button>
                {isAdmin&&<button className="btn btn-danger btn-sm" style={{fontSize:11}} onClick={()=>setConfirm({...ev,_t:'cl',t:'cl'})}>🗑</button>}
              </div>
            </div>
          ))}
          {sc.map(ev=>{const c=TYPE_COLORS[ev.type]||TYPE_COLORS.autre;return(
            <div key={'sc'+ev.id} style={{background:c.bg,borderRadius:8,padding:'10px 12px',borderLeft:`3px solid ${c.border}`,marginBottom:8}}>
              <div style={{fontWeight:600,fontSize:13,color:c.text}}>📅 {ev.titre}</div>
              <div style={{fontSize:11,color:'var(--text-2)',display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
                🕐 {format(parseISO(ev.date_debut),'HH:mm',{locale:fr})}
                {ev.lieu&&<MapLink addr={ev.lieu} style={{fontSize:11}}/>}
              </div>
              {isAdmin&&<div style={{display:'flex',gap:4,marginTop:6}}>
                <button className="btn btn-outline btn-sm" style={{fontSize:11}} onClick={()=>setModal({t:'e',data:ev})}>✏️</button>
                <button className="btn btn-danger btn-sm" style={{fontSize:11}} onClick={()=>setConfirm({...ev,_t:'e',t:'e'})}>🗑</button>
              </div>}
            </div>
          );})}
          {isAdmin&&<div style={{display:'flex',gap:6,marginTop:8}}>
            <button className="btn btn-primary btn-sm" style={{flex:1,fontSize:12}} onClick={()=>setModal({t:'p',data:{date:selected}})}>+ Prog.</button>
            <button className="btn btn-outline btn-sm" style={{flex:1,fontSize:12}} onClick={()=>setModal({t:'e',data:{date_debut:selected+'T08:00'}})}>+ Évén.</button>
          </div>}
        </div>
      )}
      {modal?.t==='p'&&<PlanningModal event={modal.data} medecins={medecins} techniciens={techniciens}
        onSave={()=>{setModal(null);onRefresh();toast('Enregistré ✓','success');}} onClose={()=>setModal(null)}/>}
      {modal?.t==='e'&&<EventModal event={modal.data}
        onSave={()=>{setModal(null);onRefresh();toast('Enregistré ✓','success');}} onClose={()=>setModal(null)}/>}
      {confirm&&<ConfirmDialog title="Supprimer?" message={confirm.titre ? `Supprimer "${confirm.titre}" ? Action irréversible.` : "Action irréversible."} danger
        onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

/* ── LIST view ───────────────────────────────────────────────── */
function ListView({pe,ce,cl = [],isAdmin,medecins,techniciens,onRefresh,toast,onSign}){
  const [modal,setModal]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const all=[
    ...pe.map(e=>({...e,_t:'p',t:'p'})),
    ...ce.map(e=>({...e,_t:'e',t:'e',date:e.date_debut?.slice(0,10)})),
    ...cl.map(e=>({...e,_t:'cl',t:'cl',titre:'Clino Mobile ' + (e.medecin_nom || '')})),
  ].sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  async function del(item){
    try{
      const type = item._t || item.t;
      if(type==='p') await axios.delete(`/api/planning/${item.id}`);
      else if(type==='cl'||type==='clino') await axios.delete(`/api/clino/${item.id}`);
      else await axios.delete(`/api/events/${item.id}`);
      onRefresh(); toast('Supprimé avec succès','success');
    }catch(err){
      console.error(err);
      toast('Erreur lors de la suppression','error');
    }finally{
      setConfirm(null);
    }
  }
  return(
    <div style={{flex:1,overflowY:'auto',padding:20}}>
      {all.length===0
        ?<div className="empty-state"><div className="empty-icon">📋</div><p>Aucun événement</p></div>
        :<div className="table-wrap"><table>
          <thead><tr>
            <th>Type</th><th>Titre</th><th>Date</th><th>Horaire</th>
            <th>Médecin / Lieu</th><th>Technicien / Adresse</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            {all.map(ev=>{
              if(ev._t==='p') return(
                <tr key={'p'+ev.id}>
                  <td><span className="badge badge-blue">📋 Programme</span></td>
                  <td style={{fontWeight:600}}>{ev.titre||'—'}</td>
                  <td>{fmtDisplay(ev.date)}</td>
                  <td>{ev.heure_debut?`${ev.heure_debut}${ev.heure_fin?' → '+ev.heure_fin:''}`:'—'}</td>
                  <td>{ev.medecin_nom||'—'}</td>
                  <td>{ev.technicien_nom||'—'}{ev.adresse&&<MapLink addr={ev.adresse} style={{fontSize:11,display:'block',marginTop:2}}/>}</td>
                  <td><div style={{display:'flex',gap:4}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11,color:'#0284c7'}} title="Valider & Signer" onClick={()=>onSign?.(ev)}>✍️</button>
                    {isAdmin&&<>
                      <button className="btn btn-outline btn-sm" onClick={()=>setModal({t:'p',data:ev})}>✏️</button>
                      <button className="btn btn-danger btn-sm" onClick={()=>setConfirm(ev)}>🗑</button>
                    </>}
                  </div></td>
                </tr>
              );
              if(ev._t==='cl') return(
                <tr key={'cl'+ev.id}>
                  <td><span className="badge badge-green" style={{background:CLINO_COLOR.bg,color:CLINO_COLOR.text,border:`1px solid ${CLINO_COLOR.border}`}}>🚗 Clino Mobile</span></td>
                  <td style={{fontWeight:600}}>Programme Clino Mobile</td>
                  <td>{fmtDisplay(ev.date)}</td>
                  <td>{ev.heure?String(ev.heure).slice(0,5):'—'}</td>
                  <td>{ev.medecin_nom||'—'}</td>
                  <td>{ev.adresse&&<MapLink addr={ev.adresse} style={{fontSize:11,display:'block'}}/>}{ev.commentaire&&<small style={{color:'var(--text-3)'}}>{ev.commentaire}</small>}</td>
                  <td><div style={{display:'flex',gap:4}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11,color:'#059669'}} title="Valider & Signer" onClick={()=>onSign?.(ev)}>✍️</button>
                    {isAdmin&&<button className="btn btn-danger btn-sm" onClick={()=>setConfirm(ev)}>🗑</button>}
                  </div></td>
                </tr>
              );
              const c=TYPE_COLORS[ev.type]||TYPE_COLORS.autre;
              return(
                <tr key={'e'+ev.id}>
                  <td><span className="badge" style={{background:c.bg,color:c.text}}>📅 {ev.type}</span></td>
                  <td style={{fontWeight:600}}>{ev.titre}</td>
                  <td>{fmtDisplay(ev.date_debut?.slice(0,10))}</td>
                  <td>{ev.date_debut?format(parseISO(ev.date_debut),'HH:mm',{locale:fr}):'—'}</td>
                  <td>{ev.lieu?<MapLink addr={ev.lieu} style={{fontSize:12}}/>:'—'}</td><td>—</td>
                  <td><div style={{display:'flex',gap:4}}>
                    {isAdmin&&<>
                      <button className="btn btn-outline btn-sm" onClick={()=>setModal({t:'e',data:ev})}>✏️</button>
                      <button className="btn btn-danger btn-sm" onClick={()=>setConfirm(ev)}>🗑</button>
                    </>}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      }
      {modal?.t==='p'&&<PlanningModal event={modal.data} medecins={medecins} techniciens={techniciens}
        onSave={()=>{setModal(null);onRefresh();toast('Enregistré ✓','success');}} onClose={()=>setModal(null)}/>}
      {modal?.t==='e'&&<EventModal event={modal.data}
        onSave={()=>{setModal(null);onRefresh();toast('Enregistré ✓','success');}} onClose={()=>setModal(null)}/>}
      {confirm&&<ConfirmDialog title="Supprimer?" message={confirm.titre ? `Supprimer "${confirm.titre}" ? Action irréversible.` : "Action irréversible."} danger
        onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

/* ── MAIN ────────────────────────────────────────────────────── */
export default function Planning({ toast }) {
  const { user } = useAuth();
  const { on }   = useSocket();
  const isAdmin  = user?.role==='administrateur';

  const [view,      setView]     = useState('week');
  const [weekStart, setWeekStart]= useState(startOfWeek(new Date(),{weekStartsOn:1}));
  const [monthDate, setMonthDate]= useState(new Date());
  const [pe,  setPe]  = useState([]);
  const [ce,  setCe]  = useState([]);
  const [cl,  setCl]  = useState([]); // clino mobile events
  const [med, setMed] = useState([]);
  const [tec, setTec] = useState([]);
  const [ents, setEnts] = useState([]);
  const [modal, setModal] = useState(null);
  const [sigModal, setSigModal] = useState(null);
  const [filters, setFilters] = useState({ role: '', entreprise: '', search: '', date: '' });
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const loadAll = useCallback(async()=>{
    try{
      const [pr,cr,clr]=await Promise.all([
        axios.get('/api/planning'),
        axios.get('/api/events'),
        axios.get('/api/clino'),
      ]);
      setPe(pr.data || []); setCe(cr.data || []);
      setCl((clr.data || []).map(c=>({
        ...c,
        _t: 'clino',
        date: c.date ? String(c.date).slice(0,10) : '',
      })));
    }catch{ toast?.('Erreur chargement','error'); }
    finally{ setLoading(false); }
  },[toast]);

  useEffect(()=>{ loadAll(); },[loadAll,tick]);

  useEffect(()=>{
    const off1=on('planning_refresh',()=>setTick(t=>t+1));
    const off2=on('calendar_refresh',()=>setTick(t=>t+1));
    const off3=on('clino_refresh',()=>setTick(t=>t+1));
    return ()=>{ off1?.(); off2?.(); off3?.(); };
  },[on]);

  useEffect(()=>{
    axios.get('/api/users/by-role/medecin').then(r=>setMed(r.data||[])).catch(()=>{});
    axios.get('/api/users/by-role/technicien').then(r=>setTec(r.data||[])).catch(()=>{});
    axios.get('/api/entreprises').then(r=>setEnts(r.data||[])).catch(()=>{});
  },[]);

  const weekEnd=addDays(weekStart,6);
  const filterWeek=arr=>arr.filter(e=>{const d=toRaw(e.date||e.date_debut?.slice(0,10)||'');return d>=format(weekStart,'yyyy-MM-dd')&&d<=format(weekEnd,'yyyy-MM-dd');});

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
      const match = (e.adresse || '').toLowerCase().includes(q) || (e.commentaire || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filters.search) {
      const s = filters.search.toLowerCase();
      const match = (e.adresse || '').toLowerCase().includes(s) ||
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
      titre: 'Programme Clino Mobile',
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
  const hasActiveFilters = Boolean(filters.medecin_id || filters.technicien_id || filters.entreprise || filters.search);

  if(loading) return <div className="loading-center"><div className="spinner"/></div>;

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      <TodayBanner pe={pe} ce={ce} cl={cl}/>

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
              📋 Tournées & Événements
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
              GMT Ariana Santé au Travail
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: 'var(--text)', letterSpacing: -0.5 }}>
            Planning Médical
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
            Calendrier hebdomadaire, mensuel et programmation des visites médicales
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Export buttons */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-outline btn-sm" onClick={() => {
              import('../utils/exportUtils').then(({exportToPDF}) => {
                exportToPDF(exportItems, [
                  {header:'Date',key:'date_display'},
                  {header:'Horaire',key:'heure_display'},
                  {header:'Titre / Sujet',key:'titre'},
                  {header:'Médecin',key:'medecin_nom'},
                  {header:'Technicien',key:'technicien_nom'},
                  {header:'Adresse / Lieu',key:'adresse'},
                ], 'Planning GMT Ariana');
              });
            }} title="Exporter PDF (Programmes + Clino + Calendrier)">📄 PDF</button>
            <button className="btn btn-outline btn-sm" onClick={() => {
              import('../utils/exportUtils').then(({exportToExcel}) => {
                exportToExcel(exportItems, [
                  {header:'Type',key:'type_label'},
                  {header:'Date',key:'date_display'},
                  {header:'Heure début',key:'heure_debut'},
                  {header:'Heure fin',key:'heure_fin'},
                  {header:'Titre',key:'titre'},
                  {header:'Médecin',key:'medecin_nom'},
                  {header:'Technicien',key:'technicien_nom'},
                  {header:'Adresse / Lieu',key:'adresse'},
                  {header:'Commentaires / Détails',key:'commentaire'},
                ], 'Planning_GMT_Ariana');
              });
            }} title="Exporter Excel (Programmes + Clino + Calendrier)">📊 Excel</button>
            <button className="btn btn-outline btn-sm" onClick={() => {
              import('../utils/exportUtils').then(({exportToWord}) => {
                exportToWord(exportItems, [
                  {header:'Type',key:'type_label'},
                  {header:'Date',key:'date_display'},
                  {header:'Horaire',key:'heure_display'},
                  {header:'Titre / Sujet',key:'titre'},
                  {header:'Médecin',key:'medecin_nom'},
                  {header:'Technicien',key:'technicien_nom'},
                  {header:'Adresse / Lieu',key:'adresse'},
                  {header:'Notes',key:'commentaire'},
                ], 'Planning Medical GMT Ariana');
              });
            }} title="Exporter Word (Document .doc officiel)">📝 Word</button>
          </div>

          {/* Navigation and views */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {view==='week'&&<>
              <button className="btn btn-outline btn-sm" onClick={()=>setWeekStart(w=>subWeeks(w,1))}>‹</button>
              <button className="btn btn-outline btn-sm" onClick={()=>setWeekStart(startOfWeek(new Date(),{weekStartsOn:1}))}>Aujourd'hui</button>
              <button className="btn btn-outline btn-sm" onClick={()=>setWeekStart(w=>addWeeks(w,1))}>›</button>
            </>}
            {view==='month'&&<>
              <button className="btn btn-outline btn-sm" onClick={()=>setMonthDate(d=>subMonths(d,1))}>‹</button>
              <button className="btn btn-outline btn-sm" onClick={()=>setMonthDate(new Date())}>Aujourd'hui</button>
              <button className="btn btn-outline btn-sm" onClick={()=>setMonthDate(d=>addMonths(d,1))}>›</button>
            </>}
          </div>

          <div style={{display:'flex',gap:2,background:'var(--bg)',borderRadius:8,padding:3,border:'1px solid var(--border)'}}>
            {[['week','📅 Semaine'],['month','📆 Mois'],['list','📋 Liste']].map(([v,l])=>(
              <button key={v} className={`btn btn-sm ${view===v?'btn-primary':'btn-ghost'}`}
                onClick={()=>setView(v)} style={{padding:'4px 10px',fontSize:12}}>{l}</button>
            ))}
          </div>

          {isAdmin&&<>
            <button className="btn btn-primary btn-sm" style={{ fontWeight: 800, borderRadius: 8 }} onClick={()=>setModal({t:'p'})}>+ Programme</button>
            <button className="btn btn-outline btn-sm" style={{ fontWeight: 800, borderRadius: 8 }} onClick={()=>setModal({t:'e'})}>+ Événement</button>
          </>}
        </div>
      </div>

      {/* Filter Bar (Rôle: Médecins / Techniciens, Entreprise, Recherche) */}
      <div style={{display:'flex',gap:10,padding:'10px 20px',background:'var(--surface2)',borderBottom:'1px solid var(--border)',flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:13,fontWeight:700,color:'var(--text)',display:'flex',alignItems:'center',gap:4}}>
          🏷️ Filtres :
        </span>

        {/* Filter by Category: All / Medecins / Techniciens */}
        <select
          className="input"
          style={{width:'auto',fontSize:12,padding:'5px 10px',height:32,borderRadius:8,fontWeight:600}}
          value={filters.role}
          onChange={e=>setFilters(f=>({...f,role:e.target.value}))}
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
            onChange={e=>setFilters(f=>({...f,date:e.target.value}))}
            style={{ width: 'auto', fontSize: 12, padding: '4px 8px', height: 32, borderRadius: 8 }}
            title="Filtrer par date exacte"
          />
        </div>

        {/* Filter by Company */}
        {ents.length > 0 ? (
          <select
            className="input"
            style={{width:'auto',fontSize:12,padding:'5px 10px',height:32,borderRadius:8}}
            value={filters.entreprise}
            onChange={e=>setFilters(f=>({...f,entreprise:e.target.value}))}
          >
            <option value="">🏢 Toutes les entreprises</option>
            {ents.map(ent=><option key={ent.id} value={ent.nom}>{ent.nom}</option>)}
          </select>
        ) : (
          <input
            className="input"
            type="text"
            placeholder="🏢 Entreprise..."
            style={{width:160,fontSize:12,padding:'5px 10px',height:32,borderRadius:8}}
            value={filters.entreprise}
            onChange={e=>setFilters(f=>({...f,entreprise:e.target.value}))}
          />
        )}

        {/* Search input */}
        <input
          className="input"
          type="text"
          placeholder="🔍 Recherche mot-clé..."
          style={{width:180,fontSize:12,padding:'5px 10px',height:32,borderRadius:8}}
          value={filters.search}
          onChange={e=>setFilters(f=>({...f,search:e.target.value}))}
        />

        {hasActiveFilters && (
          <>
            <button
              className="btn btn-ghost btn-sm"
              onClick={()=>setFilters({role:'',entreprise:'',search:'',date:''})}
              style={{fontSize:12,padding:'4px 8px',color:'var(--danger)'}}
              title="Réinitialiser tous les filtres"
            >
              ✕ Réinitialiser
            </button>
            <span className="badge badge-blue" style={{fontSize:11}}>
              {totalFilteredCount} élément{totalFilteredCount > 1 ? 's' : ''} trouvé{totalFilteredCount > 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>

      {view==='week'&&<WeekView weekStart={weekStart} pe={filterWeek(filteredPe)} ce={filterWeek(filteredCe.map(e=>({...e,date:e.date_debut?.slice(0,10)})))} cl={filterWeek(filteredCl)} isAdmin={isAdmin} medecins={med} techniciens={tec} onRefresh={()=>setTick(t=>t+1)} toast={toast} onSign={item=>setSigModal(item)}/>}
      {view==='month'&&<MonthView current={monthDate} pe={filteredPe} ce={filteredCe} cl={filteredCl} isAdmin={isAdmin} medecins={med} techniciens={tec} onRefresh={()=>setTick(t=>t+1)} toast={toast} onSign={item=>setSigModal(item)}/>}
      {view==='list'&&<ListView pe={filteredPe} ce={filteredCe} cl={filteredCl} isAdmin={isAdmin} medecins={med} techniciens={tec} onRefresh={()=>setTick(t=>t+1)} toast={toast} onSign={item=>setSigModal(item)}/>}

      {modal?.t==='p'&&<PlanningModal event={modal?.data || null} medecins={med} techniciens={tec}
        onSave={()=>{setModal(null);setTick(t=>t+1);toast('Programme enregistré ✓ — Email envoyé 📧','success');}} onClose={()=>setModal(null)}/>}
      {modal?.t==='e'&&<EventModal event={modal?.data || null}
        onSave={()=>{setModal(null);setTick(t=>t+1);toast('Événement créé ✓ — Email envoyé 📧','success');}} onClose={()=>setModal(null)}/>}
      {sigModal&&<SignaturePadModal event={sigModal} onClose={()=>setSigModal(null)} onSave={()=>{setSigModal(null);setTick(t=>t+1);}} toast={toast}/>}
    </div>
  );
}
