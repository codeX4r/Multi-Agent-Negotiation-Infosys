'use client';

import { ArrowLeft, ArrowRight, AlertCircle, CheckCircle, Shield, Target, Key } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useConfigStore } from '@/stores/config-store';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getScenario, fmtVal } from '@/engine/scenarios';
import { PERSONALITIES, SKILLS, CLIMATES, BACKDROPS, AUTONOMY, ORCH_ROLES, ORCH_ROLE_LABELS, SEAT_COLORS } from '@/engine/types';
import { buildBackendVendorConfig } from '@/lib/backendAdapter';

export function BriefingScreen() {
  const { setScreen, go } = useUIStore();
  const { draft, buildEngineConfig } = useConfigStore();

  const scenario = draft.scenarioId ? getScenario(draft.scenarioId) : null;
  const prac = draft.mode === 'practice';

  // Build config for display
  const engineConfig = buildEngineConfig(scenario as any);
  const agents = engineConfig?.agents || [];
  const backendVendorConfig = engineConfig?.scenario === 'vendor'
    ? buildBackendVendorConfig(engineConfig)
    : null;
  const me = prac ? agents.find(a => a.human) : null;
  const cl = CLIMATES[draft.climate];

  const handleBack = () => {
    go('setup');
  };

  const handleEnterArena = () => {
    const config = useConfigStore.getState();
    const v = config.validate();
    if (v) {
      useUIStore.getState().showToast(v);
      return;
    }
    useUIStore.getState().setScreen('arena');
  };

  if (!scenario || !engineConfig) {
    return (
      <section id="briefing" className="screen active">
        <div className="eyebrow">Step 4 of 4</div>
        <h1 className="heading">Loading briefing...</h1>
      </section>
    );
  }

  return (
    <section id="briefing" className="screen active">
      <div className="eyebrow">Step 4 of 4</div>
      <h1 className="heading" id="brief-h">
        {prac ? 'Know your position' : 'Observer briefing'}
      </h1>
      <p className="sub" id="brief-sub">
        {prac
          ? 'Your private briefing is shown once here. In the arena it hides behind your seat, only you know it.'
          : 'You will watch. Each agent\'s private mind is sealed; peek with Mind Reveal inside the arena.'}
      </p>

      <div className="grid g2">
        <Card id="brief-private">
          {prac && me ? (
            <>
              <span className="pill live">PRIVATE, YOUR SIDE</span>
              <h3 style={{ marginTop: 12 }}>{me.name}, {me.title}</h3>
              <p className="mini">{me.persona}</p>

              <div className="metricline"><span>Primary goal</span></div>
              <div style={{ fontWeight: 700 }}>{me.goal}</div>

              <div className="metricline"><span>BATNA (walk-away)</span><strong>{Math.round(me.batnaU * 100)} / 100</strong></div>
              <div>{me.batnaText}</div>

              <div className="metricline"><span>Constraints</span></div>
              <div className="statline">
                {me.constraints.map((c, i) => <span key={i} className="pill">{c}</span>)}
              </div>

              <div className="metricline">
                <span>Your priorities</span>
                <span>hidden priority: <b>{scenario.issues.find(i => i.id === me.hidden)?.label || ''}</b></span>
              </div>

              {Object.entries(me.prefs)
                .filter(([, p]) => p.w > 0)
                .sort((a, b) => b[1].w - a[1].w)
                .map(([k, p]) => {
                  const is = scenario.issues.find(i => i.id === k);
                  const tot = Object.values(me.prefs).reduce((s, p) => s + p.w, 0) || 1;
                  return (
                    <div key={k} className="stance">
                      <span>{is?.label}</span>
                      <div>
                        <div className="bar" style={{ margin: 0 }}>
                          <span style={{ width: `${p.w / tot * 100}%` }}></span>
                        </div>
                        <div className="mini">best {fmtVal(is!, p.ideal)}, limit {fmtVal(is!, p.reserve)}</div>
                      </div>
                    </div>
                  );
                })}

              <div className="note info">
                Every offer gets a value score U from 0–100 for you. Accept only above your walk-away ({Math.round(me.batnaU * 100)}).
              </div>
            </>
          ) : (
            <>
              <span className="pill info">OBSERVER</span>
              <h3 style={{ marginTop: 12 }}>Parties at the table</h3>
              {agents.map((a, i) => (
                <div key={a.id} className="rolechip" style={{ margin: '8px 0' }}>
                  <div className="dot" style={{ background: a.color }}>{a.name[0]}</div>
                  <div style={{ flex: 1 }}>
                    <b>{a.name}</b> <span className="mini">· {a.title}, {PERSONALITIES[a.personality as keyof typeof PERSONALITIES].icon} {PERSONALITIES[a.personality as keyof typeof PERSONALITIES].label}, {SKILLS[a.skill as keyof typeof SKILLS]}</span>
                    <div className="mini">{a.goal}</div>
                    <div className="mini">
                      BATNA {a.revealBatna ? '· ' + a.batnaText : 'sealed'}, {a.mindReveal ? 'Mind Reveal allowed' : 'Mind Reveal blocked'}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </Card>

        <Card>
          <h3>Session briefing</h3>
          <div id="brief-summary">
            {[
              ['Mode', prac ? 'Practice (Human vs AI)' : 'Simulation (AI vs AI)'],
              ['Scenario', scenario.name],
              ['Environment', BACKDROPS[draft.backdrop].name],
              ['Climate', cl.label],
              ['Rounds limit', draft.rounds],
              ['Events', ['Off', 'Low', 'Medium', 'High'][draft.eventFreq]],
              ['Seats', agents.length],
              ['Orchestrator', `${AUTONOMY[draft.autonomy].label} (${draft.autonomy}/3)`],
              ['Duties', draft.roles.map(r => ORCH_ROLE_LABELS[r as keyof typeof ORCH_ROLE_LABELS]).join(', ') || 'none'],
            ].map(([k, v]) => (
              <div key={k} className="metricline">
                <span>{k}</span><strong>{v}</strong>
              </div>
            ))}
          </div>

          <details style={{ marginTop: 12 }}>
            <summary className="mini" style={{ cursor: 'pointer' }}>▸ Config JSON handed to the Orchestrator</summary>
            <pre className="jsonbox" id="brief-json" style={{ marginTop: 8 }}>
{JSON.stringify({
  scenario: engineConfig.scenario,
  mode: engineConfig.mode,
  rounds: engineConfig.rounds,
  ...(backendVendorConfig ? { backend_vendor_config: backendVendorConfig } : {}),
  climate: engineConfig.climate,
  event_freq: engineConfig.eventFreq,
  deadlock_n: engineConfig.deadlockN,
  orchestrator: engineConfig.orchestrator,
  agents: engineConfig.agents.map((a: any) => ({
    id: a.id,
    seat: a.seat,
    human: a.human,
    persona: a.persona,
    goals: [a.goal],
    constraints: a.constraints,
    batna: +a.batnaU.toFixed(2),
    personality: a.personality,
    skill: a.skill,
    weights: Object.fromEntries(Object.entries(a.prefs).map(([k, p]: any) => [k, +p.w.toFixed(2)]))
  }))
}, null, 2)}
            </pre>
          </details>

          <div className="note">
            Private briefings are isolated in the engine: the Arena only reads each agent's public voice and metrics.
          </div>
        </Card>
      </div>

      <div className="actions">
        <Button className="ghost" onClick={handleBack}>
          <ArrowLeft size={15} /> Back
        </Button>
        <Button className="primary" onClick={handleEnterArena}>Enter Arena <ArrowRight size={15} /></Button>
      </div>
    </section>
  );
}