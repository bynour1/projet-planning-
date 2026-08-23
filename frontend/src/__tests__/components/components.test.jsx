// src/__tests__/components/components.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, MOCK_ADMIN, MOCK_MEDECIN, mockToast } from '../helpers';

import { ToastContainer } from '../../components/Toast';
import ConfirmDialog      from '../../components/ConfirmDialog';
import Sidebar            from '../../components/Sidebar';

// ──────────────────────────────────────────────────────────────
// ToastContainer
// ──────────────────────────────────────────────────────────────
describe('ToastContainer', () => {
  it('renders nothing with empty toasts', () => {
    const { container } = render(<ToastContainer toasts={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders success toast', () => {
    render(<ToastContainer toasts={[{ id:1, message:'Sauvegardé !', type:'success' }]} />);
    expect(screen.getByText('Sauvegardé !')).toBeInTheDocument();
    expect(document.querySelector('.toast-success')).toBeInTheDocument();
  });

  it('renders error toast', () => {
    render(<ToastContainer toasts={[{ id:2, message:'Erreur serveur', type:'error' }]} />);
    expect(screen.getByText('Erreur serveur')).toBeInTheDocument();
    expect(document.querySelector('.toast-error')).toBeInTheDocument();
  });

  it('renders info toast', () => {
    render(<ToastContainer toasts={[{ id:3, message:'Info message', type:'info' }]} />);
    expect(document.querySelector('.toast-info')).toBeInTheDocument();
  });

  it('renders multiple toasts', () => {
    render(<ToastContainer toasts={[
      { id:1, message:'Toast 1', type:'success' },
      { id:2, message:'Toast 2', type:'error' },
    ]} />);
    expect(screen.getByText('Toast 1')).toBeInTheDocument();
    expect(screen.getByText('Toast 2')).toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────────
// ConfirmDialog
// ──────────────────────────────────────────────────────────────
describe('ConfirmDialog', () => {
  const onConfirm = vi.fn();
  const onCancel  = vi.fn();
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders title and message', () => {
    render(<ConfirmDialog title="Supprimer ?" message="Irréversible." onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByText('Supprimer ?')).toBeInTheDocument();
    expect(screen.getByText('Irréversible.')).toBeInTheDocument();
  });

  it('calls onConfirm when Confirmer clicked', async () => {
    render(<ConfirmDialog title="X" message="Y" onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /confirmer/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Annuler clicked', async () => {
    render(<ConfirmDialog title="X" message="Y" onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /annuler/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when ✕ clicked', async () => {
    render(<ConfirmDialog title="X" message="Y" onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when overlay clicked', async () => {
    render(<ConfirmDialog title="X" message="Y" onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(document.querySelector('.modal-overlay'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses danger button class when danger=true', () => {
    render(<ConfirmDialog title="X" message="Y" danger onConfirm={onConfirm} onCancel={onCancel} />);
    expect(document.querySelector('.btn-danger')).toBeInTheDocument();
  });

  it('uses primary button class when danger=false', () => {
    render(<ConfirmDialog title="X" message="Y" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(document.querySelector('.btn-primary')).toBeInTheDocument();
  });

  it('uses default title "Confirmation" when none provided', () => {
    render(<ConfirmDialog message="Msg" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByText('Confirmation')).toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────────
// Sidebar
// ──────────────────────────────────────────────────────────────
describe('Sidebar', () => {
  it('renders logo and app name', () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText(/GMT Ariana|Planning Médical/i)).toBeInTheDocument();
  });

  it('shows all nav items for admin', () => {
    renderWithProviders(<Sidebar />, { user: MOCK_ADMIN });
    expect(screen.getByText('Tableau de bord')).toBeInTheDocument();
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Utilisateurs')).toBeInTheDocument();
    expect(screen.getByText('Paramètres')).toBeInTheDocument();
  });

  it('hides Utilisateurs link for medecin', () => {
    renderWithProviders(<Sidebar />, { user: MOCK_MEDECIN });
    expect(screen.queryByText('Utilisateurs')).not.toBeInTheDocument();
  });

  it('shows user name in footer', () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText(/Système Admin/i)).toBeInTheDocument();
  });

  it('shows role in footer', () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText('administrateur')).toBeInTheDocument();
  });

  it('shows online users count in chat link', () => {
    renderWithProviders(<Sidebar />, {
      socketOverrides: { onlineUsers: [MOCK_ADMIN, MOCK_MEDECIN] },
    });
    expect(screen.getByText('2 en ligne')).toBeInTheDocument();
  });

  it('calls logout on button click', async () => {
    const mockLogout = vi.fn();
    renderWithProviders(<Sidebar />, { authOverrides: { logout: mockLogout } });
    await userEvent.click(screen.getByText(/Déconnexion/i));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('shows only planning, clino and settings for chauffeur', () => {
    const MOCK_CHAUFFEUR = { id: 99, nom: 'Ali', prenom: 'Chauffeur', email: 'chauffeur@gmt.tn', role: 'chauffeur' };
    renderWithProviders(<Sidebar />, { user: MOCK_CHAUFFEUR });
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByText('Clino Mobile')).toBeInTheDocument();
    expect(screen.getByText('Paramètres')).toBeInTheDocument();
    expect(screen.queryByText('Tableau de bord')).not.toBeInTheDocument();
    expect(screen.queryByText('Chat')).not.toBeInTheDocument();
    expect(screen.queryByText('Utilisateurs')).not.toBeInTheDocument();
  });
});

