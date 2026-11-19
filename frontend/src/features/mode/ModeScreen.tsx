'use client';

import { Bot, Users, ArrowLeft, ArrowRight } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useConfigStore } from '@/stores/config-store';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function ModeScreen() {
  const { setScreen, go } = useUIStore();
  const { draft, setMode } = useConfigStore();

  const handlePickMode = (mode: 'simulation' | 'practice') => {
    setMode(mode);
    setScreen('scenario');
  };

  const handleNext = () => {
    if (!draft.mode) return;
    setScreen('scenario');
  };

  const handleBack = () => {
    go('home');
  };

  return (
    <section id="mode" className="screen active">
      <div className="eyebrow">Step 1 of 4</div>
      <h1 className="heading">Choose your mode</h1>
      <p className="sub">Same engine, same rules. The only difference is who supplies one party's moves.</p>

      <div className="grid g2">
        <Card
          className="modecard selectable"
          selected={draft.mode === 'simulation'}
          onClick={() => handlePickMode('simulation')}
        >
          <h3>Simulation, Watch</h3>
          <p>AI agents negotiate with each other while you observe.</p>
          <ul>
            <li>Play / pause / step / speed controls</li>
            <li>Mind Reveal: peek at each agent's private thoughts</li>
            <li>Great for studying concession patterns</li>
          </ul>
        </Card>

        <Card
          className="modecard selectable"
          selected={draft.mode === 'practice'}
          onClick={() => handlePickMode('practice')}
        >
          <h3>Practice, You play</h3>
          <p>Take one seat and negotiate against AI agents in real time.</p>
          <ul>
            <li>Type freely, tone is analysed live</li>
            <li>Structured offer builder, concede helper, walk-away</li>
            <li>Inner Voice coach fades with your skill level</li>
          </ul>
        </Card>
      </div>

      <div className="actions">
        <Button className="ghost" onClick={handleBack}>
          <ArrowLeft size={15} /> Back
        </Button>
        <Button className="primary" disabled={!draft.mode} onClick={handleNext}>
          Next: Scenario <ArrowRight size={15} />
        </Button>
      </div>
    </section>
  );
}