import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const ICONS = {
  dashboard: (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  planning: (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  clino: (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 17a2 2 0 100-4 2 2 0 000 4zm8 0a2 2 0 100-4 2 2 0 000 4z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9l2-4h10l3 4h3a1 1 0 011 1v6a1 1 0 01-1 1h-1a3 3 0 01-6 0H10a3 3 0 01-6 0H3a1 1 0 01-1-1v-6a1 1 0 011-1h1z" />
    </svg>
  ),
  chat: (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  entreprises: (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

export default function BottomNav() {
  const { user } = useAuth();
  const { unreadChatCount } = useSocket();

  if (!user) return null;

  const isChauffeur = user?.role === 'chauffeur';

  const navClass = ({ isActive }) =>
    `bottom-nav-item${isActive ? ' active' : ''}`;

  return (
    <nav className="bottom-nav no-print" aria-label="Navigation mobile principale">
      {!isChauffeur && (
        <NavLink to="/dashboard" className={navClass}>
          <span className="bottom-nav-icon">{ICONS.dashboard}</span>
          <span className="bottom-nav-label">Accueil</span>
        </NavLink>
      )}

      <NavLink to="/planning" className={navClass}>
        <span className="bottom-nav-icon">{ICONS.planning}</span>
        <span className="bottom-nav-label">Planning</span>
      </NavLink>

      <NavLink to="/clino" className={navClass}>
        <span className="bottom-nav-icon">{ICONS.clino}</span>
        <span className="bottom-nav-label">Clino</span>
      </NavLink>

      {!isChauffeur && (
        <NavLink to="/chat" className={navClass} style={{ position: 'relative' }}>
          <span className="bottom-nav-icon">{ICONS.chat}</span>
          {unreadChatCount > 0 && (
            <span className="bottom-nav-badge">{unreadChatCount}</span>
          )}
          <span className="bottom-nav-label">Chat</span>
        </NavLink>
      )}

      {!isChauffeur ? (
        <NavLink to="/entreprises" className={navClass}>
          <span className="bottom-nav-icon">{ICONS.entreprises}</span>
          <span className="bottom-nav-label">Entreprises</span>
        </NavLink>
      ) : (
        <NavLink to="/settings" className={navClass}>
          <span className="bottom-nav-icon">{ICONS.settings}</span>
          <span className="bottom-nav-label">Paramètres</span>
        </NavLink>
      )}

      {!isChauffeur && (
        <NavLink to="/settings" className={navClass}>
          <span className="bottom-nav-icon">{ICONS.settings}</span>
          <span className="bottom-nav-label">Compte</span>
        </NavLink>
      )}
    </nav>
  );
}

