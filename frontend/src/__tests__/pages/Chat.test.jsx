// src/__tests__/pages/Chat.test.jsx
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { renderWithProviders, MOCK_ADMIN, MOCK_MEDECIN, mockToast } from '../helpers';
import Chat from '../../pages/Chat';

beforeEach(() => { vi.clearAllMocks(); });

const MESSAGES = [
  { id:1, user_id:1, nom:'Admin Système', role:'administrateur', content:'Bonjour équipe !', created_at:'2026-05-17T08:00:00' },
  { id:2, user_id:2, nom:'Sophie Benali',  role:'medecin',        content:'Bonjour !',        created_at:'2026-05-17T08:01:00' },
];

describe('Chat page', () => {
  it('shows page header', async () => {
    axios.get.mockResolvedValueOnce({ data: MESSAGES });
    renderWithProviders(<Chat toast={mockToast} />);
    await waitFor(() => expect(screen.getByText('Chat Équipe')).toBeInTheDocument());
  });

  it('loads and displays messages', async () => {
    axios.get.mockResolvedValueOnce({ data: MESSAGES });
    renderWithProviders(<Chat toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getByText('Bonjour équipe !')).toBeInTheDocument();
      expect(screen.getByText('Bonjour !')).toBeInTheDocument();
    });
  });

  it('shows message input and send button', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Chat toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/votre message/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /envoyer/i })).toBeInTheDocument();
    });
  });

  it('send button disabled when input empty', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Chat toast={mockToast} />);
    await waitFor(() => screen.getByRole('button', { name: /envoyer/i }));
    expect(screen.getByRole('button', { name: /envoyer/i })).toBeDisabled();
  });

  it('send button enabled when input has text', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Chat toast={mockToast} />);
    await waitFor(() => screen.getByPlaceholderText(/votre message/i));
    await userEvent.type(screen.getByPlaceholderText(/votre message/i), 'Hello');
    expect(screen.getByRole('button', { name: /envoyer/i })).not.toBeDisabled();
  });

  it('shows online users panel', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Chat toast={mockToast} />, {
      socketOverrides: { onlineUsers: [MOCK_ADMIN, MOCK_MEDECIN] },
    });
    await waitFor(() => expect(screen.getByText(/En ligne · 2/i)).toBeInTheDocument());
  });

  it('shows empty state when no messages', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Chat toast={mockToast} />);
    await waitFor(() => expect(screen.getByText(/Commencez la conversation/i)).toBeInTheDocument());
  });

  it('emits send_message via socket on send', async () => {
    const mockEmit = vi.fn();
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Chat toast={mockToast} />, {
      socketOverrides: { emit: mockEmit, on: vi.fn().mockReturnValue(() => {}) },
    });
    await waitFor(() => screen.getByPlaceholderText(/votre message/i));
    await userEvent.type(screen.getByPlaceholderText(/votre message/i), 'Test message');
    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }));
    expect(mockEmit).toHaveBeenCalledWith('send_message', { content: 'Test message' });
  });

  it('clears input after send', async () => {
    const mockEmit = vi.fn();
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Chat toast={mockToast} />, {
      socketOverrides: { emit: mockEmit, on: vi.fn().mockReturnValue(() => {}) },
    });
    await waitFor(() => screen.getByPlaceholderText(/votre message/i));
    const input = screen.getByPlaceholderText(/votre message/i);
    await userEvent.type(input, 'Hello');
    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }));
    expect(input.value).toBe('');
  });

  it('triggers AI response when typing @ia prefix', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    renderWithProviders(<Chat toast={mockToast} />);
    await waitFor(() => screen.getByPlaceholderText(/votre message/i));
    const input = screen.getByPlaceholderText(/votre message/i);
    await userEvent.type(input, '@ia bonjour');
    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }));
    await waitFor(() => expect(screen.getByText(/assistant IA médical/i)).toBeInTheDocument(), { timeout: 3000 });
  });

  it('renders date separators between messages from different days', async () => {
    const MESSAGES_WITH_DATES = [
      { id:1, user_id:1, nom:'Admin', role:'administrateur', content:'Hier msg', created_at:'2026-05-16T10:00:00' },
      { id:2, user_id:2, nom:'Doc',   role:'medecin',        content:'Aujourd msg', created_at:'2026-05-17T10:00:00' },
    ];
    axios.get.mockResolvedValueOnce({ data: MESSAGES_WITH_DATES });
    renderWithProviders(<Chat toast={mockToast} />);
    await waitFor(() => {
      expect(screen.getByText('Hier msg')).toBeInTheDocument();
      expect(screen.getByText('Aujourd msg')).toBeInTheDocument();
      expect(screen.getAllByText(/📅/).length).toBeGreaterThanOrEqual(1);
    });
  });
});
