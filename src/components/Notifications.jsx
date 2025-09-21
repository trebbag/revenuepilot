import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api.js';

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  } catch {
    return '';
  }
}

function Notifications() {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listNotifications({ limit: 50, offset: 0 });
      setNotifications(data.items || []);
    } catch (err) {
      console.error('Failed to load notifications', err);
      setError(t('notifications.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const unreadCount = notifications.reduce(
    (count, item) => (item && !item.isRead ? count + 1 : count),
    0,
  );

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                isRead: true,
                readAt: item.readAt || new Date().toISOString(),
              }
            : item,
        ),
      );
    } catch (err) {
      console.error('Failed to mark notification read', err);
      setError(t('notifications.error'));
    }
  };

  const handleMarkAll = async () => {
    if (!unreadCount) return;
    try {
      await markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((item) => ({
          ...item,
          isRead: true,
          readAt: item.readAt || new Date().toISOString(),
        })),
      );
    } catch (err) {
      console.error('Failed to mark notifications read', err);
      setError(t('notifications.error'));
    }
  };

  return (
    <div className="notifications-view">
      <div className="notifications-header">
        <h2>{t('notifications.title')}</h2>
        <div className="notifications-actions">
          <span className="notifications-unread" aria-live="polite">
            {t('notifications.unreadCount', { count: unreadCount })}
          </span>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={!unreadCount || loading}
          >
            {t('notifications.markAll')}
          </button>
          <button type="button" onClick={loadNotifications} disabled={loading}>
            {loading ? t('notifications.refreshing') : t('notifications.refresh')}
          </button>
        </div>
      </div>
      {error && <div className="notifications-error">{error}</div>}
      {loading ? (
        <div className="notifications-loading">{t('notifications.loading')}</div>
      ) : notifications.length === 0 ? (
        <div className="notifications-empty">{t('notifications.empty')}</div>
      ) : (
        <ul className="notifications-list">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`notification-card ${notification.isRead ? 'read' : 'unread'}`}
            >
              <div className="notification-card-header">
                <span className="notification-title">
                  {notification.title || t('notifications.untitled')}
                </span>
                {notification.severity && (
                  <span className={`notification-severity severity-${notification.severity}`}>
                    {notification.severity.toUpperCase()}
                  </span>
                )}
              </div>
              {notification.message && (
                <p className="notification-message">{notification.message}</p>
              )}
              <div className="notification-card-footer">
                <time dateTime={notification.timestamp}>
                  {formatTimestamp(notification.timestamp)}
                </time>
                {notification.isRead ? (
                  <span className="notification-read-label">
                    {t('notifications.read')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(notification.id)}
                  >
                    {t('notifications.markRead')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Notifications;
