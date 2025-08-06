import { useEffect, useState } from 'react';

function AdminUsers({ token }) {
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
    const newRole = prompt('New role', u.role);
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
    if (!window.confirm(`Delete ${u.username}?`)) return;
    await fetch(`${baseUrl}/users/${u.username}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchUsers();
  };

  return (
    <div className="admin-users" style={{ padding: '1rem' }}>
      <h2>Users</h2>
      <form onSubmit={invite} style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Temp Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          required
        />
        <button type="submit">Invite</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.username}>
              <td>{u.username}</td>
              <td>{u.role}</td>
              <td>
                <button onClick={() => updateUser(u)}>Update</button>
                <button onClick={() => deleteUser(u)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminUsers;
