import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import axios from 'axios';

/**
 * Convertit une date Excel (numéro de série ou chaîne FR/ISO) en YYYY-MM-DD
 */
function parseExcelDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  const str = String(val).trim();
  const frMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (frMatch) {
    const d = frMatch[1].padStart(2, '0');
    const m = frMatch[2].padStart(2, '0');
    const y = frMatch[3];
    return `${y}-${m}-${d}`;
  }
  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

/**
 * Trouve intelligemment la valeur d'une colonne selon plusieurs variantes de noms
 */
function findVal(row, patterns) {
  const keys = Object.keys(row);
  for (const pattern of patterns) {
    const foundKey = keys.find((k) =>
      k.toLowerCase().replace(/[\s\_\-\*]/g, '').includes(pattern.toLowerCase().replace(/[\s\_\-\*]/g, ''))
    );
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
      return row[foundKey];
    }
  }
  return undefined;
}

/**
 * Normalise le résultat de la visite (aptitude)
 */
function normalizeResultat(val) {
  if (!val) return 'en_attente';
  const s = String(val).toLowerCase().trim();
  if (s.includes('inapte') && (s.includes('temp') || s.includes('provisoire') || s.includes('revoir'))) return 'inapte_temporaire';
  if (s.includes('inapte')) return 'inapte';
  if (s.includes('apte') && (s.includes('temp') || s.includes('provisoire') || s.includes('revoir'))) return 'apte_temporaire';
  if (s.includes('amenage') || s.includes('aménag') || s.includes('reserve')) return 'apte_avec_amenagement';
  if (s.includes('apte')) return 'apte';
  return 'en_attente';
}

/**
 * Normalise le type de visite
 */
function normalizeTypeVisite(val) {
  if (!val) return 'Visite Périodique';
  const s = String(val).toLowerCase().trim();
  if (s.includes('embauche')) return "Visite d'Embauche";
  if (s.includes('spont')) return 'Visite Spontanée';
  if (s.includes('reprise')) return 'Visite de Reprise';
  return 'Visite Périodique';
}

