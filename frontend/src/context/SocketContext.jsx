import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { toast } from '../components/Toast';

const SocketContext = createContext(null);

// Pure Web Audio chime synthesizer (zero external file dependency, works offline)
function playChime(type = 'message') {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    if (type === 'message') {
      // Soft modern dual-tone ping (880Hz -> 1320Hz)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.12);
      osc2.start(ctx.currentTime + 0.08);
      osc2.stop(ctx.currentTime + 0.35);
    } else {
      // Pleasant triple harmonic chime (C5, E5, G5)
      const freqs = [523.25, 659.25, 783.99];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, ctx.currentTime + idx * 0.09);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.09 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.09);
        osc.stop(ctx.currentTime + idx * 0.09 + 0.4);
      });
    }
  } catch {
    // Audio Context blocked by browser autoplay policy until user gesture
  }
}

// Safe System/PWA Notification helper (prevents hanging on serviceWorker.ready)
export async function sendSystemNotification(title, body) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    // 1. Try Service Worker showNotification (mandatory on Android / Mobile Chrome / PWA)
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, {
          body,
          icon: '/logo-gmt.png',
          badge: '/icon-192.png',
          vibrate: [200, 100, 200],
          tag: 'gmt-notif-' + Date.now(),
          renotify: true,
        });
        return;
      }
    }
  } catch (err) {
    console.warn('[SW Notification Warning]:', err);
  }

  try {
    // 2. Direct browser Web Notification (Desktop Chrome, Firefox, Edge, Safari)
    new Notification(title, {
      body,
      icon: '/logo-gmt.png',
      badge: '/icon-192.png',
    });
  } catch {
    // Ignore restricted mobile browser errors
  }
}

export function SocketProvider({ children }) {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const socketRef  = useRef(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    if (location.pathname === '/chat') {
      setUnreadChatCount(0);
    }
  }, [location.pathname]);

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    try {
      const res = await Notification.requestPermission();
      setNotificationPermission(res);
      if (res === 'granted') {
        playChime('event');
        sendSystemNotification('🔔 Notifications GMT Ariana activées', 'Vous recevrez les alertes de plannings et messages en temps réel.');
      }
      return res;
    } catch {
      return Notification.permission;
    }
  };

  const testNotification = (title = '🔔 Test Notification GMT Ariana', body = 'Le système d\'alertes fonctionne parfaitement sur cet appareil !') => {
    playChime('event');
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      sendSystemNotification(title, body);
    }
    toast(body, 'info', 5000);
  };

  useEffect(() => {
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const socketUrl = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : '/');
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 5000,
    });

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect',   ()      => setConnected(false));
    socket.on('users_online', (users) => setOnlineUsers(users));

    // ── 1. NOUVEAU MESSAGE CHAT ──────────────────────────────
    socket.on('new_message', (msg) => {
      if (user && msg.user_id === user.id) return; // Ne pas notifier l'émetteur

      const isChatOpen = window.location.pathname === '/chat';
      if (!isChatOpen) {
        setUnreadChatCount((prev) => prev + 1);
      }
      const textContent = typeof msg.content === 'string' ? msg.content.slice(0, 80) : 'Document / Pièce jointe';

      // Carillon sonore systématique
      playChime('message');

      // Notification Système / OS (Bannière mobile & bureau)
      sendSystemNotification(`💬 ${msg.nom}`, textContent);

      // Notification dans l'application (si l'utilisateur n'est pas déjà sur /chat)
      if (!isChatOpen) {
        const textPreview = typeof msg.content === 'string' ? msg.content.slice(0, 60) : 'Document partagé';
        toast(`💬 ${msg.nom} : "${textPreview}"`, 'info', 5000, {
          actionLabel: 'Répondre',
          onAction: () => navigate('/chat'),
        });
      }
    });

    // ── 2. NOUVELLE INTERVENTION PLANNING PAR L'ADMIN ─────────
    socket.on('planning_new', (data) => {
      if (user && data.creatorId === user.id) return; // Ne pas notifier l'admin lui-même

      // Notification Système / OS (Bannière mobile & bureau)
      sendSystemNotification('📋 Nouveau planning — GMT Ariana', `${data.createdBy || 'L\'admin'} : ${data.titre} (${data.date})`);

      playChime('event');
      toast(`📋 Nouveau planning ajouté par ${data.createdBy || 'l\'admin'} : ${data.titre} (${data.date})`, 'info', 6000, {
        actionLabel: 'Voir planning',
        onAction: () => navigate('/planning'),
      });
    });

    // ── 3. NOUVELLE TOURNÉE CLINO MOBILE PAR L'ADMIN ─────────
    socket.on('clino_new', (data) => {
      if (user && data.creatorId === user.id) return;

      sendSystemNotification('🚗 Clino Mobile — GMT Ariana', `Tournée : ${data.adresse} (${data.date})`);

      playChime('event');
      toast(`🚗 Nouvelle tournée Clino Mobile : ${data.adresse} (${data.date})`, 'info', 6000, {
        actionLabel: 'Voir Clino',
        onAction: () => navigate('/clino'),
      });
    });

    // ── 4. NOUVEL ÉVÉNEMENT CALENDRIER ───────────────────────
    socket.on('calendar_new', (data) => {
      if (user && data.creatorId === user.id) return;

      sendSystemNotification('📅 Nouvel événement — GMT Ariana', `${data.titre}`);

      playChime('event');
      toast(`📅 Nouvel événement calendrier : ${data.titre}`, 'info', 6000, {
        actionLabel: 'Voir agenda',
        onAction: () => navigate('/calendar'),
      });
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user, navigate]);

  const emit = (event, data) => socketRef.current?.emit(event, data);
  const on   = (event, cb)  => { socketRef.current?.on(event, cb);  return () => socketRef.current?.off(event, cb); };

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        connected,
        onlineUsers,
        unreadChatCount,
        setUnreadChatCount,
        emit,
        on,
        notificationPermission,
        requestNotificationPermission,
        testNotification,
        sendSystemNotification,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);

