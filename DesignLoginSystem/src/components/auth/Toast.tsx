import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../ui/utils';

interface ToastProps {
  type: 'success' | 'error' | 'info';
  message: string;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const typeClasses = {
  success: 'bg-green-50 dark:bg-green-950/90 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
  error: 'bg-red-50 dark:bg-red-950/90 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  info: 'bg-blue-50 dark:bg-blue-950/90 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
};

export function Toast({ type, message, isVisible, onClose, duration = 5000 }: ToastProps) {
  const [shouldRender, setShouldRender] = useState(isVisible);
  const Icon = iconMap[type];

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300); // Wait for exit animation
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!shouldRender) return null;

  return (
    <div
      className={cn(
        'fixed top-4 right-4 z-50 flex items-center gap-3 p-4 border rounded-lg shadow-lg',
        'transition-all duration-300 transform',
        typeClasses[type],
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
      role="alert"
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={onClose}
        className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        aria-label="Close notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}