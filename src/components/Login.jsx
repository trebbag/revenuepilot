import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback } from 'react';
import {
  login,
  resetPassword,
  register,
  pingBackend,
  getLastBackendError,
  fetchAuthPolicy,
} from '../api.js';

const getElectronAPI = () => (typeof window !== 'undefined' ? window.electronAPI : null);

/**
 * Unified authentication form for RevenuePilot with improved UX, styling and
 * accessibility. Converts inline styles to CSS classes (see src/styles/app.css)
 * and adds common best-practice features: show/hide password, remember username,
 * inline validation, helpful error messages, and clear flows for register/reset.
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
  const [diag, setDiag] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUsername, setRememberUsername] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [authPolicy, setAuthPolicy] = useState(null);
  const [securityWarning, setSecurityWarning] = useState(null);

  useEffect(() => {
    // restore remembered username
    if (typeof window !== 'undefined') {
      const remembered = localStorage.getItem('rememberedUsername');
      if (remembered) setUsername(remembered);
    }
  }, []);

  const checkBackend = useCallback(async () => {
    setChecking(true);
    const ok = await pingBackend();
    setBackendUp(ok);
    setChecking(false);
    if (!ok) setDiag(getLastBackendError && getLastBackendError());
  }, []);

  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  useEffect(() => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.on) return undefined;
    const removeReady = electronAPI.on('backend-ready', () => {
      checkBackend();
    });
    const removeFailed = electronAPI.on('backend-failed', () => {
      setBackendUp(false);
    });
    const removeDiagnostics = electronAPI.on(
      'backend-diagnostics',
      (_event, payload) => {
        setDiag(payload);
      },
    );
    return () => {
      removeReady?.();
      removeFailed?.();
      removeDiagnostics?.();
    };
  }, [checkBackend]);

  useEffect(() => {
    let mounted = true;
    fetchAuthPolicy()
      .then((policy) => {
        if (mounted && policy) setAuthPolicy(policy);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      mounted = false;
    };
  }, []);

  const passwordScore = useCallback((pwd) => {
    let score = 0;
    if (!pwd) return 0;
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

  function validUsername(u) {
    return typeof u === 'string' && u.trim().length >= 3;
  }

  function validNewPassword(p) {
    return typeof p === 'string' && p.length >= 8;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSecurityWarning(null);

    if (!validUsername(username)) {
      setError('Please enter a valid username (at least 3 characters).');
      return;
    }

    if (mode === 'register') {
      if (!validNewPassword(password)) {
        setError('Choose a stronger password (at least 8 characters).');
        return;
      }
      if (password !== confirmPassword) {
        setError(t('login.passwordsDoNotMatch') || 'Passwords do not match');
        return;
      }
    }

    if (mode === 'reset') {
      if (!validNewPassword(newPassword)) {
        setError('New password must be at least 8 characters.');
        return;
      }
    }

    if (!backendUp && !offlineMode) {
      setError(
        'Backend not reachable. Retry or use "Proceed offline" to simulate authentication for development.',
      );
      return;
    }

    setLoading(true);
    try {
      if (offlineMode) {
        // Simulate successful authentication flows for development
        if (mode === 'login') {
          const token = 'offline-token';
          const refreshToken = 'offline-refresh';
          const settings = { lang, summaryLang: lang };
          if (typeof window !== 'undefined') {
            localStorage.setItem('token', token);
            localStorage.setItem('refreshToken', refreshToken);
            if (rememberUsername)
              localStorage.setItem('rememberedUsername', username);
          }
          onLoggedIn(token, settings);
        } else if (mode === 'register') {
          const token = 'offline-token-reg';
          const refreshToken = 'offline-refresh-reg';
          const settings = { lang, summaryLang: lang };
          if (typeof window !== 'undefined') {
            localStorage.setItem('token', token);
            localStorage.setItem('refreshToken', refreshToken);
            if (rememberUsername)
              localStorage.setItem('rememberedUsername', username);
          }
          onLoggedIn(token, settings);
        } else if (mode === 'reset') {
          setInfo(
            t('login.resetSuccess') ||
              'Password updated (simulated). You can now log in.',
          );
          setMode('login');
          setPassword('');
          setNewPassword('');
        }
        return;
      }

        if (mode === 'login') {
          const { token, refreshToken, settings } = await login(
            username,
            password,
            lang,
        );
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', token);
          localStorage.setItem('refreshToken', refreshToken);
          if (rememberUsername)
            localStorage.setItem('rememberedUsername', username);
          else localStorage.removeItem('rememberedUsername');
        }
        const newSettings = settings
          ? { ...settings, lang, summaryLang: settings.summaryLang || lang }
          : { lang, summaryLang: lang };
        onLoggedIn(token, newSettings);
      } else if (mode === 'register') {
        const { token, refreshToken, settings } = await register(
          username,
          password,
          lang,
        );
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', token);
          localStorage.setItem('refreshToken', refreshToken);
          if (rememberUsername)
            localStorage.setItem('rememberedUsername', username);
        }
        const newSettings = settings
          ? { ...settings, lang, summaryLang: settings.summaryLang || lang }
          : { lang, summaryLang: lang };
        onLoggedIn(token, newSettings);
      } else if (mode === 'reset') {
        await resetPassword(username, password, newPassword);
        setInfo(
          t('login.resetSuccess') || 'Password updated. You can now log in.',
        );
        setMode('login');
        setPassword('');
        setNewPassword('');
      }
    } catch (err) {
      setError(err && err.message ? err.message : 'Operation failed');
      const remaining =
        err && typeof err.remainingAttempts === 'number'
          ? err.remainingAttempts
          : null;
      const durationSeconds =
        (err && typeof err.lockoutDurationSeconds === 'number'
          ? err.lockoutDurationSeconds
          : null) ||
        (authPolicy && authPolicy.lockoutDurationSeconds) ||
        null;
      const minutes = durationSeconds ? Math.ceil(durationSeconds / 60) : null;
      if (remaining != null) {
        setSecurityWarning(
          `${
            t('login.remainingAttemptsWarning', {
              count: remaining,
              minutes: minutes ?? 15,
            }) ||
            `Warning: ${remaining} attempts remaining before lockout.`
          } ${
            t('login.repeatedFailuresAlert') ||
            'Repeated failures trigger security alerts.'
          }`
        );
      } else if (err && err.code === 'ACCOUNT_LOCKED') {
        setSecurityWarning(
          t('login.accountLocked', {
            minutes: minutes ?? 15,
          }) ||
            'This account is locked temporarily. Try again later or contact support.'
        );
      } else if (err && err.code === 'RATE_LIMITED') {
        setSecurityWarning(
          t('login.rateLimited', {
            minutes: minutes ?? 15,
          }) ||
            'Too many attempts. Please wait and try again.'
        );
      }
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-root">
      <div className="auth-viewport">
        <div className="auth-brand">
          <img
            src="/assets/icon.png"
            alt="RevenuePilot"
            className="auth-logo"
          />
          <div className="auth-brand-text">
            <h1 className="auth-app">RevenuePilot</h1>
            <p className="auth-tagline">
              Clinical documentation that improves outcomes and revenue.
            </p>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-card-header">
            <h2 className="auth-title">
              {mode === 'login'
                ? t('login.title') || 'Sign in'
                : mode === 'register'
                  ? t('login.register') || 'Create account'
                  : t('login.resetPassword') || 'Reset password'}
            </h2>
            <div className="auth-subtle">
              {mode === 'login'
                ? t('login.subtitle') || 'Secure access to RevenuePilot'
                : null}
            </div>
          </div>

          <div className="auth-card-body">
            {!backendUp && !checking && !offlineMode && (
              <div className="backend-warning" role="alert">
                <strong>
                  {t('login.backendUnavailable') || 'Backend not reachable.'}
                </strong>
                <div className="backend-details">
                  {diag || (getLastBackendError && getLastBackendError())}
                </div>
                <details className="backend-log">
                  <summary>Startup log (tail)</summary>
                  <pre className="backend-log-pre">
                    {diag && diag.logTail ? diag.logTail.join('\n') : ''}
                  </pre>
                </details>
                <div className="backend-actions">
                  <button
                    type="button"
                    className="auth-link-button"
                    onClick={checkBackend}
                    disabled={checking}
                  >
                    {checking
                      ? t('login.checking') || 'Checking...'
                      : t('login.retry') || 'Retry'}
                  </button>
                  <button
                    type="button"
                    className="auth-link-button"
                    onClick={() => setOfflineMode(true)}
                  >
                    Proceed offline (simulate)
                  </button>
                </div>
              </div>
            )}

            {offlineMode && (
              <div className="auth-info" role="status">
                Running in offline simulation mode — authentication is simulated
                locally for development.
              </div>
            )}

            {authPolicy && (
              <div className="auth-policy-note" role="note">
                {t('login.lockoutNotice', {
                  threshold: authPolicy.lockoutThreshold,
                  minutes: Math.ceil(
                    authPolicy.lockoutDurationSeconds / 60,
                  ),
                }) ||
                  `Accounts lock after ${authPolicy.lockoutThreshold} failed attempts for ${Math.ceil(
                    authPolicy.lockoutDurationSeconds / 60,
                  )} minutes.`}
              </div>
            )}

            <form
              id="auth-form"
              onSubmit={handleSubmit}
              className="auth-form"
              aria-busy={loading || checking}
            >
              <label className="auth-label">
                <span> {t('login.username') || 'Email or username'}</span>
                <input
                  className="auth-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  aria-label="username"
                />
              </label>

              {mode !== 'register' && (
                <label className="auth-label">
                  <span>
                    {mode === 'reset'
                      ? t('login.currentPassword') || 'Current password'
                      : t('login.password') || 'Password'}
                  </span>
                  <div className="auth-password-row">
                    <input
                      className="auth-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete={
                        mode === 'register'
                          ? 'new-password'
                          : 'current-password'
                      }
                      aria-label="password"
                    />
                    <button
                      type="button"
                      className="show-password"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-pressed={showPassword}
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
              )}

              {mode === 'register' && (
                <>
                  <label className="auth-label">
                    <span>{t('login.password') || 'Password'}</span>
                    <div className="auth-password-row">
                      <input
                        className="auth-input"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        aria-label="new-password"
                      />
                      <button
                        type="button"
                        className="show-password"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {password && (
                      <div className="password-strength">
                        <div className="strength-label">
                          {strengthLabel(passwordScore(password))}
                        </div>
                        <div className="strength-bars">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div
                              key={i}
                              className={`strength-bar ${i < passwordScore(password) ? 'active' : ''}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </label>

                  <label className="auth-label">
                    <span>
                      {t('login.confirmPassword') || 'Confirm password'}
                    </span>
                    <input
                      className="auth-input"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      aria-label="confirm-password"
                    />
                  </label>
                </>
              )}

              {mode === 'reset' && (
                <label className="auth-label">
                  <span>{t('login.newPassword') || 'New password'}</span>
                  <input
                    className="auth-input"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    aria-label="new-password"
                  />
                </label>
              )}

              <label className="auth-label compact">
                <span>{t('settings.language') || 'Language'}</span>
                <select
                  className="auth-select"
                  value={lang}
                  onChange={(e) => {
                    const l = e.target.value;
                    setLang(l);
                    i18n.changeLanguage(l);
                  }}
                >
                  <option value="en">
                    {t('settings.english') || 'English'}
                  </option>
                  <option value="es">
                    {t('settings.spanish') || 'Spanish'}
                  </option>
                  <option value="fr">{t('settings.french') || 'French'}</option>
                  <option value="de">{t('settings.german') || 'German'}</option>
                </select>
              </label>

              <div className="auth-row">
                <label className="remember">
                  <input
                    type="checkbox"
                    checked={rememberUsername}
                    onChange={(e) => setRememberUsername(e.target.checked)}
                  />
                  <span>Remember username</span>
                </label>

                {mode === 'login' && (
                  <button
                    type="button"
                    className="auth-link-button"
                    onClick={() => {
                      setMode('reset');
                      setError(null);
                      setInfo(null);
                      setSecurityWarning(null);
                    }}
                  >
                    Forgot?
                  </button>
                )}
              </div>

              {securityWarning && (
                <div className="auth-warning" role="alert">
                  {securityWarning}
                </div>
              )}

              {error && (
                <div
                  className="auth-error"
                  role="alert"
                  data-testid="login-error"
                >
                  {error}
                </div>
              )}
              {info && (
                <div
                  className="auth-info"
                  role="status"
                  data-testid="login-info"
                >
                  {info}
                </div>
              )}
            </form>
          </div>

          <div className="auth-card-actions">
            <button
              type="submit"
              form="auth-form"
              className="auth-button"
              disabled={loading || checking}
            >
              {loading
                ? t('login.pleaseWait') || 'Please wait…'
                : mode === 'login'
                  ? t('login.login') || 'Sign in'
                  : mode === 'register'
                    ? t('login.register') || 'Create account'
                    : t('login.resetPassword') || 'Update password'}
            </button>
          </div>

          <div className="auth-footer">
            {mode !== 'login' ? (
              <button
                type="button"
                className="auth-link-button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                  setSecurityWarning(null);
                }}
              >
                Back to sign in
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="auth-link-button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                    setInfo(null);
                    setSecurityWarning(null);
                  }}
                >
                  Create account
                </button>
                <button
                  type="button"
                  className="auth-link-button"
                  onClick={() => {
                    setMode('reset');
                    setError(null);
                    setInfo(null);
                    setSecurityWarning(null);
                  }}
                >
                  Reset password
                </button>
              </>
            )}
          </div>
        </div>

        <div className="auth-help">
          <h3>Why RevenuePilot?</h3>
          <p>
            Write notes faster with AI-assisted drafting, export to FHIR, and
            keep your documentation compliant.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
