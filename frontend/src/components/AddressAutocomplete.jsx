import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

/**
 * AddressAutocomplete
 *
 * Props :
 *  - value          : string
 *  - onChange       : fn(str)
 *  - placeholder    : string
 *  - required       : bool
 *  - style          : obj
 *  - className      : string
 *  - searchLocation : bool  — si true, cherche les lieux via Nominatim (OpenStreetMap)
 *                             sinon, cherche dans les entreprises de la BDD
 */
// Shared in-memory cache to avoid duplicate API requests across autocomplete instances
let cachedEntreprises = null;
let cachedEntreprisesPromise = null;

function getCachedEntreprises() {
  if (cachedEntreprises) return Promise.resolve(cachedEntreprises);
  if (cachedEntreprisesPromise) return cachedEntreprisesPromise;
  try {
    cachedEntreprisesPromise = axios.get('/api/entreprises')
      .then(r => {
        cachedEntreprises = r?.data || [];
        return cachedEntreprises;
      })
      .catch(() => {
        cachedEntreprisesPromise = null;
        return [];
      });
    return cachedEntreprisesPromise;
  } catch {
    return Promise.resolve([]);
  }
}

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  required = false,
  style = {},
  className = 'input',
  searchLocation = false,
}) {
  const defaultPlaceholder = searchLocation
    ? 'Rechercher un lieu (ex: iset rades, hôpital tunis...)'
    : 'Adresse ou nom d\'entreprise...';

  const [query,          setQuery]          = useState(value || '');
  const [suggestions,    setSuggestions]    = useState([]);
  const [showSugg,       setShowSugg]       = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [allEntreprises, setAllEntreprises] = useState([]);

  const inputRef    = useRef(null);
  const wrapperRef  = useRef(null);
  const debounceRef = useRef(null);

  /* ── Charger entreprises BDD (mode par défaut avec cache) ── */
  useEffect(() => {
    if (searchLocation) return;
    getCachedEntreprises().then(data => {
      setAllEntreprises(data || []);
    });
  }, [searchLocation]);

  /* ── Sync value → query ── */
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  /* ── Saisie ── */
  function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    onChange(q);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.trim().length < 2) {
      setSuggestions([]);
      setShowSugg(false);
      return;
    }

    if (searchLocation) {
      // Recherche Nominatim (OpenStreetMap)
      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?` +
            `q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6`,
            { headers: { 'Accept-Language': 'fr' } }
          );
          const data = await res.json();
          setSuggestions(data);
          setShowSugg(data.length > 0);
        } catch {
          setSuggestions([]);
        } finally {
          setLoading(false);
        }
      }, 400);
    } else {
      // Recherche dans les entreprises BDD
      debounceRef.current = setTimeout(() => {
        const qLow = q.toLowerCase();
        const results = allEntreprises.filter(ent =>
          ent.nom?.toLowerCase().includes(qLow) ||
          ent.secteur?.toLowerCase().includes(qLow) ||
          ent.adresse?.toLowerCase().includes(qLow)
        ).slice(0, 6);
        setSuggestions(results);
        setShowSugg(results.length > 0);
      }, 200);
    }
  }

  /* ── Sélection d'un lieu Nominatim ── */
  function selectLocation(item) {
    const addr = item.display_name;
    setQuery(addr);
    onChange(addr);
    setSuggestions([]);
    setShowSugg(false);
  }

  /* ── Sélection d'une entreprise BDD ── */
  function selectEntreprise(ent) {
    const addr = ent.adresse || ent.nom;
    setQuery(addr);
    onChange(addr);
    setSuggestions([]);
    setShowSugg(false);
  }

  /* ── Fermer si clic extérieur ── */
  useEffect(() => {
    function onClickOut(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowSugg(false);
      }
    }
    document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, []);

  /* ── Icône type de lieu Nominatim ── */
  function getLocationIcon(item) {
    const cls  = item.class || '';
    const type = item.type  || '';
    if (cls === 'amenity' && (type === 'hospital' || type === 'clinic')) {
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M12 8v8M8 12h8"></path></svg>;
    }
    if (cls === 'amenity' && type === 'pharmacy') {
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20"></path></svg>;
    }
    if (cls === 'building' || cls === 'office') {
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2"></rect><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"></path></svg>;
    }
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>;
  }

  function convBadge(ent) {
    return ent.convensionne
      ? { bg: '#dcfce7', color: '#15803d', label: 'Conv.' }
      : { bg: '#fee2e2', color: '#b91c1c', label: 'Non conv.' };
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>

      {/* ── Champ de saisie ── */}
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', left: 11, top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none', zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-3)',
        }}>
          {loading
            ? <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            : searchLocation ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            )
          }
        </span>

        <input
          ref={inputRef}
          type="text"
          className={className}
          placeholder={placeholder || defaultPlaceholder}
          value={query}
          required={required}
          onChange={handleInput}
          onFocus={() => { if (suggestions.length > 0) setShowSugg(true); }}
          style={{ paddingLeft: 34, paddingRight: query ? 30 : 12, ...style }}
          autoComplete="off"
        />

        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); onChange(''); setSuggestions([]); setShowSugg(false); inputRef.current?.focus(); }}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 14, padding: 2 }}
            title="Effacer"
          >✕</button>
        )}
      </div>

      {/* ══════════════════════════════════════════
          MODE searchLocation : résultats Nominatim
      ══════════════════════════════════════════ */}
      {searchLocation && showSugg && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,.15)',
          zIndex: 10000, overflow: 'hidden',
        }}>
          {/* En-tête */}
          <div style={{ padding: '7px 12px', background: 'linear-gradient(90deg,#0ea5e9,#10b981)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>
            <span>Lieux trouvés sur OpenStreetMap</span>
          </div>

          <ul style={{ listStyle: 'none', padding: '4px 6px', margin: 0, maxHeight: 280, overflowY: 'auto' }}>
            {suggestions.map((item, i) => {
              // Nom court = 1ère partie avant la virgule
              const shortName = item.display_name.split(',')[0];
              const restAddr  = item.display_name.split(',').slice(1).join(',').trim();
              return (
                <li
                  key={i}
                  onMouseDown={() => selectLocation(item)}
                  style={{
                    padding: '9px 10px', cursor: 'pointer', borderRadius: 7,
                    transition: 'background .1s',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2,#f4f4f5)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Icône */}
                  <div style={{
                    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                    background: '#e0f2fe', color: '#0284c7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 17,
                  }}>
                    {getLocationIcon(item)}
                  </div>

                  {/* Texte */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {shortName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                      <span>{restAddr}</span>
                    </div>
                  </div>

                  <span style={{ color: 'var(--primary)', fontSize: 12, opacity: 0.5, flexShrink: 0 }}>↗</span>
                </li>
              );
            })}
          </ul>

          <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)', background: 'var(--surface2,#f9fafb)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            <span>Sélectionnez un lieu pour remplir l'adresse automatiquement</span>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODE BDD : suggestions entreprises
      ══════════════════════════════════════════ */}
      {!searchLocation && showSugg && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,.13)',
          zIndex: 10000, overflow: 'hidden',
        }}>
          <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', background: 'var(--surface2,#f9fafb)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2"></rect><path d="M9 22v-4h6v4"></path></svg>
            <span>Entreprises correspondantes</span>
          </div>
          <ul style={{ listStyle: 'none', padding: '4px 6px', margin: 0, maxHeight: 240, overflowY: 'auto' }}>
            {suggestions.map(ent => {
              const badge = convBadge(ent);
              return (
                <li key={ent.id}
                  onMouseDown={() => selectEntreprise(ent)}
                  style={{ padding: '8px 8px', cursor: 'pointer', borderRadius: 7, transition: 'background .1s', display: 'flex', gap: 10, alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2,#f4f4f5)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: 'var(--primary-lt,#e0f2fe)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>
                    {ent.nom?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ent.nom}</span>
                      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 8, background: badge.bg, color: badge.color, fontWeight: 700, flexShrink: 0 }}>{badge.label}</span>
                    </div>
                    {ent.adresse
                      ? <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                          <span>{ent.adresse}</span>
                        </div>
                      : <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucune adresse enregistrée</div>
                    }
                  </div>
                  <span style={{ color: 'var(--primary)', fontSize: 12, opacity: 0.6, flexShrink: 0 }}>↗</span>
                </li>
              );
            })}
          </ul>
          <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)', background: 'var(--surface2,#f9fafb)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            <span>Ou continuez à taper pour saisir une adresse manuellement</span>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
