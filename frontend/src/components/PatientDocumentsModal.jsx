import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const CATEGORIES = [
  { value: 'certificat', label: 'Certificat Médical' },
  { value: 'bilan', label: 'Bilan Sanguin / Analyses' },
  { value: 'radio', label: 'Radiographie / Imagerie' },
  { value: 'fiche_aptitude', label: "Fiche d'Aptitude" },
  { value: 'cin', label: "Pièce d'Identité / CIN" },
  { value: 'autre', label: 'Autre Document' },
];

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function PatientDocumentsModal({ entrepriseId, patient, onClose, onDocumentsUpdated, toast }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [categorie, setCategorie] = useState('certificat');
  const [description, setDescription] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const fileInputRef = useRef(null);

  async function loadDocuments() {
    if (!patient?.id) return;
    try {
      setLoading(true);
      const res = await axios.get(`/api/entreprises/${entrepriseId}/patients/${patient.id}/documents`);
      setDocuments(res.data || []);
    } catch (err) {
      toast?.('Erreur chargement documents', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, [patient?.id, entrepriseId]);

  async function handleFileUpload(files) {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    formData.append('categorie', categorie);
    if (description.trim()) {
      formData.append('description', description.trim());
    }

    setUploading(true);
    try {
      const res = await axios.post(`/api/entreprises/${entrepriseId}/patients/${patient.id}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast?.(res.data.message || 'Fichier(s) importé(s) avec succès !', 'success');
      setDescription('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadDocuments();
      onDocumentsUpdated?.();
    } catch (err) {
      toast?.(err.response?.data?.message || 'Erreur lors de l\'import du document', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDocument(docId) {
    if (!window.confirm('Voulez-vous vraiment supprimer ce document ?')) return;
    try {
      await axios.delete(`/api/entreprises/${entrepriseId}/patients/${patient.id}/documents/${docId}`);
      toast?.('Document supprimé', 'success');
      await loadDocuments();
      onDocumentsUpdated?.();
    } catch (err) {
      toast?.('Erreur suppression document', 'error');
    }
  }

  function isImage(mime, filename = '') {
    if (mime && mime.startsWith('image/')) return true;
    return /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(filename);
  }

  function isPdf(mime, filename = '') {
    if (mime === 'application/pdf') return true;
    return /\.pdf$/i.test(filename);
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1300 }}>
      <div
        className="modal"
        style={{ maxWidth: 760, width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                Dossier Médical : {patient.nom} {patient.prenom}
              </h3>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Poste : <strong>{patient.poste || 'Non précisé'}</strong> · CIN : {patient.cin || '—'} · {documents.length} document(s)
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Zone d'import de document */}
          <div
            style={{
              padding: '16px',
              background: 'var(--surface2)',
              border: '1.5px dashed var(--primary)',
              borderRadius: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary, #0284c7)' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span>Importer un nouveau document ou une image</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label" style={{ fontSize: 11.5 }}>Catégorie du document</label>
                <select
                  className="input"
                  value={categorie}
                  onChange={(e) => setCategorie(e.target.value)}
                  style={{ fontSize: 12 }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" style={{ fontSize: 11.5 }}>Description / Titre optionnel</label>
                <input
                  type="text"
                  className="input"
                  placeholder="ex: Radio pulmonaire, Bilan annuel..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ fontSize: 12 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*, .pdf, .doc, .docx, .xls, .xlsx, .txt"
                onChange={(e) => handleFileUpload(e.target.files)}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  fontWeight: 600,
                  borderRadius: 8,
                  padding: '8px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>{uploading ? 'Importation en cours...' : 'Sélectionner des documents ou photos'}</span>
              </button>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                Images (JPG, PNG), PDF, Bilans, Radios jusqu'à 25 Mo
              </span>
            </div>
          </div>

          {/* Liste des documents */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Dossier médical du salarié ({documents.length})</span>
              {documents.length > 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  Cliquez sur un document pour l'ouvrir ou le prévisualiser
                </span>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)' }}>Chargement des documents...</div>
            ) : documents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 16px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'inline-flex', padding: 12, borderRadius: 12, background: 'var(--surface-2)', color: 'var(--text-3)', marginBottom: 8 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                  </svg>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Aucun document pour ce salarié</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  Importez des certificats, radiographies, ordonnances ou fiches d'aptitude ci-dessus.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {documents.map((doc) => {
                  const img = isImage(doc.type_mime, doc.nom_original);
                  const pdf = isPdf(doc.type_mime, doc.nom_original);
                  const catLabel = CATEGORIES.find((c) => c.value === doc.categorie)?.label || 'Document';

                  return (
                    <div
                      key={doc.id}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      }}
                    >
                      {/* Thumbnail or Icon */}
                      <div
                        style={{
                          height: 120,
                          background: 'var(--surface2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                          cursor: 'pointer',
                          overflow: 'hidden',
                        }}
                        onClick={() => {
                          if (img) setSelectedImage(doc.url);
                          else window.open(doc.url, '_blank');
                        }}
                      >
                        {img ? (
                          <img
                            src={doc.url}
                            alt={doc.nom_original}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div style={{ textAlign: 'center', color: 'var(--text-3)' }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                            </svg>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 4 }}>
                              {pdf ? 'PDF' : doc.nom_original.split('.').pop() || 'DOC'}
                            </div>
                          </div>
                        )}
                        <span
                          style={{
                            position: 'absolute',
                            top: 6,
                            left: 6,
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'rgba(15,23,42,0.75)',
                            color: '#fff',
                          }}
                        >
                          {catLabel}
                        </span>
                      </div>

                      {/* Info & Actions */}
                      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 12,
                            color: 'var(--text)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={doc.description || doc.nom_original}
                        >
                          {doc.description || doc.nom_original}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{formatFileSize(doc.taille)}</span>
                          <span>{String(doc.created_at || '').slice(0, 10)}</span>
                        </div>

                        <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-outline btn-sm"
                            style={{ flex: 1, padding: '4px 6px', fontSize: 11, textAlign: 'center', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                            Ouvrir
                          </a>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteDocument(doc.id)}
                            style={{ padding: '4px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Supprimer ce document"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary" onClick={onClose} style={{ fontWeight: 800 }}>
            Fermer
          </button>
        </div>
      </div>

      {/* Lightbox pour prévisualisation de photo/image */}
      {selectedImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 1500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setSelectedImage(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={selectedImage}
              alt="Prévisualisation"
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
            />
            <button
              onClick={() => setSelectedImage(null)}
              style={{
                position: 'absolute',
                top: -12,
                right: -12,
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                fontSize: 16,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
