import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../ui/utils';
import { Button } from './Button';
import { TextField } from './TextField';
import { Alert } from './Alert';

interface MFADialogProps {
  state: 'codeEntry' | 'verifying' | 'error';
  onVerify: (code: string) => void;
  onCancel: () => void;
  onResend: () => void;
  isOpen: boolean;
  errorMessage?: string;
}

export function MFADialog({ 
  state, 
  onVerify, 
  onCancel, 
  onResend, 
  isOpen, 
  errorMessage 
}: MFADialogProps) {
  const [code, setCode] = useState('');
  const [canResend, setCanResend] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);

  useEffect(() => {
    if (!isOpen) return;
    
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setCanResend(false);
      setResendTimer(30);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6 && state !== 'verifying') {
      onVerify(code);
    }
  };

  const handleResend = () => {
    if (canResend) {
      onResend();
      setCanResend(false);
      setResendTimer(30);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm"
        role="dialog"
        aria-labelledby="mfa-title"
        aria-describedby="mfa-description"
      >
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 id="mfa-title" className="text-card-foreground">
            Verify it's you
          </h2>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-accent transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <p id="mfa-description" className="text-muted-foreground mb-4 text-sm">
            Enter the 6-digit code from your authenticator app
          </p>
          
          {state === 'error' && errorMessage && (
            <Alert tone="error" className="mb-4">
              {errorMessage}
            </Alert>
          )}
          
          <TextField
            type="code"
            value={code}
            onChange={setCode}
            placeholder="000000"
            maxLength={6}
            pattern="[0-9]{6}"
            autoComplete="one-time-code"
            disabled={state === 'verifying'}
            state={state === 'error' ? 'error' : 'default'}
            id="mfa-code"
            className="mb-4"
          />
          
          <div className="flex gap-3 mb-4">
            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={state === 'verifying'}
              disabled={code.length !== 6 || state === 'verifying'}
            >
              Verify
            </Button>
            
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={state === 'verifying'}
            >
              Cancel
            </Button>
          </div>
          
          <div className="text-center">
            <Button
              type="button"
              variant="link"
              onClick={handleResend}
              disabled={!canResend || state === 'verifying'}
              className="text-sm"
            >
              {canResend 
                ? 'Resend code' 
                : `Resend code in ${resendTimer}s`
              }
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}