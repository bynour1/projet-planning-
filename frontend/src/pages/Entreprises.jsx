import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AddressAutocomplete from '../components/AddressAutocomplete';
import NavigationSelector from '../components/NavigationSelector';
import ExcelImportModal from '../components/ExcelImportModal';
import ExportDropdown from '../components/ExportDropdown';
import PatientModal, { VISIT_TYPES, RESULTATS_APTITUDE } from '../components/PatientModal';
import PatientExcelImportModal from '../components/PatientExcelImportModal';
import PatientDocumentsModal from '../components/PatientDocumentsModal';
import RapportActiviteMedecinModal from '../components/RapportActiviteMedecinModal';
import * as XLSX from 'xlsx';
// ── Helper : générer le lien Google Maps depuis une adresse ───
function googleMapsUrl(adresse) {
  if (!adresse) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
}

// ── Star rating component ─────────────────────────────────────
function Stars({ value, onChange, size = 18 }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          style={{
            fontSize: size,
            cursor: onChange ? 'pointer' : 'default',
            color: n <= (hover || value) ? '#f59e0b' : '#cbd5e1',
            transition: 'color .15s, transform .1s',
            transform: hover === n ? 'scale(1.15)' : 'scale(1)',
          }}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange && onChange(n)}
        >
          ★
        </span>
      ))}
    </div>
  );
}

// ── Helpers pour dates de convention et renouvellement ───────
function formatConventionDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d).slice(0, 10);
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatConventionRange(debut, fin) {
  const d1 = formatConventionDate(debut);
  const d2 = formatConventionDate(fin);
  if (d1 && d2) return `Du ${d1} au ${d2}`;
  if (d1) return `À partir du ${d1}`;
  if (d2) return `Jusqu'au ${d2}`;
  return 'Convention en cours';
}

function getConventionBadge(dateFin) {
  if (!dateFin) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dFin = new Date(dateFin);
  if (isNaN(dFin.getTime())) return null;
  const diffDays = Math.ceil((dFin - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return (
      <span style={{ fontSize: 11, fontWeight: 800, color: '#991b1b', background: '#fee2e2', padding: '3px 9px', borderRadius: 6 }}>
        Expirée ({Math.abs(diffDays)}j)
      </span>
    );
  }
  if (diffDays <= 30) {
    return (
      <span style={{ fontSize: 11, fontWeight: 800, color: '#9a3412', background: '#ffedd5', padding: '3px 9px', borderRadius: 6 }}>
        Expire dans {diffDays}j
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11, fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '3px 9px', borderRadius: 6 }}>
      Valide ({diffDays}j restants)
    </span>
  );
}

// ── Clean SVG Icon Components ─────────────────────────────────
const IconBuilding = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" /><path d="M16 10h.01" /><path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" />
  </svg>
);

const IconDocument = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconUsers = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconStethoscope = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 3v5a5.5 5.5 0 0 0 11 0V3" /><path d="M4.5 3H2v2" /><path d="M15.5 3H18v2" /><path d="M10 13.5v4.5a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3v-1.5" /><circle cx="17" cy="14.5" r="2" />
  </svg>
);

const IconClock = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconFlask = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 2v7.31L4.1 19.3A2 2 0 0 0 5.8 22h12.4a2 2 0 0 0 1.7-2.7L14 9.31V2" /><line x1="8.5" y1="2" x2="15.5" y2="2" />
  </svg>
);

const IconAlert = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconBell = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const IconPlus = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconUpload = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconCalendar = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconEye = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

