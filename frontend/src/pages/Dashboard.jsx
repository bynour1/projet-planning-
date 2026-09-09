import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
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
  const [convEntreprises, setConvEntreprises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [usersRes, eventsRes, planningRes, clinoRes, myRes, todayRes, entreprisesRes] = await Promise.all([
        user?.role === 'administrateur' ? axios.get('/api/users') : Promise.resolve({ data: [] }),
        axios.get('/api/events'),
        axios.get('/api/planning'),
        axios.get('/api/clino'),
        axios.get('/api/planning/mine'),
        axios.get('/api/planning/today').catch(() => ({ data: [] })),
        axios.get('/api/entreprises').catch(() => ({ data: [] })),
      ]);

      const todayStr = new Date().toISOString().split('T')[0];
      const allEnt = entreprisesRes?.data || [];
      const convEnt = allEnt.filter(e => e.convensionne === 1 || e.convensionne === true || e.convensionne === '1');
      const entCount = convEnt.length > 0 ? convEnt.length : allEnt.length;

      setStats({
        users:       usersRes?.data?.length || 0,
        events:      eventsRes?.data?.length || 0,
        planning:    planningRes?.data?.length || 0,
        clino:       clinoRes?.data?.length || 0,
        entreprises: entCount,
      });

      setConvEntreprises((convEnt.length > 0 ? convEnt : allEnt).slice(0, 5));
      setTodayEvents(todayRes?.data || []);

      setUpcomingEvents(
        (eventsRes?.data || [])
          .filter(e => (e?.date_debut?.slice(0, 10) >= todayStr))
          .sort((a, b) => (a?.date_debut || '').localeCompare(b?.date_debut || ''))
      );

      const mine = myRes?.data || [];
      const allPlan = planningRes?.data || [];
      const displayPlanning = (mine.length > 0 ? mine : allPlan).slice(0, 6);
      setMyPlanning(displayPlanning);
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
        background: 'var(--surface)',
        borderRadius: 16,
        padding: '20px 24px',
        border: '1px solid var(--border)',
        borderTop: '4px solid #0284c7',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
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
              letterSpacing: 0.5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}>
              <span>{roleMeta.icon}</span> {roleMeta.label}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
              ● Connecté en direct · GMT Ariana
            </span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, color: 'var(--text)', letterSpacing: -0.5 }}>
            Bonjour, {user?.prenom || 'Système'} 👋
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)', textTransform: 'capitalize' }}>
            {todayFormatted} · Tableau de bord exécutif, statistiques & activités du jour
          </p>
        </div>

        {/* Quick actions in header */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => navigate('/planning')}
            style={{ fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: 10 }}
          >
            📋 Planning
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => navigate('/entreprises')}
            style={{ fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: 10 }}
          >
            🏢 Entreprises
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setRefreshing(true);
              load();
              toast?.('Données actualisées', 'info');
            }}
            disabled={refreshing}
            style={{
              fontWeight: 800,
              fontSize: 12.5,
              padding: '8px 16px',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 14px rgba(14,165,233,.35)'
            }}
            title="Actualiser les données"
          >
            {refreshing ? '⏳ Actualisation...' : '🔄 Actualiser'}
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
                      {todayEvents.length} visite(s) médicale(s) prévue(s) ce jour
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

          {/* Prochaines Visites Médicales */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  📋 Prochaines Visites Médicales
                </h3>
                <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: '2px 0 0' }}>
                  Planning des consultations et examens médicaux assignés
                </p>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => navigate('/planning')}
                style={{ fontSize: 11.5 }}
              >
                Planning complet ➔
              </button>
            </div>

            {myPlanning.length === 0 ? (
              <div style={{
                padding: '20px 16px', background: 'var(--surface2)', borderRadius: 10,
                textAlign: 'center', border: '1px dashed var(--border)'
              }}>
                <span style={{ fontSize: 22 }}>📅</span>
                <p style={{ fontWeight: 600, fontSize: 13, margin: '6px 0 2px', color: 'var(--text)' }}>
                  Aucune visite médicale programmée pour le moment
                </p>
                <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: '0 0 10px' }}>
                  Vous pouvez ajouter une nouvelle visite médicale au calendrier.
                </p>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate('/planning')}
                  style={{ fontSize: 11.5 }}
                >
                  ➕ Ajouter une visite
                </button>
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
                        {p.titre || p.type_visite || 'Visite médicale'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>
                        📅 {p.date} {p.heure_debut ? `· ⏰ ${p.heure_debut}` : ''} {p.medecin_nom ? `· 👨‍⚕️ ${p.medecin_nom}` : ''} {p.adresse ? `· 📍 ${p.adresse}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                      Planifié
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Interventions (Entreprises Conventionnées) */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  🏢 Interventions (Entreprises Conventionnées)
                </h3>
                <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: '2px 0 0' }}>
                  Annuaire des entreprises partenaires sous convention d'intervention
                </p>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => navigate('/entreprises')}
                style={{ fontSize: 11.5, color: 'var(--primary)' }}
              >
                Gérer ({stats.entreprises}) ➔
              </button>
            </div>

            {convEntreprises.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-2)', fontSize: 12.5 }}>
                Aucune entreprise enregistrée.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {convEntreprises.map(ent => (
                  <div
                    key={ent.id}
                    onClick={() => navigate('/entreprises')}
                    style={{
                      padding: '10px 12px', background: 'var(--surface2)', borderRadius: 10,
                      border: '1px solid var(--border)', borderLeft: '3px solid #10b981',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                      cursor: 'pointer', transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                        {ent.nom}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                        {ent.secteur ? `🏷️ ${ent.secteur}` : 'Secteur général'}
                        {ent.adresse ? ` · 📍 ${ent.adresse}` : ''}
                        {ent.telephone ? ` · 📞 ${ent.telephone}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                      Conventionnée
                    </span>
                  </div>
                ))}
              </div>
            )}
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

          {/* Raccourcis Métier */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: 'var(--text)' }}>
              ⚡ Raccourcis Métier
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { title: '📅 Planning Médical', desc: 'Gestion des visites périodiques et d\'embauche', path: '/planning', color: '#10b981' },
                { title: '🏢 Entreprises Conventionnées', desc: 'Fiches et suivi des entreprises partenaires', path: '/entreprises', color: '#0ea5e9' },
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
