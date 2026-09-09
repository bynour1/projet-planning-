import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

const DAYS_FR = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

function getInitialDay(ws) {
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  for (let i = 0; i < 7; i++) {
    if (format(addDays(ws, i), 'yyyy-MM-dd') === todayKey) return i;
  }
  return 0;
}

export default function Schedule({ toast }) {
  const { user }  = useAuth();
  const { on }    = useSocket();
  const isAdmin   = user?.role === 'administrateur';

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn:1 }));
  const [selDay,    setSelDay]    = useState(() => getInitialDay(startOfWeek(new Date(), { weekStartsOn:1 })));
  const [planning,  setPlanning]  = useState([]);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const start = format(weekStart, 'yyyy-MM-dd');
      const end   = format(addDays(weekStart, 6), 'yyyy-MM-dd');
      const { data } = await axios.get(`/api/planning?start=${start}&end=${end}`);
      setPlanning(data);
    } catch { toast?.('Erreur chargement', 'error'); }
    finally { setLoading(false); }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const off = on('planning_refresh', load);
    return () => off?.();
  }, [on, load]);

  // When week changes, set selDay to today if in week, else 0
  useEffect(() => {
    setSelDay(getInitialDay(weekStart));
  }, [weekStart]);

  const selDate = format(addDays(weekStart, selDay), 'yyyy-MM-dd');
  const weekEnd = addDays(weekStart, 6);

  const dayEvents = planning
    .filter(e => e.date === selDate)
    .sort((a, b) => (a.heure_debut || '').localeCompare(b.heure_debut || ''));

  function isToday(i) {
    return format(addDays(weekStart, i), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  }

  function getCountForDay(i) {
    const key = format(addDays(weekStart, i), 'yyyy-MM-dd');
    return planning.filter(e => e.date === key).length;
  }

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
              Planning & Tournées Médicales
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>• Calendrier hebdomadaire</span>
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5, margin: 0 }}>
            🗓 Vue Semaine
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, margin: 0, textTransform: 'capitalize' }}>
            {format(weekStart, 'd MMMM', { locale: fr })} – {format(weekEnd, 'd MMMM yyyy', { locale: fr })} • Coordination des visites et interventions sur site.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-outline"
            onClick={() => setWeekStart(w => subWeeks(w, 1))}
            style={{ fontWeight: 800, fontSize: 16, padding: '8px 14px', borderRadius: 10 }}
            title="Semaine précédente"
          >
            ‹
          </button>
          <button
            className="btn btn-outline"
            onClick={() => {
              const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
              setWeekStart(ws);
              setSelDay(getInitialDay(ws));
            }}
            style={{ fontWeight: 700, fontSize: 13, padding: '8px 16px', borderRadius: 10 }}
          >
            Aujourd'hui
          </button>
          <button
            className="btn btn-outline"
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            style={{ fontWeight: 800, fontSize: 16, padding: '8px 14px', borderRadius: 10 }}
            title="Semaine suivante"
          >
            ›
          </button>
        </div>
      </div>

      {/* Day selector tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:20, overflowX:'auto', paddingBottom:4 }}>
        {DAYS_FR.map((d, i) => {
          const count = getCountForDay(i);
          const today = isToday(i);
          const active = selDay === i;
          return (
            <button
              key={i}
              onClick={() => setSelDay(i)}
              style={{
                display:'flex', flexDirection:'column', alignItems:'center',
                gap:2, padding:'8px 12px', borderRadius:12, cursor:'pointer',
                border:'1.5px solid',
                borderColor: active ? 'var(--primary)' : today ? 'var(--accent)' : 'var(--border)',
                background: active ? 'var(--primary)' : today ? 'var(--accent-lt)' : 'var(--surface)',
                color: active ? '#fff' : today ? 'var(--accent)' : 'var(--text-2)',
                fontFamily:'var(--font)', minWidth:60, flexShrink:0,
                transition:'all .15s',
              }}
            >
              <span style={{ fontSize:11, fontWeight:700 }}>{d.slice(0,3)}</span>
              <span style={{ fontSize:18, fontWeight:800 }}>
                {format(addDays(weekStart, i), 'd')}
              </span>
              {count > 0 && (
                <span style={{
                  background: active ? 'rgba(255,255,255,.3)' : 'var(--primary)',
                  color: active ? '#fff' : '#fff',
                  borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:800,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Day title */}
      <h3 style={{ fontSize:17, fontWeight:800, color:'var(--text)', marginBottom:20 }}>
        {DAYS_FR[selDay]} {format(addDays(weekStart, selDay), 'd MMMM yyyy', { locale:fr })}
        {isToday(selDay) && (
          <span className="badge badge-green" style={{ marginLeft:10, fontSize:11 }}>Aujourd'hui</span>
        )}
      </h3>

      {/* Timeline */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : dayEvents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <p>Aucune intervention ce jour</p>
          {isAdmin && (
            <p style={{ fontSize:13, color:'var(--text-3)', marginTop:6 }}>
              Ajoutez une intervention depuis la page Planning
            </p>
          )}
        </div>
      ) : (
        <div style={{ maxWidth:620, position:'relative' }}>
          {/* Vertical timeline line */}
          <div style={{
            position:'absolute', left:60, top:16, bottom:16,
            width:2, background:'var(--border)',
          }} />

          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {dayEvents.map((ev, i) => (
              <div key={ev.id || i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                {/* Time bubble */}
                <div style={{
                  width:60, flexShrink:0, textAlign:'right',
                  paddingTop:10, paddingRight:6,
                }}>
                  <span style={{
                    fontSize:12, fontWeight:800, color:'var(--primary)',
                    background:'var(--primary-lt)', padding:'3px 6px',
                    borderRadius:6, display:'inline-block',
                  }}>
                    {ev.heure_debut || '--:--'}
                  </span>
                </div>

                {/* Dot */}
                <div style={{
                  width:14, height:14, borderRadius:'50%', marginTop:10, flexShrink:0, zIndex:1,
                  background:'var(--primary)', border:'2.5px solid var(--surface)',
                  boxShadow:'0 0 0 2px var(--primary)',
                }} />

                {/* Event card */}
                <div style={{
                  flex:1, background:'var(--surface)',
                  borderRadius:12, padding:'12px 16px',
                  borderLeft:'3px solid var(--primary)',
                  boxShadow:'var(--shadow)',
                }}>
                  {/* Title */}
                  <div style={{ fontWeight:700, fontSize:15, color:'var(--text)', marginBottom:6 }}>
                    {ev.titre || 'Intervention'}
                  </div>

                  {/* Horaire */}
                  {ev.heure_debut && ev.heure_fin && (
                    <div style={{ fontSize:12, color:'var(--text-2)', marginBottom:4 }}>
                      ⏱ {ev.heure_debut} → {ev.heure_fin}
                    </div>
                  )}

                  {/* Details */}
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    {ev.medecin_nom    && (
                      <span style={{ fontSize:12, color:'var(--text-2)' }}>
                        👨‍⚕️ {ev.medecin_nom}
                      </span>
                    )}
                    {ev.technicien_nom && (
                      <span style={{ fontSize:12, color:'var(--text-2)' }}>
                        🔧 {ev.technicien_nom}
                      </span>
                    )}
                    {ev.adresse && (
                      <span style={{ fontSize:12, color:'var(--text-3)' }}>
                        📍 {ev.adresse}
                      </span>
                    )}
                  </div>

                  {/* Commentaire */}
                  {ev.commentaire && (
                    <div style={{
                      background:'var(--primary-lt)', borderRadius:8,
                      padding:'8px 12px', marginTop:10,
                      fontSize:12, color:'var(--text-2)', fontStyle:'italic',
                      borderLeft:'2px solid var(--primary)',
                    }}>
                      💬 {ev.commentaire}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary for the week */}
      {!loading && planning.length > 0 && (
        <div style={{ marginTop:32 }}>
          <h4 style={{ fontSize:14, fontWeight:700, color:'var(--text-2)', marginBottom:12 }}>
            📊 Résumé de la semaine — {planning.length} intervention(s)
          </h4>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {DAYS_FR.map((d, i) => {
              const count = getCountForDay(i);
              if (!count) return null;
              return (
                <div key={i}
                  onClick={() => setSelDay(i)}
                  style={{
                    cursor:'pointer', background:'var(--primary-lt)',
                    border:'1px solid var(--primary)', borderRadius:8,
                    padding:'6px 12px', fontSize:12, color:'var(--primary-dk)', fontWeight:600,
                  }}
                >
                  {d.slice(0,3)} · {count}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