const IconTrash = ({ size = 15, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconEdit = ({ size = 15, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const IconShield = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

// ── Modal pour création/édition complète d'entreprise ──────────
function EntrepriseModal({ item, onSave, onClose }) {
  const init = item || {};
  const [f, setF] = useState({
    code: init.code || '',
    nom: init.nom || '',
    secteur: init.secteur || '',
    adresse: init.adresse || '',
    telephone: init.telephone || '',
    email: init.email || '',
    site_web: init.site_web || '',
    description: init.description || '',
    convensionne: init.convensionne !== undefined ? !!init.convensionne : true,
    date_debut_convention: init.date_debut_convention ? String(init.date_debut_convention).slice(0, 10) : '',
    date_fin_convention: init.date_fin_convention ? String(init.date_fin_convention).slice(0, 10) : '',
    renouvelable: init.renouvelable !== undefined ? !!init.renouvelable : true,
    effectif_total: init.effectif_total !== undefined && init.effectif_total !== null ? init.effectif_total : 0,
    nb_visites_faites: init.nb_visites_faites !== undefined && init.nb_visites_faites !== null ? init.nb_visites_faites : 0,
    nb_bilans_faits: init.nb_bilans_faits !== undefined && init.nb_bilans_faits !== null ? init.nb_bilans_faits : 0,
    nb_bilans_manquants: init.nb_bilans_manquants !== undefined && init.nb_bilans_manquants !== null ? init.nb_bilans_manquants : 0,
  });
  const [saving, setSaving] = useState(false);
  const s = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const effectif = parseInt(f.effectif_total, 10) || 0;
  const faites = parseInt(f.nb_visites_faites, 10) || 0;
  const aFaire = Math.max(0, effectif - faites);
  const tauxVisites = effectif > 0 ? Math.min(100, Math.round((faites / effectif) * 100)) : 0;

  async function handleSave() {
    if (!f.nom.trim()) return;
    setSaving(true);
    const payload = {
      ...f,
      code: f.code?.trim() || null,
      date_debut_convention: f.convensionne && f.date_debut_convention ? f.date_debut_convention : null,
      date_fin_convention: f.convensionne && f.date_fin_convention ? f.date_fin_convention : null,
      renouvelable: f.convensionne ? (f.renouvelable ? 1 : 0) : 0,
      effectif_total: parseInt(f.effectif_total, 10) || 0,
      nb_visites_faites: parseInt(f.nb_visites_faites, 10) || 0,
      nb_bilans_faits: parseInt(f.nb_bilans_faits, 10) || 0,
      nb_bilans_manquants: parseInt(f.nb_bilans_manquants, 10) || 0,
    };
    try {
      if (init.id) await axios.put(`/api/entreprises/${init.id}`, payload);
      else await axios.post('/api/entreprises', payload);
      onSave();
    } catch (e) {
      alert(e.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 660, borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
              {init.id ? 'Modifier l\'entreprise' : 'Nouvelle entreprise'}
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Fiche administrative, code interne réservé à l'admin et suivi des effectifs
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '76vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, padding: '18px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12 }}>
            <div className="form-group">
              <label style={{ fontWeight: 700, fontSize: 13 }}>Nom de l'entreprise / Société *</label>
              <input
                className="input"
                placeholder="Ex : Clinique Les Oliviers, SOTUVER, STEG..."
                value={f.nom}
                onChange={(e) => s('nom', e.target.value)}
                autoFocus
                style={{ fontSize: 14, fontWeight: 600 }}
              />
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Code Entreprise</span>
                <span style={{ fontSize: 9.5, background: '#fee2e2', color: '#991b1b', padding: '1px 5px', borderRadius: 4, fontWeight: 800 }}>ADMIN</span>
              </label>
              <input
                className="input"
                placeholder="Ex : ENT-001, COD-2024..."
                value={f.code}
                onChange={(e) => s('code', e.target.value)}
                style={{ fontSize: 13, fontWeight: 700, background: '#fffbeb', borderColor: '#fde68a' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label style={{ fontSize: 12, fontWeight: 600 }}>Secteur d'activité</label>
              <input
                className="input"
                placeholder="Ex : Médical, Pharmacie, Industrie, BTP..."
                value={f.secteur}
                onChange={(e) => s('secteur', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label style={{ fontSize: 12, fontWeight: 600 }}>Téléphone</label>
              <input
                className="input"
                placeholder="+216 XX XXX XXX"
                value={f.telephone}
                onChange={(e) => s('telephone', e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label style={{ fontSize: 12, fontWeight: 600 }}>Adresse physique</label>
            <AddressAutocomplete
              value={f.adresse}
              onChange={(v) => s('adresse', v)}
              placeholder="Ex: Zone Industrielle Charguia, Ariana..."
              searchLocation
            />
          </div>

          {/* Section Effectif & Suivi Médical */}
          <div
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, color: '#0284c7', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Effectifs Salariés & Suivi des Visites</span>
              <span style={{ fontSize: 11, background: '#0284c7', color: '#fff', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                Calcul Auto
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label style={{ fontSize: 12, fontWeight: 700 }}>Effectif total (Salariés)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={f.effectif_total}
                  onChange={(e) => s('effectif_total', e.target.value)}
                  style={{ fontWeight: 700 }}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: 12, fontWeight: 700 }}>Effectif ayant déjà fait sa visite</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={f.nb_visites_faites}
                  onChange={(e) => s('nb_visites_faites', e.target.value)}
                  style={{ fontWeight: 700, color: '#16a34a' }}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: 12, fontWeight: 700 }}>Bilans médicaux réalisés</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={f.nb_bilans_faits}
                  onChange={(e) => s('nb_bilans_faits', e.target.value)}
                  style={{ fontWeight: 700, color: '#0ea5e9' }}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: 12, fontWeight: 700 }}>Bilans manquants / en attente</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={f.nb_bilans_manquants}
                  onChange={(e) => s('nb_bilans_manquants', e.target.value)}
                  style={{ fontWeight: 700, color: parseInt(f.nb_bilans_manquants, 10) > 0 ? '#dc2626' : '#64748b' }}
                />
              </div>
            </div>

            {/* Aperçu calcul en direct */}
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                background: 'var(--surface)',
                borderRadius: 10,
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12,
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-3)' }}>Effectif en attente (à faire) : </span>
                <strong style={{ color: aFaire > 0 ? '#ea580c' : '#16a34a', fontSize: 13 }}>
                  {aFaire} salarié(s)
                </strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--text-3)' }}>Taux de couverture : </span>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 800,
                    background: tauxVisites >= 100 ? '#dcfce7' : tauxVisites >= 50 ? '#fef3c7' : '#fee2e2',
                    color: tauxVisites >= 100 ? '#166534' : tauxVisites >= 50 ? '#92400e' : '#991b1b',
                  }}
                >
                  {tauxVisites}% complété
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label style={{ fontSize: 12, fontWeight: 600 }}>Email professionnel</label>
              <input
                className="input"
                type="email"
                placeholder="contact@entreprise.com"
                value={f.email}
                onChange={(e) => s('email', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label style={{ fontSize: 12, fontWeight: 600 }}>Site web</label>
              <input
                className="input"
                placeholder="https://www.entreprise.com"
                value={f.site_web}
                onChange={(e) => s('site_web', e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label style={{ fontSize: 12, fontWeight: 600 }}>Description & Notes d'intervention</label>
            <textarea
              className="input"
              placeholder="Spécificités médicales, horaires de tournée, contact RH..."
              value={f.description}
              onChange={(e) => s('description', e.target.value)}
              style={{ minHeight: 70 }}
            />
          </div>

          {/* Section Convention */}
          <div
            style={{
              background: f.convensionne ? 'rgba(16,185,129,0.06)' : 'var(--surface2)',
              border: `1px solid ${f.convensionne ? '#a7f3d0' : 'var(--border)'}`,
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, color: f.convensionne ? '#059669' : 'var(--text-2)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Statut & Détails de la Convention</span>
              <span style={{ fontSize: 11, background: f.convensionne ? '#059669' : '#64748b', color: '#fff', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                {f.convensionne ? 'Partenaire Conventionné' : 'Non Conventionné'}
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: f.convensionne ? 12 : 0 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Statut convention</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${f.convensionne ? 'btn-success' : 'btn-outline'}`}
                  onClick={() => s('convensionne', true)}
                  style={{ flex: 1, justifyContent: 'center', padding: '8px' }}
                >
                  Conventionnée
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${!f.convensionne ? 'btn-danger' : 'btn-outline'}`}
                  onClick={() => s('convensionne', false)}
                  style={{ flex: 1, justifyContent: 'center', padding: '8px' }}
                >
                  Non conventionnée
                </button>
              </div>
            </div>

            {f.convensionne && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <div className="form-group">
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                      Date début convention
                    </label>
                    <input
                      type="date"
                      className="input"
                      value={f.date_debut_convention}
                      onChange={(e) => s('date_debut_convention', e.target.value)}
                      style={{ fontWeight: 600 }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                      Date fin convention
                    </label>
                    <input
                      type="date"
                      className="input"
                      value={f.date_fin_convention}
                      onChange={(e) => s('date_fin_convention', e.target.value)}
                      style={{ fontWeight: 600 }}
                    />
                  </div>
                </div>

                {/* Option Renouvelable */}
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                      Convention Renouvelable
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      Indique si la convention est renouvelable par tacite reconduction
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${f.renouvelable ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => s('renouvelable', true)}
                      style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700 }}
                    >
                      Renouvelable
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${!f.renouvelable ? 'btn-secondary' : 'btn-ghost'}`}
                      onClick={() => s('renouvelable', false)}
                      style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700 }}
                    >
                      Non
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', padding: '14px 22px' }}>
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !f.nom.trim()} style={{ padding: '8px 22px' }}>
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Enregistrer la fiche'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de Calcul Rapide & Bilan Effectif ───────────────────
function QuickBilanModal({ entreprise, onSave, onClose }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrateur';
  const currentYear = new Date().getFullYear();
  const [effectif, setEffectif] = useState(entreprise.effectif_total !== undefined ? entreprise.effectif_total : 0);
  const [faites, setFaites] = useState(entreprise.nb_visites_faites !== undefined ? entreprise.nb_visites_faites : 0);
  const [bilansFaits, setBilansFaits] = useState(entreprise.nb_bilans_faits !== undefined ? entreprise.nb_bilans_faits : 0);
  const [bilansManquants, setBilansManquants] = useState(entreprise.nb_bilans_manquants !== undefined ? entreprise.nb_bilans_manquants : 0);
  const [anneeCampagne, setAnneeCampagne] = useState(entreprise.annee_campagne || currentYear);
  const [saving, setSaving] = useState(false);
  const [startingNewCampaign, setStartingNewCampaign] = useState(false);

  const effNum = parseInt(effectif, 10) || 0;
  const faitesNum = parseInt(faites, 10) || 0;
  const aFaire = Math.max(0, effNum - faitesNum);
  const taux = effNum > 0 ? Math.min(100, Math.round((faitesNum / effNum) * 100)) : 0;
  const isNouvelleAnneeRequise = parseInt(anneeCampagne, 10) < currentYear;

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        nb_visites_faites: parseInt(faites, 10) || 0,
        nb_bilans_faits: parseInt(bilansFaits, 10) || 0,
        nb_bilans_manquants: parseInt(bilansManquants, 10) || 0,
        date_derniere_visite: new Date().toISOString().slice(0, 10),
      };
      if (isAdmin) {
        payload.effectif_total = parseInt(effectif, 10) || 0;
        payload.annee_campagne = parseInt(anneeCampagne, 10) || currentYear;
      }
      await axios.patch(`/api/entreprises/${entreprise.id}/bilan`, payload);
      onSave();
    } catch (e) {
      alert(e.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function handleStartNewCampaign() {
    if (!window.confirm(`Démarrer la nouvelle campagne annuelle ${currentYear} pour "${entreprise.nom}" ?\n\nLes chiffres de l'année ${anneeCampagne} seront archivés et l'effectif examiné sera réinitialisé à 0 pour la nouvelle année.`)) {
      return;
    }
    setStartingNewCampaign(true);
    try {
      await axios.post(`/api/entreprises/${entreprise.id}/nouvelle-campagne`, {
        nouvelle_annee: currentYear,
      });
      onSave();
    } catch (e) {
      alert(e.response?.data?.message || 'Erreur');
    } finally {
      setStartingNewCampaign(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540, borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconStethoscope size={20} color="#0284c7" />
            </div>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--text)' }}>{entreprise.nom}</h3>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Suivi des effectifs · Campagne Annuelle {anneeCampagne}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '18px 22px' }}>
          {/* Bannière de contrôle administratif pour les médecins / techniciens */}
          {!isAdmin ? (
            <div
              style={{
                padding: '10px 14px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#166534',
              }}
            >
              <IconShield size={18} color="#166534" />
              <div>
                <strong>Saisie sous contrôle de l'Administration :</strong> Enregistrement du nombre de salariés examinés et des bilans sur site.
              </div>
            </div>
          ) : null}

          {/* Alerte si nouvelle année disponible */}
          {isAdmin && isNouvelleAnneeRequise && (
            <div
              style={{
                padding: '12px 14px',
                background: '#fef3c7',
                border: '1.5px solid #f59e0b',
                borderRadius: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 800, color: '#92400e', fontSize: 13 }}>
                  Nouvelle Année {currentYear} atteinte
                </div>
                <div style={{ fontSize: 11.5, color: '#78350f', marginTop: 2 }}>
                  La campagne active est {anneeCampagne}. Vous pouvez archiver et lancer la campagne {currentYear}.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-warning btn-sm"
                onClick={handleStartNewCampaign}
                disabled={startingNewCampaign}
                style={{ fontWeight: 800, whiteSpace: 'nowrap', fontSize: 11 }}
              >
                {startingNewCampaign ? 'En cours...' : `Lancer ${currentYear}`}
              </button>
            </div>
          )}

          {/* Jauge visuelle et indicateurs */}
          <div
            style={{
              padding: 16,
              background: 'var(--surface2)',
              borderRadius: 14,
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                Taux de réalisation · Campagne {anneeCampagne}
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, background: 'var(--surface)', border: '1px solid var(--border)', padding: '2px 10px', borderRadius: 12, color: 'var(--text)' }}>
                {taux}%
              </span>
            </div>
            {/* Barre animée */}
            <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ width: `${taux}%`, height: '100%', background: taux >= 100 ? '#16a34a' : '#0284c7', transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
              <div style={{ background: 'var(--surface)', padding: '8px 4px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>Total</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2, color: 'var(--text)' }}>{effNum}</div>
              </div>
              <div style={{ background: 'var(--surface)', padding: '8px 4px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>Déjà fait</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2, color: '#16a34a' }}>{faitesNum}</div>
              </div>
              <div style={{ background: 'var(--surface)', padding: '8px 4px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>En attente</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2, color: aFaire > 0 ? '#ea580c' : '#16a34a' }}>
                  {aFaire}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isAdmin && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Année de Campagne</label>
                  <input
                    className="input"
                    type="number"
                    min="2020"
                    max="2040"
                    value={anneeCampagne}
                    onChange={(e) => setAnneeCampagne(e.target.value)}
                    style={{ fontWeight: 800, fontSize: 14 }}
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Cycle Annuel</label>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleStartNewCampaign}
                    disabled={startingNewCampaign}
                    style={{ width: '100%', height: 38, fontWeight: 700, fontSize: 11.5 }}
                  >
                    {startingNewCampaign ? 'Initialisation...' : `Reset pour ${currentYear}`}
                  </button>
                </div>
              </div>
            )}

            {isAdmin ? (
              <div className="form-group">
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                  <span>Effectif total de salariés</span>
                  <span style={{ color: '#0284c7', fontSize: 11, fontWeight: 600 }}>Ajustement admin</span>
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={effectif}
                    onChange={(e) => setEffectif(e.target.value)}
                    style={{ fontWeight: 800, fontSize: 15 }}
                  />
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setEffectif((v) => (parseInt(v, 10) || 0) + 5)}>+5</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setEffectif((v) => (parseInt(v, 10) || 0) + 20)}>+20</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setEffectif((v) => (parseInt(v, 10) || 0) + 50)}>+50</button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Effectif total de l'entreprise :</span>
                <strong>{effNum} salariés</strong>
              </div>
            )}

            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                <span>Effectif ayant fait sa visite ({anneeCampagne})</span>
                <span style={{ color: '#16a34a', fontSize: 11, fontWeight: 600 }}>Incrémentation rapide</span>
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={faites}
                  onChange={(e) => setFaites(e.target.value)}
                  style={{ fontWeight: 800, fontSize: 15, color: '#16a34a' }}
                />
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setFaites((v) => (parseInt(v, 10) || 0) + 1)}>+1</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setFaites((v) => (parseInt(v, 10) || 0) + 5)}>+5</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setFaites((v) => (parseInt(v, 10) || 0) + 10)}>+10</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label style={{ fontSize: 12, fontWeight: 700 }}>Bilans médicaux faits</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={bilansFaits}
                  onChange={(e) => setBilansFaits(e.target.value)}
                  style={{ fontWeight: 700, color: '#0ea5e9' }}
                />
              </div>
              <div className="form-group">
                <label style={{ fontSize: 12, fontWeight: 700 }}>Bilans manquants</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={bilansManquants}
                  onChange={(e) => setBilansManquants(e.target.value)}
                  style={{ fontWeight: 700, color: parseInt(bilansManquants, 10) > 0 ? '#dc2626' : '#64748b' }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', padding: '14px 22px' }}>
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '8px 22px', fontWeight: 800 }}>
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Enregistrer les effectifs'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal for adding an avis ──────────────────────────────────
function AvisModal({ entreprise, editAvis, onSave, onClose }) {
  const [f, setF] = useState({
    note: editAvis?.note || 0,
    commentaire: editAvis?.commentaire || '',
    type_avis: editAvis?.type_avis || 'avis',
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
    } catch (e) {
      alert(e.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  const TYPE_LABELS = { avis: 'Avis', remarque: 'Remarque', suggestion: 'Suggestion' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480, borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontWeight: 800 }}>{editAvis ? 'Modifier l\'avis' : 'Partager votre avis'}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, marginBottom: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{entreprise.nom}</div>
            {entreprise.secteur && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{entreprise.secteur}</div>}
          </div>
          <div className="form-group">
            <label style={{ fontSize: 12, fontWeight: 700 }}>Type d'observation</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={`btn btn-sm ${f.type_avis === v ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setF((p) => ({ ...p, type_avis: v }))}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label style={{ fontSize: 12, fontWeight: 700 }}>Note globale (optionnel)</label>
            <Stars value={f.note} onChange={(n) => setF((p) => ({ ...p, note: n }))} size={26} />
            {f.note > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, display: 'block', fontWeight: 600 }}>
                {['', 'Très insatisfaisant', 'Insatisfaisant', 'Moyen', 'Bonne relation', 'Excellente collaboration'][f.note]}
              </span>
            )}
          </div>
          <div className="form-group">
            <label style={{ fontSize: 12, fontWeight: 700 }}>Commentaire & Détails *</label>
            <textarea
              className="input"
              placeholder="Partagez votre expérience ou vos observations sur les tournées médicales..."
              value={f.commentaire}
              onChange={(e) => setF((p) => ({ ...p, commentaire: e.target.value }))}
              style={{ minHeight: 100 }}
              autoFocus
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !f.commentaire.trim()}>
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Publier l\'avis'}
          </button>
        </div>
      </div>
    </div>
  );
}

function printRapportHse(rapport, entreprise) {
  const win = window.open('', '_blank', 'width=850,height=950');
  if (!win) {
    alert('Veuillez autoriser les fenêtres pop-up pour imprimer le rapport.');
    return;
  }
  const dateFormatted = rapport.date ? new Date(rapport.date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : '—';
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Rapport de Visite HSE - ${entreprise?.nom || ''}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 35px; color: #1e293b; line-height: 1.5; font-size: 13.5px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #d97706; padding-bottom: 14px; margin-bottom: 20px; }
          .title { font-size: 19px; font-weight: 800; color: #b45309; text-transform: uppercase; margin: 0; }
          .subtitle { font-size: 12px; color: #64748b; margin-top: 3px; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
          .section { margin-bottom: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
          .section-title { font-size: 12.5px; font-weight: 800; text-transform: uppercase; color: #0f172a; margin-bottom: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .tag { display: inline-block; padding: 3px 8px; border-radius: 4px; background: #fee2e2; color: #991b1b; font-size: 11px; font-weight: 700; margin: 2px 4px 2px 0; border: 1px solid #fecaca; }
          .signature-box { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
          .sign-line { border-top: 1px solid #94a3b8; padding-top: 8px; text-align: center; font-size: 12px; color: #64748b; }
          @media print {
            body { margin: 15px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div style="font-size: 17px; font-weight: 900; color: #0284c7;">GMT Ariana — Médecine & Santé au Travail</div>
            <h1 class="title">Fiche de Visite des Lieux de Travail & Étude de Poste</h1>
            <div class="subtitle">Hygiène, Sécurité et Conditions de Travail (Rapport HSE)</div>
          </div>
          <div style="text-align: right;">
            <div class="badge">Rapport Officiel HSE</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Édité le ${new Date().toLocaleDateString('fr-FR')}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Informations Entreprise & Visite</div>
          <div class="grid">
            <div><strong>Entreprise :</strong> ${entreprise?.nom || '—'}</div>
            <div><strong>Secteur d'activité :</strong> ${entreprise?.secteur || '—'}</div>
            <div><strong>Date de la visite :</strong> ${dateFormatted} ${rapport.heure ? `à ${rapport.heure}` : ''}</div>
            <div><strong>Intervenant HSE :</strong> ${rapport.created_by_nom || 'Responsable HSE'}</div>
            <div><strong>Type de visite :</strong> ${rapport.type_visite || 'Visite des locaux & postes'}</div>
            <div><strong>Statut :</strong> ${rapport.statut === 'effectuee' ? 'Effectuée' : rapport.statut}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Poste(s) ou Lieu(x) Inspecté(s)</div>
          <div style="font-size: 14px; font-weight: 700; color: #b45309;">
            ${rapport.lieu_poste || 'Locaux généraux de l\'entreprise'}
          </div>
        </div>

        ${rapport.patient_nom ? `
          <div class="section" style="background: #f0fdf4; border-color: #86efac;">
            <div class="section-title" style="color: #166534; border-color: #86efac;">Salarié(e) Concerné(e) par l'Étude de Poste</div>
            <div style="font-size: 15px; font-weight: 800; color: #15803d;">
              ${rapport.patient_nom}
            </div>
          </div>
        ` : ''}

        ${rapport.risques_identifies ? `
          <div class="section">
            <div class="section-title">Risques Professionnels & Dangers Identifiés</div>
            <div>
              ${rapport.risques_identifies.split(',').map(r => `<span class="tag">${r.trim()}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="section">
          <div class="section-title">Constats & Observations Relevés sur Place</div>
          <div style="white-space: pre-wrap; color: #334155;">
            ${rapport.commentaire || 'Aucune observation enregistrée.'}
          </div>
        </div>

        <div class="section" style="background: #fffbeb; border-color: #fde68a;">
          <div class="section-title" style="color: #92400e; border-color: #fde68a;">
            Recommandations & Mesures Correctives Préconisées
          </div>
          <div style="white-space: pre-wrap; color: #78350f; font-weight: 600;">
            ${rapport.recommandations || 'Poursuivre la surveillance et l\'application des consignes d\'hygiène et sécurité.'}
          </div>
        </div>

        <div class="signature-box">
          <div class="sign-line">
            <strong>Le Responsable HSE / Intervenant</strong><br/>
            ${rapport.created_by_nom || 'Service HSE GMT Ariana'}<br/><br/><br/>
            <span>Signature & Cachet</span>
          </div>
          <div class="sign-line">
            <strong>Pour l'Entreprise</strong><br/>
            Direction / Représentant de l'employeur<br/><br/><br/>
            <span>Signature & Cachet</span>
          </div>
        </div>

        <div class="no-print" style="margin-top: 25px; text-align: center;">
          <button onclick="window.print()" style="padding: 10px 24px; background: #0284c7; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer;">
            Imprimer ce Rapport
          </button>
        </div>
      </body>
    </html>
  `;
  win.document.write(html);
  win.document.close();
}

// ── Modal Rapport de Visite des Lieux de Travail & Étude de Poste (HSE) ─────────
function RapportVisiteHseModal({ entreprise, user, initialMode = 'lieu', initialPatient = null, patientsList = [], onSave, onClose, toast }) {
  const [scope, setScope] = useState(() => {
    if (initialPatient) return 'poste';
    if (initialMode === 'poste') return 'poste';
    return 'lieu';
  });

  const [patientId, setPatientId] = useState(initialPatient?.id ? String(initialPatient.id) : '');
  const [patientNom, setPatientNom] = useState(initialPatient ? `${initialPatient.nom} ${initialPatient.prenom}` : '');
  const [f, setF] = useState({
    date: new Date().toISOString().slice(0, 10),
    heure: new Date().toTimeString().slice(0, 5),
    type_visite: initialPatient || initialMode === 'poste' ? 'Étude & Analyse de poste de travail' : 'Visite des lieux de travail & Locaux',
    lieu_poste: initialPatient?.poste ? (initialPatient.departement ? `${initialPatient.poste} (${initialPatient.departement})` : initialPatient.poste) : '',
    constats: '',
    recommandations: '',
    statut: 'effectuee',
  });
  const [risques, setRisques] = useState([]);
  const [saving, setSaving] = useState(false);

  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const handlePatientSelect = (pId) => {
    setPatientId(pId);
    if (!pId) {
      setPatientNom('');
      return;
    }
    const found = patientsList.find(p => String(p.id) === String(pId));
    if (found) {
      const fullname = `${found.nom} ${found.prenom}`;
      setPatientNom(fullname);
      s('type_visite', 'Étude & Analyse de poste de travail');
      if (found.poste) {
        s('lieu_poste', found.departement ? `${found.poste} (${found.departement})` : found.poste);
      }
    }
  };

  const toggleRisque = (r) => {
    setRisques(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  const SUGGESTED_POSTES = [
    'Opérateur machine / Ligne de production',
    'Poste de conditionnement & Emballage',
    'Manutentionnaire / Port de charges',
    'Poste écran / Travail administratif',
    'Conducteur de chariot / Engins',
    'Poste de soudure / Meulage',
    'Laboratoire & Contrôle qualité',
    'Poste de caisse / Accueil',
  ];

  const SUGGESTED_LIEUX = [
    'Atelier de fabrication / Usine',
    'Entrepôt / Stockage palettes',
    'Ligne de conditionnement',
    'Local produits chimiques & Solvants',
    'Zone de chargement & Quai',
    'Bureaux & Locaux administratifs',
    'Vestiaires, réfectoire & Sanitaires',
    'Chantier extérieur / Maintenance',
  ];

  const RISQUES_POSTES = [
    'Manutention manuelle & Ergonomie (TMS)',
    'Postures pénibles ou prolongées',
    'Répétitivité des gestes / Cadence',
    'Fatigue visuelle & Travail sur écran',
    'Bruit direct au poste de travail',
    'Vibrations transmises aux membres',
    'Défaut d\'EPI adapté au travailleur',
    'Stress & Charge mentale / Isolement',
  ];

  const RISQUES_LIEUX = [
    'Bruit ambiant & Réverbération',
    'Produits chimiques & Solvants',
    'Risque incendie / Issues obstruées',
    'Risque électrique',
    'Ventilation & Aération insuffisantes',
    'Éclairage inadapté / Pénombre',
    'Machines sans carter de protection',
    'Chutes de plain-pied & Encombrement',
    'Circulation engins & Piétons',
    'Hygiène des locaux & Vestiaires',
  ];

  const activeRisquesList = scope === 'poste' ? RISQUES_POSTES : RISQUES_LIEUX;
  const activeSuggestions = scope === 'poste' ? SUGGESTED_POSTES : SUGGESTED_LIEUX;

  async function handleSubmit(e) {
    e.preventDefault();
    if (user?.role !== 'hse') {
      toast?.('Seul le Responsable HSE a le droit de rédiger et enregistrer un rapport HSE', 'error');
      return;
    }
    if (!f.date || !f.lieu_poste.trim()) {
      toast?.(`Veuillez renseigner la date et ${scope === 'poste' ? 'le poste de travail' : 'le lieu / zone inspecté'}`, 'error');
      return;
    }
    setSaving(true);
    try {
      await axios.post(`/api/entreprises/${entreprise.id}/visites`, {
        date: f.date,
        heure: f.heure,
        type_visite: scope === 'poste' ? (f.type_visite || 'Étude de poste de travail') : (f.type_visite || 'Visite des lieux de travail & Locaux'),
        lieu_poste: f.lieu_poste.trim(),
        risques_identifies: risques.join(', '),
        commentaire: f.constats.trim(),
        recommandations: f.recommandations.trim(),
        statut: f.statut,
        rapport_type: 'hse',
        patient_id: scope === 'poste' && patientId ? parseInt(patientId, 10) : null,
        patient_nom: scope === 'poste' && patientNom ? patientNom.trim() : null,
        nb_examines: 0,
        nb_bilans: 0,
      });
      toast?.(scope === 'poste' ? 'Étude de poste HSE enregistrée avec succès ✓' : 'Étude de lieu / site HSE enregistrée avec succès ✓', 'success');
      onSave?.();
      onClose();
    } catch (err) {
      toast?.(err.response?.data?.message || 'Erreur lors de l\'enregistrement', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{
          maxWidth: 720,
          width: '95%',
          maxHeight: '92vh',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: scope === 'poste' ? '#b45309' : '#0369a1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {scope === 'poste' ? <IconUsers size={20} color="#b45309" /> : <IconBuilding size={20} color="#0369a1" />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                {scope === 'poste' ? 'Étude de Poste de Travail (HSE)' : 'Étude de Lieu & Diagnostic de Site (HSE)'}
              </h3>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 1 }}>
                {entreprise.nom} • {scope === 'poste' ? 'Activité humaine, tâches & ergonomie du travailleur' : 'Espace physique, infrastructures & environnement global'}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div
            className="modal-body"
            style={{
              padding: 'clamp(14px, 3vw, 20px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              flex: 1,
            }}
          >
            {/* Responsable HSE Banner */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <IconShield size={16} color="#b45309" />
                <span>Intervenant : <strong>{user?.prenom} {user?.nom}</strong> <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>(Responsable HSE)</span></span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                Fiche d'intervention officielle
              </div>
            </div>

            {/* Sélecteur de périmètre d'analyse HSE */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 8,
              padding: 4,
              background: 'var(--surface2)',
              borderRadius: 12,
              border: '1px solid var(--border)'
            }}>
              <button
                type="button"
                className={`btn btn-sm ${scope === 'poste' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => {
                  setScope('poste');
                  s('type_visite', 'Étude & Analyse de poste de travail');
                }}
                style={{
                  fontWeight: 800,
                  padding: '8px 12px',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 12.5,
                }}
              >
                <IconUsers size={15} />
                <span>👤 Étude de Poste (Travailleur précis)</span>
              </button>
              <button
                type="button"
                className={`btn btn-sm ${scope === 'lieu' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => {
                  setScope('lieu');
                  setPatientId('');
                  setPatientNom('');
                  s('type_visite', 'Visite des lieux de travail & Locaux');
                }}
                style={{
                  fontWeight: 800,
                  padding: '8px 12px',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 12.5,
                }}
              >
                <IconBuilding size={15} />
                <span>🏢 Étude de Lieu / Site (Espace global)</span>
              </button>
            </div>

            {/* Note pédagogique de périmètre HSE */}
            <div style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: scope === 'poste' ? '#fef3c7' : '#e0f2fe',
              border: scope === 'poste' ? '1px solid #fde68a' : '1px solid #bae6fd',
              color: scope === 'poste' ? '#92400e' : '#0369a1',
              fontSize: 12,
              lineHeight: 1.45,
            }}>
              {scope === 'poste' ? (
                <div>
                  <strong>👤 Périmètre Étude de Poste :</strong> Se concentre sur l'activité humaine, les tâches, l'ergonomie et les contraintes d'un travailleur précis.
                </div>
              ) : (
                <div>
                  <strong>🏢 Périmètre Étude de Lieu (Site & Environnement) :</strong> Analyse l'espace physique, les infrastructures, les ateliers et les dangers globaux de la zone.
                </div>
              )}
            </div>

            {/* Sélection du Salarié concerné (en mode Étude de Poste uniquement) */}
            {scope === 'poste' && (
              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Travailleur / Salarié(e) concerné(e) *</span>
                  </span>
                  {patientNom && <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>✓ {patientNom}</span>}
                </label>
                <select
                  className="input"
                  value={patientId}
                  onChange={(e) => handlePatientSelect(e.target.value)}
                  style={{ fontSize: 12.5, fontWeight: 600, borderColor: patientId ? '#10b981' : undefined }}
                >
                  <option value="">-- Sélectionner le salarié dont le poste est analysé --</option>
                  {patientsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom} {p.prenom} {p.poste ? `— ${p.poste}` : ''} {p.cin ? `(CIN: ${p.cin})` : ''}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                  L'étude de poste est directement rattachée à ce travailleur pour le suivi des aménagements et préconisations.
                </div>
              </div>
            )}

            {/* Date & Heure */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
                  Date de l'intervention *
                </label>
                <input
                  type="date"
                  className="input"
                  required
                  value={f.date}
                  onChange={(e) => s('date', e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
                  Heure
                </label>
                <input
                  type="time"
                  className="input"
                  value={f.heure}
                  onChange={(e) => s('heure', e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>
            </div>

            {/* Type d'intervention & Statut */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
                  {scope === 'poste' ? 'Type d\'étude de poste' : 'Type d\'étude de site'}
                </label>
                <select className="input" value={f.type_visite} onChange={(e) => s('type_visite', e.target.value)} style={{ fontSize: 12.5 }}>
                  {scope === 'poste' ? (
                    <>
                      <option value="Étude & Analyse de poste de travail">Étude & Analyse de poste de travail</option>
                      <option value="Évaluation ergonomique & Tâches manuelles">Évaluation ergonomique & Tâches manuelles</option>
                      <option value="Aménagement de poste & Reclassement">Aménagement de poste & Reclassement</option>
                      <option value="Contrôle du port des EPI au poste">Contrôle du port des EPI au poste</option>
                    </>
                  ) : (
                    <>
                      <option value="Visite des lieux de travail & Locaux">Visite des lieux de travail & Locaux</option>
                      <option value="Diagnostic de site & Environnement">Diagnostic de site & Environnement</option>
                      <option value="Évaluation des risques professionnels">Évaluation des risques professionnels</option>
                      <option value="Ambiances physiques (Bruit, Aération, Éclairage)">Ambiances physiques (Bruit, Aération, Éclairage)</option>
                      <option value="Sécurité incendie, évacuation & Issues">Sécurité incendie, évacuation & Issues</option>
                      <option value="Enquête après incident / Presqu'accident">Enquête après incident / Presqu'accident</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
                  Statut du rapport
                </label>
                <select className="input" value={f.statut} onChange={(e) => s('statut', e.target.value)} style={{ fontSize: 12.5 }}>
                  <option value="effectuee">Effectuée & Validée</option>
                  <option value="en_cours">En cours de suivi</option>
                  <option value="urgent">Mesures Urgentes</option>
                </select>
              </div>
            </div>

            {/* Lieu / Poste inspecté */}
            <div>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                <span>{scope === 'poste' ? 'Poste de travail & Tâches étudiées *' : 'Lieu, Atelier ou Zone inspectée *'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>Cliquez pour insérer :</span>
              </label>
              <input
                type="text"
                className="input"
                required
                placeholder={scope === 'poste' ? "ex: Opérateur de conditionnement, Manutentionnaire, Travail sur écran..." : "ex: Atelier usinage n°2, Entrepôt stockage palettes, Quai de déchargement..."}
                value={f.lieu_poste}
                onChange={(e) => s('lieu_poste', e.target.value)}
                style={{ fontSize: 13, fontWeight: 600 }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                {activeSuggestions.map((sp, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => s('lieu_poste', f.lieu_poste ? `${f.lieu_poste}, ${sp}` : sp)}
                    style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 6,
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      cursor: 'pointer', color: 'var(--text-2)'
                    }}
                  >
                    + {sp}
                  </button>
                ))}
              </div>
            </div>

            {/* Dangers & Risques observés */}
            <div>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
                {scope === 'poste' ? 'Risques & Contraintes observés sur le travailleur :' : 'Dangers & Risques globaux identifiés dans la zone :'}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {activeRisquesList.map((r, i) => {
                  const isSelected = risques.includes(r);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleRisque(r)}
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        border: isSelected ? '1.5px solid #dc2626' : '1px solid var(--border)',
                        background: isSelected ? '#fee2e2' : 'var(--surface)',
                        color: isSelected ? '#991b1b' : 'var(--text-2)',
                        transition: 'all .15s',
                      }}
                    >
                      {r} {isSelected ? '✓' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Constats & Observations */}
            <div>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
                {scope === 'poste' ? 'Analyse de l\'activité & Constats ergonomiques' : 'Constats sur site & Environnement physique'}
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder={scope === 'poste'
                  ? "Description des gestes, postures contraignantes, charges manipulées, cadence de travail, aménagement du poste..."
                  : "État des locaux, ambiances physiques (bruit, éclairage, aération), sécurité des machines, voies de circulation..."}
                value={f.constats}
                onChange={(e) => s('constats', e.target.value)}
                style={{ fontSize: 12.5, lineHeight: 1.45, resize: 'vertical' }}
              />
            </div>

            {/* Recommandations & Mesures correctives */}
            <div>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>
                {scope === 'poste' ? 'Préconisations d\'aménagement ergonomique & Mesures pour le travailleur' : 'Recommandations de sécurité & Mesures correctives pour le site'}
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder={scope === 'poste'
                  ? "Aides à la manutention, réglage de la hauteur du plan de travail, alternance des tâches, fourniture d'EPI adaptés..."
                  : "Mise aux normes électriques, captage à la source, dégagement des issues, maintenance des installations..."}
                value={f.recommandations}
                onChange={(e) => s('recommandations', e.target.value)}
                style={{ fontSize: 12.5, lineHeight: 1.45, resize: 'vertical', borderColor: '#fde68a', background: '#fffbeb', color: '#78350f' }}
              />
            </div>
          </div>

          {/* Footer */}
          <div
            className="modal-footer"
            style={{
              padding: '12px 22px',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={saving || !f.lieu_poste.trim()}
              style={{ fontWeight: 800, padding: '7px 18px' }}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer le Rapport HSE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Modal pour saisie d'une visite médicale avec sélection des salariés et gestion des aptitudes & bilans ─────────
function NouvelleVisiteModal({ entreprise, medecins = [], techniciens = [], patients: initialPatients = [], onSave, onClose, toast }) {
  const [f, setF] = useState({
    date: new Date().toISOString().slice(0, 10),
    heure: '08:30',
    medecin_id: '',
    technicien_id: '',
    type_visite: 'Visite Médicale Périodique',
    nb_examines: 0,
    nb_bilans: 0,
    nb_embauche: 0,
    nb_periodique: 0,
    nb_reprise: 0,
    nb_spontanee: 0,
    statut: 'effectuee',
    commentaire: '',
  });

  const [patients, setPatients] = useState(initialPatients || []);
  const [loadingPatients, setLoadingPatients] = useState(!initialPatients || initialPatients.length === 0);
  const [mode, setMode] = useState(initialPatients && initialPatients.length > 0 ? 'select' : 'manual');
  const [selectedMap, setSelectedMap] = useState({});
  const [patientFilter, setPatientFilter] = useState('en_attente'); // 'all' | 'en_attente' | 'bilans' | 'vus'
  const [patientSearch, setPatientSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const s = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Si pas de patients passés en props, charger depuis l'API
  useEffect(() => {
    if (!initialPatients || initialPatients.length === 0) {
      setLoadingPatients(true);
      axios
        .get(`/api/entreprises/${entreprise.id}/patients`)
        .then((res) => {
          const list = res.data || [];
          setPatients(list);
          if (list.length > 0) setMode('select');
        })
        .catch(() => {})
        .finally(() => setLoadingPatients(false));
    } else {
      setPatients(initialPatients);
      if (initialPatients.length > 0) setMode('select');
    }
  }, [entreprise.id, initialPatients]);

  // Recalculer automatiquement les effectifs examinés et bilans
  useEffect(() => {
    if (mode === 'select') {
      const checkedEntries = Object.values(selectedMap).filter((v) => v.checked);
      const countExamines = checkedEntries.length;
      const countBilans = checkedEntries.filter((v) => v.bilan_en_attente).length;
      setF((prev) => ({
        ...prev,
        nb_examines: countExamines,
        nb_bilans: countBilans,
      }));
    }
  }, [selectedMap, mode]);

  // Filtrer les salariés
  const filteredPatientsList = useMemo(() => {
    return patients.filter((p) => {
      const isExamined = p.resultat_visite && p.resultat_visite !== 'en_attente';
      const hasBilan = Boolean(p.bilan_en_attente);

      if (patientFilter === 'en_attente' && isExamined) return false;
      if (patientFilter === 'bilans' && !hasBilan) return false;
      if (patientFilter === 'vus' && !isExamined) return false;

      if (patientSearch.trim()) {
        const q = patientSearch.toLowerCase();
        const nom = (p.nom || '').toLowerCase();
        const prenom = (p.prenom || '').toLowerCase();
        const cin = (p.cin || '').toLowerCase();
        const poste = (p.poste || '').toLowerCase();
        return nom.includes(q) || prenom.includes(q) || cin.includes(q) || poste.includes(q);
      }
      return true;
    });
  }, [patients, patientFilter, patientSearch]);

  const countEnAttente = useMemo(
    () => patients.filter((p) => !p.resultat_visite || p.resultat_visite === 'en_attente').length,
    [patients]
  );
  const countBilans = useMemo(() => patients.filter((p) => p.bilan_en_attente).length, [patients]);
  const countVus = useMemo(
    () => patients.filter((p) => p.resultat_visite && p.resultat_visite !== 'en_attente').length,
    [patients]
  );

  // Basculer la sélection d'un salarié
  const togglePatient = (patient) => {
    setSelectedMap((prev) => {
      const current = prev[patient.id] || {
        checked: false,
        type_visite: patient.type_visite || f.type_visite || 'Visite Périodique',
        resultat_visite: patient.resultat_visite === 'en_attente' || !patient.resultat_visite ? 'apte' : patient.resultat_visite,
        duree_temporaire: patient.duree_temporaire || '3 mois à revoir',
        date_revoir: patient.date_revoir ? String(patient.date_revoir).slice(0, 10) : '',
        bilan_en_attente: Boolean(patient.bilan_en_attente),
        type_bilan: patient.type_bilan || '',
        has_visio: Boolean(patient.has_visio),
        has_audio: Boolean(patient.has_audio),
        has_ecg: Boolean(patient.has_ecg),
        notes: patient.notes || '',
      };
      return {
        ...prev,
        [patient.id]: {
          ...current,
          checked: !current.checked,
        },
      };
    });
  };

  const updatePatientField = (patientId, field, value) => {
    setSelectedMap((prev) => {
      const current = prev[patientId] || { checked: true };
      return {
        ...prev,
        [patientId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const selectAllEnAttente = () => {
    const newMap = { ...selectedMap };
    patients.forEach((p) => {
      const isEnAttente = !p.resultat_visite || p.resultat_visite === 'en_attente';
      if (isEnAttente) {
        newMap[p.id] = {
          checked: true,
          type_visite: p.type_visite || f.type_visite || 'Visite Périodique',
          resultat_visite: 'apte',
          duree_temporaire: '3 mois à revoir',
          date_revoir: '',
          bilan_en_attente: false,
          type_bilan: '',
          has_visio: Boolean(p.has_visio),
          has_audio: Boolean(p.has_audio),
          has_ecg: Boolean(p.has_ecg),
          notes: '',
        };
      }
    });
    setSelectedMap(newMap);
  };

  const deselectAll = () => {
    setSelectedMap({});
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!f.date) {
      toast?.('Date requise', 'error');
      return;
    }

    const checkedPatients = Object.entries(selectedMap)
      .filter(([_, v]) => v.checked)
      .map(([id, v]) => ({
        id: Number(id),
        type_visite: v.type_visite || 'Visite Périodique',
        resultat_visite: v.resultat_visite || 'apte',
        duree_temporaire: v.duree_temporaire || null,
        date_revoir: v.date_revoir || null,
        bilan_en_attente: Boolean(v.bilan_en_attente),
        type_bilan: v.type_bilan || null,
        has_visio: Boolean(v.has_visio),
        has_audio: Boolean(v.has_audio),
        has_ecg: Boolean(v.has_ecg),
        notes: v.notes || null,
      }));

    if (mode === 'select' && checkedPatients.length === 0 && patients.length > 0) {
      if (
        !window.confirm(
          'Aucun salarié n\'a été coché dans la liste. Voulez-vous valider une visite sans salariés sélectionnés nominativement ?'
        )
      ) {
        return;
      }
    }

    const countEmb = checkedPatients.filter((p) => (p.type_visite || '').toLowerCase().includes('embauche')).length;
    const countRep = checkedPatients.filter((p) => (p.type_visite || '').toLowerCase().includes('reprise')).length;
    const countSpo = checkedPatients.filter((p) => (p.type_visite || '').toLowerCase().includes('spontan') || (p.type_visite || '').toLowerCase().includes('autre')).length;
    const countPer = Math.max(0, checkedPatients.length - countEmb - countRep - countSpo);

    const manualEmb = parseInt(f.nb_embauche, 10) || 0;
    const manualPer = parseInt(f.nb_periodique, 10) || 0;
    const manualRep = parseInt(f.nb_reprise, 10) || 0;
    const manualSpo = parseInt(f.nb_spontanee, 10) || 0;
    const manualSum = manualEmb + manualPer + manualRep + manualSpo;
    const manualExamines = parseInt(f.nb_examines, 10) || manualSum || 0;

    setSaving(true);
    try {
      await axios.post(`/api/entreprises/${entreprise.id}/visites`, {
        ...f,
        nb_examines: mode === 'select' && checkedPatients.length > 0 ? checkedPatients.length : manualExamines,
        nb_bilans: mode === 'select' ? checkedPatients.filter((p) => p.bilan_en_attente).length : parseInt(f.nb_bilans, 10) || 0,
        nb_embauche: mode === 'select' ? countEmb : manualEmb,
        nb_periodique: mode === 'select' ? countPer : manualPer,
        nb_reprise: mode === 'select' ? countRep : manualRep,
        nb_spontanee: mode === 'select' ? countSpo : manualSpo,
        patients_updates: mode === 'select' ? checkedPatients : [],
      });
      toast?.('Visite enregistrée ✓ — Effectifs et aptitudes mis à jour avec succès', 'success');
      onSave?.();
      onClose();
    } catch (err) {
      toast?.(err.response?.data?.message || 'Erreur lors de l\'enregistrement', 'error');
    } finally {
      setSaving(false);
    }
  }

  const selectedEntries = Object.values(selectedMap).filter((v) => v.checked);
  const selectedCount = selectedEntries.length;
  const bilansSelectedCount = selectedEntries.filter((v) => v.bilan_en_attente).length;
  const countEmb = selectedEntries.filter((v) => (v.type_visite || '').toLowerCase().includes('embauche')).length;
  const countRep = selectedEntries.filter((v) => (v.type_visite || '').toLowerCase().includes('reprise')).length;
  const countSpo = selectedEntries.filter((v) => (v.type_visite || '').toLowerCase().includes('spontan') || (v.type_visite || '').toLowerCase().includes('autre')).length;
  const countPer = Math.max(0, selectedCount - countEmb - countRep - countSpo);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{
          maxWidth: 760,
          width: '95%',
          maxHeight: '92vh',
          borderRadius: 18,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconStethoscope size={20} color="#059669" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>Enregistrer une visite médicale</h3>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 1 }}>
                {entreprise.nom} • {patients.length} salarié(s) au registre
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div
            className="modal-body"
            style={{
              padding: '16px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              overflowY: 'auto',
              flex: 1,
            }}
          >
            {/* Ligne 1: Date & Heure */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 10 }}>
              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
                  Date de la visite *
                </label>
                <input
                  type="date"
                  className="input"
                  required
                  value={f.date}
                  onChange={(e) => s('date', e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
                  Heure
                </label>
                <input
                  type="time"
                  className="input"
                  value={f.heure}
                  onChange={(e) => s('heure', e.target.value)}
                  style={{ fontSize: 13 }}
                />
              </div>
            </div>

            {/* Ligne 2: Médecin & Technicien */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
                  Médecin assigné
                </label>
                <select className="input" value={f.medecin_id} onChange={(e) => s('medecin_id', e.target.value)} style={{ fontSize: 12.5 }}>
                  <option value="">Sélectionner un médecin</option>
                  {medecins.map((m) => (
                    <option key={m.id} value={m.id}>
                      Dr. {m.prenom} {m.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
                  Technicien / Infirmier
                </label>
                <select className="input" value={f.technicien_id} onChange={(e) => s('technicien_id', e.target.value)} style={{ fontSize: 12.5 }}>
                  <option value="">Sélectionner un technicien</option>
                  {techniciens.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.prenom} {t.nom}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ligne 3: Type de visite & Statut */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 10 }}>
              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
                  Type de visite
                </label>
                <select className="input" value={f.type_visite} onChange={(e) => s('type_visite', e.target.value)} style={{ fontSize: 12.5 }}>
                  <option value="Visite Médicale Périodique">Visite Médicale Périodique</option>
                  <option value="Visite d'Embauche">Visite d'Embauche</option>
                  <option value="Visite de Reprise">Visite de Reprise</option>
                  <option value="Tournée Clino Mobile">Tournée Clino Mobile</option>
                  <option value="Visite sur Site / Usine">Visite sur Site / Usine</option>
                  <option value="Visite Spontanée / Autre">Visite Spontanée / Autre</option>
                </select>
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
                  Statut
                </label>
                <select className="input" value={f.statut} onChange={(e) => s('statut', e.target.value)} style={{ fontSize: 12.5 }}>
                  <option value="effectuee">Effectuée</option>
                  <option value="en_cours">En cours</option>
                  <option value="planifiee">Planifiée</option>
                </select>
              </div>
            </div>

            {/* Mode Switcher */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 10, padding: 3, border: '1px solid var(--border)' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${mode === 'select' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setMode('select')}
                  style={{ padding: '5px 12px', fontSize: 12, fontWeight: mode === 'select' ? 800 : 600, borderRadius: 8 }}
                >
                  Sélectionner les salariés ({patients.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${mode === 'manual' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setMode('manual')}
                  style={{ padding: '5px 12px', fontSize: 12, fontWeight: mode === 'manual' ? 800 : 600, borderRadius: 8 }}
                >
                  Saisie manuelle des effectifs
                </button>
              </div>

              {mode === 'select' && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={selectAllEnAttente}
                    style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px' }}
                  >
                    Cocher tous en attente
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={deselectAll}
                    style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', color: 'var(--text-3)' }}
                  >
                    Décocher tout
                  </button>
                </div>
              )}
            </div>

            {/* CADRE MODE SÉLECTION DES SALARIÉS */}
            {mode === 'select' ? (
              <div
                style={{
                  background: 'var(--surface2)',
                  borderRadius: 14,
                  border: '1.5px solid var(--border)',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {/* Filtres & Recherche de salariés */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[
                      ['en_attente', `En attente (${countEnAttente})`],
                      ['bilans', `Bilans (${countBilans})`],
                      ['all', `Tous (${patients.length})`],
                      ['vus', `Déjà vus (${countVus})`],
                    ].map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        className={`btn btn-sm ${patientFilter === v ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setPatientFilter(v)}
                        style={{
                          padding: '3px 8px',
                          fontSize: 11,
                          fontWeight: patientFilter === v ? 800 : 600,
                          borderRadius: 6,
                          background: patientFilter === v ? undefined : 'var(--surface)',
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    className="input"
                    placeholder="Filtrer par Nom, CIN, Poste..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    style={{ fontSize: 11.5, height: 30, padding: '2px 8px', borderRadius: 6, maxWidth: 220 }}
                  />
                </div>

                {/* Bannière récapitulative des sélections avec ventilation des types */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#1e40af',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <strong>{selectedCount}</strong> salarié(s) examiné(s) ce jour
                    </div>
                    {selectedCount > 0 && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', fontSize: 11 }}>
                        <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '1px 6px', borderRadius: 6, fontWeight: 800 }}>
                          {countEmb} embauche
                        </span>
                        <span style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '1px 6px', borderRadius: 6, fontWeight: 800 }}>
                          {countPer} périodique
                        </span>
                        <span style={{ background: '#faf5ff', color: '#7e22ce', border: '1px solid #e9d5ff', padding: '1px 6px', borderRadius: 6, fontWeight: 800 }}>
                          {countRep} reprise
                        </span>
                        <span style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '1px 6px', borderRadius: 6, fontWeight: 800 }}>
                          {countSpo} spontanée
                        </span>
                      </div>
                    )}
                  </div>
                  {bilansSelectedCount > 0 && (
                    <div style={{ color: '#86198f', fontWeight: 800 }}>
                      <strong>{bilansSelectedCount}</strong> bilan(s) complémentaire(s) en attente
                    </div>
                  )}
                </div>

                {/* Liste scrollable des salariés */}
                <div
                  style={{
                    maxHeight: 260,
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    background: 'var(--surface)',
                  }}
                >
                  {loadingPatients ? (
                    <div style={{ padding: 20, textAlign: 'center' }}>
                      <div className="spinner" />
                    </div>
                  ) : filteredPatientsList.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>
                      Aucun salarié ne correspond aux critères.
                    </div>
                  ) : (
                    filteredPatientsList.map((p) => {
                      const sel = selectedMap[p.id] || { checked: false };
                      const isChecked = sel.checked;

                      return (
                        <div
                          key={p.id}
                          style={{
                            padding: '10px 12px',
                            borderBottom: '1px solid var(--border)',
                            background: isChecked ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => togglePatient(p)}
                              style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#10b981' }}
                            />
                            <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => togglePatient(p)}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontFamily: 'monospace',
                                    fontWeight: 800,
                                    background: '#eff6ff',
                                    color: '#0369a1',
                                    border: '1px solid #bae6fd',
                                    padding: '2px 7px',
                                    borderRadius: 5,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                  title="Matricule de dossier médical"
                                >
                                  <span>{p.matricule || `DOS-${String(p.id).padStart(4, '0')}`}</span>
                                </span>
                                <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--text)' }}>
                                  {p.nom} {p.prenom}
                                </span>
                                {p.cin && <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>({p.cin})</span>}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                                {p.poste || 'Salarié'} {p.departement ? `· ${p.departement}` : ''}
                                {p.date_derniere_visite && ` · Vu le ${String(p.date_derniere_visite).slice(0, 10)}`}
                              </div>
                            </div>

                            {/* Statut actuel si non coché */}
                            {!isChecked && (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 8,
                                  background: p.resultat_visite && p.resultat_visite !== 'en_attente' ? '#dcfce7' : '#ffedd5',
                                  color: p.resultat_visite && p.resultat_visite !== 'en_attente' ? '#166534' : '#c2410c',
                                }}
                              >
                                {p.resultat_visite === 'apte'
                                  ? 'Apte'
                                  : p.resultat_visite === 'apte_temporaire'
                                  ? 'Apte temp.'
                                  : p.resultat_visite === 'inapte_temporaire'
                                  ? 'Inapte temp.'
                                  : p.resultat_visite === 'apte_avec_amenagement'
                                  ? 'Aménagement'
                                  : p.resultat_visite === 'inapte'
                                  ? 'Inapte'
                                  : 'En attente'}
                              </span>
                            )}
                          </div>

                          {/* Options interactives pour le salarié coché */}
                          {isChecked && (
                            <div
                              style={{
                                marginTop: 8,
                                padding: '8px 12px',
                                background: 'var(--surface2)',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                              }}
                            >
                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                {/* Type de visite pour ce salarié */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>Type :</span>
                                  <select
                                    className="input"
                                    style={{ fontSize: 11.5, height: 28, padding: '1px 6px', borderRadius: 6, fontWeight: 800 }}
                                    value={sel.type_visite || 'Visite Médicale Périodique'}
                                    onChange={(e) => updatePatientField(p.id, 'type_visite', e.target.value)}
                                  >
                                    <option value="Visite Médicale Périodique">Périodique</option>
                                    <option value="Visite d'Embauche">Embauche</option>
                                    <option value="Visite de Reprise">Reprise</option>
                                    <option value="Visite Spontanée">Spontanée</option>
                                  </select>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>Résultat Aptitude :</span>
                                  <select
                                    className="input"
                                    style={{ fontSize: 11.5, height: 28, padding: '1px 6px', borderRadius: 6, fontWeight: 800 }}
                                    value={sel.resultat_visite || 'apte'}
                                    onChange={(e) => updatePatientField(p.id, 'resultat_visite', e.target.value)}
                                  >
                                    <option value="apte">Apte</option>
                                    <option value="apte_temporaire">Apte temporaire</option>
                                    <option value="apte_avec_amenagement">Apte avec aménagement</option>
                                    <option value="inapte_temporaire">Inapte temporaire</option>
                                    <option value="inapte">Inapte</option>
                                  </select>
                                </div>

                                {(sel.resultat_visite === 'apte_temporaire' || sel.resultat_visite === 'inapte_temporaire') && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1' }}>Période :</span>
                                    <select
                                      className="input"
                                      style={{ fontSize: 11, height: 28, padding: '1px 6px', borderRadius: 6, fontWeight: 800 }}
                                      value={sel.duree_temporaire || '3 mois à revoir'}
                                      onChange={(e) => updatePatientField(p.id, 'duree_temporaire', e.target.value)}
                                    >
                                      <option value="15 jours">15 jours</option>
                                      <option value="1 mois">1 mois</option>
                                      <option value="2 mois">2 mois</option>
                                      <option value="3 mois à revoir">3 mois à revoir</option>
                                      <option value="6 mois">6 mois</option>
                                    </select>
                                  </div>
                                )}

                                {/* Checkbox Bilan complémentaire */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: '#7e22ce' }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(sel.bilan_en_attente)}
                                    onChange={(e) => updatePatientField(p.id, 'bilan_en_attente', e.target.checked)}
                                    style={{ accentColor: '#9333ea' }}
                                  />
                                  En attente de bilan (Radio, Analyses...)
                                </label>
                              </div>

                              {/* 3 Examens complémentaires réalisés : Visio / Audio / ECG */}
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  flexWrap: 'wrap',
                                  padding: '5px 0 2px',
                                  borderTop: '1px dashed var(--border)',
                                }}
                              >
                                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)' }}>
                                  Examens faits :
                                </span>

                                {/* 1. Visio */}
                                <button
                                  type="button"
                                  onClick={() => updatePatientField(p.id, 'has_visio', !sel.has_visio)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '3px 10px',
                                    borderRadius: 6,
                                    border: sel.has_visio ? '1.5px solid #0284c7' : '1px solid var(--border)',
                                    background: sel.has_visio ? '#e0f2fe' : 'var(--surface)',
                                    color: sel.has_visio ? '#0369a1' : 'var(--text-3)',
                                    fontSize: 11.5,
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  title="Cocher si l'examen de la vue (Visio) a été réalisé"
                                >
                                  <span>Visio</span>
                                  <span
                                    style={{
                                      width: 15,
                                      height: 15,
                                      borderRadius: 4,
                                      background: sel.has_visio ? '#0284c7' : 'transparent',
                                      border: sel.has_visio ? 'none' : '1.5px solid #94a3b8',
                                      color: '#fff',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 10,
                                      fontWeight: 900,
                                    }}
                                  >
                                    {sel.has_visio ? '✓' : ''}
                                  </span>
                                </button>

                                {/* 2. Audio */}
                                <button
                                  type="button"
                                  onClick={() => updatePatientField(p.id, 'has_audio', !sel.has_audio)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '3px 10px',
                                    borderRadius: 6,
                                    border: sel.has_audio ? '1.5px solid #0d9488' : '1px solid var(--border)',
                                    background: sel.has_audio ? '#ccfbf1' : 'var(--surface)',
                                    color: sel.has_audio ? '#0f766e' : 'var(--text-3)',
                                    fontSize: 11.5,
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  title="Cocher si l'examen auditif (Audio) a été réalisé"
                                >
                                  <span>Audio</span>
                                  <span
                                    style={{
                                      width: 15,
                                      height: 15,
                                      borderRadius: 4,
                                      background: sel.has_audio ? '#0d9488' : 'transparent',
                                      border: sel.has_audio ? 'none' : '1.5px solid #94a3b8',
                                      color: '#fff',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 10,
                                      fontWeight: 900,
                                    }}
                                  >
                                    {sel.has_audio ? '✓' : ''}
                                  </span>
                                </button>

                                {/* 3. ECG */}
                                <button
                                  type="button"
                                  onClick={() => updatePatientField(p.id, 'has_ecg', !sel.has_ecg)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '3px 10px',
                                    borderRadius: 6,
                                    border: sel.has_ecg ? '1.5px solid #e11d48' : '1px solid var(--border)',
                                    background: sel.has_ecg ? '#ffe4e6' : 'var(--surface)',
                                    color: sel.has_ecg ? '#be123c' : 'var(--text-3)',
                                    fontSize: 11.5,
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  title="Cocher si l'électrocardiogramme (ECG) a été réalisé"
                                >
                                  <span>ECG</span>
                                  <span
                                    style={{
                                      width: 15,
                                      height: 15,
                                      borderRadius: 4,
                                      background: sel.has_ecg ? '#e11d48' : 'transparent',
                                      border: sel.has_ecg ? 'none' : '1.5px solid #94a3b8',
                                      color: '#fff',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 10,
                                      fontWeight: 900,
                                    }}
                                  >
                                    {sel.has_ecg ? '✓' : ''}
                                  </span>
                                </button>
                              </div>

                              {sel.bilan_en_attente && (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                                  <input
                                    type="text"
                                    className="input"
                                    placeholder="Préciser le bilan (ex: Radio thorax, Bilan hépatique...)"
                                    value={sel.type_bilan || ''}
                                    onChange={(e) => updatePatientField(p.id, 'type_bilan', e.target.value)}
                                    style={{ fontSize: 11, height: 26, padding: '1px 6px', borderRadius: 6 }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* CADRE MODE NUMÉRIQUE MANUEL */
              <div
                style={{
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label" style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)' }}>
                      Salariés examinés ce jour *
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="input"
                      style={{ fontSize: 16, fontWeight: 800, color: '#065f46', borderColor: '#10b981' }}
                      value={f.nb_examines}
                      onChange={(e) => s('nb_examines', e.target.value)}
                      placeholder="ex: 15"
                    />
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>
                      Total des effectifs vus
                    </div>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: 12.5, fontWeight: 800, color: '#0369a1' }}>
                      Bilans complémentaires
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="input"
                      style={{ fontSize: 16, fontWeight: 800, color: '#0369a1' }}
                      value={f.nb_bilans}
                      onChange={(e) => s('nb_bilans', e.target.value)}
                      placeholder="0"
                    />
                    <div style={{ fontSize: 10.5, color: '#0284c7', marginTop: 2 }}>
                      Analyses & examens effectués
                    </div>
                  </div>
                </div>

                {/* Ventilation manuelle par type de visite */}
                <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
                    Répartition des visites (Embauche, Périodique, Reprise, Spontanée) :
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#047857', display: 'block', marginBottom: 2 }}>
                        Embauche
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="input"
                        style={{ fontSize: 13, height: 32, fontWeight: 800, color: '#047857' }}
                        value={f.nb_embauche}
                        onChange={(e) => s('nb_embauche', e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', display: 'block', marginBottom: 2 }}>
                        Périodique
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="input"
                        style={{ fontSize: 13, height: 32, fontWeight: 800, color: '#0284c7' }}
                        value={f.nb_periodique}
                        onChange={(e) => s('nb_periodique', e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#7e22ce', display: 'block', marginBottom: 2 }}>
                        Reprise
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="input"
                        style={{ fontSize: 13, height: 32, fontWeight: 800, color: '#7e22ce' }}
                        value={f.nb_reprise}
                        onChange={(e) => s('nb_reprise', e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', display: 'block', marginBottom: 2 }}>
                        Spontanée
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="input"
                        style={{ fontSize: 13, height: 32, fontWeight: 800, color: '#c2410c' }}
                        value={f.nb_spontanee}
                        onChange={(e) => s('nb_spontanee', e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Rapport / Observations */}
            <div>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>
                Rapport / Observations générales
              </label>
              <textarea
                className="input"
                rows={2}
                value={f.commentaire}
                onChange={(e) => s('commentaire', e.target.value)}
                placeholder="Remarques médicales, aptitudes, observations particulières pour cette intervention..."
                style={{ fontSize: 12.5 }}
              />
            </div>
          </div>

          <div
            className="modal-footer"
            style={{
              borderTop: '1px solid var(--border)',
              padding: '12px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--surface)',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
              {mode === 'select'
                ? `Total examiné : ${selectedCount} salarié(s) sélectionné(s)`
                : `Total examiné : ${f.nb_examines || 0} salarié(s)`}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
                Annuler
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
                style={{ fontWeight: 800, padding: '8px 18px' }}
              >
                {saving ? 'Enregistrement...' : 'Valider la visite & l\'effectif vu'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Entreprise detail panel ───────────────────────────────────
function EntrepriseDetail({ entreprise, onClose, onEdit, onQuickBilan, onPlanifier, onReload, onDelete, toast, initialHsePatient, initialTab }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrateur';
  const isHSE = user?.role === 'hse';
  const currentYear = new Date().getFullYear();
  const [avis, setAvis] = useState([]);
  const [visites, setVisites] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientFilterType, setPatientFilterType] = useState('all');
  const [patientFilterResultat, setPatientFilterResultat] = useState('all');
  const [showPatientModal, setShowPatientModal] = useState(null);
  const [showExcelPatientModal, setShowExcelPatientModal] = useState(false);
  const [showPatientDocsModal, setShowPatientDocsModal] = useState(null);
  const [confirmDelPatient, setConfirmDelPatient] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab || (initialHsePatient ? 'rapports_hse' : 'patients')); // 'patients' | 'rapports_hse' | 'visites' | 'avis' | 'campagnes'
  const [showOverview, setShowOverview] = useState(true);
  const [patientViewMode, setPatientViewMode] = useState(typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table');
  const [showVisiteModal, setShowVisiteModal] = useState(false);
  const [showHseModal, setShowHseModal] = useState(initialHsePatient ? { patient: initialHsePatient } : null); // null | true | { patient: p }
  const [confirmDelVisite, setConfirmDelVisite] = useState(null);
  const [medecins, setMedecins] = useState([]);
  const [techniciens, setTechniciens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAvis, setShowAvis] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [startingNewCampaign, setStartingNewCampaign] = useState(false);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const { on } = useSocket() || {};

  useEffect(() => {
    loadAvis();
    loadVisites();
    loadPatients();
    Promise.resolve().then(() => axios.get('/api/users/by-role/medecin')).then((r) => setMedecins(r?.data || [])).catch(() => {});
    Promise.resolve().then(() => axios.get('/api/users/by-role/technicien')).then((r) => setTechniciens(r?.data || [])).catch(() => {});
  }, [entreprise.id]);

  useEffect(() => {
    if (!on) return;
    const off1 = on('patients_refresh', (data) => {
      if (!data?.entreprise_id || Number(data.entreprise_id) === Number(entreprise.id)) {
        loadPatients();
      }
    });
    const off2 = on('entreprises_refresh', () => {
      loadVisites();
    });
    return () => { off1?.(); off2?.(); };
  }, [on, entreprise.id]);

  async function loadPatients() {
    setLoadingPatients(true);
    try {
      const res = await axios.get(`/api/entreprises/${entreprise.id}/patients`);
      setPatients(res?.data || []);
    } catch {
      // fallback
    } finally {
      setLoadingPatients(false);
    }
  }

  const visitesHse = useMemo(() => {
    return visites.filter((v) => v.rapport_type === 'hse' || v.created_by_role === 'hse' || v.lieu_poste || v.patient_id);
  }, [visites]);

  const visitesMedicales = useMemo(() => {
    return visites.filter((v) => !(v.rapport_type === 'hse' || v.created_by_role === 'hse' || v.lieu_poste));
  }, [visites]);

  async function handleDeletePatient(id) {
    try {
      await axios.delete(`/api/entreprises/${entreprise.id}/patients/${id}`);
      setConfirmDelPatient(null);
      loadPatients();
      onReload?.();
      toast?.('Patient / salarié supprimé avec succès', 'success');
    } catch {
      toast?.('Erreur lors de la suppression', 'error');
    }
  }

  function handleExportPatientsExcel() {
    if (!patients || patients.length === 0) return;
    const exportData = patients.map((p, idx) => ({
      'N°': idx + 1,
      'Nom': p.nom,
      'Prénom': p.prenom,
      'CIN': p.cin || '',
      'Matricule': p.matricule || '',
      'Genre': p.genre || 'M',
      'Date de Naissance': p.date_naissance ? String(p.date_naissance).slice(0, 10) : '',
      'Poste': p.poste || '',
      'Département': p.departement || '',
      'Téléphone': p.telephone || '',
      'Email': p.email || '',
      'Type de Visite': p.type_visite || 'Visite Périodique',
      'Résultat Aptitude':
        p.resultat_visite === 'apte'
          ? 'Apte'
          : p.resultat_visite === 'apte_temporaire'
          ? 'Apte temporaire'
          : p.resultat_visite === 'apte_avec_amenagement'
          ? 'Apte avec aménagement'
          : p.resultat_visite === 'inapte_temporaire'
          ? 'Inapte temporaire'
          : p.resultat_visite === 'inapte'
          ? 'Inapte'
          : 'En attente',
      'Période / À revoir': (p.resultat_visite === 'apte_temporaire' || p.resultat_visite === 'inapte_temporaire') ? (p.duree_temporaire || '3 mois à revoir') : '',
      'Date à revoir': p.date_revoir ? String(p.date_revoir).slice(0, 10) : '',
      'Date Visite': p.date_derniere_visite ? String(p.date_derniere_visite).slice(0, 10) : '',
      'Médecin': p.medecin_nom || '',
      'Notes': p.notes || '',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salariés');
    XLSX.writeFile(wb, `Salariés_${(entreprise.nom || 'Entreprise').replace(/[\/\\?%*:|"<>]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      if (patientFilterType !== 'all' && p.type_visite !== patientFilterType) return false;
      if (patientFilterResultat !== 'all') {
        const pRes = p.resultat_visite || 'en_attente';
        if (pRes !== patientFilterResultat) return false;
      }
      if (patientSearch.trim()) {
        const q = patientSearch.toLowerCase();
        const nom = (p.nom || '').toLowerCase();
        const prenom = (p.prenom || '').toLowerCase();
        const cin = (p.cin || '').toLowerCase();
        const matricule = (p.matricule || '').toLowerCase();
        const poste = (p.poste || '').toLowerCase();
        return nom.includes(q) || prenom.includes(q) || cin.includes(q) || matricule.includes(q) || poste.includes(q);
      }
      return true;
    });
  }, [patients, patientFilterType, patientFilterResultat, patientSearch]);

  async function loadAvis() {
    try {
      const res = await axios.get(`/api/entreprises/${entreprise.id}/avis`);
      setAvis(res?.data || []);
    } catch {
      toast?.('Erreur chargement avis', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadVisites() {
    try {
      const res = await axios.get(`/api/entreprises/${entreprise.id}/visites`);
      setVisites(res?.data?.visites || []);
    } catch {
      // fallback
    }
  }

  async function handleDeleteAvis(id) {
    try {
      await axios.delete(`/api/entreprises/${entreprise.id}/avis/${id}`);
      setConfirmDel(null);
      loadAvis();
      toast?.('Avis supprimé', 'success');
    } catch {
      toast?.('Erreur', 'error');
    }
  }

  async function handleDeleteVisite(visiteId) {
    try {
      await axios.delete(`/api/entreprises/${entreprise.id}/visites/${visiteId}`);
      setConfirmDelVisite(null);
      loadVisites();
      onReload?.();
      toast?.('Visite supprimée', 'success');
    } catch {
      toast?.('Erreur', 'error');
    }
  }

  async function handleStartNewCampaign() {
    if (!window.confirm(`Démarrer la campagne annuelle ${currentYear} pour "${entreprise.nom}" ?\n\nLes données de l'année précédente seront archivées et l'effectif examiné sera réinitialisé à 0 pour la nouvelle année.`)) {
      return;
    }
    setStartingNewCampaign(true);
    try {
      await axios.post(`/api/entreprises/${entreprise.id}/nouvelle-campagne`, {
        nouvelle_annee: currentYear,
      });
      toast?.(`Campagne ${currentYear} initialisée avec succès !`, 'success');
      onReload?.();
    } catch (e) {
      toast?.(e.response?.data?.message || 'Erreur', 'error');
    } finally {
      setStartingNewCampaign(false);
    }
  }

  const sumExamines = visites.reduce((acc, v) => acc + (parseInt(v.nb_examines, 10) || 0), 0);
  const effectif = parseInt(entreprise.effectif_total, 10) || 0;
  const faites = Math.max(parseInt(entreprise.nb_visites_faites, 10) || 0, sumExamines);
  const aFaire = Math.max(0, effectif - faites);
  const taux = effectif > 0 ? Math.min(100, Math.round((faites / effectif) * 100)) : 0;
  const anneeCampagne = entreprise.annee_campagne || currentYear;
  const isNouvelleAnnee = parseInt(anneeCampagne, 10) < currentYear;

  const avgNote = avis.filter((a) => a.note > 0).length
    ? (avis.filter((a) => a.note > 0).reduce((s, a) => s + a.note, 0) / avis.filter((a) => a.note > 0).length).toFixed(1)
    : null;

  const TYPE_COLORS = { avis: '#0ea5e9', remarque: '#f59e0b', suggestion: '#10b981' };
  const TYPE_LABELS = { avis: 'Avis', remarque: 'Remarque', suggestion: 'Suggestion' };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 80,
      }}
    >
      {/* Header */}
      <div style={{ padding: 'clamp(14px, 3vw, 20px)', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)' }}>{entreprise.nom}</h2>
              {isAdmin && entreprise.code && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '3px 9px',
                    borderRadius: 6,
                    background: 'var(--surface2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title="Code Entreprise visible uniquement par l'administrateur"
                >
                  Code : <strong>{entreprise.code}</strong>
                </span>
              )}
              <span className={`badge ${entreprise.convensionne ? 'badge-green' : 'badge-red'}`}>
                {entreprise.convensionne ? 'Conventionnée' : 'Non conventionnée'}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '3px 9px',
                  borderRadius: 6,
                  background: isNouvelleAnnee ? '#fee2e2' : '#e0f2fe',
                  color: isNouvelleAnnee ? '#991b1b' : '#0369a1',
                  border: isNouvelleAnnee ? '1px solid #f87171' : '1px solid #7dd3fc',
                }}
              >
                Campagne {anneeCampagne}
              </span>
            </div>
            {entreprise.secteur && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{entreprise.secteur}</div>}
            {avgNote && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Stars value={Math.round(avgNote)} size={14} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--warn)' }}>{avgNote} / 5</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}> ({avis.filter((a) => a.note > 0).length} avis)</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {!isHSE && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowVisiteModal(true)}
                title="Enregistrer une visite médicale"
                style={{ fontWeight: 700, padding: '6px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <IconStethoscope size={15} />
                <span>Enregistrer Visite</span>
              </button>
            )}
            {isAdmin && onPlanifier && (
              <button
                className="btn btn-outline btn-sm"
                onClick={onPlanifier}
                title="Planifier au planning général"
                style={{ fontWeight: 700, padding: '6px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <IconCalendar size={15} />
                <span>Planifier</span>
              </button>
            )}
            {isAdmin && (
              <button
                className="btn btn-outline btn-sm"
                onClick={onEdit}
                style={{ padding: '6px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
                title="Modifier l'entreprise"
              >
                <IconEdit size={14} />
                <span>Modifier</span>
              </button>
            )}
            {isAdmin && (
              <button
                className="btn btn-danger btn-sm"
                onClick={onDelete}
                style={{ padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center' }}
                title="Supprimer l'entreprise"
              >
                <IconTrash size={14} />
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ padding: '6px 10px', borderRadius: 8 }}>✕ Fermer</button>
          </div>
        </div>

        {/* Onglets principaux - Positionnés en haut pour un accès immédiat sur smartphone */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 14,
            paddingTop: 12,
            paddingBottom: 6,
            borderTop: '1px solid var(--border)',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'var(--surface)',
          }}
        >
          {[
            ['patients', `Salariés / Patients (${patients.length})`, 'var(--primary)'],
            ['rapports_hse', `Visites de Poste & Lieux HSE (${visitesHse.length})`, '#0284c7'],
            ['visites', `Historique des Visites (${visitesMedicales.length})`, '#059669'],
            ['avis', `Avis & Remarques (${avis.length})`, '#ea580c'],
            ['campagnes', `Campagnes (${entreprise.campagnes?.length || 0})`, '#8b5cf6'],
          ].map(([tKey, label, accentColor]) => (
            <button
              key={tKey}
              type="button"
              onClick={() => setActiveTab(tKey)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: activeTab === tKey ? `2px solid ${accentColor}` : '1px solid var(--border)',
                background: activeTab === tKey ? 'var(--surface2)' : 'transparent',
                fontWeight: activeTab === tKey ? 800 : 600,
                color: activeTab === tKey ? accentColor : 'var(--text-2)',
                fontSize: 12.5,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Barre de résumé compacte & dépliable pour la convention et les chiffres */}
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 12px',
              background: 'var(--surface2)',
              borderRadius: 8,
              border: '1px solid var(--border)',
              cursor: 'pointer',
              flexWrap: 'wrap',
              gap: 8,
            }}
            onClick={() => setShowOverview(!showOverview)}
            title="Cliquer pour afficher ou masquer la convention et les indicateurs"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                Effectif : <strong style={{ color: 'var(--primary)' }}>{parseInt(entreprise.effectif_total, 10) || patients.length}</strong>
              </span>
              <span>·</span>
              <span style={{ color: '#16a34a', fontWeight: 600 }}>
                Visites faites : <strong>{parseInt(entreprise.nb_visites_faites, 10) || 0}</strong>
              </span>
              {entreprise.convensionne && (
                <>
                  <span>·</span>
                  <span style={{ color: '#059669', fontWeight: 700 }}>Convention active</span>
                </>
              )}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 8px', fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}
            >
              {showOverview ? '▲ Masquer détails convention' : '▼ Voir convention & bilan'}
            </button>
          </div>

          {showOverview && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Alerte si nouvelle année atteinte */}
        {isNouvelleAnnee && (
          <div
            style={{
              marginTop: 12,
              padding: '12px 16px',
              background: '#fffbeb',
              border: '1px solid #f59e0b',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <IconBell size={18} color="#b45309" />
              <div>
                <strong style={{ color: '#92400e', fontSize: 13 }}>Rappel Annuel : Nouvelle Année {currentYear} atteinte</strong>
                <div style={{ fontSize: 12, color: '#78350f', marginTop: 1 }}>
                  La dernière campagne enregistrée date de {anneeCampagne}. Initialisez la campagne {currentYear} pour remettre l'effectif en attente.
                </div>
              </div>
            </div>
            {isAdmin && (
              <button
                className="btn btn-warning btn-sm"
                onClick={handleStartNewCampaign}
                disabled={startingNewCampaign}
                style={{ fontWeight: 700, fontSize: 12 }}
              >
                {startingNewCampaign ? 'Initialisation...' : `Démarrer Campagne ${currentYear}`}
              </button>
            )}
          </div>
        )}

        {/* Section Convention & Validité */}
        <div
          style={{
            marginTop: 14,
            padding: '12px 18px',
            background: 'var(--surface2)',
            borderRadius: 12,
            border: `1px solid ${entreprise.convensionne ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <IconDocument size={20} color="var(--primary)" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                {entreprise.convensionne ? 'Convention de Médecine du Travail' : 'Entreprise Non Conventionnée'}
              </div>
              {entreprise.convensionne ? (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>
                    Période : <strong>{formatConventionRange(entreprise.date_debut_convention, entreprise.date_fin_convention)}</strong>
                  </span>
                  <span>•</span>
                  <span style={{ fontWeight: 700, color: entreprise.renouvelable ? '#059669' : '#64748b' }}>
                    {entreprise.renouvelable ? 'Renouvelable (Tacite reconduction)' : 'Non renouvelable'}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  Cette structure ne dispose pas encore de convention d'intervention active.
                </div>
              )}
            </div>
          </div>
          {entreprise.convensionne && getConventionBadge(entreprise.date_fin_convention)}
        </div>

        {/* Section Chiffres & Bilan Médical Annuel ou Suivi HSE */}
        {isHSE ? (
          <div
            style={{
              marginTop: 16,
              padding: '16px 20px',
              background: 'var(--surface2)',
              borderRadius: 14,
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconShield size={16} color="var(--primary)" />
                <span>Suivi Prévention, Hygiène & Sécurité au Travail (HSE)</span>
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '2px 10px',
                  borderRadius: 12,
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              >
                {visitesHse.length} rapport{visitesHse.length > 1 ? 's' : ''} enregistré{visitesHse.length > 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>Rapports Visite HSE</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', marginTop: 2 }}>{visitesHse.length}</div>
              </div>
              <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>Lieux & Postes Inspectés</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--primary)', marginTop: 2 }}>
                  {new Set(visitesHse.map((v) => v.lieu_poste).filter(Boolean)).size}
                </div>
              </div>
              <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>Alertes / Risques Traités</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#dc2626', marginTop: 2 }}>
                  {visitesHse.reduce((acc, v) => {
                    let count = 0;
                    if (v.risques_identifies) {
                      try {
                        const parsed = JSON.parse(v.risques_identifies);
                        count = Array.isArray(parsed) ? parsed.length : 1;
                      } catch {
                        count = String(v.risques_identifies).split(',').length;
                      }
                    }
                    return acc + count;
                  }, 0)}
                </div>
              </div>
              <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>Recommandations Émises</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a', marginTop: 2 }}>
                  {visitesHse.filter((v) => v.recommandations && v.recommandations.trim()).length}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: 16,
              padding: '16px 20px',
              background: 'var(--surface2)',
              borderRadius: 14,
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>
                Suivi Médical Annuel · Campagne {anneeCampagne}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '2px 10px',
                  borderRadius: 12,
                  background: taux >= 100 ? '#dcfce7' : '#fef3c7',
                  color: taux >= 100 ? '#166534' : '#92400e',
                }}
              >
                {taux}% complété
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ width: `${taux}%`, height: '100%', background: taux >= 100 ? '#22c55e' : '#0ea5e9', transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>Effectif Total</div>
                <div style={{ fontSize: 17, fontWeight: 900, marginTop: 2 }}>{effectif}</div>
              </div>
              <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>Déjà Visité ({anneeCampagne})</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#16a34a', marginTop: 2 }}>{faites}</div>
              </div>
              <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>En Attente (Reste)</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: aFaire > 0 ? '#ea580c' : '#16a34a', marginTop: 2 }}>{aFaire}</div>
              </div>
              <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>Bilans Faits</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#0ea5e9', marginTop: 2 }}>{entreprise.nb_bilans_faits || 0}</div>
              </div>
              <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>Bilans Manquants</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: (entreprise.nb_bilans_manquants || 0) > 0 ? '#dc2626' : '#16a34a', marginTop: 2 }}>
                  {entreprise.nb_bilans_manquants || 0}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Contact info */}
        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {entreprise.adresse && <NavigationSelector addr={entreprise.adresse} />}
          {entreprise.telephone && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Tél : {entreprise.telephone}</span>}
          {entreprise.email && (
            <a href={`mailto:${entreprise.email}`} style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
              {entreprise.email}
            </a>
          )}
          {entreprise.site_web && (
            <a href={entreprise.site_web} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
              Site web
            </a>
          )}
        </div>
        {entreprise.description && (
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 10, lineHeight: 1.5 }}>
            {entreprise.description}
          </p>
        )}
            </div>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, padding: 'clamp(12px, 3vw, 24px)' }}>
        {/* TAB 0: LISTE DES SALARIÉS / PATIENTS */}
        {activeTab === 'patients' && (
          <div>
            {/* Header section with buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>Salariés / Patients</span>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--primary-lt)', color: 'var(--primary)' }}>
                    {patients.length} au total
                  </span>
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  Suivi individuel des visites médicales (Embauche, Périodique, Spontanée, Reprise) et des aptitudes
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {isHSE ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowHseModal({ mode: 'poste' })}
                    style={{ fontWeight: 700, borderRadius: 8, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <IconUsers size={14} />
                    <span>Étude de Poste</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setShowPatientModal({ patient: null })}
                      style={{ fontWeight: 700, borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <IconPlus size={14} />
                      <span>Nouveau Salarié</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setShowExcelPatientModal(true)}
                      style={{ fontWeight: 700, borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                      title="Importer la liste des salariés depuis un fichier Excel (.xlsx / .csv)"
                    >
                      <IconUpload size={14} />
                      <span>Importer Excel</span>
                    </button>
                  </>
                )}
                {patients.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleExportPatientsExcel}
                    style={{ fontWeight: 700, borderRadius: 8, padding: '6px 12px' }}
                    title="Exporter tous les salariés vers Excel"
                  >
                    Exporter
                  </button>
                )}
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 18 }}>
              <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>Total Salariés</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2, color: 'var(--text)' }}>{patients.length}</div>
              </div>
              <div style={{ background: '#f0fdf4', padding: '10px 14px', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                <div style={{ color: '#166534', fontSize: 11, fontWeight: 700 }}>Aptes</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2, color: '#15803d' }}>
                  {patients.filter((p) => p.resultat_visite === 'apte').length}
                </div>
              </div>
              <div style={{ background: '#eff6ff', padding: '10px 14px', borderRadius: 10, border: '1px solid #bfdbfe' }}>
                <div style={{ color: '#1e40af', fontSize: 11, fontWeight: 700 }}>Aptes temporaires</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2, color: '#1d4ed8' }}>
                  {patients.filter((p) => p.resultat_visite === 'apte_temporaire').length}
                </div>
              </div>
              <div style={{ background: '#fffbeb', padding: '10px 14px', borderRadius: 10, border: '1px solid #fde68a' }}>
                <div style={{ color: '#92400e', fontSize: 11, fontWeight: 700 }}>Avec aménagement</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2, color: '#b45309' }}>
                  {patients.filter((p) => p.resultat_visite === 'apte_avec_amenagement').length}
                </div>
              </div>
              <div style={{ background: '#faf5ff', padding: '10px 14px', borderRadius: 10, border: '1px solid #e9d5ff' }}>
                <div style={{ color: '#6b21a8', fontSize: 11, fontWeight: 700 }}>Inaptes temporaires</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2, color: '#7e22ce' }}>
                  {patients.filter((p) => p.resultat_visite === 'inapte_temporaire').length}
                </div>
              </div>
              <div style={{ background: '#fef2f2', padding: '10px 14px', borderRadius: 10, border: '1px solid #fecaca' }}>
                <div style={{ color: '#991b1b', fontSize: 11, fontWeight: 700 }}>Inaptes</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2, color: '#b91c1c' }}>
                  {patients.filter((p) => p.resultat_visite === 'inapte').length}
                </div>
              </div>
              <div style={{ background: 'var(--surface2)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>En Attente</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2, color: '#ea580c' }}>
                  {patients.filter((p) => !p.resultat_visite || p.resultat_visite === 'en_attente').length}
                </div>
              </div>
            </div>

            {/* Filtres & Recherche */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 200px' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Rechercher par Nom, Prénom, CIN, Poste..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  style={{ fontSize: 12.5 }}
                />
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <select
                  className="input"
                  value={patientFilterType}
                  onChange={(e) => setPatientFilterType(e.target.value)}
                  style={{ fontSize: 12.5 }}
                >
                  <option value="all">Tous les types de visite</option>
                  {VISIT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <select
                  className="input"
                  value={patientFilterResultat}
                  onChange={(e) => setPatientFilterResultat(e.target.value)}
                  style={{ fontSize: 12.5 }}
                >
                  <option value="all">Tous les résultats d'aptitude</option>
                  {RESULTATS_APTITUDE.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Liste ou État vide */}
            {filteredPatients.length === 0 ? (
              <div className="empty-state" style={{ padding: '36px 16px', background: 'var(--surface)', borderRadius: 12, border: '1px dashed var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                  <IconUsers size={36} color="var(--text-3)" />
                </div>
                <p style={{ fontWeight: 800, fontSize: 15 }}>
                  {patients.length === 0 ? 'Aucun salarié enregistré pour cette entreprise' : 'Aucun salarié ne correspond aux filtres'}
                </p>
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 16px', maxWidth: 460 }}>
                  Vous pouvez importer toute la liste des salariés depuis un fichier Excel (.xlsx / .csv) ou ajouter les salariés un par un manuellement.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowPatientModal({ patient: null })}
                    style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <IconPlus size={14} />
                    <span>Ajouter manuellement</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setShowExcelPatientModal(true)}
                    style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <IconUpload size={14} />
                    <span>Importer fichier Excel</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Switcher vue cartes vs tableau sur mobile */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                    fontSize: 12,
                    color: 'var(--text-3)',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{filteredPatients.length} salarié(s) listé(s)</span>
                  <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${patientViewMode === 'cards' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setPatientViewMode('cards')}
                      style={{ padding: '3px 10px', fontSize: 11.5, borderRadius: 6, fontWeight: 700 }}
                    >
                      📱 Vue Cartes
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${patientViewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setPatientViewMode('table')}
                      style={{ padding: '3px 10px', fontSize: 11.5, borderRadius: 6, fontWeight: 700 }}
                    >
                      📊 Tableau
                    </button>
                  </div>
                </div>

                {patientViewMode === 'cards' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 12 }}>
                    {filteredPatients.map((p) => {
                      const resBadge = RESULTATS_APTITUDE.find((r) => r.value === p.resultat_visite) || RESULTATS_APTITUDE[0];
                      return (
                        <div
                          key={p.id}
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 14,
                            padding: '14px 16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span
                                  style={{
                                    padding: '2px 7px',
                                    borderRadius: 6,
                                    background: '#eff6ff',
                                    border: '1px solid #bfdbfe',
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: '#1d4ed8',
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {p.matricule || `DOS-${String(p.id).padStart(4, '0')}`}
                                </span>
                                <strong style={{ fontSize: 14.5, color: 'var(--text)' }}>
                                  {p.nom} {p.prenom}
                                </strong>
                              </div>
                              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
                                {p.genre === 'F' ? 'Femme' : 'Homme'} {p.cin ? `· CIN : ${p.cin}` : ''} {p.telephone ? `· 📞 ${p.telephone}` : ''}
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                padding: '3px 8px',
                                borderRadius: 8,
                                background: resBadge.bg,
                                color: resBadge.color,
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}
                            >
                              {resBadge.label}
                            </span>
                          </div>

                          <div style={{ background: 'var(--surface2)', padding: '8px 12px', borderRadius: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            <div>
                              <span style={{ color: 'var(--text-3)' }}>Poste : </span>
                              <strong style={{ color: 'var(--text)' }}>{p.poste || '—'}</strong>
                              {p.departement && <span style={{ color: 'var(--text-2)' }}> · {p.departement}</span>}
                            </div>
                            <span style={{ fontSize: 11, background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                              {p.type_visite || 'Visite Périodique'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 10,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: p.has_visio ? '#e0f2fe' : 'var(--surface2)',
                              color: p.has_visio ? '#0369a1' : 'var(--text-3)',
                              border: p.has_visio ? '1px solid #bae6fd' : '1px solid var(--border)',
                              fontWeight: 700,
                            }}>
                              Visio {p.has_visio ? '✓' : ''}
                            </span>
                            <span style={{
                              fontSize: 10,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: p.has_audio ? '#ccfbf1' : 'var(--surface2)',
                              color: p.has_audio ? '#0f766e' : 'var(--text-3)',
                              border: p.has_audio ? '1px solid #99f6e4' : '1px solid var(--border)',
                              fontWeight: 700,
                            }}>
                              Audio {p.has_audio ? '✓' : ''}
                            </span>
                            <span style={{
                              fontSize: 10,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: p.has_ecg ? '#ffe4e6' : 'var(--surface2)',
                              color: p.has_ecg ? '#be123c' : 'var(--text-3)',
                              border: p.has_ecg ? '1px solid #fecdd3' : '1px solid var(--border)',
                              fontWeight: 700,
                            }}>
                              ECG {p.has_ecg ? '✓' : ''}
                            </span>
                            {p.date_derniere_visite && (
                              <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
                                Visite : {String(p.date_derniere_visite).slice(0, 10)}
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 2 }}>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{
                                padding: '4px 10px',
                                fontSize: 11.5,
                                fontWeight: 700,
                                borderRadius: 7,
                                borderColor: (p.nb_documents || 0) > 0 ? '#3b82f6' : 'var(--border)',
                                color: (p.nb_documents || 0) > 0 ? '#1d4ed8' : 'var(--text-2)',
                                background: (p.nb_documents || 0) > 0 ? '#eff6ff' : 'transparent',
                              }}
                              onClick={() => setShowPatientDocsModal(p)}
                            >
                              📄 Docs ({p.nb_documents || 0})
                            </button>

                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              {!isHSE && (
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  style={{ padding: '4px 10px', fontSize: 11.5, fontWeight: 700 }}
                                  onClick={() => setShowPatientModal({ patient: p })}
                                >
                                  <IconEdit size={13} />
                                  <span>Modifier</span>
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '4px 8px', color: 'var(--danger)' }}
                                  onClick={() => setConfirmDelPatient(p)}
                                  title="Supprimer ce salarié"
                                >
                                  <IconTrash size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      background: 'var(--surface)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                      overflow: 'hidden',
                      width: '100%',
                    }}
                  >
                  <div className="table-scrollable-container">
                  <table
                    className="table"
                    style={{
                      width: '100%',
                      minWidth: 1200,
                      fontSize: 12.5,
                      margin: 0,
                      borderCollapse: 'collapse',
                    }}
                  >
                    <thead>
                      <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        <th style={{ padding: '10px 12px', minWidth: 130 }}>Dossier / Code</th>
                        <th style={{ padding: '10px 12px', minWidth: 190 }}>Salarié</th>
                        <th style={{ padding: '10px 12px', minWidth: 100 }}>CIN</th>
                        <th style={{ padding: '10px 12px', minWidth: 170 }}>Poste & Service</th>
                        <th style={{ padding: '10px 12px', minWidth: 140 }}>Examens</th>
                        <th style={{ padding: '10px 12px', minWidth: 130 }}>Type de Visite</th>
                        <th style={{ padding: '10px 12px', minWidth: 130 }}>Résultat Aptitude</th>
                        <th style={{ padding: '10px 12px', minWidth: 120 }}>Date Visite</th>
                        <th style={{ padding: '10px 12px', minWidth: 90, textAlign: 'center' }}>Docs</th>
                        <th style={{ padding: '10px 12px', minWidth: 140, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                  <tbody>
                    {filteredPatients.map((p) => {
                      const resBadge = RESULTATS_APTITUDE.find((r) => r.value === p.resultat_visite) || RESULTATS_APTITUDE[0];
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                fontSize: 12,
                                fontWeight: 800,
                                color: '#1d4ed8',
                                fontFamily: 'monospace',
                              }}
                            >
                              <span>{p.matricule || `DOS-${String(p.id).padStart(4, '0')}`}</span>
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: 13 }}>
                                {p.nom} {p.prenom}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                              {p.genre === 'F' ? 'Femme' : 'Homme'} {p.date_naissance ? `· Né(e) le ${String(p.date_naissance).slice(0, 10)}` : ''}
                              {p.telephone ? ` · Tél : ${p.telephone}` : ''}
                            </div>
                            {p.created_by_nom && (
                              <div style={{ fontSize: 10.5, marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ color: 'var(--text-3)' }}>Ajouté par :</span>
                                <strong style={{ color: p.created_by_role === 'medecin' ? '#0284c7' : (p.created_by_role === 'technicien' ? '#059669' : 'var(--text)') }}>
                                  {p.created_by_role === 'medecin' && !p.created_by_nom.startsWith('Dr.') ? `Dr. ${p.created_by_nom}` : p.created_by_nom}
                                </strong>
                                <span style={{
                                  fontSize: 9.5,
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  background: p.created_by_role === 'medecin' ? '#e0f2fe' : (p.created_by_role === 'technicien' ? '#dcfce7' : '#f1f5f9'),
                                  color: p.created_by_role === 'medecin' ? '#0369a1' : (p.created_by_role === 'technicien' ? '#166534' : '#475569')
                                }}>
                                  {p.created_by_role === 'medecin' ? 'Médecin' : (p.created_by_role === 'technicien' ? 'Technicien' : 'Admin')}
                                </span>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            {p.cin ? <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{p.cin}</span> : <span style={{ color: 'var(--text-3)' }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ fontWeight: 600 }}>{p.poste || '—'}</div>
                            {p.departement && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.departement}</div>}
                          </td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <span
                                style={{
                                  fontSize: 10.5,
                                  padding: '2px 5px',
                                  borderRadius: 4,
                                  background: p.has_visio ? '#e0f2fe' : 'var(--surface2)',
                                  color: p.has_visio ? '#0369a1' : 'var(--text-3)',
                                  border: p.has_visio ? '1px solid #bae6fd' : '1px solid var(--border)',
                                  fontWeight: p.has_visio ? 800 : 500,
                                  opacity: p.has_visio ? 1 : 0.6,
                                }}
                                title={p.has_visio ? 'Visio réalisé' : 'Visio non fait'}
                              >
                                Visio {p.has_visio ? '✓' : ''}
                              </span>
                              <span
                                style={{
                                  fontSize: 10.5,
                                  padding: '2px 5px',
                                  borderRadius: 4,
                                  background: p.has_audio ? '#ccfbf1' : 'var(--surface2)',
                                  color: p.has_audio ? '#0f766e' : 'var(--text-3)',
                                  border: p.has_audio ? '1px solid #99f6e4' : '1px solid var(--border)',
                                  fontWeight: p.has_audio ? 800 : 500,
                                  opacity: p.has_audio ? 1 : 0.6,
                                }}
                                title={p.has_audio ? 'Audio réalisé' : 'Audio non fait'}
                              >
                                Audio {p.has_audio ? '✓' : ''}
                              </span>
                              <span
                                style={{
                                  fontSize: 10.5,
                                  padding: '2px 5px',
                                  borderRadius: 4,
                                  background: p.has_ecg ? '#ffe4e6' : 'var(--surface2)',
                                  color: p.has_ecg ? '#be123c' : 'var(--text-3)',
                                  border: p.has_ecg ? '1px solid #fecdd3' : '1px solid var(--border)',
                                  fontWeight: p.has_ecg ? 800 : 500,
                                  opacity: p.has_ecg ? 1 : 0.6,
                                }}
                                title={p.has_ecg ? 'ECG réalisé' : 'ECG non fait'}
                              >
                                ECG {p.has_ecg ? '✓' : ''}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ fontSize: 11.5, background: 'var(--surface2)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>
                              {p.type_visite || 'Visite Périodique'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span
                              style={{
                                fontSize: 11.5,
                                fontWeight: 800,
                                padding: '3px 10px',
                                borderRadius: 12,
                                background: resBadge.bg,
                                color: resBadge.color,
                                display: 'inline-block',
                              }}
                            >
                              {resBadge.label}
                            </span>
                            {(p.resultat_visite === 'apte_temporaire' || p.resultat_visite === 'inapte_temporaire') && (
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  color: p.resultat_visite === 'apte_temporaire' ? '#0369a1' : '#7e22ce',
                                  marginTop: 3,
                                  background: p.resultat_visite === 'apte_temporaire' ? '#e0f2fe' : '#f3e8ff',
                                  padding: '2px 6px',
                                  borderRadius: 5,
                                  display: 'inline-block',
                                }}
                              >
                                {p.duree_temporaire || '3 mois à revoir'}
                                {p.date_revoir && <span style={{ fontWeight: 600, color: 'var(--text-2)' }}> · Revoir le {String(p.date_revoir).slice(0, 10)}</span>}
                              </div>
                            )}
                            {p.notes && (
                              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.notes}>
                                {p.notes}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            <div>{p.date_derniere_visite ? String(p.date_derniere_visite).slice(0, 10) : <span style={{ color: 'var(--text-3)' }}>—</span>}</div>
                            {p.medecin_nom && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.medecin_nom}</div>}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{
                                padding: '4px 10px',
                                fontSize: 11.5,
                                fontWeight: 700,
                                borderRadius: 8,
                                borderColor: (p.nb_documents || 0) > 0 ? '#3b82f6' : 'var(--border)',
                                color: (p.nb_documents || 0) > 0 ? '#1d4ed8' : 'var(--text-2)',
                                background: (p.nb_documents || 0) > 0 ? '#eff6ff' : 'var(--surface2)',
                              }}
                              title="Gérer les documents, ordonnances et images de ce salarié"
                              onClick={() => setShowPatientDocsModal(p)}
                            >
                              Docs ({p.nb_documents || 0})
                            </button>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                              {isHSE && (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{
                                    padding: '4px 9px',
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    background: 'var(--surface2)',
                                    color: 'var(--text)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 7,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={`Rédiger une étude de poste pour ${p.nom} ${p.prenom}`}
                                  onClick={() => setShowHseModal({ mode: 'poste', patient: p })}
                                >
                                  <IconUsers size={13} />
                                  <span>Étude de poste</span>
                                </button>
                              )}
                              {!isHSE && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '4px 8px', fontSize: 12 }}
                                  title="Modifier le salarié et son aptitude"
                                  onClick={() => setShowPatientModal({ patient: p })}
                                >
                                  <IconEdit size={14} />
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '4px 8px', fontSize: 12, color: 'var(--danger)' }}
                                  title="Supprimer ce salarié"
                                  onClick={() => setConfirmDelPatient(p)}
                                >
                                  <IconTrash size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    )}

        {/* TAB HSE: RAPPORTS DE VISITE DE POSTE & DE LIEUX */}
        {activeTab === 'rapports_hse' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>Rapports de Visite de Poste & Lieux (HSE)</span>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--surface2)', color: 'var(--text)' }}>
                    {visitesHse.length} rapport(s)
                  </span>
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  Fiches d'inspection des ateliers, étude ergonomique des postes et consignes de sécurité
                </div>
              </div>
              {isHSE ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowHseModal({ mode: 'lieu' })}
                    style={{ fontWeight: 700, borderRadius: 8, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
                    title="Analyser l'espace physique, les infrastructures et les dangers globaux d'une zone"
                  >
                    <IconBuilding size={14} />
                    <span>Étude de Lieu / Site</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setShowHseModal({ mode: 'poste' })}
                    style={{ fontWeight: 700, borderRadius: 8, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
                    title="Analyser l'activité humaine et les tâches d'un travailleur précis"
                  >
                    <IconUsers size={14} />
                    <span>Étude de Poste</span>
                  </button>
                </div>
              ) : (
                <div style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  fontSize: 12,
                  color: 'var(--text-2)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <IconShield size={14} color="#b45309" />
                  <span>Mode Consultation — Rapports officiels rédigés par le Responsable HSE (Lecture seule)</span>
                </div>
              )}
            </div>

            {visitesHse.length === 0 ? (
              <div className="empty-state" style={{ padding: '36px 16px', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                  <IconShield size={36} color="var(--text-3)" />
                </div>
                <p style={{ fontWeight: 800, fontSize: 15, marginTop: 8 }}>Aucun rapport de visite HSE enregistré</p>
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 16px', maxWidth: 520 }}>
                  {isHSE
                    ? "En démarche HSE, distinguez l'Étude de Poste (analyse de l'activité humaine et de l'ergonomie d'un travailleur précis) de l'Étude de Lieu / Site (évaluation de l'espace physique, des ateliers et des risques globaux)."
                    : "Aucun rapport de visite de poste ou de lieu n'a encore été consigné par le Responsable HSE pour cette entreprise."}
                </p>
                {isHSE && (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setShowHseModal({ mode: 'lieu' })}
                      style={{ fontWeight: 700, borderRadius: 8, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
                      title="Analyser l'espace physique, les infrastructures et les dangers globaux d'une zone"
                    >
                      <IconBuilding size={14} />
                      <span>Nouvelle Étude de Lieu / Site</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setShowHseModal({ mode: 'poste' })}
                      style={{ fontWeight: 700, borderRadius: 8, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
                      title="Analyser l'activité humaine et les tâches d'un travailleur précis"
                    >
                      <IconUsers size={14} />
                      <span>Nouvelle Étude de Poste</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {visitesHse.map((v) => {
                  const dateFormatted = v.date ? new Date(v.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                  let parsedRisques = [];
                  if (v.risques_identifies) {
                    try {
                      parsedRisques = JSON.parse(v.risques_identifies);
                      if (!Array.isArray(parsedRisques)) parsedRisques = [v.risques_identifies];
                    } catch {
                      parsedRisques = String(v.risques_identifies).split(',').map((s) => s.trim()).filter(Boolean);
                    }
                  }

                  const isPoste = Boolean(v.patient_nom || v.patient_id || (v.type_visite && v.type_visite.toLowerCase().includes('poste')));

                  return (
                    <div
                      key={v.id || v.visite_id}
                      style={{
                        background: 'var(--surface)',
                        borderRadius: 14,
                        padding: '16px 20px',
                        border: '1px solid var(--border)',
                        borderLeft: isPoste ? '4px solid #b45309' : '4px solid #0284c7',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                              {v.lieu_poste || (v.patient_nom ? `Poste de ${v.patient_nom}` : 'Visite générale des lieux')}
                            </span>
                            {isPoste ? (
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: '#fef3c7',
                                color: '#b45309',
                                border: '1px solid #fde68a',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}>
                                <IconUsers size={12} />
                                <span>Étude de Poste</span>
                              </span>
                            ) : (
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: '#e0f2fe',
                                color: '#0369a1',
                                border: '1px solid #bae6fd',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}>
                                <IconBuilding size={12} />
                                <span>Étude de Lieu / Site</span>
                              </span>
                            )}
                            {v.statut && (
                              <span style={{
                                fontSize: 10.5,
                                fontWeight: 800,
                                padding: '2px 7px',
                                borderRadius: 6,
                                background: v.statut === 'urgent' ? '#fee2e2' : '#dcfce7',
                                color: v.statut === 'urgent' ? '#991b1b' : '#166534',
                              }}>
                                {v.statut === 'urgent' ? 'Mesures Urgentes' : 'Effectuée'}
                              </span>
                            )}
                          </div>
                          {v.patient_nom && (
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <IconUsers size={13} />
                              <span>Travailleur analysé : <strong>{v.patient_nom}</strong></span>
                            </div>
                          )}
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                            Réalisé le {dateFormatted} {v.heure ? `à ${v.heure.slice(0, 5)}` : ''}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => printRapportHse(v, entreprise)}
                            title="Imprimer ou exporter la fiche d'intervention HSE en PDF"
                            style={{
                              padding: '5px 12px',
                              fontSize: 12,
                              fontWeight: 700,
                              borderRadius: 8,
                            }}
                          >
                            Imprimer la fiche
                          </button>
                          {(isAdmin || isHSE) && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '4px 8px', color: 'var(--danger)', fontSize: 12 }}
                              onClick={() => setConfirmDelVisite(v.visite_id || v.id)}
                              title="Supprimer ce rapport"
                            >
                              <IconTrash size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Tag de risques recensés */}
                      {parsedRisques.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>Risques relevés :</span>
                          {parsedRisques.map((r, idx) => (
                            <span
                              key={idx}
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: '#fee2e2',
                                color: '#991b1b',
                                border: '1px solid #fecdd3',
                              }}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Constats & Observations */}
                      {v.commentaire && (
                        <div style={{ fontSize: 12.5, color: 'var(--text)', background: 'var(--surface2)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-2)', fontSize: 11, marginBottom: 2 }}>
                            Constats & Observations sur site :
                          </div>
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{v.commentaire}</div>
                        </div>
                      )}

                      {/* Recommandations et mesures */}
                      {v.recommandations && (
                        <div style={{ fontSize: 12.5, color: 'var(--text)', background: 'var(--surface2)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: 11.5, marginBottom: 2 }}>
                            Recommandations & Préconisations correctives :
                          </div>
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{v.recommandations}</div>
                        </div>
                      )}

                      {/* Saisi par */}
                      {v.created_by_nom && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span>Rédigé par :</span>
                          <strong style={{ color: 'var(--text)' }}>{v.created_by_nom}</strong>
                          <span style={{
                            fontSize: 9.5,
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: 'var(--surface2)',
                            color: 'var(--text)',
                          }}>
                            {v.created_by_role === 'hse' ? 'Responsable HSE' : (v.created_by_role || 'Intervenant')}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 1: HISTORIQUE DES VISITES & EFFECTIF EXAMINÉ */}
        {activeTab === 'visites' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>
                  Historique des Visites & Salariés Examinés
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  Suivi chronologique des passages médicaux, tournées Clino et effectif vu sur site
                </div>
              </div>
              {!isHSE && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowVisiteModal(true)}
                  style={{ fontWeight: 700, borderRadius: 8, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <IconPlus size={14} />
                  <span>Enregistrer une visite</span>
                </button>
              )}
            </div>

            {visitesMedicales.length === 0 ? (
              <div className="empty-state" style={{ padding: '36px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                  <IconStethoscope size={36} color="var(--text-3)" />
                </div>
                <p style={{ fontWeight: 800, fontSize: 15 }}>Aucune visite médicale enregistrée pour le moment</p>
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 16px', maxWidth: 460 }}>
                  Les visites programmées dans le Planning ou Clino Mobile apparaîtront ici.
                </p>
                {!isHSE && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setShowVisiteModal(true)}
                    style={{ fontWeight: 700 }}
                  >
                    Enregistrer le premier passage médical
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {visitesMedicales.map((v) => {
                  const isClino = v.type_visite?.toLowerCase().includes('clino') || v.source === 'clino';
                  const dateFormatted = v.date ? new Date(v.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                  const isExplicit = v.source === 'visite' && v.visite_id;

                  return (
                    <div
                      key={v.id}
                      style={{
                        background: 'var(--surface)',
                        borderRadius: 12,
                        padding: '14px 18px',
                        border: '1px solid var(--border)',
                        borderLeft: `4px solid ${isClino ? 'var(--primary)' : '#10b981'}`,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                            {dateFormatted}
                          </span>
                          {v.heure && (
                            <span className="badge badge-blue" style={{ fontSize: 11 }}>
                              {v.heure}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: isClino ? '#e0f2fe' : '#dcfce7',
                              color: isClino ? '#0369a1' : '#15803d',
                            }}
                          >
                            {v.type_visite || (isClino ? 'Clino Mobile' : 'Visite Médicale')}
                          </span>
                          <span className={`badge ${v.statut === 'effectuee' ? 'badge-green' : 'badge-amber'}`} style={{ fontSize: 11 }}>
                            {v.statut === 'effectuee' ? 'Effectuée' : 'Planifiée'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {/* Effectif badge highlight */}
                          <div
                            style={{
                              background: 'var(--surface2)',
                              color: 'var(--text)',
                              border: '1px solid var(--border)',
                              padding: '4px 10px',
                              borderRadius: 8,
                              fontWeight: 800,
                              fontSize: 12,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <span>
                              {v.nb_examines > 0
                                ? `${v.nb_examines} salarié${v.nb_examines > 1 ? 's' : ''} examiné${v.nb_examines > 1 ? 's' : ''}`
                                : 'Visite programmée'}
                            </span>
                          </div>
                          {isExplicit && (isAdmin || user?.role === 'medecin') && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '2px 6px', color: 'var(--danger)', fontSize: 12 }}
                              onClick={() => setConfirmDelVisite(v.visite_id)}
                              title="Supprimer cette visite"
                            >
                              <IconTrash size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Doctor and Technician row */}
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        {v.medecin_nom && v.medecin_nom !== '—' && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', background: 'rgba(2,132,199,0.08)', padding: '2px 8px', borderRadius: 6 }}>
                            {v.medecin_nom.startsWith('Dr.') ? v.medecin_nom : `Dr. ${v.medecin_nom}`}
                          </span>
                        )}
                        {v.technicien_nom && v.technicien_nom !== '—' && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', background: 'rgba(5,150,105,0.08)', padding: '2px 8px', borderRadius: 6 }}>
                            {v.technicien_nom}
                          </span>
                        )}
                        {v.nb_bilans > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0284c7' }}>
                            {v.nb_bilans} bilan{v.nb_bilans > 1 ? 's' : ''}
                          </span>
                        )}
                        {v.created_by_nom && (
                          <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                            <span>Saisi par :</span>
                            <strong style={{ color: 'var(--text-2)' }}>{v.created_by_nom}</strong>
                            {v.created_by_role && (
                              <span style={{
                                fontSize: 9.5,
                                fontWeight: 800,
                                padding: '1px 5px',
                                borderRadius: 4,
                                background: v.created_by_role === 'medecin' ? '#e0f2fe' : (v.created_by_role === 'technicien' ? '#dcfce7' : '#f1f5f9'),
                                color: v.created_by_role === 'medecin' ? '#0369a1' : (v.created_by_role === 'technicien' ? '#166534' : '#475569')
                              }}>
                                {v.created_by_role === 'medecin' ? 'Médecin' : (v.created_by_role === 'technicien' ? 'Technicien' : 'Admin')}
                              </span>
                            )}
                          </span>
                        )}
                      </div>

                      {v.commentaire && (
                        <div style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--surface2)', padding: '6px 10px', borderRadius: 6, fontStyle: 'italic' }}>
                          {v.commentaire}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AVIS & REMARQUES */}
        {activeTab === 'avis' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>
                <span>Avis & Remarques</span>
                <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 500, marginLeft: 8 }}>({avis.length})</span>
              </h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAvis('new')} style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconPlus size={14} />
                <span>Donner mon avis</span>
              </button>
            </div>

            {loading && <div className="loading-center"><div className="spinner" /></div>}
            {!loading && avis.length === 0 && (
              <div className="empty-state">
                <p style={{ fontWeight: 700 }}>Aucun avis pour l'instant.</p>
                <p style={{ fontSize: 13, marginTop: 4 }}>Soyez le premier à partager une note ou observation !</p>
              </div>
            )}

            {avis.map((a) => (
              <div
                key={a.id}
                style={{
                  background: 'var(--surface)',
                  borderRadius: 14,
                  padding: '16px 20px',
                  marginBottom: 12,
                  borderLeft: `4px solid ${TYPE_COLORS[a.type_avis] || '#888'}`,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: 'var(--primary-lt)',
                        color: 'var(--primary)',
                        fontSize: 12,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {(a.user_prenom?.[0] || '').toUpperCase()}{(a.user_nom?.[0] || '').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{a.user_prenom} {a.user_nom}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'capitalize' }}>{a.user_role}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '3px 9px',
                        borderRadius: 12,
                        background: (TYPE_COLORS[a.type_avis] || '#888') + '22',
                        color: TYPE_COLORS[a.type_avis] || '#888',
                        fontWeight: 700,
                      }}
                    >
                      {TYPE_LABELS[a.type_avis] || a.type_avis}
                    </span>
                    {(a.user_id === user?.id || isAdmin) && (
                      <>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }} onClick={() => setShowAvis(a)}>
                          <IconEdit size={13} />
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', color: 'var(--danger)' }} onClick={() => setConfirmDel(a.id)}>
                          <IconTrash size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {a.note > 0 && <div style={{ marginBottom: 6 }}><Stars value={a.note} size={14} /></div>}
                <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{a.commentaire}</p>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
                  {new Date(a.created_at).toLocaleString('fr-FR')}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: CAMPAGNES ANNUELLES */}
        {activeTab === 'campagnes' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>
                Historique des Campagnes Annuelles
              </h3>
            </div>

            {(!entreprise.campagnes || entreprise.campagnes.length === 0) ? (
              <div className="empty-state">
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                  <IconCalendar size={36} color="var(--text-3)" />
                </div>
                <p style={{ fontWeight: 700 }}>Aucune ancienne campagne archivée</p>
                <p style={{ fontSize: 13, marginTop: 4 }}>La campagne active actuelle est l'année {anneeCampagne}.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {entreprise.campagnes.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      background: 'var(--surface)',
                      borderRadius: 12,
                      padding: '14px 18px',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
                        Campagne Année {c.annee}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                        Clôturée le : {c.date_cloture ? new Date(c.date_cloture).toLocaleDateString('fr-FR') : '—'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        <strong>{c.nb_visites_faites}</strong> / {c.effectif_total} examinés
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: 8,
                          background: Number(c.taux_realisation) >= 100 ? '#dcfce7' : '#e0f2fe',
                          color: Number(c.taux_realisation) >= 100 ? '#166534' : '#0369a1',
                        }}
                      >
                        {c.taux_realisation}% réalisé
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nouvelle Visite Modal */}
      {showVisiteModal && (
        <NouvelleVisiteModal
          entreprise={entreprise}
          medecins={medecins}
          techniciens={techniciens}
          patients={patients}
          onSave={() => {
            loadVisites();
            loadPatients();
            onReload?.();
          }}
          onClose={() => setShowVisiteModal(false)}
          toast={toast}
        />
      )}

      {/* Rapport Visite de Poste ou de Lieu (HSE) Modal */}
      {showHseModal && (
        <RapportVisiteHseModal
          entreprise={entreprise}
          user={user}
          initialMode={typeof showHseModal === 'object' && showHseModal?.mode ? showHseModal.mode : (showHseModal?.patient ? 'poste' : 'lieu')}
          initialPatient={typeof showHseModal === 'object' && showHseModal?.patient ? showHseModal.patient : null}
          patientsList={patients}
          onSave={() => {
            loadVisites();
            onReload?.();
          }}
          onClose={() => setShowHseModal(null)}
          toast={toast}
        />
      )}

      {/* Avis modal */}
      {showAvis && (
        <AvisModal
          entreprise={entreprise}
          editAvis={showAvis === 'new' ? null : showAvis}
          onSave={() => {
            setShowAvis(null);
            loadAvis();
            toast?.('Avis publié', 'success');
          }}
          onClose={() => setShowAvis(null)}
        />
      )}

      {confirmDelVisite && (
        <ConfirmDialog
          title="Supprimer la visite ?"
          message="Cette action déduira l'effectif examiné associé. Action irréversible."
          danger
          onConfirm={() => handleDeleteVisite(confirmDelVisite)}
          onCancel={() => setConfirmDelVisite(null)}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Supprimer l'avis ?"
          message="Action irréversible."
          danger
          onConfirm={() => handleDeleteAvis(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      {/* Patient Modal (Ajout / Modification manuelle) */}
      {showPatientModal && (
        <PatientModal
          entrepriseId={entreprise.id}
          patient={showPatientModal.patient}
          medecins={medecins}
          onSave={() => {
            loadPatients();
            onReload?.();
          }}
          onClose={() => setShowPatientModal(null)}
          toast={toast}
        />
      )}

      {/* Patient Excel Import Modal */}
      {showExcelPatientModal && (
        <PatientExcelImportModal
          entreprise={entreprise}
          onSuccess={() => {
            loadPatients();
            onReload?.();
          }}
          onClose={() => setShowExcelPatientModal(false)}
          toast={toast}
        />
      )}

      {/* Patient Documents & Images Modal */}
      {showPatientDocsModal && (
        <PatientDocumentsModal
          entrepriseId={entreprise.id}
          patient={showPatientDocsModal}
          onClose={() => setShowPatientDocsModal(null)}
          onCountChanged={(newCount) => {
            setPatients((prev) =>
              prev.map((item) =>
                item.id === showPatientDocsModal.id ? { ...item, nb_documents: newCount } : item
              )
            );
          }}
          toast={toast}
        />
      )}

      {/* Confirmation suppression patient */}
      {confirmDelPatient && (
        <ConfirmDialog
          title="Supprimer le salarié / patient ?"
          message={`Êtes-vous sûr de vouloir supprimer "${confirmDelPatient.nom} ${confirmDelPatient.prenom}" ? Cette action mettra à jour l'effectif total de l'entreprise.`}
          danger
          onConfirm={() => handleDeletePatient(confirmDelPatient.id)}
          onCancel={() => setConfirmDelPatient(null)}
        />
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function Entreprises({ toast }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrateur';
  const isHSE = user?.role === 'hse';
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  const [entreprises, setEntreprises] = useState(() => {
    try {
      const cached = sessionStorage.getItem('gmt_cached_entreprises');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      const cached = sessionStorage.getItem('gmt_cached_entreprises');
      return !cached;
    } catch {
      return true;
    }
  });
  const [search, setSearch] = useState('');
  const [filterConv, setFilterConv] = useState('all');
  const [filterCampagne, setFilterCampagne] = useState('all');
  const [selected, setSelected] = useState(null);
  const [selectedTab, setSelectedTab] = useState('patients');
  const [modal, setModal] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [quickBilan, setQuickBilan] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'table' | 'map'
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(48);
  const [showRapportMedecin, setShowRapportMedecin] = useState(false);
  const [allPatients, setAllPatients] = useState([]);
  const [loadingAllPatients, setLoadingAllPatients] = useState(false);
  const [expandedEntreprises, setExpandedEntreprises] = useState({});
  const [patientModalConfig, setPatientModalConfig] = useState(null);
  const [patientImportModalConfig, setPatientImportModalConfig] = useState(null);
  const [patientDocsModalConfig, setPatientDocsModalConfig] = useState(null);
  const [initialHsePatient, setInitialHsePatient] = useState(null);
  const [medecinsList, setMedecinsList] = useState([]);

  async function loadAllPatients() {
    setLoadingAllPatients(true);
    try {
      const { data } = await axios.get('/api/entreprises/patients/all');
      setAllPatients(data || []);
    } catch {
      // ignore
    } finally {
      setLoadingAllPatients(false);
    }
  }

  async function load() {
    try {
      const { data } = await axios.get('/api/entreprises');
      setEntreprises(data);
      try {
        sessionStorage.setItem('gmt_cached_entreprises', JSON.stringify(data));
      } catch {}
      loadAllPatients();
    } catch {
      toast?.('Erreur chargement', 'error');
    } finally {
      setLoading(false);
    }
  }

  const { on: onMain } = useSocket() || {};

  useEffect(() => {
    load();
    axios.get('/api/users/by-role/medecin').then((r) => setMedecinsList(r?.data || [])).catch(() => {});
    const onOpenRapport = () => setShowRapportMedecin(true);
    window.addEventListener('open-rapport-medecin', onOpenRapport);
    return () => window.removeEventListener('open-rapport-medecin', onOpenRapport);
  }, []);

  useEffect(() => {
    if (!onMain) return;
    const off1 = onMain('entreprises_refresh', () => load());
    const off2 = onMain('patients_refresh', () => loadAllPatients());
    return () => { off1?.(); off2?.(); };
  }, [onMain]);

  const patientsByEntreprise = useMemo(() => {
    const map = {};
    for (const p of allPatients) {
      if (!map[p.entreprise_id]) map[p.entreprise_id] = [];
      map[p.entreprise_id].push(p);
    }
    return map;
  }, [allPatients]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, filterConv, filterCampagne, dateFilter]);

  async function handleDelete(id) {
    try {
      await axios.delete(`/api/entreprises/${id}`);
      setConfirm(null);
      setSelected(null);
      load();
      toast?.('Entreprise supprimée', 'success');
    } catch {
      toast?.('Erreur suppression', 'error');
    }
  }

  const filtered = useMemo(() => {
    return entreprises.filter((e) => {
      const q = search.toLowerCase();
      const matchSearch = !q || `${e.nom} ${e.code || ''} ${e.secteur || ''} ${e.adresse || ''}`.toLowerCase().includes(q);
      const matchConv = filterConv === 'all' || (filterConv === 'conv' ? e.convensionne : !e.convensionne);
      
      const eff = parseInt(e.effectif_total, 10) || 0;
      const vf = parseInt(e.nb_visites_faites, 10) || 0;
      const annee = e.annee_campagne || currentYear;
      const isNouvelleAnnee = parseInt(annee, 10) < currentYear;

      let matchCampagne = true;
      if (filterCampagne === 'a_planifier') {
        matchCampagne = eff > 0 && vf === 0;
      } else if (filterCampagne === 'en_cours') {
        matchCampagne = vf > 0 && vf < eff;
      } else if (filterCampagne === 'termine') {
        matchCampagne = eff > 0 && vf >= eff;
      } else if (filterCampagne === 'nouvelle_annee') {
        matchCampagne = isNouvelleAnnee;
      }

      let matchDate = true;
      if (dateFilter) {
        const itemDate = e.created_at ? String(e.created_at).slice(0, 10) : '';
        const dDebut = e.date_debut_convention ? String(e.date_debut_convention).slice(0, 10) : '';
        const dFin = e.date_fin_convention ? String(e.date_fin_convention).slice(0, 10) : '';
        if (itemDate !== dateFilter && dDebut !== dateFilter && dFin !== dateFilter) {
          matchDate = false;
        }
      }
      return matchSearch && matchConv && matchCampagne && matchDate;
    });
  }, [entreprises, search, filterConv, filterCampagne, dateFilter, currentYear]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const displayedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  // ── Statistiques et Calculs Globaux ──────────────────────────
  const totalEffectif = entreprises.reduce((s, e) => s + (parseInt(e.effectif_total) || 0), 0);
  const totalVisitesFaites = entreprises.reduce((s, e) => s + (parseInt(e.nb_visites_faites) || 0), 0);
  const totalVisitesAFaire = entreprises.reduce(
    (s, e) => s + Math.max(0, (parseInt(e.effectif_total) || 0) - (parseInt(e.nb_visites_faites) || 0)),
    0
  );
  const totalBilansFaits = entreprises.reduce((s, e) => s + (parseInt(e.nb_bilans_faits) || 0), 0);
  const totalBilansManquants = entreprises.reduce((s, e) => s + (parseInt(e.nb_bilans_manquants) || 0), 0);
  const globalTaux = totalEffectif > 0 ? Math.min(100, Math.round((totalVisitesFaites / totalEffectif) * 100)) : 0;
  const nbEntreprisesNouvelleAnnee = entreprises.filter(
    (e) => (parseInt(e.annee_campagne, 10) || currentYear) < currentYear
  ).length;

  const stats = {
    total: entreprises.length,
    conv: entreprises.filter((e) => e.convensionne).length,
    avis: entreprises.reduce((s, e) => s + (parseInt(e.nb_avis) || 0), 0),
  };

  // ── Exports Multi-Formats (Excel / Word / PDF) ───────────────
  const exportData = filtered.map((e) => {
    const eff = parseInt(e.effectif_total, 10) || 0;
    const vf = parseInt(e.nb_visites_faites, 10) || 0;
    const vaf = Math.max(0, eff - vf);
    const tx = eff > 0 ? `${Math.round((vf / eff) * 100)}%` : '0%';
    const row = {
      nom: e.nom || '—',
      secteur: e.secteur || '—',
      campagne: e.annee_campagne || currentYear,
      conv: e.convensionne ? 'Oui' : 'Non',
      date_debut_convention: e.date_debut_convention ? formatConventionDate(e.date_debut_convention) : '—',
      date_fin_convention: e.date_fin_convention ? formatConventionDate(e.date_fin_convention) : '—',
      renouvelable: e.convensionne ? (e.renouvelable ? 'Oui (Renouvelable)' : 'Non') : '—',
      effectif_total: eff,
      visites_faites: vf,
      visites_a_faire: vaf,
      taux_couverture: tx,
      nb_bilans_faits: e.nb_bilans_faits || 0,
      nb_bilans_manquants: e.nb_bilans_manquants || 0,
      telephone: e.telephone || '—',
      email: e.email || '—',
    };
    if (isAdmin) {
      row.code = e.code || '—';
    }
    return row;
  });

  const exportColumns = [
    ...(isAdmin ? [{ header: 'Code Entreprise', key: 'code' }] : []),
    { header: 'Entreprise', key: 'nom' },
    { header: 'Secteur', key: 'secteur' },
    { header: 'Campagne', key: 'campagne' },
    { header: 'Conv.', key: 'conv' },
    { header: 'Début Conv.', key: 'date_debut_convention' },
    { header: 'Fin Conv.', key: 'date_fin_convention' },
    { header: 'Renouvelable', key: 'renouvelable' },
    { header: 'Effectif', key: 'effectif_total' },
    { header: 'Visites Faites', key: 'visites_faites' },
    { header: 'En Attente', key: 'visites_a_faire' },
    { header: 'Taux', key: 'taux_couverture' },
    { header: 'Téléphone', key: 'telephone' },
    { header: 'Email', key: 'email' },
  ];

  function handleExportExcel() {
    import('../utils/exportUtils').then(({ exportToExcel }) => {
      exportToExcel(exportData, exportColumns, 'Suivi_Entreprises_GMT_Ariana');
      toast?.('Export Excel (.xlsx) téléchargé avec succès !', 'success');
    });
  }

  function handleExportWord() {
    import('../utils/exportUtils').then(({ exportToWord }) => {
      exportToWord(exportData, exportColumns, 'Suivi des Entreprises & Effectifs - GMT Ariana');
      toast?.('Export Word (.doc) téléchargé avec succès !', 'success');
    });
  }

  function handleExportPDF() {
    import('../utils/exportUtils').then(({ exportToPDF }) => {
      exportToPDF(exportData, exportColumns, 'Suivi des Entreprises & Effectifs GMT Ariana');
      toast?.('Export PDF (.pdf) téléchargé avec succès !', 'success');
    });
  }

  if (selected) {
    const ent = entreprises.find((e) => e.id === selected);
    if (!ent) {
      setSelected(null);
      return null;
    }
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <EntrepriseDetail
          entreprise={ent}
          toast={toast}
          initialHsePatient={initialHsePatient}
          initialTab={selectedTab}
          onClose={() => {
            setSelected(null);
            setSelectedTab('patients');
            setInitialHsePatient(null);
          }}
          onPlanifier={() =>
            navigate('/planning', {
              state: { prefillEntreprise: ent.nom, prefillAdresse: ent.adresse },
            })
          }
          onReload={load}
          onEdit={() => {
            setModal(ent);
            setSelected(null);
          }}
          onQuickBilan={isHSE ? undefined : () => {
            setQuickBilan(ent);
          }}
          onDelete={() => setConfirm(ent.id)}
        />
        {confirm && (
          <ConfirmDialog
            title="Supprimer l'entreprise?"
            message="Tous les avis seront supprimés."
            danger
            onConfirm={() => handleDelete(confirm)}
            onCancel={() => setConfirm(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="page-content" style={{ maxWidth: 1400, margin: '0 auto', width: '100%' }}>
      {/* ── BANNIÈRE EXECUTIVE HEADER ── */}
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          padding: '16px 20px',
          border: '1px solid var(--border)',
          borderTop: '4px solid #0284c7',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          width: '100%',
        }}
      >
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
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
              Santé au Travail & Prévention
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>• Campagnes Annuelles {currentYear}</span>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5, margin: 0, wordBreak: 'break-word' }}>
            Entreprises Conventionnées & Suivi des Effectifs
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, margin: 0 }}>
            Calcul automatique des effectifs examinés vs en attente, cycles annuels et planification directe.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Bouton Rapport Activité Médecins (Masqué pour le rôle HSE) */}
          {!isHSE && (isAdmin || user?.role === 'medecin') && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowRapportMedecin(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 700,
                padding: '8px 14px',
                borderRadius: 10,
              }}
              title="Consulter et exporter l'historique de travail et effectifs vus par médecin"
            >
              <IconStethoscope size={15} />
              <span>Rapport Médecins</span>
            </button>
          )}

          {/* Menu d'exportation unifié */}
          <ExportDropdown
            label="Exporter"
            onPDF={handleExportPDF}
            onExcel={handleExportExcel}
            onWord={handleExportWord}
          />

          {isAdmin && (
            <>
              <button
                className="btn btn-outline"
                onClick={() => setShowImportModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 700,
                  padding: '8px 14px',
                  borderRadius: 10,
                }}
                title="Importer des entreprises depuis Excel (.xlsx / .csv)"
              >
                <IconUpload size={15} />
                <span>Importer Excel</span>
              </button>

              <button
                className="btn btn-primary"
                onClick={() => setModal({})}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '8px 16px', borderRadius: 10 }}
              >
                <IconPlus size={15} />
                <span>Nouvelle entreprise</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 8 KPI STATS CARDS GRID ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
          gap: 12,
          marginBottom: 16,
          width: '100%',
        }}
      >
        {/* Card 1: Total Entreprises */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Entreprises</span>
            <IconBuilding size={16} color="var(--text-3)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)' }}>{stats.total}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Total</span>
          </div>
        </div>

        {/* Card 2: Conventionnées */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Conventionnées</span>
            <IconDocument size={16} color="#16a34a" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#16a34a' }}>{stats.conv}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Actives</span>
          </div>
        </div>

        {/* Card 3: Effectif Total */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Effectif Total</span>
            <IconUsers size={16} color="var(--primary)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--primary)' }}>{totalEffectif}</span>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Salariés</span>
          </div>
        </div>

        {/* Card 4: Visites Faites */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Déjà Vus ({currentYear})</span>
            <IconStethoscope size={16} color="#16a34a" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#16a34a' }}>{totalVisitesFaites}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '1px 6px', borderRadius: 6 }}>
              {globalTaux}%
            </span>
          </div>
        </div>

        {/* Card 5: Visites à Faire */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#ea580c', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>En Attente</span>
            <IconClock size={16} color="#ea580c" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#ea580c' }}>{totalVisitesAFaire}</span>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Restants</span>
          </div>
        </div>

        {/* Card 6: Bilans Faits */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bilans Faits</span>
            <IconFlask size={16} color="var(--primary)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--primary)' }}>{totalBilansFaits}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Bilans</span>
          </div>
        </div>

        {/* Card 7: Bilans Manquants */}
        <div style={{ background: totalBilansManquants > 0 ? '#fef2f2' : 'var(--surface)', border: totalBilansManquants > 0 ? '1px solid #fecaca' : '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: totalBilansManquants > 0 ? '#dc2626' : 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bilans Manquants</span>
            <IconAlert size={16} color={totalBilansManquants > 0 ? '#dc2626' : 'var(--text-3)'} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: totalBilansManquants > 0 ? '#dc2626' : '#16a34a' }}>
              {totalBilansManquants}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>À compléter</span>
          </div>
        </div>

        {/* Card 8: Alertes Nouvelle Année */}
        <div style={{ background: nbEntreprisesNouvelleAnnee > 0 ? '#fffbeb' : 'var(--surface)', border: nbEntreprisesNouvelleAnnee > 0 ? '1px solid #fde68a' : '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: nbEntreprisesNouvelleAnnee > 0 ? '#b45309' : 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>À Réinitialiser</span>
            <IconBell size={16} color={nbEntreprisesNouvelleAnnee > 0 ? '#b45309' : 'var(--text-3)'} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: nbEntreprisesNouvelleAnnee > 0 ? '#b45309' : '#16a34a' }}>
              {nbEntreprisesNouvelleAnnee}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Campagne passée</span>
          </div>
        </div>
      </div>

      {/* ── BARRE DE CONTRÔLE : RECHERCHE, FILTRES & MODES DE VUE ── */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
          background: 'var(--surface)',
          padding: '12px 14px',
          borderRadius: 14,
          border: '1px solid var(--border)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          width: '100%',
        }}
      >
        <div style={{ flex: '1 1 200px', minWidth: 0, position: 'relative' }}>
          <input
            className="input"
            style={{ width: '100%', paddingLeft: 14, height: 40, fontSize: 13, borderRadius: 10 }}
            placeholder="Rechercher par société, secteur, ville..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 12,
                top: 11,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-3)',
                fontSize: 14,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtre Campagne Annuelle */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 10, padding: 4, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {[
            ['all', 'Toutes'],
            ['a_planifier', 'À planifier (0%)'],
            ['en_cours', 'En cours'],
            ['termine', 'Terminées (100%)'],
            ['nouvelle_annee', 'Nouvelle Année'],
          ].map(([v, l]) => (
            <button
              key={v}
              className={`btn btn-sm ${filterCampagne === v ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterCampagne(v)}
              style={{ padding: '6px 10px', fontSize: 11.5, whiteSpace: 'nowrap', fontWeight: filterCampagne === v ? 800 : 600, borderRadius: 8 }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Filtre Convention */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 10, padding: 4, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {[
            ['all', 'Tous types'],
            ['conv', 'Conventionnées'],
            ['nonconv', 'Non conv.'],
          ].map(([v, l]) => (
            <button
              key={v}
              className={`btn btn-sm ${filterConv === v ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterConv(v)}
              style={{ padding: '6px 10px', fontSize: 11.5, whiteSpace: 'nowrap', fontWeight: filterConv === v ? 800 : 600, borderRadius: 8 }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Sélecteur de Vue */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 10, padding: 4, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {[
            ['list', '🏢 Entreprises'],
            ['detailed', '👥 Salariés'],
            ['table', '📊 Tableau & Suivi'],
            ['map', '🗺️ Carte'],
          ].map(([v, l]) => (
            <button
              key={v}
              className={`btn btn-sm ${viewMode === v ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setViewMode(v);
                if (v === 'detailed' && allPatients.length === 0) {
                  loadAllPatients();
                }
              }}
              style={{
                padding: '6px 13px',
                fontSize: 12,
                whiteSpace: 'nowrap',
                fontWeight: viewMode === v ? 800 : 600,
                borderRadius: 8,
                ...(v === 'detailed' && viewMode !== 'detailed' ? { color: 'var(--primary)', fontWeight: 700 } : {})
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENU PRINCIPAL ── */}
      {loading ? (
        <div className="loading-center" style={{ minHeight: 300 }}>
          <div className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ background: 'var(--surface)', borderRadius: 16, padding: '50px 20px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <IconBuilding size={40} color="var(--text-3)" />
          </div>
          <h4 style={{ fontWeight: 800, marginTop: 4, fontSize: 16 }}>Aucune entreprise trouvée</h4>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
            Modifiez votre recherche ou ajoutez une nouvelle entreprise.
          </p>
        </div>
      ) : viewMode === 'map' ? (
        <MapView entreprises={filtered} />
      ) : viewMode === 'table' ? (
        /* ── TABLEAU SUIVI & CALCULATEUR COMPLET ── */
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
            width: '100%',
          }}
        >
          <div className="table-scrollable-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)', color: 'var(--text)' }}>
                  <th style={{ padding: '14px 18px', fontWeight: 800 }}>Société / Campagne</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'center' }}>Effectif Total</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'center' }}>Déjà fait sa visite</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'center' }}>En attente (Reste)</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, minWidth: 160 }}>Progression Visites</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'center' }}>Bilans Faits</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'center' }}>Manquants</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedItems.map((e) => {
                  const eff = parseInt(e.effectif_total, 10) || 0;
                  const vf = parseInt(e.nb_visites_faites, 10) || 0;
                  const aFaire = Math.max(0, eff - vf);
                  const tx = eff > 0 ? Math.min(100, Math.round((vf / eff) * 100)) : 0;
                  const bf = parseInt(e.nb_bilans_faits, 10) || 0;
                  const bm = parseInt(e.nb_bilans_manquants, 10) || 0;
                  const annee = e.annee_campagne || currentYear;
                  const isNouvelleAnnee = parseInt(annee, 10) < currentYear;

                  return (
                    <tr
                      key={e.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(el) => (el.currentTarget.style.background = 'var(--surface2)')}
                      onMouseLeave={(el) => (el.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: 14 }}>{e.nom}</span>
                          {isAdmin && e.code && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: 'var(--surface2)',
                                color: 'var(--text)',
                                border: '1px solid var(--border)',
                              }}
                              title="Code Entreprise (Admin)"
                            >
                              Code : {e.code}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: isNouvelleAnnee ? '#fee2e2' : '#e0f2fe',
                              color: isNouvelleAnnee ? '#991b1b' : '#0369a1',
                            }}
                          >
                            Campagne {annee}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                          <span>{e.secteur || 'Général'}</span>
                          <span>•</span>
                          <span
                            style={{
                              color: e.convensionne ? '#166534' : '#991b1b',
                              background: e.convensionne ? '#dcfce7' : '#fee2e2',
                              padding: '1px 6px',
                              borderRadius: 4,
                              fontWeight: 700,
                              fontSize: 10,
                            }}
                          >
                            {e.convensionne ? 'Conventionnée' : 'Non conv.'}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '14px 18px', textAlign: 'center', fontWeight: 900, fontSize: 15 }}>
                        <span style={{ background: 'var(--surface2)', color: 'var(--text)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>{eff}</span>
                      </td>

                      <td style={{ padding: '14px 18px', textAlign: 'center', fontWeight: 900, color: '#16a34a', fontSize: 15 }}>
                        <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: 8 }}>{vf}</span>
                      </td>

                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '4px 12px',
                            borderRadius: 12,
                            fontWeight: 800,
                            fontSize: 12,
                            background: aFaire === 0 && eff > 0 ? '#dcfce7' : aFaire > 0 ? '#ffedd5' : 'var(--surface2)',
                            color: aFaire === 0 && eff > 0 ? '#166534' : aFaire > 0 ? '#c2410c' : 'var(--text-3)',
                            display: 'inline-block',
                          }}
                        >
                          {aFaire} restant(s)
                        </span>
                      </td>

                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${tx}%`,
                              height: '100%',
                              background: tx >= 100 ? '#22c55e' : tx >= 50 ? '#0ea5e9' : '#f59e0b',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </td>

                      <td style={{ padding: '14px 18px', textAlign: 'center', fontWeight: 800, color: 'var(--primary)', fontSize: 14 }}>{bf}</td>

                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        {bm > 0 ? (
                          <span style={{ padding: '3px 8px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontWeight: 800, fontSize: 12 }}>{bm}</span>
                        ) : (
                          <span style={{ color: '#16a34a', fontSize: 12, fontWeight: 700 }}>✓ 0</span>
                        )}
                      </td>

                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {isAdmin && (
                            <button
                              className="btn btn-sm"
                              onClick={() =>
                                navigate('/planning', {
                                  state: { prefillEntreprise: e.nom, prefillAdresse: e.adresse },
                                })
                              }
                              title="Planifier une visite médicale"
                              style={{
                                padding: '4px 10px',
                                fontSize: 11.5,
                                fontWeight: 700,
                                background: 'var(--surface2)',
                                color: 'var(--text)',
                                border: '1px solid var(--border)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <IconCalendar size={13} />
                              <span>Planifier</span>
                            </button>
                          )}
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setSelected(e.id)}
                            style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <IconEye size={13} />
                            <span>Fiche Entreprise</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'detailed' ? (
        /* ── VUE UNIFIÉE : ENTREPRISES AVEC LEUR LISTE DE SALARIÉS ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {displayedItems.map((e) => {
            const entPatients = patientsByEntreprise[e.id] || [];
            const isExpanded = expandedEntreprises[e.id] !== false;
            const eff = parseInt(e.effectif_total, 10) || entPatients.length;
            const vf = parseInt(e.nb_visites_faites, 10) || 0;
            const aFaire = Math.max(0, eff - vf);
            const annee = e.annee_campagne || currentYear;

            return (
              <div
                key={e.id}
                style={{
                  background: 'var(--surface)',
                  borderRadius: 16,
                  border: '1px solid var(--border)',
                  overflow: 'hidden',
                  boxShadow: '0 3px 12px rgba(0,0,0,0.03)',
                }}
              >
                {/* Enterprise Card Header */}
                <div
                  style={{
                    padding: '14px 20px',
                    background: 'var(--surface2)',
                    borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setExpandedEntreprises((prev) => ({ ...prev, [e.id]: !isExpanded }))}
                      style={{ padding: '2px 6px', fontSize: 13 }}
                      title={isExpanded ? 'Réduire la liste des salariés' : 'Déplier la liste des salariés'}
                    >
                      {isExpanded ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                      )}
                    </button>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span
                          style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)', cursor: 'pointer' }}
                          onClick={() => setSelected(e.id)}
                          title="Ouvrir la fiche complète de l'entreprise"
                        >
                          {e.nom}
                        </span>
                        {isAdmin && e.code && (
                          <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                            Code : {e.code}
                          </span>
                        )}
                        <span className={`badge ${e.convensionne ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10.5 }}>
                          {e.convensionne ? 'Conv.' : 'Non'}
                        </span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#e0f2fe', color: '#0369a1' }}>
                          Campagne {annee}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span>{e.secteur || 'Général'}</span>
                        {e.adresse && <span>• {e.adresse}</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', padding: '4px 10px', borderRadius: 8 }}>
                      {entPatients.length} salarié(s) au registre
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: 8 }}>
                      {vf} examiné(s)
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, background: '#ffedd5', color: '#c2410c', padding: '4px 10px', borderRadius: 8 }}>
                      {aFaire} en attente
                    </span>
                    {isHSE ? (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          setInitialHsePatient(null);
                          setSelected(e.id);
                        }}
                        style={{ fontWeight: 700, fontSize: 11.5, borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
                        title="Rédiger un rapport de visite ou étude HSE pour cette entreprise"
                      >
                        <IconShield size={13} />
                        <span>Rapport HSE</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setPatientModalConfig({ entrepriseId: e.id, patient: null })}
                        style={{ fontWeight: 700, fontSize: 11.5, borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
                        title="Ajouter un salarié pour cette entreprise"
                      >
                        <IconPlus size={13} />
                        <span>Salarié</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setSelected(e.id)}
                      style={{ fontWeight: 700, fontSize: 11.5, borderRadius: 8, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      <IconEye size={13} />
                      <span>Fiche Entreprise</span>
                    </button>
                  </div>
                </div>

                {/* Table of Employees */}
                {isExpanded && (
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    {entPatients.length === 0 ? (
                      <div style={{ padding: '20px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>
                        Aucun salarié enregistré pour {e.nom}. Utilisez <strong>Ajouter Salarié</strong> ou <strong>Importer Excel</strong> pour charger l'effectif.
                      </div>
                    ) : (
                      <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                          <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '8px 14px', textAlign: 'left' }}>Dossier / Code</th>
                            <th style={{ padding: '8px 14px', textAlign: 'left' }}>Salarié</th>
                            <th style={{ padding: '8px 14px', textAlign: 'left' }}>CIN</th>
                            <th style={{ padding: '8px 14px', textAlign: 'left' }}>Poste & Service</th>
                            <th style={{ padding: '8px 14px', textAlign: 'left' }}>Examens</th>
                            <th style={{ padding: '8px 14px', textAlign: 'left' }}>Type de Visite</th>
                            <th style={{ padding: '8px 14px', textAlign: 'left' }}>Résultat Aptitude</th>
                            <th style={{ padding: '8px 14px', textAlign: 'left' }}>Dernière Visite</th>
                            <th style={{ padding: '8px 14px', textAlign: 'center' }}>Docs</th>
                            <th style={{ padding: '8px 14px', textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entPatients.map((p) => {
                            const resBadge = RESULTATS_APTITUDE.find((r) => r.value === p.resultat_visite) || RESULTATS_APTITUDE[0];
                            return (
                              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 5,
                                      padding: '2px 7px',
                                      borderRadius: 6,
                                      background: '#eff6ff',
                                      border: '1px solid #bfdbfe',
                                      fontSize: 11.5,
                                      fontWeight: 800,
                                      color: '#1d4ed8',
                                      fontFamily: 'monospace',
                                    }}
                                  >
                                    <span>{p.matricule || `DOS-${String(p.id).padStart(4, '0')}`}</span>
                                  </span>
                                </td>
                                <td style={{ padding: '8px 14px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div style={{ fontWeight: 800, color: 'var(--text)' }}>
                                      {p.nom} {p.prenom}
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                    {p.genre === 'F' ? 'Femme' : 'Homme'} {p.telephone ? `· Tél : ${p.telephone}` : ''}
                                  </div>
                                  {p.created_by_nom && (
                                    <div style={{ fontSize: 10, marginTop: 1, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                      <span style={{ color: 'var(--text-3)' }}>Par :</span>
                                      <strong style={{ color: p.created_by_role === 'medecin' ? '#0284c7' : (p.created_by_role === 'technicien' ? '#059669' : 'var(--text)') }}>
                                        {p.created_by_role === 'medecin' && !p.created_by_nom.startsWith('Dr.') ? `Dr. ${p.created_by_nom}` : p.created_by_nom}
                                      </strong>
                                      <span style={{
                                        fontSize: 9,
                                        fontWeight: 800,
                                        padding: '0 4px',
                                        borderRadius: 3,
                                        background: p.created_by_role === 'medecin' ? '#e0f2fe' : (p.created_by_role === 'technicien' ? '#dcfce7' : '#f1f5f9'),
                                        color: p.created_by_role === 'medecin' ? '#0369a1' : (p.created_by_role === 'technicien' ? '#166534' : '#475569')
                                      }}>
                                        {p.created_by_role === 'medecin' ? 'Médecin' : (p.created_by_role === 'technicien' ? 'Tech' : 'Admin')}
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                                  <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{p.cin || '—'}</span>
                                </td>
                                <td style={{ padding: '8px 14px' }}>
                                  <div style={{ fontWeight: 600 }}>{p.poste || '—'}</div>
                                  {p.departement && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.departement}</div>}
                                </td>
                                <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        padding: '1px 5px',
                                        borderRadius: 4,
                                        background: p.has_visio ? '#e0f2fe' : 'var(--surface2)',
                                        color: p.has_visio ? '#0369a1' : 'var(--text-3)',
                                        border: p.has_visio ? '1px solid #bae6fd' : '1px solid var(--border)',
                                        fontWeight: p.has_visio ? 800 : 500,
                                        opacity: p.has_visio ? 1 : 0.6,
                                      }}
                                      title={p.has_visio ? 'Visio réalisé' : 'Visio non fait'}
                                    >
                                      Visio {p.has_visio ? '✓' : ''}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        padding: '1px 5px',
                                        borderRadius: 4,
                                        background: p.has_audio ? '#ccfbf1' : 'var(--surface2)',
                                        color: p.has_audio ? '#0f766e' : 'var(--text-3)',
                                        border: p.has_audio ? '1px solid #99f6e4' : '1px solid var(--border)',
                                        fontWeight: p.has_audio ? 800 : 500,
                                        opacity: p.has_audio ? 1 : 0.6,
                                      }}
                                      title={p.has_audio ? 'Audio réalisé' : 'Audio non fait'}
                                    >
                                      Audio {p.has_audio ? '✓' : ''}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        padding: '1px 5px',
                                        borderRadius: 4,
                                        background: p.has_ecg ? '#ffe4e6' : 'var(--surface2)',
                                        color: p.has_ecg ? '#be123c' : 'var(--text-3)',
                                        border: p.has_ecg ? '1px solid #fecdd3' : '1px solid var(--border)',
                                        fontWeight: p.has_ecg ? 800 : 500,
                                        opacity: p.has_ecg ? 1 : 0.6,
                                      }}
                                      title={p.has_ecg ? 'ECG réalisé' : 'ECG non fait'}
                                    >
                                      ECG {p.has_ecg ? '✓' : ''}
                                    </span>
                                  </div>
                                </td>
                                <td style={{ padding: '8px 14px' }}>
                                  <span style={{ fontSize: 11, background: 'var(--surface2)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 6, fontWeight: 600 }}>
                                    {p.type_visite || 'Visite Périodique'}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 14px' }}>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 800,
                                      padding: '2px 8px',
                                      borderRadius: 10,
                                      background: resBadge.bg,
                                      color: resBadge.color,
                                      display: 'inline-block',
                                    }}
                                  >
                                    {resBadge.label}
                                  </span>
                                  {(p.resultat_visite === 'apte_temporaire' || p.resultat_visite === 'inapte_temporaire') && (
                                    <div style={{ fontSize: 11, fontWeight: 800, color: '#0369a1', marginTop: 2 }}>
                                      {p.duree_temporaire || '3 mois à revoir'}
                                      {p.date_revoir && <span style={{ fontWeight: 600, color: 'var(--text-2)' }}> · Revoir le {String(p.date_revoir).slice(0, 10)}</span>}
                                    </div>
                                  )}
                                  {p.bilan_en_attente && (
                                    <div style={{ fontSize: 11, fontWeight: 800, color: '#a21caf', marginTop: 2 }}>
                                      Bilan en attente : {p.type_bilan || 'Examens complémentaires'}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '8px 14px' }}>
                                  <div>{p.date_derniere_visite ? String(p.date_derniere_visite).slice(0, 10) : <span style={{ color: 'var(--text-3)' }}>—</span>}</div>
                                  {p.medecin_nom && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.medecin_nom}</div>}
                                </td>
                                <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    style={{
                                      padding: '3px 8px',
                                      fontSize: 11,
                                      fontWeight: 700,
                                      borderRadius: 6,
                                      borderColor: (p.nb_documents || 0) > 0 ? '#3b82f6' : 'var(--border)',
                                      color: (p.nb_documents || 0) > 0 ? '#1d4ed8' : 'var(--text-2)',
                                      background: (p.nb_documents || 0) > 0 ? '#eff6ff' : 'transparent',
                                    }}
                                    title="Gérer les documents et images"
                                    onClick={() => setPatientDocsModalConfig({ entrepriseId: e.id, patient: p })}
                                  >
                                    Docs ({p.nb_documents || 0})
                                  </button>
                                </td>
                                <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', gap: 4 }}>
                                    {isHSE && (
                                      <button
                                        type="button"
                                        className="btn btn-sm"
                                        style={{
                                          padding: '3px 8px',
                                          fontSize: 11,
                                          fontWeight: 700,
                                          background: 'var(--surface2)',
                                          color: 'var(--text)',
                                          border: '1px solid var(--border)',
                                          borderRadius: 6,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          whiteSpace: 'nowrap',
                                        }}
                                        title={`Rédiger une étude de poste pour ${p.nom} ${p.prenom}`}
                                        onClick={() => {
                                          setInitialHsePatient(p);
                                          setSelected(e.id);
                                        }}
                                      >
                                        <IconShield size={13} />
                                        <span>Étude de poste</span>
                                      </button>
                                    )}
                                    {!isHSE && (
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        style={{ padding: '3px 7px', fontSize: 11.5 }}
                                        title="Modifier ce salarié"
                                        onClick={() => setPatientModalConfig({ entrepriseId: e.id, patient: p })}
                                      >
                                        <IconEdit size={13} />
                                      </button>
                                    )}
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        style={{ padding: '3px 7px', fontSize: 11.5, color: 'var(--danger)' }}
                                        title="Supprimer ce salarié"
                                        onClick={async () => {
                                          if (window.confirm(`Supprimer le salarié "${p.nom} ${p.prenom}" ?`)) {
                                            try {
                                              await axios.delete(`/api/entreprises/${e.id}/patients/${p.id}`);
                                              loadAllPatients();
                                              load();
                                              toast?.('Salarié supprimé', 'success');
                                            } catch {
                                              toast?.('Erreur suppression', 'error');
                                            }
                                          }
                                        }}
                                      >
                                        <IconTrash size={13} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── VUE CARTES GRID PROFESSIONNELLE ── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 350px), 1fr))', gap: 16 }}>
          {displayedItems.map((e) => {
            const eff = parseInt(e.effectif_total, 10) || 0;
            const vf = parseInt(e.nb_visites_faites, 10) || 0;
            const aFaire = Math.max(0, eff - vf);
            const tx = eff > 0 ? Math.min(100, Math.round((vf / eff) * 100)) : 0;
            const annee = e.annee_campagne || currentYear;
            const isNouvelleAnnee = parseInt(annee, 10) < currentYear;

            return (
              <div
                key={e.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  transition: 'box-shadow .2s ease, transform .15s ease',
                  borderTop: `4px solid ${isNouvelleAnnee ? '#f59e0b' : e.convensionne ? '#10b981' : '#ef4444'}`,
                  borderRadius: 16,
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                }}
                onClick={() => setSelected(e.id)}
                onMouseEnter={(el) => {
                  el.currentTarget.style.boxShadow = '0 10px 28px rgba(0,0,0,0.08)';
                  el.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(el) => {
                  el.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.03)';
                  el.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                        <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>{e.nom}</div>
                        {isAdmin && e.code && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: 'var(--surface2)',
                              color: 'var(--text)',
                              border: '1px solid var(--border)',
                            }}
                            title="Code Entreprise (Admin)"
                          >
                            Code : {e.code}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {e.secteur && <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{e.secteur}</span>}
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: isNouvelleAnnee ? '#fee2e2' : '#e0f2fe',
                            color: isNouvelleAnnee ? '#991b1b' : '#0369a1',
                          }}
                        >
                          Campagne {annee}
                        </span>
                      </div>
                    </div>
                    <span className={`badge ${e.convensionne ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10, flexShrink: 0 }}>
                      {e.convensionne ? 'Conv.' : 'Non'}
                    </span>
                  </div>

                  {/* ── Widget Indicateurs ── */}
                  <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 12, margin: '12px 0', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, textAlign: 'center', marginBottom: 10 }}>
                      <div
                        style={{ background: 'var(--surface)', padding: '6px 4px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }}
                        onClick={(evt) => {
                          evt.stopPropagation();
                          setSelectedTab('patients');
                          setSelected(e.id);
                        }}
                        title="Voir la liste des salariés de cette entreprise"
                      >
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                          <IconUsers size={11} /> Effectif
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--primary)', marginTop: 1 }}>{eff}</div>
                      </div>
                      <div style={{ background: 'var(--surface)', padding: '6px 4px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>Fait</div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: '#16a34a', marginTop: 1 }}>{vf}</div>
                      </div>
                      <div style={{ background: 'var(--surface)', padding: '6px 4px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: aFaire > 0 ? '#ea580c' : '#16a34a', fontWeight: 700 }}>Reste</div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: aFaire > 0 ? '#ea580c' : '#16a34a', marginTop: 1 }}>{aFaire}</div>
                      </div>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${tx}%`, height: '100%', background: tx >= 100 ? '#22c55e' : '#0ea5e9' }} />
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: '1px solid var(--border)',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{e.nb_avis || 0} avis</span>
                    {e.note_moyenne > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11.5 }}>
                        <Stars value={Math.round(e.note_moyenne)} size={11} />
                        <span style={{ color: 'var(--warn)', fontWeight: 700 }}>{e.note_moyenne}</span>
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={(evt) => {
                        evt.stopPropagation();
                        setSelectedTab('patients');
                        setSelected(e.id);
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: 'var(--primary)',
                        borderColor: 'var(--primary)',
                        background: 'var(--primary-lt)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        borderRadius: 6,
                      }}
                      title="Consulter directement la liste des salariés"
                    >
                      <IconUsers size={13} />
                      <span>Salariés ({eff})</span>
                    </button>
                    {isAdmin && (
                      <button
                        className="btn btn-sm"
                        onClick={(evt) => {
                          evt.stopPropagation();
                          navigate('/planning', {
                            state: { prefillEntreprise: e.nom, prefillAdresse: e.adresse },
                          });
                        }}
                        title="Planifier une visite médicale"
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          background: 'var(--surface2)',
                          color: 'var(--text)',
                          border: '1px solid var(--border)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <IconCalendar size={13} />
                        <span>Planifier</span>
                      </button>
                    )}
                    <span style={{ fontSize: 11.5, color: 'var(--primary)', fontWeight: 800 }}>Détails →</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── PAGINATION CONTROLS ── */}
      {viewMode !== 'map' && filtered.length > pageSize && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginTop: 20,
          padding: '12px 18px',
          background: 'var(--surface)',
          borderRadius: 14,
          border: '1px solid var(--border)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
            Affichage de <strong style={{ color: 'var(--text)' }}>{(page - 1) * pageSize + 1}</strong> à <strong style={{ color: 'var(--text)' }}>{Math.min(page * pageSize, filtered.length)}</strong> sur <strong style={{ color: 'var(--text)' }}>{filtered.length}</strong> entreprises
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="btn btn-outline btn-sm"
              disabled={page <= 1}
              onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              style={{ fontWeight: 700 }}
            >
              Précédent
            </button>
            <span style={{ fontSize: 12.5, fontWeight: 800, padding: '4px 10px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text)' }}>
              Page {page} / {totalPages}
            </span>
            <button
              className="btn btn-outline btn-sm"
              disabled={page >= totalPages}
              onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              style={{ fontWeight: 700 }}
            >
              Suivant
            </button>
            <select
              className="input"
              style={{ height: 32, fontSize: 12, padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              <option value={24}>24 / page</option>
              <option value={48}>48 / page</option>
              <option value={96}>96 / page</option>
              <option value={200}>200 / page</option>
            </select>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal !== null && (
        <EntrepriseModal
          item={modal?.id ? modal : null}
          onSave={() => {
            setModal(null);
            load();
            toast?.('Enregistré', 'success');
          }}
          onClose={() => setModal(null)}
        />
      )}

      {quickBilan !== null && (
        <QuickBilanModal
          entreprise={quickBilan}
          onSave={() => {
            setQuickBilan(null);
            load();
            toast?.('Bilan et effectifs mis à jour avec succès !', 'success');
          }}
          onClose={() => setQuickBilan(null)}
        />
      )}

      {showImportModal && (
        <ExcelImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            load();
          }}
          toast={toast}
        />
      )}

      {confirm && !selected && (
        <ConfirmDialog
          title="Supprimer l'entreprise?"
          message="Tous les avis seront supprimés."
          danger
          onConfirm={() => handleDelete(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Rapport Activité & Historique de Travail Médecins */}
      {showRapportMedecin && (
        <RapportActiviteMedecinModal
          onClose={() => setShowRapportMedecin(false)}
          toast={toast}
        />
      )}

      {/* Patient Modal (Vue Unifiée Entreprises & Salariés) */}
      {patientModalConfig && (
        <PatientModal
          entrepriseId={patientModalConfig.entrepriseId}
          patient={patientModalConfig.patient}
          medecins={medecinsList}
          onSave={() => {
            setPatientModalConfig(null);
            loadAllPatients();
            load();
          }}
          onClose={() => setPatientModalConfig(null)}
          toast={toast}
        />
      )}

      {/* Patient Excel Import Modal (Vue Unifiée) */}
      {patientImportModalConfig && (
        <PatientExcelImportModal
          entreprise={patientImportModalConfig}
          onSuccess={() => {
            setPatientImportModalConfig(null);
            loadAllPatients();
            load();
          }}
          onClose={() => setPatientImportModalConfig(null)}
          toast={toast}
        />
      )}

      {/* Patient Documents & Images Modal (Vue Unifiée) */}
      {patientDocsModalConfig && (
        <PatientDocumentsModal
          entrepriseId={patientDocsModalConfig.entrepriseId}
          patient={patientDocsModalConfig.patient}
          onClose={() => setPatientDocsModalConfig(null)}
          onCountChanged={(newCount) => {
            setAllPatients((prev) =>
              prev.map((item) =>
                item.id === patientDocsModalConfig.patient.id
                  ? { ...item, nb_documents: newCount }
                  : item
              )
            );
          }}
          toast={toast}
        />
      )}
    </div>
  );
}
