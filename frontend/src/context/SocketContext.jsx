import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token } = useAuth();
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

    const socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect',           ()      => {
      setConnected(true);
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    });
    socket.on('disconnect',        ()      => setConnected(false));
    socket.on('users_online',      (users) => setOnlineUsers(users));
    socket.on('new_message', (msg) => {
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('💬 Nouveau message — GMT Ariana', { body: `${msg.nom}: ${msg.content?.slice(0,80)}`, icon: '/logo-gmt.png' });
      }
    });
    socket.on('planning_refresh', () => {
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('📋 Planning mis à jour — GMT Ariana', { body: 'Une intervention a été ajoutée ou modifiée', icon: '/logo-gmt.png' });
      }
    });
    socket.on('calendar_refresh', () => {
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('📅 Nouvel événement — GMT Ariana', { body: 'Un événement a été ajouté au calendrier', icon: '/logo-gmt.png' });
      }
    });
    socket.on('clino_refresh', () => {
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('🚗 Clino Mobile mis à jour — GMT Ariana', { body: 'Une intervention Clino Mobile a été ajoutée ou modifiée', icon: '/logo-gmt.png' });
      }
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const emit = (event, data) => socketRef.current?.emit(event, data);
  const on   = (event, cb)  => { socketRef.current?.on(event, cb);  return () => socketRef.current?.off(event, cb); };

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, onlineUsers, emit, on }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
