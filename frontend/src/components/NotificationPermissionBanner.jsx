import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { toast } from './Toast';

export default function NotificationPermissionBanner() {
  const [permission, setPermission] = useState('default');
  const [isSupported, setIsSupported] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { testNotification, requestNotificationPermission } = useSocket() || {};

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      
      const isDismissed = sessionStorage.getItem('gmt_notif_banner_dismissed') === 'true';
      if (isDismissed) {
        setDismissed(true);
      }
    }
  }, []);

  if (!isSupported || permission === 'granted' || dismissed) {
    return null;
  }

  async function handleEnable() {
    if (requestNotificationPermission) {
      const res = await requestNotificationPermission();
      setPermission(res);
      if (res === 'granted') {
        toast('🔔 Notifications activées avec succès !', 'success');
      } else if (res === 'denied') {
        toast('⚠️ Les notifications ont été refusées dans votre navigateur.', 'warning');
      }
    } else if (typeof Notification !== 'undefined' && Notification.requestPermission) {
      const res = await Notification.requestPermission();
      setPermission(res);
      if (res === 'granted') {
        toast('🔔 Notifications activées avec succès !', 'success');
      }
    }
  }

  function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem('gmt_notif_banner_dismissed', 'true');
  }

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0f172a, #1e293b)',
        color: '#fff',
        padding: '12px 16px',
        borderBottom: '2px solid #0ea5e9',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        position: 'relative',
        zIndex: 99,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 260, flex: 1 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: 'rgba(14,165,233,0.2)',
            border: '1px solid rgba(14,165,233,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          🔔
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Activer les notifications</span>
            <span style={{ fontSize: 10, background: '#0ea5e9', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
              Recommandé
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, lineHeight: 1.3 }}>
            Recevez instantanément les alertes de nouveaux plannings, messages de chat et tournées.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={handleEnable}
          style={{
            background: '#0ea5e9',
            color: '#ffffff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'background 0.2s',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#0284c7')}
          onMouseOut={(e) => (e.currentTarget.style.background = '#0ea5e9')}
        >
          🔔 Autoriser les alertes
        </button>

        <button
          onClick={handleDismiss}
          title="Fermer"
          style={{
            background: 'transparent',
            color: '#64748b',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#64748b')}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
