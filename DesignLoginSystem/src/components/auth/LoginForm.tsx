import React, { useState } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from './Card';
import { TextField } from './TextField';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { Alert } from './Alert';
import { Badge } from './Badge';
import { Toggle } from './Toggle';
import { MFADialog } from './MFADialog';
import { FooterLinks } from './FooterLinks';
import { Toast } from './Toast';
import { Shield, WifiOff } from 'lucide-react';

type LoginState = 'default' | 'loading' | 'error' | 'mfa' | 'success';
type ErrorType = 'invalid_credentials' | 'account_locked' | 'server_error' | 'mfa_error' | null;

interface LoginFormProps {
  mode?: 'default' | 'offline' | 'maintenance';
  multiTenant?: boolean;
  hasOfflineSession?: boolean;
  onSuccess?: () => void;
  onForgotPassword?: () => void;
}

export function LoginForm({ 
  mode = 'default', 
  multiTenant = false, 
  hasOfflineSession = false,
  onSuccess,
  onForgotPassword 
}: LoginFormProps) {
  const [loginState, setLoginState] = useState<LoginState>('default');
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [mfaState, setMfaState] = useState<'codeEntry' | 'verifying' | 'error'>('codeEntry');
  
  // Form fields
  const [clinicCode, setClinicCode] = useState('');
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [workOffline, setWorkOffline] = useState(false);
  
  // Toast state
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string; visible: boolean }>({
    type: 'info',
    message: '',
    visible: false
  });

  const isOfflineMode = mode === 'offline';
  const isMaintenanceMode = mode === 'maintenance';
  const canSignIn = !isMaintenanceMode && (!isOfflineMode || hasOfflineSession);

  const getErrorMessage = (type: ErrorType) => {
    switch (type) {
      case 'invalid_credentials':
        return "That email/username or password didn't match.";
      case 'account_locked':
        return "Too many attempts. Try again in 15 minutes.";
      case 'server_error':
        return "Service unavailable. Please try again.";
      case 'mfa_error':
        return "That code wasn't recognized. Try again.";
      default:
        return '';
    }
  };

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message, visible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
  };

  const validateForm = () => {
    if (multiTenant && !clinicCode.trim()) return false;
    if (!emailOrUsername.trim()) return false;
    if (!password.trim()) return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !canSignIn) return;

    setLoginState('loading');
    setErrorType(null);

    // TODO: Replace with actual API call
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(multiTenant && { clinicCode }),
          emailOrUsername,
          password,
          rememberMe,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        switch (data.error) {
          case 'INVALID_CREDENTIALS':
            setErrorType('invalid_credentials');
            break;
          case 'ACCOUNT_LOCKED':
            setErrorType('account_locked');
            break;
          case 'MFA_REQUIRED':
            setLoginState('mfa');
            setMfaState('codeEntry');
            return;
          default:
            setErrorType('server_error');
        }
        setLoginState('error');
        return;
      }

      // Success - handle token storage
      if (data.requiresMFA) {
        setLoginState('mfa');
        setMfaState('codeEntry');
      } else {
        showToast('success', 'Welcome back!');
        setLoginState('success');
        setTimeout(() => onSuccess?.(), 1500);
      }
    } catch (error) {
      setErrorType('server_error');
      setLoginState('error');
    }
  };

  const handleMFAVerify = async (code: string) => {
    setMfaState('verifying');
    
    try {
      const response = await fetch('/api/auth/verify-mfa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMfaState('error');
        setErrorType('mfa_error');
        return;
      }

      setLoginState('success');
      showToast('success', 'Welcome back!');
      setTimeout(() => onSuccess?.(), 1500);
    } catch (error) {
      setMfaState('error');
      setErrorType('mfa_error');
    }
  };

  const handleMFACancel = () => {
    setLoginState('default');
    setMfaState('codeEntry');
    setErrorType(null);
  };

  const handleMFAResend = async () => {
    try {
      await fetch('/api/auth/resend-mfa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      showToast('info', 'Verification code sent');
      setMfaState('codeEntry');
      setErrorType(null);
    } catch (error) {
      showToast('error', 'Failed to send code');
    }
  };

  const handleOfflineWork = () => {
    showToast('info', 'Working offline with limited features');
    setTimeout(() => onSuccess?.(), 1000);
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">
          {/* Status badges */}
          {isOfflineMode && (
            <div className="mb-4 flex justify-center">
              <Badge tone="warning" className="gap-2">
                <WifiOff className="w-4 h-4" />
                You're offline
              </Badge>
            </div>
          )}
          
          {isMaintenanceMode && (
            <div className="mb-4">
              <Alert tone="warning">
                System maintenance in progress. Sign in may be temporarily unavailable.
              </Alert>
            </div>
          )}

          <Card size="lg">
            <CardHeader
              logo={
                <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Shield className="w-8 h-8 text-primary" />
                </div>
              }
              title="Sign in"
              subtitle="Access your workspace"
            />

            <CardContent>
              {/* Global error alert */}
              {loginState === 'error' && errorType && (
                <Alert tone="error" className="mb-4">
                  {getErrorMessage(errorType)}
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Multi-tenant clinic code */}
                {multiTenant && (
                  <TextField
                    type="text"
                    label="Clinic Code"
                    placeholder="Enter your clinic code"
                    value={clinicCode}
                    onChange={setClinicCode}
                    required
                    disabled={loginState === 'loading'}
                    id="clinic-code"
                  />
                )}

                {/* Email/Username */}
                <TextField
                  type="email"
                  label="Email or Username"
                  placeholder="Enter your email or username"
                  value={emailOrUsername}
                  onChange={setEmailOrUsername}
                  iconLeft="user"
                  required
                  disabled={loginState === 'loading'}
                  id="email-username"
                />

                {/* Password */}
                <TextField
                  type="password"
                  label="Password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={setPassword}
                  iconLeft="lock"
                  required
                  disabled={loginState === 'loading'}
                  id="password"
                />

                {/* Remember me */}
                <Checkbox
                  checked={rememberMe}
                  onChange={setRememberMe}
                  label="Remember me on this device"
                  disabled={loginState === 'loading'}
                  id="remember-me"
                />

                {/* Offline mode toggle */}
                {isOfflineMode && hasOfflineSession && (
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <Toggle
                      checked={workOffline}
                      onChange={setWorkOffline}
                      label="Work offline (limited features)"
                      disabled={loginState === 'loading'}
                      id="work-offline"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Access cached data and continue working without internet
                    </p>
                  </div>
                )}

                {/* Sign in button */}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={loginState === 'loading'}
                  disabled={
                    !validateForm() || 
                    loginState === 'loading' || 
                    !canSignIn ||
                    (isOfflineMode && !hasOfflineSession && !workOffline)
                  }
                >
                  {isOfflineMode && workOffline ? 'Continue offline' : 'Sign in'}
                </Button>

                {/* Offline work button */}
                {isOfflineMode && hasOfflineSession && workOffline && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    fullWidth
                    onClick={handleOfflineWork}
                    disabled={loginState === 'loading'}
                  >
                    Continue offline
                  </Button>
                )}

                {/* Helper text for offline without session */}
                {isOfflineMode && !hasOfflineSession && (
                  <p className="text-sm text-muted-foreground text-center">
                    Please connect to the internet to sign in
                  </p>
                )}
              </form>

              {/* Action links */}
              <div className="mt-6 text-center">
                <Button 
                  variant="link" 
                  className="text-sm"
                  onClick={onForgotPassword}
                  disabled={loginState === 'loading'}
                >
                  Forgot password?
                </Button>
              </div>
            </CardContent>

            <CardFooter>
              <FooterLinks />
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* MFA Dialog */}
      <MFADialog
        state={mfaState}
        isOpen={loginState === 'mfa'}
        onVerify={handleMFAVerify}
        onCancel={handleMFACancel}
        onResend={handleMFAResend}
        errorMessage={errorType === 'mfa_error' ? getErrorMessage(errorType) : undefined}
      />

      {/* Toast notifications */}
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.visible}
        onClose={hideToast}
      />
    </>
  );
}