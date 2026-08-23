import React, { useState, useEffect } from 'react';

export default function NetworkStatusBanner() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 3000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !showReconnected) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        padding: '8px 16px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        background: isOnline ? '#15803d' : '#b91c1c',
        color: '#ffffff',
        animation: 'slideUp 0.2s ease',
      }}
    >
      <span>{isOnline ? '🟢' : '📡'}</span>
      <span>
        {isOnline
          ? 'Connexion Internet rétablie'
          : 'Mode Hors-ligne actif — Consultation du cache'}
      </span>
    </div>
  );
}
