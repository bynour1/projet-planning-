import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { renderWithProviders, MOCK_ADMIN, MOCK_MEDECIN, mockToast } from '../helpers';
import Entreprises from '../../pages/Entreprises';

beforeEach(() => { vi.clearAllMocks(); });

const MOCK_ENTREPRISES = [
  { id:1, nom:'Clinique Les Oliviers', secteur:'Médical', adresse:'Tunis', telephone:'71 000 000', email:'contact@oliviers.tn', site_web:'https://oliviers.tn', description:'Clinique spécialisée', convensionne:1, nb_avis:3, note_moyenne:4.2 },
  { id:2, nom:'Pharmacie Centrale',    secteur:'Pharmacie', adresse:'Sfax', telephone:null, email:null, site_web:null, description:null, convensionne:0, nb_avis:1, note_moyenne:3.0 },
  { id:3, nom:'Lab Analyses Bio',      secteur:'Laboratoire', adresse:'Sousse', telephone:'73 000 000', email:null, site_web:null, description:'Laboratoire d\'analyses', convensionne:1, nb_avis:0, note_moyenne:null },
];

const MOCK_AVIS = [
  { id:1, entreprise_id:1, user_id:1, note:5, commentaire:'Excellent service, très professionnel', type_avis:'avis', user_nom:'Admin', user_prenom:'Système', user_role:'administrateur', created_at:new Date().toISOString() },
  { id:2, entreprise_id:1, user_id:2, note:4, commentaire:'Bonne clinique, personnel accueillant', type_avis:'avis', user_nom:'Benali', user_prenom:'Sophie', user_role:'medecin', created_at:new Date().toISOString() },
  { id:3, entreprise_id:1, user_id:2, note:null, commentaire:'Parking difficile le matin', type_avis:'remarque', user_nom:'Benali', user_prenom:'Sophie', user_role:'medecin', created_at:new Date().toISOString() },
];

describe('Entreprises page — liste', () => {
  it('shows page title', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => expect(screen.getByText(/Entreprises Conventionnées/)).toBeInTheDocument());
  });

  it('shows add button for admin', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    renderWithProviders(<Entreprises toast={mockToast} />, { user: MOCK_ADMIN });
    await waitFor(() => expect(screen.getByText('+ Ajouter')).toBeInTheDocument());
  });

  it('hides add button for non-admin', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    renderWithProviders(<Entreprises toast={mockToast} />, { user: MOCK_MEDECIN });
    await waitFor(() => expect(screen.queryByText('+ Ajouter')).not.toBeInTheDocument());
  });

  it('lists all entreprises', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getByText('Clinique Les Oliviers')).toBeInTheDocument();
      expect(screen.getByText('Pharmacie Centrale')).toBeInTheDocument();
      expect(screen.getByText('Lab Analyses Bio')).toBeInTheDocument();
    });
  });

  it('shows stats cards', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getByText('Total')).toBeInTheDocument();
      // "Conventionnées" appears in both stat card and filter button — check count
      expect(screen.getAllByText('Conventionnées').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Avis partagés')).toBeInTheDocument();
    });
  });

  it('shows badge conventionnée / non conventionnée', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getAllByText(/Conv\./).length).toBeGreaterThan(0);
    });
  });

  it('shows empty state when no entreprises', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => expect(screen.getByText(/Aucune entreprise/)).toBeInTheDocument());
  });

  it('filters by search text', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => screen.getByPlaceholderText(/Rechercher/));
    await userEvent.type(screen.getByPlaceholderText(/Rechercher/), 'Clinique');
    expect(screen.getByText('Clinique Les Oliviers')).toBeInTheDocument();
    expect(screen.queryByText('Pharmacie Centrale')).not.toBeInTheDocument();
  });

  it('filters by conventionnée status', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => screen.getAllByText('Conventionnées'));
    // Click the filter button (not the stat card span)
    const convButtons = screen.getAllByRole('button', { name: 'Conventionnées' });
    await userEvent.click(convButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Clinique Les Oliviers')).toBeInTheDocument();
      expect(screen.queryByText('Pharmacie Centrale')).not.toBeInTheDocument();
    });
  });

  it('opens create modal on add button click', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Entreprises toast={mockToast} />, { user: MOCK_ADMIN });
    await waitFor(() => screen.getByText('+ Ajouter'));
    await userEvent.click(screen.getByText('+ Ajouter'));
    expect(screen.getByText('➕ Nouvelle entreprise')).toBeInTheDocument();
  });

  it('modal has required nom field', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Entreprises toast={mockToast} />, { user: MOCK_ADMIN });
    await waitFor(() => screen.getByText('+ Ajouter'));
    await userEvent.click(screen.getByText('+ Ajouter'));
    expect(screen.getByPlaceholderText(/Les Oliviers/)).toBeInTheDocument();
  });

  it('save disabled when nom empty', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Entreprises toast={mockToast} />, { user: MOCK_ADMIN });
    await waitFor(() => screen.getByText('+ Ajouter'));
    await userEvent.click(screen.getByText('+ Ajouter'));
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
  });

  it('creates entreprise successfully', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    axios.post.mockResolvedValueOnce({ data: { message:'Créée', id:10 } });
    axios.get.mockResolvedValueOnce({ data: [{ id:10, nom:'Nouvelle Clinique', secteur:'Médical', convensionne:1, nb_avis:0, note_moyenne:null }] });
    renderWithProviders(<Entreprises toast={mockToast} />, { user: MOCK_ADMIN });
    await waitFor(() => screen.getByText('+ Ajouter'));
    await userEvent.click(screen.getByText('+ Ajouter'));
    await userEvent.type(screen.getByPlaceholderText(/Les Oliviers/), 'Nouvelle Clinique');
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Enregistré', 'success'));
  });
});

