/* @vitest-environment jsdom */

import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { vi, expect, test, beforeEach, afterEach } from 'vitest';

vi.mock('../../api.js', () => ({ login: vi.fn() }));
import { login } from '../../api.js';
import Login from '../Login.jsx';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => cleanup());

test('successful login stores token and calls callback', async () => {
  login.mockResolvedValue('token123');
  const onLoggedIn = vi.fn();
  const { getByLabelText, getByRole } = render(<Login onLoggedIn={onLoggedIn} />);
  fireEvent.change(getByLabelText('Username'), { target: { value: 'u' } });
  fireEvent.change(getByLabelText('Password'), { target: { value: 'p' } });
  fireEvent.click(getByRole('button', { name: /login/i }));
  await waitFor(() => expect(onLoggedIn).toHaveBeenCalledWith('token123'));
  expect(localStorage.getItem('token')).toBe('token123');
});

test('shows error on failed login', async () => {
  login.mockRejectedValue(new Error('bad'));
  const { getByLabelText, getByRole, findByText } = render(<Login onLoggedIn={() => {}} />);
  fireEvent.change(getByLabelText('Username'), { target: { value: 'u' } });
  fireEvent.change(getByLabelText('Password'), { target: { value: 'p' } });
  fireEvent.click(getByRole('button', { name: /login/i }));
  expect(await findByText('bad')).toBeTruthy();
});