export default function PatientExcelImportModal({ entreprise, onClose, onSuccess, toast }) {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [previewFilter, setPreviewFilter] = useState('');
  const fileInputRef = useRef(null);

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  }

  function handleDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  }

  function processFile(f) {
    setError(null);
    setResult(null);
    setFileName(f.name);
    setFile(f);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          setError('Le fichier Excel est vide ou ne contient aucune ligne.');
          setData([]);
          return;
        }

        const parsed = rawJson.map((row, idx) => {
          const nom = String(findVal(row, ['nom', 'name', 'nom_de_famille', 'salarié', 'salarie']) || '').trim();
          const prenom = String(findVal(row, ['prenom', 'prénom', 'firstname']) || '').trim();
          const cin = String(findVal(row, ['cin', 'identite', 'carte', 'c.i.n']) || '').trim();
          const matricule = String(findVal(row, ['matricule', 'badge', 'id_salarie', 'code_employe', 'ref']) || '').trim();
          const poste = String(findVal(row, ['poste', 'fonction', 'job', 'metier', 'profession']) || '').trim();
          const departement = String(findVal(row, ['departement', 'service', 'atelier', 'unite', 'division']) || '').trim();
          const telephone = String(findVal(row, ['telephone', 'téléphone', 'tel', 'mobile', 'portable']) || '').trim();
          const email = String(findVal(row, ['email', 'courriel', 'mail']) || '').trim();
          const genreRaw = String(findVal(row, ['genre', 'sexe']) || '').toUpperCase().trim();
          const genre = genreRaw.startsWith('F') ? 'F' : 'M';
          
          const rawDateN = findVal(row, ['naissance', 'date_naissance', 'ddn', 'birth']);
          const date_naissance = parseExcelDate(rawDateN);

          const rawType = findVal(row, ['type', 'type_visite', 'motif', 'nature']);
          const type_visite = normalizeTypeVisite(rawType);

          const rawResultat = findVal(row, ['resultat', 'résultat', 'aptitude', 'avis_medical', 'statut']);
          const resultat_visite = normalizeResultat(rawResultat);

          const rawDuree = findVal(row, ['duree', 'durée', 'periode', 'période', 'delai', 'délai', 'a_revoir', 'revoir_dans', 'temporaire']);
          let duree_temporaire = rawDuree ? String(rawDuree).trim() : null;
          if (!duree_temporaire && (resultat_visite === 'apte_temporaire' || resultat_visite === 'inapte_temporaire')) {
            duree_temporaire = '3 mois à revoir';
          }

          const rawDateR = findVal(row, ['date_revoir', 'revoir_le', 'prochaine_visite', 'convocation']);
          const date_revoir = parseExcelDate(rawDateR);

          const rawDateV = findVal(row, ['date_visite', 'derniere_visite', 'date_examen', 'visite_le']);
          const date_derniere_visite = parseExcelDate(rawDateV);

          const medecin_nom = String(findVal(row, ['medecin', 'médecin', 'docteur', 'dr']) || '').trim();
          const notes = String(findVal(row, ['notes', 'remarques', 'commentaire', 'observation']) || '').trim();

          const isValid = !!(nom && prenom);

          return {
            _rawIdx: idx + 1,
            _isValid: isValid,
            nom,
            prenom,
            cin,
            matricule,
            poste,
            departement,
            telephone,
            email,
            genre,
            date_naissance,
            type_visite,
            resultat_visite,
            duree_temporaire,
            date_revoir,
            date_derniere_visite,
            medecin_nom,
            notes,
          };
        });

        const valids = parsed.filter((r) => r._isValid);
        if (valids.length === 0) {
          setError('Aucun patient valide détecté. Assurez-vous que les colonnes "Nom" et "Prénom" sont présentes.');
        }

        setData(parsed);
      } catch (err) {
        setError("Erreur lors de la lecture du fichier : " + err.message);
        setData([]);
      }
    };
    reader.readAsBinaryString(f);
  }

  function downloadTemplate() {
    const wsData = [
      ['Nom', 'Prénom', 'CIN', 'Matricule', 'Poste', 'Département', 'Téléphone', 'Email', 'Genre', 'Date de Naissance', 'Type de Visite', 'Résultat Aptitude', 'Période / À revoir', 'Date à revoir', 'Date Visite', 'Médecin', 'Notes'],
      ['Ben Salah', 'Ahmed', '09876543', 'MAT-101', 'Ingénieur Qualité', 'Production', '98123456', 'ahmed@gmail.com', 'M', '15/05/1988', "Visite d'Embauche", 'Apte', '', '', '12/11/2026', 'Dr. Ariana', 'Bilan complet OK'],
      ['Trabelsi', 'Sonia', '11223344', 'MAT-102', 'Responsable RH', 'Ressources Humaines', '22334455', 'sonia@gmail.com', 'F', '20/09/1992', 'Visite Périodique', 'Apte temporaire', '3 mois à revoir', '12/02/2027', '12/11/2026', 'Dr. Ariana', 'Contrôle tensionnel dans 3 mois'],
      ['Gharbi', 'Karim', '08776655', 'MAT-103', 'Technicien Maintenance', 'Maintenance', '55667788', 'karim@gmail.com', 'M', '04/02/1985', 'Visite de Reprise', 'Inapte temporaire', '3 mois à revoir', '05/02/2027', '05/11/2026', 'Dr. Ariana', 'Reprise après convalescence'],
      ['Khelifi', 'Mounir', '06544554', 'MAT-104', 'Ouvrier Coupeur', 'Coupe', '94550004', '', 'M', '10/03/1980', 'Visite Périodique', 'Apte avec aménagement', '', '', '10/11/2026', 'Dr. Ariana', 'Éviter station debout prolongée'],
      ['Mansour', 'Leila', '14556677', 'MAT-105', 'Opératrice', 'Assemblage', '94112233', '', 'F', '18/11/1995', 'Visite Spontanée', 'En attente', '', '', '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salariés_Patients');
    XLSX.writeFile(wb, `Modele_Import_Patients_${entreprise?.nom || 'Entreprise'}.xlsx`);
  }

  async function handleImport() {
    const validRows = data.filter((r) => r._isValid);
    if (validRows.length === 0) {
      setError('Aucun patient valide à importer.');
      return;
    }

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const res = await axios.post(`/api/entreprises/${entreprise.id}/patients/import`, {
        items: validRows,
        updateExisting,
      });

      setResult(res.data);
      toast?.(res.data.message || 'Import réussi !', 'success');
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  }

  const validCount = data.filter((r) => r._isValid).length;
  const filteredPreview = data.filter((r) => {
    if (!previewFilter) return true;
    const q = previewFilter.toLowerCase();
    return (
      r.nom.toLowerCase().includes(q) ||
      r.prenom.toLowerCase().includes(q) ||
      r.cin.toLowerCase().includes(q) ||
      r.poste.toLowerCase().includes(q)
    );
  });

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal"
        style={{ maxWidth: 860, width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 9,
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
                <path d="M8 13h2"/>
                <path d="M8 17h2"/>
                <path d="M14 13h2"/>
                <path d="M14 17h2"/>
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                Importer la liste des salariés (Excel / CSV)
              </h3>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Entreprise : <strong>{entreprise?.nom}</strong> · Détection automatique des visites et aptitudes
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Bannière de téléchargement du modèle */}
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--surface-2, #f8fafc)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ color: 'var(--text-2)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>Modèle Excel type avec colonnes pré-remplies</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                  Téléchargez ce fichier modèle pour préparer rapidement votre liste de salariés (Nom, CIN, Poste, Type de visite, Aptitude).
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={downloadTemplate}
              style={{
                fontWeight: 600,
                borderRadius: 8,
                padding: '7px 14px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Télécharger modèle (.xlsx)
            </button>
          </div>

          {/* Zone de glisser-déposer */}
          {!file && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border)',
                borderRadius: 14,
                padding: '36px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'var(--surface2)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary, #0284c7)';
                e.currentTarget.style.background = 'rgba(2,132,199,0.03)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.background = 'var(--surface2)';
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <div style={{ color: 'var(--primary, #0284c7)', marginBottom: 10 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                Cliquez ici ou glissez votre fichier Excel / CSV
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                Formats acceptés : .xlsx, .xls, .csv (jusqu'à plusieurs milliers de salariés)
              </div>
            </div>
          )}

          {/* Fichier sélectionné & Options */}
          {file && (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ color: 'var(--text-2)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{fileName}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                    {validCount} ligne(s) valide(s) détectée(s) sur {data.length} au total
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setFile(null);
                  setData([]);
                  setResult(null);
                  setError(null);
                }}
              >
                Changer de fichier
              </button>
            </div>
          )}

          {/* Option de mise à jour */}
          {file && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
              />
              <span>Mettre à jour les patients existants s'ils possèdent le même CIN ou le même Nom / Prénom</span>
            </label>
          )}

          {/* Erreur */}
          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: '#fee2e2',
                border: '1px solid #f87171',
                borderRadius: 10,
                color: '#991b1b',
                fontSize: 12.5,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Succès */}
          {result && (
            <div
              style={{
                padding: '12px 16px',
                background: '#dcfce7',
                border: '1px solid #86efac',
                borderRadius: 12,
                color: '#166534',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>{result.message}</span>
            </div>
          )}

          {/* Aperçu du tableau */}
          {data.length > 0 && !result && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <strong style={{ fontSize: 13, color: 'var(--text)' }}>
                  Aperçu des données ({filteredPreview.length} / {data.length})
                </strong>
                <input
                  type="text"
                  placeholder="Filtrer l'aperçu..."
                  value={previewFilter}
                  onChange={(e) => setPreviewFilter(e.target.value)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    background: 'var(--surface)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              <div style={{ maxHeight: 250, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                <table className="table" style={{ width: '100%', fontSize: 12, margin: 0 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '8px 10px' }}>Salarié</th>
                      <th style={{ padding: '8px 10px' }}>CIN</th>
                      <th style={{ padding: '8px 10px' }}>Poste</th>
                      <th style={{ padding: '8px 10px' }}>Type Visite</th>
                      <th style={{ padding: '8px 10px' }}>Résultat</th>
                      <th style={{ padding: '8px 10px' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPreview.slice(0, 50).map((r, i) => (
                      <tr key={i} style={{ opacity: r._isValid ? 1 : 0.5 }}>
                        <td style={{ padding: '6px 10px', fontWeight: 700 }}>
                          {r.nom} {r.prenom}
                        </td>
                        <td style={{ padding: '6px 10px' }}>{r.cin || r.matricule || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{r.poste || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                            {r.type_visite}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background:
                                r.resultat_visite === 'apte'
                                  ? '#dcfce7'
                                  : r.resultat_visite === 'apte_temporaire'
                                  ? '#e0f2fe'
                                  : r.resultat_visite === 'apte_avec_amenagement'
                                  ? '#ffedd5'
                                  : r.resultat_visite === 'inapte_temporaire'
                                  ? '#f3e8ff'
                                  : r.resultat_visite === 'inapte'
                                  ? '#fee2e2'
                                  : '#f1f5f9',
                              color:
                                r.resultat_visite === 'apte'
                                  ? '#166534'
                                  : r.resultat_visite === 'apte_temporaire'
                                  ? '#0369a1'
                                  : r.resultat_visite === 'apte_avec_amenagement'
                                  ? '#9a3412'
                                  : r.resultat_visite === 'inapte_temporaire'
                                  ? '#6b21a8'
                                  : r.resultat_visite === 'inapte'
                                  ? '#991b1b'
                                  : '#475569',
                            }}
                          >
                            {r.resultat_visite === 'apte'
                              ? 'Apte'
                              : r.resultat_visite === 'apte_temporaire'
                              ? `Apte temp. (${r.duree_temporaire || '3 mois'})`
                              : r.resultat_visite === 'apte_avec_amenagement'
                              ? 'Apte + aménagement'
                              : r.resultat_visite === 'inapte_temporaire'
                              ? `Inapte temp. (${r.duree_temporaire || '3 mois'})`
                              : r.resultat_visite === 'inapte'
                              ? 'Inapte'
                              : 'En attente'}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px' }}>{r.date_derniere_visite || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={importing}>
            {result ? 'Fermer' : 'Annuler'}
          </button>
          {!result && file && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleImport}
              disabled={importing || validCount === 0}
              style={{
                fontWeight: 600,
                minWidth: 160,
              }}
            >
              {importing ? 'Importation en cours...' : `Lancer l'import (${validCount} salariés)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
