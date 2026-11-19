'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'default';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', loading, disabled, children, ...props }, ref) => {
    const base = 'btn';
    const variants: Record<'primary' | 'ghost' | 'danger' | 'default', string> = {
      default: '',
      primary: 'primary',
      ghost: 'ghost',
      danger: 'danger',
    };
    const sizes: Record<'sm' | 'default', string> = {
      default: '',
      sm: 'sm',
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <span className="mini">⏳</span>}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';