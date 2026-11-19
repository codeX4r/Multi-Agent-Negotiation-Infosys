'use client';

import { forwardRef } from 'react';
import { Button } from './Button';

export interface SliderProps {
  id: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  labels?: string[];
  className?: string;
  disabled?: boolean;
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ id, min, max, value, onChange, step = 1, labels, className = '', disabled, ...props }, ref) => {
    const p = ((value - min) / (max - min)) * 100;

    return (
      <div className={`stepslider ${className}`} {...props}>
        <input
          ref={ref}
          type="range"
          id={id}
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ '--p': `${p}%` } as React.CSSProperties}
          onChange={(e) => {
            const newValue = Number(e.target.value);
            onChange(newValue);
            // Update CSS variable for visual feedback
            (e.target as HTMLInputElement).style.setProperty('--p', `${((newValue - min) / (max - min)) * 100}%`);
          }}
          disabled={disabled}
        />
        {labels && (
          <div className="ticks">
            {labels.map((label, i) => (
              <span key={i} className={min + i === value ? 'on' : ''}>
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
);

Slider.displayName = 'Slider';

export interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  suffix?: string;
  className?: string;
  disabled?: boolean;
}

export function Stepper({ value, min = 0, max = 100, onChange, suffix = '', className = '', disabled }: StepperProps) {
  return (
    <div className={`row ${className}`} style={{ gap: 6 }}>
      <Button className="btn sm" onClick={() => !disabled && value > min && onChange(value - 1)} disabled={disabled || value <= min}>−</Button>
      <b style={{ minWidth: 62, textAlign: 'center' }}>{value}{suffix}</b>
      <Button className="btn sm" onClick={() => !disabled && value < max && onChange(value + 1)} disabled={disabled || value >= max}>+</Button>
    </div>
  );
}