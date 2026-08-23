import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

function StatCard({ icon, label, value, color }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 22,
        background: color + '22', flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard({ toast }) {
  const { user } = useAuth();
  const { on }   = useSocket();
  const [stats, setStats] = useState({ users: 0, events: 0, planning: 0, clino: 0 });
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [myPlanning, setMyPlanning] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [medecinStats, setMedecinStats] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [usersRes, eventsRes, planningRes, clinoRes, myRes, monthlyRes, medecinRes] = await Promise.all([
        user.role === 'administrateur' ? axios.get('/api/users') : Promise.resolve({ data: [] }),
        axios.get('/api/events'),
        axios.get('/api/planning'),
        axios.get('/api/clino'),
        axios.get('/api/planning/mine'),
        axios.get('/api/stats/monthly').catch(() => ({ data: [] })),
        user.role === 'administrateur' ? axios.get('/api/stats/by-medecin').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);
      setStats({
        users:    usersRes?.data?.length || 0,
        events:   eventsRes?.data?.length || 0,
        planning: planningRes?.data?.length || 0,
        clino:    clinoRes?.data?.length || 0,
      });
      const today = new Date().toISOString().split('T')[0];
      // Tous les événements à venir (passés aussi si aujourd'hui)
      setUpcomingEvents(
        (eventsRes?.data || [])
          .filter(e => e.date_debut?.slice(0, 10) >= today)
          .sort((a, b) => (a.date_debut || '').localeCompare(b.date_debut || ''))
      );
      setMyPlanning((myRes?.data || []).slice(0, 5));
      setMonthlyStats(monthlyRes?.data || []);
      setMedecinStats(medecinRes?.data || []);
    } catch (err) {
      toast?.('Erreur lors du chargement', 'error');
    } finally {
      setLoading(false);
    }
  }, [user.role]);

  useEffect(() => { load(); }, [load]);

  // Écouter les nouveaux événements en temps réel (socket)
  useEffect(() => {
    const off = on?.('calendar_refresh', () => {
      load();
      toast?.('📅 Nouvel événement ajouté par l’admin !', 'info');
    });
    return () => off?.();
  }, [on, load]);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  const isAdmin = user.role === 'administrateur';
  const today   = format(new Date(), 'EEEE d MMMM yyyy', { locale: fr });

  const TYPE_COLORS = {
    ponctuel:  { bg: '#dbeafe', border: '#3b82f6', text: '#1d4ed8', label: 'Ponctuel' },
    reunion:   { bg: '#dcfce7', border: '#22c55e', text: '#15803d', label: 'Réunion' },
    formation: { bg: '#fef9c3', border: '#eab308', text: '#854d0e', label: 'Formation' },
    conges:    { bg: '#fee2e2', border: '#ef4444', text: '#b91c1c', label: 'Congés' },
    autre:     { bg: '#f3e8ff', border: '#a855f7', text: '#7e22ce', label: 'Autre' },
  };

  function getDateLabel(dateStr) {
    try {
      const d = parseISO(dateStr.slice(0, 10));
      if (isToday(d))    return { label: "Aujourd'hui", color: '#ef4444' };
      if (isTomorrow(d)) return { label: 'Demain',      color: '#f59e0b' };
      return { label: format(d, 'd MMM yyyy', { locale: fr }), color: 'var(--text-3)' };
    } catch { return { label: dateStr?.slice(0,10) || '—', color: 'var(--text-3)' }; }
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>Bonjour, {user.prenom} 👋</h2>
          <p style={{ textTransform: 'capitalize' }}>{today} · <span className="badge badge-blue">{user.role}</span></p>
        </div>
      </div>

      {/* ── Annonces / Événements visibles par tous ── */}
      {upcomingEvents.length > 0 && (
        <div style={{
          marginBottom: 24, borderRadius: 14,
          border: '1.5px solid #bae6fd',
          background: 'linear-gradient(135deg,#f0f9ff,#e0f2fe)',
          overflow: 'hidden',
        }}>
          {/* Header annonces */}
          <div style={{
            padding: '12px 18px',
            background: 'linear-gradient(90deg,#0ea5e9,#0284c7)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>📢</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>
                Annonces de l’équipe
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.8)' }}>
                {upcomingEvents.length} événement(s) à venir · Visible par toute l’équipe
              </div>
            </div>
          </div>

          {/* Liste des événements */}
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcomingEvents.map(ev => {
              const tc  = TYPE_COLORS[ev.type] || TYPE_COLORS.autre;
              const dl  = getDateLabel(ev.date_debut);
              const timeStr = ev.date_debut?.slice(11, 16);
              return (
                <div key={ev.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 10,
                  background: tc.bg,
                  border: `1.5px solid ${tc.border}`,
                  boxShadow: '0 1px 4px rgba(0,0,0,.06)',
                }}>
                  {/* Date badge */}
                  <div style={{
                    minWidth: 68, textAlign: 'center', padding: '4px 6px',
                    background: '#fff', borderRadius: 8, border: `1px solid ${tc.border}`,
                    flexShrink: 0,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: dl.color, textTransform: 'uppercase' }}>
                      {dl.label}
                    </div>
                    {timeStr && timeStr !== '00:00' && (
                      <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>⏰ {timeStr}</div>
                    )}
                  </div>

                  {/* Infos */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: tc.text }}>
                      {ev.titre}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 7px',
                        borderRadius: 10, background: tc.border + '33', color: tc.text,
                      }}>{tc.label}</span>
                      {ev.lieu && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>📍 {ev.lieu}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: 12, marginBottom: 20 }}>
        {isAdmin && <StatCard icon="👥" label="Utilisateurs"    value={stats.users}    color="#0ea5e9" />}
        <StatCard icon="📋" label="Interventions"       value={stats.planning} color="#10b981" />
        <StatCard icon="📅" label="Événements"          value={stats.events}   color="#f59e0b" />
        <StatCard icon="🚗" label="Clino Mobile"        value={stats.clino}    color="#8b5cf6" />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px),1fr))', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>📈 Interventions / mois</h3>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" style={{ fontSize: 11 }} />
                <YAxis style={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        {isAdmin && (
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>👥 Par médecin</h3>
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={medecinStats} dataKey="count" nameKey="medecin" cx="50%" cy="50%" outerRadius={80} label>
                    {medecinStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'][index % 6]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Planning personnel & Infos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px),1fr))', gap: 16 }}>

        {/* My planning */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>📋 Mes prochaines interventions</h3>
          {myPlanning.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 12px' }}>
              <div className="empty-icon">📋</div>
              <p>Aucune intervention assignée</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myPlanning.map(p => (
                <div key={p.id} style={{
                  padding: '10px 12px', background: 'var(--surface2)',
                  borderRadius: 'var(--radius)', borderLeft: '3px solid var(--primary)',
                }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.titre || '(sans titre)'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                    📅 {p.date} {p.heure_debut ? `· ⏰ ${p.heure_debut}` : ''}
                    {p.adresse ? ` · 📍 ${p.adresse}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick info card */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>📋 Infos rapides</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, borderLeft: '3px solid #10b981' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>📅 Calendrier partagé</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Les événements créés par l'admin sont visibles dans le Planning pour tous.</div>
            </div>
            <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, borderLeft: '3px solid #0ea5e9' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0284c7' }}>💬 Chat équipe</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Partagez des documents (PDF, Word, images) directement dans le chat.</div>
            </div>
            <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, borderLeft: '3px solid #8b5cf6' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>🚗 Clino Mobile</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Consultez votre programme journalier des interventions à domicile.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
