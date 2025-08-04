// Sidebar navigation component.  Provides top-level navigation and a collapse toggle.

function Sidebar({ collapsed, toggleCollapsed, onNavigate }) {
  const items = [
    { key: 'note', label: 'Notes' },
    { key: 'drafts', label: 'Drafts' },
    { key: 'dashboard', label: 'Analytics' },
    { key: 'logs', label: 'Logs' },
    { key: 'settings', label: 'Settings' },
    { key: 'help', label: 'Help' },
  ];
  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <button
        className="collapse-btn"
        onClick={toggleCollapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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