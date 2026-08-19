// src/__tests__/context/AuthContext.test.jsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { AuthProvider, useAuth } from '../../context/AuthContext';

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

const USER = { id:1, nom:'Admin', prenom:'S', email:'admin@planning.com', role:'administrateur', first_login:0 };
const TOKEN = 'test.jwt.token';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  axios.defaults.headers = { common: {} };
});

describe('useAuth — initial state', () => {
  it('starts with null user when no token stored', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('fetches user when token is in localStorage', async () => {
    localStorage.setItem('pm_token', TOKEN);
    axios.get.mockResolvedValueOnce({ data: USER });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.email).toBe('admin@planning.com');
  });

  it('logs out if token invalid', async () => {
    localStorage.setItem('pm_token', 'bad');
    axios.get.mockRejectedValueOnce({ response: { status: 401 } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('pm_token')).toBeNull();
  });
});

describe('useAuth — login', () => {
  it('stores token and sets user on successful login', async () => {
    axios.post.mockResolvedValueOnce({ data: { token: TOKEN, user: USER } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.login('admin@planning.com', 'Admin123!'); });

    expect(localStorage.getItem('pm_token')).toBe(TOKEN);
    expect(result.current.user?.email).toBe('admin@planning.com');
    expect(result.current.user?.role).toBe('administrateur');
  });

  it('throws on failed login', async () => {
    axios.post.mockRejectedValueOnce({ response: { data: { message: 'Identifiants incorrects' }, status: 401 } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.login('bad@x.com', 'wrong')).rejects.toBeDefined();
  });
});

describe('useAuth — logout', () => {
  it('clears user and token', async () => {
    localStorage.setItem('pm_token', TOKEN);
    axios.get.mockResolvedValueOnce({ data: USER });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());

    act(() => result.current.logout());

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('pm_token')).toBeNull();
  });
});
