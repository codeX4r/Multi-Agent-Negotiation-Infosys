'use client';

import { useUIStore } from '@/stores/ui-store';

const STEPS = [
  { id: 'mode', label: 'Mode' },
  { id: 'scenario', label: 'Scenario' },
  { id: 'setup', label: 'Table' },
  { id: 'briefing', label: 'Briefing' },
  { id: 'arena', label: 'Arena' },
  { id: 'outcome', label: 'Outcome' },
];

export function Stepper({ current }: { current: string }) {
  const { go } = useUIStore();

  const stepIndex = STEPS.findIndex(s => s.id === current);
  const visited = new Set(STEPS.slice(0, stepIndex + 1).map(s => s.id));

  // If we're in replay, show outcome as current step
  const displayCurrent = current === 'replay' ? 'outcome' : current;
  const displayIndex = STEPS.findIndex(s => s.id === displayCurrent);

  return (
    <nav className="stepper" aria-label="Negotiation setup progress">
      {STEPS.map((step, index) => {
        const isDone = visited.has(step.id) && index < displayIndex;
        const isActive = index === displayIndex;

        return (
          <span
            key={step.id}
            className={`st ${isActive ? 'on' : isDone ? 'done' : ''}`}
            onClick={isDone ? () => go(step.id as any) : undefined}
            style={{ cursor: isDone ? 'pointer' : 'default' }}
          >
            <i>{isDone ? '✓' : index + 1}</i>
            {step.label}
          </span>
        );
      }).join('<span className="mini">›</span>')}
    </nav>
  );
}