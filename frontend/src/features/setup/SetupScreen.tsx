'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Grip, Plus, Trash2, ArrowLeft, ArrowRight,
  ChevronLeft, ChevronRight, Settings, LayoutDashboard,
  Users, Cloud, Zap, Scale, FileText
} from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useConfigStore } from '@/stores/config-store';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Segmented } from '@/components/ui/Segmented';
import { Slider } from '@/components/ui/Slider';
import { Stepper } from '@/components/ui/Slider';
import { getScenario } from '@/engine/scenarios';
import { BACKDROPS, PERSONALITIES, SKILLS, CLIMATES, ORCH_ROLES, ORCH_ROLE_LABELS, ORCH_ROLE_DESCS, AUTONOMY, SEAT_COLORS } from '@/engine/types';
import type { Issue, Role } from '@/engine/types';

export function SetupScreen() {
  const { go, setScreen } = useUIStore();
  const {
    draft,
    setScenario, setMode, setSeats, setHuman, swapSeats,
    updateRole, setClimate, setEventFreq, setRounds, setDeadlockN,
    setBackdrop, setOrchestratorRoles, setAutonomy, setTab,
    resetToTemplate, validate, buildEngineConfig
  } = useConfigStore();

  const scenario = draft.scenarioId ? getScenario(draft.scenarioId) : null;
  const isCustom = scenario?.custom;

  const tabs = isCustom
    ? [['builder', 'Builder'], ['seats', 'Seats & roles'], ['env', 'Environment'], ['orch', 'Orchestrator']]
    : [['seats', 'Seats & roles'], ['env', 'Environment'], ['orch', 'Orchestrator']];

  const [dragRole, setDragRole] = useState<string | null>(null);
  const [tapRole, setTapRole] = useState<string | null>(null);
  const [chairOver, setChairOver] = useState<number | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<Partial<Role>>({});
  const [newConstraint, setNewConstraint] = useState('');

  const handleBack = () => {
    go('scenario');
  };

  const handleNext = () => {
    const v = validate();
    if (v) {
      useUIStore.getState().showToast(v);
      return;
    }
    setScreen('briefing');
  };

  const handleTabChange = (tab: string) => {
    setTab(tab as any);
  };

  const handleReset = () => {
    if (scenario) resetToTemplate(scenario);
  };

  // Render different tabs
  const renderBuilderTab = () => (
    <div className="grid g2">
      <Card>
        <h3>Scenario</h3>
        <Input
          label="Scenario name"
          value={scenario?.name || ''}
          onChange={(e) => {
            if (scenario) scenario.name = e.target.value;
          }}
        />
        <Input
          label="Short description"
          value={scenario?.blurb || ''}
          onChange={(e) => {
            if (scenario) scenario.blurb = e.target.value;
          }}
        />
        <div className="field">
          <label className="lbl">Number of seats</label>
          <Segmented
            options={[
              { value: 2, label: '2 seats' },
              { value: 3, label: '3 seats' },
              { value: 4, label: '4 seats' },
              { value: 5, label: '5 seats' },
            ]}
            value={draft.seats.length}
            onChange={(v) => {
              const n = Number(v);
              const names = scenario?.roles.map((r: Role) => r.name) || [];
              // This would need proper custom scenario regeneration
            }}
          />
        </div>
        <div className="lbl">Party names</div>
        {scenario?.roles.map((r: Role, i: number) => (
          <div key={r.id} className="row" style={{ margin: '6px 0' }}>
            <span className="dot" style={{ background: SEAT_COLORS[i], width: 24, height: 24, fontSize: 10 }}>
              {i + 1}
            </span>
            <Input
              style={{ flex: 1 }}
              value={r.name}
              onChange={(e) => { r.name = e.target.value; }}
            />
          </div>
        ))}
      </Card>
      <Card>
        <div className="row between">
          <h3>Issues (1–5)</h3>
          <Button className="btn sm" onClick={() => {
            if (scenario && scenario.issues.length < 5) {
              scenario.issues.push({
                id: 'i' + Date.now(),
                label: 'New issue',
                kind: 'num',
                unit: '',
                min: 0, max: 10, step: 1
              });
            }
          }} disabled={!scenario || scenario.issues.length >= 5}>
            <Plus size={14} /> Add issue
          </Button>
        </div>
        <div className="issueed mini" style={{ fontWeight: 700 }}>
          <span>Label</span><span>Unit</span><span>Min</span><span>Max</span><span>Step</span><span></span>
        </div>
        {scenario?.issues.map((is: Issue, i: number) => (
          <div key={is.id} className="issueed">
            <Input value={is.label} onChange={(e) => { is.label = e.target.value; }} />
            <Input value={is.unit || ''} onChange={(e) => { is.unit = e.target.value; }} />
            <Input type="number" value={is.min} onChange={(e) => { is.min = +e.target.value; }} />
            <Input type="number" value={is.max} onChange={(e) => { is.max = +e.target.value; }} />
            <Input type="number" value={is.step} onChange={(e) => { is.step = +e.target.value; }} />
            <Button className="btn sm ghost" onClick={() => {
              if (scenario && scenario.issues.length > 1) {
                scenario.issues.splice(i, 1);
              }
            }} disabled={!scenario || scenario.issues.length <= 1}>
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
        <p className="mini" style={{ marginTop: 8 }}>
          Editing issues regenerates each party's preferences. Fine-tune them per seat in the Seats tab.
        </p>
      </Card>
    </div>
  );

  const renderSeatsTab = () => {
    const n = draft.seats.length;
    const prac = draft.mode === 'practice';

    // Calculate seat positions around a circle
    const seatPositions = Array.from({ length: n }, (_, i) => {
      const a = Math.PI / 2 + i * 2 * Math.PI / n;
      return { x: 50 + 44 * Math.cos(a), y: 50 + 40 * Math.sin(a) };
    });

    const handleDragStart = (e: React.DragEvent, roleId: string) => {
      e.dataTransfer.setData('text', roleId);
      setDragRole(roleId);
    };

    const handleDragEnd = () => {
      setDragRole(null);
    };

    const handleDragOver = (e: React.DragEvent, chair: number) => {
      e.preventDefault();
      setChairOver(chair);
    };

    const handleDragLeave = () => {
      setChairOver(null);
    };

    const handleDrop = (e: React.DragEvent, chair: number) => {
      e.preventDefault();
      const roleId = e.dataTransfer.getData('text');
      swapSeats(draft.seats.indexOf(roleId), chair);
      setChairOver(null);
      setDragRole(null);
    };

    const handleChairClick = (chair: number) => {
      if (tapRole) {
        swapSeats(draft.seats.indexOf(tapRole), chair);
        setTapRole(null);
        return;
      }
      setEditingRole(draft.seats[chair]);
    };

    return (
      <div className="setupgrid">
        <Card>
          <div className="row between">
            <h3>Round table</h3>
            <span className="mini">Drop a role card on a chair, chairs swap automatically</span>
          </div>
          <div className="minitable">
            <div className="tbl"></div>
            {draft.seats.map((rid, i) => {
              const rRaw = scenario?.roles.find((role: Role) => role.id === rid);
              if (!rRaw) return null;
              const r = { ...rRaw, ...(draft.roleOverrides?.[rid] || {}) };
              const P = PERSONALITIES[r.personality];
              const pos = seatPositions[i];
              return (
                <div
                  key={rid}
                  className={`chair filled ${chairOver === i ? 'over' : ''}`}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, i)}
                  onClick={() => handleChairClick(i)}
                >
                  {draft.human === i && <span className="you">YOU</span>}
                  <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
                    <span className="dot" style={{ width: 22, height: 22, background: SEAT_COLORS[i], fontSize: 10 }}>
                      {r.name[0]}
                    </span>
                    <span className="nm">{r.name}</span>
                  </div>
                  <div className="sm">{r.title}</div>
                  <div className="statline" style={{ justifyContent: 'center' }}>
                    <span className="chipx">{P.icon} {P.label}</span>
                    <span className="chipx">{SKILLS[r.skill as keyof typeof SKILLS]}</span>
                  </div>
                  <div className="sm" style={{ marginTop: 4 }}>Seat {i + 1}, click to tune</div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <h3>Role tray</h3>
          <p className="mini">Drag onto a chair (or tap a card, then tap a chair).</p>
          <div className="tray" style={{ marginTop: 10 }}>
            {scenario?.roles.map((r: Role, i: number) => (
              <div
                key={r.id}
                className={`roletok ${tapRole === r.id ? 'selected' : ''} ${dragRole === r.id ? 'dragging' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, r.id)}
                onDragEnd={handleDragEnd}
                onClick={() => { setTapRole(r.id); useUIStore.getState().showToast(`Now tap a chair for ${r.name}`); }}
                style={{ borderColor: tapRole === r.id ? 'var(--cyan)' : undefined }}
              >
                <span className="dot" style={{ background: SEAT_COLORS[i] }}>{r.name[0]}</span>
                <div>
                  <b>{r.name}</b>
                  <div className="mini">{r.goal}</div>
                </div>
                <span className="grip"><Grip size={14} /></span>
              </div>
            ))}
          </div>

          {prac ? (
            <div className="field">
              <label>You play as</label>
              <Segmented
                options={draft.seats.map((rid, i) => ({
                  value: i,
                  label: scenario?.roles.find((r: Role) => r.id === rid)?.name || `Seat ${i + 1}`
                }))}
                value={draft.human}
                onChange={(v) => setHuman(Number(v))}
                fullWidth
              />
            </div>
          ) : (
            <div className="note info">Simulation: every seat is AI-controlled. You watch.</div>
          )}

          <div className="lbl" style={{ marginTop: 14 }}>Quick personality per seat</div>
          {draft.seats.map((rid, i) => {
            const rRaw = scenario?.roles.find((role: Role) => role.id === rid);
            if (!rRaw) return null;
            const r = { ...rRaw, ...(draft.roleOverrides?.[rid] || {}) };
            return (
              <div key={rid} className="row between" style={{ margin: '7px 0' }}>
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 70 }}>
                  {r.name} {draft.human === i && <span className="mini">(you)</span>}
                </span>
                <Segmented
                  options={Object.entries(PERSONALITIES).map(([k, p]) => ({ value: k, label: p.label.slice(0, 4) }))}
                  value={r.personality}
                  onChange={(v) => updateRole(rid, { personality: v as any })}
                />
                <Segmented
                  options={Object.entries(SKILLS).map(([k, l]) => ({ value: k, label: l[0] }))}
                  value={r.skill}
                  onChange={(v) => updateRole(rid, { skill: v as any })}
                />
              </div>
            );
          })}
          <p className="mini">Aggr, Coll, Risk = aggressive, collaborative, risk-averse. N, S, E = novice, skilled, expert.</p>
        </Card>
      </div>
    );
  };

  const renderEnvTab = () => {
    const backdrop = BACKDROPS[draft.backdrop];
    const climIcons = { stable: '☀️', volatile: '🌤️', crisis: '⛈️' };

    return (
      <div className="grid g2">
        <Card>
          <h3>Climate preset</h3>
          <p className="mini">Sets event rate, starting pressure and default round limit.</p>
          <div className="rcards" style={{ marginTop: 10 }}>
            {Object.entries(CLIMATES).map(([k, c]) => (
              <div
                key={k}
                className={`rcard ${draft.climate === k ? 'on' : ''}`}
                onClick={() => { setClimate(k as any); }}
              >
                <div className="e">{climIcons[k as keyof typeof climIcons]}</div>
                <b>{c.label}</b>
                <small>{c.desc}</small>
              </div>
            ))}
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label>Event frequency</label>
            <Slider
              id="ev-f"
              min={0}
              max={3}
              value={draft.eventFreq}
              onChange={(v: number) => setEventFreq(v as 0 | 1 | 2 | 3)}
              labels={['Off', 'Low', 'Medium', 'High']}
            />
          </div>
          <div className="grid g2">
            <div className="field">
              <label>Rounds limit</label>
              <Stepper value={draft.rounds} onChange={setRounds} suffix=" rds" min={4} max={24} />
            </div>
            <div className="field">
              <label>Deadlock after N stalled rounds</label>
              <Stepper value={draft.deadlockN} onChange={setDeadlockN} min={2} max={6} />
            </div>
          </div>
        </Card>
        <Card>
          <h3>Environment & ambience</h3>
          {isCustom ? (
            <>
              <p className="mini">Custom scenario: pick your backdrop. The ambience animates behind the whole app.</p>
              <div className="bgpick" style={{ marginTop: 10 }}>
                {['space', 'zen', 'neon'].map(k => (
                  <Card
                    key={k}
                    className={`scard selectable ${draft.backdrop === k ? 'selected' : ''}`}
                    onClick={() => { setBackdrop(k); useUIStore.getState().setAmbientEnabled(true); }}
                  >
                    <div className={`thumb fx-${BACKDROPS[k].fx}`}>
                      <div className="shine"></div>
                    </div>
                    <div className="body" style={{ padding: 10 }}>
                      <b style={{ fontSize: 13 }}>{BACKDROPS[k].name}</b>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="mini">Each template has its own environment. This one plays in the <b>{backdrop?.name}</b>.</p>
              <div className={`envpreview thumb fx-${backdrop?.fx}`} style={{ marginTop: 10 }}>
                <div className="shine"></div>
                <span className="pill solid" style={{ position: 'absolute', left: 10, bottom: 10 }}>{backdrop?.name}</span>
              </div>
            </>
          )}
          <div className="row" style={{ marginTop: 14, gap: 18 }}>
            <Toggle id="env-amb" label="Ambient animation" checked={useUIStore.getState().ambientEnabled} onChange={useUIStore.getState().setAmbientEnabled} />
            <Toggle id="env-snd" label="Sound effects" checked={useUIStore.getState().soundEnabled} onChange={useUIStore.getState().setSoundEnabled} />
          </div>
          <div className="note info">Pressure rises each round and jumps when an event is drawn. It speeds up every concession curve.</div>
        </Card>
      </div>
    );
  };

  const renderOrchTab = () => {
    const A = AUTONOMY[draft.autonomy];

    return (
      <div className="grid g2">
        <Card>
          <h3>Roles it plays</h3>
          <p className="mini">The Orchestrator is a visible referee. Switch off any duty.</p>
          {ORCH_ROLES.map(r => (
            <label key={r} className="chk">
              <input
                type="checkbox"
                checked={draft.roles.includes(r)}
                onChange={(e) => {
                  const roles = [...draft.roles];
                  if (e.target.checked) roles.push(r);
                  else roles.splice(roles.indexOf(r), 1);
                  setOrchestratorRoles(roles);
                }}
              />
              <span className="bx">✓</span>
              <span>
                <b>{ORCH_ROLE_LABELS[r as keyof typeof ORCH_ROLE_LABELS]}</b>
                <small>{ORCH_ROLE_DESCS[r as keyof typeof ORCH_ROLE_DESCS]}</small>
              </span>
            </label>
          ))}
        </Card>
        <Card>
          <h3>Autonomy level</h3>
          <p className="mini">How much the Orchestrator intervenes on its own.</p>
          <div style={{ marginTop: 14 }}>
            <Slider
              id="au"
              min={0}
              max={3}
              value={draft.autonomy}
              onChange={(v: number) => setAutonomy(v as 0 | 1 | 2 | 3)}
              labels={AUTONOMY.map(a => a.n + ' ' + a.label)}
            />
          </div>
          <div className="note info" style={{ fontSize: 13 }}>
            <b>{A.n}, {A.label}</b>, {A.desc}
          </div>
          <div className="lbl" style={{ marginTop: 14 }}>Turn loop (runs every turn)</div>
          <ol className="mini" style={{ lineHeight: 1.9, paddingLeft: 18 }}>
            <li>Pick next speaker (round-robin)</li>
            <li>Pass history + state to the agent</li>
            <li>Collect move (AI reasoning or your input)</li>
            <li>Update state store: offers, trust, emotions</li>
            <li>Check events + deadlock {draft.autonomy >= 2 ? '✓' : <span style={{ color: "var(--amber)" }}>(limited at this level)</span>}</li>
            <li>End check: deal, round limit, walk-away</li>
          </ol>
        </Card>
      </div>
    );
  };

  return (
    <section id="setup" className="screen active">
      <div className="row between">
        <div>
          <div className="eyebrow">Step 3 of 4</div>
          <h1 className="heading">Set the table</h1>
        </div>
        <div className="note info" style={{ margin: 0, maxWidth: 430 }}>
          Already playable with template defaults. Drag role cards onto chairs, click a chair to tune that agent, or just press <b>Next</b>.
        </div>
      </div>

      <div className="tabs" id="setuptabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={draft.tab === id ? 'on' : ''}
            onClick={() => handleTabChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div id="tab-builder" className="tabpane" style={{ display: draft.tab === 'builder' ? 'block' : 'none' }}>
        {renderBuilderTab()}
      </div>
      <div id="tab-seats" className="tabpane" style={{ display: draft.tab === 'seats' ? 'block' : 'none' }}>
        {renderSeatsTab()}
      </div>
      <div id="tab-env" className="tabpane" style={{ display: draft.tab === 'env' ? 'block' : 'none' }}>
        {renderEnvTab()}
      </div>
      <div id="tab-orch" className="tabpane" style={{ display: draft.tab === 'orch' ? 'block' : 'none' }}>
        {renderOrchTab()}
      </div>

      <div className="actions">
        <Button className="ghost" onClick={handleBack}>
          <ArrowLeft size={15} /> Back
        </Button>
        <Button className="ghost" onClick={handleReset}>Reset to template</Button>
        <span style={{ flex: 1 }}></span>
        <span className="mini" id="validmsg">{validate() || 'Ready'}</span>
        <Button className="primary" onClick={handleNext}>Next: Briefing <ArrowRight size={15} /></Button>
      </div>
    </section>
  );
}