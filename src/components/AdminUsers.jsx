import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AuditLog from './AuditLog.jsx';

function AdminUsers({ token }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');

  const baseUrl =
    import.meta?.env?.VITE_API_URL ||
    window.__BACKEND_URL__ ||
    window.location.origin;

  const fetchUsers = async () => {
    const resp = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      setUsers(data);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const invite = async (e) => {
    e.preventDefault();
    const resp = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username, password, role }),
    });
    if (resp.ok) {
      setUsername('');
      setPassword('');
      setRole('user');
      fetchUsers();
    }
  };

  const updateUser = async (u) => {
    const newRole = prompt(t('adminUsers.newRolePrompt'), u.role);
    if (!newRole) return;
    await fetch(`${baseUrl}/users/${u.username}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role: newRole }),
    });
    fetchUsers();
  };

  const deleteUser = async (u) => {
    if (
      !window.confirm(t('adminUsers.confirmDelete', { username: u.username }))
    )
      return;
    await fetch(`${baseUrl}/users/${u.username}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchUsers();
  };

  return (
    <div className="admin-users" style={{ padding: '1rem' }}>
      <h2>{t('adminUsers.title')}</h2>
      <form onSubmit={invite} style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder={t('adminUsers.username')}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder={t('adminUsers.tempPassword')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder={t('adminUsers.role')}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          required
        />
        <button type="submit">{t('adminUsers.invite')}</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>{t('adminUsers.colUsername')}</th>
            <th>{t('adminUsers.colRole')}</th>
            <th>{t('adminUsers.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.username}>
              <td>{u.username}</td>
              <td>{u.role}</td>
              <td>
                <button onClick={() => updateUser(u)}>
                  {t('adminUsers.update')}
                </button>
                <button onClick={() => deleteUser(u)}>
                  {t('adminUsers.delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AuditLog token={token} />
    </div>
  );
}

export default AdminUsers;
