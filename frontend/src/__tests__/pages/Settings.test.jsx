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
    expect(screen.getByText(/Mon Profil/i)).toBeInTheDocument();
    expect(screen.getAllByText('admin@planning.com').length).toBeGreaterThan(0);
  });

  it('shows full user name', () => {
    renderWithProviders(<Settings toast={mockToast} />);
    expect(screen.getByText('Système Admin')).toBeInTheDocument();
  });

  it('renders change password form in security tab', async () => {
    renderWithProviders(<Settings toast={mockToast} />);
    await userEvent.click(screen.getByText('Sécurité & Accès'));
    expect(screen.getByRole('heading', { level: 3, name: /^Mot de passe$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mettre à jour le mot de passe/i })).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(/••••••••/).length).toBeGreaterThan(0);
  });

  it('shows role badge', () => {
    renderWithProviders(<Settings toast={mockToast} />);
    expect(screen.getAllByText('Administrateur').length).toBeGreaterThan(0);
  });

  it('shows error when passwords do not match', async () => {
    renderWithProviders(<Settings toast={mockToast} />);
    await userEvent.click(screen.getByText('Sécurité & Accès'));
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'OldPass123');
    await userEvent.type(screen.getByPlaceholderText('Minimum 6 caractères'), 'NewPass123');
    await userEvent.type(screen.getByPlaceholderText('Confirmation du mot de passe'), 'DifferentPass');
    await userEvent.click(screen.getByRole('button', { name: /Mettre à jour le mot de passe/i }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/correspondent pas/i), 'error'));
  });

  it('shows error when new password too short', async () => {
    renderWithProviders(<Settings toast={mockToast} />);
    await userEvent.click(screen.getByText('Sécurité & Accès'));
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'OldPass');
    await userEvent.type(screen.getByPlaceholderText('Minimum 6 caractères'), 'abc');
    await userEvent.type(screen.getByPlaceholderText('Confirmation du mot de passe'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: /Mettre à jour le mot de passe/i }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/caractères/i), 'error'));
  });

  it('calls API and shows success on valid password change', async () => {
    axios.put = vi.fn().mockResolvedValueOnce({ data: { message: 'Mot de passe mis à jour' } });
    axios.post.mockResolvedValueOnce({ data: { message: 'Mot de passe mis à jour' } });
    renderWithProviders(<Settings toast={mockToast} />);
    await userEvent.click(screen.getByText('Sécurité & Accès'));
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'Admin123!');
    await userEvent.type(screen.getByPlaceholderText('Minimum 6 caractères'), 'NewPass123');
    await userEvent.type(screen.getByPlaceholderText('Confirmation du mot de passe'), 'NewPass123');
    await userEvent.click(screen.getByRole('button', { name: /Mettre à jour le mot de passe/i }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/mis à jour/i), 'success'));
  });

  it('renders all 4 security cards in order (Mot de passe, 2FA, Connexion rapide, Mes appareils)', async () => {
    renderWithProviders(<Settings toast={mockToast} />);
    await userEvent.click(screen.getByText('Sécurité & Accès'));

    expect(screen.getByRole('heading', { level: 3, name: /^Mot de passe$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /^Double authentification$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /^Connexion rapide$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /^Mes appareils$/i })).toBeInTheDocument();
  });

  it('renders À propos card in Informations tab and respects admin visibility', async () => {
    // Admin view
    const { unmount } = renderWithProviders(<Settings toast={mockToast} />, { user: MOCK_ADMIN });
    await userEvent.click(screen.getByRole('button', { name: /^Informations$/i }));

    expect(screen.getByRole('heading', { level: 3, name: /^À propos$/i })).toBeInTheDocument();
    expect(screen.getByText(/GMT Ariana — Santé au Travail/i)).toBeInTheDocument();
    expect(screen.getByText(/v2\.4\.0/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Résoudre un problème d'affichage/i })).toBeInTheDocument();
    expect(screen.getByTestId('admin-system-diagnostics')).toBeInTheDocument();
    unmount();

    // Non-admin view (Medecin)
    renderWithProviders(<Settings toast={mockToast} />, { user: MOCK_MEDECIN });
    await userEvent.click(screen.getByRole('button', { name: /^Informations$/i }));

    expect(screen.getByRole('heading', { level: 3, name: /^À propos$/i })).toBeInTheDocument();
    expect(screen.queryByTestId('admin-system-diagnostics')).not.toBeInTheDocument();
    expect(screen.queryByText(/Node\.js/i)).not.toBeInTheDocument();
  });

  describe('Notifications tab', () => {
    it('renders clean user view with single status, switches and privacy mention', async () => {
      renderWithProviders(<Settings toast={mockToast} />);
      await userEvent.click(screen.getByRole('button', { name: /Notifications/i }));

      // Clean title & single global status badge
      expect(screen.getByRole('heading', { level: 3, name: /^Notifications$/i })).toBeInTheDocument();
      const statusBadge = screen.getByTestId('notif-global-status');
      expect(statusBadge).toBeInTheDocument();

      // Alert types switches
      expect(screen.getByText('Plannings')).toBeInTheDocument();
      expect(screen.getByText('Chat')).toBeInTheDocument();
      expect(screen.getByText('Tournées')).toBeInTheDocument();

      // Test button
      expect(screen.getByRole('button', { name: /Tester la notification/i })).toBeInTheDocument();

      // Confidentiality mention
      expect(screen.getByText(/aucune donnée médicale ni nom de patient n'apparaît dans les notifications/i)).toBeInTheDocument();
    });

    it('renders advanced diagnostics section for admin users', async () => {
      renderWithProviders(<Settings toast={mockToast} />, { user: MOCK_ADMIN });
      await userEvent.click(screen.getByRole('button', { name: /Notifications/i }));

      const advancedSection = screen.getByTestId('admin-advanced-diagnostics');
      expect(advancedSection).toBeInTheDocument();
      expect(screen.getByText(/Diagnostic avancé \(Administrateur\)/i)).toBeInTheDocument();
    });

    it('hides advanced diagnostics section completely for non-admin users (medecin)', async () => {
      renderWithProviders(<Settings toast={mockToast} />, { user: MOCK_MEDECIN });
      await userEvent.click(screen.getByRole('button', { name: /Notifications/i }));

      expect(screen.queryByTestId('admin-advanced-diagnostics')).not.toBeInTheDocument();
      expect(screen.queryByText(/Diagnostic avancé/i)).not.toBeInTheDocument();
    });
  });
});
