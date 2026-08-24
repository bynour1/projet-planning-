import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
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

export function SocketProvider({ children }) {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const socketRef  = useRef(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const socketUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://projet-planning.onrender.com' : '/');
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setConnected(true);
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    });

    socket.on('disconnect',   ()      => setConnected(false));
    socket.on('users_online', (users) => setOnlineUsers(users));

    // ── 1. NOUVEAU MESSAGE CHAT ──────────────────────────────
    socket.on('new_message', (msg) => {
      if (user && msg.user_id === user.id) return; // Ne pas notifier l'émetteur

      const isChatOpen = window.location.pathname === '/chat';

      // Notification Bureau (si onglet réduit ou en arrière-plan)
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        const textContent = typeof msg.content === 'string' ? msg.content.slice(0, 80) : 'Document / Pièce jointe';
        const notif = new Notification(`💬 ${msg.nom}`, {
          body: textContent,
          icon: '/logo-gmt.png',
        });
        notif.onclick = () => {
          window.focus();
          navigate('/chat');
        };
      }

      // Notification dans l'application (si l'utilisateur n'est pas déjà sur /chat)
      if (!isChatOpen) {
        playChime('message');
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

      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        const notif = new Notification('📋 Nouveau planning — GMT Ariana', {
          body: `${data.createdBy || 'L\'administrateur'} a programmé : ${data.titre} le ${data.date}`,
          icon: '/logo-gmt.png',
        });
        notif.onclick = () => {
          window.focus();
          navigate('/planning');
        };
      }

      playChime('event');
      toast(`📋 Nouveau planning ajouté par ${data.createdBy || 'l\'admin'} : ${data.titre} (${data.date})`, 'info', 6000, {
        actionLabel: 'Voir planning',
        onAction: () => navigate('/planning'),
      });
    });

    // ── 3. NOUVELLE TOURNÉE CLINO MOBILE PAR L'ADMIN ─────────
    socket.on('clino_new', (data) => {
      if (user && data.creatorId === user.id) return;

      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        const notif = new Notification('🚗 Clino Mobile — GMT Ariana', {
          body: `Nouvelle tournée : ${data.adresse} (${data.date})`,
          icon: '/logo-gmt.png',
        });
        notif.onclick = () => {
          window.focus();
          navigate('/clino');
        };
      }

      playChime('event');
      toast(`🚗 Nouvelle tournée Clino Mobile : ${data.adresse} (${data.date})`, 'info', 6000, {
        actionLabel: 'Voir Clino',
        onAction: () => navigate('/clino'),
      });
    });

    // ── 4. NOUVEL ÉVÉNEMENT CALENDRIER ───────────────────────
    socket.on('calendar_new', (data) => {
      if (user && data.creatorId === user.id) return;

      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        const notif = new Notification('📅 Nouvel événement — GMT Ariana', {
          body: `${data.titre}`,
          icon: '/logo-gmt.png',
        });
        notif.onclick = () => {
          window.focus();
          navigate('/calendar');
        };
      }

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
    <SocketContext.Provider value={{ socket: socketRef.current, connected, onlineUsers, emit, on }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);

