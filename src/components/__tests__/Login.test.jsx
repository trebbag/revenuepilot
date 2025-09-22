/* @vitest-environment jsdom */

import { render, fireEvent, waitFor, cleanup, screen } from '@testing-library/react';
import { vi, expect, test, beforeEach, afterEach } from 'vitest';
import '../../i18n.js';

vi.mock('../../api.js', () => ({
  login: vi.fn(),
  register: vi.fn(),
  pingBackend: vi.fn().mockResolvedValue(true),
  resetPassword: vi.fn(),
  fetchAuthPolicy: vi.fn().mockResolvedValue({ lockoutThreshold: 5, lockoutDurationSeconds: 900 }),
}));
import { login } from '../../api.js';
import Login from '../Login.jsx';

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: { store: {}, setItem(k,v){this.store[k]=v;}, getItem(k){return this.store[k];}, removeItem(k){delete this.store[k];}, clear(){this.store={};}}, configurable: true });
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => cleanup());

// Use visible English labels now rendered by i18n.

test('successful login stores token and calls callback', async () => {
  login.mockResolvedValue({ token: 'token123', refreshToken: 'r', settings: { theme: 'modern' } });
  const onLoggedIn = vi.fn();
  render(<Login onLoggedIn={onLoggedIn} />);
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'u' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'p' } });
  await waitFor(() => expect(screen.getByRole('button', { name: /login/i }).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: /login/i }));
  await waitFor(() =>
    expect(onLoggedIn).toHaveBeenCalledWith('token123', { theme: 'modern', lang: 'en', summaryLang: 'en' })
  );
  expect(login).toHaveBeenCalledWith('u', 'p', 'en');
  expect(localStorage.getItem('token')).toBe('token123');
});

test('shows error on failed login', async () => {
  login.mockRejectedValue(new Error('bad'));
  render(<Login onLoggedIn={() => {}} />);
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'u' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'p' } });
  await waitFor(() => expect(screen.getByRole('button', { name: /login/i }).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: /login/i }));
  await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy());
  expect(login).toHaveBeenCalledWith('u', 'p', 'en');
});

