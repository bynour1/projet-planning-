import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const handleCustom = () => setOpen(true);
    
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-global-search', handleCustom);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-global-search', handleCustom);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const { data } = await axios.get(`/api/search?q=${encodeURIComponent(query)}`);
        setResults(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)} style={{ alignItems: 'flex-start', paddingTop: '10vh' }}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--text-3)', flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            autoFocus
            className="input"
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, padding: 0 }}
            placeholder="Rechercher interventions, entreprises, utilisateurs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} style={{ fontSize: 12 }}>✕</button>
        </div>
        
        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: 16 }}>
          {loading && <div className="loading-center" style={{ height: 100 }}><div className="spinner" /></div>}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="empty-state" style={{ padding: 24 }}>Aucun résultat pour "{query}"</div>
          )}
          {!loading && results.map((group, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                {group.type === 'intervention' && (
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                )}
                {group.type === 'entreprise' && (
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                )}
                {group.type === 'user' && (
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )}
                <span>{group.type === 'intervention' ? 'Interventions' : group.type === 'entreprise' ? 'Entreprises' : 'Utilisateurs'}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {group.items.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 12
                    }}
                    onClick={() => {
                      setOpen(false);
                      if (group.type === 'intervention') navigate('/planning');
                      else if (group.type === 'entreprise') navigate('/entreprises');
                      else navigate('/users');
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-lt)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface2)'}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.subtitle}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
