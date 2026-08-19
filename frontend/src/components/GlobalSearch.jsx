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
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 20, marginRight: 12 }}>🔍</span>
          <input
            autoFocus
            className="input"
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, padding: 0 }}
            placeholder="Rechercher interventions, entreprises, utilisateurs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Echap</button>
        </div>
        
        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: 16 }}>
          {loading && <div className="loading-center" style={{ height: 100 }}><div className="spinner" /></div>}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="empty-state" style={{ padding: 24 }}>Aucun résultat pour "{query}"</div>
          )}
          {!loading && results.map((group, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>
                {group.type === 'intervention' ? '📋 Interventions' : group.type === 'entreprise' ? '🏢 Entreprises' : '👥 Utilisateurs'}
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
