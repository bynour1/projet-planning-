import { useEffect, useState, useRef, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AddressAutocomplete from '../components/AddressAutocomplete';
import NavigationSelector from '../components/NavigationSelector';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Helper : générer le lien Google Maps depuis une adresse ───
function googleMapsUrl(adresse) {
  if (!adresse) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
}

function MapView({ entreprises }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView([36.8, 10.18], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(map);
    mapInstanceRef.current = map;

    // Geocode each entreprise with Nominatim
    entreprises
      .filter((e) => e.adresse)
      .forEach(async (ent) => {
        const cached = sessionStorage.getItem('geo_' + ent.adresse);
        let lat, lon;
        if (cached) {
          ({ lat, lon } = JSON.parse(cached));
        } else {
          try {
            const r = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
                ent.adresse
              )},Ariana,Tunisie&format=json&limit=1`
            );
            const data = await r.json();
            if (data[0]) {
              lat = parseFloat(data[0].lat);
              lon = parseFloat(data[0].lon);
              sessionStorage.setItem('geo_' + ent.adresse, JSON.stringify({ lat, lon }));
            }
          } catch {}
        }
        if (lat && lon) {
          L.marker([lat, lon])
            .addTo(map)
            .bindPopup(
              `<b>${ent.nom}</b><br>${ent.adresse}<br><small>${ent.secteur || ''}</small>`
            );
        }
      });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [entreprises]);

  return (
    <div
      ref={mapRef}
      style={{
        height: 540,
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        border: '1px solid var(--border)',
      }}
    />
  );
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
        ⚠️ Expirée ({Math.abs(diffDays)}j)
      </span>
    );
  }
  if (diffDays <= 30) {
    return (
      <span style={{ fontSize: 11, fontWeight: 800, color: '#9a3412', background: '#ffedd5', padding: '3px 9px', borderRadius: 6 }}>
        ⏳ Expire dans {diffDays}j
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11, fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '3px 9px', borderRadius: 6 }}>
      ✅ Valide ({diffDays}j restants)
    </span>
  );
}

// ── Modal pour création/édition complète d'entreprise ──────────
function EntrepriseModal({ item, onSave, onClose }) {
  const init = item || {};
  const [f, setF] = useState({
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
              {init.id ? '✏️ Modifier l\'entreprise' : '➕ Nouvelle entreprise'}
            </h3>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Fiche administrative, coordonnées et suivi des effectifs de santé au travail
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '76vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, padding: '18px 22px' }}>
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
              background: 'linear-gradient(135deg, rgba(14,165,233,0.06), rgba(2,132,199,0.09))',
              border: '1.5px solid rgba(14,165,233,0.3)',
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, color: '#0284c7', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>👥</span> Effectifs Salariés & Suivi des Visites
              </span>
              <span style={{ fontSize: 11, background: '#0284c7', color: '#fff', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                Calcul Auto
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label style={{ fontSize: 12, fontWeight: 700 }}>👥 Effectif total (Salariés)</label>
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
                <label style={{ fontSize: 12, fontWeight: 700 }}>🩺 Effectif ayant déjà fait sa visite</label>
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
                <label style={{ fontSize: 12, fontWeight: 700 }}>🧪 Bilans médicaux réalisés</label>
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
                <label style={{ fontSize: 12, fontWeight: 700 }}>⚠️ Bilans manquants / en attente</label>
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
              background: f.convensionne ? 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(5,150,105,0.08))' : 'var(--surface2)',
              border: `1.5px solid ${f.convensionne ? 'rgba(16,185,129,0.35)' : 'var(--border)'}`,
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13, color: f.convensionne ? '#059669' : 'var(--text-2)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📜</span> Statut & Détails de la Convention
              </span>
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
                  ✅ Conventionnée
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${!f.convensionne ? 'btn-danger' : 'btn-outline'}`}
                  onClick={() => s('convensionne', false)}
                  style={{ flex: 1, justifyContent: 'center', padding: '8px' }}
                >
                  ❌ Non conventionnée
                </button>
              </div>
            </div>

            {f.convensionne && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <div className="form-group">
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                      📅 Date début convention
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
                      🏁 Date fin convention
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
                      🔄 Convention Renouvelable
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
                      🔄 Renouvelable
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${!f.renouvelable ? 'btn-secondary' : 'btn-ghost'}`}
                      onClick={() => s('renouvelable', false)}
                      style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700 }}
                    >
                      🚫 Non
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
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '💾 Enregistrer la fiche'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de Calcul Rapide & Bilan Effectif ───────────────────
function QuickBilanModal({ entreprise, onSave, onClose }) {
  const [effectif, setEffectif] = useState(entreprise.effectif_total !== undefined ? entreprise.effectif_total : 0);
  const [faites, setFaites] = useState(entreprise.nb_visites_faites !== undefined ? entreprise.nb_visites_faites : 0);
  const [bilansFaits, setBilansFaits] = useState(entreprise.nb_bilans_faits !== undefined ? entreprise.nb_bilans_faits : 0);
  const [bilansManquants, setBilansManquants] = useState(entreprise.nb_bilans_manquants !== undefined ? entreprise.nb_bilans_manquants : 0);
  const [saving, setSaving] = useState(false);

  const effNum = parseInt(effectif, 10) || 0;
  const faitesNum = parseInt(faites, 10) || 0;
  const aFaire = Math.max(0, effNum - faitesNum);
  const taux = effNum > 0 ? Math.min(100, Math.round((faitesNum / effNum) * 100)) : 0;

  async function handleSave() {
    setSaving(true);
    try {
      await axios.patch(`/api/entreprises/${entreprise.id}/bilan`, {
        effectif_total: parseInt(effectif, 10) || 0,
        nb_visites_faites: parseInt(faites, 10) || 0,
        nb_bilans_faits: parseInt(bilansFaits, 10) || 0,
        nb_bilans_manquants: parseInt(bilansManquants, 10) || 0,
      });
      onSave();
    } catch (e) {
      alert(e.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 800,
                boxShadow: '0 4px 12px rgba(14,165,233,0.3)',
              }}
            >
              ⚡
            </div>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--text)' }}>{entreprise.nom}</h3>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Calculateur instantané des effectifs & visites médicales
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '18px 22px' }}>
          {/* Jauge visuelle et indicateurs */}
          <div
            style={{
              padding: 16,
              background: 'linear-gradient(135deg, #0284c7, #0369a1)',
              borderRadius: 14,
              color: '#fff',
              boxShadow: '0 8px 20px rgba(2,132,199,.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.95 }}>Taux de réalisation des visites</span>
              <span style={{ fontSize: 14, fontWeight: 900, background: 'rgba(255,255,255,0.25)', padding: '2px 10px', borderRadius: 12 }}>
                {taux}%
              </span>
            </div>
            {/* Barre animée */}
            <div style={{ height: 8, background: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ width: `${taux}%`, height: '100%', background: taux >= 100 ? '#4ade80' : '#38bdf8', transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.18)', padding: '8px 4px', borderRadius: 10 }}>
                <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 600 }}>Effectif total</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{effNum}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.18)', padding: '8px 4px', borderRadius: 10 }}>
                <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 600 }}>Déjà fait</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{faitesNum}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.18)', padding: '8px 4px', borderRadius: 10 }}>
                <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 600 }}>En attente</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2, color: aFaire > 0 ? '#fef08a' : '#86efac' }}>
                  {aFaire}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                <span>👥 Effectif total de salariés</span>
                <span style={{ color: '#0284c7', fontSize: 11, fontWeight: 600 }}>Ajustement rapide</span>
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

            <div className="form-group">
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                <span>🩺 Effectif ayant fait sa visite</span>
                <span style={{ color: '#16a34a', fontSize: 11, fontWeight: 600 }}>Incrémentation</span>
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
                <label style={{ fontSize: 12, fontWeight: 700 }}>🧪 Bilans médicaux faits</label>
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
                <label style={{ fontSize: 12, fontWeight: 700 }}>⚠️ Bilans manquants</label>
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
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '8px 22px' }}>
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '💾 Enregistrer les chiffres'}
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

  const TYPE_LABELS = { avis: '💬 Avis', remarque: '⚠️ Remarque', suggestion: '💡 Suggestion' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480, borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontWeight: 800 }}>{editAvis ? '✏️ Modifier l\'avis' : '➕ Partager votre avis'}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, marginBottom: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>🏢 {entreprise.nom}</div>
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
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '📨 Publier l\'avis'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Entreprise detail panel ───────────────────────────────────
function EntrepriseDetail({ entreprise, onClose, onEdit, onQuickBilan, onDelete, toast }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrateur';
  const [avis, setAvis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAvis, setShowAvis] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  useEffect(() => {
    loadAvis();
  }, [entreprise.id]);

  async function loadAvis() {
    try {
      const { data } = await axios.get(`/api/entreprises/${entreprise.id}/avis`);
      setAvis(data);
    } catch {
      toast?.('Erreur chargement avis', 'error');
    } finally {
      setLoading(false);
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

  const effectif = parseInt(entreprise.effectif_total, 10) || 0;
  const faites = parseInt(entreprise.nb_visites_faites, 10) || 0;
  const aFaire = Math.max(0, effectif - faites);
  const taux = effectif > 0 ? Math.min(100, Math.round((faites / effectif) * 100)) : 0;

  const avgNote = avis.filter((a) => a.note > 0).length
    ? (avis.filter((a) => a.note > 0).reduce((s, a) => s + a.note, 0) / avis.filter((a) => a.note > 0).length).toFixed(1)
    : null;

  const TYPE_COLORS = { avis: '#0ea5e9', remarque: '#f59e0b', suggestion: '#10b981' };
  const TYPE_LABELS = { avis: '💬 Avis', remarque: '⚠️ Remarque', suggestion: '💡 Suggestion' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)' }}>{entreprise.nom}</h2>
              <span className={`badge ${entreprise.convensionne ? 'badge-green' : 'badge-red'}`}>
                {entreprise.convensionne ? '✅ Conventionnée' : '❌ Non conventionnée'}
              </span>
            </div>
            {entreprise.secteur && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>🏷 {entreprise.secteur}</div>}
            {avgNote && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Stars value={Math.round(avgNote)} size={14} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--warn)' }}>{avgNote} / 5</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}> ({avis.filter((a) => a.note > 0).length} avis)</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isAdmin && (
              <button className="btn btn-primary btn-sm" onClick={onQuickBilan} title="Calculateur rapide" style={{ fontWeight: 700 }}>
                ⚡ Calculateur / Bilan
              </button>
            )}
            {isAdmin && <button className="btn btn-outline btn-sm" onClick={onEdit}>✏️ Modifier</button>}
            {isAdmin && <button className="btn btn-danger btn-sm" onClick={onDelete}>🗑</button>}
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Fermer</button>
          </div>
        </div>

        {/* Section Convention & Validité */}
        <div
          style={{
            marginTop: 14,
            padding: '12px 18px',
            background: entreprise.convensionne
              ? 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.04))'
              : 'var(--surface2)',
            borderRadius: 12,
            border: `1.5px solid ${entreprise.convensionne ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 20 }}>📜</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                {entreprise.convensionne ? 'Convention de Médecine du Travail' : 'Entreprise Non Conventionnée'}
              </div>
              {entreprise.convensionne ? (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>
                    📅 Période : <strong>{formatConventionRange(entreprise.date_debut_convention, entreprise.date_fin_convention)}</strong>
                  </span>
                  <span>•</span>
                  <span style={{ fontWeight: 700, color: entreprise.renouvelable ? '#059669' : '#64748b' }}>
                    {entreprise.renouvelable ? '🔄 Renouvelable (Tacite reconduction)' : '🚫 Non renouvelable'}
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

        {/* Section Chiffres & Bilan Médical */}
        <div
          style={{
            marginTop: 16,
            padding: '16px 20px',
            background: 'var(--surface2)',
            borderRadius: 14,
            border: '1.5px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>
              📊 Suivi Médical & Taux de Couverture Salariés
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
              <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>👥 Effectif Total</div>
              <div style={{ fontSize: 17, fontWeight: 900, marginTop: 2 }}>{effectif}</div>
            </div>
            <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>🩺 Déjà Visité</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: '#16a34a', marginTop: 2 }}>{faites}</div>
            </div>
            <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>⏳ En Attente (À Faire)</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: aFaire > 0 ? '#ea580c' : '#16a34a', marginTop: 2 }}>{aFaire}</div>
            </div>
            <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>🧪 Bilans Faits</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: '#0ea5e9', marginTop: 2 }}>{entreprise.nb_bilans_faits || 0}</div>
            </div>
            <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>⚠️ Bilans Manquants</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: (entreprise.nb_bilans_manquants || 0) > 0 ? '#dc2626' : '#16a34a', marginTop: 2 }}>
                {entreprise.nb_bilans_manquants || 0}
              </div>
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {entreprise.adresse && <NavigationSelector addr={entreprise.adresse} />}
          {entreprise.telephone && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>📞 {entreprise.telephone}</span>}
          {entreprise.email && (
            <a href={`mailto:${entreprise.email}`} style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
              ✉️ {entreprise.email}
            </a>
          )}
          {entreprise.site_web && (
            <a href={entreprise.site_web} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
              🌐 Site web
            </a>
          )}
        </div>
        {entreprise.description && (
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 10, lineHeight: 1.5 }}>
            {entreprise.description}
          </p>
        )}
      </div>

      {/* Avis section */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800 }}>
            <span>Avis & Remarques</span>
            <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 500, marginLeft: 8 }}>({avis.length})</span>
          </h3>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAvis('new')} style={{ fontWeight: 700 }}>
            ➕ Donner mon avis
          </button>
        </div>

        {loading && <div className="loading-center"><div className="spinner" /></div>}
        {!loading && avis.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
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
                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }} onClick={() => setShowAvis(a)}>✏️</button>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', color: 'var(--danger)' }} onClick={() => setConfirmDel(a.id)}>🗑</button>
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
      {confirmDel && (
        <ConfirmDialog
          title="Supprimer l'avis?"
          message="Action irréversible."
          danger
          onConfirm={() => handleDeleteAvis(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function Entreprises({ toast }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrateur';

  const [entreprises, setEntreprises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterConv, setFilterConv] = useState('all');
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [quickBilan, setQuickBilan] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'table' | 'map'
  const [dateFilter, setDateFilter] = useState('');

  async function load() {
    try {
      const { data } = await axios.get('/api/entreprises');
      setEntreprises(data);
    } catch {
      toast?.('Erreur chargement', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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
      const matchSearch = !q || `${e.nom} ${e.secteur || ''} ${e.adresse || ''}`.toLowerCase().includes(q);
      const matchConv = filterConv === 'all' || (filterConv === 'conv' ? e.convensionne : !e.convensionne);
      let matchDate = true;
      if (dateFilter) {
        const itemDate = e.created_at ? String(e.created_at).slice(0, 10) : '';
        const dDebut = e.date_debut_convention ? String(e.date_debut_convention).slice(0, 10) : '';
        const dFin = e.date_fin_convention ? String(e.date_fin_convention).slice(0, 10) : '';
        if (itemDate !== dateFilter && dDebut !== dateFilter && dFin !== dateFilter) {
          matchDate = false;
        }
      }
      return matchSearch && matchConv && matchDate;
    });
  }, [entreprises, search, filterConv, dateFilter]);

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
    return {
      nom: e.nom || '—',
      secteur: e.secteur || '—',
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
  });

  const exportColumns = [
    { header: 'Entreprise', key: 'nom' },
    { header: 'Secteur', key: 'secteur' },
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
      <div style={{ height: '100%', overflow: 'hidden' }}>
        <EntrepriseDetail
          entreprise={ent}
          toast={toast}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setModal(ent);
            setSelected(null);
          }}
          onQuickBilan={() => {
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
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>• Tableau de bord exécutif</span>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5, margin: 0, wordBreak: 'break-word' }}>
            🏢 Entreprises Conventionnées
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, margin: 0 }}>
            Effectifs salariés, calcul automatique des visites médicales et suivi analytique des bilans de santé.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Export group */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={handleExportExcel}
              title="Exporter les entreprises et effectifs au format Excel (.xlsx)"
              style={{ fontWeight: 700, fontSize: 12, padding: '7px 12px', borderRadius: 8 }}
            >
              📊 Excel
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={handleExportWord}
              title="Exporter le récapitulatif officiel au format Word (.doc)"
              style={{ fontWeight: 700, fontSize: 12, padding: '7px 12px', borderRadius: 8 }}
            >
              📝 Word
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={handleExportPDF}
              title="Exporter le rapport complet au format PDF (.pdf)"
              style={{ fontWeight: 700, fontSize: 12, padding: '7px 12px', borderRadius: 8 }}
            >
              📄 PDF
            </button>
          </div>

          {isAdmin && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setModal({})}
              style={{
                fontWeight: 800,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 10,
                boxShadow: '0 4px 14px rgba(14,165,233,.35)',
              }}
            >
              <span>➕</span> + Ajouter
            </button>
          )}
        </div>
      </div>

      {/* ── CARTES KPI ANALYTICS GRID ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {/* Card 1: Total Entreprises */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '14px 16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Entreprises
            </span>
            <span style={{ fontSize: 16 }}>🏢</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#0284c7' }}>{stats.total}</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Total</span>
          </div>
        </div>

        {/* Card 2: Conventionnées */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '14px 16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Conventionnées
            </span>
            <span style={{ fontSize: 16 }}>🤝</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#10b981' }}>{stats.conv}</span>
            <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>
              {stats.total > 0 ? Math.round((stats.conv / stats.total) * 100) : 0}% du parc
            </span>
          </div>
        </div>

        {/* Card 3: Effectif Global */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(14,165,233,0.08), rgba(2,132,199,0.03))',
            border: '1.5px solid rgba(14,165,233,0.35)',
            borderRadius: 14,
            padding: '14px 16px',
            boxShadow: '0 3px 10px rgba(14,165,233,0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#0284c7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Effectif Global
            </span>
            <span style={{ fontSize: 16 }}>👥</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#0284c7' }}>{totalEffectif}</span>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Salariés</span>
          </div>
        </div>

        {/* Card 4: Visites Faites */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(22,163,74,0.08), rgba(16,185,129,0.03))',
            border: '1.5px solid rgba(22,163,74,0.35)',
            borderRadius: 14,
            padding: '14px 16px',
            boxShadow: '0 3px 10px rgba(22,163,74,0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Visites Faites
            </span>
            <span style={{ fontSize: 16 }}>🩺</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#16a34a' }}>{totalVisitesFaites}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#166534', background: '#dcfce7', padding: '1px 6px', borderRadius: 6 }}>
              {globalTaux}%
            </span>
          </div>
        </div>

        {/* Card 5: Visites à Faire */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(234,88,12,0.08), rgba(249,115,22,0.03))',
            border: '1.5px solid rgba(234,88,12,0.35)',
            borderRadius: 14,
            padding: '14px 16px',
            boxShadow: '0 3px 10px rgba(234,88,12,0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#ea580c', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Visites à Faire
            </span>
            <span style={{ fontSize: 16 }}>⏳</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#ea580c' }}>{totalVisitesAFaire}</span>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Restantes</span>
          </div>
        </div>

        {/* Card 6: Bilans Faits */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '14px 16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Bilans Faits
            </span>
            <span style={{ fontSize: 16 }}>🧪</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#0ea5e9' }}>{totalBilansFaits}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Bilans</span>
          </div>
        </div>

        {/* Card 7: Bilans Manquants */}
        <div
          style={{
            background: totalBilansManquants > 0 ? 'linear-gradient(135deg, rgba(220,38,38,0.08), rgba(239,68,68,0.03))' : 'var(--surface)',
            border: totalBilansManquants > 0 ? '1.5px solid rgba(220,38,38,0.4)' : '1px solid var(--border)',
            borderRadius: 14,
            padding: '14px 16px',
            boxShadow: '0 2px 8px rgba(220,38,38,0.04)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: totalBilansManquants > 0 ? '#dc2626' : 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Bilans Manquants
            </span>
            <span style={{ fontSize: 16 }}>⚠️</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: totalBilansManquants > 0 ? '#dc2626' : '#16a34a' }}>
              {totalBilansManquants}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>En attente</span>
          </div>
        </div>

        {/* Card 8: Avis partagés */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '14px 16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Avis partagés
            </span>
            <span style={{ fontSize: 16 }}>💬</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: '#f59e0b' }}>{stats.avis}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Retours</span>
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
            style={{ width: '100%', paddingLeft: 38, height: 40, fontSize: 13, borderRadius: 10 }}
            placeholder="🔍 Rechercher par société, secteur, ville..."
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

        {/* Filtre Convention */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 10, padding: 4, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {[
            ['all', `Toutes (${entreprises.length})`],
            ['conv', 'Conventionnées'],
            ['nonconv', 'Non conv.'],
          ].map(([v, l]) => (
            <button
              key={v}
              className={`btn btn-sm ${filterConv === v ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterConv(v)}
              style={{ padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap', fontWeight: filterConv === v ? 800 : 600, borderRadius: 8 }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Filtre par Date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', borderRadius: 10, padding: '4px 8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>📅 Date :</span>
          <input
            type="date"
            className="input"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{ fontSize: 12, padding: '3px 8px', height: 30, borderRadius: 6, width: 'auto' }}
            title="Filtrer par date d'enregistrement ou de convention"
          />
          {dateFilter && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setDateFilter('')}
              style={{ fontSize: 11, padding: '2px 6px', color: 'var(--danger)' }}
              title="Effacer le filtre date"
            >
              ✕
            </button>
          )}
        </div>

        {/* Sélecteur de Vue */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 10, padding: 4, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {[
            ['list', '📋 Liste'],
            ['table', '📊 Calculateur & Suivi'],
            ['map', '🗺️ Carte'],
          ].map(([v, l]) => (
            <button
              key={v}
              className={`btn btn-sm ${viewMode === v ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode(v)}
              style={{ padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap', fontWeight: viewMode === v ? 800 : 600, borderRadius: 8 }}
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
          <div className="empty-icon" style={{ fontSize: 44 }}>🏢</div>
          <h4 style={{ fontWeight: 800, marginTop: 12, fontSize: 16 }}>Aucune entreprise trouvée</h4>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
            Modifiez votre recherche ou ajoutez une nouvelle entreprise conventionnée.
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
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
            <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)', color: 'var(--text)' }}>
                  <th style={{ padding: '14px 18px', fontWeight: 800 }}>Société / Entreprise</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'center' }}>👥 Effectif Total</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'center' }}>🩺 Déjà fait sa visite</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'center' }}>⏳ En attente (Reste à faire)</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, minWidth: 170 }}>Progression Visites</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'center' }}>🧪 Bilans Faits</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'center' }}>⚠️ Bilans Manquants</th>
                  <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const eff = parseInt(e.effectif_total, 10) || 0;
                  const vf = parseInt(e.nb_visites_faites, 10) || 0;
                  const aFaire = Math.max(0, eff - vf);
                  const tx = eff > 0 ? Math.min(100, Math.round((vf / eff) * 100)) : 0;
                  const bf = parseInt(e.nb_bilans_faits, 10) || 0;
                  const bm = parseInt(e.nb_bilans_manquants, 10) || 0;

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
                        <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: 14 }}>{e.nom}</div>
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
                          {e.convensionne && (e.date_debut_convention || e.date_fin_convention) && (
                            <>
                              <span>•</span>
                              <span style={{ fontSize: 10.5, color: 'var(--text-2)', fontWeight: 600 }}>
                                📅 {formatConventionRange(e.date_debut_convention, e.date_fin_convention)}
                              </span>
                            </>
                          )}
                          {e.convensionne && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: e.renouvelable ? '#059669' : '#64748b' }}>
                              {e.renouvelable ? '🔄 Renouvelable' : '🚫 Non renouv.'}
                            </span>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '14px 18px', textAlign: 'center', fontWeight: 900, fontSize: 15 }}>
                        <span style={{ background: 'rgba(14,165,233,0.1)', color: '#0284c7', padding: '4px 10px', borderRadius: 8 }}>
                          {eff}
                        </span>
                      </td>

                      <td style={{ padding: '14px 18px', textAlign: 'center', fontWeight: 900, color: '#16a34a', fontSize: 15 }}>
                        <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: 8 }}>
                          {vf}
                        </span>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                          <span>{tx}% complété</span>
                          <span style={{ color: 'var(--text-3)' }}>{vf} / {eff}</span>
                        </div>
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

                      <td style={{ padding: '14px 18px', textAlign: 'center', fontWeight: 800, color: '#0ea5e9', fontSize: 14 }}>
                        {bf}
                      </td>

                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        {bm > 0 ? (
                          <span style={{ padding: '3px 8px', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontWeight: 800, fontSize: 12 }}>
                            ⚠️ {bm}
                          </span>
                        ) : (
                          <span style={{ color: '#16a34a', fontSize: 12, fontWeight: 700 }}>✓ 0</span>
                        )}
                      </td>

                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {isAdmin && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => setQuickBilan(e)}
                              title="Modifier rapidement les effectifs & bilans"
                              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700 }}
                            >
                              ⚡ Calculer
                            </button>
                          )}
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setSelected(e.id)}
                            style={{ padding: '4px 12px', fontSize: 11, fontWeight: 700 }}
                          >
                            Voir détails →
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
      ) : (
        /* ── VUE CARTES GRID PROFESSIONNELLE ── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 350px), 1fr))', gap: 16 }}>
          {filtered.map((e) => {
            const eff = parseInt(e.effectif_total, 10) || 0;
            const vf = parseInt(e.nb_visites_faites, 10) || 0;
            const aFaire = Math.max(0, eff - vf);
            const tx = eff > 0 ? Math.min(100, Math.round((vf / eff) * 100)) : 0;

            return (
              <div
                key={e.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  transition: 'box-shadow .2s ease, transform .15s ease',
                  borderTop: `4px solid ${e.convensionne ? '#10b981' : '#ef4444'}`,
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
                      <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)', marginBottom: 2 }}>{e.nom}</div>
                      {e.secteur && <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>🏷 {e.secteur}</div>}
                    </div>
                    <span className={`badge ${e.convensionne ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10, flexShrink: 0 }}>
                      {e.convensionne ? '✅ Conv.' : '❌ Non'}
                    </span>
                  </div>

                  {e.convensionne && (
                    <div
                      style={{
                        margin: '2px 0 8px 0',
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: 'rgba(16,185,129,0.08)',
                        border: '1px solid rgba(16,185,129,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        color: '#065f46',
                        flexWrap: 'wrap',
                        gap: 4,
                      }}
                    >
                      <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>📅</span>
                        <span>{formatConventionRange(e.date_debut_convention, e.date_fin_convention)}</span>
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 10,
                          background: e.renouvelable ? '#d1fae5' : '#f1f5f9',
                          color: e.renouvelable ? '#065f46' : '#64748b',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        {e.renouvelable ? '🔄 Renouvelable' : '🚫 Non renouv.'}
                      </span>
                    </div>
                  )}

                  {/* ── Widget 3 Indicateurs Effectifs & Formule Directe ── */}
                  <div
                    style={{
                      padding: '12px 14px',
                      background: 'var(--surface2)',
                      borderRadius: 12,
                      margin: '12px 0',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, textAlign: 'center', marginBottom: 10 }}>
                      <div style={{ background: 'var(--surface)', padding: '6px 4px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700 }}>👥 Effectif</div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: '#0284c7', marginTop: 1 }}>{eff}</div>
                      </div>
                      <div style={{ background: 'var(--surface)', padding: '6px 4px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>🩺 Déjà fait</div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: '#16a34a', marginTop: 1 }}>{vf}</div>
                      </div>
                      <div style={{ background: 'var(--surface)', padding: '6px 4px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, color: aFaire > 0 ? '#ea580c' : '#16a34a', fontWeight: 700 }}>⏳ En attente</div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: aFaire > 0 ? '#ea580c' : '#16a34a', marginTop: 1 }}>{aFaire}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-2)' }}>Taux de réalisation :</span>
                      <span style={{ color: tx >= 100 ? '#16a34a' : '#0284c7' }}>{tx}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${tx}%`, height: '100%', background: tx >= 100 ? '#22c55e' : '#0ea5e9' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: 'var(--text-3)', fontSize: 11 }}>
                      <span>🧪 Bilans faits: <strong>{e.nb_bilans_faits || 0}</strong></span>
                      <span style={{ color: (e.nb_bilans_manquants || 0) > 0 ? '#dc2626' : 'inherit', fontWeight: (e.nb_bilans_manquants || 0) > 0 ? 800 : 400 }}>
                        ⚠️ Manquants: {e.nb_bilans_manquants || 0}
                      </span>
                    </div>
                  </div>

                  {e.adresse && (
                    <div style={{ marginBottom: 6 }}>
                      <NavigationSelector addr={e.adresse} compact />
                    </div>
                  )}
                  {e.telephone && <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>📞 {e.telephone}</div>}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>💬 {e.nb_avis || 0} avis</span>
                    {e.note_moyenne > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }}>
                        <Stars value={Math.round(e.note_moyenne)} size={12} />
                        <span style={{ color: 'var(--warn)', fontWeight: 700 }}>{e.note_moyenne}</span>
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {isAdmin && (
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={(evt) => {
                          evt.stopPropagation();
                          setQuickBilan(e);
                        }}
                        title="Calculateur rapide des effectifs"
                        style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700 }}
                      >
                        ⚡ Modifier effectifs
                      </button>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 800 }}>Voir détails →</span>
                  </div>
                </div>
              </div>
            );
          })}
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

      {confirm && !selected && (
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
