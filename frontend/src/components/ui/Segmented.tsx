'use client';

import { ReactNode } from 'react';

export interface SegmentedOption {
  value: string | number;
  label: string;
}

export interface SegmentedProps<T extends string | number = string | number> {
  options: SegmentedOption[];
  value: T;
  onChange: (value: T) => void;
  fullWidth?: boolean;
  className?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number = string | number>({ options, value, onChange, fullWidth, className = '', disabled }: SegmentedProps<T>) {
  return (
    <div className={`seg ${fullWidth ? 'full' : ''} ${className}`} role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={value === opt.value ? 'on' : ''}
          onClick={() => !disabled && onChange(opt.value as T)}
          disabled={disabled}
          role="radio"
          aria-checked={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}