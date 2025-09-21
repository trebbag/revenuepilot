/* @vitest-environment jsdom */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import Notifications from '../components/Notifications.jsx';
import '../i18n.js';

const apiMocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

vi.mock('../api.js', () => ({
  listNotifications: apiMocks.listNotifications,
  markNotificationRead: apiMocks.markNotificationRead,
  markAllNotificationsRead: apiMocks.markAllNotificationsRead,
}));

const sampleNotifications = [
  {
    id: 'notif-1',
    title: 'Compliance alert',
    message: 'Review required',
    severity: 'high',
    timestamp: '2024-03-18T12:00:00Z',
    isRead: false,
  },
  {
    id: 'notif-2',
    title: 'Reminder',
    message: 'Complete your profile',
    severity: 'info',
    timestamp: '2024-03-18T11:30:00Z',
    isRead: true,
  },
];

beforeEach(() => {
  apiMocks.listNotifications.mockResolvedValue({
    items: sampleNotifications,
    unreadCount: 1,
    total: 2,
    limit: 50,
    offset: 0,
    nextOffset: null,
  });
  apiMocks.markNotificationRead.mockResolvedValue({ unreadCount: 0 });
  apiMocks.markAllNotificationsRead.mockResolvedValue({ unreadCount: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test('renders notification list and marks an item as read', async () => {
  render(<Notifications />);
  expect(await screen.findByText('Compliance alert')).toBeTruthy();
  const markReadButton = screen.getByRole('button', { name: /Mark as read/i });
  fireEvent.click(markReadButton);
  expect(apiMocks.markNotificationRead).toHaveBeenCalledWith('notif-1');
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: /Mark as read/i })).toBeNull();
  });
});

test('marks all notifications as read', async () => {
  render(<Notifications />);
  await screen.findByText('Compliance alert');
  const markAllButton = screen.getByRole('button', { name: /Mark all as read/i });
  fireEvent.click(markAllButton);
  expect(apiMocks.markAllNotificationsRead).toHaveBeenCalled();
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: /Mark as read/i })).toBeNull();
  });
});
