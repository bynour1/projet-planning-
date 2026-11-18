import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import { exportToPDF, exportToWord } from '../utils/exportUtils';
import RapportMedicalImportModal from './RapportMedicalImportModal';

export default function RapportActiviteMedecinModal({
  onClose,
  defaultMedecinId = null,
  initialDateDebut = null,
  initialDateFin = null,
  initialDateUnique = null,
  initialFilterMode = null,
  initialSourceFilter = 'all',
  toast,
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrateur';
  const isMedecin = user?.role === 'medecin';
  const currentYear = new Date().getFullYear();

  const [medecins, setMedecins] = useState([]);
  const [selectedMedecinId, setSelectedMedecinId] = useState(
    isMedecin ? String(user.id) : (defaultMedecinId || 'all')
  );

  const [filterMode, setFilterMode] = useState(
    initialFilterMode || (initialDateUnique ? 'date_unique' : (initialDateDebut || initialDateFin ? 'periode' : 'periode'))
  ); // 'periode' | 'date_unique' | 'all'

  const [dateDebut, setDateDebut] = useState(initialDateDebut || `${currentYear}-01-01`);
  const [dateFin, setDateFin] = useState(initialDateFin || new Date().toISOString().slice(0, 10));
  const [dateUnique, setDateUnique] = useState(initialDateUnique || new Date().toISOString().slice(0, 10));
  const [sourceFilter, setSourceFilter] = useState(initialSourceFilter || 'all'); // 'all' | 'planning' | 'visite' | 'clino' | 'evenement'

  const [activeTab, setActiveTab] = useState('visites'); // 'visites' | 'entreprises'
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);

  // Charger la liste des médecins (si admin)
  useEffect(() => {
    if (isAdmin) {
      axios
        .get('/api/users/by-role/medecin')
        .then((res) => setMedecins(res.data || []))
        .catch(() => {});
    }
  }, [isAdmin]);

  // Helper pour les badges d'origine
  function getSourceBadge(source) {
    if (source === 'planning') {
      return { label: 'Planning', bg: '#f1f5f9', color: '#0369a1', border: '#cbd5e1' };
    }
    if (source === 'clino') {
      return { label: 'Clino Mobile', bg: '#f1f5f9', color: '#065f46', border: '#cbd5e1' };
    }
    if (source === 'evenement') {
      return { label: 'Événement', bg: '#f1f5f9', color: '#92400e', border: '#cbd5e1' };
    }
    return { label: 'Fiche Entreprise', bg: '#f1f5f9', color: '#7e22ce', border: '#cbd5e1' };
  }

  // Charger les données du rapport selon les filtres
  async function loadReport() {
    setLoading(true);
    try {
      const params = {};
      if (selectedMedecinId && selectedMedecinId !== 'all') {
        params.medecin_id = selectedMedecinId;
      }
      if (filterMode === 'date_unique') {
        params.date = dateUnique;
      } else if (filterMode === 'periode') {
        if (dateDebut) params.date_debut = dateDebut;
        if (dateFin) params.date_fin = dateFin;
      }

      const { data } = await axios.get('/api/entreprises/rapport-medecin', { params });
      setReportData(data);
    } catch (err) {
      toast?.('Erreur lors du chargement de l\'historique', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport();
  }, [selectedMedecinId, filterMode, dateDebut, dateFin, dateUnique]);

  // Raccourcis de dates
  function applyDateShortcut(type) {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    setFilterMode('periode');

    if (type === 'today') {
      setFilterMode('date_unique');
      setDateUnique(todayStr);
    } else if (type === 'week') {
      const day = today.getDay() || 7; // 1 (Mon) - 7 (Sun)
      const monday = new Date(today);
      monday.setDate(today.getDate() - day + 1);
      setDateDebut(monday.toISOString().slice(0, 10));
      setDateFin(todayStr);
    } else if (type === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      setDateDebut(firstDay);
      setDateFin(todayStr);
    } else if (type === 'year') {
      setDateDebut(`${currentYear}-01-01`);
      setDateFin(`${currentYear}-12-31`);
    } else if (type === 'all') {
      setFilterMode('all');
      setDateDebut('');
      setDateFin('');
    }
  }

  // Filtrer les visites avec la barre de recherche et le filtre de source
  const filteredVisites = useMemo(() => {
    if (!reportData?.visites) return [];
    let list = reportData.visites;
    if (sourceFilter !== 'all') {
      list = list.filter((v) => v.source === sourceFilter);
    }
    if (!searchTerm.trim()) return list;
    const q = searchTerm.toLowerCase();
    return list.filter(
      (v) =>
        (v.entreprise_nom || '').toLowerCase().includes(q) ||
        (v.type_visite || '').toLowerCase().includes(q) ||
        (v.medecin_nom || '').toLowerCase().includes(q) ||
        (v.commentaire || '').toLowerCase().includes(q) ||
        (v.source || '').toLowerCase().includes(q)
    );
  }, [reportData, sourceFilter, searchTerm]);

  // Nom du médecin pour l'en-tête du document
  const currentMedecinLabel = useMemo(() => {
    if (selectedMedecinId === 'all') return 'Tous les médecins';
    if (reportData?.medecin) return `Dr. ${reportData.medecin.prenom} ${reportData.medecin.nom}`;
    const m = medecins.find((med) => String(med.id) === String(selectedMedecinId));
    if (m) return `Dr. ${m.prenom} ${m.nom}`;
    if (user?.role === 'medecin') return `Dr. ${user.prenom} ${user.nom}`;
    return 'Médecin assigné';
  }, [selectedMedecinId, reportData, medecins, user]);

  // Description de la période
  const periodeLabel = useMemo(() => {
    if (filterMode === 'date_unique') return `Journée du ${dateUnique}`;
    if (filterMode === 'periode') {
      if (dateDebut && dateFin) return `Période du ${dateDebut} au ${dateFin}`;
      if (dateDebut) return `À partir du ${dateDebut}`;
      if (dateFin) return `Jusqu'au ${dateFin}`;
    }
    return `Campagne Globale ${currentYear}`;
  }, [filterMode, dateUnique, dateDebut, dateFin, currentYear]);

  // ── EXPORT EXCEL ──────────────────────────────────────────────
  function handleExportExcel() {
    if (!filteredVisites || filteredVisites.length === 0) {
      toast?.('Aucune donnée à exporter pour cette sélection', 'warning');
      return;
    }

    const wb = XLSX.utils.book_new();

    // 1. Feuille Récapitulative par Entreprise
    const recapData = (reportData.entreprises_summary || []).map((e, idx) => ({
      'N°': idx + 1,
      'Entreprise': e.entreprise_nom,
      'Secteur d\'activité': e.secteur || '—',
      'Passages / Visites': e.nb_visites,
      'Effectifs Examinés (Vus)': e.total_examines,
      'Visites d\'Embauche': e.total_embauche || 0,
      'Visites Périodiques': e.total_periodique || 0,
      'Visites de Reprise': e.total_reprise || 0,
      'Visites Spontanées': e.total_spontanee || 0,
      'Visio (Vision)': e.total_visio || 0,
      'Audio (Audiométrie)': e.total_audio || 0,
      'ECG': e.total_ecg || 0,
      'Bilans Complémentaires': e.total_bilans,
      'Dernier Passage': e.dernier_passage ? String(e.dernier_passage).slice(0, 10) : '—',
      'Types d\'interventions': e.types_visite || '—',
    }));
    const wsRecap = XLSX.utils.json_to_sheet(recapData);
    XLSX.utils.book_append_sheet(wb, wsRecap, 'Synthèse Entreprises');

    // 2. Feuille Détail Chronologique
    const detailData = filteredVisites.map((v, idx) => ({
      'N°': idx + 1,
      'Origine': v.source === 'planning' ? 'Planning Médical' : (v.source === 'clino' ? 'Clino Mobile' : (v.source === 'evenement' ? 'Événement' : 'Fiche Entreprise')),
      'Date': v.date ? String(v.date).slice(0, 10) : '',
      'Heure': v.heure ? String(v.heure).slice(0, 5) : '—',
      'Entreprise': v.entreprise_nom,
      'Médecin': v.medecin_nom || currentMedecinLabel,
      'Technicien': v.technicien_nom || '—',
      'Type de Visite': v.type_visite || 'Visite Périodique',
      'Salariés Examinés': parseInt(v.nb_examines, 10) || 0,
      'Embauche': parseInt(v.nb_embauche, 10) || 0,
      'Périodique': parseInt(v.nb_periodique, 10) || 0,
      'Reprise': parseInt(v.nb_reprise, 10) || 0,
      'Spontanée': parseInt(v.nb_spontanee, 10) || 0,
      'Visio': parseInt(v.nb_visio, 10) || 0,
      'Audio': parseInt(v.nb_audio, 10) || 0,
      'ECG': parseInt(v.nb_ecg, 10) || 0,
      'Bilans Complémentaires': parseInt(v.nb_bilans, 10) || 0,
      'Statut': v.statut === 'effectuee' ? 'Effectuée' : v.statut || 'Effectuée',
      'Observations / Rapport': v.commentaire || '',
    }));
    const wsDetail = XLSX.utils.json_to_sheet(detailData);
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Historique Détaillé');

    const cleanMed = currentMedecinLabel.replace(/[\/\\?%*:|"<>]/g, '_');
    XLSX.writeFile(wb, `Rapport_Activite_${cleanMed}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast?.('Export Excel (.xlsx) téléchargé avec succès !', 'success');
  }

  // ── EXPORT PDF ────────────────────────────────────────────────
  function handleExportPDF() {
    if (!filteredVisites || filteredVisites.length === 0) {
      toast?.('Aucune donnée à exporter pour cette sélection', 'warning');
      return;
    }

    const columns = [
      { header: 'Date', key: 'date' },
      { header: 'Origine', key: 'source' },
      { header: 'Entreprise visitée', key: 'entreprise' },
      { header: 'Type de visite', key: 'type' },
      { header: 'Salariés vus', key: 'examines' },
      { header: 'Détail (E/P/R/S)', key: 'types_breakdown' },
      { header: 'Examens (V/A/E)', key: 'examens' },
      { header: 'Bilans', key: 'bilans' },
      { header: 'Observations', key: 'obs' },
    ];

    const pdfData = filteredVisites.map((v) => ({
      date: `${v.date ? String(v.date).slice(0, 10) : ''} ${v.heure ? String(v.heure).slice(0, 5) : ''}`.trim(),
      source: v.source === 'planning' ? 'Planning' : (v.source === 'clino' ? 'Clino' : (v.source === 'evenement' ? 'Événement' : 'Visite')),
      entreprise: v.entreprise_nom,
      type: v.type_visite || 'Périodique',
      examines: `${v.nb_examines || 0} salariés`,
      types_breakdown: `Emb:${v.nb_embauche || 0} Péri:${v.nb_periodique || 0} Rep:${v.nb_reprise || 0} Spont:${v.nb_spontanee || 0}`,
      examens: `V:${v.nb_visio || 0} A:${v.nb_audio || 0} E:${v.nb_ecg || 0}`,
      bilans: v.nb_bilans || 0,
      obs: v.commentaire || '—',
    }));

    exportToPDF(
      pdfData,
      columns,
      `Rapport d'activité médicale - ${currentMedecinLabel} (${periodeLabel})`
    );
    toast?.('Rapport PDF généré avec succès !', 'success');
  }

  // ── EXPORT WORD ───────────────────────────────────────────────
  function handleExportWord() {
    if (!filteredVisites || filteredVisites.length === 0) {
      toast?.('Aucune donnée à exporter pour cette sélection', 'warning');
      return;
    }

    const columns = [
      { header: 'Date', key: 'date' },
      { header: 'Origine', key: 'source' },
      { header: 'Entreprise visitée', key: 'entreprise' },
      { header: 'Type de visite', key: 'type' },
      { header: 'Salariés vus', key: 'examines' },
      { header: 'Détail (E/P/R/S)', key: 'types_breakdown' },
      { header: 'Examens (V/A/E)', key: 'examens' },
      { header: 'Bilans', key: 'bilans' },
      { header: 'Observations', key: 'obs' },
    ];

    const wordData = filteredVisites.map((v) => ({
      date: `${v.date ? String(v.date).slice(0, 10) : ''} ${v.heure ? String(v.heure).slice(0, 5) : ''}`.trim(),
      source: v.source === 'planning' ? 'Planning' : (v.source === 'clino' ? 'Clino' : (v.source === 'evenement' ? 'Événement' : 'Visite')),
      entreprise: v.entreprise_nom,
      type: v.type_visite || 'Périodique',
      examines: `${v.nb_examines || 0} salariés`,
      types_breakdown: `Emb:${v.nb_embauche || 0} Péri:${v.nb_periodique || 0} Rep:${v.nb_reprise || 0} Spont:${v.nb_spontanee || 0}`,
      examens: `V:${v.nb_visio || 0} A:${v.nb_audio || 0} E:${v.nb_ecg || 0}`,
      bilans: v.nb_bilans || 0,
      obs: v.commentaire || '—',
    }));

    exportToWord(
      wordData,
      columns,
      `Rapport d'activité médicale - ${currentMedecinLabel} (${periodeLabel})`
    );
    toast?.('Document Word généré avec succès !', 'success');
  }

  const kpis = reportData?.kpis || {
    total_visites: 0,
    total_entreprises: 0,
    total_effectifs_examines: 0,
    total_bilans: 0,
    total_visio: 0,
    total_audio: 0,
    total_ecg: 0,
    total_embauche: 0,
    total_periodique: 0,
    total_reprise: 0,
    total_spontanee: 0,
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{
          maxWidth: 960,
          width: '95%',
          maxHeight: '92vh',
          borderRadius: 18,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'var(--surface-2, #f1f5f9)',
                color: 'var(--primary, #0284c7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                Rapport d'Activité Médicale
              </h3>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>
                Suivi des entreprises visitées et effectifs examinés ({periodeLabel})
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleExportExcel}
              style={{ fontWeight: 600, borderRadius: 8, padding: '5px 10px', fontSize: 12 }}
              title="Exporter sous Excel (.xlsx)"
            >
              Excel
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleExportPDF}
              style={{ fontWeight: 600, borderRadius: 8, padding: '5px 10px', fontSize: 12 }}
              title="Exporter sous format PDF"
            >
              PDF
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleExportWord}
              style={{ fontWeight: 600, borderRadius: 8, padding: '5px 10px', fontSize: 12 }}
              title="Exporter sous format Word"
            >
              Word
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowImportModal(true)}
              style={{ fontWeight: 700, borderRadius: 8, padding: '5px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
              title="Importer un rapport médical depuis un fichier Excel (.xlsx, .csv)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span>Importer</span>
            </button>
            <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
              ✕
            </button>
          </div>
        </div>

        {/* Modal Controls / Filter Bar */}
        <div
          style={{
            padding: '14px 24px',
            background: 'var(--surface-2, #f8fafc)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Row 1: Doctor select + Shortcuts */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            {isAdmin ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 260 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>Médecin :</span>
                <select
                  className="input"
                  style={{ fontSize: 12.5, height: 36, padding: '4px 10px', borderRadius: 8, fontWeight: 600 }}
                  value={selectedMedecinId}
                  onChange={(e) => setSelectedMedecinId(e.target.value)}
                >
                  <option value="all">Tous les médecins (Global)</option>
                  {medecins.map((m) => (
                    <option key={m.id} value={m.id}>
                      Dr. {m.prenom} {m.nom}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {currentMedecinLabel}
                </span>
                <span style={{ fontSize: 11, background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
                  Médecin du Travail
                </span>
              </div>
            )}

            {/* Quick shortcuts */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[
                ['today', 'Aujourd\'hui'],
                ['week', 'Cette semaine'],
                ['month', 'Ce mois-ci'],
                ['year', `Année ${currentYear}`],
                ['all', 'Tout l\'historique'],
              ].map(([tKey, label]) => (
                <button
                  key={tKey}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => applyDateShortcut(tKey)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    borderRadius: 6,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Date Selector (Single vs Range) */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 8, padding: 2, border: '1px solid var(--border)' }}>
              <button
                type="button"
                className={`btn btn-sm ${filterMode === 'periode' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 10px', fontSize: 11.5, fontWeight: filterMode === 'periode' ? 800 : 600, borderRadius: 6 }}
                onClick={() => setFilterMode('periode')}
              >
                📅 Période
              </button>
              <button
                type="button"
                className={`btn btn-sm ${filterMode === 'date_unique' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 10px', fontSize: 11.5, fontWeight: filterMode === 'date_unique' ? 800 : 600, borderRadius: 6 }}
                onClick={() => setFilterMode('date_unique')}
              >
                🎯 Date unique
              </button>
            </div>

            {filterMode === 'periode' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>Du :</span>
                <input
                  type="date"
                  className="input"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  style={{ fontSize: 12, height: 34, padding: '2px 8px', borderRadius: 8, width: 140 }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>Au :</span>
                <input
                  type="date"
                  className="input"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  style={{ fontSize: 12, height: 34, padding: '2px 8px', borderRadius: 8, width: 140 }}
                />
              </div>
            )}

            {filterMode === 'date_unique' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>Date :</span>
                <input
                  type="date"
                  className="input"
                  value={dateUnique}
                  onChange={(e) => setDateUnique(e.target.value)}
                  style={{ fontSize: 12, height: 34, padding: '2px 8px', borderRadius: 8, width: 150 }}
                />
              </div>
            )}

            <div style={{ flex: 1, minWidth: 180, display: 'flex', justifyContent: 'flex-end' }}>
              <input
                type="text"
                className="input"
                placeholder="Filtrer par entreprise, type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ fontSize: 12, height: 34, padding: '2px 10px', borderRadius: 8, maxWidth: 260 }}
              />
            </div>
          </div>
        </div>

        {/* KPI Dashboard Cards */}
        <div
          style={{
            padding: '12px 24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10,
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ background: 'var(--surface)', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Entreprises</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
              {kpis.total_entreprises}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Salariés vus</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', marginTop: 2 }}>
              {kpis.total_effectifs_examines}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Embauche</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
              {kpis.total_embauche || 0}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Périodique</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
              {kpis.total_periodique || 0}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Reprise</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
              {kpis.total_reprise || 0}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Spontanée</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
              {kpis.total_spontanee || 0}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Examens (V / A / E)</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span title="Visio">V: {kpis.total_visio || 0}</span>
              <span>·</span>
              <span title="Audio">A: {kpis.total_audio || 0}</span>
              <span>·</span>
              <span title="ECG">E: {kpis.total_ecg || 0}</span>
            </div>
          </div>
          <div style={{ background: 'var(--surface)', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Bilans</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
              {kpis.total_bilans}
            </div>
          </div>
          <div style={{ background: 'var(--surface)', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Passages</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
              {kpis.total_visites}
            </div>
          </div>
        </div>

        {/* View Switcher: Entreprises Summary vs Chronological List */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '8px 24px 0',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('visites')}
            style={{
              padding: '10px 14px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'visites' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
              fontWeight: activeTab === 'visites' ? 700 : 500,
              color: activeTab === 'visites' ? 'var(--primary)' : 'var(--text-3)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Historique Chronologique ({filteredVisites.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('entreprises')}
            style={{
              padding: '10px 14px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'entreprises' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
              fontWeight: activeTab === 'entreprises' ? 700 : 500,
              color: activeTab === 'entreprises' ? 'var(--primary)' : 'var(--text-3)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Récapitulatif par Entreprise ({reportData?.entreprises_summary?.length || 0})
          </button>
        </div>

        {/* Modal Body / Table view */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
              <div className="spinner" />
            </div>
          ) : activeTab === 'visites' ? (
            filteredVisites.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)' }}>
                <div style={{ display: 'inline-flex', padding: 12, borderRadius: 12, background: 'var(--surface-2)', color: 'var(--text-3)', marginBottom: 8 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                  </svg>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Aucune visite enregistrée pour ces critères</div>
                <div style={{ fontSize: 12.5, marginTop: 4 }}>
                  Modifiez la période ou enregistrez une visite médicale depuis la fiche entreprise.
                </div>
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <table className="table" style={{ width: '100%', fontSize: 12.5, margin: 0 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 12px' }}>Date & Heure</th>
                      <th style={{ padding: '10px 12px' }}>Origine</th>
                      <th style={{ padding: '10px 12px' }}>Entreprise visitée</th>
                      <th style={{ padding: '10px 12px' }}>Type de visite</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Salariés vus</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Détail Types</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Examens</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Bilans</th>
                      <th style={{ padding: '10px 12px' }}>Observations & Rapport</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVisites.map((v, i) => (
                      <tr key={v.id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 700 }}>{v.date ? String(v.date).slice(0, 10) : '—'}</div>
                          {v.heure && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{String(v.heure).slice(0, 5)}</div>}
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'var(--surface-2, #f1f5f9)',
                              color: 'var(--text-2)',
                              border: '1px solid var(--border)',
                              display: 'inline-block',
                            }}
                          >
                            {v.source === 'planning' ? 'Planning' : v.source === 'clino' ? 'Clino' : v.source === 'evenement' ? 'Événement' : 'Entreprise'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text)' }}>{v.entreprise_nom}</div>
                          {v.entreprise_secteur && (
                            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{v.entreprise_secteur}</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{
                              fontSize: 11.5,
                              background: 'var(--surface2)',
                              border: '1px solid var(--border)',
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontWeight: 500,
                            }}
                          >
                            {v.type_visite || 'Visite Périodique'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: 13,
                              color: '#15803d',
                              background: '#dcfce7',
                              padding: '3px 10px',
                              borderRadius: 8,
                              display: 'inline-block',
                            }}
                          >
                            {v.nb_examines || 0}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: 4, fontSize: 10.5, fontWeight: 600 }}>
                            {(v.nb_embauche || 0) > 0 && <span style={{ padding: '1px 5px', borderRadius: 4, background: '#ecfdf5', color: '#047857' }} title="Visite d'Embauche">Emb: {v.nb_embauche}</span>}
                            {(v.nb_periodique || 0) > 0 && <span style={{ padding: '1px 5px', borderRadius: 4, background: '#f0f9ff', color: '#0284c7' }} title="Visite Périodique">Péri: {v.nb_periodique}</span>}
                            {(v.nb_reprise || 0) > 0 && <span style={{ padding: '1px 5px', borderRadius: 4, background: '#faf5ff', color: '#7e22ce' }} title="Visite de Reprise">Rep: {v.nb_reprise}</span>}
                            {(v.nb_spontanee || 0) > 0 && <span style={{ padding: '1px 5px', borderRadius: 4, background: '#fff7ed', color: '#c2410c' }} title="Visite Spontanée">Spont: {v.nb_spontanee}</span>}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {((v.nb_visio || 0) > 0 || (v.nb_audio || 0) > 0 || (v.nb_ecg || 0) > 0) ? (
                            <div style={{ display: 'inline-flex', gap: 4, fontSize: 11, fontWeight: 600 }}>
                              {(v.nb_visio || 0) > 0 && <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text)' }}>V: {v.nb_visio}</span>}
                              {(v.nb_audio || 0) > 0 && <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text)' }}>A: {v.nb_audio}</span>}
                              {(v.nb_ecg || 0) > 0 && <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text)' }}>E: {v.nb_ecg}</span>}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {(v.nb_bilans || 0) > 0 ? (
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: 12,
                                color: 'var(--text)',
                                background: 'var(--surface-2)',
                                padding: '2px 8px',
                                borderRadius: 6,
                              }}
                            >
                              {v.nb_bilans}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-3)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                            {v.commentaire || <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Aucune observation</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            // TAB: RÉCAPITULATIF PAR ENTREPRISE
            (!reportData?.entreprises_summary || reportData.entreprises_summary.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)' }}>
                Aucune entreprise visitée durant cette période.
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <table className="table" style={{ width: '100%', fontSize: 12.5, margin: 0 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 12px' }}>Entreprise</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Passages</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Total Vus</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Embauche</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Périodique</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Reprise</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Spontanée</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Total Examens</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Total Bilans</th>
                      <th style={{ padding: '10px 12px' }}>Dernier Passage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.entreprises_summary.map((e, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text)' }}>{e.entreprise_nom}</div>
                          {e.secteur && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{e.secteur}</div>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>
                          {e.nb_visites} passage{e.nb_visites > 1 ? 's' : ''}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: 13,
                              color: '#15803d',
                              background: '#dcfce7',
                              padding: '3px 10px',
                              borderRadius: 8,
                              display: 'inline-block',
                            }}
                          >
                            {e.total_examines}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: 12, color: '#047857', background: '#ecfdf5', padding: '3px 8px', borderRadius: 6 }}>
                            {e.total_embauche || 0}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: 12, color: '#0284c7', background: '#f0f9ff', padding: '3px 8px', borderRadius: 6 }}>
                            {e.total_periodique || 0}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: 12, color: '#7e22ce', background: '#faf5ff', padding: '3px 8px', borderRadius: 6 }}>
                            {e.total_reprise || 0}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: 12, color: '#c2410c', background: '#fff7ed', padding: '3px 8px', borderRadius: 6 }}>
                            {e.total_spontanee || 0}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {((e.total_visio || 0) > 0 || (e.total_audio || 0) > 0 || (e.total_ecg || 0) > 0) ? (
                            <div style={{ display: 'inline-flex', gap: 4, fontSize: 11, fontWeight: 600 }}>
                              {(e.total_visio || 0) > 0 && <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text)' }}>V: {e.total_visio}</span>}
                              {(e.total_audio || 0) > 0 && <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text)' }}>A: {e.total_audio}</span>}
                              {(e.total_ecg || 0) > 0 && <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text)' }}>E: {e.total_ecg}</span>}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text)' }}>
                          {e.total_bilans}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {e.dernier_passage ? String(e.dernier_passage).slice(0, 10) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Document officiel de la médecine du travail — GMT Ariana
          </div>
          <button type="button" className="btn btn-primary" onClick={onClose} style={{ fontWeight: 800 }}>
            Fermer
          </button>
        </div>
      </div>

      {/* Modal Import de Rapport Médical */}
      {showImportModal && (
        <RapportMedicalImportModal
          medecinId={isMedecin ? user.id : (selectedMedecinId !== 'all' ? selectedMedecinId : user?.id)}
          medecinNom={currentMedecinLabel}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            loadReport();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}
