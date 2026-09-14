// src/__tests__/pages/ForgotPassword.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ForgotPassword from '../../pages/ForgotPassword';
import axios from 'axios';

vi.mock('axios');

describe('ForgotPassword page', () => {
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<ForgotPassword toast={mockToast} />);
    expect(screen.getByText(/Mot de passe oublié/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/medecin@gmt-ariana.tn/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recevoir le lien par Email/i })).toBeInTheDocument();
  });

  it('shows error if email is empty', async () => {
    render(<ForgotPassword toast={mockToast} />);
    const form = screen.getByRole('button', { name: /Recevoir le lien par Email/i }).closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('Veuillez entrer votre adresse email', 'error');
    });
  });

  it('calls API and shows success message', async () => {
    axios.post.mockResolvedValueOnce({ data: { message: 'Email envoyé' } });
    render(<ForgotPassword toast={mockToast} />);

    await userEvent.type(screen.getByPlaceholderText(/medecin@gmt-ariana.tn/i), 'test@example.com');
    fireEvent.click(screen.getByRole('button', { name: /Recevoir le lien par Email/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/api/auth/forgot-password', {
        identifier: 'test@example.com',
        email: 'test@example.com',
        method: 'email',
      });
      expect(screen.getByText(/Si cette adresse email correspond à un compte/i)).toBeInTheDocument();
    });
  });

  it('handles API error', async () => {
    axios.post.mockRejectedValueOnce({ response: { data: { message: 'Erreur serveur' } } });
    render(<ForgotPassword toast={mockToast} />);

    await userEvent.type(screen.getByPlaceholderText(/medecin@gmt-ariana.tn/i), 'test@example.com');
    fireEvent.click(screen.getByRole('button', { name: /Recevoir le lien par Email/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('Erreur serveur', 'error');
    });
  });
});
