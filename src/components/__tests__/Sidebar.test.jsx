/* @vitest-environment jsdom */
import { render, fireEvent } from '@testing-library/react';
import { vi, expect, test } from 'vitest';
import '../../i18n.js';
import Sidebar from '../Sidebar.jsx';

test('renders user navigation and handles actions', () => {
  const onNavigate = vi.fn();
  const toggleCollapsed = vi.fn();
  const onLogout = vi.fn();
  const { getByText, getByTitle, queryByText } = render(
    <Sidebar
      collapsed={false}
      toggleCollapsed={toggleCollapsed}
      onNavigate={onNavigate}
      role="user"
      onLogout={onLogout}
    />
  );
  fireEvent.click(getByText('Notes'));
  expect(onNavigate).toHaveBeenCalledWith('note');
  expect(queryByText('Users')).toBeNull();
  fireEvent.click(getByTitle('Collapse sidebar'));
  expect(toggleCollapsed).toHaveBeenCalled();
  fireEvent.click(getByText('Logout'));
  expect(onLogout).toHaveBeenCalled();
});

test('shows admin link and collapsed state', () => {
  const { getByText, getByTitle, container } = render(
    <Sidebar
      collapsed={true}
      toggleCollapsed={() => {}}
      onNavigate={() => {}}
      role="admin"
      onLogout={() => {}}
    />
  );
  expect(getByText('Users')).toBeTruthy();
  expect(container.firstChild.className).toContain('collapsed');
  expect(getByTitle('Expand sidebar')).toBeTruthy();
});

