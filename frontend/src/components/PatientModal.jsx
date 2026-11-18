import React, { useState } from 'react';
import axios from 'axios';
import PatientDocumentsModal from './PatientDocumentsModal';

export const VISIT_TYPES = [
  { value: "Visite d'Embauche", label: "Visite d'embauche" },
  { value: 'Visite Périodique', label: 'Visite périodique' },
  { value: 'Visite Spontanée', label: 'Visite spontanée' },
  { value: 'Visite de Reprise', label: 'Visite de reprise' },
];

export const RESULTATS_APTITUDE = [
  { value: 'en_attente', label: 'En attente', color: '#64748b', bg: '#f1f5f9' },
  { value: 'apte', label: 'Apte', color: '#166534', bg: '#dcfce7' },
  { value: 'apte_temporaire', label: 'Apte temporaire', color: '#0284c7', bg: '#e0f2fe' },
  { value: 'apte_avec_amenagement', label: 'Apte avec aménagement', color: '#9a3412', bg: '#ffedd5' },
  { value: 'inapte_temporaire', label: 'Inapte temporaire', color: '#6b21a8', bg: '#f3e8ff' },
  { value: 'inapte', label: 'Inapte', color: '#991b1b', bg: '#fee2e2' },
];

export default function PatientModal({ entrepriseId, patient, medecins = [], onClose, onSave, toast }) {
  const isEdit = !!patient?.id;
  const [f, setF] = useState({
    nom: patient?.nom || '',
    prenom: patient?.prenom || '',
    cin: patient?.cin || '',
    matricule: patient?.matricule || '',
    date_naissance: patient?.date_naissance ? String(patient.date_naissance).slice(0, 10) : '',
    genre: patient?.genre || 'M',
    poste: patient?.poste || '',
    departement: patient?.departement || '',
    telephone: patient?.telephone || '',
    email: patient?.email || '',
    type_visite: patient?.type_visite || 'Visite Périodique',
    resultat_visite: patient?.resultat_visite || 'en_attente',
    duree_temporaire: patient?.duree_temporaire || (patient?.resultat_visite === 'apte_temporaire' || patient?.resultat_visite === 'inapte_temporaire' ? '3 mois à revoir' : ''),
    date_revoir: patient?.date_revoir ? String(patient.date_revoir).slice(0, 10) : '',
    date_derniere_visite: patient?.date_derniere_visite ? String(patient.date_derniere_visite).slice(0, 10) : '',
    medecin_nom: patient?.medecin_nom || '',
    notes: patient?.notes || '',
    has_visio: !!patient?.has_visio,
    has_audio: !!patient?.has_audio,
    has_ecg: !!patient?.has_ecg,
  });

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showDocsModal, setShowDocsModal] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!f.nom.trim() || !f.prenom.trim()) {
      setErr('Le nom et le prénom sont obligatoires.');
      return;
    }

    setSaving(true);
    setErr('');

    try {
      if (isEdit) {
        await axios.put(`/api/entreprises/${entrepriseId}/patients/${patient.id}`, f);
        toast?.('Patient mis à jour avec succès', 'success');
      } else {
        await axios.post(`/api/entreprises/${entrepriseId}/patients`, f);
        toast?.('Patient ajouté avec succès', 'success');
      }
      onSave?.();
      onClose?.();
    } catch (error) {
      setErr(error.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal"
        style={{ maxWidth: 640, width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: 'var(--surface-2, #f1f5f9)',
                color: 'var(--primary, #0284c7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {isEdit ? `Modifier salarié : ${patient.nom} ${patient.prenom}` : 'Ajouter un patient / salarié'}
              </h3>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Saisie des informations personnelles et suivi d'aptitude
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 'clamp(14px, 3vw, 20px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {err && (
              <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #f87171', borderRadius: 8, color: '#991b1b', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{err}</span>
              </div>
            )}

            {/* Identité */}
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
              Identité du Salarié
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <label className="label">Nom *</label>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder="ex: Ben Salah"
                  value={f.nom}
                  onChange={(e) => setF({ ...f, nom: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Prénom *</label>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder="ex: Ahmed"
                  value={f.prenom}
                  onChange={(e) => setF({ ...f, prenom: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
              <div>
                <label className="label">CIN</label>
                <input
                  type="text"
                  className="input"
                  placeholder="ex: 09876543"
                  value={f.cin}
                  onChange={(e) => setF({ ...f, cin: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Matricule / N° Dossier</label>
                <input
                  type="text"
                  className="input"
                  placeholder="ex: MAT-101"
                  value={f.matricule}
                  onChange={(e) => setF({ ...f, matricule: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Genre</label>
                <select
                  className="input"
                  value={f.genre}
                  onChange={(e) => setF({ ...f, genre: e.target.value })}
                >
                  <option value="M">Homme (M)</option>
                  <option value="F">Femme (F)</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <label className="label">Date de Naissance</label>
                <input
                  type="date"
                  className="input"
                  value={f.date_naissance}
                  onChange={(e) => setF({ ...f, date_naissance: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Téléphone</label>
                <input
                  type="text"
                  className="input"
                  placeholder="ex: 98 123 456"
                  value={f.telephone}
                  onChange={(e) => setF({ ...f, telephone: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <label className="label">Poste / Fonction</label>
                <input
                  type="text"
                  className="input"
                  placeholder="ex: Ingénieur Qualité, Chauffeur..."
                  value={f.poste}
                  onChange={(e) => setF({ ...f, poste: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Département / Service</label>
                <input
                  type="text"
                  className="input"
                  placeholder="ex: Production, RH, Atelier..."
                  value={f.departement}
                  onChange={(e) => setF({ ...f, departement: e.target.value })}
                />
              </div>
            </div>

            {/* Suivi Médical & Aptitude */}
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginTop: 8 }}>
              Visite Médicale & Aptitude
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <label className="label">Type de visite</label>
                <select
                  className="input"
                  value={f.type_visite}
                  onChange={(e) => setF({ ...f, type_visite: e.target.value })}
                >
                  {VISIT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Résultat d'Aptitude</label>
                <select
                  className="input"
                  value={f.resultat_visite}
                  onChange={(e) => {
                    const val = e.target.value;
                    setF((prev) => ({
                      ...prev,
                      resultat_visite: val,
                      duree_temporaire: (val === 'apte_temporaire' || val === 'inapte_temporaire') && !prev.duree_temporaire ? '3 mois à revoir' : prev.duree_temporaire,
                    }));
                  }}
                  style={{
                    fontWeight: 700,
                    color: RESULTATS_APTITUDE.find((r) => r.value === f.resultat_visite)?.color || 'inherit',
                  }}
                >
                  {RESULTATS_APTITUDE.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Examens complémentaires réalisés */}
            <div style={{ background: 'var(--surface-2, #f8fafc)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                Examens & Tests Complémentaires :
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: f.has_visio ? 'rgba(2,132,199,0.08)' : 'var(--surface)',
                    border: `1px solid ${f.has_visio ? '#0284c7' : 'var(--border)'}`,
                    color: f.has_visio ? '#0369a1' : 'var(--text-2)',
                    fontWeight: 600,
                    fontSize: 12,
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!f.has_visio}
                    onChange={(e) => setF({ ...f, has_visio: e.target.checked ? 1 : 0 })}
                  />
                  <span>Visio fait</span>
                </label>

                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: f.has_audio ? 'rgba(15,118,110,0.08)' : 'var(--surface)',
                    border: `1px solid ${f.has_audio ? '#0f766e' : 'var(--border)'}`,
                    color: f.has_audio ? '#0f766e' : 'var(--text-2)',
                    fontWeight: 600,
                    fontSize: 12,
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!f.has_audio}
                    onChange={(e) => setF({ ...f, has_audio: e.target.checked ? 1 : 0 })}
                  />
                  <span>Audio fait</span>
                </label>

                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: f.has_ecg ? 'rgba(190,18,60,0.08)' : 'var(--surface)',
                    border: `1px solid ${f.has_ecg ? '#be123c' : 'var(--border)'}`,
                    color: f.has_ecg ? '#be123c' : 'var(--text-2)',
                    fontWeight: 600,
                    fontSize: 12,
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!f.has_ecg}
                    onChange={(e) => setF({ ...f, has_ecg: e.target.checked ? 1 : 0 })}
                  />
                  <span>ECG fait</span>
                </label>
              </div>
            </div>

            {/* Période temporaire (3 mois à revoir, etc.) */}
            {(f.resultat_visite === 'apte_temporaire' || f.resultat_visite === 'inapte_temporaire') && (
              <div
                style={{
                  padding: '14px 16px',
                  background: 'var(--surface-2, #f8fafc)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span>Période temporaire / Délais à revoir</span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: f.resultat_visite === 'apte_temporaire' ? '#0369a1' : '#7e22ce',
                    }}
                  >
                    {f.resultat_visite === 'apte_temporaire' ? 'Apte temporaire' : 'Inapte temporaire'}
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, display: 'block' }}>
                    Délai rapide suggéré :
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['15 jours', '1 mois', '2 mois', '3 mois à revoir', '6 mois'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setF((prev) => {
                            const next = { ...prev, duree_temporaire: preset };
                            const baseDate = prev.date_derniere_visite ? new Date(prev.date_derniere_visite) : new Date();
                            if (!isNaN(baseDate.getTime())) {
                              const d = new Date(baseDate);
                              if (preset === '15 jours') d.setDate(d.getDate() + 15);
                              else if (preset === '1 mois') d.setMonth(d.getMonth() + 1);
                              else if (preset === '2 mois') d.setMonth(d.getMonth() + 2);
                              else if (preset.includes('3 mois')) d.setMonth(d.getMonth() + 3);
                              else if (preset === '6 mois') d.setMonth(d.getMonth() + 6);
                              next.date_revoir = d.toISOString().slice(0, 10);
                            }
                            return next;
                          });
                        }}
                        style={{
                          fontSize: 11.5,
                          padding: '4px 10px',
                          borderRadius: 8,
                          fontWeight: f.duree_temporaire === preset ? 700 : 500,
                          background: f.duree_temporaire === preset ? 'var(--primary, #0284c7)' : 'var(--surface)',
                          color: f.duree_temporaire === preset ? '#fff' : 'var(--text)',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                        }}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div>
                    <label className="label">Période / Durée *</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="ex: 3 mois à revoir"
                      value={f.duree_temporaire}
                      onChange={(e) => setF({ ...f, duree_temporaire: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Date de re-convocation / À revoir le</label>
                    <input
                      type="date"
                      className="input"
                      value={f.date_revoir}
                      onChange={(e) => setF({ ...f, date_revoir: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <label className="label">Date de la visite</label>
                <input
                  type="date"
                  className="input"
                  value={f.date_derniere_visite}
                  onChange={(e) => setF({ ...f, date_derniere_visite: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Médecin examinateur</label>
                <input
                  type="text"
                  className="input"
                  placeholder="ex: Dr. Ben Amor"
                  list="medecins-list"
                  value={f.medecin_nom}
                  onChange={(e) => setF({ ...f, medecin_nom: e.target.value })}
                />
                <datalist id="medecins-list">
                  {medecins.map((m) => (
                    <option key={m.id} value={`Dr. ${m.prenom} ${m.nom}`} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="label">Notes / Aménagements / Observations</label>
              <textarea
                className="input"
                rows={2}
                placeholder="ex: Éviter le port de charges lourdes, examen ophtalmique préconisé..."
                value={f.notes}
                onChange={(e) => setF({ ...f, notes: e.target.value })}
              />
            </div>

            {/* Documents & Images du salarié (si salarié déjà enregistré) */}
            {isEdit && (
              <div
                style={{
                  marginTop: 6,
                  padding: '14px 16px',
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
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                      Dossier Médical (Documents & Images)
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                      Certificats médicaux, bilans sanguins, ordonnances, radios, pièce d'identité (CIN)
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowDocsModal(true)}
                  style={{
                    fontWeight: 600,
                    borderRadius: 8,
                    padding: '6px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span>Gérer les documents ({patient.nb_documents || 0})</span>
                </button>
              </div>
            )}
          </div>

          <div className="modal-footer" style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
              style={{ fontWeight: 600 }}
            >
              {saving ? 'Enregistrement...' : isEdit ? 'Mettre à jour' : 'Enregistrer le salarié'}
            </button>
          </div>
        </form>
      </div>

      {showDocsModal && (
        <PatientDocumentsModal
          entrepriseId={entrepriseId}
          patient={patient}
          onClose={() => setShowDocsModal(false)}
          onDocumentsUpdated={() => onSave?.()}
          toast={toast}
        />
      )}
    </div>
  );
}
