// src/__tests__/pages/ResetPassword.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ResetPassword from '../../pages/ResetPassword';
import axios from 'axios';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('axios');

const renderWithRouter = (ui) => {
  return render(
    <MemoryRouter initialEntries={['/reset-password?token=valid-token']}>
      <Routes>
        <Route path="/reset-password" element={ui} />
      </Routes>
    </MemoryRouter>
  );
};

describe('ResetPassword page', () => {
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates token on mount', async () => {
    axios.get.mockResolvedValueOnce({ data: { valid: true } });
    renderWithRouter(<ResetPassword toast={mockToast} />);

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith('http://localhost:8083/api/auth/reset-password?token=valid-token');
      expect(screen.getByPlaceholderText(/Nouveau mot de passe/i)).toBeInTheDocument();
    });
  });

  it('shows error if token is invalid', async () => {
    axios.get.mockRejectedValueOnce({ response: { data: { message: 'Token invalide' } } });
    renderWithRouter(<ResetPassword toast={mockToast} />);

    await waitFor(() => {
      expect(screen.getByText(/Le lien de réinitialisation est invalide ou a expiré/i)).toBeInTheDocument();
    });
  });

  it('shows error if passwords do not match', async () => {
    axios.get.mockResolvedValueOnce({ data: { valid: true } });
    renderWithRouter(<ResetPassword toast={mockToast} />);

    await waitFor(() => screen.getByPlaceholderText(/Nouveau mot de passe/i));
    
    await userEvent.type(screen.getByPlaceholderText(/Nouveau mot de passe/i), 'password123');
    await userEvent.type(screen.getByPlaceholderText(/Confirmer le mot de passe/i), 'different');
    
    fireEvent.click(screen.getByRole('button', { name: /Mettre à jour le mot de passe/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('Les mots de passe ne correspondent pas', 'error');
    });
  });

  it('successfully resets password', async () => {
    axios.get.mockResolvedValueOnce({ data: { valid: true } });
    axios.post.mockResolvedValueOnce({ data: { message: 'Succès' } });
    
    renderWithRouter(<ResetPassword toast={mockToast} />);

    await waitFor(() => screen.getByPlaceholderText(/Nouveau mot de passe/i));

    await userEvent.type(screen.getByPlaceholderText(/Nouveau mot de passe/i), 'password123');
    await userEvent.type(screen.getByPlaceholderText(/Confirmer le mot de passe/i), 'password123');

    fireEvent.click(screen.getByRole('button', { name: /Mettre à jour le mot de passe/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('http://localhost:8083/api/auth/reset-password', {
        token: 'valid-token',
        password: 'password123'
      });
      expect(mockToast).toHaveBeenCalledWith('Mot de passe réinitialisé avec succès', 'success');
    });
  });
});
