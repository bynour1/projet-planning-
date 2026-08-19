// src/__tests__/setup.jsx
import '@testing-library/jest-dom';
// ── jsdom scrollIntoView mock ──────────────────────────────────
window.HTMLElement.prototype.scrollIntoView = function() {};

import { vi } from 'vitest';

// ── Mock axios globally ────────────────────────────────────────
vi.mock('axios', () => ({
  default: {
    get:     vi.fn(),
    post:    vi.fn(),
    put:     vi.fn(),
    delete:  vi.fn(),
    defaults: { headers: { common: {} } },
  },
}));

// ── Mock react-router-dom ──────────────────────────────────────
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    NavLink: ({ children, className }) => {
      const cls = typeof className === 'function' ? className({ isActive: false }) : className;
      return <a className={cls}>{children}</a>;
    },
    Navigate: () => null,
    BrowserRouter: ({ children }) => <div>{children}</div>,
    Routes: ({ children }) => <div>{children}</div>,
    Route: ({ element }) => element || null,
  };
});

// ── Mock socket.io-client ──────────────────────────────────────
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    handshake: { auth: {} },
  })),
}));

// ── Mock date-fns locale (avoids locale import issues) ─────────
vi.mock('date-fns/locale', () => ({
  fr: {
    code: 'fr',
    preprocessor: date => date,
    formatDistance: () => '',
    formatRelative: () => '',
    localize: {
      era: () => '',
      quarter: () => '',
      quarterStandalone: () => '',
      month: () => '',
      monthStandalone: () => '',
      day: () => '',
      dayStandalone: () => '',
      dayPeriod: () => '',
    },
    match: {
      era: () => null,
      quarter: () => null,
      quarterStandalone: () => null,
      month: () => null,
      monthStandalone: () => null,
      loneMonth: () => null,
      day: () => null,
      dayStandalone: () => null,
      dayPeriod: () => null,
    },
    options: {
      weekStartsOn: 1,
      firstWeekContainsDate: 4,
    },
  }
}));

// ── Suppress noisy console errors in tests ──────────────────────
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (typeof args[0] === 'string' && (
      args[0].includes('Warning:') ||
      args[0].includes('ReactDOM.render') ||
      args[0].includes('act(')
    )) return;
    originalError(...args);
  };
});
afterAll(() => { console.error = originalError; });
