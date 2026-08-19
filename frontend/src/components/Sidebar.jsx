import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../hooks/useTheme';

const ICONS = {
  dashboard:   '⊞',
  users:       '👥',
  planning:    '📋',
  clino:       '🚗',
  chat:        '💬',
  routines:    '🔄',
  entreprises: '🏢',
  settings:    '⚙',
};

function roleColor(role) {
  if (role === 'administrateur') return 'avatar-blue';
  if (role === 'medecin')        return 'avatar-green';
  if (role === 'chauffeur')      return 'avatar-orange';
  return 'avatar-purple';
}
function getInitials(nom, prenom) {
  return `${(prenom?.[0]||'').toUpperCase()}${(nom?.[0]||'').toUpperCase()}`;
}

export default function Sidebar() {
  const { user, logout }  = useAuth();
  const { onlineUsers }   = useSocket();
  const navigate          = useNavigate();
  const [theme, toggleTheme] = useTheme();
  const [imgError, setImgError] = useState(false);
  const isAdmin     = user?.role === 'administrateur';
  const isChauffeur = user?.role === 'chauffeur';
  const navClass = ({ isActive }) => `nav-item${isActive ? ' active' : ''}`;

  return (
    <aside className="sidebar">
      {/* Logo GMT Ariana */}
      <div className="sidebar-logo">
        <img
          src="/logo-gmt.png"
          alt="GMT Ariana"
          style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--border)' }}
          onError={e => { e.currentTarget.style.display='none'; }}
        />
        <span>GMT Ariana</span>
      </div>

      <nav className="sidebar-nav">
        <button onClick={() => window.dispatchEvent(new CustomEvent('open-global-search'))}
          style={{margin:'8px 8px 4px',width:'calc(100% - 16px)',display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'var(--bg)',border:'1.5px solid var(--border)',borderRadius:10,cursor:'pointer',color:'var(--text-2)',fontSize:13}}>
          🔍 Rechercher... <span style={{marginLeft:'auto',fontSize:11,opacity:.6}}>Ctrl+K</span>
        </button>
        <span className="nav-section-label">Navigation</span>

        {/* Dashboard — masqué pour chauffeur */}
        {!isChauffeur && (
          <NavLink to="/dashboard" className={navClass}>
            <span className="icon">{ICONS.dashboard}</span> Tableau de bord
          </NavLink>
        )}

        {/* Planning — visible par TOUS */}
        <NavLink to="/planning" className={navClass}>
          <span className="icon">{ICONS.planning}</span> Planning
        </NavLink>

        {/* Pages masquées pour chauffeur */}
        {!isChauffeur && (
          <>
            <NavLink to="/clino" className={navClass}>
              <span className="icon">{ICONS.clino}</span> Clino Mobile
            </NavLink>

            <NavLink to="/chat" className={navClass}>
              <span className="icon">{ICONS.chat}</span>
              Chat
              {onlineUsers.length > 0 && (
                <span className="badge badge-green" style={{ marginLeft:'auto', fontSize:10 }}>
                  {onlineUsers.length} en ligne
                </span>
              )}
            </NavLink>

            <NavLink to="/routines" className={navClass}>
              <span className="icon">{ICONS.routines}</span> Mes Routines
            </NavLink>

            <NavLink to="/entreprises" className={navClass}>
              <span className="icon">{ICONS.entreprises}</span> Entreprises
            </NavLink>
          </>
        )}

        {/* Administration — admin only */}
        {isAdmin && (
          <>
            <span className="nav-section-label">Administration</span>
            <NavLink to="/users" className={navClass}>
              <span className="icon">{ICONS.users}</span> Utilisateurs
            </NavLink>
          </>
        )}

        {/* Settings — masqué pour chauffeur */}
        {!isChauffeur && (
          <>
            <span className="nav-section-label">Compte</span>
            <NavLink to="/settings" className={navClass}>
              <span className="icon">{ICONS.settings}</span> Paramètres
            </NavLink>
          </>
        )}
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
        <button className="btn btn-ghost btn-sm" style={{ width:'100%', marginBottom:4 }}
          onClick={toggleTheme}>
          {theme === 'dark' ? '☀️ Mode clair' : '🌙 Mode sombre'}
        </button>
        <button className="btn btn-ghost btn-sm" style={{ width:'100%', marginTop:4 }}
          onClick={() => { logout(); navigate('/login'); }}>
          🚪 Déconnexion
        </button>
      </div>
    </aside>
  );
}
