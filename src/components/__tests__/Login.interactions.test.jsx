/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { changeLanguage: () => {} } }),
}));
vi.mock('../../api.js', () => ({
  pingBackend: vi.fn().mockResolvedValue(true),
  login: vi.fn(),
  register: vi.fn(),
  resetPassword: vi.fn(),
  fetchAuthPolicy: vi.fn().mockResolvedValue({ lockoutThreshold: 5, lockoutDurationSeconds: 900 }),
}));

import Login from '../Login.jsx';
import { login } from '../../api.js';

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    value: {
      store: {},
      setItem(k, v) {
        this.store[k] = v;
      },
      getItem(k) {
        return this.store[k];
      },
      removeItem(k) {
        delete this.store[k];
      },
      clear() {
        this.store = {};
      },
    },
    configurable: true,
  });
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('Login interactions', () => {
  it('toggles password visibility', async () => {
    render(<Login onLoggedIn={() => {}} />);
    const pwd = screen.getByLabelText(/password/i);
    expect(pwd).toBeInTheDocument();
    expect(pwd).toHaveAttribute('type', 'password');
    const toggle =
      screen.getByRole('button', { name: /toggle password visibility/i }) ||
      screen.getByText(/show/i);
    // Click the show/hide toggle
    fireEvent.click(toggle);
    await waitFor(() => expect(pwd).toHaveAttribute('type', 'text'));
    fireEvent.click(toggle);
    await waitFor(() => expect(pwd).toHaveAttribute('type', 'password'));
  });

  it('shows password strength bars on register', async () => {
    render(<Login onLoggedIn={() => {}} />);
    const createBtn =
      screen.getByRole('button', { name: 'login.register' }) ||
      screen.getByText(/create account/i);
    fireEvent.click(createBtn);
    const pwd = screen.getByLabelText('login.password');
    fireEvent.change(pwd, { target: { value: 'P@s5word123' } });
    expect(
      await screen.findByText(
        /login.passwordStrong|login.passwordVeryStrong|Strong|Very strong|Good/,
      ),
    ).toBeTruthy();
    const bars = document.querySelectorAll('.strength-bar.active');
    expect(bars.length).toBeGreaterThan(0);
  });

  it('remembers username when checkbox checked', async () => {
    login.mockResolvedValue({
      token: 'tok',
      refreshToken: 'r',
      settings: { lang: 'en' },
    });
    const onLoggedIn = vi.fn();
    render(<Login onLoggedIn={onLoggedIn} />);
    const username = screen.getByLabelText(/username/i);
    fireEvent.change(username, { target: { value: 'rememberme' } });
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
    const loginBtn =
      screen.getByRole('button', { name: 'login.login' }) ||
      screen.getByText(/sign in/i);
    fireEvent.click(loginBtn);
    await waitFor(() => expect(onLoggedIn).toHaveBeenCalled());
    expect(localStorage.getItem('rememberedUsername')).toBe('rememberme');
  });
});
