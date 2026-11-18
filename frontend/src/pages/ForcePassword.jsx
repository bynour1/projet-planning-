import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function ForcePassword({ toast, tempToken = null, onSuccess = null }) {
  const { refreshUser } = useAuth();
  const [form, setForm] = useState({ new_password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.new_password !== form.confirm)
      return toast('Les mots de passe ne correspondent pas', 'error');
    if (form.new_password.length < 8)
      return toast('Le mot de passe doit contenir au moins 8 caractères', 'error');
    if (!/[a-zA-Z]/.test(form.new_password) || !/[0-9]/.test(form.new_password))
      return toast('Le mot de passe doit contenir à la fois des lettres et des chiffres', 'error');

    setLoading(true);
    try {
      const headers = tempToken ? { Authorization: `Bearer ${tempToken}` } : {};
      const { data } = await axios.post(
        '/api/auth/force-change-password',
        { new_password: form.new_password, tempToken },
        { headers }
      );

      toast(data.message || 'Mot de passe défini avec succès !', 'success');

      if (data.requires2FASetup && onSuccess) {
        return onSuccess(data);
      }

      if (data.token) {
        sessionStorage.setItem('pm_token', data.token);
        if (data.user) sessionStorage.setItem('pm_user', JSON.stringify(data.user));
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
      }

      if (onSuccess) {
        onSuccess(data);
      } else {
        if (refreshUser) await refreshUser();
        window.location.reload();
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur lors de la mise à jour du mot de passe', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-main, #f8fafc)',
      padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div className="card" style={{ boxShadow: 'var(--shadow-lg, 0 10px 25px -5px rgba(0,0,0,0.08))', border: '1px solid var(--border)' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 12, background: 'var(--surface-2, #f1f5f9)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border)', color: 'var(--primary, #0284c7)'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 12, color: 'var(--text)' }}>Définir votre mot de passe</h2>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
              C'est votre première connexion. Choisissez un mot de passe sécurisé d'au moins 8 caractères (différent du provisoire).
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label>Nouveau mot de passe personnel</label>
              <input className="input" type="password" placeholder="Min. 8 caractères (lettres et chiffres)"
                value={form.new_password} onChange={e => setForm(p => ({ ...p, new_password: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Confirmer</label>
              <input className="input" type="password" placeholder="Répétez le mot de passe"
                value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ height: 42, fontWeight: 600 }}>
              {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Confirmer'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
