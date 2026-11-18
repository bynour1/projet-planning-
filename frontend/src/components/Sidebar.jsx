import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../hooks/useTheme';
import PWAInstallBanner from './PWAInstallBanner';

const ICONS = {
  dashboard: (
    <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  users: (
    <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  planning: (
    <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  clino: (
    <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 17a2 2 0 100-4 2 2 0 000 4zm8 0a2 2 0 100-4 2 2 0 000 4z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9l2-4h10l3 4h3a1 1 0 011 1v6a1 1 0 01-1 1h-1a3 3 0 01-6 0H10a3 3 0 01-6 0H3a1 1 0 01-1-1v-6a1 1 0 011-1h1z" />
    </svg>
  ),
  chat: (
    <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  entreprises: (
    <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  settings: (
    <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

function roleColor(role) {
  if (role === 'administrateur') return 'avatar-blue';
  if (role === 'medecin')        return 'avatar-green';
  if (role === 'chauffeur')      return 'avatar-orange';
  if (role === 'hse')            return 'avatar-amber';
  return 'avatar-purple';
}
function getInitials(nom, prenom) {
  return `${(prenom?.[0]||'').toUpperCase()}${(nom?.[0]||'').toUpperCase()}`;
}

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const { user, logout }  = useAuth();
  const { onlineUsers }   = useSocket();
  const navigate          = useNavigate();
  const [theme, toggleTheme] = useTheme();
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [user?.avatar]);

  const isAdmin     = user?.role === 'administrateur';
  const isChauffeur = user?.role === 'chauffeur';
  const navClass = ({ isActive }) => `nav-item${isActive ? ' active' : ''}`;

  function handleLinkClick() {
    if (onCloseMobile) onCloseMobile();
  }

  return (
    <>
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={onCloseMobile} />
      )}
      <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}>
        {/* Logo GMT Ariana */}
        <div className="sidebar-logo">
          <img
            src="/logo-gmt.png"
            alt="GMT Ariana"
            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--border)' }}
            onError={e => { e.currentTarget.style.display='none'; }}
          />
          <span>GMT Ariana</span>
          <button className="sidebar-mobile-close" onClick={onCloseMobile} aria-label="Fermer">✕</button>
        </div>

        <nav className="sidebar-nav">
          <button onClick={() => { window.dispatchEvent(new CustomEvent('open-global-search')); handleLinkClick(); }}
            style={{margin:'8px 8px 4px',width:'calc(100% - 16px)',display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:10,cursor:'pointer',color:'var(--text-2)',fontSize:13}}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Rechercher...</span>
            <span style={{marginLeft:'auto',fontSize:11,opacity:.6}}>Ctrl+K</span>
          </button>
          <PWAInstallBanner />
          <span className="nav-section-label">Navigation</span>

        {/* Dashboard — masqué pour chauffeur */}
        {!isChauffeur && (
          <NavLink to="/dashboard" className={navClass} onClick={handleLinkClick}>
            <span className="icon">{ICONS.dashboard}</span> Tableau de bord
          </NavLink>
        )}

        {/* Planning — visible par TOUS */}
        <NavLink to="/planning" className={navClass} onClick={handleLinkClick}>
          <span className="icon">{ICONS.planning}</span> Planning
        </NavLink>

        {/* Clino Mobile — visible par Chauffeur, Médecin, Tech, Admin */}
        <NavLink to="/clino" className={navClass} onClick={handleLinkClick}>
          <span className="icon">{ICONS.clino}</span> Clino Mobile
        </NavLink>

        {/* Pages masquées pour chauffeur */}
        {!isChauffeur && (
          <>
            <NavLink to="/chat" className={navClass} onClick={handleLinkClick}>
              <span className="icon">{ICONS.chat}</span>
              Chat
              {onlineUsers.length > 0 && (
                <span className="badge badge-green" style={{ marginLeft:'auto', fontSize:10 }}>
                  {onlineUsers.length} en ligne
                </span>
              )}
            </NavLink>

            <NavLink to="/entreprises" className={navClass} onClick={handleLinkClick}>
              <span className="icon">{ICONS.entreprises}</span> Entreprises
            </NavLink>


          </>
        )}

        {/* Administration — admin only */}
        {isAdmin && (
          <>
            <span className="nav-section-label">Administration</span>
            <NavLink to="/users" className={navClass} onClick={handleLinkClick}>
              <span className="icon">{ICONS.users}</span> Utilisateurs
            </NavLink>
          </>
        )}

        {/* Settings — visible par TOUS pour configurer Face ID / Empreinte */}
        <span className="nav-section-label">Compte</span>
        <NavLink to="/settings" className={navClass} onClick={handleLinkClick}>
          <span className="icon">{ICONS.settings}</span> Paramètres
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="user-chip">
          {user?.avatar && !imgError ? (
            <img 
              src={user.avatar} 
              alt="Avatar" 
              style={{width:34,height:34,borderRadius:'50%',objectFit:'cover',flexShrink:0,border:'2px solid var(--border)'}} 
              onError={() => setImgError(true)}
            />
          ) : (
            <div className={`avatar ${roleColor(user?.role)}`}>
              {getInitials(user?.nom, user?.prenom)}
            </div>
          )}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {user?.prenom} {user?.nom}
            </div>
            <div style={{ fontSize:11, color:'var(--text-3)', textTransform:'capitalize' }}>
              {user?.role}
            </div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ width:'100%', marginBottom:4, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
          onClick={toggleTheme}>
          {theme === 'dark' ? (
            <>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>Mode clair</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              <span>Mode sombre</span>
            </>
          )}
        </button>
        <button className="btn btn-ghost btn-sm" style={{ width:'100%', marginTop:4, display:'flex', alignItems:'center', justifyContent:'center', gap:6, color:'#dc2626' }}
          onClick={() => { logout(); navigate('/login'); }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Déconnexion</span>
        </button>
      </div>
    </aside>
    </>
  );
}
