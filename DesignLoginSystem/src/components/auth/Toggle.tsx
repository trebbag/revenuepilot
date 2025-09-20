import React from 'react';
import { cn } from '../ui/utils';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Toggle({ checked, onChange, label, disabled = false, id, className }: ToggleProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <label
        htmlFor={id}
        className={cn(
          'text-sm text-foreground cursor-pointer',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {label}
      </label>
      
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:ring-offset-2',
          checked 
            ? 'bg-primary' 
            : 'bg-switch-background',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200',
            checked ? 'translate-x-4.5' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  );
}