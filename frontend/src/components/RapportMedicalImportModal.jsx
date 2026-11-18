import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import axios from 'axios';

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
    return `${frMatch[3]}-${frMatch[2].padStart(2, '0')}-${frMatch[1].padStart(2, '0')}`;
  }
  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }
  return null;
}

function findValue(row, patterns) {
  const keys = Object.keys(row);
  for (const pattern of patterns) {
    const foundKey = keys.find((k) =>
      k.toLowerCase().replace(/[\s\_\-\*]/g, '').includes(pattern.toLowerCase().replace(/[\s\_\-\*]/g, ''))
    );
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
      return row[foundKey];
    }
  }
  return undefined;
}

export default function RapportMedicalImportModal({ medecinId, medecinNom, onClose, onSuccess, toast }) {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  function handleFileChange(e) {
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
  }

  function handleDrop(e) {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) processFile(droppedFile);
  }

  function processFile(f) {
    setError(null);
    setFileName(f.name);
    setFile(f);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        // Utiliser la première feuille ou la feuille nommée 'Historique Détaillé' si présente
        const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('détail') || n.toLowerCase().includes('historique')) || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!jsonData || jsonData.length === 0) {
          setError('Le fichier Excel ne contient aucune ligne de rapport médical valide.');
          setData([]);
          return;
        }

        const normalized = jsonData.map((row, idx) => {
          const rawDate = findValue(row, ['date', 'jour', 'date_visite', 'visite_date']);
          const date = parseExcelDate(rawDate);

          const entreprise = String(findValue(row, ['entreprise', 'societe', 'société', 'client', 'nom_entreprise']) || '').trim();
          if (!entreprise && !date) return null;

          const type_visite = String(findValue(row, ['type', 'type_visite', 'intervention', 'motif']) || 'Visite Médicale Périodique').trim();
          const nb_examines = Math.max(0, parseInt(findValue(row, ['examines', 'salaries', 'effectif', 'vus', 'exam', 'total_vus', 'total_examines', 'nb_examines']) || 0, 10));
          const nb_bilans = Math.max(0, parseInt(findValue(row, ['bilans', 'bilan', 'analyses', 'nb_bilans']) || 0, 10));

          const nb_embauche = Math.max(0, parseInt(findValue(row, ['embauche', 'emb']) || 0, 10));
          const nb_periodique = Math.max(0, parseInt(findValue(row, ['periodique', 'périodique', 'per']) || 0, 10));
          const nb_reprise = Math.max(0, parseInt(findValue(row, ['reprise', 'rep']) || 0, 10));
          const nb_spontanee = Math.max(0, parseInt(findValue(row, ['spontanee', 'spontanée', 'autre']) || 0, 10));

          const nb_visio = Math.max(0, parseInt(findValue(row, ['visio', 'vision']) || 0, 10));
          const nb_audio = Math.max(0, parseInt(findValue(row, ['audio', 'audiometrie', 'audiométrie']) || 0, 10));
          const nb_ecg = Math.max(0, parseInt(findValue(row, ['ecg']) || 0, 10));

          const commentaire = String(findValue(row, ['commentaire', 'observations', 'rapport', 'remarque', 'notes']) || '').trim();

          return {
            id: idx + 1,
            date: date || new Date().toISOString().slice(0, 10),
            entreprise: entreprise || 'Entreprise Inconnue',
            type_visite,
            nb_examines,
            nb_bilans,
            nb_embauche,
            nb_periodique,
            nb_reprise,
            nb_spontanee,
            nb_visio,
            nb_audio,
            nb_ecg,
            commentaire,
          };
        }).filter(Boolean);

        if (normalized.length === 0) {
          setError("Aucune ligne de rapport médical n'a pu être extraite. Vérifiez les colonnes 'Date' et 'Entreprise'.");
        }
        setData(normalized);
      } catch (err) {
        setError("Erreur lors de la lecture du fichier : " + (err.message || 'Format invalide'));
      }
    };
    reader.readAsBinaryString(f);
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const rows = [
      {
        'Date': new Date().toISOString().slice(0, 10),
        'Entreprise': 'EXEMPLE STE AGRO',
        'Type de Visite': 'Visite Périodique & Embauche',
        'Salariés Examinés': 15,
        'Bilans Complémentaires': 2,
        'Embauche': 3,
        'Périodique': 10,
        'Reprise': 2,
        'Spontanée': 0,
        'Visio': 15,
        'Audio': 15,
        'ECG': 5,
        'Observations / Rapport': 'Bonne condition physique générale, 2 bilans sanguins demandés.',
      },
      {
        'Date': new Date().toISOString().slice(0, 10),
        'Entreprise': 'EXEMPLE TECH SERVICES',
        'Type de Visite': 'Visite Spontanée & Reprise',
        'Salariés Examinés': 8,
        'Bilans Complémentaires': 1,
        'Embauche': 0,
        'Périodique': 5,
        'Reprise': 3,
        'Spontanée': 0,
        'Visio': 8,
        'Audio': 8,
        'ECG': 2,
        'Observations / Rapport': 'Aptitudes confirmées pour les postes écran.',
      }
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Rapport Médical');
    XLSX.writeFile(wb, 'Modele_Import_Rapport_Medical.xlsx');
  }

  async function handleImport() {
    if (data.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await axios.post('/api/entreprises/rapport-medecin/import', {
        medecin_id: medecinId,
        items: data,
      });

      toast?.(res.data?.message || `${res.data?.importedCount || data.length} visites importées avec succès !`, 'success');
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de l'importation du rapport");
      toast?.(err.response?.data?.message || "Erreur d'importation", 'error');
    } finally {
      setImporting(false);
    }
  }

  const totalExamines = data.reduce((s, r) => s + (r.nb_examines || 0), 0);
  const totalBilans = data.reduce((s, r) => s + (r.nb_bilans || 0), 0);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1050 }}>
      <div
        className="modal"
        style={{
          maxWidth: 820,
          width: '95%',
          maxHeight: '90vh',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
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
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#e0f2fe',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                Importer un Rapport Médical
              </h3>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {medecinNom ? `Attribution au Dr. ${medecinNom}` : 'Import de visites et effectifs examinés'}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>
          {/* Info & Modèle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2, #f8fafc)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              Glissez votre fichier Excel (.xlsx / .csv) contenant la synthèse de vos visites médicales.
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={downloadTemplate}
              style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Télécharger Modèle
            </button>
          </div>

          {/* Zone Drop */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border)',
              borderRadius: 12,
              padding: '24px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              background: file ? 'rgba(2, 132, 199, 0.04)' : 'var(--surface)',
              borderColor: file ? '#0284c7' : 'var(--border)',
              transition: 'all 0.2s',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                {fileName ? fileName : 'Cliquez ou glissez-déposez le fichier du rapport médical'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                Formats supportés : .xlsx, .xls, .csv
              </div>
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 12.5 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Prévisualisation */}
          {data.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                  Aperçu des interventions détectées ({data.length})
                </span>
                <div style={{ display: 'flex', gap: 8, fontSize: 12, fontWeight: 700 }}>
                  <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 6 }}>
                    {totalExamines} examiné(s)
                  </span>
                  <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 6 }}>
                    {totalBilans} bilan(s)
                  </span>
                </div>
              </div>

              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: 'var(--surface2)', position: 'sticky', top: 0, borderBottom: '1px solid var(--border)' }}>
                    <tr>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Entreprise</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Type</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Examinés</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Bilans</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Observations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.slice(0, 50).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.date}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--primary)' }}>{r.entreprise}</td>
                        <td style={{ padding: '6px 10px' }}>{r.type_visite}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700 }}>{r.nb_examines}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>{r.nb_bilans}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.commentaire || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.length > 50 && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
                  Affichage des 50 premières lignes sur {data.length} au total.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="modal-footer"
          style={{
            padding: '12px 22px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button className="btn btn-outline" onClick={onClose} disabled={importing}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={importing || data.length === 0}
            style={{ fontWeight: 800, minWidth: 160 }}
          >
            {importing ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="spinner" style={{ width: 14, height: 14 }} />
                Importation en cours…
              </span>
            ) : (
              `Importer ${data.length > 0 ? `${data.length} visite(s)` : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
