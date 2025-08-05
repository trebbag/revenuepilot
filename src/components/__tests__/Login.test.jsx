/* @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { vi, expect, test, beforeEach, afterEach } from 'vitest';
import Login from '../Login.jsx';

vi.mock('../../api.js', () => ({
  login: vi.fn(),
}));

const { login } = await import('../../api.js');

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
});

afterEach(() => {
  cleanup();
});

test('stores token on successful login', async () => {
  login.mockResolvedValue('tok');
  const onLoggedIn = vi.fn();
  render(<Login onLoggedIn={onLoggedIn} />);

  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'user' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'pw' },
  });
  fireEvent.submit(screen.getByRole('button'));

  await waitFor(() => expect(onLoggedIn).toHaveBeenCalledWith('tok'));
  expect(localStorage.getItem('token')).toBe('tok');
  expect(screen.queryByTestId('login-error')).toBeNull();
});

test('shows error on failed login', async () => {
  login.mockRejectedValue(new Error('Bad creds'));
  render(<Login onLoggedIn={() => {}} />);

  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'user' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'pw' },
  });
  fireEvent.submit(screen.getByRole('button'));

  await waitFor(() => screen.getByTestId('login-error'));
  expect(screen.getByTestId('login-error').textContent).toBe('Bad creds');
});

