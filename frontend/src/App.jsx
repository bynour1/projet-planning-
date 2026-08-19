import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider }        from './context/SocketContext';
import { useToast, ToastContainer } from './components/Toast';
import GlobalSearch from './components/GlobalSearch';

import Sidebar        from './components/Sidebar';
import Login          from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';
import Dashboard      from './pages/Dashboard';
import Planning       from './pages/Planning';
import Calendar       from './pages/Calendar';
import Clino          from './pages/Clino';
import Chat           from './pages/Chat';
import Users          from './pages/Users';
import Settings       from './pages/Settings';
import ForcePassword  from './pages/ForcePassword';
import Routines       from './pages/Routines';
import Schedule       from './pages/Schedule';
import Entreprises    from './pages/Entreprises';

function AppShell() {
  const { user, loading } = useAuth();
  const { toasts, addToast } = useToast();

  if (loading) return (
    <div className="loading-center" style={{ height:'100vh' }}>
      <div className="spinner" style={{ width:36, height:36 }}/>
    </div>
  );

  if (!user) return (
    <>
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
      <ToastContainer toasts={toasts}/>
      <Routes>
        <Route path="*" element={<ForcePassword toast={addToast}/>}/>
      </Routes>
    </>
  );

  const isChauffeur = user?.role === 'chauffeur';

  return (
    <SocketProvider>
      <GlobalSearch />
      <ToastContainer toasts={toasts}/>
      <div className="layout">
        <Sidebar/>
        <div className="main-area">
          <Routes>
            {isChauffeur ? (
              <>
                <Route path="/planning" element={<Planning toast={addToast}/>}/>
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
                <Route path="/routines"     element={<Routines     toast={addToast}/>}/>
                <Route path="*"             element={<Navigate to="/dashboard" replace/>}/>
              </>
            )}
          </Routes>
        </div>
      </div>
    </SocketProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell/>
      </AuthProvider>
    </BrowserRouter>
  );
}
