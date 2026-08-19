// src/__tests__/pages/Routines.test.jsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { renderWithProviders, MOCK_ADMIN, MOCK_MEDECIN, mockToast } from '../helpers';
import Routines from '../../pages/Routines';

beforeEach(() => { vi.clearAllMocks(); });

const ROUTINES_DATA = [
  { id:1, user_id:1, title:'Rappel réunion hebdo', time:'09:00', days:[0,1,2,3,4], active:1 },
  { id:2, user_id:1, title:'Check planning',       time:'08:00', days:[0],         active:0 },
  { id:3, user_id:1, title:'Sans heure',            time:null,    days:[],          active:1 },
];

describe('Routines page', () => {
  it('shows page title', async () => {
    axios.get.mockResolvedValueOnce({ data: ROUTINES_DATA });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => expect(screen.getByText(/Mes Routines/)).toBeInTheDocument());
  });

  it('shows add button', async () => {
    axios.get.mockResolvedValueOnce({ data: ROUTINES_DATA });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => expect(screen.getByText('+ Nouvelle routine')).toBeInTheDocument());
  });

  it('lists all routines', async () => {
    axios.get.mockResolvedValueOnce({ data: ROUTINES_DATA });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getByText('Rappel réunion hebdo')).toBeInTheDocument();
      expect(screen.getByText('Check planning')).toBeInTheDocument();
      expect(screen.getByText('Sans heure')).toBeInTheDocument();
    });
  });

  it('shows times for routines that have them', async () => {
    axios.get.mockResolvedValueOnce({ data: ROUTINES_DATA });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getByText('⏰ 09:00')).toBeInTheDocument();
      expect(screen.getByText('⏰ 08:00')).toBeInTheDocument();
    });
  });

  it('shows stat cards', async () => {
    axios.get.mockResolvedValueOnce({ data: ROUTINES_DATA });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText('Actives')).toBeInTheDocument();
      expect(screen.getByText('Inactives')).toBeInTheDocument();
    });
  });

  it('shows empty state when no routines', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => expect(screen.getByText(/Aucune routine/)).toBeInTheDocument());
  });

  it('opens create modal on add button click', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => screen.getByText('+ Nouvelle routine'));
    await userEvent.click(screen.getByText('+ Nouvelle routine'));
    expect(screen.getByText('➕ Nouvelle routine')).toBeInTheDocument();
  });

  it('modal has title input', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => screen.getByText('+ Nouvelle routine'));
    await userEvent.click(screen.getByText('+ Nouvelle routine'));
    expect(screen.getByPlaceholderText(/Rappel réunion/i)).toBeInTheDocument();
  });

  it('save button disabled when title empty', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => screen.getByText('+ Nouvelle routine'));
    await userEvent.click(screen.getByText('+ Nouvelle routine'));
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
  });

  it('creates routine successfully', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    axios.post.mockResolvedValueOnce({ data: { message:'Routine créée', id:10 } });
    axios.get.mockResolvedValueOnce({ data: [{ id:10, title:'Nouveau rappel', time:'07:00', days:[1], active:1 }] });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => screen.getByText('+ Nouvelle routine'));
    await userEvent.click(screen.getByText('+ Nouvelle routine'));
    await userEvent.type(screen.getByPlaceholderText(/Rappel réunion/i), 'Nouveau rappel');
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Routine enregistrée', 'success'));
  });

  it('opens edit modal on edit button click', async () => {
    axios.get.mockResolvedValueOnce({ data: ROUTINES_DATA });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => screen.getAllByText('✏️'));
    await userEvent.click(screen.getAllByText('✏️')[0]);
    expect(screen.getByText('✏️ Modifier la routine')).toBeInTheDocument();
  });

  it('shows delete confirmation dialog', async () => {
    axios.get.mockResolvedValueOnce({ data: ROUTINES_DATA });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => screen.getAllByText('🗑'));
    await userEvent.click(screen.getAllByText('🗑')[0]);
    expect(screen.getByText(/Supprimer la routine/)).toBeInTheDocument();
  });

  it('calls delete API on confirm', async () => {
    axios.get.mockResolvedValueOnce({ data: ROUTINES_DATA });
    axios.delete.mockResolvedValueOnce({ data: { message:'Supprimé' } });
    axios.get.mockResolvedValueOnce({ data: ROUTINES_DATA.slice(1) });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => screen.getAllByText('🗑'));
    await userEvent.click(screen.getAllByText('🗑')[0]);
    await userEvent.click(screen.getByRole('button', { name: /Confirmer/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Routine supprimée', 'success'));
  });

  it('toggles active status on toggle button click', async () => {
    axios.get.mockResolvedValueOnce({ data: ROUTINES_DATA });
    axios.put.mockResolvedValueOnce({ data: { message:'Mis à jour' } });
    axios.get.mockResolvedValueOnce({ data: ROUTINES_DATA });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => screen.getAllByText('✅'));
    await userEvent.click(screen.getAllByText('✅')[0]);
    await waitFor(() => expect(axios.put).toHaveBeenCalled());
  });

  it('shows day pills for each routine', async () => {
    axios.get.mockResolvedValueOnce({ data: [ROUTINES_DATA[0]] });
    renderWithProviders(<Routines toast={mockToast} />);
    await waitFor(() => screen.getByText('Rappel réunion hebdo'));
    // 7 day pills should be visible
    const pills = document.querySelectorAll('[style*="border-radius: 50%"]');
    expect(pills.length).toBeGreaterThan(0);
  });
});