describe('Entreprises page — détail & avis', () => {
  it('shows detail panel on card click', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    axios.get.mockResolvedValueOnce({ data: MOCK_AVIS });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => screen.getByText('Clinique Les Oliviers'));
    await userEvent.click(screen.getAllByText('Voir détails →')[0]);
    await waitFor(() => expect(screen.getByText('Avis & Remarques')).toBeInTheDocument());
  });

  it('shows avis in detail panel', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    axios.get.mockResolvedValueOnce({ data: MOCK_AVIS });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => screen.getByText('Clinique Les Oliviers'));
    await userEvent.click(screen.getAllByText('Voir détails →')[0]);
    await waitFor(() => {
      expect(screen.getByText('Excellent service, très professionnel')).toBeInTheDocument();
      expect(screen.getByText('Parking difficile le matin')).toBeInTheDocument();
    });
  });

  it('shows add avis button in detail', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => screen.getByText('Clinique Les Oliviers'));
    await userEvent.click(screen.getAllByText('Voir détails →')[0]);
    await waitFor(() => expect(screen.getByText('➕ Donner mon avis')).toBeInTheDocument());
  });

  it('opens avis modal on button click', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => screen.getByText('Clinique Les Oliviers'));
    await userEvent.click(screen.getAllByText('Voir détails →')[0]);
    await waitFor(() => screen.getByText('➕ Donner mon avis'));
    await userEvent.click(screen.getByText('➕ Donner mon avis'));
    expect(screen.getByText('➕ Partager votre avis')).toBeInTheDocument();
  });

  it('publish button disabled when commentaire empty', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => screen.getByText('Clinique Les Oliviers'));
    await userEvent.click(screen.getAllByText('Voir détails →')[0]);
    await waitFor(() => screen.getByText('➕ Donner mon avis'));
    await userEvent.click(screen.getByText('➕ Donner mon avis'));
    expect(screen.getByRole('button', { name: /Publier/ })).toBeDisabled();
  });

  it('shows type selector in avis modal', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => screen.getByText('Clinique Les Oliviers'));
    await userEvent.click(screen.getAllByText('Voir détails →')[0]);
    await waitFor(() => screen.getByText('➕ Donner mon avis'));
    await userEvent.click(screen.getByText('➕ Donner mon avis'));
    expect(screen.getByText(/💬 Avis/)).toBeInTheDocument();
    expect(screen.getByText(/⚠️ Remarque/)).toBeInTheDocument();
    expect(screen.getByText(/💡 Suggestion/)).toBeInTheDocument();
  });

  it('submits avis successfully', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    axios.get.mockResolvedValueOnce({ data: [] });
    axios.post.mockResolvedValueOnce({ data: { message:'Avis ajouté', id:10 } });
    axios.get.mockResolvedValueOnce({ data: [{ id:10, note:5, commentaire:'Super!', type_avis:'avis', user_nom:'Admin', user_prenom:'Système', user_role:'administrateur', created_at: new Date().toISOString() }] });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => screen.getByText('Clinique Les Oliviers'));
    await userEvent.click(screen.getAllByText('Voir détails →')[0]);
    await waitFor(() => screen.getByText('➕ Donner mon avis'));
    await userEvent.click(screen.getByText('➕ Donner mon avis'));
    await userEvent.type(screen.getByPlaceholderText(/Partagez/), 'Très bonne clinique!');
    await userEvent.click(screen.getByRole('button', { name: /Publier/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Avis publié', 'success'));
  });

  it('back button returns to list', async () => {
    axios.get.mockResolvedValueOnce({ data: MOCK_ENTREPRISES });
    axios.get.mockResolvedValueOnce({ data: MOCK_AVIS });
    renderWithProviders(<Entreprises toast={mockToast} />);
    await waitFor(() => screen.getByText('Clinique Les Oliviers'));
    await userEvent.click(screen.getAllByText('Voir détails →')[0]);
    await waitFor(() => screen.getByText('✕ Fermer'));
    await userEvent.click(screen.getByText('✕ Fermer'));
    await waitFor(() => expect(screen.getByText('Clinique Les Oliviers')).toBeInTheDocument());
  });
});
