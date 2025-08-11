import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback } from 'react';
import { login, resetPassword, register, pingBackend } from '../api.js';

// Detect Electron renderer context (simplistic)
const isElectron = typeof window !== 'undefined' && !!window.require && !!window.process && window.process.type === 'renderer';
let ipcRenderer = null;
try { if (isElectron) { ipcRenderer = window.require('electron').ipcRenderer; } } catch { /* ignore */ }

/**
 * Unified authentication form with login, registration and password reset flows.
 * Adds basic password strength feedback, confirm password field for registration,
 * backend reachability checking with retry button, and improved inline validation.
 */
function Login({ onLoggedIn }) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'reset'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [backendUp, setBackendUp] = useState(true);
  const [checking, setChecking] = useState(true);
  const [lang, setLang] = useState('en');
  const [diag, setDiag] = useState(null); // store backend diagnostics (log tail etc.)

  const checkBackend = useCallback(async () => {
    setChecking(true);
    const ok = await pingBackend();
    setBackendUp(ok);
    setChecking(false);
  }, []);

  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  // Listen for backend-ready / failed signals from main process to auto-retry
  useEffect(() => {
    if (!ipcRenderer) return; // not in electron
    const handleReady = () => { checkBackend(); };
    const handleFailed = () => { setBackendUp(false); };
    const handleDiagnostics = (_event, payload) => { setDiag(payload); };
    ipcRenderer.on('backend-ready', handleReady);
    ipcRenderer.on('backend-failed', handleFailed);
    ipcRenderer.on('backend-diagnostics', handleDiagnostics);
    return () => {
      ipcRenderer.removeListener('backend-ready', handleReady);
      ipcRenderer.removeListener('backend-failed', handleFailed);
      ipcRenderer.removeListener('backend-diagnostics', handleDiagnostics);
    };
  }, [checkBackend]);

  const passwordScore = useCallback((pwd) => {
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[a-z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
    return score; // 0-5
  }, []);

  const strengthLabel = (s) => {
    if (s <= 1) return t('login.passwordWeak') || 'Weak';
    if (s === 2) return t('login.passwordFair') || 'Fair';
    if (s === 3) return t('login.passwordGood') || 'Good';
    if (s === 4) return t('login.passwordStrong') || 'Strong';
    return t('login.passwordVeryStrong') || 'Very strong';
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!backendUp) {
      setError('Backend not reachable.');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError(t('login.passwordsDoNotMatch') || 'Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { token, refreshToken, settings } = await login(username, password, lang);
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', token);
          localStorage.setItem('refreshToken', refreshToken);
        }
        const newSettings = settings ? { ...settings, lang, summaryLang: settings.summaryLang || lang } : { lang, summaryLang: lang };
        onLoggedIn(token, newSettings);
      } else if (mode === 'register') {
        const { token, refreshToken, settings } = await register(username, password, lang);
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', token);
          localStorage.setItem('refreshToken', refreshToken);
        }
        const newSettings = settings ? { ...settings, lang, summaryLang: settings.summaryLang || lang } : { lang, summaryLang: lang };
        onLoggedIn(token, newSettings); // auto-login after registration
      } else if (mode === 'reset') {
        await resetPassword(username, password, newPassword);
        setInfo(t('login.resetSuccess') || 'Password updated. You can now log in.');
        setMode('login');
        setPassword('');
        setNewPassword('');
      }
    } catch (err) {
      setError(err.message || 'Operation failed');
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-form" style={{ maxWidth: '26rem', margin: '2.5rem auto', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ textAlign: 'center' }}>
        {mode === 'login' ? t('login.title') : mode === 'register' ? t('login.register') : t('login.resetPassword')}
      </h2>
      {!backendUp && !checking && (
        <div style={{ background: '#ffe9e9', padding: '0.75rem', borderRadius: 4, marginBottom: '1rem', color: '#900' }}>
          <strong>{t('login.backendUnavailable') || 'Backend not reachable.'}</strong>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            {/* Attempt to pull diagnostic detail if available */}
            {(() => { try { const { getLastBackendError } = require('../api.js'); const d = getLastBackendError && getLastBackendError(); return d ? ` (${d})` : null; } catch { return null; } })()}
            {diag && diag.message ? ` – ${diag.message}` : null}
          </div>
          {diag && diag.logTail && diag.logTail.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer' }}>Startup log (tail)</summary>
              <pre style={{ maxHeight: 160, overflow: 'auto', background: '#fff', padding: 8, fontSize: 11, lineHeight: 1.2 }}>
                {diag.logTail.join('\n')}
              </pre>
              {diag.logFile && <div style={{ fontSize: 11, marginTop: 4 }}>Full log: {diag.logFile}</div>}
            </details>
          )}
          <div style={{ marginTop: 4 }}>
            <button type="button" onClick={checkBackend} disabled={checking}>
              {checking ? t('login.checking') || 'Checking...' : t('login.retry') || 'Retry'}
            </button>
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} style={{ opacity: checking ? 0.6 : 1 }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
            {t('login.username')}
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              style={{ width: '100%', padding: '0.5rem', marginTop: 4 }}
            />
          </label>
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
            {mode === 'reset' ? t('login.currentPassword') || t('login.password') : t('login.password')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              style={{ width: '100%', padding: '0.5rem', marginTop: 4 }}
            />
          </label>
          {mode === 'register' && password && (
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {strengthLabel(passwordScore(password))}
              <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 4, background: i < passwordScore(password) ? '#4caf50' : '#ddd', borderRadius: 2 }} />
                ))}
              </div>
            </div>
          )}
        </div>
        {mode === 'register' && (
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
              {t('login.confirmPassword') || 'Confirm password'}
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                style={{ width: '100%', padding: '0.5rem', marginTop: 4 }}
              />
            </label>
          </div>
        )}
        {mode === 'reset' && (
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
              {t('login.newPassword')}
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                style={{ width: '100%', padding: '0.5rem', marginTop: 4 }}
              />
            </label>
          </div>
        )}
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
            {t('settings.language')}
            <select
              value={lang}
              onChange={(e) => {
                const l = e.target.value;
                setLang(l);
                i18n.changeLanguage(l);
              }}
              style={{ width: '100%', padding: '0.5rem', marginTop: 4 }}
            >
              <option value="en">{t('settings.english')}</option>
              <option value="es">{t('settings.spanish')}</option>
              <option value="fr">{t('settings.french')}</option>
              <option value="de">{t('settings.german')}</option>
            </select>
          </label>
        </div>
        {error && (
          <p style={{ color: 'red', fontSize: 13 }} data-testid="login-error">
            {error}
          </p>
        )}
        {info && (
          <p style={{ color: 'green', fontSize: 13 }} data-testid="login-info">
            {info}
          </p>
        )}
        <button type="submit" disabled={loading || checking || !backendUp} style={{ width: '100%', padding: '0.75rem', marginTop: '0.25rem' }}>
          {loading
            ? t('login.pleaseWait') || 'Please wait…'
            : mode === 'login'
              ? t('login.login')
              : mode === 'register'
                ? t('login.register')
                : t('login.resetPassword')}
        </button>
      </form>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        {mode !== 'login' && (
          <button type="button" onClick={() => { setMode('login'); setError(null); setInfo(null); }} style={{ background: 'none', border: 'none', color: '#0366d6', cursor: 'pointer' }}>
            {t('login.backToLogin')}
          </button>
        )}
        {mode === 'login' && (
          <>
            <button type="button" onClick={() => { setMode('register'); setError(null); setInfo(null); }} style={{ background: 'none', border: 'none', color: '#0366d6', cursor: 'pointer' }}>
              {t('login.register')}
            </button>
            <button type="button" onClick={() => { setMode('reset'); setError(null); setInfo(null); }} style={{ background: 'none', border: 'none', color: '#0366d6', cursor: 'pointer' }}>
              {t('login.resetPassword')}
            </button>
          </>
        )}
        {mode === 'register' && (
          <button type="button" onClick={() => { setMode('reset'); setError(null); setInfo(null); }} style={{ background: 'none', border: 'none', color: '#0366d6', cursor: 'pointer' }}>
            {t('login.resetPassword')}
          </button>
        )}
      </div>
    </div>
  );
}

export default Login;
