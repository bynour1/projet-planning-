import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { startRegistration } from '@simplewebauthn/browser';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

function getDeviceFriendlyName() {
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
  let os = 'Appareil';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Navigateur';
  if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';

  return `${browser} sur ${os}`;
}

function roleLabel(role) {
  if (role === 'administrateur') return 'Administrateur';
  if (role === 'medecin')        return 'Médecin du Travail';
  if (role === 'chauffeur')      return 'Chauffeur / Logistique';
  if (role === 'hse')            return 'Responsable HSE';
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Collaborateur';
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function formatPushDate(isoString) {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return null;
  }
}

export default function Settings({ toast }) {
  const { user, refreshUser } = useAuth();
  const { notificationPermission, requestNotificationPermission, testNotification } = useSocket() || {};

  const [activeTab, setActiveTab] = useState('profil');
  const [currentNotifPerm, setCurrentNotifPerm] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  // ─── Push Diagnostic State ───
  const [swStatus, setSwStatus] = useState({ active: false, checked: false });
  const [pushSubscription, setPushSubscription] = useState(null);
  const [serverSubscribed, setServerSubscribed] = useState(false);
  const [lastPushDate, setLastPushDate] = useState(() => {
    try {
      return localStorage.getItem('gmt_last_push_received_at') || null;
    } catch {
      return null;
    }
  });
  const [testingPush, setTestingPush] = useState(false);
  const [testPushResult, setTestPushResult] = useState(null);
  const [subscribingPush, setSubscribingPush] = useState(false);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [activationError, setActivationError] = useState(null);
  const [technicalPushError, setTechnicalPushError] = useState(null);
  const [isBrave, setIsBrave] = useState(false);
  const [notifPreferences, setNotifPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem('gmt_notif_preferences');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { plannings: true, chat: true, tournees: true };
  });

  function toggleNotifPreference(key) {
    setNotifPreferences((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('gmt_notif_preferences', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }

  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [servicesStatus, setServicesStatus] = useState(null);
  const [testEmailInput, setTestEmailInput] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState(null);

  // ─── TOTP 2FA State ───
  const [totpSetupModal, setTotpSetupModal] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [totpSetupLoading, setTotpSetupLoading] = useState(false);
  const [totpEnabling, setTotpEnabling] = useState(false);

  // Backup codes modal
  const [backupCodesModal, setBackupCodesModal] = useState({ open: false, codes: [] });

  // Disable 2FA modal
  const [showDisable2FAModal, setShowDisable2FAModal] = useState(false);
  const [disable2FAForm, setDisable2FAForm] = useState({ password: '', code: '' });
  const [disable2FALoading, setDisable2FALoading] = useState(false);

  // ─── Trusted Devices State ───
  const [trustedDevices, setTrustedDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [revokingDeviceId, setRevokingDeviceId] = useState(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const [biometricCredentials, setBiometricCredentials] = useState([]);
  const [loadingBioCreds, setLoadingBioCreds] = useState(false);

  async function fetchBiometricCredentials() {
    setLoadingBioCreds(true);
    try {
      const { data } = await axios.get('/api/auth/biometric/credentials');
      setBiometricCredentials(Array.isArray(data) ? data : []);
    } catch {
      // Ignorer
    } finally {
      setLoadingBioCreds(false);
    }
  }

  async function fetchTrustedDevices() {
    setLoadingDevices(true);
    try {
      const { data } = await axios.get('/api/auth/trusted-devices');
      setTrustedDevices(data?.devices || []);
    } catch {
      // Ignorer silencieusement si non connecté
    } finally {
      setLoadingDevices(false);
    }
  }

  async function handleRevokeDevice(deviceId) {
    if (!window.confirm('Voulez-vous retirer cet appareil de confiance ?')) return;
    setRevokingDeviceId(deviceId);
    try {
      await axios.delete(`/api/auth/trusted-devices/${deviceId}`);
      toast?.('Appareil retiré avec succès', 'success');
      await fetchTrustedDevices();
    } catch (err) {
      toast?.(err.response?.data?.message || 'Erreur lors du retrait de l’appareil', 'error');
    } finally {
      setRevokingDeviceId(null);
    }
  }

  async function handleRevokeAllDevices() {
    if (!window.confirm('Êtes-vous sûr de vouloir vous déconnecter de tous vos appareils ?')) return;
    setRevokingAll(true);
    try {
      const { data } = await axios.post('/api/auth/trusted-devices/revoke-all');
      if (data?.token) {
        try { sessionStorage.setItem('pm_token', data.token); } catch {}
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
      }
      toast?.('Tous les appareils ont été déconnectés', 'success');
      await fetchTrustedDevices();
    } catch (err) {
      toast?.(err.response?.data?.message || 'Erreur lors de la déconnexion', 'error');
    } finally {
      setRevokingAll(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'securite') {
      fetchTrustedDevices();
      fetchBiometricCredentials();
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('gmt_bio_id');
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'administrateur') {
      axios.get?.('/api/auth/services-status')
        ?.then?.(r => setServicesStatus(r.data))
        ?.catch?.(() => {});
      if (user?.email) setTestEmailInput(user.email);
    }
  }, [user]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setCurrentNotifPerm(Notification.permission);
    }
  }, [notificationPermission]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.brave && typeof navigator.brave.isBrave === 'function') {
      navigator.brave.isBrave().then(val => setIsBrave(Boolean(val))).catch(() => {});
    }
  }, []);

  // ─── Diagnostic Push & Service Worker Logic ───
  const isIOS = typeof window !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  const isStandalone = typeof window !== 'undefined' && (
    window.navigator.standalone === true ||
    (typeof window.matchMedia === 'function' && Boolean(window.matchMedia('(display-mode: standalone)')?.matches))
  );

  const isBiometricSupported = typeof window !== 'undefined' && Boolean(window.PublicKeyCredential);

  async function checkPushDiagnostic() {
    setDiagnosticLoading(true);
    try {
      // 1. Permission Navigateur
      const perm = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
      setCurrentNotifPerm(perm);

      // 2. Service Worker Actif
      let isSwActive = false;
      let currentSub = null;
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          let reg = await navigator.serviceWorker.getRegistration();
          if (!reg) {
            try {
              reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            } catch (errReg) {}
          }
          if (reg && (reg.active || reg.waiting || reg.installing || navigator.serviceWorker.controller)) {
            isSwActive = true;
          }
          if (reg && 'pushManager' in reg) {
            currentSub = await reg.pushManager.getSubscription();
          }
        } catch (e) {
          console.warn('[Push Diagnostic] Erreur inspection Service Worker:', e);
        }
      }
      setSwStatus({ active: isSwActive, checked: true });
      setPushSubscription(currentSub);

      // 3. Statut Abonnement Serveur & 4. Date Dernier Push
      let isSub = false;
      try {
        const { data } = await axios.post('/api/push/status', {
          endpoint: currentSub?.endpoint || null,
        });
        isSub = Boolean(data?.isSubscribed);
        if (data?.lastPushAt) {
          setLastPushDate(data.lastPushAt);
          try { localStorage.setItem('gmt_last_push_received_at', data.lastPushAt); } catch {}
        } else {
          try {
            const stored = localStorage.getItem('gmt_last_push_received_at');
            if (stored) setLastPushDate(stored);
          } catch {}
        }
      } catch (err) {
        console.warn('[Push Diagnostic] Erreur appel /api/push/status:', err);
      }

      // 5. Si l'abonnement existe côté navigateur mais pas côté serveur, ré-enregistre-le automatiquement
      if (currentSub && !isSub) {
        try {
          await axios.post('/api/push/subscribe', {
            subscription: currentSub,
          });
          isSub = true;
        } catch (syncErr) {
          console.warn('[Push Diagnostic] Erreur ré-enregistrement automatique:', syncErr);
        }
      }

      setServerSubscribed(isSub);

      // S'il existe et qu'il est enregistré côté serveur, efface l'ancienne erreur
      if (currentSub && isSub) {
        setActivationError(null);
        setTechnicalPushError(null);
      }
    } finally {
      setDiagnosticLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'notifications') {
      checkPushDiagnostic();
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const messageHandler = (event) => {
        if (event.data?.type === 'PUSH_RECEIVED') {
          const received = event.data.payload?.receivedAt || new Date().toISOString();
          setLastPushDate(received);
          try { localStorage.setItem('gmt_last_push_received_at', received); } catch {}
        }
      };
      navigator.serviceWorker?.addEventListener?.('message', messageHandler);
      return () => {
        try {
          navigator.serviceWorker?.removeEventListener?.('message', messageHandler);
        } catch (_) {}
      };
    }
  }, []);

  // ─── Déduction de l'état global utilisateur (sans jargon technique) ───
  const notifStatus = useMemo(() => {
    if (typeof window === 'undefined') {
      return { status: 'loading', badge: 'Vérification...', title: 'Vérification en cours', desc: 'Vérification du système...', badgeBg: 'var(--surface2)', badgeColor: 'var(--text-3)', border: 'var(--border)' };
    }

    const notifSupported = 'Notification' in window;
    const swSupported = 'serviceWorker' in navigator;

    if (!notifSupported || !swSupported) {
      return {
        status: 'unsupported',
        badge: 'Non compatible',
        title: 'Appareil non compatible',
        desc: 'Ce navigateur ne prend pas en charge les alertes push.',
        badgeBg: '#f1f5f9',
        badgeColor: '#64748b',
        border: '#cbd5e1',
        actionType: null,
      };
    }

    if (isIOS && !isStandalone) {
      return {
        status: 'ios_pwa',
        badge: "iPhone : installer l'application",
        title: 'Installation requise sur iOS',
        desc: "Sur iPhone et iPad, ajoutez l'application à l'écran d'accueil (Partager ⬆️ > Sur l'écran d'accueil) pour pouvoir activer les notifications.",
        badgeBg: '#eff6ff',
        badgeColor: '#1d4ed8',
        border: '#bfdbfe',
        actionType: null,
      };
    }

    if (currentNotifPerm === 'denied') {
      return {
        status: 'blocked',
        badge: 'Bloquées par le navigateur',
        title: 'Notifications bloquées',
        desc: isBrave
          ? 'Dans Brave, activez « Utiliser les services Google pour les notifications push » dans les réglages, ou utilisez Chrome ou Edge.'
          : 'Les alertes sont bloquées dans les paramètres de votre navigateur. Autorisez-les via le cadenas 🔒 pour recevoir vos alertes.',
        badgeBg: '#fef2f2',
        badgeColor: '#991b1b',
        border: '#fecaca',
        actionType: 'retry',
      };
    }

    if (serverSubscribed && currentNotifPerm === 'granted') {
      return {
        status: 'active',
        badge: 'Activées',
        title: 'Notifications activées',
        desc: 'Les alertes en temps réel sont actives sur cet appareil.',
        badgeBg: '#f0fdf4',
        badgeColor: '#166534',
        border: '#bbf7d0',
        actionType: 'disable',
      };
    }

    if (activationError) {
      return {
        status: 'unavailable',
        badge: 'Indisponible',
        title: 'Notifications indisponibles',
        desc: isBrave
          ? 'Dans Brave, activez « Utiliser les services Google pour les notifications push » dans les réglages, ou utilisez Chrome ou Edge.'
          : 'Les notifications ne sont pas disponibles pour le moment. Réessayez dans quelques minutes.',
        badgeBg: '#f1f5f9',
        badgeColor: '#475569',
        border: '#cbd5e1',
        actionType: 'retry',
      };
    }

    return {
      status: 'inactive',
      badge: 'Non activées',
      title: 'Notifications non activées',
      desc: 'Activez les notifications pour recevoir vos plannings, messages et alertes en temps réel.',
      badgeBg: '#f8fafc',
      badgeColor: '#475569',
      border: '#cbd5e1',
      actionType: 'enable',
    };
  }, [currentNotifPerm, serverSubscribed, isIOS, isStandalone, activationError, isBrave]);

  async function handleEnablePush() {
    setSubscribingPush(true);
    setActivationError(null);

    let isDone = false;
    const timeoutHandle = setTimeout(() => {
      if (!isDone) {
        setSubscribingPush(false);
        const userMsg = isBrave
          ? 'Dans Brave, activez « Utiliser les services Google pour les notifications push » dans les réglages, ou utilisez Chrome ou Edge.'
          : 'Les notifications ne sont pas disponibles pour le moment. Réessayez dans quelques minutes.';
        setActivationError(userMsg);
        toast(userMsg, 'info');
      }
    }, 10000);

    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        throw new Error('Les notifications ne sont pas supportées par votre navigateur.');
      }

      const perm = await Notification.requestPermission();
      setCurrentNotifPerm(perm);
      if (perm !== 'granted') {
        throw new Error('Autorisation refusée par le navigateur.');
      }

      if (!('serviceWorker' in navigator)) {
        throw new Error('Service Worker non disponible sur cet appareil.');
      }

      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        try {
          reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        } catch (e) {}
      }

      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
        reg = await Promise.race([navigator.serviceWorker.ready, timeoutPromise]);
      } catch (e) {
        reg = await navigator.serviceWorker.getRegistration();
      }

      if (!reg || !('pushManager' in reg)) {
        throw new Error('PushManager indisponible. Veuillez recharger la page.');
      }

      // 1. Lire d'abord l'abonnement existant (registration.pushManager.getSubscription())
      let sub = await reg.pushManager.getSubscription();

      // 2. Si aucun abonnement n'existe dans le navigateur, on s'abonne via PushManager
      if (!sub) {
        const { data: keyData } = await axios.get('/api/push/public-key');
        const vapidPublicKey = keyData?.publicKey;

        if (!vapidPublicKey) {
          throw new Error('Clé de notification introuvable');
        }

        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      if (!sub) {
        throw new Error('Impossible de récupérer l’abonnement push.');
      }

      setPushSubscription(sub);

      // 3. Enregistrer l'abonnement côté serveur
      await axios.post('/api/push/subscribe', {
        subscription: sub,
      });

      setServerSubscribed(true);
      setActivationError(null);
      setTechnicalPushError(null);
      toast('Notifications activées avec succès !', 'success');
      await checkPushDiagnostic();
    } catch (err) {
      console.error('[Push Subscription Error]:', err);

      // Si pushManager.subscribe échoue, vérifier si un abonnement valide n'existe pas malgré tout
      let fallbackSub = null;
      try {
        const reg = await navigator?.serviceWorker?.getRegistration();
        if (reg?.pushManager) {
          fallbackSub = await reg.pushManager.getSubscription();
        }
      } catch (_) {}

      if (fallbackSub) {
        try {
          await axios.post('/api/push/subscribe', { subscription: fallbackSub });
          setPushSubscription(fallbackSub);
          setServerSubscribed(true);
          setActivationError(null);
          setTechnicalPushError(null);
          toast('Notifications activées avec succès !', 'success');
          await checkPushDiagnostic();
          return;
        } catch (_) {}
      }

      setTechnicalPushError(err.response?.data?.message || err.message || 'Erreur technique push');
      const userMessage = isBrave
        ? 'Dans Brave, activez « Utiliser les services Google pour les notifications push » dans les réglages, ou utilisez Chrome ou Edge.'
        : 'Les notifications ne sont pas disponibles pour le moment. Réessayez dans quelques minutes.';
      setActivationError(userMessage);
      toast(userMessage, 'info');
    } finally {
      isDone = true;
      clearTimeout(timeoutHandle);
      setSubscribingPush(false);
    }
  }

  async function handleDisablePush() {
    setSubscribingPush(true);
    setActivationError(null);
    try {
      if (pushSubscription) {
        await pushSubscription.unsubscribe().catch(() => {});
        await axios.post('/api/push/unsubscribe', {
          endpoint: pushSubscription.endpoint,
        }).catch(() => {});
      }
      setPushSubscription(null);
      setServerSubscribed(false);
      toast('Notifications désactivées sur cet appareil.', 'info');
      await checkPushDiagnostic();
    } catch (err) {
      toast('Erreur lors de la désactivation.', 'error');
    } finally {
      setSubscribingPush(false);
    }
  }

  async function handleTestPush() {
    setTestingPush(true);
    setTestPushResult(null);
    try {
      let endpoint = pushSubscription?.endpoint || null;
      if (!endpoint && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager?.getSubscription();
          if (sub) {
            endpoint = sub.endpoint;
            setPushSubscription(sub);
          }
        } catch (_) {}
      }

      const { data } = await axios.post('/api/push/test', {
        endpoint,
      });

      setTestPushResult({
        success: true,
        message: 'Notification envoyée avec succès sur votre appareil.',
        details: data,
      });

      // Le test réussi confirme que l'abonnement est actif et enregistré côté serveur
      setServerSubscribed(true);
      setActivationError(null);
      setTechnicalPushError(null);

      const now = new Date().toISOString();
      setLastPushDate(now);
      try { localStorage.setItem('gmt_last_push_received_at', now); } catch {}

      if (testNotification) {
        testNotification('Notification GMT Ariana', 'Le système d\'alertes push fonctionne parfaitement sur votre appareil.');
      }
      toast('Notification de test envoyée avec succès !', 'success');
    } catch (err) {
      console.error('[Push Test Error]:', err);
      setTechnicalPushError(err.response?.data?.message || err.message || 'Erreur push de test');
      const userMessage = isBrave
        ? 'Dans Brave, activez « Utiliser les services Google pour les notifications push » dans les réglages, ou utilisez Chrome ou Edge.'
        : 'Les notifications ne sont pas disponibles pour le moment. Réessayez dans quelques minutes.';
      setTestPushResult({
        success: false,
        message: userMessage,
      });
      toast(userMessage, 'info');
    } finally {
      setTestingPush(false);
    }
  }

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatar]);

  async function handleChangePassword(e) {
    e.preventDefault();
    if (pwdForm.new_password !== pwdForm.confirm) {
      return toast('Les mots de passe ne correspondent pas', 'error');
    }
    if (pwdForm.new_password.length < 6) {
      return toast('Minimum 6 caractères requis', 'error');
    }
    setSaving(true);
    try {
      const { data } = await axios.post('/api/auth/change-password', {
        current_password: pwdForm.current_password,
        new_password:     pwdForm.new_password,
      });
      if (data?.token) {
        try {
          sessionStorage.setItem('pm_token', data.token);
        } catch {}
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
      }
      toast(data?.message || 'Mot de passe mis à jour avec succès', 'success');
      setPwdForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors de la modification', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegisterBiometric() {
    if (!window.PublicKeyCredential) {
      return toast("Votre navigateur ou appareil ne supporte pas l'authentification biométrique (WebAuthn)", "error");
    }
    setBioLoading(true);
    try {
      const { data: options } = await axios.post('/api/auth/biometric/register/options');
      const regResponse = await startRegistration({ optionsJSON: options });

      const defaultDeviceName = getDeviceFriendlyName();
      const customName = window.prompt("Nommez cet appareil biométrique :", defaultDeviceName);
      const finalDeviceName = (customName && customName.trim()) ? customName.trim() : defaultDeviceName;

      await axios.post('/api/auth/biometric/register/verify', {
        response: regResponse,
        deviceName: finalDeviceName,
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem('gmt_remembered_email', user?.email || '');
        localStorage.removeItem('gmt_bio_id');
      }

      await refreshUser();
      await fetchBiometricCredentials();
      toast('Connexion rapide configurée avec succès sur cet appareil !', 'success');
    } catch (err) {
      console.warn('[WebAuthn Registration Error]:', err);
      let errorMsg = "Échec de l'enregistrement de l'appareil biométrique.";
      if (err.name === 'NotAllowedError' || err.message?.includes('cancel') || err.message?.includes('abort')) {
        errorMsg = "Enregistrement biométrique annulé par l'utilisateur.";
      } else if (err.name === 'InvalidStateError') {
        errorMsg = "Cet appareil est déjà enregistré pour votre compte.";
      } else if (err.name === 'NotSupportedError') {
        errorMsg = "Aucun capteur biométrique ou verrouillage d'écran configuré sur cet appareil.";
      } else if (err.name === 'SecurityError' || (typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost')) {
        errorMsg = "Une connexion sécurisée (HTTPS) est requise pour utiliser la biométrie.";
      } else if (err.response?.data?.message) {
        errorMsg = err.response.data.message;
      }
      toast(errorMsg, 'error');
    } finally {
      setBioLoading(false);
    }
  }

  async function handleRemoveBiometric(credentialId) {
    const targetId = credentialId || (biometricCredentials[0]?.id);
    if (!targetId) {
      return toast("Aucun appareil biométrique à retirer", "info");
    }

    const password = window.prompt("Pour confirmer le retrait de cet appareil biométrique, veuillez saisir votre mot de passe actuel :");
    if (!password) return;

    setBioLoading(true);
    try {
      await axios.delete(`/api/auth/biometric/credentials/${targetId}`, { data: { password } });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('gmt_bio_id');
      }
      await refreshUser();
      await fetchBiometricCredentials();
      toast('Appareil biométrique retiré avec succès', 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors de la suppression de l\'appareil', 'error');
    } finally {
      setBioLoading(false);
    }
  }

  async function handleRemoveAvatar() {
    try {
      await axios.delete('/api/auth/avatar');
      setAvatarError(false);
      await refreshUser();
      toast('Photo de profil supprimée', 'info');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  }

  async function handleTestEmail() {
    if (!testEmailInput.trim()) return toast('Saisissez une adresse e-mail de test', 'warning');
    setTestingEmail(true);
    setTestEmailResult(null);
    try {
      const res = await axios.post('/api/auth/test-email', { to: testEmailInput.trim() });
      if (res.data?.previewUrl) {
        setTestEmailResult({
          ok: true,
          previewUrl: res.data.previewUrl,
          message: 'Mode simulation Ethereal : le message de test a été généré localement.',
        });
        toast('E-mail simulé généré (Ethereal)', 'info');
      } else {
        setTestEmailResult({
          ok: true,
          previewUrl: null,
          message: 'Connexion SMTP validée et message expédié avec succès.',
        });
        toast('E-mail de test expédié', 'success');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Erreur SMTP';
      setTestEmailResult({ ok: false, message: msg });
      toast(msg, 'error');
    } finally {
      setTestingEmail(false);
    }
  }

  // ─── TOTP 2FA Handlers ───
  async function handleStartTotpSetup() {
    setTotpSetupLoading(true);
    try {
      const { data } = await axios.post('/api/auth/2fa/setup');
      setTotpSetupData(data);
      setTotpVerifyCode('');
      setTotpSetupModal(true);
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors de l’initialisation de la 2FA', 'error');
    } finally {
      setTotpSetupLoading(false);
    }
  }

  async function handleConfirmEnableTotp(e) {
    e.preventDefault();
    if (!totpVerifyCode.trim()) return;
    setTotpEnabling(true);
    try {
      const { data } = await axios.post('/api/auth/2fa/enable', { code: totpVerifyCode.trim() });
      setTotpSetupModal(false);
      setTotpSetupData(null);
      setTotpVerifyCode('');
      await refreshUser();
      if (data.backup_codes && data.backup_codes.length > 0) {
        setBackupCodesModal({ open: true, codes: data.backup_codes });
      }
      toast('Double authentification activée avec succès', 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'Code invalide. Vérifiez l’heure de votre appareil.', 'error');
    } finally {
      setTotpEnabling(false);
    }
  }

  async function handleDisable2FA(e) {
    e.preventDefault();
    if (!disable2FAForm.password || !disable2FAForm.code) return;
    setDisable2FALoading(true);
    try {
      await axios.post('/api/auth/2fa/disable', {
        password: disable2FAForm.password,
        code: disable2FAForm.code.trim(),
      });
      setShowDisable2FAModal(false);
      setDisable2FAForm({ password: '', code: '' });
      await refreshUser();
      toast('Double authentification désactivée', 'info');
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors de la désactivation', 'error');
    } finally {
      setDisable2FALoading(false);
    }
  }

  function copyBackupCodes() {
    if (!backupCodesModal.codes.length) return;
    const text = "CODES DE SECOURS - GMT ARIANA\n" +
      "Session : " + (user?.email || 'Utilisateur') + "\n" +
      "Conservez ces codes en lieu sûr. Chaque code est à usage unique.\n\n" +
      backupCodesModal.codes.map((c, i) => `${i + 1}. ${c}`).join('\n');
    navigator.clipboard.writeText(text);
    toast('Codes de secours copiés', 'success');
  }

  function downloadBackupCodes() {
    if (!backupCodesModal.codes.length) return;
    const text = "CODES DE SECOURS - GMT ARIANA\n" +
      "Utilisateur : " + (user?.email || '') + "\n" +
      "Date : " + new Date().toLocaleString() + "\n" +
      "Conservez ces codes en lieu sûr. Chaque code est à usage unique.\n\n" +
      backupCodesModal.codes.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gmt-ariana-backup-codes-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Fichier texte téléchargé', 'success');
  }

  async function handleRevokeDevice(deviceId) {
    if (!window.confirm('Voulez-vous retirer cet appareil de confiance ? La 2FA sera redemandée lors de la prochaine connexion.')) return;
    setRevokingDeviceId(deviceId);
    try {
      await axios.delete(`/api/auth/trusted-devices/${deviceId}`);
      toast('Appareil retiré avec succès', 'success');
      await fetchTrustedDevices();
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors du retrait de l’appareil', 'error');
    } finally {
      setRevokingDeviceId(null);
    }
  }

  async function handleRevokeAllDevices() {
    if (!window.confirm("Êtes-vous sûr de vouloir vous déconnecter de tous vos appareils ? Vous devrez vous reconnecter.")) return;
    setRevokingAll(true);
    try {
      const { data } = await axios.post('/api/auth/trusted-devices/revoke-all');
      if (data?.token) {
        try { sessionStorage.setItem('pm_token', data.token); } catch {}
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
      }
      toast('Tous les appareils ont été déconnectés', 'success');
      await fetchTrustedDevices();
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors de la déconnexion', 'error');
    } finally {
      setRevokingAll(false);
    }
  }

  const isAdmin = user?.role === 'administrateur';

  // Tabs configuration — Clean & Minimalist
  const tabs = [
    {
      id: 'profil',
      label: 'Mon Profil',
      icon: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    },
    {
      id: 'securite',
      label: 'Sécurité & Accès',
      icon: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      )
    },
    {
      id: 'systeme',
      label: 'À propos',
      icon: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    }
  ];

  return (
    <div className="page-content settings-container" style={{ maxWidth: 980, margin: '0 auto' }}>

      {/* Header Banner — Sober, clean & professional */}
      <div
        className="settings-header-banner"
        style={{
          background: 'var(--surface)',
          borderRadius: 12,
          padding: '16px 20px',
          border: '1px solid var(--border)',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text)', letterSpacing: -0.3 }}>
              Paramètres
            </h1>
            <span style={{
              background: 'var(--surface2)',
              color: 'var(--text-2)',
              border: '1px solid var(--border)',
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 11.5,
              fontWeight: 600
            }}>
              {roleLabel(user?.role)}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
            Gestion du compte, sécurité des accès et préférences
          </p>
        </div>

        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-2)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }} />
          <span>{user?.email}</span>
        </div>
      </div>

      {/* Tab Navigation — Sober & Minimalist */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          borderBottom: '1px solid var(--border)',
          marginBottom: 18,
          overflowX: 'auto',
          paddingBottom: 4
        }}
      >
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: isActive ? 'var(--surface2)' : 'transparent',
                color: isActive ? 'var(--text)' : 'var(--text-2)',
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', opacity: isActive ? 1 : 0.7 }}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: PROFIL & COMPTE */}
      {activeTab === 'profil' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
          
          {/* Identity Card */}
          <div className="card settings-card" style={{ padding: 'clamp(16px, 3vw, 22px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Identité & Photo
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '1px 0 0' }}>
                  Photo affichée sur le planning et le fil d'échanges
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '6px 0 16px' }}>
              <div style={{ position: 'relative' }}>
                {user?.avatar && !avatarError ? (
                  <img
                    src={user.avatar}
                    alt="Avatar"
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '1px solid var(--border)'
                    }}
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <div style={{
                    width: 84,
                    height: 84,
                    borderRadius: '50%',
                    background: 'var(--surface2)',
                    color: 'var(--text)',
                    fontSize: 26,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--border)'
                  }}>
                    {(user?.prenom?.[0] || '').toUpperCase()}{(user?.nom?.[0] || '').toUpperCase()}
                  </div>
                )}
                
                <label
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: '50%',
                    width: 30,
                    height: 30,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
                  }}
                  title="Modifier la photo"
                >
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const formData = new FormData();
                      formData.append('avatar', file);
                      try {
                        await axios.post('/api/auth/avatar', formData, {
                          headers: { 'Content-Type': 'multipart/form-data' }
                        });
                        setAvatarError(false);
                        await refreshUser();
                        toast('Photo de profil mise à jour', 'success');
                      } catch (uploadErr) {
                        toast(uploadErr.response?.data?.message || 'Erreur lors du téléchargement', 'error');
                      }
                    }}
                  />
                </label>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
                  {user?.prenom} {user?.nom}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>
                  {user?.email}
                </div>
              </div>

              {user?.avatar && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#dc2626',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '2px 6px'
                  }}
                >
                  Supprimer la photo
                </button>
              )}
            </div>

            <div style={{
              background: 'var(--surface2)',
              borderRadius: 8,
              padding: '12px 14px',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Compte</span>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>Actif</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Rôle</span>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{roleLabel(user?.role)}</span>
              </div>
            </div>
          </div>

          {/* Account Details & Security Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card settings-card" style={{ padding: 'clamp(16px, 3vw, 22px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                    Informations du Compte
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '1px 0 0' }}>
                    Données d'enregistrement du profil
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Prénom', value: user?.prenom || '—' },
                  { label: 'Nom', value: user?.nom || '—' },
                  { label: 'Adresse e-mail', value: user?.email || '—' },
                  { label: 'Rôle', value: roleLabel(user?.role) },
                  { label: 'Identifiant', value: user?.id ? `#${user.id}` : '—' },
                ].map(item => (
                  <div
                    key={item.label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'var(--surface2)',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      fontSize: 13,
                      flexWrap: 'wrap',
                      gap: 4
                    }}
                  >
                    <span style={{ color: 'var(--text-2)' }}>{item.label}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Security Status Box */}
            <div className="card settings-card" style={{ padding: 'clamp(14px, 3vw, 18px)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                  Sécurité du compte
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('securite')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Gérer les accès →
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(95px, 1fr))', gap: 8 }}>
                <div style={{ padding: '10px 8px', background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Mot de passe</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Actif</div>
                </div>
                <div style={{ padding: '10px 8px', background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>2FA TOTP</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: user?.totp_enabled ? '#16a34a' : 'var(--text-3)' }}>
                    {user?.totp_enabled ? 'Active' : 'Inactive'}
                  </div>
                </div>
                <div style={{ padding: '10px 8px', background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Biométrie</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: user?.has_biometric ? '#16a34a' : 'var(--text-3)' }}>
                    {user?.has_biometric ? 'Configurée' : 'Non liée'}
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* TAB 2: SECURITE & ACCES */}
      {activeTab === 'securite' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 1. Mot de passe */}
          <div className="card settings-card" style={{ padding: 'clamp(16px, 3vw, 22px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Mot de passe
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '1px 0 0' }}>
                  Modifiez votre mot de passe d'accès
                </p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Mot de passe actuel</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showCurrentPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={pwdForm.current_password}
                    onChange={e => setPwdForm(p => ({ ...p, current_password: e.target.value }))}
                    style={{ minHeight: 40, paddingRight: 40 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPwd(p => !p)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-3)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={showCurrentPwd ? 'Masquer' : 'Afficher'}
                    aria-label={showCurrentPwd ? 'Masquer' : 'Afficher'}
                  >
                    {showCurrentPwd ? (
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Nouveau mot de passe</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showNewPwd ? 'text' : 'password'}
                    placeholder="Minimum 6 caractères"
                    value={pwdForm.new_password}
                    onChange={e => setPwdForm(p => ({ ...p, new_password: e.target.value }))}
                    style={{ minHeight: 40, paddingRight: 40 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPwd(p => !p)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-3)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={showNewPwd ? 'Masquer' : 'Afficher'}
                    aria-label={showNewPwd ? 'Masquer' : 'Afficher'}
                  >
                    {showNewPwd ? (
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Confirmer le nouveau mot de passe</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showConfirmPwd ? 'text' : 'password'}
                    placeholder="Confirmation du mot de passe"
                    value={pwdForm.confirm}
                    onChange={e => setPwdForm(p => ({ ...p, confirm: e.target.value }))}
                    style={{ minHeight: 40, paddingRight: 40 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPwd(p => !p)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-3)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={showConfirmPwd ? 'Masquer' : 'Afficher'}
                    aria-label={showConfirmPwd ? 'Masquer' : 'Afficher'}
                  >
                    {showConfirmPwd ? (
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {pwdForm.new_password && (
                <div style={{ marginTop: 2 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
                    {[1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: 3,
                          borderRadius: 2,
                          background: pwdForm.new_password.length >= i * 2 ? '#2563eb' : 'var(--border)',
                          transition: 'background 0.2s ease'
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
                style={{ marginTop: 4, minHeight: 40, justifyContent: 'center', fontSize: 13 }}
              >
                {saving ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
              </button>
            </form>
          </div>

          {/* 2. Double authentification */}
          <div className="card settings-card" style={{ padding: 'clamp(16px, 3vw, 22px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                    Double authentification
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '1px 0 0' }}>
                    Protection supplémentaire par code de sécurité
                  </p>
                </div>
              </div>

              <span
                data-testid="totp-status-badge"
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: '3px 9px',
                  borderRadius: 6,
                  background: user?.totp_enabled ? '#f0fdf4' : 'var(--surface2)',
                  color: user?.totp_enabled ? '#166534' : 'var(--text-3)',
                  border: `1px solid ${user?.totp_enabled ? '#bbf7d0' : 'var(--border)'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: user?.totp_enabled ? '#16a34a' : '#94a3b8'
                }} />
                {user?.totp_enabled ? 'Active' : 'Inactive'}
              </span>
            </div>

            <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.5 }}>
              {user?.totp_enabled
                ? 'Votre compte est protégé par un code temporaire à 6 chiffres généré par votre application d\'authentification.'
                : 'Ajoutez une sécurité supplémentaire à votre compte en demandant un code temporaire lors de chaque connexion.'}
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {!user?.totp_enabled ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStartTotpSetup}
                  disabled={totpSetupLoading}
                  style={{ minHeight: 40, padding: '8px 18px', fontSize: 13 }}
                >
                  {totpSetupLoading ? 'Initialisation...' : 'Activer la double authentification'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setDisable2FAForm({ password: '', code: '' });
                    setShowDisable2FAModal(true);
                  }}
                  style={{ minHeight: 40, padding: '8px 16px', fontSize: 13 }}
                >
                  Désactiver la double authentification
                </button>
              )}
            </div>
          </div>

          {/* 3. Connexion rapide */}
          <div className="card settings-card" style={{ padding: 'clamp(16px, 3vw, 22px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.012 1-4.148 1-6.332A9.97 9.97 0 0012 2C6.477 2 2 6.477 2 12c0 2.184.455 4.32 1.322 6.332" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                    Connexion rapide
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '1px 0 0' }}>
                    Empreinte digitale, Face ID ou Windows Hello
                  </p>
                </div>
              </div>

              <span
                data-testid="biometric-status-badge"
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: '3px 9px',
                  borderRadius: 6,
                  background: (user?.has_biometric || biometricCredentials.length > 0) ? '#f0fdf4' : 'var(--surface2)',
                  color: (user?.has_biometric || biometricCredentials.length > 0) ? '#166534' : 'var(--text-3)',
                  border: `1px solid ${(user?.has_biometric || biometricCredentials.length > 0) ? '#bbf7d0' : 'var(--border)'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: (user?.has_biometric || biometricCredentials.length > 0) ? '#16a34a' : '#94a3b8'
                }} />
                {(user?.has_biometric || biometricCredentials.length > 0) ? 'Activée' : 'Non activée'}
              </span>
            </div>

            <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.5 }}>
              Connectez-vous rapidement et en toute sécurité avec votre empreinte, Face ID ou Windows Hello sur cet appareil.
            </p>

            {!isBiometricSupported ? (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                fontSize: 12.5,
                color: 'var(--text-3)'
              }}>
                La connexion rapide n'est pas disponible sur ce navigateur ou cet appareil.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {(user?.has_biometric || biometricCredentials.length > 0) ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleRemoveBiometric()}
                    disabled={bioLoading}
                    style={{ minHeight: 40, padding: '8px 18px', fontSize: 13 }}
                  >
                    {bioLoading ? 'Traitement...' : 'Désactiver la connexion rapide'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleRegisterBiometric}
                    disabled={bioLoading}
                    style={{ minHeight: 40, padding: '8px 20px', fontSize: 13 }}
                  >
                    {bioLoading ? 'Vérification en cours...' : 'Activer la connexion rapide'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* User notification main card */}
          <div className="card settings-card" style={{ padding: 'clamp(16px, 3vw, 24px)' }}>
            
            {/* Header with single global status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                    Notifications
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '3px 0 0' }}>
                    {notifStatus.desc}
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <span
                data-testid="notif-global-status"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '5px 12px',
                  borderRadius: 20,
                  background: notifStatus.badgeBg,
                  color: notifStatus.badgeColor,
                  border: `1px solid ${notifStatus.border}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: notifStatus.badgeColor
                }} />
                {notifStatus.badge}
              </span>
            </div>

            {/* Error or Alert banner if any */}
            {activationError && notifStatus.status !== 'active' && (
              <div style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                marginBottom: 16,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span>⚠️</span>
                <span style={{ flex: 1 }}>{activationError}</span>
              </div>
            )}

            {/* Single action button adapted to the state */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 }}>
              {notifStatus.actionType === 'enable' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleEnablePush}
                  disabled={subscribingPush}
                  style={{ minHeight: 40, padding: '8px 20px', fontSize: 13, gap: 8 }}
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span>{subscribingPush ? 'Activation en cours...' : 'Activer les notifications'}</span>
                </button>
              )}

              {notifStatus.actionType === 'retry' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleEnablePush}
                  disabled={subscribingPush}
                  style={{ minHeight: 40, padding: '8px 20px', fontSize: 13, gap: 8 }}
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>{subscribingPush ? 'Activation en cours...' : 'Réessayer'}</span>
                </button>
              )}

              {notifStatus.actionType === 'disable' && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleDisablePush}
                  disabled={subscribingPush}
                  style={{ minHeight: 40, padding: '8px 18px', fontSize: 13, gap: 8, color: '#dc2626' }}
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  <span>Désactiver</span>
                </button>
              )}

              {/* Bouton "Tester la notification" */}
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleTestPush}
                disabled={testingPush}
                style={{
                  minHeight: 40,
                  padding: '8px 18px',
                  fontSize: 13,
                  gap: 8,
                }}
              >
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  style={{ animation: testingPush ? 'spin 1s linear infinite' : 'none' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>{testingPush ? 'Envoi en cours...' : 'Tester la notification'}</span>
              </button>
            </div>

            {/* Test Push Server Live Result Banner */}
            {testPushResult && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: testPushResult.success ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${testPushResult.success ? '#bbf7d0' : '#fecaca'}`,
                color: testPushResult.success ? '#166534' : '#991b1b',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12.5
              }}>
                <span>{testPushResult.success ? '✅' : '❌'}</span>
                <span style={{ flex: 1 }}>{testPushResult.message}</span>
              </div>
            )}

            {/* Interrupteurs par type d'alerte : Plannings, Chat, Tournées */}
            <div style={{ marginBottom: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 12px', color: 'var(--text)' }}>
                Types d'alertes
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { key: 'plannings', title: 'Plannings', desc: 'Création, modification et validation de vos interventions' },
                  { key: 'chat', title: 'Chat', desc: 'Nouveaux messages et échanges d\'équipe' },
                  { key: 'tournees', title: 'Tournées', desc: 'Départs sur site, alertes d\'agenda et Clino Mobile' },
                ].map(item => {
                  const isChecked = Boolean(notifPreferences[item.key]);
                  return (
                    <label
                      key={item.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: 'var(--surface2)',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{item.desc}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleNotifPreference(item.key)}
                        style={{
                          width: 18,
                          height: 18,
                          accentColor: 'var(--primary, #0ea5e9)',
                          cursor: 'pointer'
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Mention confidentialité en une ligne discrète */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--text-3)',
              paddingTop: 10,
              borderTop: '1px solid var(--border)'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <span>
                Confidentialité : aucune donnée médicale ni nom de patient n'apparaît dans les notifications.
              </span>
            </div>

          </div>

          {/* Diagnostic avancé (Admin uniquement) */}
          {isAdmin && (
            <details
              data-testid="admin-advanced-diagnostics"
              className="card settings-card"
              style={{ padding: 'clamp(14px, 2.5vw, 18px)' }}
            >
              <summary style={{
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13.5,
                color: 'var(--text-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                userSelect: 'none'
              }}>
                <span>Diagnostic avancé (Administrateur)</span>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    checkPushDiagnostic();
                  }}
                  disabled={diagnosticLoading}
                  style={{ fontSize: 11.5, padding: '4px 10px', minHeight: 28, gap: 5 }}
                >
                  <svg
                    width="12"
                    height="12"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    style={{ animation: diagnosticLoading ? 'spin 1s linear infinite' : 'none' }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Actualiser</span>
                </button>
              </summary>

              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 1. Permission navigateur */}
                <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>1. Permission du navigateur</span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: currentNotifPerm === 'granted' ? '#f0fdf4' : '#fef2f2',
                      color: currentNotifPerm === 'granted' ? '#166534' : '#991b1b',
                    }}>
                      {currentNotifPerm}
                    </span>
                  </div>
                </div>

                {/* 2. Service Worker */}
                <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>2. Service Worker actif</span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: swStatus.active ? '#f0fdf4' : '#fef2f2',
                      color: swStatus.active ? '#166534' : '#991b1b',
                    }}>
                      {swStatus.active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                </div>

                {/* 3. Abonnement push serveur */}
                <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>3. Abonnement push serveur</span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: serverSubscribed ? '#f0fdf4' : '#fef2f2',
                      color: serverSubscribed ? '#166534' : '#991b1b',
                    }}>
                      {serverSubscribed ? 'Enregistré' : 'Non enregistré'}
                    </span>
                  </div>
                </div>

                {/* 4. Dernier push reçu */}
                <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>4. Dernier push reçu</span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                      {lastPushDate ? formatPushDate(lastPushDate) : 'Aucun'}
                    </span>
                  </div>
                </div>

                {/* 5. Diagnostic technique d'erreur */}
                {technicalPushError && (
                  <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Dernière anomalie technique</div>
                    <code style={{ fontSize: 11, color: 'var(--text-2)', wordBreak: 'break-all' }}>{technicalPushError}</code>
                  </div>
                )}
              </div>
            </details>
          )}

        </div>
      )}

      {/* TAB 4: A PROPOS & DIAGNOSTIC */}
      {activeTab === 'systeme' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Carte À propos (accessible à tous les salariés) */}
          <div className="card settings-card" style={{ padding: 'clamp(16px, 3vw, 22px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                    À propos
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '1px 0 0' }}>
                    Informations sur l'application et support
                  </p>
                </div>
              </div>

              <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                v2.4.0
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 14 }}>
              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--surface2)',
                  borderRadius: 6,
                  border: '1px solid var(--border)'
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Nom de l'application</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>GMT Ariana — Santé au Travail</div>
              </div>

              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--surface2)',
                  borderRadius: 6,
                  border: '1px solid var(--border)'
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Version</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>2.4.0</div>
              </div>

              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--surface2)',
                  borderRadius: 6,
                  border: '1px solid var(--border)'
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Contact support</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                  <a href="mailto:support@gmt-ariana.tn" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                    support@gmt-ariana.tn
                  </a>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={async () => {
                  if (!window.confirm("L'application va se recharger, vous devrez peut-être vous reconnecter.")) return;
                  try {
                    if ('serviceWorker' in navigator) {
                      const registrations = await navigator.serviceWorker.getRegistrations();
                      for (const reg of registrations) {
                        await reg.unregister();
                      }
                    }
                    if ('caches' in window) {
                      const keys = await caches.keys();
                      await Promise.all(keys.map(k => caches.delete(k)));
                    }
                  } catch (e) {
                    console.warn(e);
                  }
                  toast('Rechargement en cours…', 'info');
                  setTimeout(() => {
                    window.location.href = window.location.href.split('#')[0];
                  }, 400);
                }}
                style={{ minHeight: 38, padding: '0 14px', fontSize: 12.5 }}
              >
                Résoudre un problème d'affichage
              </button>

              <button
                type="button"
                className="btn btn-outline"
                onClick={async () => {
                  toast('Recherche de mises à jour…', 'info');
                  window.dispatchEvent(new CustomEvent('check-pwa-update'));
                  if ('serviceWorker' in navigator) {
                    try {
                      const reg = await navigator.serviceWorker.ready;
                      await reg.update();
                      if (reg.waiting) {
                        toast('Nouvelle version trouvée ! Mise à jour en cours…', 'success');
                        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                        setTimeout(() => window.location.reload(), 800);
                        return;
                      }
                    } catch (e) {
                      console.warn(e);
                    }
                  }
                  setTimeout(() => {
                    toast('Vous utilisez la version la plus récente.', 'success');
                  }, 800);
                }}
                style={{ minHeight: 38, padding: '0 14px', fontSize: 12.5 }}
              >
                Vérifier les mises à jour
              </button>
            </div>
          </div>

          {/* Diagnostic avancé (Visible uniquement pour l'administrateur) */}
          {isAdmin && (
            <details
              data-testid="admin-system-diagnostics"
              className="card settings-card"
              style={{ padding: 'clamp(14px, 2.5vw, 18px)' }}
            >
              <summary style={{
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13.5,
                color: 'var(--text-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                userSelect: 'none'
              }}>
                <span>Diagnostic avancé (Administrateur)</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Technique & Passerelles</span>
              </summary>

              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Métadonnées techniques */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  {[
                    { label: 'Backend', value: 'Node.js Express' },
                    { label: 'Frontend', value: 'React + Vite' },
                    { label: 'Mode', value: (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)')?.matches) ? 'Application PWA' : 'Navigateur Web' },
                    { label: 'Chiffrement TOTP', value: 'RFC 6238 (AES-256-GCM)' },
                    { label: 'Biométrie', value: 'WebAuthn / FIDO2' },
                  ].map(item => (
                    <div
                      key={item.label}
                      style={{
                        padding: '8px 12px',
                        background: 'var(--surface2)',
                        borderRadius: 6,
                        border: '1px solid var(--border)'
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* Passerelle E-mail (SMTP) */}
                <div style={{
                  padding: 14,
                  background: 'var(--surface2)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  marginTop: 6
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                      Passerelle E-mail (SMTP)
                    </div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: servicesStatus?.email?.configured ? '#16a34a' : 'var(--text-2)'
                    }}>
                      {servicesStatus?.email?.configured ? 'Opérationnel' : 'Mode simulation (Ethereal)'}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                    {servicesStatus?.email?.configured ? (
                      <>Expéditeur configuré : <strong>{servicesStatus.email.user || servicesStatus.email.from || 'Actif'}</strong></>
                    ) : (
                      <>Identifiants réels non définis dans l'environnement. Le serveur utilise le bac à sable local Ethereal.</>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="email"
                      className="input"
                      placeholder="Adresse de test"
                      value={testEmailInput}
                      onChange={e => setTestEmailInput(e.target.value)}
                      style={{ flex: '1 1 200px', minHeight: 38, fontSize: 12.5 }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleTestEmail}
                      disabled={testingEmail}
                      style={{ minHeight: 38, padding: '0 14px', fontSize: 12.5 }}
                    >
                      {testingEmail ? 'Test en cours...' : 'Envoyer un email test'}
                    </button>
                  </div>

                  {testEmailResult && (
                    <div style={{
                      marginTop: 10,
                      padding: '8px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      background: 'var(--surface)',
                      color: testEmailResult.ok ? 'var(--text)' : '#dc2626',
                      border: '1px solid var(--border)'
                    }}>
                      <div>{testEmailResult.message}</div>
                      {testEmailResult.previewUrl && (
                        <div style={{ marginTop: 4 }}>
                          <a
                            href={testEmailResult.previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: 'var(--primary)',
                              fontWeight: 600,
                              textDecoration: 'underline'
                            }}
                          >
                            Consulter l'e-mail dans Ethereal
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </details>
          )}

        </div>
      )}

      {/* ─── MODAL 1: CONFIGURATION 2FA TOTP ─── */}
      {totpSetupModal && (
        <div className="modal-overlay" onClick={() => setTotpSetupModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                Configuration Authenticator
              </h3>
              <button
                type="button"
                onClick={() => setTotpSetupModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmEnableTotp} style={{ display: 'flex', flexDirection: 'column', margin: 0 }}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                  Scannez ce QR code avec votre application (Google Authenticator, Microsoft Authenticator, Aegis) :
                </p>

                <div style={{ textAlign: 'center', padding: 12, background: '#ffffff', borderRadius: 8, border: '1px solid var(--border)' }}>
                  {totpSetupData?.qr_code ? (
                    <img
                      src={totpSetupData.qr_code}
                      alt="Code QR TOTP"
                      style={{ width: 160, maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto', borderRadius: 6, aspectRatio: '1/1' }}
                    />
                  ) : (
                    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="spinner" />
                    </div>
                  )}
                </div>

                <div>
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4 }}>
                    Saisie manuelle :
                  </p>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <code style={{
                      flex: 1,
                      padding: '6px 8px',
                      background: 'var(--surface2)',
                      borderRadius: 6,
                      fontFamily: 'monospace',
                      fontSize: 12,
                      fontWeight: 600,
                      wordBreak: 'break-all',
                      border: '1px solid var(--border)'
                    }}>
                      {totpSetupData?.manual_key}
                    </code>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ minHeight: 32, flexShrink: 0, padding: '0 10px' }}
                      onClick={() => {
                        if (totpSetupData?.manual_key) {
                          navigator.clipboard.writeText(totpSetupData.manual_key);
                          toast('Clé copiée', 'success');
                        }
                      }}
                    >
                      Copier
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Code à 6 chiffres affiché par l'application :
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    className="input"
                    value={totpVerifyCode}
                    onChange={e => setTotpVerifyCode(e.target.value)}
                    style={{
                      textAlign: 'center',
                      fontSize: 22,
                      letterSpacing: 4,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      minHeight: 44
                    }}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setTotpSetupModal(false)}
                  disabled={totpEnabling}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={totpEnabling || !totpVerifyCode.trim()}
                >
                  {totpEnabling ? 'Validation...' : 'Valider et activer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: CODES DE SECOURS ─── */}
      {backupCodesModal.open && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                Codes de secours
              </h3>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px',
                fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5
              }}>
                Ces 10 codes sont à usage unique. Enregistrez-les en lieu sûr (gestionnaire de mots de passe ou document sécurisé). Ils ne seront plus réaffichés.
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6,
                padding: 10, background: 'var(--surface2)', borderRadius: 6, border: '1px solid var(--border)'
              }}>
                {backupCodesModal.codes.map((code, idx) => (
                  <div key={idx} style={{
                    padding: '6px 8px', background: 'var(--surface)', borderRadius: 4,
                    border: '1px solid var(--border)', fontFamily: 'monospace',
                    fontSize: 12.5, fontWeight: 600, textAlign: 'center'
                  }}>
                    {code}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={copyBackupCodes}
                  style={{ flex: 1, minHeight: 36, justifyContent: 'center' }}
                >
                  Copier les codes
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={downloadBackupCodes}
                  style={{ flex: 1, minHeight: 36, justifyContent: 'center' }}
                >
                  Télécharger (.txt)
                </button>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setBackupCodesModal({ open: false, codes: [] })}
                style={{ width: '100%', minHeight: 40, justifyContent: 'center' }}
              >
                J'ai sauvegardé mes codes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: DESACTIVER LA 2FA ─── */}
      {showDisable2FAModal && (
        <div className="modal-overlay" onClick={() => setShowDisable2FAModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#dc2626' }}>
                Désactiver la double authentification
              </h3>
              <button
                type="button"
                onClick={() => setShowDisable2FAModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDisable2FA} style={{ display: 'flex', flexDirection: 'column', margin: 0 }}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                  Confirmez votre mot de passe et un code de vérification pour désactiver la protection.
                </p>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12 }}>Mot de passe actuel</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="••••••••"
                    value={disable2FAForm.password}
                    onChange={e => setDisable2FAForm(p => ({ ...p, password: e.target.value }))}
                    style={{ minHeight: 40 }}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12 }}>Code TOTP ou code de secours</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Code à 6 chiffres ou code de secours"
                    value={disable2FAForm.code}
                    onChange={e => setDisable2FAForm(p => ({ ...p, code: e.target.value }))}
                    style={{ minHeight: 40 }}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowDisable2FAModal(false)}
                  disabled={disable2FALoading}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={disable2FALoading || !disable2FAForm.password || !disable2FAForm.code}
                >
                  {disable2FALoading ? 'Désactivation...' : 'Désactiver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
