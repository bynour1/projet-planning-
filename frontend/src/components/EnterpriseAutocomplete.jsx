import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

let cachedEntreprises = null;
let cachedPromise = null;

function fetchEntreprises() {
  if (cachedEntreprises) return Promise.resolve(cachedEntreprises);
  if (cachedPromise) return cachedPromise;
  cachedPromise = Promise.resolve()
    .then(() => axios.get('/api/entreprises'))
    .then(r => {
      cachedEntreprises = r?.data || [];
      return cachedEntreprises;
    })
    .catch(() => {
      cachedPromise = null;
      return [];
    });
  return cachedPromise;
}

export default function EnterpriseAutocomplete({
  value = '',
  onChange,
  onSelect,
  entreprises = [],
  placeholder = "Rechercher ou saisir l'entreprise conventionnée...",
  required = false,
  style = {},
  className = 'input',
  autoFocus = false,
}) {
  const [query, setQuery] = useState(value || '');
  const [allEnts, setAllEnts] = useState(entreprises || []);
  const [filtered, setFiltered] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    if (entreprises && entreprises.length > 0) {
      setAllEnts(entreprises);
    } else {
      fetchEntreprises().then(data => setAllEnts(data || []));
    }
  }, [entreprises]);

  useEffect(() => {
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      setFiltered(allEnts.slice(0, 10));
      return;
    }
    const matches = allEnts.filter(e => {
      const nom = (e.nom || '').toLowerCase();
      const code = (e.code || '').toLowerCase();
      const secteur = (e.secteur || '').toLowerCase();
      const adresse = (e.adresse || '').toLowerCase();
      return nom.includes(q) || code.includes(q) || secteur.includes(q) || adresse.includes(q);
    });
    setFiltered(matches.slice(0, 12));
  }, [query, allEnts]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);
    setHighlightIndex(-1);
    if (onChange) onChange(val);

    const exact = allEnts.find(ent => ent.nom?.toLowerCase()?.trim() === val.toLowerCase()?.trim());
    if (exact && onSelect) {
      onSelect(exact);
    }
  };

  const handleSelect = (ent) => {
    setQuery(ent.nom);
    setIsOpen(false);
    if (onChange) onChange(ent.nom);
    if (onSelect) onSelect(ent);
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        e.preventDefault();
        handleSelect(filtered[highlightIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} style={{position: 'relative', width: '100%', ...style}}>
      <div style={{position: 'relative', display: 'flex', alignItems: 'center'}}>
        <span style={{
          position: 'absolute',
          left: 10,
          color: 'var(--text-3)',
          fontSize: 14,
          pointerEvents: 'none',
          zIndex: 1,
        }}>
          🏴
        </span>

        <input
          ref={inputRef}
          type="text"
          className={className}
          style={{
            paddingLeft: 34,
            paddingRight: query ? 28 : 10,
            width: '100%',
            fontWeight: 600,
          }}
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              if (onChange) onChange('');
              setIsOpen(true);
              inputRef.current?.focus();
            }}
            style={{
              position: 'absolute',
              right: 8,
              background: 'none',
              border: 'none',
              color: 'var(--text-3)',
              cursor: 'pointer',
              fontSize: 13,
              padding: '2px 4px',
            }}
            title="EFfacer"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          zIndex: 1100,
          maxHeight: 250,
          overflowY: 'auto',
        }}>
          <div style={{
            padding: '6px 12px',
            fontSize: 10.5,
            fontWeight: 800,
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface2)',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span>Entreprises conventionnées ({filtered.length})</span>
            <span>Sélectionner & insérer l'adresse</span>
          </div>

          {filtered.map((ent, idx) => {
            const isHighlighted = idx === highlightIndex;
            return (
              <div
                key={ent.id || idx}
                onClick={() => handleSelect(ent)}
                onMouseEnter={() => setHighlightIndex(idx)}
                style={{
                  padding: '9px 12px',
                  cursor: 'pointer',
                  background: isHighlighted ? 'var(--primary-lt)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.1s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {ent.code && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 800,
                        background: '#e0f2fe',
                        color: '#0369a1',
                        padding: '1px 5px',
                        borderRadius: 4,
                      }}>
                        {ent.code}
                      </span>
                    )}
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                      {ent.nom}
                    </span>
                    {ent.secteur && (
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        · {ent.secteur}
                      </span>
                    )}
                  </div>
                  {ent.adresse && (
                    <div style={{ fontSize: 11.5, color: '#0284c7', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>📍</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ent.adresse}
                      </span>
                    </div>
                  )}
                </div>

                <span style={{
                  fontSize: 11,
                  color: isHighlighted ? 'var(--primary)' : 'var(--text-3)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}>
                  Choisir ↵
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}