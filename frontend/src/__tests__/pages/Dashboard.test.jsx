// src/__tests__/pages/Dashboard.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { renderWithProviders, MOCK_ADMIN, MOCK_MEDECIN, mockToast } from '../helpers';
import Dashboard from '../../pages/Dashboard';

beforeEach(() => { vi.clearAllMocks(); });

const EMPTY_RES  = { data: [] };
const EVENTS_RES = { data: [{ id:1, titre:'Réunion', date_debut:'2027-01-01T10:00:00', lieu:'Tunis' }] };
const PLANNING_RES = { data: [{ id:1, titre:'ECG', date:'2026-05-20', heure_debut:'09:00', adresse:'Rue X' }] };
const USERS_RES  = { data: [MOCK_ADMIN, MOCK_MEDECIN] };

function setupMocks(user = MOCK_ADMIN) {
  if (user.role === 'administrateur') {
    axios.get.mockResolvedValueOnce(USERS_RES);    // /api/users
  }
  axios.get.mockResolvedValueOnce(EVENTS_RES);     // /api/events
  axios.get.mockResolvedValueOnce(PLANNING_RES);   // /api/planning
  axios.get.mockResolvedValueOnce(EMPTY_RES);      // /api/clino
  axios.get.mockResolvedValueOnce(PLANNING_RES);   // /api/planning/mine
}

describe('Dashboard — Admin', () => {
  it('shows greeting with user first name', async () => {
    setupMocks(MOCK_ADMIN);
    renderWithProviders(<Dashboard toast={mockToast} />, { user: MOCK_ADMIN });
    await waitFor(() => expect(screen.getByText(/Bonjour.*Système/i)).toBeInTheDocument());
  });

  it('shows admin stat cards', async () => {
    setupMocks(MOCK_ADMIN);
    renderWithProviders(<Dashboard toast={mockToast} />, { user: MOCK_ADMIN });
    await waitFor(() => expect(screen.getByText('Utilisateurs')).toBeInTheDocument());
  });

  it('shows upcoming events', async () => {
    setupMocks(MOCK_ADMIN);
    renderWithProviders(<Dashboard toast={mockToast} />, { user: MOCK_ADMIN });
    await waitFor(() => expect(screen.getByText('Réunion')).toBeInTheDocument());
  });

  it('shows my planning section', async () => {
    setupMocks(MOCK_ADMIN);
    renderWithProviders(<Dashboard toast={mockToast} />, { user: MOCK_ADMIN });
    await waitFor(() => expect(screen.getByText(/prochaines interventions/i)).toBeInTheDocument());
  });
});

describe('Dashboard — Medecin', () => {
  it('does not show Users stat for medecin', async () => {
    axios.get.mockResolvedValueOnce(EVENTS_RES);
    axios.get.mockResolvedValueOnce(PLANNING_RES);
    axios.get.mockResolvedValueOnce(EMPTY_RES);
    axios.get.mockResolvedValueOnce(PLANNING_RES);
    renderWithProviders(<Dashboard toast={mockToast} />, { user: MOCK_MEDECIN });
    await waitFor(() => expect(screen.getByText(/Interventions/)).toBeInTheDocument());
    expect(screen.queryByText('Utilisateurs')).not.toBeInTheDocument();
  });
});

describe('Dashboard — loading state', () => {
  it('shows spinner before data loads', () => {
    axios.get.mockImplementation(() => new Promise(() => {})); // never resolves
    renderWithProviders(<Dashboard toast={mockToast} />);
    // Spinner is a div, not a role — check via class or aria
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });
});
