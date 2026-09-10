import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { downloadEntreprisesTemplate } from '../utils/excelTemplate';

/**
 * Convertit une date Excel (numéro de série ou chaîne FR/ISO) en YYYY-MM-DD
 */
function parseExcelDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    // Numéro de série Excel (jours depuis 1900-01-01)
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  const str = String(val).trim();
  // Format DD/MM/YYYY ou DD-MM-YYYY
  const frMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (frMatch) {
    const d = frMatch[1].padStart(2, '0');
    const m = frMatch[2].padStart(2, '0');
    const y = frMatch[3];
    return `${y}-${m}-${d}`;
  }
  // Format YYYY-MM-DD
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

export default function ExcelImportModal({ onClose, onSuccess, toast }) {
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
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
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
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!jsonData || jsonData.length === 0) {
          setError('Le fichier Excel est vide ou ne contient aucune ligne valide.');
          setData([]);
          return;
        }

        // Normalisation intelligente des colonnes
        const normalized = jsonData.map((row, idx) => {
          const nom = findValue(row, ['nom', 'societe', 'société', 'entreprise', 'raison', 'client']) || '';
          const secteur = findValue(row, ['secteur', 'activite', 'activité', 'domaine', 'branche']) || '';
          const adresse = findValue(row, ['adresse', 'ville', 'lieu', 'localisation']) || '';
          const telephone = findValue(row, ['tel', 'tél', 'phone', 'contact_tel', 'mobile']) || '';
          const email = findValue(row, ['email', 'mail', 'courriel']) || '';
          const site_web = findValue(row, ['site', 'web', 'url', 'lien']) || '';
          const description = findValue(row, ['description', 'obs', 'remarque', 'note', 'commentaire']) || '';

          const rawConv = findValue(row, ['conv', 'convention', 'conventionne', 'conventionnée']);
          let convensionne = 1;
          if (rawConv !== undefined && rawConv !== '') {
            const s = String(rawConv).toLowerCase().trim();
            if (s === 'non' || s === '0' || s === 'false' || s === 'non conv' || s === 'non conventionnée' || s === 'no') {
              convensionne = 0;
            }
          }

          const rawRenouv = findValue(row, ['renouv', 'renouvelable']);
          let renouvelable = 1;
          if (rawRenouv !== undefined && rawRenouv !== '') {
            const s = String(rawRenouv).toLowerCase().trim();
            if (s === 'non' || s === '0' || s === 'false' || s === 'no') {
              renouvelable = 0;
            }
          }

          const rawDebut = findValue(row, ['date_debut', 'debut', 'début', 'start']);
          const rawFin = findValue(row, ['date_fin', 'fin', 'expiration', 'échéance', 'echeance']);
          const rawDerniere = findValue(row, ['derniere_visite', 'dernière', 'visite_date', 'date_visite']);

          const date_debut_convention = parseExcelDate(rawDebut);
          const date_fin_convention = parseExcelDate(rawFin);
          const date_derniere_visite = parseExcelDate(rawDerniere);

          const effectif_total = Math.max(0, parseInt(findValue(row, ['effectif', 'salari', 'personnel', 'employe', 'employé', 'total']) || 0, 10));
          const nb_visites_faites = Math.max(0, parseInt(findValue(row, ['visites_faites', 'vus', 'visite_faite', 'visites faites', 'deja vu', 'déjà vu']) || 0, 10));
          const nb_bilans_faits = Math.max(0, parseInt(findValue(row, ['bilans_faits', 'bilan fait', 'bilans faits']) || 0, 10));
          const nb_bilans_manquants = Math.max(0, parseInt(findValue(row, ['bilans_manquants', 'manquant', 'bilan manquant']) || 0, 10));

          const isValid = !!String(nom).trim();

          return {
            _index: idx + 1,
            _isValid: isValid,
            nom: String(nom).trim(),
            secteur: String(secteur).trim(),
            adresse: String(adresse).trim(),
            telephone: String(telephone).trim(),
            email: String(email).trim(),
            site_web: String(site_web).trim(),
            description: String(description).trim(),
            convensionne,
            renouvelable,
            date_debut_convention,
            date_fin_convention,
            date_derniere_visite,
            annee_campagne: new Date().getFullYear(),
            effectif_total: isNaN(effectif_total) ? 0 : effectif_total,
            nb_visites_faites: isNaN(nb_visites_faites) ? 0 : nb_visites_faites,
            nb_bilans_faits: isNaN(nb_bilans_faits) ? 0 : nb_bilans_faits,
            nb_bilans_manquants: isNaN(nb_bilans_manquants) ? 0 : nb_bilans_manquants,
          };
        });

        setData(normalized);
      } catch (err) {
        console.error('Erreur lecture fichier Excel:', err);
        setError('Impossible de lire le fichier. Veuillez vous assurer qu\'il s\'agit d\'un fichier Excel (.xlsx, .xls) ou CSV valide.');
      }
    };
    reader.readAsBinaryString(f);
  }

  async function handleImport() {
    const validItems = data.filter((d) => d._isValid);
    if (validItems.length === 0) {
      setError('Aucune entreprise valide à importer. Le nom de l\'entreprise est obligatoire.');
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const { data: res } = await axios.post('/api/entreprises/import', {
        items: validItems,
        updateExisting,
      });

      setResult(res);
      toast?.(`Import réussi : ${res.created} créée(s), ${res.updated} mise(s) à jour`, 'success');
      onSuccess?.(res);
    } catch (err) {
      console.error('Erreur API import:', err);
      const msg = err.response?.data?.message || 'Erreur lors de l\'importation des entreprises.';
      setError(msg);
      toast?.(msg, 'error');
    } finally {
      setImporting(false);
    }
  }

  const validCount = data.filter((d) => d._isValid).length;
  const invalidCount = data.length - validCount;

  const filteredPreview = data.filter((row) => {
    if (!previewFilter) return true;
    const q = previewFilter.toLowerCase();
    return (
      row.nom.toLowerCase().includes(q) ||
      row.secteur.toLowerCase().includes(q) ||
      row.adresse.toLowerCase().includes(q)
    );
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{
          maxWidth: 900,
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 18,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', padding: '16px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>📥</span>
            <div>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
                Importation Excel des Entreprises Conventionnées
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
                Ajoutez ou mettez à jour votre portefeuille d'entreprises à partir d'un fichier .xlsx ou .csv
              </p>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {/* Si import terminé avec succès */}
          {result ? (
            <div style={{ textAlign: 'center', padding: '30px 10px' }}>
              <div style={{ fontSize: 50, marginBottom: 12 }}>🎉</div>
              <h4 style={{ fontSize: 20, fontWeight: 800, color: '#16a34a', margin: '0 0 8px 0' }}>
                Importation effectuée avec succès !
              </h4>
              <p style={{ fontSize: 14, color: 'var(--text-2)', maxWidth: 500, margin: '0 auto 20px auto' }}>
                Les entreprises conventionnées et le suivi de leurs effectifs ont été intégrés dans l'application.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 12,
                  maxWidth: 550,
                  margin: '0 auto 24px auto',
                }}
              >
                <div style={{ background: 'var(--surface2)', padding: '14px', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>TOTAL LIGNES</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', marginTop: 4 }}>{result.total}</div>
                </div>
                <div style={{ background: '#dcfce7', padding: '14px', borderRadius: 12, border: '1px solid #86efac' }}>
                  <div style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>NOUVELLES CRÉÉES</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#16a34a', marginTop: 4 }}>+{result.created}</div>
                </div>
                <div style={{ background: '#e0f2fe', padding: '14px', borderRadius: 12, border: '1px solid #7dd3fc' }}>
                  <div style={{ fontSize: 11, color: '#0369a1', fontWeight: 700 }}>MISES À JOUR</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#0284c7', marginTop: 4 }}>{result.updated}</div>
                </div>
                {result.skipped > 0 && (
                  <div style={{ background: '#fef3c7', padding: '14px', borderRadius: 12, border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: 11, color: '#92400e', fontWeight: 700 }}>IGNORÉES</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#d97706', marginTop: 4 }}>{result.skipped}</div>
                  </div>
                )}
              </div>

              {result.errors?.length > 0 && (
                <div style={{ maxWidth: 600, margin: '0 auto 20px auto', textAlign: 'left', background: '#fee2e2', padding: 14, borderRadius: 12, border: '1px solid #fca5a5' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#991b1b', marginBottom: 6 }}>
                    ⚠️ {result.errors.length} avertissement(s) ou ligne(s) non importée(s) :
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#7f1d1d' }}>
                    {result.errors.map((e, idx) => (
                      <li key={idx}>Ligne {e.row} {e.nom ? `(${e.nom})` : ''} : {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button className="btn btn-primary" onClick={onClose} style={{ fontWeight: 800, padding: '10px 24px', borderRadius: 10 }}>
                ✓ Fermer et afficher les entreprises
              </button>
            </div>
          ) : (
            <>
              {/* Zone de téléchargement du modèle + Aide */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'linear-gradient(135deg, rgba(2,132,199,0.08), rgba(14,165,233,0.03))',
                  border: '1px solid rgba(2,132,199,0.25)',
                  padding: '12px 16px',
                  borderRadius: 12,
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div>
                  <strong style={{ fontSize: 13, color: '#0369a1' }}>💡 Vous n'avez pas le bon format ?</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                    Téléchargez notre modèle Excel préformaté avec colonnes types et exemples concrets.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={downloadEntreprisesTemplate}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: '#0284c7',
                    fontWeight: 700,
                    fontSize: 12,
                    borderColor: '#0284c7',
                  }}
                >
                  <span>📄</span>
                  <span>Télécharger le modèle Excel (.xlsx)</span>
                </button>
              </div>

              {/* Zone de Glisser-Déposer / Sélection de fichier */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: 14,
                  padding: '24px 16px',
                  textAlign: 'center',
                  background: file ? 'var(--surface2)' : 'var(--surface)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  marginBottom: 16,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <div style={{ fontSize: 36, marginBottom: 6 }}>📊</div>
                {fileName ? (
                  <div>
                    <strong style={{ fontSize: 14, color: 'var(--text)' }}>{fileName}</strong>
                    <div style={{ fontSize: 12, color: '#16a34a', marginTop: 4, fontWeight: 600 }}>
                      ✓ Fichier prêt à être analysé • Cliquez pour en choisir un autre
                    </div>
                  </div>
                ) : (
                  <div>
                    <strong style={{ fontSize: 14, color: 'var(--text)' }}>
                      Glissez-déposez votre document Excel ici
                    </strong>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                      ou cliquez pour parcourir vos fichiers (.xlsx, .xls, .csv)
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div
                  style={{
                    background: '#fee2e2',
                    border: '1px solid #fca5a5',
                    color: '#991b1b',
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontSize: 12.5,
                    marginBottom: 16,
                    fontWeight: 600,
                  }}
                >
                  ⚠️ {error}
                </div>
              )}

              {/* Prévisualisation des données détectées */}
              {data.length > 0 && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                        Aperçu ({data.length} détectées) :
                      </span>
                      <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                        {validCount} valides
                      </span>
                      {invalidCount > 0 && (
                        <span style={{ fontSize: 11, background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                          {invalidCount} sans nom
                        </span>
                      )}
                    </div>

                    <input
                      className="input"
                      style={{ height: 32, fontSize: 12, width: 200 }}
                      placeholder="Filtrer l'aperçu..."
                      value={previewFilter}
                      onChange={(e) => setPreviewFilter(e.target.value)}
                    />
                  </div>

                  {/* Tableau de prévisualisation */}
                  <div
                    style={{
                      maxHeight: 220,
                      overflowY: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      background: 'var(--surface)',
                      marginBottom: 14,
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 10px', width: 40 }}>#</th>
                          <th style={{ padding: '8px 10px' }}>Entreprise</th>
                          <th style={{ padding: '8px 10px' }}>Secteur</th>
                          <th style={{ padding: '8px 10px' }}>Statut Conv.</th>
                          <th style={{ padding: '8px 10px' }}>Effectif</th>
                          <th style={{ padding: '8px 10px' }}>Visites Faites</th>
                          <th style={{ padding: '8px 10px' }}>Dates Convention</th>
                          <th style={{ padding: '8px 10px' }}>Téléphone / Ville</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPreview.map((row) => (
                          <tr
                            key={row._index}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              background: !row._isValid ? '#fff1f2' : undefined,
                            }}
                          >
                            <td style={{ padding: '6px 10px', color: 'var(--text-3)' }}>{row._index}</td>
                            <td style={{ padding: '6px 10px', fontWeight: 700, color: row._isValid ? 'var(--text)' : '#dc2626' }}>
                              {row.nom || '❌ (Nom manquant)'}
                            </td>
                            <td style={{ padding: '6px 10px', color: 'var(--text-2)' }}>{row.secteur || '—'}</td>
                            <td style={{ padding: '6px 10px' }}>
                              <span
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: 6,
                                  background: row.convensionne ? '#dcfce7' : '#f1f5f9',
                                  color: row.convensionne ? '#166534' : '#64748b',
                                }}
                              >
                                {row.convensionne ? '📜 Conventionnée' : 'Non conv.'}
                              </span>
                            </td>
                            <td style={{ padding: '6px 10px', fontWeight: 800, color: '#0284c7' }}>
                              {row.effectif_total}
                            </td>
                            <td style={{ padding: '6px 10px', fontWeight: 700, color: '#16a34a' }}>
                              {row.nb_visites_faites}
                            </td>
                            <td style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-3)' }}>
                              {row.date_debut_convention || '—'} → {row.date_fin_convention || '—'}
                            </td>
                            <td style={{ padding: '6px 10px', color: 'var(--text-2)', fontSize: 11 }}>
                              {row.telephone || row.adresse || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Options d'import */}
                  <div
                    style={{
                      background: 'var(--surface2)',
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <input
                      type="checkbox"
                      id="updateExistingCheckbox"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                      style={{ cursor: 'pointer', width: 16, height: 16 }}
                    />
                    <label htmlFor="updateExistingCheckbox" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                      Mettre à jour les informations des entreprises si elles existent déjà (même raison sociale)
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', padding: '14px 22px' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={importing}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleImport}
              disabled={importing || validCount === 0}
              style={{ fontWeight: 800, minWidth: 160 }}
            >
              {importing ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  Importation en cours...
                </span>
              ) : (
                `🚀 Importer ${validCount > 0 ? `(${validCount})` : ''}`
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
