import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { login, resetPassword, register } from '../api.js';

/**
 * Simple login form that authenticates against the backend and stores the
 * returned JWT in localStorage. On success the parent component is notified
 * so the application can render the secured views.
 */
function Login({ onLoggedIn }) {
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [lang, setLang] = useState('en');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, refreshToken, settings } = await login(
        username,
        password,
        lang,
      );
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', token);
        localStorage.setItem('refreshToken', refreshToken);
      }
      const newSettings = settings
        ? { ...settings, lang, summaryLang: settings.summaryLang || lang }
        : { lang, summaryLang: lang };
      onLoggedIn(token, newSettings);
    } catch (err) {
      const msg =
        err.message === 'Login failed' ? t('login.loginFailed') : err.message;
      setError(msg || t('login.loginFailed'));
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, refreshToken, settings } = await register(
        username,
        password,
        lang,
      );
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', token);
        localStorage.setItem('refreshToken', refreshToken);
      }
      const newSettings = settings
        ? { ...settings, lang, summaryLang: settings.summaryLang || lang }
        : { lang, summaryLang: lang };
      onLoggedIn(token, newSettings);
    } catch (err) {
      setError(err.message || t('login.registerFailed'));
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
    <div
      className="login-form"
      style={{ maxWidth: '20rem', margin: '2rem auto' }}
    >
      <h2>{t('login.title')}</h2>
      <form onSubmit={registerMode ? handleRegister : resetMode ? handleReset : handleSubmit}>
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
            {t('settings.language')}
            <select
              value={lang}
              onChange={(e) => {
                const l = e.target.value;
                setLang(l);
                i18n.changeLanguage(l);
              }}
            >
              <option value="en">{t('settings.english')}</option>
              <option value="es">{t('settings.spanish')}</option>
              <option value="fr">{t('settings.french')}</option>
              <option value="de">{t('settings.german')}</option>
            </select>
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
            ? t(
                resetMode
                  ? 'login.resetting'
                  : registerMode
                  ? 'login.registering'
                  : 'login.loggingIn'
              )
            : t(
                resetMode
                  ? 'login.resetPassword'
                  : registerMode
                  ? 'login.register'
                  : 'login.login'
              )}
        </button>
        {!resetMode && !registerMode && (
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
        {!resetMode && !registerMode && (
          <button
            type="button"
            style={{ marginLeft: '0.5rem' }}
            onClick={() => {
              setError(null);
              setRegisterMode(true);
            }}
          >
            {t('login.register')}
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
        {registerMode && (
          <button
            type="button"
            style={{ marginLeft: '0.5rem' }}
            onClick={() => {
              setError(null);
              setRegisterMode(false);
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
