import { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider }        from './context/SocketContext';
import { useToast, ToastContainer } from './components/Toast';
import GlobalSearch from './components/GlobalSearch';
import NetworkStatusBanner from './components/NetworkStatusBanner';
import PWAUpdateNotification from './components/PWAUpdateNotification';
import NotificationPermissionBanner from './components/NotificationPermissionBanner';
import ErrorBoundary from './components/ErrorBoundary';

import Sidebar        from './components/Sidebar';
import Login          from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';

// Lazy-loaded pages for lightning-fast initial load
const Dashboard     = lazy(() => import('./pages/Dashboard'));
const Planning      = lazy(() => import('./pages/Planning'));
const Calendar      = lazy(() => import('./pages/Calendar'));
const Clino         = lazy(() => import('./pages/Clino'));
const Chat          = lazy(() => import('./pages/Chat'));
const Users         = lazy(() => import('./pages/Users'));
const Settings      = lazy(() => import('./pages/Settings'));
const ForcePassword = lazy(() => import('./pages/ForcePassword'));
const Schedule      = lazy(() => import('./pages/Schedule'));
const Entreprises   = lazy(() => import('./pages/Entreprises'));

function AppShell() {
  const { user, loading } = useAuth();
  const { toasts, addToast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) return (
    <div className="loading-center" style={{ height:'100vh' }}>
      <div className="spinner" style={{ width:36, height:36 }}/>
    </div>
  );

  if (!user) return (
    <>
      <PWAUpdateNotification />
      <ToastContainer toasts={toasts}/>
      <Routes>
        <Route path="/login"           element={<Login          toast={addToast}/>}/>
        <Route path="/forgot-password" element={<ForgotPassword toast={addToast}/>}/>
        <Route path="/reset-password"  element={<ResetPassword  toast={addToast}/>}/>
        <Route path="*"                element={<Navigate to="/login" replace/>}/>
      </Routes>
    </>
  );

  if (user.first_login) return (
    <>
      <PWAUpdateNotification />
      <ToastContainer toasts={toasts}/>
      <Routes>
        <Route path="*" element={<ForcePassword toast={addToast}/>}/>
      </Routes>
    </>
  );

  const isChauffeur = user?.role === 'chauffeur';

  return (
    <SocketProvider>
      <PWAUpdateNotification />
      <NotificationPermissionBanner />
      <GlobalSearch />
      <NetworkStatusBanner />
      <ToastContainer toasts={toasts}/>
      <div className="layout">
        {/* Mobile Header Bar (< 768px) */}
        <header className="mobile-topbar">
          <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)} aria-label="Menu">
            ☰
          </button>
          <div className="mobile-topbar-brand">
            <img src="/logo-gmt.png" alt="GMT Ariana" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display='none'; }} />
            <span>GMT Ariana</span>
          </div>
          <button
            className="mobile-search-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('open-global-search'))}
            aria-label="Recherche"
          >
            🔍
          </button>
        </header>

        <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
        <div className="main-area">
          <ErrorBoundary>
            <Suspense fallback={<div className="loading-center" style={{ height: '60vh' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>}>
              <Routes>
                {isChauffeur ? (
                  <>
                    <Route path="/planning" element={<Planning toast={addToast}/>}/>
                    <Route path="/clino"    element={<Clino    toast={addToast}/>}/>
                    <Route path="/settings" element={<Settings toast={addToast}/>}/>
                    <Route path="*"         element={<Navigate to="/planning" replace/>}/>
                  </>
                ) : (
                  <>
                    <Route path="/"             element={<Navigate to="/dashboard" replace/>}/>
                    <Route path="/dashboard"    element={<Dashboard    toast={addToast}/>}/>
                    <Route path="/planning"     element={<Planning     toast={addToast}/>}/>
                    <Route path="/calendar"     element={<Calendar     toast={addToast}/>}/>
                    <Route path="/schedule"     element={<Schedule     toast={addToast}/>}/>
                    <Route path="/clino"        element={<Clino        toast={addToast}/>}/>
                    <Route path="/chat"         element={<Chat         toast={addToast}/>}/>
                    <Route path="/entreprises"  element={<Entreprises  toast={addToast}/>}/>
                    <Route path="/users"        element={<Users        toast={addToast}/>}/>
                    <Route path="/settings"     element={<Settings     toast={addToast}/>}/>
                    <Route path="*"             element={<Navigate to="/dashboard" replace/>}/>
                  </>
                )}
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </SocketProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppShell/>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
