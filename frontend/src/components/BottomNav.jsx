import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export default function BottomNav() {
  const { user } = useAuth();
  const { onlineUsers } = useSocket();

  if (!user) return null;

  const isChauffeur = user?.role === 'chauffeur';

  const navClass = ({ isActive }) =>
    `bottom-nav-item${isActive ? ' active' : ''}`;

  return (
    <nav className="bottom-nav no-print" aria-label="Navigation mobile principale">
      {!isChauffeur && (
        <NavLink to="/dashboard" className={navClass}>
          <span className="bottom-nav-icon">⊞</span>
          <span className="bottom-nav-label">Accueil</span>
        </NavLink>
      )}

      <NavLink to="/planning" className={navClass}>
        <span className="bottom-nav-icon">📋</span>
        <span className="bottom-nav-label">Planning</span>
      </NavLink>

      <NavLink to="/clino" className={navClass}>
        <span className="bottom-nav-icon">🚗</span>
        <span className="bottom-nav-label">Clino</span>
      </NavLink>

      {!isChauffeur && (
        <NavLink to="/chat" className={navClass} style={{ position: 'relative' }}>
          <span className="bottom-nav-icon">💬</span>
          {onlineUsers.length > 0 && (
            <span className="bottom-nav-badge">{onlineUsers.length}</span>
          )}
          <span className="bottom-nav-label">Chat</span>
        </NavLink>
      )}

      {!isChauffeur ? (
        <NavLink to="/entreprises" className={navClass}>
          <span className="bottom-nav-icon">🏢</span>
          <span className="bottom-nav-label">Entreprises</span>
        </NavLink>
      ) : (
        <NavLink to="/settings" className={navClass}>
          <span className="bottom-nav-icon">⚙</span>
          <span className="bottom-nav-label">Paramètres</span>
        </NavLink>
      )}

      {!isChauffeur && (
        <NavLink to="/settings" className={navClass}>
          <span className="bottom-nav-icon">⚙</span>
          <span className="bottom-nav-label">Compte</span>
        </NavLink>
      )}
    </nav>
  );
}

