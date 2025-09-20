import React, { useState } from 'react';
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter } from './Card';
import { TextField } from './TextField';
import { Button } from './Button';
import { Alert } from './Alert';
import { FooterLinks } from './FooterLinks';

type ForgotPasswordState = 'input' | 'loading' | 'success' | 'error';
type ErrorType = 'invalid_email' | 'user_not_found' | 'server_error' | 'rate_limited' | null;

interface ForgotPasswordFormProps {
  onBackToLogin: () => void;
  multiTenant?: boolean;
}

export function ForgotPasswordForm({ onBackToLogin, multiTenant = false }: ForgotPasswordFormProps) {
  const [state, setState] = useState<ForgotPasswordState>('input');
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [clinicCode, setClinicCode] = useState('');
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');

  const getErrorMessage = (type: ErrorType) => {
    switch (type) {
      case 'invalid_email':
        return 'Please enter a valid email address.';
      case 'user_not_found':
        return 'No account found with this email address.';
      case 'server_error':
        return 'Service unavailable. Please try again later.';
      case 'rate_limited':
        return 'Too many requests. Please wait before trying again.';
      default:
        return '';
    }
  };

  const validateForm = () => {
    if (multiTenant && !clinicCode.trim()) return false;
    if (!email.trim()) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setErrorType('invalid_email');
      setState('error');
      return;
    }

    setState('loading');
    setErrorType(null);
    setSubmittedEmail(email);

    // TODO: Replace with actual API call
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(multiTenant && { clinicCode }),
          email,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        switch (data.error) {
          case 'USER_NOT_FOUND':
            setErrorType('user_not_found');
            break;
          case 'RATE_LIMITED':
            setErrorType('rate_limited');
            break;
          default:
            setErrorType('server_error');
        }
        setState('error');
        return;
      }

      setState('success');
    } catch (error) {
      setErrorType('server_error');
      setState('error');
    }
  };

  const handleTryAgain = () => {
    setState('input');
    setErrorType(null);
  };

  const handleResendEmail = async () => {
    setState('loading');
    
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(multiTenant && { clinicCode }),
          email: submittedEmail,
        }),
      });

      setState('success');
    } catch (error) {
      setState('error');
      setErrorType('server_error');
    }
  };

  // Success state
  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-md">
          <Card size="lg">
            <CardContent>
              <div className="text-center space-y-6">
                <div className="w-20 h-20 bg-gradient-to-br from-primary/10 to-accent/10 dark:from-primary/20 dark:to-accent/15 rounded-2xl flex items-center justify-center mx-auto border border-primary/20 shadow-lg shadow-primary/10">
                  <CheckCircle className="w-10 h-10 text-primary dark:text-primary" />
                </div>
                
                <div>
                  <h1 className="text-card-foreground mb-2">
                    Check your email
                  </h1>
                  <p className="text-muted-foreground mb-4">
                    We've sent password reset instructions to:
                  </p>
                  <p className="font-medium text-foreground">
                    {submittedEmail}
                  </p>
                </div>
                
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Didn't receive the email? Check your spam folder or try again.
                  </p>
                  
                  <div className="flex flex-col gap-3">
                    <Button
                      variant="secondary"
                      size="lg"
                      fullWidth
                      onClick={handleResendEmail}
                      disabled={state === 'loading'}
                      loading={state === 'loading'}
                    >
                      Resend email
                    </Button>
                    
                    <Button
                      variant="link"
                      onClick={onBackToLogin}
                      iconLeft={<ArrowLeft className="w-4 h-4" />}
                    >
                      Back to sign in
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
            
            <CardFooter>
              <FooterLinks />
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  // Input/Error states
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
      <div className="w-full max-w-md">
        <Card size="lg">
          <CardHeader
            logo={
              <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center">
                <Mail className="w-8 h-8 text-primary" />
              </div>
            }
            title="Reset your password"
            subtitle="Enter your email and we'll send you reset instructions"
          />

          <CardContent>
            {/* Error alert */}
            {state === 'error' && errorType && (
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
                  disabled={state === 'loading'}
                  id="clinic-code"
                  state={
                    state === 'error' && errorType === 'invalid_email' && !clinicCode.trim()
                      ? 'error'
                      : 'default'
                  }
                />
              )}

              {/* Email */}
              <TextField
                type="email"
                label="Email Address"
                placeholder="Enter your email address"
                value={email}
                onChange={setEmail}
                iconLeft="mail"
                required
                disabled={state === 'loading'}
                id="email"
                autoComplete="email"
                state={
                  state === 'error' && 
                  (errorType === 'invalid_email' || errorType === 'user_not_found')
                    ? 'error'
                    : 'default'
                }
                errorMessage={
                  state === 'error' && errorType === 'invalid_email' && !email.trim()
                    ? 'Email address is required'
                    : state === 'error' && errorType === 'invalid_email' && email.trim()
                    ? 'Please enter a valid email address'
                    : undefined
                }
              />

              {/* Submit button */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={state === 'loading'}
                disabled={!validateForm() || state === 'loading'}
              >
                Send reset instructions
              </Button>

              {/* Retry button for errors */}
              {state === 'error' && errorType && (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  fullWidth
                  onClick={handleTryAgain}
                >
                  Try again
                </Button>
              )}
            </form>

            {/* Back to login */}
            <div className="mt-6 text-center">
              <Button
                variant="link"
                onClick={onBackToLogin}
                iconLeft={<ArrowLeft className="w-4 h-4" />}
              >
                Back to sign in
              </Button>
            </div>
          </CardContent>

          <CardFooter>
            <FooterLinks />
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}