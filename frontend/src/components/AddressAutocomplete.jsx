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

  /* ── Charger entreprises BDD (mode par défaut) ── */
  useEffect(() => {
    if (searchLocation) return;
    try {
      const p = axios.get('/api/entreprises');
      if (p && typeof p.then === 'function') {
        p.then(r => setAllEntreprises(r?.data || [])).catch(() => setAllEntreprises([]));
      }
    } catch {}
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
    if (cls === 'amenity' && type === 'hospital')  return '🏥';
    if (cls === 'amenity' && type === 'pharmacy')  return '💊';
    if (cls === 'amenity' && type === 'school')    return '🏫';
    if (cls === 'amenity' && type === 'university')return '🎓';
    if (cls === 'amenity' && type === 'clinic')    return '🏥';
    if (cls === 'amenity' && type === 'bank')      return '🏦';
    if (cls === 'amenity' && type === 'restaurant')return '🍽️';
    if (cls === 'building')                        return '🏢';
    if (cls === 'highway' || cls === 'place')      return '📍';
    if (cls === 'office')                          return '🏢';
    return '📌';
  }

  function convBadge(ent) {
    return ent.convensionne
      ? { bg: '#dcfce7', color: '#15803d', label: '✅ Conv.' }
      : { bg: '#fee2e2', color: '#b91c1c', label: '❌ Non' };
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>

      {/* ── Champ de saisie ── */}
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', left: 11, top: '50%',
          transform: 'translateY(-50%)', fontSize: 14,
          pointerEvents: 'none', zIndex: 1,
        }}>
          {loading
            ? <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
            : searchLocation ? '🔍' : '📍'
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
            🗺️ Lieux trouvés sur OpenStreetMap
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
                    <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📍 {restAddr}
                    </div>
                  </div>

                  <span style={{ color: 'var(--primary)', fontSize: 12, opacity: 0.5, flexShrink: 0 }}>↗</span>
                </li>
              );
            })}
          </ul>

          <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)', background: 'var(--surface2,#f9fafb)' }}>
            💡 Sélectionnez un lieu pour remplir l'adresse automatiquement
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
            🏢 Entreprises correspondantes
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
                      ? <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {ent.adresse}</div>
                      : <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucune adresse enregistrée</div>
                    }
                  </div>
                  <span style={{ color: 'var(--primary)', fontSize: 12, opacity: 0.6, flexShrink: 0 }}>↗</span>
                </li>
              );
            })}
          </ul>
          <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)', background: 'var(--surface2,#f9fafb)' }}>
            💡 Ou continuez à taper pour saisir une adresse manuellement
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
