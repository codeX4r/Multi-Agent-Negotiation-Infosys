'use client';

import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="field">
        {label && <label htmlFor={inputId} className="lbl">{label}</label>}
        <input
          ref={ref}
          id={inputId}
          className={`inp ${className}`}
          {...props}
        />
        {error && <div className="mini" style={{ color: 'var(--red)' }}>{error}</div>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }>(
  ({ className = '', label, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="field">
        {label && <label htmlFor={inputId} className="lbl">{label}</label>}
        <textarea
          ref={ref}
          id={inputId}
          className={`inp ${className}`}
          {...props}
        />
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label?: string }>(
  ({ className = '', label, id, children, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="field">
        {label && <label htmlFor={inputId} className="lbl">{label}</label>}
        <select
          ref={ref}
          id={inputId}
          className={`inp ${className}`}
          {...props}
        >
          {children}
        </select>
      </div>
    );
  }
);

Select.displayName = 'Select';