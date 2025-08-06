/* @vitest-environment jsdom */

import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { vi, expect, test, beforeEach, afterEach } from 'vitest';
import '../../i18n.js';

vi.mock('../../api.js', () => ({ login: vi.fn() }));
import { login } from '../../api.js';
import Login from '../Login.jsx';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => cleanup());

test('successful login stores token and calls callback', async () => {
  login.mockResolvedValue({ token: 'token123', refreshToken: 'r', settings: { theme: 'modern' } });
  const onLoggedIn = vi.fn();
  const { getByLabelText, getAllByRole } = render(
    <Login onLoggedIn={onLoggedIn} />
  );
  fireEvent.change(getByLabelText('Username'), { target: { value: 'u' } });
  fireEvent.change(getByLabelText('Password'), { target: { value: 'p' } });
  fireEvent.click(getAllByRole('button', { name: /login/i })[0]);
  await waitFor(() =>
    expect(onLoggedIn).toHaveBeenCalledWith('token123', { theme: 'modern', lang: 'en' })
  );
  expect(login).toHaveBeenCalledWith('u', 'p', 'en');
  expect(localStorage.getItem('token')).toBe('token123');
});

test('shows error on failed login', async () => {
  login.mockRejectedValue(new Error('bad'));
  const { getByLabelText, getAllByRole, findByText } = render(<Login onLoggedIn={() => {}} />);
  fireEvent.change(getByLabelText('Username'), { target: { value: 'u' } });
  fireEvent.change(getByLabelText('Password'), { target: { value: 'p' } });
  fireEvent.click(getAllByRole('button', { name: /login/i })[0]);
  expect(await findByText('bad')).toBeTruthy();
  expect(login).toHaveBeenCalledWith('u', 'p', 'en');
});

