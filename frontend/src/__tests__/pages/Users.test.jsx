// src/__tests__/pages/Users.test.jsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { renderWithProviders, MOCK_ADMIN, mockToast } from '../helpers';
import Users from '../../pages/Users';

beforeEach(() => { vi.clearAllMocks(); });

const USERS_DATA = [
  { id:1, nom:'Admin', prenom:'Système', email:'admin@planning.com', role:'administrateur', is_active:1, created_at:'2026-01-01' },
  { id:2, nom:'Benali', prenom:'Sophie', email:'sophie@planning.com', role:'medecin', is_active:1, created_at:'2026-01-02' },
  { id:3, nom:'Hamdi', prenom:'Youssef', email:'youssef@planning.com', role:'technicien', is_active:0, created_at:'2026-01-03' },
];

describe('Users page', () => {
  it('shows loading spinner then user list', async () => {
    axios.get.mockResolvedValueOnce({ data: USERS_DATA });
    renderWithProviders(<Users toast={mockToast} />);
    await waitFor(() => expect(screen.getByText('Sophie')).toBeInTheDocument());
    expect(screen.getByText('Youssef')).toBeInTheDocument();
  });

  it('shows stat cards', async () => {
    axios.get.mockResolvedValueOnce({ data: USERS_DATA });
    renderWithProviders(<Users toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getAllByText('Médecins').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows create user button', async () => {
    axios.get.mockResolvedValueOnce({ data: USERS_DATA });
    renderWithProviders(<Users toast={mockToast} />);
    await waitFor(() => expect(screen.getByText('+ Créer un utilisateur')).toBeInTheDocument());
  });

  it('opens create user modal on button click', async () => {
    axios.get.mockResolvedValueOnce({ data: USERS_DATA });
    renderWithProviders(<Users toast={mockToast} />);
    await waitFor(() => screen.getByText('+ Créer un utilisateur'));
    await userEvent.click(screen.getByText('+ Créer un utilisateur'));
    expect(screen.getByText('Créer un utilisateur')).toBeInTheDocument();
  });

  it('filters by role', async () => {
    axios.get.mockResolvedValueOnce({ data: USERS_DATA });
    renderWithProviders(<Users toast={mockToast} />);
    await waitFor(() => screen.getByText('Sophie'));
    await userEvent.click(screen.getByRole('button', { name: /Médecins/i }));
    await waitFor(() => {
      expect(screen.getByText('Sophie')).toBeInTheDocument();
      expect(screen.queryByText('Youssef')).not.toBeInTheDocument();
    });
  });

  it('shows search input', async () => {
    axios.get.mockResolvedValueOnce({ data: USERS_DATA });
    renderWithProviders(<Users toast={mockToast} />);
    await waitFor(() => screen.getByPlaceholderText(/Rechercher/i));
    expect(screen.getByPlaceholderText(/Rechercher/i)).toBeInTheDocument();
  });

  it('filters by search text', async () => {
    axios.get.mockResolvedValueOnce({ data: USERS_DATA });
    renderWithProviders(<Users toast={mockToast} />);
    await waitFor(() => screen.getByPlaceholderText(/Rechercher/i));
    await userEvent.type(screen.getByPlaceholderText(/Rechercher/i), 'Sophie');
    expect(screen.getByText('Sophie')).toBeInTheDocument();
    expect(screen.queryByText('Youssef')).not.toBeInTheDocument();
  });

  it('shows "Vous" badge for own account', async () => {
    axios.get.mockResolvedValueOnce({ data: USERS_DATA });
    renderWithProviders(<Users toast={mockToast} />);
    await waitFor(() => expect(screen.getByText('Vous')).toBeInTheDocument());
  });

  it('shows "Activer" button for inactive users', async () => {
    axios.get.mockResolvedValueOnce({ data: USERS_DATA });
    renderWithProviders(<Users toast={mockToast} />);
    await waitFor(() => expect(screen.getByText('Activer')).toBeInTheDocument());
  });

  it('shows empty state when no users', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Users toast={mockToast} />);
    await waitFor(() => expect(screen.getByText(/aucun utilisateur/i)).toBeInTheDocument());
  });
});
