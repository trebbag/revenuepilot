/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Place mocks BEFORE importing component under test
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { changeLanguage: () => {} } }),
}));

vi.mock('../../api.js', () => ({
  pingBackend: vi.fn().mockResolvedValue(true),
  login: vi.fn(async (u,p,l) => ({ token: 't', refreshToken: 'r', settings: { lang: l } })),
  register: vi.fn(async (u,p,l) => ({ token: 't2', refreshToken: 'r2', settings: { lang: l } })),
  resetPassword: vi.fn(async () => ({})),
  fetchAuthPolicy: vi.fn().mockResolvedValue({ lockoutThreshold: 5, lockoutDurationSeconds: 900 }),
}));

import Login from '../Login.jsx';

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: { store: {}, setItem(k,v){this.store[k]=v;}, getItem(k){return this.store[k];}, removeItem(k){delete this.store[k];}, clear(){this.store={};}}, configurable: true });
  localStorage.clear();
  delete window.electronAPI;
});

afterEach(() => cleanup());

describe('Unified Login component', () => {
  it('logs in successfully', async () => {
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);
    fireEvent.change(screen.getByLabelText('login.username'), { target: { value: 'user' } });
    fireEvent.change(screen.getByLabelText('login.password'), { target: { value: 'Passw0rd!' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'login.login' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'login.login' }));
    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
  });

  it('switches to register and validates confirm password', async () => {
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);
    fireEvent.click(screen.getByRole('button', { name: 'login.register' }));
    fireEvent.change(screen.getByLabelText('login.username'), { target: { value: 'user2' } });
    fireEvent.change(screen.getByLabelText('login.password'), { target: { value: 'Passw0rd!' } });
    fireEvent.change(screen.getByLabelText('login.confirmPassword'), { target: { value: 'Mismatch' } });
    // Wait for backend check to complete so submit button is enabled
    await waitFor(() => expect(screen.getByRole('button', { name: 'login.register' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'login.register' }));
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy());
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it('password reset flow', async () => {
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);
    fireEvent.click(screen.getByRole('button', { name: 'login.resetPassword' }));
    fireEvent.change(screen.getByLabelText('login.username'), { target: { value: 'user' } });
    fireEvent.change(screen.getByLabelText('login.currentPassword'), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByLabelText('login.newPassword'), { target: { value: 'NewPass1!' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'login.resetPassword' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'login.resetPassword' }));
    await waitFor(() => expect(screen.getByTestId('login-info')).toBeTruthy());
  });
});
