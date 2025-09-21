/* @vitest-environment jsdom */
import { render, screen, act, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import Sidebar from '../components/Sidebar.jsx';
import '../i18n.js';

const closeMock = vi.fn();
const apiMocks = vi.hoisted(() => ({
  getNotificationCount: vi.fn(),
  connectNotificationsStream: vi.fn(),
}));

vi.mock('../api.js', () => ({
  getNotificationCount: apiMocks.getNotificationCount,
  connectNotificationsStream: apiMocks.connectNotificationsStream,
}));

const defaultProps = {
  collapsed: false,
  toggleCollapsed: () => {},
  onNavigate: () => {},
  role: 'user',
  onLogout: () => {},
};

beforeEach(() => {
  apiMocks.getNotificationCount.mockResolvedValue({ notifications: 3, drafts: 2 });
  apiMocks.connectNotificationsStream.mockImplementation(({ onCount } = {}) => {
    if (typeof onCount === 'function') {
      onCount({ notifications: 3, drafts: 2 });
    }
    return { close: closeMock };
  });
  closeMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('renders badges with counts from the API', async () => {
  render(<Sidebar {...defaultProps} />);
  expect(
    await screen.findByRole('button', { name: /Drafts \(2\)/i }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: /Notifications \(3\)/i }),
  ).toBeTruthy();
});

test('updates counts when websocket pushes new data', async () => {
  let onCount;
  apiMocks.connectNotificationsStream.mockImplementation((options = {}) => {
    onCount = options.onCount;
    return { close: closeMock };
  });
  render(<Sidebar {...defaultProps} />);
  expect(await screen.findByRole('button', { name: /Drafts/i })).toBeTruthy();
  act(() => {
    onCount?.({ notifications: 12 });
  });
  expect(
    screen.getByRole('button', { name: /Notifications \(12\)/i }),
  ).toBeTruthy();
  act(() => {
    onCount?.({ drafts: 4 });
  });
  expect(screen.getByRole('button', { name: /Drafts \(4\)/i })).toBeTruthy();
});

test('displays 999+ when counts exceed the threshold', async () => {
  apiMocks.getNotificationCount.mockResolvedValue({ notifications: 1200, drafts: 5 });
  render(<Sidebar {...defaultProps} />);
  expect(
    await screen.findByRole('button', { name: /Notifications \(999\+\)/i }),
  ).toBeTruthy();
});

test('cleans up websocket subscription on unmount', async () => {
  const { unmount } = render(<Sidebar {...defaultProps} />);
  await screen.findByRole('button', { name: /Drafts/i });
  unmount();
  expect(closeMock).toHaveBeenCalled();
});
