// src/__tests__/pages/Settings.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { renderWithProviders, MOCK_ADMIN, MOCK_MEDECIN, mockToast } from '../helpers';
import Settings from '../../pages/Settings';

beforeEach(() => { vi.clearAllMocks(); });

describe('Settings page', () => {
  it('renders profile section', () => {
    renderWithProviders(<Settings toast={mockToast} />);
    expect(screen.getByText('👤 Profil')).toBeInTheDocument();
    expect(screen.getByText('admin@planning.com')).toBeInTheDocument();
  });

  it('shows full user name', () => {
    renderWithProviders(<Settings toast={mockToast} />);
    expect(screen.getByText('Système Admin')).toBeInTheDocument();
  });

  it('renders change password form', () => {
    renderWithProviders(<Settings toast={mockToast} />);
    expect(screen.getByText('🔒 Changer le mot de passe')).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(/••••••••/).length).toBeGreaterThan(0);
  });

  it('shows role badge', () => {
    renderWithProviders(<Settings toast={mockToast} />);
    expect(screen.getByText('administrateur')).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    renderWithProviders(<Settings toast={mockToast} />);
    const inputs = screen.getAllByPlaceholderText(/••••••••|Min\./i);
    await userEvent.type(inputs[0], 'OldPass123');
    await userEvent.type(inputs[1], 'NewPass123');
    await userEvent.type(inputs[2], 'DifferentPass');
    await userEvent.click(screen.getByRole('button', { name: /mettre à jour/i }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/correspondent pas/i), 'error'));
  });

  it('shows error when new password too short', async () => {
    renderWithProviders(<Settings toast={mockToast} />);
    const inputs = screen.getAllByPlaceholderText(/••••••••|Min\./i);
    await userEvent.type(inputs[0], 'OldPass');
    await userEvent.type(inputs[1], 'abc');
    await userEvent.type(inputs[2], 'abc');
    await userEvent.click(screen.getByRole('button', { name: /mettre à jour/i }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/caractères/i), 'error'));
  });

  it('calls API and shows success on valid password change', async () => {
    axios.post.mockResolvedValueOnce({ data: { message: 'Mot de passe mis à jour' } });
    renderWithProviders(<Settings toast={mockToast} />);
    const inputs = screen.getAllByPlaceholderText(/••••••••|Min\./i);
    await userEvent.type(inputs[0], 'Admin123!');
    await userEvent.type(inputs[1], 'NewPass123');
    await userEvent.type(inputs[2], 'NewPass123');
    await userEvent.click(screen.getByRole('button', { name: /mettre à jour/i }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/mis à jour/i), 'success'));
  });

  it('renders app info section', () => {
    renderWithProviders(<Settings toast={mockToast} />);
    expect(screen.getByText('ℹ️ À propos')).toBeInTheDocument();
    expect(screen.getByText('Node.js + Express')).toBeInTheDocument();
  });
});
