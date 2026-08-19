import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AddressAutocomplete from '../components/AddressAutocomplete';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Helper : générer le lien Google Maps depuis une adresse ───
function googleMapsUrl(adresse) {
  if (!adresse) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
}

function MapView({ entreprises }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstanceRef.current) return;
    
    const map = L.map(mapRef.current).setView([36.8, 10.18], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
    mapInstanceRef.current = map;

    // Geocode each entreprise with Nominatim
    entreprises.filter(e => e.adresse).forEach(async (ent) => {
      const cached = sessionStorage.getItem('geo_' + ent.adresse);
      let lat, lon;
      if (cached) {
        ({lat,lon} = JSON.parse(cached));
      } else {
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(ent.adresse)},Ariana,Tunisie&format=json&limit=1`);
          const data = await r.json();
          if (data[0]) { lat=parseFloat(data[0].lat); lon=parseFloat(data[0].lon); sessionStorage.setItem('geo_'+ent.adresse, JSON.stringify({lat,lon})); }
        } catch {}
      }
      if (lat&&lon) {
        L.marker([lat,lon]).addTo(map).bindPopup(`<b>${ent.nom}</b><br>${ent.adresse}<br><small>${ent.secteur||''}</small>`);
      }
    });

    return () => { map.remove(); mapInstanceRef.current = null; };
  }, [entreprises]);

  return <div ref={mapRef} style={{height:500,width:'100%',borderRadius:12,overflow:'hidden'}} />;
}

// ── Star rating component ─────────────────────────────────────
function Stars({ value, onChange, size = 20 }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display:'flex', gap:2 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n}
          style={{ fontSize:size, cursor:onChange?'pointer':'default', color: n<=(hover||value)?'#f59e0b':'#d1d5db', transition:'color .1s' }}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange && onChange(n)}
        >★</span>
      ))}
    </div>
  );
}

// ── Modal for creating/editing an entreprise ──────────────────
function EntrepriseModal({ item, onSave, onClose }) {
  const init = item || {};
  const [f, setF] = useState({
    nom: init.nom||'', secteur: init.secteur||'', adresse: init.adresse||'',
    telephone: init.telephone||'', email: init.email||'',
    site_web: init.site_web||'', description: init.description||'',
    convensionne: init.convensionne !== undefined ? !!init.convensionne : true,
  });
  const [saving, setSaving] = useState(false);
  const s = (k,v) => setF(p=>({...p,[k]:v}));

  async function handleSave() {
    if (!f.nom.trim()) return;
    setSaving(true);
    try {
      if (init.id) await axios.put(`/api/entreprises/${init.id}`, f);
      else         await axios.post('/api/entreprises', f);
      onSave();
    } catch(e) { alert(e.response?.data?.message||'Erreur'); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:560 }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>{init.id?'✏️ Modifier':'➕ Nouvelle entreprise'}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Nom de l'entreprise *</label>
            <input className="input" placeholder="Ex : Clinique Les Oliviers" value={f.nom} onChange={e=>s('nom',e.target.value)} autoFocus/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="form-group">
              <label>Secteur</label>
              <input className="input" placeholder="Ex : Médical, Pharmacie" value={f.secteur} onChange={e=>s('secteur',e.target.value)}/>
            </div>
            <div className="form-group">
              <label>Téléphone</label>
              <input className="input" placeholder="+216 XX XXX XXX" value={f.telephone} onChange={e=>s('telephone',e.target.value)}/>
            </div>
          </div>
          <div className="form-group">
            <label>Adresse</label>
            <AddressAutocomplete value={f.adresse} onChange={v=>s('adresse',v)} placeholder="Ex: iset rades, clinique tunis..." searchLocation />
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="form-group">
              <label>Email</label>
              <input className="input" type="email" placeholder="contact@entreprise.com" value={f.email} onChange={e=>s('email',e.target.value)}/>
            </div>
            <div className="form-group">
              <label>Site web</label>
              <input className="input" placeholder="https://..." value={f.site_web} onChange={e=>s('site_web',e.target.value)}/>
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="input" placeholder="Description de l'entreprise, services proposés..." value={f.description} onChange={e=>s('description',e.target.value)} style={{minHeight:80}}/>
          </div>
          <div className="form-group">
            <label>Statut convention</label>
            <div style={{display:'flex',gap:8}}>
              <button type="button" className={`btn btn-sm ${f.convensionne?'btn-success':'btn-outline'}`} onClick={()=>s('convensionne',true)}>
                ✅ Conventionnée
              </button>
              <button type="button" className={`btn btn-sm ${!f.convensionne?'btn-danger':'btn-outline'}`} onClick={()=>s('convensionne',false)}>
                ❌ Non conventionnée
              </button>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving||!f.nom.trim()}>
            {saving?<span className="spinner" style={{width:16,height:16}}/>:'💾 Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal for adding an avis ──────────────────────────────────
function AvisModal({ entreprise, editAvis, onSave, onClose }) {
  const [f, setF] = useState({
    note: editAvis?.note||0,
    commentaire: editAvis?.commentaire||'',
    type_avis: editAvis?.type_avis||'avis',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!f.commentaire.trim()) return;
    setSaving(true);
    try {
      if (editAvis?.id) {
        await axios.put(`/api/entreprises/${entreprise.id}/avis/${editAvis.id}`, f);
      } else {
        await axios.post(`/api/entreprises/${entreprise.id}/avis`, f);
      }
      onSave();
    } catch(e) { alert(e.response?.data?.message||'Erreur'); }
    finally { setSaving(false); }
  }

  const TYPE_LABELS = { avis:'💬 Avis', remarque:'⚠️ Remarque', suggestion:'💡 Suggestion' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editAvis?'✏️ Modifier':'➕ Partager votre avis'}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{padding:'10px 14px',background:'var(--surface2)',borderRadius:10,marginBottom:4}}>
            <div style={{fontWeight:700,fontSize:14}}>🏢 {entreprise.nom}</div>
            {entreprise.secteur&&<div style={{fontSize:12,color:'var(--text-2)',marginTop:2}}>{entreprise.secteur}</div>}
          </div>
          <div className="form-group">
            <label>Type</label>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {Object.entries(TYPE_LABELS).map(([v,l])=>(
                <button key={v} type="button" className={`btn btn-sm ${f.type_avis===v?'btn-primary':'btn-outline'}`}
                  onClick={()=>setF(p=>({...p,type_avis:v}))}>{l}</button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Note (optionnel)</label>
            <Stars value={f.note} onChange={n=>setF(p=>({...p,note:n}))} size={28}/>
            {f.note>0&&<span style={{fontSize:12,color:'var(--text-2)',marginTop:4,display:'block'}}>{['','Très mauvais','Mauvais','Moyen','Bien','Excellent'][f.note]}</span>}
          </div>
          <div className="form-group">
            <label>Commentaire *</label>
            <textarea className="input" placeholder="Partagez votre expérience avec cette entreprise..." value={f.commentaire} onChange={e=>setF(p=>({...p,commentaire:e.target.value}))} style={{minHeight:100}} autoFocus/>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving||!f.commentaire.trim()}>
            {saving?<span className="spinner" style={{width:16,height:16}}/>:'📨 Publier'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Entreprise detail panel ───────────────────────────────────
function EntrepriseDetail({ entreprise, onClose, onEdit, onDelete, toast }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrateur';
  const [avis,       setAvis]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showAvis,   setShowAvis]   = useState(null);  // null | 'new' | avis object
  const [confirmDel, setConfirmDel] = useState(null);

  useEffect(() => { loadAvis(); }, [entreprise.id]);

  async function loadAvis() {
    try {
      const { data } = await axios.get(`/api/entreprises/${entreprise.id}/avis`);
      setAvis(data);
    } catch { toast?.('Erreur chargement avis','error'); }
    finally { setLoading(false); }
  }

  async function handleDeleteAvis(id) {
    try {
      await axios.delete(`/api/entreprises/${entreprise.id}/avis/${id}`);
      setConfirmDel(null);
      loadAvis();
      toast?.('Avis supprimé','success');
    } catch { toast?.('Erreur','error'); }
  }

  const avgNote = avis.filter(a=>a.note>0).length
    ? (avis.filter(a=>a.note>0).reduce((s,a)=>s+a.note,0)/avis.filter(a=>a.note>0).length).toFixed(1)
    : null;

  const TYPE_COLORS = { avis:'#0ea5e9', remarque:'#f59e0b', suggestion:'#10b981' };
  const TYPE_LABELS = { avis:'💬 Avis', remarque:'⚠️ Remarque', suggestion:'💡 Suggestion' };

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',background:'var(--surface)',flexShrink:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
              <h2 style={{fontSize:18,fontWeight:800,color:'var(--text)'}}>{entreprise.nom}</h2>
              <span className={`badge ${entreprise.convensionne?'badge-green':'badge-red'}`}>
                {entreprise.convensionne?'✅ Conventionnée':'❌ Non conventionnée'}
              </span>
            </div>
            {entreprise.secteur&&<div style={{fontSize:13,color:'var(--text-2)'}}>🏷 {entreprise.secteur}</div>}
            {avgNote&&(
              <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                <Stars value={Math.round(avgNote)} size={14}/>
                <span style={{fontSize:13,fontWeight:700,color:'var(--warn)'}}>{avgNote}</span>
                <span style={{fontSize:12,color:'var(--text-3)'}}> ({avis.filter(a=>a.note>0).length} note(s))</span>
              </div>
            )}
          </div>
          <div style={{display:'flex',gap:6}}>
            {isAdmin&&<button className="btn btn-outline btn-sm" onClick={onEdit}>✏️</button>}
            {isAdmin&&<button className="btn btn-danger btn-sm" onClick={onDelete}>🗑</button>}
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Fermer</button>
          </div>
        </div>

        {/* Contact info */}
        <div style={{display:'flex',gap:16,marginTop:10,flexWrap:'wrap',alignItems:'center'}}>
          {entreprise.adresse&&(
            <a
              href={googleMapsUrl(entreprise.adresse)}
              target="_blank"
              rel="noreferrer"
              title="Voir sur Google Maps"
              style={{
                fontSize:12,color:'var(--primary)',textDecoration:'none',
                display:'flex',alignItems:'center',gap:4,
                background:'var(--primary-lt,#e0f2fe)',
                padding:'3px 9px',borderRadius:20,
                fontWeight:600,transition:'opacity .15s',
              }}
              onMouseEnter={e=>e.currentTarget.style.opacity='0.75'}
              onMouseLeave={e=>e.currentTarget.style.opacity='1'}
            >
              📍 {entreprise.adresse}
              <span style={{fontSize:10,opacity:0.7}}>↗</span>
            </a>
          )}
          {entreprise.telephone&&<span style={{fontSize:12,color:'var(--text-2)'}}>📞 {entreprise.telephone}</span>}
          {entreprise.email&&<a href={`mailto:${entreprise.email}`} style={{fontSize:12,color:'var(--primary)',textDecoration:'none'}}>✉️ {entreprise.email}</a>}
          {entreprise.site_web&&<a href={entreprise.site_web} target="_blank" rel="noreferrer" style={{fontSize:12,color:'var(--primary)',textDecoration:'none'}}>🌐 Site web</a>}
        </div>
        {entreprise.adresse&&(
          <div style={{marginTop:8}}>
            <a
              href={googleMapsUrl(entreprise.adresse)}
              target="_blank"
              rel="noreferrer"
              style={{
                display:'inline-flex',alignItems:'center',gap:6,
                fontSize:12,fontWeight:700,
                color:'#fff',background:'linear-gradient(135deg,#4285F4,#34A853)',
                padding:'5px 14px',borderRadius:20,textDecoration:'none',
                boxShadow:'0 2px 8px rgba(66,133,244,.3)',
                transition:'transform .15s,box-shadow .15s',
              }}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.boxShadow='0 4px 14px rgba(66,133,244,.4)';}}
              onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow='0 2px 8px rgba(66,133,244,.3)';}}
            >
              🗺️ Voir sur Google Maps
            </a>
          </div>
        )}
        {entreprise.description&&<p style={{fontSize:13,color:'var(--text-2)',marginTop:10,lineHeight:1.5}}>{entreprise.description}</p>}
      </div>

      {/* Avis section */}
      <div style={{flex:1,overflowY:'auto',padding:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{fontSize:16,fontWeight:700}}>
            Avis & Remarques
            <span style={{fontSize:13,color:'var(--text-3)',fontWeight:400,marginLeft:8}}>({avis.length})</span>
          </h3>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowAvis('new')}>
            ➕ Donner mon avis
          </button>
        </div>

        {loading&&<div className="loading-center"><div className="spinner"/></div>}
        {!loading&&avis.length===0&&(
          <div className="empty-state"><div className="empty-icon">💬</div>
            <p>Aucun avis pour l'instant.</p>
            <p style={{fontSize:13,marginTop:4}}>Soyez le premier à partager votre expérience !</p>
          </div>
        )}

        {avis.map(a=>(
          <div key={a.id} style={{background:'var(--surface)',borderRadius:12,padding:'14px 16px',marginBottom:10,borderLeft:`3px solid ${TYPE_COLORS[a.type_avis]||'#888'}`,boxShadow:'var(--shadow)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <div style={{width:30,height:30,borderRadius:'50%',background:'var(--primary-lt)',color:'var(--primary)',fontSize:11,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {(a.user_prenom?.[0]||'').toUpperCase()}{(a.user_nom?.[0]||'').toUpperCase()}
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:700}}>{a.user_prenom} {a.user_nom}</div>
                  <div style={{fontSize:11,color:'var(--text-3)',textTransform:'capitalize'}}>{a.user_role}</div>
                </div>
              </div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <span style={{fontSize:11,padding:'2px 8px',borderRadius:12,background:(TYPE_COLORS[a.type_avis]||'#888')+'22',color:TYPE_COLORS[a.type_avis]||'#888',fontWeight:700}}>
                  {TYPE_LABELS[a.type_avis]||a.type_avis}
                </span>
                {(a.user_id===user?.id||isAdmin)&&(
                  <>
                    <button className="btn btn-ghost btn-sm" style={{padding:'2px 6px'}} onClick={()=>setShowAvis(a)}>✏️</button>
                    <button className="btn btn-ghost btn-sm" style={{padding:'2px 6px',color:'var(--danger)'}} onClick={()=>setConfirmDel(a.id)}>🗑</button>
                  </>
                )}
              </div>
            </div>
            {a.note>0&&<div style={{marginBottom:6}}><Stars value={a.note} size={14}/></div>}
            <p style={{fontSize:14,color:'var(--text)',lineHeight:1.6,margin:0}}>{a.commentaire}</p>
            <div style={{fontSize:11,color:'var(--text-3)',marginTop:8}}>
              {new Date(a.created_at).toLocaleString('fr-FR')}
            </div>
          </div>
        ))}
      </div>

      {/* Avis modal */}
      {showAvis&&(
        <AvisModal
          entreprise={entreprise}
          editAvis={showAvis==='new'?null:showAvis}
          onSave={()=>{setShowAvis(null);loadAvis();toast?.('Avis publié','success');}}
          onClose={()=>setShowAvis(null)}
        />
      )}
      {confirmDel&&(
        <ConfirmDialog title="Supprimer l'avis?" message="Action irréversible." danger
          onConfirm={()=>handleDeleteAvis(confirmDel)} onCancel={()=>setConfirmDel(null)}/>
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function Entreprises({ toast }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrateur';

  const [entreprises, setEntreprises] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [filterConv,  setFilterConv]  = useState('all');
  const [selected,    setSelected]    = useState(null);
  const [modal,       setModal]       = useState(null);
  const [confirm,     setConfirm]     = useState(null);
  const [viewMode,    setViewMode]    = useState('list');

  async function load() {
    try {
      const { data } = await axios.get('/api/entreprises');
      setEntreprises(data);
    } catch { toast?.('Erreur chargement','error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id) {
    try {
      await axios.delete(`/api/entreprises/${id}`);
      setConfirm(null);
      setSelected(null);
      load();
      toast?.('Entreprise supprimée','success');
    } catch { toast?.('Erreur suppression','error'); }
  }

  const filtered = entreprises.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || `${e.nom} ${e.secteur||''} ${e.adresse||''}`.toLowerCase().includes(q);
    const matchConv = filterConv==='all' || (filterConv==='conv' ? e.convensionne : !e.convensionne);
    return matchSearch && matchConv;
  });

  const stats = {
    total: entreprises.length,
    conv:  entreprises.filter(e=>e.convensionne).length,
    avis:  entreprises.reduce((s,e)=>s+(parseInt(e.nb_avis)||0),0),
  };

  if (selected) {
    const ent = entreprises.find(e=>e.id===selected);
    if (!ent) { setSelected(null); return null; }
    return (
      <div style={{height:'100%',overflow:'hidden'}}>
        <EntrepriseDetail
          entreprise={ent}
          toast={toast}
          onClose={()=>setSelected(null)}
          onEdit={()=>{ setModal(ent); setSelected(null); }}
          onDelete={()=>setConfirm(ent.id)}
        />
        {confirm&&(
          <ConfirmDialog title="Supprimer l'entreprise?" message="Tous les avis seront supprimés." danger
            onConfirm={()=>handleDelete(confirm)} onCancel={()=>setConfirm(null)}/>
        )}
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h2>🏢 Entreprises Conventionnées</h2>
          <p>Partenaires et avis de l'équipe</p>
        </div>
        {isAdmin&&(
          <button className="btn btn-primary" onClick={()=>setModal({})}>+ Ajouter</button>
        )}
      </div>

      {/* Stats */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        {[
          {label:'Total',value:stats.total,color:'#0ea5e9'},
          {label:'Conventionnées',value:stats.conv,color:'#10b981'},
          {label:'Avis partagés',value:stats.avis,color:'#f59e0b'},
        ].map(s=>(
          <div key={s.label} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 16px',display:'flex',gap:10,alignItems:'center'}}>
            <span style={{fontSize:18,fontWeight:800,color:s.color}}>{s.value}</span>
            <span style={{fontSize:13,color:'var(--text-2)'}}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <input className="input" style={{maxWidth:300}} placeholder="🔍 Rechercher par nom, secteur..."
          value={search} onChange={e=>setSearch(e.target.value)}/>
        <div style={{display:'flex',gap:2,background:'var(--bg)',borderRadius:8,padding:3}}>
          {[['all','Toutes'],['conv','Conventionnées'],['nonconv','Non conv.']].map(([v,l])=>(
            <button key={v} className={`btn btn-sm ${filterConv===v?'btn-primary':'btn-ghost'}`}
              onClick={()=>setFilterConv(v)} style={{padding:'4px 10px',fontSize:12}}>{l}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:2,background:'var(--bg)',borderRadius:8,padding:3}}>
          {[['list','📋 Liste'],['map','🗺️ Carte']].map(([v,l])=>(
            <button key={v} className={`btn btn-sm ${viewMode===v?'btn-primary':'btn-ghost'}`}
              onClick={()=>setViewMode(v)} style={{padding:'4px 10px',fontSize:12}}>{l}</button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading
        ? <div className="loading-center"><div className="spinner"/></div>
        : filtered.length===0
          ? <div className="empty-state"><div className="empty-icon">🏢</div><p>Aucune entreprise trouvée</p></div>
          : viewMode === 'map' ? (
              <MapView entreprises={filtered} />
            ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
              {filtered.map(e=>(
                <div key={e.id} className="card" style={{cursor:'pointer',transition:'box-shadow .15s',borderTop:`3px solid ${e.convensionne?'var(--accent)':'var(--danger)'}`}}
                  onClick={()=>setSelected(e.id)}
                  onMouseEnter={el=>el.currentTarget.style.boxShadow='var(--shadow-md)'}
                  onMouseLeave={el=>el.currentTarget.style.boxShadow='var(--shadow)'}
                >
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div>
                      <div style={{fontWeight:800,fontSize:15,color:'var(--text)',marginBottom:3}}>{e.nom}</div>
                      {e.secteur&&<div style={{fontSize:12,color:'var(--text-2)'}}>🏷 {e.secteur}</div>}
                    </div>
                    <span className={`badge ${e.convensionne?'badge-green':'badge-red'}`} style={{fontSize:10,flexShrink:0}}>
                      {e.convensionne?'✅ Conv.':'❌ Non'}
                    </span>
                  </div>

                  {e.adresse&&(
                    <a
                      href={googleMapsUrl(e.adresse)}
                      target="_blank"
                      rel="noreferrer"
                      title="Ouvrir dans Google Maps"
                      onClick={ev=>ev.stopPropagation()}
                      style={{fontSize:12,color:'var(--primary)',marginBottom:4,display:'flex',alignItems:'center',gap:3,textDecoration:'none',fontWeight:500}}
                      onMouseEnter={ev=>ev.currentTarget.style.textDecoration='underline'}
                      onMouseLeave={ev=>ev.currentTarget.style.textDecoration='none'}
                    >
                      📍 {e.adresse} <span style={{fontSize:10,opacity:0.6}}>↗</span>
                    </a>
                  )}
                  {e.telephone&&<div style={{fontSize:12,color:'var(--text-2)',marginBottom:4}}>📞 {e.telephone}</div>}

                  {e.description&&(
                    <p style={{fontSize:12,color:'var(--text-3)',marginBottom:8,lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                      {e.description}
                    </p>
                  )}

                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
                    <div style={{display:'flex',gap:10,alignItems:'center'}}>
                      <span style={{fontSize:12,color:'var(--text-2)'}}>
                        💬 {e.nb_avis||0} avis
                      </span>
                      {e.note_moyenne>0&&(
                        <span style={{display:'flex',alignItems:'center',gap:3,fontSize:12}}>
                          <Stars value={Math.round(e.note_moyenne)} size={12}/>
                          <span style={{color:'var(--warn)',fontWeight:700}}>{e.note_moyenne}</span>
                        </span>
                      )}
                    </div>
                    <span style={{fontSize:12,color:'var(--primary)',fontWeight:600}}>Voir détails →</span>
                  </div>
                </div>
              ))}
            </div>
          )
      }

      {modal!==null&&(
        <EntrepriseModal
          item={modal?.id?modal:null}
          onSave={()=>{setModal(null);load();toast?.('Enregistré','success');}}
          onClose={()=>setModal(null)}
        />
      )}
      {confirm&&!selected&&(
        <ConfirmDialog title="Supprimer l'entreprise?" message="Tous les avis seront supprimés." danger
          onConfirm={()=>handleDelete(confirm)} onCancel={()=>setConfirm(null)}/>
      )}
    </div>
  );
}
