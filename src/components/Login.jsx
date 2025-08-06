import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { login, resetPassword } from '../api.js';

/**
 * Simple login form that authenticates against the backend and stores the
 * returned JWT in localStorage. On success the parent component is notified
 * so the application can render the secured views.
 */
function Login({ onLoggedIn }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);

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

  const handleReset = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await resetPassword(username, password, newPassword);
      setError(t('login.resetSuccess'));
      setResetMode(false);
      setPassword('');
      setNewPassword('');
    } catch (err) {
      setError(err.message || t('login.resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-form" style={{ maxWidth: '20rem', margin: '2rem auto' }}>
        <h2>{t('login.title')}</h2>
        <form onSubmit={resetMode ? handleReset : handleSubmit}>
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
          {resetMode && (
            <div style={{ marginBottom: '0.5rem' }}>
              <label>
                {t('login.newPassword')}
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </label>
            </div>
          )}
        {error && (
          <p style={{ color: 'red' }} data-testid="login-error">
            {error}
          </p>
        )}
          <button type="submit" disabled={loading}>
            {loading
              ? t(resetMode ? 'login.resetting' : 'login.loggingIn')
              : t(resetMode ? 'login.resetPassword' : 'login.login')}
          </button>
          {!resetMode && (
            <button
              type="button"
              style={{ marginLeft: '0.5rem' }}
              onClick={() => {
                setError(null);
                setResetMode(true);
              }}
            >
              {t('login.resetPassword')}
            </button>
          )}
          {resetMode && (
            <button
              type="button"
              style={{ marginLeft: '0.5rem' }}
              onClick={() => {
                setError(null);
                setResetMode(false);
              }}
            >
              {t('login.backToLogin')}
            </button>
          )}
        </form>
      </div>
  );
}

export default Login;
