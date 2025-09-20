import React from 'react';
import { Button } from './auth/Button';
import { Card } from './auth/Card';
import { Badge } from './auth/Badge';

interface LoginDemoControlsProps {
  currentMode: 'default' | 'offline' | 'maintenance';
  multiTenant: boolean;
  hasOfflineSession: boolean;
  onModeChange: (mode: 'default' | 'offline' | 'maintenance') => void;
  onMultiTenantToggle: () => void;
  onOfflineSessionToggle: () => void;
}

export function LoginDemoControls({
  currentMode,
  multiTenant,
  hasOfflineSession,
  onModeChange,
  onMultiTenantToggle,
  onOfflineSessionToggle,
}: LoginDemoControlsProps) {
  return (
    <Card className="fixed bottom-4 left-4 max-w-sm z-40 bg-card/95 backdrop-blur-sm">
      <div className="space-y-4">
        <div>
          <h3 className="font-medium mb-2">Demo Controls</h3>
          <div className="space-y-2">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Mode:</p>
              <div className="flex gap-2">
                {(['default', 'offline', 'maintenance'] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant={currentMode === mode ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => onModeChange(mode)}
                  >
                    {mode}
                  </Button>
                ))}
              </div>
            </div>
            
            <div>
              <p className="text-sm text-muted-foreground mb-1">Features:</p>
              <div className="space-y-1">
                <Button
                  variant={multiTenant ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={onMultiTenantToggle}
                  fullWidth
                >
                  Multi-tenant: {multiTenant ? 'On' : 'Off'}
                </Button>
                
                <Button
                  variant={hasOfflineSession ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={onOfflineSessionToggle}
                  fullWidth
                >
                  Offline session: {hasOfflineSession ? 'Yes' : 'No'}
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground mb-2">Test credentials:</p>
          <div className="space-y-1 text-xs">
            <div><span className="text-muted-foreground font-medium">Login:</span></div>
            <div><Badge tone="info">mfa@example.com</Badge> → MFA flow</div>
            <div><Badge tone="warning">wrong@example.com</Badge> → Invalid creds</div>
            <div><Badge tone="warning">locked@example.com</Badge> → Account locked</div>
            <div><Badge tone="warning">server@example.com</Badge> → Server error</div>
            <div><span className="text-muted-foreground">Any other email → Success</span></div>
            <div><span className="text-muted-foreground">MFA code: 123456</span></div>
            
            <div className="pt-2"><span className="text-muted-foreground font-medium">Forgot Password:</span></div>
            <div><Badge tone="warning">notfound@example.com</Badge> → User not found</div>
            <div><Badge tone="warning">server@example.com</Badge> → Server error</div>
            <div><Badge tone="warning">ratelimited@example.com</Badge> → Rate limited</div>
            <div><span className="text-muted-foreground">Any other email → Success</span></div>
          </div>
        </div>
      </div>
    </Card>
  );
}