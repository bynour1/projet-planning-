// src/__tests__/pages/Schedule.test.jsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { renderWithProviders, MOCK_ADMIN, MOCK_MEDECIN, mockToast } from '../helpers';
import Schedule from '../../pages/Schedule';

beforeEach(() => { vi.clearAllMocks(); });

const TODAY = new Date().toISOString().slice(0,10);

const PLANNING_DATA = [
  { id:1, titre:'ECG Patient', date: TODAY, heure_debut:'08:00', heure_fin:'10:00', adresse:'Rue de la Paix, Tunis', medecin_nom:'Dr Benali', technicien_nom:'Y. Hamdi', commentaire:'Apporter matériel' },
  { id:2, titre:'Visite domicile', date: TODAY, heure_debut:'14:00', heure_fin:'15:30', adresse:'Av. Bourguiba', medecin_nom:'Dr Mansouri', technicien_nom:null, commentaire:null },
];

describe('Schedule page', () => {
  it('shows page title', async () => {
    axios.get.mockResolvedValueOnce({ data: PLANNING_DATA });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => expect(screen.getByText(/Vue Semaine/)).toBeInTheDocument());
  });

  it('shows week navigation controls', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getByText('‹')).toBeInTheDocument();
      expect(screen.getByText('›')).toBeInTheDocument();
      // "Aujourd'hui" may appear multiple times (nav button + day tab)
      expect(screen.getAllByText("Aujourd'hui").length).toBeGreaterThan(0);
    });
  });

  it('shows 7 day selector buttons', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => {
      const days = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
      days.forEach(d => expect(screen.getAllByText(d).length).toBeGreaterThan(0));
    });
  });

  it('shows today events in timeline', async () => {
    axios.get.mockResolvedValueOnce({ data: PLANNING_DATA });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getByText('ECG Patient')).toBeInTheDocument();
      expect(screen.getByText('Visite domicile')).toBeInTheDocument();
    });
  });

  it('shows event times', async () => {
    axios.get.mockResolvedValueOnce({ data: PLANNING_DATA });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getByText('08:00')).toBeInTheDocument();
      expect(screen.getByText('14:00')).toBeInTheDocument();
    });
  });

  it('shows medecin name for event', async () => {
    axios.get.mockResolvedValueOnce({ data: PLANNING_DATA });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getByText(/Dr Benali/)).toBeInTheDocument();
    });
  });

  it('shows technicien when present', async () => {
    axios.get.mockResolvedValueOnce({ data: PLANNING_DATA });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => expect(screen.getByText(/Y\. Hamdi/)).toBeInTheDocument());
  });

  it('shows adresse for event', async () => {
    axios.get.mockResolvedValueOnce({ data: PLANNING_DATA });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => expect(screen.getByText(/Rue de la Paix/)).toBeInTheDocument());
  });

  it('shows commentaire when present', async () => {
    axios.get.mockResolvedValueOnce({ data: PLANNING_DATA });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => expect(screen.getByText(/Apporter matériel/)).toBeInTheDocument());
  });

  it('shows empty state when no events for day', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => expect(screen.getByText(/Aucune intervention ce jour/)).toBeInTheDocument());
  });

  it('changes day when clicking a day button', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => screen.getAllByText('Lun'));
    // Click on "Lun" day button
    const lunButtons = screen.getAllByText('Lun');
    await userEvent.click(lunButtons[0]);
    // Should still show the schedule (no crash)
    expect(screen.getByText(/Vue Semaine/)).toBeInTheDocument();
  });

  it('navigates to previous week', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => screen.getByText('‹'));
    await userEvent.click(screen.getByText('‹'));
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  });

  it('navigates to next week', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => screen.getByText('›'));
    await userEvent.click(screen.getByText('›'));
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  });

  it('shows weekly summary when events exist', async () => {
    axios.get.mockResolvedValueOnce({ data: PLANNING_DATA });
    renderWithProviders(<Schedule toast={mockToast} />);
    await waitFor(() => expect(screen.getByText(/Résumé de la semaine/)).toBeInTheDocument());
  });

  it('shows spinner while loading', () => {
    axios.get.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<Schedule toast={mockToast} />);
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });
});
