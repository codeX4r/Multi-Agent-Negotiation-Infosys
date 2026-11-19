'use client';

import { ReactNode, forwardRef } from 'react';

export interface CardProps {
  children: ReactNode;
  className?: string;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  variant?: 'default' | 'mode' | 'scenario' | 'detail' | 'minitable' | 'role' | 'mind';
  id?: string;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = '', selectable, selected, onClick, variant = 'default', id, ...props }, ref) => {
    const base = 'card';
    const variants: Record<string, string> = {
      default: '',
      mode: 'modecard',
      scenario: 'scard',
      detail: 'detail',
      minitable: 'minitable',
      role: '',
      mind: 'mindcard',
    };
    const selectableClass = selectable ? 'selectable' : '';
    const selectedClass = selected ? 'selected' : '';

    const isButton = !!onClick;

    if (isButton) {
      // Filter out div-specific props that aren't valid for button
      const {
        onCopy,
        onPaste,
        onCut,
        onDrag,
        onDragEnd,
        onDragEnter,
        onDragLeave,
        onDragOver,
        onDragStart,
        onDrop,
        ...buttonProps
      } = props as any;

      return (
        <button
          ref={ref}
          className={`${base} ${variants[variant]} ${selectableClass} ${selectedClass} ${className}`}
          onClick={onClick}
          {...buttonProps}
        >
          {children}
        </button>
      );
    }

    return (
      <div
        ref={ref}
        className={`${base} ${variants[variant]} ${selectableClass} ${selectedClass} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export interface CardHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export function CardHeader({ title, subtitle, icon, badge }: CardHeaderProps) {
  return (
    <div>
      {icon && <div className="icon">{icon}</div>}
      <h3>{title}</h3>
      {subtitle && <p className="mini">{subtitle}</p>}
      {badge}
    </div>
  );
}