import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { format, isToday, isTomorrow, parseISO, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';

function StatCard({ icon, label, value, subtext, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '18px 20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.07)';
          e.currentTarget.style.borderColor = color;
        }
      }}
      onMouseLeave={e => {
        if (onClick) {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
          e.currentTarget.style.borderColor = 'var(--border)';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: `${color}15`, color: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, border: `1px solid ${color}30`,
        }}>
          {icon}
        </div>
        {subtext && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
            background: `${color}12`, color: color,
          }}>
            {subtext}
          </span>
        )}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px' }}>
          {value}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginTop: 2 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ toast }) {
  const { user } = useAuth();
  const { on }   = useSocket();
  const navigate = useNavigate();

  const [stats, setStats] = useState({ users: 0, events: 0, planning: 0, clino: 0, entreprises: 0 });
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [todayEvents, setTodayEvents] = useState([]);
  const [myPlanning, setMyPlanning] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [medecinStats, setMedecinStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [usersRes, eventsRes, planningRes, clinoRes, myRes, monthlyRes, medecinRes, todayRes, entreprisesRes] = await Promise.all([
        user?.role === 'administrateur' ? axios.get('/api/users') : Promise.resolve({ data: [] }),
        axios.get('/api/events'),
        axios.get('/api/planning'),
        axios.get('/api/clino'),
        axios.get('/api/planning/mine'),
        axios.get('/api/stats/monthly').catch(() => ({ data: [] })),
        user?.role === 'administrateur' ? axios.get('/api/stats/by-medecin').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        axios.get('/api/planning/today').catch(() => ({ data: [] })),
        axios.get('/api/entreprises').catch(() => ({ data: [] })),
      ]);

      const todayStr = new Date().toISOString().split('T')[0];
      const allEnt = entreprisesRes?.data || [];
      const convEnt = allEnt.filter(e => e.convensionne === 1 || e.convensionne === true);
      const entCount = convEnt.length > 0 ? convEnt.length : allEnt.length;

      setStats({
        users:       usersRes?.data?.length || 0,
        events:      eventsRes?.data?.length || 0,
        planning:    planningRes?.data?.length || 0,
        clino:       clinoRes?.data?.length || 0,
        entreprises: entCount,
      });

      setTodayEvents(todayRes?.data || []);

      setUpcomingEvents(
        (eventsRes?.data || [])
          .filter(e => (e?.date_debut?.slice(0, 10) >= todayStr))
          .sort((a, b) => (a?.date_debut || '').localeCompare(b?.date_debut || ''))
      );

      setMyPlanning((myRes?.data || []).slice(0, 6));
      setMonthlyStats(monthlyRes?.data || []);
      setMedecinStats(medecinRes?.data || []);
    } catch (err) {
      toast?.('Erreur lors du chargement des données', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.role, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const off = on?.('calendar_refresh', () => {
      load();
      toast?.('📅 Calendrier mis à jour en temps réel', 'info');
    });
    return () => off?.();
  }, [on, load, toast]);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  const isAdmin = user?.role === 'administrateur';
  const todayFormatted = format(new Date(), 'EEEE d MMMM yyyy', { locale: fr });

  const TYPE_COLORS = {
    ponctuel:  { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8', label: 'Ponctuel', icon: '📌' },
    reunion:   { bg: '#f0fdf4', border: '#22c55e', text: '#15803d', label: 'Réunion', icon: '👥' },
    formation: { bg: '#fefce8', border: '#eab308', text: '#854d0e', label: 'Formation', icon: '🎓' },
    conges:    { bg: '#fef2f2', border: '#ef4444', text: '#b91c1c', label: 'Congés', icon: '🏖️' },
    autre:     { bg: '#faf5ff', border: '#a855f7', text: '#7e22ce', label: 'Autre', icon: '🔔' },
  };

  const ROLE_CONFIG = {
    administrateur: { label: 'Administrateur', icon: '🛡️', color: '#0ea5e9' },
    medecin:        { label: 'Médecin du travail', icon: '👨‍⚕️', color: '#10b981' },
    technicien:     { label: 'Technicien de santé', icon: '🔧', color: '#8b5cf6' },
    chauffeur:      { label: 'Chauffeur Clino', icon: '🚗', color: '#f97316' },
  };

  const roleMeta = ROLE_CONFIG[user?.role] || { label: user?.role || 'Utilisateur', icon: '👤', color: '#0ea5e9' };

  function getDateBadge(dateStr) {
    try {
      const raw = String(dateStr || '').slice(0, 10);
      if (!raw) return { label: '—', color: 'var(--text-3)', bg: 'var(--surface2)' };
      const d = parseISO(raw);
      if (isNaN(d.getTime())) return { label: raw, color: 'var(--text-3)', bg: 'var(--surface2)' };
      if (isToday(d)) return { label: "Aujourd'hui", color: '#ef4444', bg: '#fee2e2' };
      if (isTomorrow(d)) return { label: 'Demain', color: '#f59e0b', bg: '#fef3c7' };
      const diff = differenceInDays(d, new Date());
      if (diff > 1 && diff <= 7) return { label: `Dans ${diff} j`, color: '#0284c7', bg: '#e0f2fe' };
      return { label: format(d, 'd MMM yyyy', { locale: fr }), color: 'var(--text-2)', bg: 'var(--surface2)' };
    } catch {
      return { label: String(dateStr || '—').slice(0, 10), color: 'var(--text-3)', bg: 'var(--surface2)' };
    }
  }

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1400, margin: '0 auto' }}>

      {/* ─── Top Executive Banner ─── */}
      <div style={{
        background: 'linear-gradient(135deg, #0369a1 0%, #0284c7 50%, #0ea5e9 100%)',
        borderRadius: 16,
        padding: '22px 26px',
        color: '#ffffff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
        boxShadow: '0 8px 24px -4px rgba(2, 132, 199, 0.35)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 16,
              fontSize: 11.5, fontWeight: 700, backdropFilter: 'blur(4px)', display: 'inline-flex', alignItems: 'center', gap: 5
            }}>
              <span>{roleMeta.icon}</span> {roleMeta.label}
            </span>
            <span style={{ fontSize: 11.5, color: '#bae6fd', fontWeight: 500 }}>
              ● Connecté en direct
            </span>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.3px', color: '#fff' }}>
            Bonjour, {user?.prenom || 'Système'} 👋
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: '#e0f2fe', textTransform: 'capitalize' }}>
            {todayFormatted} · GMT Ariana Santé au Travail
          </p>
        </div>

        {/* Quick actions in header */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn"
            onClick={() => navigate('/planning')}
            style={{
              background: '#ffffff', color: '#0369a1', fontWeight: 700,
              fontSize: 12.5, padding: '8px 14px', borderRadius: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}
          >
            ➕ Planifier
          </button>
          <button
            className="btn"
            onClick={() => navigate('/entreprises')}
            style={{
              background: 'rgba(255,255,255,0.18)', color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.3)', fontWeight: 600,
              fontSize: 12.5, padding: '8px 12px', borderRadius: 10,
            }}
          >
            🏢 Entreprises
          </button>
          <button
            className="btn"
            onClick={() => {
              setRefreshing(true);
              load();
              toast?.('Données actualisées', 'info');
            }}
            disabled={refreshing}
            style={{
              background: 'rgba(255,255,255,0.18)', color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.3)', fontWeight: 600,
              fontSize: 12.5, padding: '8px 12px', borderRadius: 10,
            }}
            title="Actualiser les données"
          >
            {refreshing ? '⏳' : '🔄'}
          </button>
        </div>
      </div>

      {/* ─── Executive KPI Cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        {isAdmin && (
          <StatCard
            icon="👥"
            label="Utilisateurs"
            value={stats.users}
            subtext="Membres"
            color="#0ea5e9"
            onClick={() => navigate('/users')}
          />
        )}
        <StatCard
          icon="🏢"
          label="Interventions (Entreprises conventionnées)"
          value={stats.entreprises}
          subtext="Conventionnées"
          color="#10b981"
          onClick={() => navigate('/entreprises')}
        />
        <StatCard
          icon="📅"
          label="Événements"
          value={stats.events}
          subtext="Calendrier"
          color="#f59e0b"
          onClick={() => navigate('/planning')}
        />
        <StatCard
          icon="🚗"
          label="Clino Mobile"
          value={stats.clino}
          subtext="Missions"
          color="#8b5cf6"
          onClick={() => navigate('/clino')}
        />
      </div>

      {/* ─── Main Two-Column Layout ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 20, alignItems: 'start' }}>

        {/* ─── Left Column: Operations & Planning ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Today's Schedule (if any) */}
          {todayEvents.length > 0 && (
            <div className="card" style={{ borderLeft: '4px solid #10b981', padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>⚡</span>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                      Programme d'aujourd'hui
                    </h3>
                    <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: '2px 0 0' }}>
                      {todayEvents.length} intervention(s) prévue(s) ce jour
                    </p>
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => navigate('/planning')}
                  style={{ fontSize: 11.5, color: 'var(--primary)' }}
                >
                  Voir tout ➔
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {todayEvents.map(ev => (
                  <div
                    key={ev.id}
                    style={{
                      padding: '10px 12px', background: 'var(--surface2)', borderRadius: 10,
                      border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', gap: 10
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>
                        {ev.titre || 'Visite médicale'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>
                        {ev.adresse ? `📍 ${ev.adresse}` : 'Site principal'}
                        {ev.medecin_nom && ` · 👨‍⚕️ ${ev.medecin_nom}`}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 800, background: '#dcfce7', color: '#15803d',
                      padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap'
                    }}>
                      ⏰ {ev.heure_debut || '08:30'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mes prochaines interventions */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  📋 Mes prochaines interventions
                </h3>
                <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: '2px 0 0' }}>
                  Planning des visites et examens médicaux assignés
                </p>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => navigate('/planning')}
                style={{ fontSize: 11.5 }}
              >
                Planning complet
              </button>
            </div>

            {myPlanning.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 12px', background: 'var(--surface2)', borderRadius: 10 }}>
                <div className="empty-icon" style={{ fontSize: 26, marginBottom: 4 }}>📋</div>
                <p style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>Aucune intervention assignée</p>
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  Vos prochaines visites médicales s'afficheront ici.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myPlanning.map(p => (
                  <div
                    key={p.id}
                    style={{
                      padding: '11px 13px', background: 'var(--surface2)', borderRadius: 10,
                      border: '1px solid var(--border)', borderLeft: '3px solid #0ea5e9',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>
                        {p.titre || 'Visite médicale'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>
                        📅 {p.date} {p.heure_debut ? `· ⏰ ${p.heure_debut}` : ''} {p.adresse ? `· 📍 ${p.adresse}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                      Assigné
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Monthly Activity Analytics Chart */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  📈 Activité & Volume / mois
                </h3>
                <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: '2px 0 0' }}>
                  Suivi semestriel du nombre d'interventions
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, background: '#e0f2fe', color: '#0369a1', padding: '2px 7px', borderRadius: 6 }}>
                6 mois
              </span>
            </div>

            <div style={{ height: 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyStats} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
                  <XAxis dataKey="month" style={{ fontSize: 11, fill: 'var(--text-3)' }} tickLine={false} />
                  <YAxis style={{ fontSize: 11, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      boxShadow: 'var(--shadow-md)',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" name="Interventions" fill="#0ea5e9" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ─── Right Column: Announcements, Team Breakdown, Quick Access ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Announcements & Team Calendar */}
          {upcomingEvents.length > 0 && (
            <div style={{
              borderRadius: 14,
              border: '1px solid #bae6fd',
              background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
              overflow: 'hidden',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{
                padding: '12px 16px',
                background: 'linear-gradient(90deg, #0ea5e9, #0284c7)',
                color: '#ffffff',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>📢</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>
                      Annonces & Événements
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
                      {upcomingEvents.length} événement(s) à venir
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 10.5, background: 'rgba(255,255,255,0.2)', padding: '2px 7px', borderRadius: 12, fontWeight: 700 }}>
                  Équipe
                </span>
              </div>

              <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcomingEvents.map(ev => {
                  const tc = TYPE_COLORS[ev.type] || TYPE_COLORS.autre;
                  const dateBadge = getDateBadge(ev.date_debut);
                  const timeStr = ev.date_debut?.slice(11, 16);

                  return (
                    <div
                      key={ev.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 10,
                        background: '#ffffff',
                        border: `1px solid ${tc.border}44`,
                      }}
                    >
                      <div style={{
                        minWidth: 70, textAlign: 'center', padding: '4px 6px',
                        background: dateBadge.bg, borderRadius: 8,
                        border: `1px solid ${dateBadge.color}30`, flexShrink: 0,
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: dateBadge.color, textTransform: 'uppercase' }}>
                          {dateBadge.label}
                        </div>
                        {timeStr && timeStr !== '00:00' && (
                          <div style={{ fontSize: 10.5, color: 'var(--text-2)', fontWeight: 600, marginTop: 1 }}>
                            {timeStr}
                          </div>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                          {ev.titre}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '1px 6px',
                            borderRadius: 8, background: tc.bg, color: tc.text,
                          }}>
                            {tc.icon} {tc.label}
                          </span>
                          {ev.lieu && (
                            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                              📍 {ev.lieu}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Doctor Allocation (Admin) */}
          {isAdmin && (
            <div className="card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                    👥 Charge par médecin
                  </h3>
                  <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: '2px 0 0' }}>
                    Répartition des consultations médicales
                  </p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, background: '#f0fdf4', color: '#166534', padding: '2px 7px', borderRadius: 6 }}>
                  Équipe
                </span>
              </div>

              <div style={{ height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={medecinStats}
                      dataKey="count"
                      nameKey="medecin"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={3}
                    >
                      {medecinStats.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6'][index % 6]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        boxShadow: 'var(--shadow-md)',
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Raccourcis Métier */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: 'var(--text)' }}>
              ⚡ Raccourcis Métier
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { title: '📅 Planning Médical', desc: 'Gestion des visites périodiques et d\'embauche', path: '/planning', color: '#10b981' },
                { title: '🏢 Adhérents & Entreprises', desc: 'Fiches et suivi des entreprises adhérentes', path: '/entreprises', color: '#0ea5e9' },
                { title: '🚗 Clino Mobile', desc: 'Tournées médicales et visites sur site', path: '/clino', color: '#8b5cf6' },
                { title: '💬 Chat d\'Équipe', desc: 'Échanges internes et partage de documents', path: '/chat', color: '#f59e0b' },
              ].map(item => (
                <div
                  key={item.title}
                  onClick={() => navigate(item.path)}
                  style={{
                    padding: '10px 12px', background: 'var(--surface2)', borderRadius: 10,
                    border: '1px solid var(--border)', borderLeft: `3px solid ${item.color}`,
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                >
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>
                      {item.desc}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: item.color, fontWeight: 700 }}>➔</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
