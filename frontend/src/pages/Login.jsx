import { useState, useEffect } from 'react';
import axios from 'axios';
import { startAuthentication } from '@simplewebauthn/browser';
import { useAuth } from '../context/AuthContext';
import PWAInstallBanner from '../components/PWAInstallBanner';
import ForcePassword from './ForcePassword';

export default function Login({ toast }) {
  const { login } = useAuth();
  const [form, setForm] = useState({
    email: (typeof window !== 'undefined' ? localStorage.getItem('gmt_remembered_email') : '') || '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const isBiometricSupported = typeof window !== 'undefined' && Boolean(window.PublicKeyCredential);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('gmt_bio_id');
    }
  }, []);

  // Changement obligatoire de mot de passe provisoire (1ère connexion)
  const [forcePasswordChange, setForcePasswordChange] = useState({
    active: false,
    tempToken: null,
    userId: null,
  });

  // 2FA TOTP standard (au login)
  const [twoFA, setTwoFA] = useState({
    required: false,
    tempToken: null,
    userId: null,
    code: '',
    isBackup: false,
    rememberDevice: true,
    loading: false,
  });

  // 2FA TOTP obligatoire (onboarding requis pour certains rôles : administrateur, médecin...)
  const [setup2FA, setSetup2FA] = useState({
    active: false,
    tempToken: null,
    userId: null,
    qrCode: null,
    manualKey: null,
    code: '',
    step: 'qr', // 'qr' | 'codes'
    backupCodes: [],
    sessionData: null,
    loading: false,
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(form.email, form.password);
      if (res?.requiresPasswordChange) {
        setForcePasswordChange({
          active: true,
          tempToken: res.tempToken,
          userId: res.userId,
        });
        toast('Première connexion : veuillez définir votre mot de passe personnel', 'info');
      } else if (res?.requires2FA) {
        setTwoFA({
          required: true,
          tempToken: res.tempToken,
          userId: res.userId,
          code: '',
          isBackup: false,
          loading: false,
        });
        toast('Double authentification requise : entrez votre code Authenticator', 'info');
      } else if (res?.requires2FASetup) {
        await startMandatorySetup(res.tempToken, res.userId);
      }
    } catch (err) {
      if (err.response?.data?.requiresPasswordChange) {
        setForcePasswordChange({
          active: true,
          tempToken: err.response.data.tempToken,
          userId: err.response.data.userId,
        });
        toast('Première connexion : veuillez définir votre mot de passe personnel', 'info');
      } else if (err.response?.data?.requires2FASetup) {
        await startMandatorySetup(err.response.data.tempToken, err.response.data.userId);
      } else {
        toast(err.response?.data?.message || err.message || 'Identifiants incorrects', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  async function startMandatorySetup(tempToken, userId) {
    setLoading(true);
    try {
      const { data } = await axios.post(
        '/api/auth/2fa/setup',
        { tempToken },
        { headers: { Authorization: `Bearer ${tempToken}` } }
      );
      setSetup2FA({
        active: true,
        tempToken,
        userId,
        qrCode: data.qr_code,
        manualKey: data.manual_key,
        code: '',
        step: 'qr',
        backupCodes: [],
        sessionData: null,
        loading: false,
      });
      toast('Configuration 2FA obligatoire : veuillez scanner le QR code pour sécuriser votre compte', 'info');
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors de l’initialisation de la double authentification', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmMandatorySetup(e) {
    e.preventDefault();
    if (!setup2FA.code.trim()) return;
    setSetup2FA(s => ({ ...s, loading: true }));
    try {
      const { data } = await axios.post(
        '/api/auth/2fa/enable',
        { code: setup2FA.code.trim(), tempToken: setup2FA.tempToken },
        { headers: { Authorization: `Bearer ${setup2FA.tempToken}` } }
      );

      if (data.backup_codes && data.backup_codes.length > 0) {
        setSetup2FA(s => ({
          ...s,
          step: 'codes',
          backupCodes: data.backup_codes,
          sessionData: data,
          loading: false,
        }));
        toast('Double authentification activée avec succès ! Enregistrez vos 10 codes de secours.', 'success');
      } else {
        finishLogin(data);
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Code de vérification invalide. Vérifiez l’heure de votre appareil.', 'error');
      setSetup2FA(s => ({ ...s, loading: false }));
    }
  }

  function finishLogin(data) {
    const session = data || setup2FA.sessionData;
    if (session?.token) {
      sessionStorage.setItem('pm_token', session.token);
      sessionStorage.setItem('pm_user', JSON.stringify(session.user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${session.token}`;
      toast('Connexion réussie ! Bienvenue sur la plateforme.', 'success');
      window.location.reload();
    }
  }

  function copyBackupCodes() {
    if (!setup2FA.backupCodes.length) return;
    const text =
      "CODES DE SECOURS 2FA — GMT ARIANA\n" +
      "Compte : " + (form.email || 'Utilisateur') + "\n" +
      "Date : " + new Date().toLocaleString() + "\n" +
      "Conservez ces codes en lieu sûr. Chaque code est à usage unique.\n\n" +
      setup2FA.backupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n');
    navigator.clipboard.writeText(text);
    toast('10 codes de secours copiés dans le presse-papier !', 'success');
  }

  function downloadBackupCodes() {
    if (!setup2FA.backupCodes.length) return;
    const text =
      "CODES DE SECOURS 2FA — GMT ARIANA\n" +
      "Compte : " + (form.email || 'Utilisateur') + "\n" +
      "Date : " + new Date().toLocaleString() + "\n" +
      "Conservez ces codes en lieu sûr. Chaque code est à usage unique.\n\n" +
      setup2FA.backupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codes-secours-2fa-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Fichier des codes de secours téléchargé !', 'success');
  }

  async function handleBiometricLogin() {
    if (!window.PublicKeyCredential) {
      return toast("Votre appareil ne supporte pas l'authentification biométrique (WebAuthn)", "error");
    }

    const emailToUse = (form.email || (typeof window !== 'undefined' ? localStorage.getItem('gmt_remembered_email') : '') || '').trim();
    if (!emailToUse) {
      return toast("Veuillez d'abord renseigner votre adresse email pour vous connecter par biométrie.", "info");
    }

    setBioLoading(true);
    try {
      // 1. Récupération des options d'authentification FIDO2
      const { data: options } = await axios.post('/api/auth/biometric/login/options', { email: emailToUse });

      // 2. Déclenchement du capteur matériel local
      const authResponse = await startAuthentication({ optionsJSON: options });

      // 3. Validation de la signature et obtention de la session
      const { data } = await axios.post('/api/auth/biometric/login/verify', {
        response: authResponse,
        email: emailToUse,
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem('gmt_remembered_email', emailToUse);
        localStorage.removeItem('gmt_bio_id');
      }

      // Si changement de mot de passe obligatoire
      if (data.requiresPasswordChange || data.mustChangePassword) {
        setForcePasswordChange({
          active: true,
          tempToken: data.tempToken,
          userId: data.userId || data.user?.id,
        });
        toast(data.message || 'Première connexion : changement de mot de passe obligatoire.', 'info');
        return;
      }

      finishLogin(data);
    } catch (err) {
      console.warn('[WebAuthn Login Error]:', err);
      let errorMsg = 'Échec de la reconnaissance biométrique. Vous pouvez vous connecter avec votre mot de passe.';
      if (err.name === 'NotAllowedError' || err.message?.includes('cancel') || err.message?.includes('abort')) {
        errorMsg = 'Opération biométrique annulée par l\'utilisateur.';
      } else if (err.name === 'NotSupportedError') {
        errorMsg = 'Aucun capteur biométrique ou verrouillage d\'écran configuré sur cet appareil.';
      } else if (err.name === 'SecurityError' || (typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost')) {
        errorMsg = 'Une connexion sécurisée (HTTPS) est requise pour utiliser la biométrie.';
      } else if (err.response?.data?.message) {
        errorMsg = err.response.data.message;
      }
      toast(errorMsg, 'error');
    } finally {
      setBioLoading(false);
    }
  }

  async function handleVerify2FA(e) {
    e.preventDefault();
    if (!twoFA.code.trim()) return;

    setTwoFA(t => ({ ...t, loading: true }));
    try {
      const { data } = await axios.post('/api/auth/2fa/verify', {
        tempToken: twoFA.tempToken,
        code: twoFA.code.trim(),
        rememberDevice: !!twoFA.rememberDevice,
      });

      sessionStorage.setItem('pm_token', data.token);
      sessionStorage.setItem('pm_user', JSON.stringify(data.user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
      toast('Connexion réussie !', 'success');
      window.location.reload();
    } catch (err) {
      toast(err.response?.data?.message || 'Code ou session de vérification invalide ou expiré', 'error');
    } finally {
      setTwoFA(t => ({ ...t, loading: false }));
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #ecfdf5 100%)',
      padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Logo GMT Ariana */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <img
            src="/logo-gmt.png"
            alt="GMT Ariana"
            style={{
              width: 100, height: 100, borderRadius: '50%', objectFit: 'cover',
              marginBottom: 12, boxShadow: '0 4px 18px rgba(14,100,180,.25)',
              border: '3px solid var(--border)',
            }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Planning Médical</h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>GMT Ariana — Groupement de Médecine du Travail</p>
        </div>

        {/* ─── CAS 0 : CHANGEMENT OBLIGATOIRE DE MOT DE PASSE (1ÈRE CONNEXION) ─── */}
        {forcePasswordChange.active ? (
          <ForcePassword
            toast={toast}
            tempToken={forcePasswordChange.tempToken}
            onSuccess={async (nextData) => {
              if (nextData?.requires2FASetup) {
                setForcePasswordChange({ active: false, tempToken: null, userId: null });
                await startMandatorySetup(nextData.tempToken, nextData.userId);
              } else {
                finishLogin(nextData);
              }
            }}
          />
        ) : setup2FA.active ? (
          setup2FA.step === 'qr' ? (
            <div className="card" style={{ boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)'
                }}>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                    2FA Obligatoire pour votre rôle
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
                    Configuration de votre application Authenticator
                  </p>
                </div>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px 0', lineHeight: 1.4 }}>
                  <strong>1.</strong> Ouvrez <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> ou <strong>Aegis</strong> sur votre smartphone.
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.4 }}>
                  <strong>2.</strong> Scannez le QR Code ci-dessous ou saisissez manuellement la clé secrète.
                </p>
              </div>

              {setup2FA.qrCode && (
                <div style={{ textAlign: 'center', marginBottom: 14 }}>
                  <img
                    src={setup2FA.qrCode}
                    alt="QR Code 2FA"
                    style={{
                      width: 170,
                      height: 170,
                      display: 'inline-block',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      padding: 6,
                      background: '#fff',
                    }}
                  />
                </div>
              )}

              {setup2FA.manualKey && (
                <div style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  background: '#f1f5f9',
                  padding: '6px 10px',
                  borderRadius: 6,
                  textAlign: 'center',
                  marginBottom: 16,
                  wordBreak: 'break-all',
                  color: '#475569',
                }}>
                  Clé manuelle : <strong>{setup2FA.manualKey}</strong>
                </div>
              )}

              <form onSubmit={handleConfirmMandatorySetup} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label style={{ fontSize: 12, fontWeight: 600 }}>
                    <strong>3.</strong> Entrez le code à 6 chiffres affiché sur votre téléphone
                  </label>
                  <input
                    className="input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000 000"
                    value={setup2FA.code}
                    onChange={e => setSetup2FA(s => ({ ...s, code: e.target.value.replace(/\D/g, '') }))}
                    style={{
                      textAlign: 'center',
                      fontSize: 24,
                      letterSpacing: 6,
                      fontWeight: 800,
                      height: 48,
                      fontFamily: 'monospace',
                    }}
                    required
                    autoFocus
                  />
                </div>

                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={setup2FA.loading || setup2FA.code.length < 6}
                  style={{ height: 42, fontSize: 14, justifyContent: 'center' }}
                >
                  {setup2FA.loading ? (
                    <>
                      <span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} />
                      Activation en cours...
                    </>
                  ) : (
                    'Activer et continuer'
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSetup2FA({ active: false, tempToken: null, userId: null, qrCode: null, manualKey: null, code: '', step: 'qr', backupCodes: [], sessionData: null, loading: false })}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-3)',
                    cursor: 'pointer',
                    fontSize: 12,
                    textAlign: 'center',
                    marginTop: 4,
                  }}
                >
                  Annuler et revenir à la connexion
                </button>
              </form>
            </div>
          ) : (
            /* Étape 2 de l'onboarding : affichage et sauvegarde obligatoire des 10 codes de secours */
            <div className="card" style={{ boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a'
                }}>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                    Codes de secours (Sauvegarde)
                  </h3>
                  <p style={{ fontSize: 12, color: '#16a34a', margin: '2px 0 0', fontWeight: 600 }}>
                    Double authentification activée avec succès
                  </p>
                </div>
              </div>

              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>
                <strong>Important :</strong> Conservez ces 10 codes hors de votre téléphone (gestionnaire de mots de passe ou impression sécurisée). Chacun est à <strong>usage unique</strong> en cas de perte de votre smartphone.
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
                background: '#f8fafc',
                padding: 12,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                marginBottom: 16,
              }}>
                {setup2FA.backupCodes.map((code, idx) => (
                  <div key={idx} style={{
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: 13,
                    textAlign: 'center',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '6px 8px',
                    color: '#0f172a',
                  }}>
                    {idx + 1}. {code}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={copyBackupCodes}
                  style={{ flex: 1, fontSize: 13, justifyContent: 'center' }}
                >
                  Copier les codes
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={downloadBackupCodes}
                  style={{ flex: 1, fontSize: 13, justifyContent: 'center' }}
                >
                  Télécharger (.txt)
                </button>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => finishLogin()}
                style={{ width: '100%', height: 44, fontSize: 14, fontWeight: 700, justifyContent: 'center' }}
              >
                J'ai sauvegardé mes codes — Continuer
              </button>
            </div>
          )
        ) : !twoFA.required ? (
          /* ─── CAS 2 : CONNEXION NORMALE MOT DE PASSE ─── */
          <div className="card" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label>Email ou N° Téléphone</label>
                <input
                  className="input"
                  type="text"
                  placeholder="vous@exemple.com ou 98 123 456"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Mot de passe</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    required
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}
                    title={showPwd ? 'Masquer' : 'Afficher'}
                  >
                    {showPwd ? (
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

              <button className="btn btn-primary" type="submit" disabled={loading || bioLoading}
                style={{ marginTop: 4, height: 42, fontSize: 14, fontWeight: 700, justifyContent: 'center' }}>
                {loading && <span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} />}
                <span>Se connecter</span>
              </button>

              {/* Biometric Login Button */}
              {isBiometricSupported && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleBiometricLogin}
                  disabled={loading || bioLoading}
                  style={{ height: 40, fontSize: 13, fontWeight: 600, justifyContent: 'center' }}
                >
                  {bioLoading && <span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} />}
                  <span>Se connecter avec empreinte / Face ID</span>
                </button>
              )}

              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <a href="/forgot-password" style={{
                  fontSize: 12.5, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500,
                }}>
                  Mot de passe oublié ?
                </a>
              </div>
            </form>
          </div>
        ) : (
          /* ─── CAS 3 : SAISIE DU CODE 2FA TOTP (LOGIN ÉTAPE 2) ─── */
          <div className="card" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)',
              }}>
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  {twoFA.isBackup ? 'Code de secours' : 'Double authentification TOTP'}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
                  GMT Ariana — Accès sécurisé
                </p>
              </div>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.5 }}>
              {!twoFA.isBackup
                ? 'Saisissez le code temporaire à 6 chiffres affiché sur votre application Authenticator.'
                : 'Saisissez l’un de vos codes de secours (8 caractères) générés lors de l’activation.'}
            </p>

            <form onSubmit={handleVerify2FA} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!twoFA.isBackup ? (
                <div className="form-group">
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Code de vérification (6 chiffres)</label>
                  <input
                    className="input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000 000"
                    value={twoFA.code}
                    onChange={e => setTwoFA(t => ({ ...t, code: e.target.value.replace(/\D/g, '') }))}
                    style={{
                      textAlign: 'center',
                      fontSize: 26,
                      letterSpacing: 6,
                      fontWeight: 800,
                      height: 52,
                      fontFamily: 'monospace',
                    }}
                    required
                    autoFocus
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Code de secours (8 caractères)</label>
                  <input
                    className="input"
                    type="text"
                    maxLength={10}
                    placeholder="Ex: A1B2C3D4"
                    value={twoFA.code}
                    onChange={e => setTwoFA(t => ({ ...t, code: e.target.value.toUpperCase() }))}
                    style={{
                      textAlign: 'center',
                      fontSize: 20,
                      letterSpacing: 3,
                      fontWeight: 700,
                      height: 50,
                      fontFamily: 'monospace',
                      textTransform: 'uppercase',
                    }}
                    required
                    autoFocus
                  />
                </div>
              )}

              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text-2)',
                padding: '10px 12px',
                background: 'var(--surface2)',
                borderRadius: 8,
                border: '1px solid var(--border)',
                userSelect: 'none',
                marginTop: 2,
                marginBottom: 4,
              }}>
                <input
                  type="checkbox"
                  checked={twoFA.rememberDevice}
                  onChange={e => setTwoFA(t => ({ ...t, rememberDevice: e.target.checked }))}
                  style={{ width: 17, height: 17, marginTop: 2, accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
                />
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--text)', display: 'block' }}>
                    Se souvenir de cet appareil 30 jours
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'block', marginTop: 1 }}>
                    Ne plus redemander le code 2FA sur ce navigateur (7 jours pour les comptes administrateurs)
                  </span>
                </div>
              </label>

              <button
                className="btn btn-primary"
                type="submit"
                disabled={twoFA.loading || !twoFA.code.trim()}
                style={{ height: 42, fontSize: 14, fontWeight: 700, justifyContent: 'center' }}
              >
                {twoFA.loading ? (
                  <>
                    <span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} />
                    Vérification...
                  </>
                ) : (
                  'Valider la connexion'
                )}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setTwoFA(t => ({ ...t, isBackup: !t.isBackup, code: '' }))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  {twoFA.isBackup ? 'Utiliser l’application Authenticator' : 'Utiliser un code de secours'}
                </button>

                <button
                  type="button"
                  onClick={() => setTwoFA({ required: false, tempToken: null, userId: null, code: '', isBackup: false, loading: false })}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-3)',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: 0,
                  }}
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <PWAInstallBanner />
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 20 }}>
          Accès réservé au personnel autorisé — GMT Ariana
        </p>
      </div>
    </div>
  );
}
