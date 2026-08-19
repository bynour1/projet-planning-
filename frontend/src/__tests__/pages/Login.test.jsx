// src/__tests__/pages/Login.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as AuthModule from '../../context/AuthContext';
import Login from '../../pages/Login';

const mockLogin = vi.fn();
const mockToast = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(AuthModule, 'useAuth').mockReturnValue({
    login: mockLogin, user: null, loading: false,
    logout: vi.fn(), refreshUser: vi.fn(), token: null,
  });
});

describe('Login page', () => {
  it('renders email and password fields', () => {
    render(<Login toast={mockToast} />);
    expect(screen.getByPlaceholderText(/exemple/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/••••/)).toBeInTheDocument();
  });

  it('renders connect button', () => {
    render(<Login toast={mockToast} />);
    expect(screen.getByRole('button', { name: /connecter/i })).toBeInTheDocument();
  });

  it('shows "Planning Médical" title', () => {
    render(<Login toast={mockToast} />);
    expect(screen.getByText('Planning Médical')).toBeInTheDocument();
  });

  it('calls login with correct credentials', async () => {
    mockLogin.mockResolvedValueOnce({ role: 'administrateur', first_login: false });
    render(<Login toast={mockToast} />);

    await userEvent.type(screen.getByPlaceholderText(/exemple/i), 'admin@planning.com');
    await userEvent.type(screen.getByPlaceholderText(/••••/), 'Admin123!');
    await userEvent.click(screen.getByRole('button', { name: /connecter/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin@planning.com', 'Admin123!');
    });
  });

  it('shows error toast on failed login', async () => {
    mockLogin.mockRejectedValueOnce({ response: { data: { message: 'Identifiants incorrects' } } });
    render(<Login toast={mockToast} />);

    await userEvent.type(screen.getByPlaceholderText(/exemple/i), 'bad@x.com');
    await userEvent.type(screen.getByPlaceholderText(/••••/), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /connecter/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('Identifiants incorrects', 'error');
    });
  });

  it('toggles password visibility', async () => {
    render(<Login toast={mockToast} />);
    const pwdInput = screen.getByPlaceholderText(/••••/);
    expect(pwdInput).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByText('👁'));
    expect(pwdInput).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByText('🙈'));
    expect(pwdInput).toHaveAttribute('type', 'password');
  });

  it('disables button while loading', async () => {
    mockLogin.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<Login toast={mockToast} />);

    await userEvent.type(screen.getByPlaceholderText(/exemple/i), 'a@a.com');
    await userEvent.type(screen.getByPlaceholderText(/••••/), 'password');
    await userEvent.click(screen.getByRole('button', { name: /connecter/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connecter/i })).toBeDisabled();
    });
  });
});
