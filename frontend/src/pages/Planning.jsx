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
import ExportDropdown from '../components/ExportDropdown';
import RapportActiviteMedecinModal from '../components/RapportActiviteMedecinModal';
import NavigationSelector from '../components/NavigationSelector';


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

const HEALTH_EVENT_PRESETS = [
  {
    id: 'octobre_rose',
    label: 'Octobre Rose',
    title: 'Octobre Rose - Dépistage Cancer du Sein & Sensibilisation',
    color: '#db2777',
    bgColor: '#fdf2f8',
    borderColor: '#fbcfe8',
    programme: 'Sensibilisation au dépistage du cancer du sein, auto-palpation et consultations d\'orientation.',
  },
  {
    id: 'cancer_prostate',
    label: 'Cancer Prostate',
    title: 'Movember - Dépistage & Prévention Cancer de la Prostate',
    color: '#2563eb',
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe',
    programme: 'Campagne de sensibilisation et dépistage précoce des pathologies prostatiques chez les collaborateurs masculins.',
  },
  {
    id: 'nutrition',
    label: 'Nutrition & Santé',
    title: 'Atelier Nutrition & Hygiène Alimentaire au Travail',
    color: '#16a34a',
    bgColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    programme: 'Atelier conseils diététiques, hygiène alimentaire, hydratation et prévention des risques cardiométaboliques.',
  },
  {
    id: 'don_sang',
    label: 'Don de Sang & Diabète',
    title: 'Journée Don de Sang & Dépistage Diabète / HTA',
    color: '#dc2626',
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
    programme: 'Collecte de sang solidaire, dépistage glycémie à jeun et prise de tension artérielle.',
  },
  {
    id: 'sante_mentale',
    label: 'Santé Mentale',
    title: 'Prévention Santé Mentale, RPS & Gestion du Stress',
    color: '#9333ea',
    bgColor: '#faf5ff',
    borderColor: '#e9d5ff',
    programme: 'Sensibilisation aux risques psychosociaux (RPS), relaxation, gestion du stress au travail et bien-être.',
  },
  {
    id: 'anti_tabac',
    label: 'Sevrage Tabagique',
    title: 'Mois Sans Tabac & Dépistage Souffle Pulmonaire',
    color: '#ea580c',
    bgColor: '#fff7ed',
    borderColor: '#fed7aa',
    programme: 'Accompagnement à l\'arrêt du tabac, mesure du monoxyde de carbone (CO) et spirométrie de dépistage.',
  },
  {
    id: 'vision_audition',
    label: 'Vision & Audition',
    title: 'Campagne Dépistage Défauts Visuels & Auditifs',
    color: '#0d9488',
    bgColor: '#f0fdfa',
    borderColor: '#99f6e4',
    programme: 'Tests de dépistage visuel (acuité visuelle, fatigue oculaire) et examens audiométriques au travail.',
  },
  {
    id: 'journee_sante',
    label: 'Journée Santé',
    title: 'Journée Prévention Santé, Ergonomie & Postures',
    color: '#4f46e5',
    bgColor: '#eef2ff',
    borderColor: '#c7d2fe',
    programme: 'Ateliers ergonomie des postes de travail, prévention des TMS, étirements et check-up santé global.',
  },
  {
    id: 'hse',
    label: 'HSE & Sécurité',
    title: 'Campagne HSE (Hygiène, Sécurité & Environnement)',
    color: '#d97706',
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    programme: 'Sensibilisation aux règles d\'hygiène, sécurité au travail, port des EPI et prévention des risques environnementaux.',
  },
];

function isHealthCampaign(titre = '') {
  if (!titre) return false;
  const t = String(titre).toLowerCase();
  return (
    t.includes('rose') ||
    t.includes('prostate') ||
    t.includes('movember') ||
    t.includes('nutrition') ||
    t.includes('hse') ||
    t.includes('securit') ||
    t.includes('sécurit') ||
    t.includes('hygi') ||
    t.includes('environn') ||
    t.includes('epi') ||
    t.includes('campagne') ||
    t.includes('sensibilisation') ||
    t.includes('dépistage') ||
    t.includes('depistage') ||
    t.includes('don de sang') ||
    t.includes('sang') ||
    t.includes('diab') ||
    t.includes('santé mentale') ||
    t.includes('mentale') ||
    t.includes('stress') ||
    t.includes('tabac') ||
    t.includes('poumon') ||
    t.includes('respir') ||
    t.includes('sevrage') ||
    t.includes('vision') ||
    t.includes('audit') ||
    t.includes('ergonomie') ||
    t.includes('journée santé') ||
    t.includes('journee sante') ||
    t.includes('🎗️') ||
    t.includes('💙') ||
    t.includes('🥗') ||
    t.includes('🩸') ||
    t.includes('🧠') ||
    t.includes('🫁') ||
    t.includes('👁️') ||
    t.includes('🛡️')
  );
}

function getEventTheme(titre = '', type = '') {
  const t = String(titre || '').toLowerCase();
  const isEv = type === 'evenement' || isHealthCampaign(titre);
  if (!isEv && type !== 'evenement') return null;

  if (t.includes('hse') || t.includes('securit') || t.includes('sécurit') || t.includes('hygi') || t.includes('environn') || t.includes('epi')) {
    return {
      label: 'HSE & Sécurité',
      shortLabel: 'HSE',
      bg: '#fffbeb',
      border: '#fde68a',
      borderDark: '#d97706',
      text: '#92400e',
      badgeBg: '#d97706',
      badgeColor: '#ffffff',
    };
  }
  if (t.includes('rose') || t.includes('sein')) {
    return {
      label: 'Octobre Rose',
      shortLabel: 'Octobre Rose',
      bg: '#fdf2f8',
      border: '#fbcfe8',
      borderDark: '#db2777',
      text: '#9d174d',
      badgeBg: '#db2777',
      badgeColor: '#ffffff',
    };
  }
  if (t.includes('prostate') || t.includes('movember') || t.includes('bleu')) {
    return {
      label: 'Cancer Prostate',
      shortLabel: 'Prostate',
      bg: '#eff6ff',
      border: '#bfdbfe',
      borderDark: '#2563eb',
      text: '#1e40af',
      badgeBg: '#2563eb',
      badgeColor: '#ffffff',
    };
  }
  if (t.includes('nutrition') || t.includes('aliment') || t.includes('diét')) {
    return {
      label: 'Atelier Nutrition',
      shortLabel: 'Nutrition',
      bg: '#f0fdf4',
      border: '#bbf7d0',
      borderDark: '#16a34a',
      text: '#166534',
      badgeBg: '#16a34a',
      badgeColor: '#ffffff',
    };
  }
  if (t.includes('sang') || t.includes('don') || t.includes('diab')) {
    return {
      label: 'Don de Sang & Diabète',
      shortLabel: 'Don / Diabète',
      bg: '#fef2f2',
      border: '#fecaca',
      borderDark: '#dc2626',
      text: '#991b1b',
      badgeBg: '#dc2626',
      badgeColor: '#ffffff',
    };
  }
  if (t.includes('mentale') || t.includes('stress') || t.includes('psych') || t.includes('rps')) {
    return {
      label: 'Santé Mentale & Stress',
      shortLabel: 'Santé Mentale',
      bg: '#faf5ff',
      border: '#e9d5ff',
      borderDark: '#9333ea',
      text: '#6b21a8',
      badgeBg: '#9333ea',
      badgeColor: '#ffffff',
    };
  }
  if (t.includes('tabac') || t.includes('poumon') || t.includes('respir') || t.includes('souffle')) {
    return {
      label: 'Sevrage Tabagique',
      shortLabel: 'Anti-Tabac',
      bg: '#fff7ed',
      border: '#fed7aa',
      borderDark: '#ea580c',
      text: '#9a3412',
      badgeBg: '#ea580c',
      badgeColor: '#ffffff',
    };
  }
  if (t.includes('vision') || t.includes('audit') || t.includes('vue') || t.includes('ouie') || t.includes('ocul')) {
    return {
      label: 'Vision & Audition',
      shortLabel: 'Dépistage Sensoriel',
      bg: '#f0fdfa',
      border: '#99f6e4',
      borderDark: '#0d9488',
      text: '#115e59',
      badgeBg: '#0d9488',
      badgeColor: '#ffffff',
    };
  }
  return {
    label: 'Événement Santé',
    shortLabel: 'Événement',
    bg: '#fdf4ff',
    border: '#f5d0fe',
    borderDark: '#c026d3',
    text: '#86198f',
    badgeBg: '#c026d3',
    badgeColor: '#ffffff',
  };
}

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

