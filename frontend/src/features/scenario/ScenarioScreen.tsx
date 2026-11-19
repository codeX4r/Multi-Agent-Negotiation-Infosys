'use client';

import { useState } from 'react';
import { Building2, BriefcaseBusiness, Wallet, Sparkles, ArrowLeft, ArrowRight } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useConfigStore } from '@/stores/config-store';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { getAllScenarios } from '@/engine/scenarios';
import { BACKDROPS } from '@/engine/types';

const scenarioIcons = {
  vendor: Building2,
  job: BriefcaseBusiness,
  budget: Wallet,
  custom: Sparkles,
};

const difficultyOrder = ['Easy', 'Medium', 'Hard', 'Custom'];

export function ScenarioScreen() {
  const { setScreen, go } = useUIStore();
  const { draft, setScenario } = useConfigStore();

  const [diffFilter, setDiffFilter] = useState<'All' | 'Easy' | 'Medium' | 'Hard' | 'Custom'>('All');

  const scenarios = getAllScenarios();
  const filteredScenarios = diffFilter === 'All'
    ? scenarios
    : scenarios.filter(s => s.diff === diffFilter);

  const handleBack = () => {
    go('mode');
  };

  const handleNext = () => {
    if (!draft.scenarioId) return;
    setScreen('setup');
  };

  const renderScenarioCard = (scenario: any) => {
    const Icon = scenarioIcons[scenario.id as keyof typeof scenarioIcons] || Building2;
    const backdrop = BACKDROPS[scenario.backdrop];
    const isSelected = draft.scenarioId === scenario.id;

    return (
      <Card
        key={scenario.id}
        className="scard selectable"
        selected={isSelected}
        onClick={() => { setScenario(scenario.id); }}
      >
        <div className={`thumb fx-${backdrop?.fx || 'stars'}`}>
          <div className="shine"></div>
          <span className="em num">{scenario.custom ? 'C' : scenarios.indexOf(scenario) + 1}</span>
          <span className="pill solid envname">{backdrop?.name || scenario.backdrop}</span>
        </div>
        <div className="body">
          <h3>{scenario.name}</h3>
          <p className="mini">{scenario.blurb}</p>
          <div className="statline">
            <span className={`pill ${difficultyOrder.indexOf(scenario.diff) === 1 ? 'warn' : difficultyOrder.indexOf(scenario.diff) === 2 ? 'bad' : difficultyOrder.indexOf(scenario.diff) === 0 ? 'live' : 'info'}`}>
              {scenario.diff}
            </span>
            <span className="pill">{scenario.custom ? '2–5' : scenario.roles.length} seats</span>
            <span className="pill">{scenario.issues.length} issues</span>
          </div>
        </div>
      </Card>
    );
  };

  // Scenario detail panel
  const selectedScenario = scenarios.find(s => s.id === draft.scenarioId);
  const backdrop = selectedScenario ? BACKDROPS[selectedScenario.backdrop] : null;

  return (
    <section id="scenario" className="screen active">
      <div className="row between">
        <div>
          <div className="eyebrow">Step 2 of 4</div>
          <h1 className="heading">Choose a scenario</h1>
        </div>
        <Select
          value={diffFilter}
          onChange={(e) => setDiffFilter(e.target.value as any)}
          style={{ minWidth: 170 }}
        >
          <option value="All">All</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
          <option value="Custom">Custom</option>
        </Select>
      </div>

      <p className="sub">
        Every template ships with ready-made roles, goals, constraints and an environment.
        Pick one and go, or tune it on the next screen.
      </p>

      <div className="grid g4" id="scgrid">
        {filteredScenarios.map(renderScenarioCard)}
        {filteredScenarios.length === 0 && <p className="mini">No scenarios at this difficulty.</p>}
      </div>

      {selectedScenario && (
        <div id="scdetail" className="detail">
          <div className="row between">
            <div>
              <span className="eyebrow">Template preview</span>
              <h3 style={{ marginTop: 4 }}>
                {selectedScenario.name}, {backdrop?.name}
              </h3>
            </div>
            <span className="mini">
              Opening move: <b>{selectedScenario.opener ? (selectedScenario.roles.find((r: any) => r.id === selectedScenario.opener) || {}).name : 'Seat 1'}</b>
            </span>
          </div>

          <div className="grid g2" style={{ marginTop: 10 }}>
            <div>
              <div className="lbl" style={{ marginBottom: 6 }}>Parties, roles, goals</div>
              <div className="grid" style={{ gap: 8 }}>
                {selectedScenario.roles.map((r: any, i: number) => (
                  <div key={r.id} className="rolechip">
                    <div className="dot" style={{ background: ['#7aa7ff', '#f08b91', '#f4c66a', '#67d6a3', '#b69cff'][i] }}>
                      {r.name[0]}
                    </div>
                    <div>
                      <b>{r.name}</b> <span className="mini">· {r.title}</span>
                      <div className="mini">{r.goal}</div>
                      <div className="statline">
                        <span className="pill">{r.personality} ({r.skill})</span>
                        {r.constraints.slice(0, 2).map((c: string, idx: number) => (
                          <span key={idx} className="pill">{c}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="lbl" style={{ marginBottom: 6 }}>Issues on the table</div>
              <table className="table">
                <thead>
                  <tr><th>Issue</th><th>Range</th><th>Step</th></tr>
                </thead>
                <tbody>
                  {selectedScenario.issues.map((is: any) => (
                    <tr key={is.id}>
                      <td>
                        {is.label}{is.derived ? ' <span className="mini">(remainder)</span>' : ''}
                      </td>
                      <td>{is.min} – {is.max}</td>
                      <td>{is.derived ? '—' : is.step}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="lbl" style={{ margin: '12px 0 6px' }}>Event deck</div>
              <div className="statline">
                {selectedScenario.events.map((e: any) => (
                  <span key={e.id} className="pill">{e.icon} {e.title}</span>
                ))}
              </div>
            </div>
          </div>

          {selectedScenario.custom && (
            <div className="note info">
              Custom: you will define seats (2–5), issues, limits and pick one of 3 backdrops on the next screen.
            </div>
          )}
        </div>
      )}

      <div className="actions">
        <Button className="ghost" onClick={handleBack}>
          <ArrowLeft size={15} /> Back
        </Button>
        <Button className="primary" disabled={!draft.scenarioId} onClick={handleNext}>
          Next: Table setup <ArrowRight size={15} />
        </Button>
      </div>
    </section>
  );
}