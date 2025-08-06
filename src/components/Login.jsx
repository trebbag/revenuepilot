import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { login } from '../api.js';

/**
 * Simple login form that authenticates against the backend and stores the
 * returned JWT in localStorage. On success the parent component is notified
 * so the application can render the secured views.
 */
function Login({ onLoggedIn }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, settings } = await login(username, password);
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', token);
      }
      onLoggedIn(token, settings);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-form" style={{ maxWidth: '20rem', margin: '2rem auto' }}>
        <h2>{t('login.title')}</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              {t('login.username')}
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              {t('login.password')}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          </div>
        {error && (
          <p style={{ color: 'red' }} data-testid="login-error">
            {error}
          </p>
        )}
          <button type="submit" disabled={loading}>
            {loading ? t('login.loggingIn') : t('login.login')}
          </button>
        </form>
      </div>
  );
}

export default Login;