function DetailModal({ item, isAdmin, onEdit, onDelete, onClose }) {
  if (!item) return null;
  const { user } = useAuth();
  const isHSE = user?.role === 'hse';
  const isClino = item._t === 'cl' || item._t === 'clino' || Boolean(item.is_clino || item.clino_id);
  const theme = getEventTheme(item.titre, item.type);
  const isEv = Boolean(theme || item.type === 'evenement' || item._t === 'e');
  const isProg = !isEv && (item._t === 'p' || (!isClino && item.date && !item.heure));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: isClino ? '#059669' : (isEv && theme ? theme.badgeBg : (isEv ? '#c026d3' : '#0284c7')),
              color: '#fff',
              fontSize: 11,
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: 6,
              textTransform: 'uppercase',
            }}>
              {isClino ? 'Clino Mobile' : (isEv && theme ? theme.label : (isEv ? 'Événement / Campagne' : 'Visite Médicale'))}
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
                  Clino Lié
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
              {fmtDisplayWithDay(item.date || item.date_debut?.slice(0, 10))}
              {item.heure_debut && ` • ${item.heure_debut}${item.heure_fin ? ' → ' + item.heure_fin : ''}`}
              {item.heure && ` • ${String(item.heure).slice(0, 5)}`}
            </div>
          </div>

          {/* Medical Team & Assigned Participants */}
          {item.participants && item.participants.length > 0 ? (
            <div style={{ background: 'var(--surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                Intervenants & Participants assignés ({item.participants.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {item.participants.map((p, idx) => {
                  const isDoc = p.role === 'medecin';
                  const isTec = p.role === 'technicien';
                  const isAdmin = p.role === 'administrateur';
                  return (
                    <span
                      key={idx}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 20,
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: isDoc ? '#e0f2fe' : isTec ? '#ccfbf1' : isAdmin ? '#f3e8ff' : '#f1f5f9',
                        color: isDoc ? '#0369a1' : isTec ? '#0f766e' : isAdmin ? '#7e22ce' : '#334155',
                        border: `1px solid ${isDoc ? '#bae6fd' : isTec ? '#99f6e4' : isAdmin ? '#e9d5ff' : '#cbd5e1'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <span>{isDoc ? `Dr. ${p.prenom || ''} ${p.nom}` : `${p.prenom || ''} ${p.nom}`}</span>
                      <span style={{ fontSize: 9.5, opacity: 0.7, fontWeight: 600 }}>({p.role})</span>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: '#f0f9ff', padding: '10px 12px', borderRadius: 8, border: '1px solid #bae6fd' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', marginBottom: 2 }}>
                  Médecin
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  {item.medecin_nom || item.medecin_full ? `Dr. ${item.medecin_nom || item.medecin_full}` : 'Non assigné'}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 2 }}>
                  Technicien
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  {item.technicien_nom || item.technicien_full || 'Non assigné'}
                </div>
              </div>
            </div>
          )}

          {/* Workforce / Effectif examiné */}
          {(item.nb_examines > 0 || isProg || isClino || isEv) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: isEv && theme ? theme.bg : '#f0fdf4', border: `1px solid ${isEv && theme ? theme.border : '#bbf7d0'}` }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: isEv && theme ? theme.text : '#166534', textTransform: 'uppercase' }}>
                  {isEv ? 'Participants attendus / Vus' : 'Effectif examiné / vus'}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: isEv && theme ? theme.text : '#14532d' }}>
                  {item.nb_examines ? `${item.nb_examines} ${isEv ? 'participants' : 'salariés examinés'}` : 'Non renseigné'}
                </div>
              </div>
              {!isHSE && (
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  style={{ fontSize: 11, fontWeight: 700, borderColor: isEv && theme ? theme.borderDark : '#16a34a', color: isEv && theme ? theme.borderDark : '#16a34a' }}
                  onClick={() => {
                    const val = prompt(`Saisir le nombre de ${isEv ? 'participants' : 'salariés'} :`, item.nb_examines || '');
                    if (val !== null && !isNaN(val)) {
                      axios.patch(`/api/planning/${item.id}/effectif`, { nb_examines: parseInt(val, 10) })
                        .then(() => {
                          item.nb_examines = parseInt(val, 10);
                          onClose();
                          window.dispatchEvent(new CustomEvent('planning_refresh'));
                        })
                        .catch((err) => alert(err.response?.data?.message || 'Erreur lors de la mise à jour'));
                    }
                  }}
                >
                  Modifier effectif
                </button>
              )}
            </div>
          )}

          {/* Location & Navigation */}
          {(item.adresse || item.lieu) && (
            <div style={{ background: 'var(--surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>
                Lieu / Adresse de rendez-vous
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
                Instructions & Commentaires
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
                style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Supprimer
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {isAdmin && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => { onEdit(item); onClose(); }}
                style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                Modifier
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
  const { user } = useAuth();
  const isHSE = user?.role === 'hse';
  const init = event || {};
  const initialIsEvent = Boolean(
    init.type === 'evenement' ||
    (init.titre && isHealthCampaign(init.titre))
  );
  const [programType, setProgramType] = useState(initialIsEvent ? 'evenement' : 'visite');
  const [is_clino, setIsClino] = useState(Boolean(init.is_clino || init.clino_id || init._t === 'clino' || init._t === 'cl'));
  const [f, setF] = useState({
    titre: init.titre || '',
    entreprise_id: init.entreprise_id || null,
    entreprise_nom: init.entreprise_nom || '',
    date: toRaw(init.date) || defaultDate || format(new Date(), 'yyyy-MM-dd'),
    heure_debut: init.heure_debut || '',
    heure_fin: init.heure_fin || '',
    adresse: init.adresse || '',
    medecin_id: init.medecin_id || defaultMedecinId || '',
    technicien_id: init.technicien_id || defaultTechnicienId || '',
    nb_examines: init.nb_examines !== undefined ? init.nb_examines : '',
    programme: init.commentaire || init.programme || '',
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
      const payload = {
        ...f,
        type: programType,
        is_clino: is_clino ? 1 : 0
      };
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
      <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              {init.id
                ? (programType === 'evenement' ? 'Modifier l\'événement' : 'Modifier le programme')
                : (programType === 'evenement' ? 'Nouvel événement / campagne' : 'Nouveau programme / visite')}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              {programType === 'evenement'
                ? 'Campagne de prévention, dépistage ou atelier santé'
                : 'Planification d\'intervention médicale ou visite d\'entreprise'}
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Sélecteur de Type : Visite Médicale vs Événement / Campagne */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
              Type de programme à planifier *
            </label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              padding: 4,
              background: 'var(--surface2)',
              borderRadius: 12,
              border: '1px solid var(--border)',
            }}>
              <button
                type="button"
                onClick={() => setProgramType('visite')}
                style={{
                  padding: '9px 12px',
                  borderRadius: 9,
                  fontWeight: 800,
                  fontSize: 13,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all 0.2s',
                  background: programType === 'visite' ? 'var(--primary)' : 'transparent',
                  color: programType === 'visite' ? '#fff' : 'var(--text-2)',
                  boxShadow: programType === 'visite' ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
                }}
              >
                <span>Visite Médicale</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setProgramType('evenement');
                  if (f.titre === 'Visite médicale') s('titre', '');
                }}
                style={{
                  padding: '9px 12px',
                  borderRadius: 9,
                  fontWeight: 800,
                  fontSize: 13,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all 0.2s',
                  background: programType === 'evenement' ? '#0284c7' : 'transparent',
                  color: programType === 'evenement' ? '#fff' : 'var(--text-2)',
                  boxShadow: programType === 'evenement' ? '0 2px 8px rgba(2,132,199,0.25)' : 'none',
                }}
              >
                <span>Événement / Campagne</span>
              </button>
            </div>
          </div>

          {/* Bouton de liaison Clino Mobile */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 10,
            border: is_clino ? '2px solid #059669' : '1px solid var(--border)',
            background: is_clino ? '#ecfdf5' : 'var(--surface2)',
            transition: 'all 0.2s ease',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: is_clino ? '#059669' : 'var(--border)',
                color: is_clino ? '#fff' : 'var(--text-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: is_clino ? '#065f46' : 'var(--text)' }}>
                  Lier au Clino Mobile (Unité Mobile)
                </div>
                <div style={{ fontSize: 11, color: is_clino ? '#047857' : 'var(--text-3)', marginTop: 1 }}>
                  {is_clino
                    ? 'Visible sur le planning médecin ET le planning Clino Mobile'
                    : 'Activer pour associer cette intervention à l\'unité mobile Clino'}
                </div>
              </div>
            </div>
            <button
              type="button"
              className={`btn btn-sm ${is_clino ? 'btn-primary' : 'btn-outline'}`}
              style={{
                fontWeight: 800,
                padding: '5px 12px',
                borderRadius: 8,
                background: is_clino ? '#059669' : 'transparent',
                borderColor: is_clino ? '#059669' : 'var(--border)',
                color: is_clino ? '#fff' : 'var(--text-2)',
                flexShrink: 0,
              }}
              onClick={() => setIsClino(!is_clino)}
            >
              {is_clino ? 'Clino Actif' : 'Associer Clino'}
            </button>
          </div>

          {/* Form fields: Visite vs Événement */}
          {programType === 'evenement' ? (
            <>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Intitulé de l'événement ou de la campagne *</span>
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Saisie libre</span>
                </div>
                <input
                  className="input"
                  type="text"
                  value={f.titre}
                  onChange={e => s('titre', e.target.value)}
                  placeholder="Tapez le titre de l'événement (ex: HSE, Octobre Rose, Nutrition, Don de sang...)"
                  required
                  autoFocus
                  style={{ fontWeight: 700, fontSize: 13.5 }}
                />

                {/* Suggestions discrètes et professionnelles */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)' }}>Suggestions rapides :</span>
                  {HEALTH_EVENT_PRESETS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        s('titre', p.title);
                        if (!f.programme) s('programme', p.programme);
                      }}
                      style={{
                        background: f.titre === p.title ? 'var(--primary)' : 'var(--surface2)',
                        color: f.titre === p.title ? '#fff' : 'var(--text-2)',
                        border: `1px solid ${f.titre === p.title ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 6,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'all 0.15s ease',
                      }}
                      title={`Pré-remplir : ${p.title}`}
                    >
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Entreprise d'accueil / Partenaire (optionnel)</span>
                </label>
                <EnterpriseAutocomplete
                  value={f.entreprise_nom || (allEnts.find(e => String(e.id) === String(f.entreprise_id))?.nom || '')}
                  entreprises={allEnts}
                  placeholder="Laisser vide si événement général, ou choisir une entreprise hôte..."
                  onChange={val => {
                    s('entreprise_nom', val);
                    if (!val) s('entreprise_id', null);
                  }}
                  onSelect={ent => {
                    s('entreprise_id', ent.id);
                    s('entreprise_nom', ent.nom);
                    if (ent.adresse && !f.adresse) s('adresse', ent.adresse);
                  }}
                />
              </div>
            </>
          ) : (
            <div className="form-group">
              <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Entreprise conventionnée / Titre de la visite *</span>
              </label>
              <EnterpriseAutocomplete
                value={f.titre}
                entreprises={allEnts}
                placeholder="Tapez le nom de l'entreprise conventionnée..."
                onChange={val => s('titre', val)}
                onSelect={ent => {
                  s('titre', ent.nom);
                  s('entreprise_id', ent.id);
                  if (ent.adresse) s('adresse', ent.adresse);
                }}
                required
              />
            </div>
          )}

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
                  <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Technicien assigné</label>
              <select className="input" value={f.technicien_id} onChange={e => s('technicien_id', e.target.value)}>
                <option value="">— Aucun technicien —</option>
                {techniciens?.map(t => (
                  <option key={t.id} value={t.id}>{t.prenom} {t.nom}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>
                {programType === 'evenement' ? 'Participants attendus / Effectif cible' : 'Effectif examiné / prévu (Salariés)'}
              </label>
              <input
                className="input"
                type="number"
                min="0"
                value={isHSE && programType !== 'evenement' ? '' : f.nb_examines}
                disabled={isHSE && programType !== 'evenement'}
                onChange={e => s('nb_examines', e.target.value)}
                placeholder={isHSE && programType !== 'evenement' ? 'Réservé au corps médical' : (programType === 'evenement' ? 'Ex: 50 participants' : 'Ex: 25 salariés')}
                title={isHSE && programType !== 'evenement' ? "L'ajout d'effectif clinique de salariés est réservé au corps médical" : ''}
                style={{ fontWeight: 700 }}
              />
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>
                {programType === 'evenement' ? 'Programme, Thématique & Objectifs' : 'Commentaire / Instructions'}
              </label>
              <input
                className="input"
                type="text"
                value={f.programme}
                onChange={e => s('programme', e.target.value)}
                placeholder={programType === 'evenement' ? 'Objectifs, ateliers, sensibilisation...' : 'Notes de visite...'}
              />
            </div>
          </div>

          {!init.id && (
            <div style={{ padding: '8px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 12, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              <span>Une notification email sera automatiquement envoyée aux intervenants.</span>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !f.date || !f.titre}>
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Event (calendar) modal ─────────────────────────────────── */
function EventModal({ event, defaultDate, medecins = [], techniciens = [], entreprises = [], onSave, onClose, toast }) {
  const init = event || {};
  const defaultDt = defaultDate ? `${defaultDate}T08:00` : '';
  const [f, setF] = useState({
    titre: init.titre || '',
    type: init.type || 'Visite médicale',
    date_debut: init.date_debut?.slice(0, 16) || defaultDt,
    date_fin: init.date_fin?.slice(0, 16) || '',
    lieu: init.lieu || '',
    medecin_id: init.medecin_id || '',
    technicien_id: init.technicien_id || '',
  });
  const [is_clino, setIsClino] = useState(Boolean(init.is_clino || init.clino_id));
  const [allEnts, setAllEnts] = useState(entreprises || []);
  const [allStaff, setAllStaff] = useState([]);
  const [staffFilter, setStaffFilter] = useState('');
  const [staffTab, setStaffTab] = useState('all'); // 'all' | 'medecin' | 'technicien' | 'administrateur'
  const [selectedParticipants, setSelectedParticipants] = useState(() => {
    if (Array.isArray(init.participants) && init.participants.length > 0) {
      return init.participants;
    }
    const initial = [];
    if (init.medecin_id) {
      const doc = medecins.find(m => String(m.id) === String(init.medecin_id));
      if (doc) initial.push({ id: doc.id, nom: doc.nom, prenom: doc.prenom, role: 'medecin' });
    }
    if (init.technicien_id) {
      const tec = techniciens.find(t => String(t.id) === String(init.technicien_id));
      if (tec) initial.push({ id: tec.id, nom: tec.nom, prenom: tec.prenom, role: 'technicien' });
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entreprises && entreprises.length > 0) {
      setAllEnts(entreprises);
    } else {
      axios.get('/api/entreprises').then(r => setAllEnts(r.data || [])).catch(() => {});
    }
  }, [entreprises]);

  useEffect(() => {
    axios.get('/api/users').then(r => {
      const users = (r.data || []).filter(u => u.is_active !== 0);
      setAllStaff(users);
    }).catch(() => {
      // Fallback to medecins + techniciens if users endpoint fails
      const fallback = [
        ...medecins.map(m => ({ ...m, role: 'medecin' })),
        ...techniciens.map(t => ({ ...t, role: 'technicien' })),
      ];
      setAllStaff(fallback);
    });
  }, [medecins, techniciens]);

  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const toggleParticipant = (user) => {
    setSelectedParticipants(prev => {
      const exists = prev.some(p => String(p.id) === String(user.id));
      if (exists) {
        return prev.filter(p => String(p.id) !== String(user.id));
      } else {
        return [...prev, { id: user.id, nom: user.nom, prenom: user.prenom, role: user.role }];
      }
    });
  };

  const removeParticipant = (userId) => {
    setSelectedParticipants(prev => prev.filter(p => String(p.id) !== String(userId)));
  };

  async function save() {
    if (!f.titre || !f.date_debut) return;
    setSaving(true);
    try {
      const firstDoc = selectedParticipants.find(p => p.role === 'medecin');
      const firstTec = selectedParticipants.find(p => p.role === 'technicien');

      const payload = {
        titre: f.titre,
        type: f.type || 'Visite médicale',
        date_debut: f.date_debut,
        date_fin: f.date_fin || null,
        lieu: f.lieu || '',
        medecin_id: firstDoc ? Number(firstDoc.id) : (f.medecin_id ? Number(f.medecin_id) : null),
        technicien_id: firstTec ? Number(firstTec.id) : (f.technicien_id ? Number(f.technicien_id) : null),
        participants: selectedParticipants,
        is_clino: is_clino ? 1 : 0,
      };
      if (init.id) await axios.put(`/api/events/${init.id}`, payload);
      else         await axios.post('/api/events', payload);
      onSave();
    } catch(e) {
      const msg = e.response?.data?.message || 'Erreur lors de l\'enregistrement';
      toast ? toast(msg, 'error') : alert(msg);
    }
    finally { setSaving(false); }
  }

  // Filter staff by search and tab
  const filteredStaff = allStaff.filter(user => {
    if (staffTab !== 'all' && user.role !== staffTab) return false;
    if (staffFilter) {
      const q = staffFilter.toLowerCase();
      const fullName = `${user.prenom || ''} ${user.nom || ''}`.toLowerCase();
      const roleName = (user.role || '').toLowerCase();
      return fullName.includes(q) || roleName.includes(q);
    }
    return true;
  });

  const docsCount = allStaff.filter(u => u.role === 'medecin').length;
  const tecsCount = allStaff.filter(u => u.role === 'technicien').length;
  const adminsCount = allStaff.filter(u => u.role === 'administrateur').length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              {init.id ? 'Modifier l\'événement' : 'Nouvel événement calendrier'}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              Événement avec multi-participants (Médecins, Techniciens, Administrateurs)
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', paddingRight: 6 }}>
          {/* Bouton de liaison Clino Mobile */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 10,
            border: is_clino ? '2px solid #059669' : '1px solid var(--border)',
            background: is_clino ? '#ecfdf5' : 'var(--surface2)',
            transition: 'all 0.2s ease',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: is_clino ? '#059669' : 'var(--border)',
                color: is_clino ? '#fff' : 'var(--text-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: is_clino ? '#065f46' : 'var(--text)' }}>
                  Lier au Clino Mobile (Unité Mobile)
                </div>
                <div style={{ fontSize: 11, color: is_clino ? '#047857' : 'var(--text-3)', marginTop: 1 }}>
                  {is_clino
                    ? 'Visible dans le planning ET sur le planning Clino Mobile'
                    : 'Activer pour synchroniser cet événement sur Clino Mobile'}
                </div>
              </div>
            </div>
            <button
              type="button"
              className={`btn btn-sm ${is_clino ? 'btn-primary' : 'btn-outline'}`}
              style={{
                fontWeight: 800,
                padding: '5px 12px',
                borderRadius: 8,
                background: is_clino ? '#059669' : 'transparent',
                borderColor: is_clino ? '#059669' : 'var(--border)',
                color: is_clino ? '#fff' : 'var(--text-2)',
                flexShrink: 0,
              }}
              onClick={() => setIsClino(!is_clino)}
            >
              {is_clino ? 'Clino Actif' : 'Associer Clino'}
            </button>
          </div>

          {/* Entreprise conventionnée / Titre de la visite * */}
          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Entreprise conventionnée / Titre de l'événement *</label>
            <EnterpriseAutocomplete
              value={f.titre}
              entreprises={allEnts}
              placeholder="Tapez le titre ou sélectionnez une entreprise conventionnée..."
              onChange={val => s('titre', val)}
              onSelect={ent => {
                s('titre', ent.nom);
                if (ent.adresse) s('lieu', ent.adresse);
              }}
              required
            />
          </div>

          {/* Type d'événement (Main libre & Suggestions rapides) */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontWeight: 600 }}>Type d'événement * (Saisie libre)</label>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Suggestions rapides :</span>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
              {[
                { val: 'Visite médicale', label: 'Visite' },
                { val: 'Octobre Rose', label: 'Octobre Rose', autoTitre: 'Octobre Rose - Dépistage Cancer du Sein' },
                { val: 'Cancer de la Prostate', label: 'Prostate', autoTitre: 'Movember - Dépistage Cancer de la Prostate' },
                { val: 'Atelier Nutrition', label: 'Nutrition', autoTitre: 'Atelier Nutrition & Santé au Travail' },
                { val: 'Don de Sang', label: 'Don de Sang', autoTitre: 'Journée Don de Sang & Dépistage Diabète' },
                { val: 'Santé Mentale', label: 'Santé Mentale', autoTitre: 'Prévention Santé Mentale & Bien-être' },
                { val: 'Réunion de service', label: 'Réunion' },
                { val: 'Formation', label: 'Formation' },
                { val: 'Séminaire / Atelier', label: 'Séminaire' },
                { val: 'Intervention site', label: 'Intervention' },
                { val: 'Congés / Absence', label: 'Congés' },
                { val: 'Autre', label: 'Autre' },
              ].map(t => (
                <button
                  key={t.val}
                  type="button"
                  className={`btn btn-xs ${f.type === t.val ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}
                  onClick={() => {
                    s('type', t.val);
                    if (t.autoTitre && (!f.titre || f.titre === 'Visite médicale')) s('titre', t.autoTitre);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              className="input"
              placeholder="Tapez librement le type (ex: Visite médicale, Réunion, Formation, Séminaire...)"
              value={f.type}
              onChange={e => s('type', e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Date & Heure début *</label>
              <input
                className="input"
                type="datetime-local"
                value={f.date_debut}
                onChange={e => s('date_debut', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>Date & Heure fin (optionnel)</label>
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

          {/* SECTION MULTI-PARTICIPANTS (Médecins, Techniciens, Admins) */}
          <div style={{
            background: 'var(--surface2)',
            borderRadius: 12,
            padding: '12px 14px',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div>
                <label style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Participants & Intervenants assignés
                </label>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                  Sélectionnez plusieurs intervenants (Médecins, Techniciens et Administrateurs)
                </div>
              </div>
              {selectedParticipants.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  style={{ color: 'var(--danger)', fontSize: 11, fontWeight: 700 }}
                  onClick={() => setSelectedParticipants([])}
                >
                  Effacer tout
                </button>
              )}
            </div>

            {/* Selected badges chips */}
            {selectedParticipants.length > 0 && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                padding: '8px 10px',
                background: 'var(--surface)',
                borderRadius: 8,
                border: '1px solid var(--border)',
                marginBottom: 10,
              }}>
                {selectedParticipants.map(p => {
                  const isDoc = p.role === 'medecin';
                  const isTec = p.role === 'technicien';
                  const isAdmin = p.role === 'administrateur';
                  return (
                    <span
                      key={p.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 8px',
                        borderRadius: 16,
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: isDoc ? '#e0f2fe' : isTec ? '#ccfbf1' : isAdmin ? '#f3e8ff' : '#f1f5f9',
                        color: isDoc ? '#0369a1' : isTec ? '#0f766e' : isAdmin ? '#7e22ce' : '#334155',
                        border: `1px solid ${isDoc ? '#bae6fd' : isTec ? '#99f6e4' : isAdmin ? '#e9d5ff' : '#cbd5e1'}`,
                      }}
                    >
                      <span>{isDoc ? `Dr. ${p.prenom || ''} ${p.nom}` : `${p.prenom || ''} ${p.nom}`}</span>
                      <button
                        type="button"
                        onClick={() => removeParticipant(p.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 12,
                          color: 'inherit',
                          opacity: 0.7,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Retirer"
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Filter Tabs & Search Bar */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto' }}>
                <button
                  type="button"
                  className={`btn btn-xs ${staffTab === 'all' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}
                  onClick={() => setStaffTab('all')}
                >
                  Tous ({allStaff.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${staffTab === 'medecin' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}
                  onClick={() => setStaffTab('medecin')}
                >
                  Médecins ({docsCount})
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${staffTab === 'technicien' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}
                  onClick={() => setStaffTab('technicien')}
                >
                  Techniciens ({tecsCount})
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${staffTab === 'administrateur' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}
                  onClick={() => setStaffTab('administrateur')}
                >
                  Admins ({adminsCount})
                </button>
              </div>
            </div>

            <input
              className="input"
              style={{ fontSize: 12, padding: '6px 10px', marginBottom: 8 }}
              placeholder="Filtrer les participants par nom ou rôle..."
              value={staffFilter}
              onChange={e => setStaffFilter(e.target.value)}
            />

            {/* List of staff cards for multi-selection */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 6,
              maxHeight: 180,
              overflowY: 'auto',
              paddingRight: 4,
            }}>
              {filteredStaff.map(user => {
                const isSelected = selectedParticipants.some(p => String(p.id) === String(user.id));
                const isDoc = user.role === 'medecin';
                const isTec = user.role === 'technicien';
                const isAdmin = user.role === 'administrateur';

                return (
                  <div
                    key={user.id}
                    onClick={() => toggleParticipant(user)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      border: isSelected
                        ? `2px solid ${isDoc ? '#0284c7' : isTec ? '#0d9488' : '#7e22ce'}`
                        : '1px solid var(--border)',
                      background: isSelected
                        ? (isDoc ? '#e0f2fe' : isTec ? '#ccfbf1' : '#f3e8ff')
                        : 'var(--surface)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: isDoc ? '#0284c7' : isTec ? '#0d9488' : isAdmin ? '#7e22ce' : '#64748b',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}>
                      {isDoc ? 'Dr' : isTec ? 'Tech' : isAdmin ? 'Adm' : 'Usr'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: isSelected ? 800 : 600,
                        color: 'var(--text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {isDoc ? `Dr. ${user.prenom || ''} ${user.nom}` : `${user.prenom || ''} ${user.nom}`}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'capitalize' }}>
                        {user.role}
                      </div>
                    </div>

                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: isSelected ? 'none' : '1.5px solid var(--border)',
                      background: isSelected ? (isDoc ? '#0284c7' : isTec ? '#0d9488' : '#7e22ce') : 'transparent',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 900,
                      flexShrink: 0,
                    }}>
                      {isSelected && '✓'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ flexShrink: 0, marginTop: 4 }}>
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !f.titre || !f.date_debut}>
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Enregistrer'}
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
      padding: '7px 14px',
      background: 'var(--surface2)',
      borderBottom: '1px solid var(--border)',
      color: 'var(--text)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
      overflowX: 'auto',
      whiteSpace: 'nowrap',
      WebkitOverflowScrolling: 'touch',
    }}>
      <span style={{ fontWeight: 800, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, color: 'var(--primary)' }}>
        Aujourd'hui ({tp.length + tc.length + tcl.length}) :
      </span>
      {tp.map(e => (
        <span key={'tp' + e.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 16, fontSize: 11.5, fontWeight: 600, flexShrink: 0, color: 'var(--text)' }}>
          {e.heure_debut ? e.heure_debut + ' ' : ''}{e.titre || 'Programme'}{e.medecin_nom ? ' · Dr. ' + e.medecin_nom : ''}{e.technicien_nom ? ' · ' + e.technicien_nom : ''}
        </span>
      ))}
      {tc.map(e => (
        <span key={'tc' + e.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 16, fontSize: 11.5, flexShrink: 0, color: 'var(--text)' }}>
          {e.titre}{e.lieu ? ' · ' + e.lieu : ''}
        </span>
      ))}
      {tcl.map(e => (
        <span key={'tcl' + e.id} style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: 16, fontSize: 11.5, fontWeight: 600, flexShrink: 0, color: '#065f46' }}>
          Clino · {e.entreprise_nom || e.planning_titre || e.titre || 'Mission'}{e.heure ? ' · ' + String(e.heure).slice(0, 5) : ''}{e.medecin_nom ? ' · Dr. ' + e.medecin_nom : ''}{e.technicien_nom ? ' · ' + e.technicien_nom : ''}
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
  ce = [],
  cl = [],
  medecins = [],
  techniciens = [],
  entreprises = [],
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

    [...pe, ...cl, ...ce].forEach(item => {
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

      // Check participants array
      if (Array.isArray(item.participants)) {
        item.participants.forEach(p => {
          if (p.role === 'medecin') {
            const pIdStr = String(p.id);
            const pNorm = `${p.prenom || ''} ${p.nom || ''}`.toLowerCase().replace(/^dr\.?\s*/i, '').trim();
            if (!seenIds.has(pIdStr)) {
              seenIds.add(pIdStr);
              if (pNorm) seenNames.add(pNorm);
              list.push({
                id: p.id,
                nom: p.nom,
                prenom: p.prenom || '',
              });
            }
          }
        });
      }
    });

    return list;
  }, [medecins, pe, cl, ce]);

  // 2. Extract distinct technicians
  const techniciansList = useMemo(() => {
    const list = [...techniciens];
    const seenIds = new Set(list.map(t => String(t.id)));
    const seenNames = new Set(list.map(t => `${t.prenom || ''} ${t.nom || ''}`.toLowerCase().trim()));

    [...pe, ...cl, ...ce].forEach(item => {
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

      // Check participants array
      if (Array.isArray(item.participants)) {
        item.participants.forEach(p => {
          if (p.role === 'technicien') {
            const pIdStr = String(p.id);
            const pNorm = `${p.prenom || ''} ${p.nom || ''}`.toLowerCase().trim();
            if (!seenIds.has(pIdStr)) {
              seenIds.add(pIdStr);
              if (pNorm) seenNames.add(pNorm);
              list.push({
                id: p.id,
                nom: p.nom,
                prenom: p.prenom || '',
              });
            }
          }
        });
      }
    });

    return list;
  }, [techniciens, pe, cl, ce]);

  const isTechnician = staffRole === 'technicien';
  const activeStaffList = isTechnician ? techniciansList : doctorsList;

  const hasUnassignedEvents = useMemo(() => {
    if (isTechnician) {
      return [...pe, ...cl, ...ce].some(e => {
        const hasTec = Boolean(e.technicien_id || (e.technicien_nom && e.technicien_nom !== '—' && e.technicien_nom !== '-') || (Array.isArray(e.participants) && e.participants.some(p => p.role === 'technicien')));
        return !hasTec;
      });
    }
    return [...pe, ...cl, ...ce].some(e => {
      const hasDoc = Boolean(e.medecin_id || (e.medecin_nom && e.medecin_nom !== '—' && e.medecin_nom !== '-') || (Array.isArray(e.participants) && e.participants.some(p => p.role === 'medecin')));
      return !hasDoc;
    });
  }, [pe, cl, ce, isTechnician]);

  const eventsIndex = useMemo(() => {
    const map = new Map();
    const add = (day, staffKey, type, ev) => {
      if (!day) return;
      const k = `${day}_${staffKey}`;
      let slot = map.get(k);
      if (!slot) {
        slot = { pEvents: [], clEvents: [], cEvents: [] };
        map.set(k, slot);
      }
      if (type === 'p') slot.pEvents.push(ev);
      else if (type === 'cl') slot.clEvents.push(ev);
      else if (type === 'c') slot.cEvents.push(ev);
    };

    pe.forEach(ev => {
      const d = toRaw(ev.date);
      if (isTechnician) {
        const key = ev.technicien_id ? String(ev.technicien_id) : (ev.technicien_nom ? `name_${ev.technicien_nom.toLowerCase().trim()}` : 'unassigned');
        add(d, key, 'p', ev);
        if (!ev.technicien_id && (!ev.technicien_nom || ev.technicien_nom === '—' || ev.technicien_nom === '-')) {
          add(d, 'unassigned', 'p', ev);
        }
      } else {
        const key = ev.medecin_id ? String(ev.medecin_id) : (ev.medecin_nom ? `name_${ev.medecin_nom.toLowerCase().trim()}` : 'unassigned');
        add(d, key, 'p', ev);
        if (!ev.medecin_id && (!ev.medecin_nom || ev.medecin_nom === '—' || ev.medecin_nom === '-')) {
          add(d, 'unassigned', 'p', ev);
        }
      }
    });

    cl.forEach(ev => {
      const d = toRaw(ev.date);
      if (isTechnician) {
        const key = ev.technicien_id ? String(ev.technicien_id) : ((ev.technicien_nom || ev.technicien_full) ? `name_${(ev.technicien_nom || ev.technicien_full).toLowerCase().trim()}` : 'unassigned');
        add(d, key, 'cl', ev);
        if (!ev.technicien_id && !ev.technicien_nom && !ev.technicien_full) {
          add(d, 'unassigned', 'cl', ev);
        }
      } else {
        const key = ev.medecin_id ? String(ev.medecin_id) : ((ev.medecin_nom || ev.medecin_full) ? `name_${(ev.medecin_nom || ev.medecin_full).toLowerCase().trim()}` : 'unassigned');
        add(d, key, 'cl', ev);
        if (!ev.medecin_id && !ev.medecin_nom && !ev.medecin_full) {
          add(d, 'unassigned', 'cl', ev);
        }
      }
    });

    ce.forEach(ev => {
      const d = (ev.date_debut || '').slice(0, 10);
      if (Array.isArray(ev.participants) && ev.participants.length > 0) {
        ev.participants.forEach(p => {
          if ((isTechnician && p.role === 'technicien') || (!isTechnician && p.role === 'medecin')) {
            add(d, String(p.id), 'c', ev);
          }
        });
      } else {
        const sId = isTechnician ? ev.technicien_id : ev.medecin_id;
        const sNom = isTechnician ? ev.technicien_nom : ev.medecin_nom;
        const key = sId ? String(sId) : (sNom ? `name_${sNom.toLowerCase().trim()}` : 'unassigned');
        add(d, key, 'c', ev);
      }
    });

    return map;
  }, [pe, cl, ce, isTechnician]);

  const EMPTY_SLOT = useMemo(() => Object.freeze({ pEvents: [], clEvents: [], cEvents: [] }), []);

  const getStaffEvents = useCallback((staffMember, dayKey) => {
    if (!staffMember) {
      return eventsIndex.get(`${dayKey}_unassigned`) || EMPTY_SLOT;
    }
    const staffId = String(staffMember.id);
    const byId = eventsIndex.get(`${dayKey}_${staffId}`);
    if (byId) return byId;

    const staffName = `${staffMember.prenom || ''} ${staffMember.nom || ''}`.toLowerCase().trim();
    if (staffName) {
      const byName = eventsIndex.get(`${dayKey}_name_${staffName}`);
      if (byName) return byName;
    }

    return EMPTY_SLOT;
  }, [eventsIndex, EMPTY_SLOT]);

  const staffStats = useMemo(() => {
    const stats = {};
    activeStaffList.forEach(staff => {
      let count = 0;
      days.forEach(d => {
        const key = typeof d === 'string' ? d : format(d, 'yyyy-MM-dd');
        const { pEvents, clEvents, cEvents } = getStaffEvents(staff, key);
        count += pEvents.length + clEvents.length + (cEvents ? cEvents.length : 0);
      });
      stats[staff.id] = count;
    });
    return stats;
  }, [activeStaffList, days, pe, cl, ce, isTechnician]);

  const displayedStaffList = useMemo(() => {
    if (!activeFilterSummary) return activeStaffList;
    const withEvents = activeStaffList.filter(staff => (staffStats[staff.id] || 0) > 0);
    return withEvents.length > 0 ? withEvents : activeStaffList;
  }, [activeStaffList, staffStats, activeFilterSummary]);

  const displayedDays = useMemo(() => {
    if (!activeFilterSummary) return days;
    const withEvents = days.filter(dayObj => {
      const dayKey = typeof dayObj === 'string' ? dayObj : format(dayObj, 'yyyy-MM-dd');
      const hasStaffEv = displayedStaffList.some(staff => {
        const { pEvents, clEvents, cEvents } = getStaffEvents(staff, dayKey);
        return (pEvents.length + clEvents.length + (cEvents ? cEvents.length : 0)) > 0;
      });
      if (hasStaffEv) return true;
      if (hasUnassignedEvents) {
        const { pEvents, clEvents, cEvents } = getStaffEvents(null, dayKey);
        return (pEvents.length + clEvents.length + (cEvents ? cEvents.length : 0)) > 0;
      }
      return false;
    });
    return withEvents.length > 0 ? withEvents : days;
  }, [days, displayedStaffList, getStaffEvents, hasUnassignedEvents, activeFilterSummary]);

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
        days: displayedDays,
        staffList: displayedStaffList,
        staffRole,
        hasUnassigned: hasUnassignedEvents,
        getStaffEvents,
        title: `Planning ${isTechnician ? 'Technique' : 'Médical'} : ${periodLabel}`,
        subtitle: `GROUPEMENT DE MÉDECINE DU TRAVAIL DE L'ARIANA — Matrice ${isTechnician ? 'Techniciens' : 'Médecins'} & Jours`,
      });
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 10 }}>
      {/* ── Active Filter Bar ── */}
      {activeFilterSummary && (
        <div style={{
          marginBottom: 6,
          padding: '5px 12px',
          background: 'rgba(2, 132, 199, 0.08)',
          border: '1px solid rgba(2, 132, 199, 0.25)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11.5,
          fontWeight: 700,
          color: 'var(--primary-dk, #0369a1)',
        }}>
          <span>{activeFilterSummary} — Affichage de <strong>{displayedDays.length} jour(s)</strong> et <strong>{displayedStaffList.length} {isTechnician ? 'technicien(s)' : 'médecin(s)'}</strong></span>
        </div>
      )}

      {/* ── MATRIX TABLE (Exact PC Version - Smooth Multi-directional Scrolling) ── */}
      <div className="print-matrix-wrapper" style={{
        width: '100%',
        maxWidth: '100%',
        overflowX: 'auto',
        overflowY: 'visible',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-x pan-y',
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
          minWidth: Math.max(600, 80 + (displayedStaffList.length + (hasUnassignedEvents ? 1 : 0)) * 180),
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
                  Jour
                </div>
                <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text)' }}>
                  {view === 'week' ? 'Sem.' : 'Mois'}
                </div>
              </th>

              {displayedStaffList.map((staff) => {
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
                          ? '#0d9488'
                          : '#0284c7',
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
                      fontSize: 11,
                    }}>
                      {isTechnician ? 'T' : '—'}
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
            {displayedDays.map(dayObj => {
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
                  {displayedStaffList.map(staff => {
                    const { pEvents, clEvents, cEvents } = getStaffEvents(staff, dayKey);
                    const totalCellEvents = pEvents.length + clEvents.length + (cEvents ? cEvents.length : 0);

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
                            const theme = getEventTheme(ev.titre, ev.type);
                            const isEv = Boolean(theme || ev.type === 'evenement');
                            const cardBg = isCl ? '#ecfdf5' : (isEv && theme ? theme.bg : '#f0f9ff');
                            const cardBorderLeft = isCl ? '3.5px solid #059669' : (isEv && theme ? `3.5px solid ${theme.borderDark}` : '3.5px solid #0284c7');
                            const cardBorder = isCl ? '1px solid #a7f3d0' : (isEv && theme ? `1px solid ${theme.border}` : '1px solid #bae6fd');
                            const badgeBg = isCl ? '#059669' : (isEv && theme ? theme.badgeBg : '#0284c7');
                            const badgeText = isCl ? 'Clino' : (isEv && theme ? theme.shortLabel : 'Visite');

                            return (
                              <div
                                key={'p' + ev.id}
                                onClick={() => onSelectDetail?.({ ...ev, _t: 'p' })}
                                style={{
                                  background: cardBg,
                                  borderRadius: 8,
                                  padding: '8px 10px',
                                  borderLeft: cardBorderLeft,
                                  border: cardBorder,
                                  borderLeftWidth: 3.5,
                                  cursor: 'pointer',
                                  boxShadow: isCl ? '0 1px 3px rgba(5,150,105,0.08)' : (isEv ? '0 1px 3px rgba(219,39,119,0.08)' : '0 1px 3px rgba(2,132,199,0.06)'),
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{
                                    fontSize: 9,
                                    fontWeight: 800,
                                    background: badgeBg,
                                    color: '#fff',
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}>
                                    {badgeText} {ev.heure_debut || ''}
                                  </span>
                                  {ev.heure_fin && (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: isCl ? '#047857' : (isEv && theme ? theme.text : '#0369a1') }}>
                                      → {ev.heure_fin}
                                    </span>
                                  )}
                                </div>

                                <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginTop: 4, lineHeight: 1.25 }}>
                                  {ev.titre || ev.entreprise_nom || (isEv ? 'Événement santé' : 'Visite médicale')}
                                </div>

                                {ev.nb_examines > 0 && (
                                  <div style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: isEv && theme ? theme.text : '#0369a1',
                                    marginTop: 2,
                                  }}>
                                    {ev.nb_examines} {isEv ? 'participants' : 'salariés'}
                                  </div>
                                )}

                                {/* Counterpart info */}
                                {isTechnician ? (
                                  ev.medecin_nom && (
                                    <div style={{ fontSize: 10, fontWeight: 600, color: '#0369a1', marginTop: 2 }}>
                                      Dr. {ev.medecin_nom}
                                    </div>
                                  )
                                ) : (
                                  ev.technicien_nom && (
                                    <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginTop: 2 }}>
                                      {ev.technicien_nom}
                                    </div>
                                  )
                                )}

                                {ev.adresse && (
                                  <div style={{ marginTop: 3 }}>
                                    <MapLink addr={ev.adresse} style={{ fontSize: 10 }} />
                                  </div>
                                )}

                                {isAdmin && (
                                  <div className="no-print" style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', justifyContent: 'flex-end', paddingTop: 4, borderTop: isEv && theme ? `1px solid ${theme.border}` : '1px solid #e0f2fe' }}>
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      style={{ padding: '2px 4px', fontSize: 10, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center' }}
                                      title="Modifier"
                                      onClick={e => { e.stopPropagation(); setModal({ t: 'p', data: ev }); }}
                                    >
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    </button>
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      style={{ padding: '2px 4px', fontSize: 10, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center' }}
                                      title="Supprimer"
                                      onClick={e => { e.stopPropagation(); setConfirm({ _t: 'p', t: 'p', id: ev.id, titre: ev.titre }); }}
                                    >
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {cEvents?.map(ev => {
                            const c = TYPE_COLORS[ev.type] || TYPE_COLORS.autre;
                            const isCl = Boolean(ev.is_clino || ev.clino_id);
                            return (
                              <div
                                key={'c' + ev.id}
                                onClick={() => onSelectDetail?.({ ...ev, _t: 'e' })}
                                style={{
                                  background: isCl ? '#ecfdf5' : c.bg,
                                  borderRadius: 8,
                                  padding: '8px 10px',
                                  borderLeft: isCl ? '3.5px solid #059669' : `3.5px solid ${c.border}`,
                                  border: isCl ? '1px solid #a7f3d0' : `1px solid ${c.border}40`,
                                  borderLeftWidth: 3.5,
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{
                                    fontSize: 9,
                                    fontWeight: 800,
                                    background: isCl ? '#059669' : c.border,
                                    color: '#fff',
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}>
                                    {isCl ? 'Clino' : 'Événement'} {ev.date_debut ? ev.date_debut.slice(11, 16) : ''}
                                  </span>
                                  {ev.date_fin && (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: isCl ? '#047857' : c.text }}>
                                      → {ev.date_fin.slice(11, 16)}
                                    </span>
                                  )}
                                </div>

                                <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginTop: 4, lineHeight: 1.25 }}>
                                  {ev.titre}
                                </div>

                                {isTechnician ? (
                                  ev.medecin_nom && (
                                    <div style={{ fontSize: 10, fontWeight: 600, color: '#0369a1', marginTop: 2 }}>
                                      Dr. {ev.medecin_nom}
                                    </div>
                                  )
                                ) : (
                                  ev.technicien_nom && (
                                    <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginTop: 2 }}>
                                      {ev.technicien_nom}
                                    </div>
                                  )
                                )}

                                {ev.lieu && (
                                  <div style={{ marginTop: 3 }}>
                                    <MapLink addr={ev.lieu} style={{ fontSize: 10 }} />
                                  </div>
                                )}

                                {isAdmin && (
                                  <div className="no-print" style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      style={{ padding: '2px 4px', fontSize: 10, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center' }}
                                      title="Modifier"
                                      onClick={e => { e.stopPropagation(); setModal({ t: 'e', data: ev }); }}
                                    >
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    </button>
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      style={{ padding: '2px 4px', fontSize: 10, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center' }}
                                      title="Supprimer"
                                      onClick={e => { e.stopPropagation(); setConfirm({ _t: 'e', t: 'e', id: ev.id, titre: ev.titre }); }}
                                    >
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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
                                  Clino {ev.heure ? String(ev.heure).slice(0, 5) : ''}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginTop: 4, lineHeight: 1.25 }}>
                                {ev.entreprise_nom || ev.planning_titre || ev.titre || 'Mission Clino Mobile'}
                              </div>
                              {isTechnician ? (
                                (ev.medecin_full || ev.medecin_nom) && (
                                  <div style={{ fontSize: 10, color: '#0369a1', marginTop: 2 }}>
                                    Dr. {ev.medecin_full || ev.medecin_nom}
                                  </div>
                                )
                              ) : (
                                (ev.technicien_full || ev.technicien_nom) && (
                                  <div style={{ fontSize: 10, color: '#065f46', marginTop: 2 }}>
                                    {ev.technicien_full || ev.technicien_nom}
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
                                    style={{ padding: '2px 4px', fontSize: 10, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center' }}
                                    onClick={e => { e.stopPropagation(); setConfirm({ _t: 'cl', t: 'cl', id: ev.id, titre: ev.entreprise_nom || ev.planning_titre || 'Clino Mobile' }); }}
                                  >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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
                        const { pEvents, clEvents, cEvents } = getStaffEvents(null, dayKey);
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {pEvents.map(ev => {
                              const theme = getEventTheme(ev.titre, ev.type);
                              const isEv = Boolean(theme || ev.type === 'evenement');
                              return (
                                <div key={'un_p' + ev.id} onClick={() => onSelectDetail?.({ ...ev, _t: 'p' })} style={{ background: isEv && theme ? theme.bg : '#fef3c7', borderRadius: 8, padding: 6, borderLeft: `3px solid ${isEv && theme ? theme.borderDark : '#f59e0b'}`, fontSize: 11, cursor: 'pointer' }}>
                                  <div style={{ fontWeight: 800, color: isEv && theme ? theme.text : '#b45309' }}>{isEv && theme ? theme.shortLabel + ' ' : ''}{ev.titre}</div>
                                  {ev.adresse && <div style={{ marginTop: 2 }}><MapLink addr={ev.adresse} style={{ fontSize: 10 }} /></div>}
                                </div>
                              );
                            })}
                            {cEvents?.map(ev => (
                              <div key={'un_c' + ev.id} onClick={() => onSelectDetail?.({ ...ev, _t: 'e' })} style={{ background: '#fef3c7', borderRadius: 8, padding: 6, borderLeft: '3px solid #f59e0b', fontSize: 11, cursor: 'pointer' }}>
                                <div style={{ fontWeight: 800, color: '#b45309' }}>{ev.titre}</div>
                                {ev.lieu && <div style={{ marginTop: 2 }}><MapLink addr={ev.lieu} style={{ fontSize: 10 }} /></div>}
                              </div>
                            ))}
                            {clEvents.map(ev => (
                              <div key={'un_cl' + ev.id} onClick={() => onSelectDetail?.({ ...ev, _t: 'cl' })} style={{ background: '#ecfdf5', borderRadius: 8, padding: 6, borderLeft: '3px solid #059669', fontSize: 11, cursor: 'pointer' }}>
                                <div style={{ fontWeight: 800, color: '#065f46' }}>
                                  {ev.entreprise_nom || ev.planning_titre || ev.titre || 'Mission Clino Mobile'}{ev.heure ? ' ' + String(ev.heure).slice(0, 5) : ''}
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
          entreprises={entreprises}
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
          medecins={medecins}
          techniciens={techniciens}
          entreprises={entreprises}
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
function MonthView({ current, pe, ce, cl = [], isAdmin, medecins, techniciens, entreprises = [], onRefresh, toast, onSelectDetail }) {
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;

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
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: isSmallScreen ? 'column' : 'row', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isSmallScreen ? '8px 6px' : 14, paddingBottom: isSmallScreen ? 80 : 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
          {DAYS_SHORT_FR.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', padding: '4px 0', textTransform: 'uppercase' }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: isSmallScreen ? 3 : 6 }}>
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
                  minHeight: isSmallScreen ? 58 : 84,
                  padding: isSmallScreen ? 3 : 7,
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: sel ? 'var(--primary-lt)' : today ? '#fff7ed' : 'var(--surface)',
                  border: `1.5px solid ${sel ? 'var(--primary)' : today ? '#f97316' : 'var(--border)'}`,
                  opacity: inMon ? 1 : 0.4,
                  transition: 'all .1s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: isSmallScreen ? 11 : 13, fontWeight: today ? 900 : 700, color: today ? '#f97316' : 'var(--text)' }}>
                    {format(day, 'd')}
                  </span>
                  {today && (
                    <span style={{ fontSize: 8, fontWeight: 800, background: '#f97316', color: '#fff', padding: '1px 4px', borderRadius: 8 }}>
                      {isSmallScreen ? '•' : 'Aujourd\'hui'}
                    </span>
                  )}
                </div>
                {pEvts.slice(0, 1).map(ev => {
                  const theme = getEventTheme(ev.titre, ev.type);
                  const isEv = Boolean(theme || ev.type === 'evenement');
                  const bg = isEv && theme ? theme.bg : '#e0f2fe';
                  const color = isEv && theme ? theme.text : '#0284c7';
                  const border = isEv && theme ? theme.borderDark : '#0ea5e9';
                  return (
                    <div key={'p' + ev.id} style={{ fontSize: 9.5, padding: '1px 3px', borderRadius: 3, background: bg, color: color, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderLeft: `2px solid ${border}` }}>
                      {ev.titre || 'Programme'}
                    </div>
                  );
                })}
                {clEvts.slice(0, 1).map(ev => (
                  <div key={'cl' + ev.id} style={{ fontSize: 9.5, padding: '1px 3px', borderRadius: 3, background: CLINO_COLOR.bg, color: CLINO_COLOR.text, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderLeft: `2px solid ${CLINO_COLOR.border}` }}>
                    {ev.entreprise_nom || ev.planning_titre || ev.titre || 'Clino'}
                  </div>
                ))}
                {cEvts.slice(0, 1).map(ev => {
                  const c = TYPE_COLORS[ev.type] || TYPE_COLORS.autre;
                  return (
                    <div key={'c' + ev.id} style={{ fontSize: 9.5, padding: '1px 3px', borderRadius: 3, background: c.bg, color: c.text, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderLeft: `2px solid ${c.border}` }}>
                      {ev.titre}
                    </div>
                  );
                })}
                {total > 2 && <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)' }}>+{total - 2}</div>}
              </div>
            );
          })}
        </div>
      </div>
      {selected && (
        <div style={{
          width: isSmallScreen ? '100%' : 320,
          maxHeight: isSmallScreen ? '45vh' : 'none',
          borderLeft: isSmallScreen ? 'none' : '1px solid var(--border)',
          borderTop: isSmallScreen ? '2px solid var(--primary)' : 'none',
          padding: isSmallScreen ? 12 : 16,
          overflowY: 'auto',
          background: 'var(--surface)',
          flexShrink: 0,
          boxShadow: isSmallScreen ? '0 -4px 16px rgba(0,0,0,0.1)' : 'none',
          paddingBottom: isSmallScreen ? 80 : 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <span style={{ fontWeight: 800, fontSize: 14 }}>{format(parseISO(selected), 'd MMMM yyyy', { locale: fr })}</span>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)' }}>Détail des activités de cette journée</p>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelected(null)}>✕</button>
          </div>
          {sp.length === 0 && sc.length === 0 && scl.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 10px', color: 'var(--text-3)' }}>
              <p style={{ fontSize: 12 }}>Aucun événement ce jour</p>
            </div>
          )}
          {sp.map(ev => {
            const theme = getEventTheme(ev.titre, ev.type);
            const isEv = Boolean(theme || ev.type === 'evenement');
            const bg = isEv && theme ? theme.bg : '#f0f9ff';
            const border = isEv && theme ? theme.border : '#bae6fd';
            const borderDark = isEv && theme ? theme.borderDark : '#0284c7';
            const titleColor = isEv && theme ? theme.text : '#0284c7';
            const icon = isEv && theme ? theme.shortLabel : 'Visite';
            return (
              <div key={'sp' + ev.id} onClick={() => onSelectDetail?.({ ...ev, _t: 'p' })} style={{ background: bg, borderRadius: 10, padding: '10px 12px', borderLeft: `4px solid ${borderDark}`, border: `1px solid ${border}`, borderLeftWidth: 4, marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: titleColor }}>{icon} · {ev.titre || 'Programme'}</div>
                {ev.heure_debut && <div style={{ fontSize: 11, fontWeight: 600, color: titleColor, marginTop: 2 }}>{ev.heure_debut}{ev.heure_fin ? ' → ' + ev.heure_fin : ''}</div>}
                {ev.nb_examines > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: titleColor, marginTop: 2 }}>{ev.nb_examines} {isEv ? 'participants' : 'salariés'}</div>}
                {ev.medecin_nom && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Dr. {ev.medecin_nom}</div>}
                {ev.technicien_nom && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{ev.technicien_nom}</div>}
                {ev.adresse && <div style={{ marginTop: 4 }}><MapLink addr={ev.adresse} style={{ fontSize: 11 }} /></div>}
              </div>
            );
          })}
          {scl.map(ev => (
            <div key={'scl' + ev.id} onClick={() => onSelectDetail?.({ ...ev, _t: 'cl' })} style={{ background: CLINO_COLOR.bg, borderRadius: 10, padding: '10px 12px', borderLeft: `4px solid ${CLINO_COLOR.border}`, border: `1px solid ${CLINO_COLOR.border}40`, borderLeftWidth: 4, marginBottom: 8, cursor: 'pointer' }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: CLINO_COLOR.text }}>
                Clino · {ev.entreprise_nom || ev.planning_titre || ev.titre || 'Mission Clino Mobile'}
              </div>
              {ev.heure && <div style={{ fontSize: 11, fontWeight: 600, color: '#047857', marginTop: 2 }}>{String(ev.heure).slice(0, 5)}</div>}
              {ev.medecin_nom && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Dr. {ev.medecin_nom}</div>}
              {ev.technicien_nom && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{ev.technicien_nom}</div>}
              {ev.adresse && <div style={{ marginTop: 4 }}><MapLink addr={ev.adresse} style={{ fontSize: 11 }} /></div>}
            </div>
          ))}
          {sc.map(ev => {
            const c = TYPE_COLORS[ev.type] || TYPE_COLORS.autre;
            return (
              <div key={'sc' + ev.id} onClick={() => onSelectDetail?.({ ...ev, _t: 'e' })} style={{ background: c.bg, borderRadius: 10, padding: '10px 12px', borderLeft: `4px solid ${c.border}`, marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: c.text }}>{ev.titre}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                  {format(parseISO(ev.date_debut), 'HH:mm', { locale: fr })}
                </div>
                {ev.medecin_nom && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Dr. {ev.medecin_nom}</div>}
                {ev.technicien_nom && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{ev.technicien_nom}</div>}
                {ev.lieu && <div style={{ marginTop: 4 }}><MapLink addr={ev.lieu} style={{ fontSize: 11 }} /></div>}
              </div>
            );
          })}
          {isAdmin && (
            <div style={{ marginTop: 12 }}>
              <button
                className="btn btn-primary btn-sm"
                style={{ width: '100%', fontSize: 12, fontWeight: 800, padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                onClick={() => setModal({ t: 'p', data: { date: selected, heure_debut: '', heure_fin: '' } })}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>Nouveau programme</span>
              </button>
            </div>
          )}
        </div>
      )}
      {modal?.t === 'p' && (
        <PlanningModal
          event={modal.data}
          medecins={medecins}
          techniciens={techniciens}
          entreprises={entreprises}
          defaultDate={modal.data?.date}
          onSave={() => { setModal(null); onRefresh(); toast('Enregistré avec succès ✓', 'success'); }}
          onClose={() => setModal(null)}
          toast={toast}
        />
      )}
      {modal?.t === 'e' && (
        <EventModal
          event={modal.data}
          medecins={medecins}
          techniciens={techniciens}
          entreprises={entreprises}
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

/* ── 4. AGENDA MOBILE VIEW (ULTRA-PRATIQUE SMARTPHONE & TERRAIN) ── */
function AgendaMobileView({
  selectedDate,
  onSelectDate,
  pe = [],
  ce = [],
  cl = [],
  medecins = [],
  techniciens = [],
  entreprises = [],
  isAdmin,
  onRefresh,
  toast,
  onSelectDetail,
  onAddEvent,
}) {
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  // Parse current selected date
  const parsedDate = useMemo(() => {
    try {
      const raw = toRaw(selectedDate) || format(new Date(), 'yyyy-MM-dd');
      const p = parseISO(raw);
      return isNaN(p.getTime()) ? new Date() : p;
    } catch {
      return new Date();
    }
  }, [selectedDate]);

  // Generate 7-day strip for the week containing selectedDate
  const weekStart = useMemo(() => startOfWeek(parsedDate, { weekStartsOn: 1 }), [parsedDate]);
  const stripDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  // Helper to count events for a given day
  const getDayCount = useCallback((d) => {
    const dStr = format(d, 'yyyy-MM-dd');
    const pCount = pe.filter(e => toRaw(e.date) === dStr).length;
    const cCount = ce.filter(e => toRaw(e.date_debut?.slice(0, 10)) === dStr).length;
    const clCount = cl.filter(e => toRaw(e.date) === dStr).length;
    return pCount + cCount + clCount;
  }, [pe, ce, cl]);

  // Events on the active day
  const activeDayStr = format(parsedDate, 'yyyy-MM-dd');

  const dayPe = useMemo(() => {
    return pe
      .filter(e => toRaw(e.date) === activeDayStr)
      .map(e => ({ ...e, _t: e.type === 'evenement' ? 'e' : 'p' }));
  }, [pe, activeDayStr]);

  const dayCe = useMemo(() => {
    return ce
      .filter(e => toRaw(e.date_debut?.slice(0, 10)) === activeDayStr)
      .map(e => ({ ...e, _t: 'e' }));
  }, [ce, activeDayStr]);

  const dayCl = useMemo(() => {
    return cl
      .filter(e => toRaw(e.date) === activeDayStr)
      .map(e => ({ ...e, _t: 'cl' }));
  }, [cl, activeDayStr]);

  // Combined and sorted by start time
  const dayEvents = useMemo(() => {
    return [...dayPe, ...dayCe, ...dayCl].sort((a, b) => {
      const timeA = a.heure_debut || a.heure || '00:00';
      const timeB = b.heure_debut || b.heure || '00:00';
      return timeA.localeCompare(timeB);
    });
  }, [dayPe, dayCe, dayCl]);

  // Map of enterprise phones by name or id
  const phoneByEnterprise = useMemo(() => {
    const map = {};
    entreprises.forEach(ent => {
      const p = ent.telephone || ent.tel || ent.contact_tel;
      if (ent.nom && p) map[ent.nom.toLowerCase().trim()] = p;
      if (ent.id && p) map[String(ent.id)] = p;
    });
    return map;
  }, [entreprises]);

  async function del(item) {
    try {
      const type = item._t || item.t;
      if (type === 'p') await axios.delete(`/api/planning/${item.id}`);
      else if (type === 'cl' || type === 'clino') await axios.delete(`/api/clino/${item.id}`);
      else await axios.delete(`/api/events/${item.id}`);
      toast?.('Intervention supprimée', 'info');
      onRefresh?.();
    } catch {
      toast?.('Erreur lors de la suppression', 'error');
    } finally {
      setConfirm(null);
    }
  }

  const dayLabel = format(parsedDate, 'EEEE d MMMM yyyy', { locale: fr });
  const capitalizedDayLabel = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
  const isSelectedToday = isTodayFn(parsedDate);

  return (
    <div className="agenda-mobile-view" style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {/* ── 1. Ergonomic Day Selector Strip ── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '10px 8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
      }}>
        {/* Navigation Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onSelectDate(format(addDays(parsedDate, -1), 'yyyy-MM-dd'))}
              title="Jour précédent"
              style={{ width: 32, height: 32, padding: 0, borderRadius: 8, fontSize: 16 }}
            >
              ‹
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onSelectDate(format(new Date(), 'yyyy-MM-dd'))}
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '4px 8px',
                height: 28,
                borderRadius: 6,
                color: isSelectedToday ? 'var(--primary)' : 'var(--text)',
                background: isSelectedToday ? 'rgba(2, 132, 199, 0.08)' : 'transparent',
              }}
            >
              Aujourd'hui
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onSelectDate(format(addDays(parsedDate, 1), 'yyyy-MM-dd'))}
              title="Jour suivant"
              style={{ width: 32, height: 32, padding: 0, borderRadius: 8, fontSize: 16 }}
            >
              ›
            </button>
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)' }}>
            Sem. {getISOWeek(parsedDate)} · {format(parsedDate, 'MMMM yyyy', { locale: fr })}
          </div>
        </div>

        {/* 7-Day Horizontal Pills */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 4,
        }}>
          {stripDays.map(d => {
            const dKey = format(d, 'yyyy-MM-dd');
            const isSelected = dKey === activeDayStr;
            const isT = isTodayFn(d);
            const count = getDayCount(d);

            return (
              <button
                key={dKey}
                onClick={() => onSelectDate(dKey)}
                style={{
                  background: isSelected ? 'var(--primary)' : (isT ? 'rgba(2, 132, 199, 0.08)' : 'var(--surface2)'),
                  color: isSelected ? '#ffffff' : (isT ? 'var(--primary)' : 'var(--text)'),
                  border: isSelected ? '1px solid var(--primary)' : (isT ? '1px solid rgba(2, 132, 199, 0.3)' : '1px solid var(--border)'),
                  borderRadius: 10,
                  padding: '8px 2px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.15s ease',
                  outline: 'none',
                  minHeight: 56,
                }}
              >
                <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3, opacity: isSelected ? 0.9 : 0.7 }}>
                  {format(d, 'EEE', { locale: fr })}
                </span>
                <span style={{ fontSize: 15, fontWeight: 900, lineHeight: 1 }}>
                  {format(d, 'd')}
                </span>
                {count > 0 && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 900,
                    padding: '1px 5px',
                    borderRadius: 8,
                    background: isSelected ? 'rgba(255,255,255,0.3)' : 'var(--primary)',
                    color: '#ffffff',
                    lineHeight: 1.1,
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Active Day Header & Summary Bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 4px',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 900, margin: 0, color: 'var(--text)' }}>
            {capitalizedDayLabel}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{dayEvents.length} intervention{dayEvents.length > 1 ? 's' : ''} programmée{dayEvents.length > 1 ? 's' : ''}</span>
            {isSelectedToday && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#dcfce7', color: '#15803d' }}>
                Aujourd'hui
              </span>
            )}
          </div>
        </div>

        {isAdmin && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onAddEvent?.(activeDayStr)}
            style={{ fontWeight: 800, borderRadius: 8, padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Planifier</span>
          </button>
        )}
      </div>

      {/* ── 3. Cards List for Active Day ── */}
      {dayEvents.length === 0 ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px dashed var(--border)',
          borderRadius: 16,
          padding: '36px 20px',
          textAlign: 'center',
          color: 'var(--text-3)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--surface2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-3)',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>Aucune intervention prévue ce jour</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Profitez-en ou programmez une nouvelle visite médicale.</div>
          </div>
          {isAdmin && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => onAddEvent?.(activeDayStr)}
              style={{ fontWeight: 700, borderRadius: 8, marginTop: 4 }}
            >
              + Programmer une intervention
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {dayEvents.map((item, idx) => {
            const isClino = item._t === 'cl' || item._t === 'clino' || Boolean(item.is_clino || item.clino_id);
            const theme = getEventTheme(item.titre, item.type);
            const isEv = Boolean(theme || item.type === 'evenement' || item._t === 'e');
            const entName = item.entreprise_nom || item.planning_titre || item.titre || 'Mission Médicale';
            const phone = item.telephone || item.tel || phoneByEnterprise[entName.toLowerCase().trim()] || phoneByEnterprise[String(item.entreprise_id)];
            const addr = item.adresse || item.lieu || item.entreprise_adresse;

            const accentColor = isClino ? '#059669' : (isEv && theme ? theme.borderDark : (isEv ? '#c026d3' : '#0284c7'));
            const badgeBg = isClino ? '#ecfdf5' : (isEv && theme ? theme.bg : (isEv ? '#fdf4ff' : '#eff6ff'));
            const badgeColor = isClino ? '#065f46' : (isEv && theme ? theme.text : (isEv ? '#86198f' : '#1e40af'));
            const badgeLabel = isClino ? 'Clino Mobile' : (isEv && theme ? theme.label : (isEv ? 'Événement Santé' : 'Visite Médicale'));

            return (
              <div
                key={item._t + item.id + idx}
                onClick={() => onSelectDetail(item)}
                style={{
                  background: 'var(--surface)',
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  borderLeft: `5px solid ${accentColor}`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  padding: '14px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  cursor: 'pointer',
                  transition: 'transform 0.1s ease, box-shadow 0.15s ease',
                }}
              >
                {/* Header: Time & Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    <span>
                      {item.heure_debut ? `${String(item.heure_debut).slice(0, 5)} - ${item.heure_fin ? String(item.heure_fin).slice(0, 5) : 'Fin'}` : (item.heure ? String(item.heure).slice(0, 5) : 'Journée')}
                    </span>
                  </div>

                  <span style={{
                    background: badgeBg,
                    color: badgeColor,
                    fontSize: 10.5,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 6,
                    border: `1px solid ${accentColor}33`,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                  }}>
                    {badgeLabel}
                  </span>
                </div>

                {/* Body: Enterprise Title */}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{entName}</span>
                    {item.code && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                        {item.code}
                      </span>
                    )}
                  </div>
                  {item.nature && item.nature !== 'Standard' && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                      Nature : {item.nature}
                    </div>
                  )}
                </div>

                {/* GPS Address & 1-Tap Navigation */}
                {addr && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                    <NavigationSelector addr={addr} compact style={{ maxWidth: '100%' }} />
                    {phone && (
                      <a
                        href={`tel:${phone}`}
                        className="btn btn-outline btn-sm"
                        style={{
                          fontSize: 11,
                          height: 26,
                          padding: '2px 8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: '#16a34a',
                          borderColor: 'rgba(22, 163, 74, 0.3)',
                          background: 'rgba(22, 163, 74, 0.05)',
                          borderRadius: 6,
                          textDecoration: 'none',
                        }}
                        title={`Appeler le ${phone}`}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        <span>Appeler</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Assigned Personnel */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                  {item.medecin_nom && item.medecin_nom !== '—' && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', background: 'rgba(2, 132, 199, 0.08)', padding: '2px 7px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 3v5a5.5 5.5 0 0 0 11 0V3"></path><path d="M4.5 3H2v2"></path><path d="M15.5 3H18v2"></path><path d="M10 13.5v4.5a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3v-1.5"></path><circle cx="17" cy="14.5" r="2"></circle></svg>
                      <span>Dr. {item.medecin_nom}</span>
                    </span>
                  )}
                  {item.technicien_nom && item.technicien_nom !== '—' && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706', background: 'rgba(217, 119, 6, 0.08)', padding: '2px 7px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                      <span>Tech. {item.technicien_nom}</span>
                    </span>
                  )}
                  {item.chauffeur_nom && item.chauffeur_nom !== '—' && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: 'rgba(5, 150, 105, 0.08)', padding: '2px 7px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span>Chauff. {item.chauffeur_nom}</span>
                    </span>
                  )}
                  {Boolean(item.nb_salaries || item.nb_examines || item.effectif) && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginLeft: 'auto' }}>
                      {item.nb_examines ? `${item.nb_examines} / ` : ''}{item.nb_salaries || item.effectif || 0} salariés
                    </span>
                  )}
                </div>

                {/* Card Quick Action Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingTop: 6 }} onClick={e => e.stopPropagation()}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onSelectDetail(item)}
                    style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', height: 26 }}
                  >
                    Détails →
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setModal({ t: item._t === 'e' ? 'e' : 'p', data: item })}
                        style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', height: 26 }}
                      >
                        Modifier
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setConfirm({ _t: item._t, t: item._t, id: item.id, titre: entName })}
                        style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--danger)', padding: '3px 8px', height: 26 }}
                      >
                        Supprimer
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal inside AgendaMobileView if triggered */}
      {modal?.t === 'p' && (
        <PlanningModal
          event={modal?.data || null}
          medecins={medecins}
          techniciens={techniciens}
          entreprises={entreprises}
          defaultDate={modal?.data?.date || activeDayStr}
          onSave={() => { setModal(null); onRefresh?.(); toast?.('Visite mise à jour', 'success'); }}
          onClose={() => setModal(null)}
          toast={toast}
        />
      )}

      {modal?.t === 'e' && (
        <EventModal
          event={modal?.data || null}
          medecins={medecins}
          techniciens={techniciens}
          entreprises={entreprises}
          defaultDate={modal?.data?.date_debut?.slice(0, 10) || activeDayStr}
          onSave={() => { setModal(null); onRefresh?.(); toast?.('Événement mis à jour', 'success'); }}
          onClose={() => setModal(null)}
          toast={toast}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title="Confirmer la suppression"
          message={confirm.titre ? `Supprimer "${confirm.titre}" ? Cette action est irréversible.` : 'Action irréversible.'}
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
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'agenda' : 'doctor_matrix'));
  const [selectedAgendaDay, setSelectedAgendaDay] = useState(() => format(new Date(), 'yyyy-MM-dd'));
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
  const [showRapportModal, setShowRapportModal] = useState(false);

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

  const filterWeek = useCallback(arr => arr.filter(e => {
    const d = toRaw(e.date || e.date_debut?.slice(0, 10) || '');
    return d >= format(weekStart, 'yyyy-MM-dd') && d <= format(weekEnd, 'yyyy-MM-dd');
  }), [weekStart, weekEnd]);

  const filterMonth = useCallback(arr => arr.filter(e => {
    const d = toRaw(e.date || e.date_debut?.slice(0, 10) || '');
    if (!d) return false;
    const startStr = format(startOfMonth(monthDate), 'yyyy-MM-dd');
    const endStr   = format(endOfMonth(monthDate), 'yyyy-MM-dd');
    return d >= startStr && d <= endStr;
  }), [monthDate]);

  const filteredPe = useMemo(() => pe.filter(e => {
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
      const match = (e.titre || '').toLowerCase().includes(q) ||
                    (e.entreprise_nom || '').toLowerCase().includes(q) ||
                    (e.adresse || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filters.search) {
      const s = filters.search.toLowerCase().trim();
      const dateRaw = toRaw(e.date);
      const dateFmt = fmtDisplay(e.date).toLowerCase();
      const dateFmtDay = fmtDisplayWithDay(e.date).toLowerCase();
      const match = (e.titre || '').toLowerCase().includes(s) ||
                    (e.entreprise_nom || '').toLowerCase().includes(s) ||
                    (e.adresse || '').toLowerCase().includes(s) ||
                    (e.medecin_nom || '').toLowerCase().includes(s) ||
                    (e.technicien_nom || '').toLowerCase().includes(s) ||
                    (e.heure_debut || '').toLowerCase().includes(s) ||
                    (e.heure_fin || '').toLowerCase().includes(s) ||
                    (e.commentaire || '').toLowerCase().includes(s) ||
                    dateRaw.includes(s) ||
                    dateFmt.includes(s) ||
                    dateFmtDay.includes(s);
      if (!match) return false;
    }
    return true;
  }), [pe, filters]);

  const filteredCl = useMemo(() => cl.filter(e => {
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
      const s = filters.search.toLowerCase().trim();
      const dateRaw = toRaw(e.date);
      const dateFmt = fmtDisplay(e.date).toLowerCase();
      const dateFmtDay = fmtDisplayWithDay(e.date).toLowerCase();
      const match = (e.adresse || '').toLowerCase().includes(s) ||
                    (e.titre || '').toLowerCase().includes(s) ||
                    (e.entreprise_nom || '').toLowerCase().includes(s) ||
                    (e.planning_titre || '').toLowerCase().includes(s) ||
                    (e.medecin_nom || '').toLowerCase().includes(s) ||
                    (e.medecin_full || '').toLowerCase().includes(s) ||
                    (e.technicien_nom || '').toLowerCase().includes(s) ||
                    (e.technicien_full || '').toLowerCase().includes(s) ||
                    (e.heure ? String(e.heure).toLowerCase() : '').includes(s) ||
                    (e.commentaire || '').toLowerCase().includes(s) ||
                    dateRaw.includes(s) ||
                    dateFmt.includes(s) ||
                    dateFmtDay.includes(s);
      if (!match) return false;
    }
    return true;
  }), [cl, filters]);

  const filteredCe = useMemo(() => ce.filter(e => {
    if (filters.date && toRaw(e.date_debut?.slice(0, 10)) !== filters.date) return false;
    if (filters.role) return false;
    if (filters.entreprise) {
      const q = filters.entreprise.toLowerCase();
      const match = (e.titre || '').toLowerCase().includes(q) || (e.lieu || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filters.search) {
      const s = filters.search.toLowerCase().trim();
      const dateRaw = toRaw(e.date_debut?.slice(0, 10));
      const dateFmt = fmtDisplay(e.date_debut?.slice(0, 10)).toLowerCase();
      const dateFmtDay = fmtDisplayWithDay(e.date_debut?.slice(0, 10)).toLowerCase();
      const partNames = Array.isArray(e.participants) ? e.participants.map(p => `${p.prenom || ''} ${p.nom || ''}`.toLowerCase()).join(' ') : '';
      const match = (e.titre || '').toLowerCase().includes(s) ||
                    (e.lieu || '').toLowerCase().includes(s) ||
                    (e.description || '').toLowerCase().includes(s) ||
                    (e.type || '').toLowerCase().includes(s) ||
                    (e.date_debut || '').includes(s) ||
                    (e.date_fin || '').includes(s) ||
                    dateRaw.includes(s) ||
                    dateFmt.includes(s) ||
                    dateFmtDay.includes(s) ||
                    partNames.includes(s);
      if (!match) return false;
    }
    return true;
  }), [ce, filters]);

  const exportItems = useMemo(() => [
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
  ].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.heure_debut || '').localeCompare(b.heure_debut || '')), [filteredPe, filteredCl, filteredCe]);

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
      setSelectedAgendaDay(dateVal);
    }
  }

  function handleCreateForCurrentView() {
    const targetDate = view === 'agenda'
      ? selectedAgendaDay
      : view === 'week'
      ? format(weekStart, 'yyyy-MM-dd')
      : format(monthDate, 'yyyy-MM-01');
    setModal({
      t: 'p',
      data: {
        date: targetDate,
        heure_debut: '08:30',
        heure_fin: '12:30',
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

    const activeRawList = activeFilterSummary
      ? rawList.filter(staff => {
          return daysInterval.some(d => {
            const dayKey = format(d, 'yyyy-MM-dd');
            const { pEvents, clEvents } = getStaffEvs(staff, dayKey);
            return (pEvents.length + clEvents.length) > 0;
          });
        })
      : rawList;

    const finalRawList = activeRawList.length > 0 ? activeRawList : rawList;

    const activeDays = activeFilterSummary
      ? daysInterval.filter(d => {
          const dayKey = format(d, 'yyyy-MM-dd');
          const hasStaffEv = finalRawList.some(staff => {
            const { pEvents, clEvents } = getStaffEvs(staff, dayKey);
            return (pEvents.length + clEvents.length) > 0;
          });
          if (hasStaffEv) return true;
          const { pEvents, clEvents } = getStaffEvs(null, dayKey);
          return (pEvents.length + clEvents.length) > 0;
        })
      : daysInterval;

    const finalDays = activeDays.length > 0 ? activeDays : daysInterval;

    return {
      days: finalDays,
      staffList: finalRawList,
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
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: '100%', width: '100%', minHeight: '100%' }}>
      <div className="no-print">
        <TodayBanner pe={pe} ce={ce} cl={cl} />
      </div>


      {/* ── UNIFIED COMPACT TOOLBAR (Single Sleek Bar - Exact PC version) ── */}
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
              onClick={() => {
                if (view === 'agenda') {
                  setSelectedAgendaDay(d => format(addDays(parseISO(d), -1), 'yyyy-MM-dd'));
                } else if (view === 'week') {
                  setWeekStart(w => subWeeks(w, 1));
                } else {
                  setMonthDate(d => subMonths(d, 1));
                }
              }}
              title="Précédent"
            >
              ‹
            </button>
            <button
              className="btn btn-outline btn-sm"
              style={{ padding: '4px 10px', fontWeight: 700, fontSize: 11.5, height: 28 }}
              onClick={() => {
                const now = new Date();
                setWeekStart(currentWeekStart);
                setMonthDate(now);
                setSelectedAgendaDay(format(now, 'yyyy-MM-dd'));
              }}
            >
              Aujourd'hui
            </button>
            <button
              className="btn btn-outline btn-sm"
              style={{ padding: '4px 8px', fontWeight: 800, fontSize: 13, height: 28 }}
              onClick={() => {
                if (view === 'agenda') {
                  setSelectedAgendaDay(d => format(addDays(parseISO(d), 1), 'yyyy-MM-dd'));
                } else if (view === 'week') {
                  setWeekStart(w => addWeeks(w, 1));
                } else {
                  setMonthDate(d => addMonths(d, 1));
                }
              }}
              title="Suivant"
            >
              ›
            </button>
          </div>

          <h1 style={{ fontSize: 14.5, fontWeight: 900, margin: 0, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>
              {view === 'agenda'
                ? format(parseISO(selectedAgendaDay), 'EEEE d MMMM yyyy', { locale: fr })
                : view === 'week'
                ? `Sem. ${isoWeekNum} : ${format(weekStart, 'd MMM', { locale: fr })} - ${format(weekEnd, 'd MMM yyyy', { locale: fr })}`
                : format(monthDate, 'MMMM yyyy', { locale: fr }).toUpperCase()}
            </span>
          </h1>

          <input
            type="date"
            className="input"
            style={{ width: 'auto', fontSize: 11, padding: '2px 6px', height: 28, borderRadius: 6 }}
            value={view === 'agenda' ? selectedAgendaDay : format(view === 'week' ? weekStart : monthDate, 'yyyy-MM-dd')}
            onChange={e => handleJumpToDate(e.target.value)}
            title="Aller à une date précise"
          />
        </div>

        {/* Center: View Switcher */}
        <div className="planning-view-switcher" style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 8, padding: 2, border: '1px solid var(--border)', overflowX: 'auto', maxWidth: '100%' }}>
          {[
            ['agenda', 'Agenda'],
            ['week', 'Semaine'],
            ['doctor_matrix', 'Grille Mois'],
            ['month', 'Calendrier'],
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
            <option value="">Tous les rôles</option>
            <option value="medecin">Médecins</option>
            <option value="technicien">Techniciens</option>
          </select>

          {ents.length > 0 && (
            <select
              className="input"
              style={{ width: 'auto', maxWidth: 140, fontSize: 11.5, padding: '2px 6px', height: 28, borderRadius: 6 }}
              value={filters.entreprise}
              onChange={e => setFilters(f => ({ ...f, entreprise: e.target.value }))}
            >
              <option value="">Toutes entreprises</option>
              {ents.map(ent => <option key={ent.id} value={ent.nom}>{ent.nom}</option>)}
            </select>
          )}

          <input
            className="input"
            type="text"
            placeholder="Rechercher..."
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
              style={{ fontWeight: 800, borderRadius: 8, padding: '4px 12px', fontSize: 11.5, height: 28, display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={handleCreateForCurrentView}
              title="Planifier un programme : visite médicale ou événement santé"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Nouveau programme</span>
            </button>
          )}

          {/* Rapport Médical d'après le Planning */}
          <button
            className="btn btn-outline btn-sm"
            style={{
              fontWeight: 800,
              borderRadius: 8,
              padding: '4px 12px',
              fontSize: 11.5,
              height: 28,
              color: 'var(--primary)',
              borderColor: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
            onClick={() => setShowRapportModal(true)}
            title="Consulter et exporter le rapport d'activité médicale d'après le planning"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            <span>Rapport Médical</span>
          </button>

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
      {view === 'agenda' && (
        <AgendaMobileView
          selectedDate={selectedAgendaDay}
          onSelectDate={d => {
            setSelectedAgendaDay(d);
            setFilters(f => ({ ...f, date: '' }));
          }}
          pe={filteredPe}
          ce={filteredCe}
          cl={filteredCl}
          medecins={med}
          techniciens={tec}
          entreprises={ents}
          isAdmin={isAdmin}
          onRefresh={() => setTick(t => t + 1)}
          toast={toast}
          onSelectDetail={item => setDetailItem(item)}
          onAddEvent={(day) => {
            setModal({
              t: 'p',
              data: {
                date: day || selectedAgendaDay,
                heure_debut: '08:30',
                heure_fin: '12:30',
              },
            });
          }}
        />
      )}

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
          entreprises={ents}
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
          entreprises={ents}
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
          entreprises={ents}
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
          onSave={() => { setModal(null); setTick(t => t + 1); toast('Programme enregistré avec succès — Notification envoyée', 'success'); }}
          onClose={() => setModal(null)}
          toast={toast}
        />
      )}

      {modal?.t === 'e' && (
        <EventModal
          event={modal?.data || null}
          medecins={med}
          techniciens={tec}
          entreprises={ents}
          defaultDate={modal?.data?.date_debut?.slice(0, 10)}
          onSave={() => { setModal(null); setTick(t => t + 1); toast('Événement enregistré avec succès', 'success'); }}
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

      {/* 🩺 Modal Rapport Activité Médicale d'après le Planning */}
      {showRapportModal && (
        <RapportActiviteMedecinModal
          onClose={() => setShowRapportModal(false)}
          defaultMedecinId={filters.role === 'medecin' ? filters.medecin_id : null}
          initialDateDebut={format(view === 'week' ? weekStart : startOfMonth(monthDate), 'yyyy-MM-dd')}
          initialDateFin={format(view === 'week' ? weekEnd : endOfMonth(monthDate), 'yyyy-MM-dd')}
          initialDateUnique={filters.date || null}
          initialFilterMode={filters.date ? 'date_unique' : 'periode'}
          initialSourceFilter="all"
          toast={toast}
        />
      )}
    </div>
  );
}
