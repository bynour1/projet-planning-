// src/__tests__/helpers.jsx
import { render } from '@testing-library/react';
import { vi } from 'vitest';

// ── Default mock user ──────────────────────────────────────────
export const MOCK_ADMIN = { id:1, nom:'Admin', prenom:'Système', email:'admin@planning.com', role:'administrateur', first_login:false };
export const MOCK_MEDECIN = { id:2, nom:'Benali', prenom:'Sophie', email:'sophie@planning.com', role:'medecin', first_login:false };
export const MOCK_TECH = { id:3, nom:'Hamdi', prenom:'Youssef', email:'youssef@planning.com', role:'technicien', first_login:false };

// ── Mock contexts ──────────────────────────────────────────────
export const mockAuthContext = (user = MOCK_ADMIN) => ({
  user, token:'test_token', loading:false,
  login:  vi.fn().mockResolvedValue(user),
  logout: vi.fn(),
  refreshUser: vi.fn(),
});

export const mockSocketContext = (overrides = {}) => ({
  socket: null,
  connected: true,
  onlineUsers: [MOCK_ADMIN],
  emit: vi.fn(),
  on:   vi.fn().mockReturnValue(() => {}),
  ...overrides,
});

// ── Context modules ────────────────────────────────────────────
import * as AuthModule   from '../context/AuthContext';
import * as SocketModule from '../context/SocketContext';

export function mockContexts(user = MOCK_ADMIN, socketOverrides = {}, authOverrides = {}) {
  vi.spyOn(AuthModule, 'useAuth').mockReturnValue({ ...mockAuthContext(user), ...authOverrides });
  AuthModule.useAuth.__pmAutoMock = true;

  vi.spyOn(SocketModule, 'useSocket').mockReturnValue(mockSocketContext(socketOverrides));
  SocketModule.useSocket.__pmAutoMock = true;
}

// ── Custom render that injects providers ───────────────────────
export function renderWithProviders(ui, { user = MOCK_ADMIN, socketOverrides = {}, authOverrides = {} } = {}) {
  mockContexts(user, socketOverrides, authOverrides);
  return render(ui);
}

// ── Mock toast ─────────────────────────────────────────────────
export const mockToast = vi.fn();
