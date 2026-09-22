// src/__tests__/pages/Clino.test.jsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { renderWithProviders, MOCK_ADMIN, MOCK_MEDECIN, mockToast } from '../helpers';
import Clino from '../../pages/Clino';

beforeEach(() => { vi.clearAllMocks(); });

const CLINO_DATA = [
  { id:1, date:'2026-05-18', heure:'09:00:00', adresse:'Rue de la Liberté, Tunis', medecin_full:'Sophie Benali', medecin_nom:'Sophie Benali', commentaire:'RAS' },
  { id:2, date:'2026-05-19', heure:'14:00:00', adresse:'Avenue Bourguiba', medecin_full:'Karim Mansouri', medecin_nom:'Karim Mansouri', commentaire:null },
];
const PLANNING_DATA = [
  { id:1, titre:'ECG', date:'2026-05-18', heure_debut:'08:00', heure_fin:'10:00', adresse:'Clinique', medecin_nom:'Sophie Benali', technicien_nom:null },
];

function setup(user = MOCK_ADMIN) {
  axios.get.mockResolvedValueOnce({ data: CLINO_DATA });   // /api/clino
  axios.get.mockResolvedValueOnce({ data: PLANNING_DATA }); // /api/planning
  axios.get.mockResolvedValueOnce({ data: [MOCK_MEDECIN, { id: 2, nom: 'Mansouri', prenom: 'Karim', role: 'medecin' }] }); // by-role/medecin
  axios.get.mockResolvedValueOnce({ data: [{ id: 3, nom: 'Ben Salah', prenom: 'Ahmed', role: 'technicien' }] }); // by-role/technicien
  return renderWithProviders(<Clino toast={mockToast} />, { user });
}

describe('Clino Mobile page', () => {
  it('shows page title', async () => {
    setup();
    await waitFor(() => expect(screen.getByText(/Clino Mobile/)).toBeInTheDocument());
  });

  it('lists clino programmes', async () => {
    setup();
    await waitFor(() => expect(screen.getAllByText('Rue de la Liberté, Tunis')[0]).toBeInTheDocument());
    expect(screen.getAllByText('Avenue Bourguiba')[0]).toBeInTheDocument();
  });

  it('shows formatted dates (DD/MM/YYYY)', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('18/05/2026')).toBeInTheDocument());
  });

  it('shows add button for admin', async () => {
    setup(MOCK_ADMIN);
    await waitFor(() => expect(screen.getByText('+ Programme')).toBeInTheDocument());
  });

  it('hides add button for medecin', async () => {
    setup(MOCK_MEDECIN);
    await waitFor(() => expect(screen.queryByText('+ Programme')).not.toBeInTheDocument());
  });

  it('shows programme tab', async () => {
    setup();
    await waitFor(() => expect(screen.getByText(/Programme jour/i)).toBeInTheDocument());
  });

  it('switches to programme view', async () => {
    setup();
    await waitFor(() => screen.getByText(/Programme jour/i));
    await userEvent.click(screen.getByText(/Programme jour/i));
    expect(screen.getByText(/tournée.*au programme/i)).toBeInTheDocument();
  });

  it('filters by search', async () => {
    setup();
    await waitFor(() => screen.getByPlaceholderText(/Rechercher/i));
    await userEvent.type(screen.getByPlaceholderText(/Rechercher/i), 'Bourguiba');
    expect(screen.getAllByText('Avenue Bourguiba')[0]).toBeInTheDocument();
    expect(screen.queryByText('Rue de la Liberté, Tunis')).not.toBeInTheDocument();
  });

  it('filters by category dropdown (Médecins / Techniciens)', async () => {
    setup();
    await waitFor(() => screen.getByText('👥 Tous les intervenants'));
    const roleSelect = screen.getByDisplayValue('👥 Tous les intervenants');
    expect(roleSelect).toBeInTheDocument();
    await userEvent.selectOptions(roleSelect, 'medecin');
    expect(screen.getByText('👨‍⚕️ Médecins uniquement')).toBeInTheDocument();
  });

  it('opens modal on + Programme click', async () => {
    setup(MOCK_ADMIN);
    await waitFor(() => screen.getByText('+ Programme'));
    await userEvent.click(screen.getByText('+ Programme'));
    expect(screen.getByText(/Nouveau programme Clino/i)).toBeInTheDocument();
  });

  it('shows delete confirmation dialog', async () => {
    setup(MOCK_ADMIN);
    await waitFor(() => screen.getAllByText('🗑'));
    await userEvent.click(screen.getAllByText('🗑')[0]);
    expect(screen.getByText(/Supprimer/i)).toBeInTheDocument();
  });

  it('displays week separation header and day names prominently', async () => {
    setup();
    await waitFor(() => expect(screen.getAllByText('Rue de la Liberté, Tunis')[0]).toBeInTheDocument());
    expect(screen.getAllByText(/Semaine/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/LUNDI/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/MARDI/i)[0]).toBeInTheDocument();
  });

  it('switches to weekly grid view', async () => {
    setup();
    await waitFor(() => screen.getByText(/Grille Hebdo/i));
    await userEvent.click(screen.getByText(/Grille Hebdo/i));
    expect(screen.getAllByText(/Cette semaine/i)[0]).toBeInTheDocument();
  });
});

