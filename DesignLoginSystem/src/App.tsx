import React, { useState } from 'react';
import { LoginForm } from './components/auth/LoginForm';
import { ForgotPasswordForm } from './components/auth/ForgotPasswordForm';
import { ThemeToggle } from './components/ThemeToggle';

type AppView = 'login' | 'forgot-password' | 'success';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('login');
  
  // Configuration - these would typically come from environment variables or app config
  const mode: 'default' | 'offline' | 'maintenance' = 'default';
  const multiTenant = false; // Set to true for multi-tenant deployments
  const hasOfflineSession = false; // Determined by checking for valid offline session

  const handleSuccess = () => {
    setCurrentView('success');
  };

  const handleForgotPassword = () => {
    setCurrentView('forgot-password');
  };

  const handleBackToLogin = () => {
    setCurrentView('login');
  };



  if (currentView === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4 relative">
        {/* Subtle background accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-accent/5 dark:from-primary/5 dark:via-transparent dark:to-accent/3" />
        
        <div className="text-center space-y-6 relative z-10">
          <div className="w-20 h-20 bg-gradient-to-br from-primary/10 to-accent/10 dark:from-primary/20 dark:to-accent/15 rounded-2xl flex items-center justify-center mx-auto border border-primary/20 shadow-lg shadow-primary/10">
            <svg 
              className="w-10 h-10 text-primary dark:text-primary" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <div>
            <h1 className="text-3xl font-semibold text-foreground mb-3 bg-gradient-to-r from-foreground to-primary/80 bg-clip-text">Welcome to your workspace</h1>
            <p className="text-muted-foreground text-lg">You have successfully signed in</p>
          </div>
          
          {/* Success stats or next actions */}
          <div className="mt-8 p-6 bg-card/80 backdrop-blur-sm border border-border/50 rounded-xl shadow-sm">
            <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              <span>All systems operational</span>
            </div>
          </div>
        </div>
        
        <ThemeToggle />
      </div>
    );
  }

  if (currentView === 'forgot-password') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/3 relative">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/2 via-transparent to-secondary/5 dark:from-primary/3 dark:via-transparent dark:to-secondary/3" />
        
        <ForgotPasswordForm
          multiTenant={multiTenant}
          onBackToLogin={handleBackToLogin}
        />
        
        <ThemeToggle />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/3 relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/2 via-transparent to-secondary/5 dark:from-primary/3 dark:via-transparent dark:to-secondary/3" />
      
      <LoginForm
        mode={mode}
        multiTenant={multiTenant}
        hasOfflineSession={hasOfflineSession}
        onSuccess={handleSuccess}
        onForgotPassword={handleForgotPassword}
      />
      
      <ThemeToggle />
    </div>
  );
}