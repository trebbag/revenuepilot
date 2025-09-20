import React from 'react';
import { cn } from '../ui/utils';
import { Button } from './Button';

interface FooterLinksProps {
  className?: string;
}

export function FooterLinks({ className }: FooterLinksProps) {
  const links = [
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms of Service', href: '#' },
    { label: 'HIPAA Notice', href: '#' },
  ];

  return (
    <div className={cn('text-center space-y-2', className)}>
      <div className="flex flex-wrap justify-center items-center gap-1 text-sm">
        {links.map((link, index) => (
          <React.Fragment key={link.label}>
            <Button
              variant="link"
              onClick={() => window.open(link.href, '_blank')}
              className="text-xs text-muted-foreground hover:text-foreground p-0 h-auto"
            >
              {link.label}
            </Button>
            {index < links.length - 1 && (
              <span className="text-muted-foreground">•</span>
            )}
          </React.Fragment>
        ))}
      </div>
      
      <p className="text-xs text-muted-foreground">
        Protected by industry-standard encryption
      </p>
    </div>
  );
}