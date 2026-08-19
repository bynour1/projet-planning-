import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function ForcePassword({ toast }) {
  const { refreshUser } = useAuth();
  const [form, setForm] = useState({ new_password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.new_password !== form.confirm)
      return toast('Les mots de passe ne correspondent pas', 'error');
    if (form.new_password.length < 6)
      return toast('Minimum 6 caractères', 'error');

    setLoading(true);
    try {
      await axios.post('/api/auth/force-change-password', { new_password: form.new_password });
      toast('Mot de passe défini ! Bienvenue.', 'success');
      await refreshUser();
    } catch (err) {
      toast(err.response?.data?.message || 'Erreur', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #fef9c3 0%, #fff 50%, #e0f2fe 100%)',
      padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div className="card" style={{ boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 36 }}>🔑</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>Définir votre mot de passe</h2>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
              C'est votre première connexion. Choisissez un mot de passe sécurisé.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label>Nouveau mot de passe</label>
              <input className="input" type="password" placeholder="Min. 6 caractères"
                value={form.new_password} onChange={e => setForm(p => ({ ...p, new_password: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Confirmer</label>
              <input className="input" type="password" placeholder="Répétez le mot de passe"
                value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ height: 42 }}>
              {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : '✓ Confirmer'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
