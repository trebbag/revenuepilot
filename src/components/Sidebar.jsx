// Sidebar navigation component.  Provides top-level navigation and a collapse toggle.
import { useTranslation } from 'react-i18next';

function Sidebar({ collapsed, toggleCollapsed, onNavigate }) {
  const { t } = useTranslation();
  const items = [
    { key: 'note', label: t('sidebar.notes') },
    { key: 'drafts', label: t('sidebar.drafts') },
    { key: 'dashboard', label: t('sidebar.analytics') },
    { key: 'logs', label: t('sidebar.logs') },
    { key: 'settings', label: t('sidebar.settings') },
    { key: 'help', label: t('sidebar.help') },
  ];
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
        {items.map((item) => (
          <button key={item.key} onClick={() => onNavigate(item.key)}>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default Sidebar;