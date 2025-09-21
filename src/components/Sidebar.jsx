// Sidebar navigation component.  Provides top-level navigation and a collapse toggle.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getNotificationCount, connectNotificationsStream } from '../api.js';

function Sidebar({ collapsed, toggleCollapsed, onNavigate, role, onLogout }) {
  const { t } = useTranslation();
  const [counts, setCounts] = useState({ drafts: 0, notifications: 0 });
  const subscriptionRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const loadCounts = async () => {
      try {
        const data = await getNotificationCount();
        if (!cancelled && data) {
          setCounts({
            drafts: Number.isFinite(data.drafts) ? data.drafts : 0,
            notifications: Number.isFinite(data.notifications)
              ? data.notifications
              : 0,
          });
        }
      } catch (err) {
        console.error('Failed to load notification counts', err);
      }
    };

    loadCounts();
    subscriptionRef.current = connectNotificationsStream({
      onCount: ({ drafts, notifications }) => {
        setCounts((prev) => ({
          drafts: Number.isFinite(drafts) ? drafts : prev.drafts,
          notifications: Number.isFinite(notifications)
            ? notifications
            : prev.notifications,
        }));
      },
      onError: (err) => {
        console.error('Notifications websocket error', err);
      },
    });

    return () => {
      cancelled = true;
      if (subscriptionRef.current && typeof subscriptionRef.current.close === 'function') {
        subscriptionRef.current.close();
      }
      subscriptionRef.current = null;
    };
  }, []);

  const formatBadge = (value) => {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num) || num <= 0) return null;
    if (num > 999) return '999+';
    return String(num);
  };

  const items = [
    { key: 'note', label: t('sidebar.notes') },
    { key: 'drafts', label: t('sidebar.drafts'), badge: formatBadge(counts.drafts) },
    { key: 'notifications', label: t('sidebar.notifications'), badge: formatBadge(counts.notifications) },
    { key: 'dashboard', label: t('sidebar.analytics') },
    { key: 'logs', label: t('sidebar.logs') },
    { key: 'settings', label: t('sidebar.settings') },
    { key: 'help', label: t('sidebar.help') },
  ];
  if (role === 'admin') {
    items.splice(3, 0, { key: 'admin-users', label: t('sidebar.users') });
  }
  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <button
        className="collapse-btn"
        onClick={toggleCollapsed}
        title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
      >
        ☰
      </button>
      <nav className="nav-items">
        {items.map((item) => {
          const accessibleLabel = item.badge
            ? `${item.label} (${item.badge})`
            : item.label;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              aria-label={accessibleLabel}
              title={accessibleLabel}
            >
              <span className="nav-label">{item.label}</span>
              {item.badge && (
                <span className="badge" aria-hidden="true">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
        <button onClick={onLogout}>{t('sidebar.logout')}</button>
      </nav>
    </div>
  );
}

export default Sidebar;
