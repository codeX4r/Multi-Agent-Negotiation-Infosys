'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  'data-tip'?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className = '', active, children, 'data-tip': tooltip, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`ibtn ${active ? 'on' : ''} ${className}`}
        data-tip={tooltip}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';