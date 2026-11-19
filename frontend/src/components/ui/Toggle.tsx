'use client';

import { forwardRef } from 'react';

export interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ id, label, checked, onChange, disabled, ...props }, ref) => {
    return (
      <label className="tgl" {...props}>
        <input
          ref={ref}
          type="checkbox"
          id={id}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="tr"></span>
        <span className="t">{label}</span>
      </label>
    );
  }
);

Toggle.displayName = 'Toggle';