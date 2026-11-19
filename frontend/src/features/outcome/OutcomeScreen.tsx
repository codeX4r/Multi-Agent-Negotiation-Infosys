'use client';

import { useEffect, useRef } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle, XCircle,
  TrendingUp, Download, RotateCcw, BarChart2, Plus
} from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useSessionStore } from '@/stores/session-store';
import { useConfigStore } from '@/stores/config-store';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getScenario, PERSONALITIES, CLIMATES, BACKDROPS, AUTONOMY, SEAT_COLORS, fmtVal } from '@/engine/scenarios';
import type { Agent, SimulationState } from '@/engine/types';

export function OutcomeScreen() {
  const { setScreen, go } = useUIStore();
  const { engineState, transcript } = useSessionStore();
  const { draft, buildEngineConfig } = useConfigStore();

  const scenario = engineState ? getScenario(engineState.scenario) : null;
  const config = engineState ? {
    mode: engineState.agents.some(a => a.human) ? 'practice' : 'simulation',
    rounds: engineState.maxRounds,
    climate: engineState.climate,
    autonomy: 2,
    backdrop: engineState.agents[0]?.color || 'space',
  } : null;

  const prac = config?.mode === 'practice';

  // Generate report from session data
  const report = generateReport();

  const chartRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (chartRef.current) {
      drawChart(chartRef.current, 520, 220);
    }
  }, [report]);

  const handleNewSession = () => {
    go('mode');
  };

  const handleOpenReplay = () => {
    useUIStore.getState().setScreen('replay');
  };

  const handleExport = () => {
    // Export functionality
    exportReport();
  };

  if (!engineState || !scenario || !report) {
    return (
      <section id="outcome" className="screen active">
        <div className="eyebrow">Loading outcome...</div>
      </section>
    );
  }

  return (
    <section id="outcome" className="screen active">
      <div id="outcomebody">
        <div className={`banner ${report.deal ? 'ok' : 'bad'}`}>
          <div>
            <div className="eyebrow" style={{ color: report.deal ? 'var(--green)' : 'var(--red)' }}>
              Session completed, {scenario.name}
            </div>
            <div className="big">{report.deal ? `Deal reached in ${report.rounds} rounds` : 'No deal'}</div>
            <div className="mini" style={{ fontSize: 13 }}>
              {report.reason}{engineState.forkedFrom != null ? ', forked timeline from turn ' + engineState.forkedFrom : ''}
            </div>
          </div>
          <div className="row">
            <Button className="primary" onClick={handleOpenReplay}>
              <RotateCcw size={16} /> Open Replay Lab
            </Button>
            <Button onClick={handleExport}>
              <Download size={16} /> Export
            </Button>
            <Button className="ghost" onClick={handleNewSession}>
              <Plus size={16} /> New session
            </Button>
          </div>
        </div>

        <div className="grid g4" style={{ marginTop: 14 }}>
          <Card>
            <span className={`pill ${report.deal ? 'live' : 'bad'}`}>RESULT</span>
            <div className="kpi">{report.deal ? 'Agreement' : 'Breakdown'}</div>
            <p className="mini">{report.turns} turns, {report.events} events</p>
          </Card>
          <Card>
            <span className="pill">JOINT SCORE</span>
            <div className="kpi">{report.joint} / 100</div>
            <p className="mini">mean objective satisfaction</p>
          </Card>
          <Card>
            <span className="pill">ROUNDS</span>
            <div className="kpi">{report.rounds} / {engineState.maxRounds}</div>
            <p className="mini">{CLIMATES[engineState.climate].label} climate</p>
          </Card>
          <Card>
            <span className="pill">{draft.roles?.includes('auditor') ? 'AUDITOR, FAIRNESS' : 'SPREAD'}</span>
            <div className="kpi">{report.fairness}</div>
            <p className="mini">{report.fairnessGap} pt gap best to worst</p>
          </Card>
        </div>

        <div className="grid g2" style={{ marginTop: 14 }}>
          <Card>
            <h3>{report.deal ? 'Final terms' : 'Last offer on the table'}</h3>
            {report.terms ? (
              <table className="table">
                <thead>
                  <tr><th>Issue</th><th>{report.deal ? 'Agreed' : 'Last'}</th><th>Best for</th></tr>
                </thead>
                <tbody>
                  {scenario.issues.map((is: any) => {
                    const bestAgent = findBestForIssue(is, report);
                    return (
                      <tr key={is.id}>
                        <td>{is.label}</td>
                        <td style={{ color: report.deal ? 'var(--text)' : 'var(--red)', fontWeight: 700 }}>
                          {fmtVal(is, report.terms?.[is.id] ?? 0)}
                        </td>
                        <td>
                          {bestAgent ? (
                            <span style={{ color: bestAgent.color }}>● {bestAgent.human ? 'You' : bestAgent.name}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="mini">No offer was ever made.</p>
            )}
          </Card>

          <Card>
            <h3>Objective satisfaction per agent</h3>
            <p className="mini">Needle = score, dashed red = walk-away (BATNA)</p>
            <div className="gauges" style={{ marginTop: 8 }}>
              {report.per.map((p: any) => (
                <div key={p.id} className="gaugebox">
                  <svg viewBox="0 0 160 96" width="150" dangerouslySetInnerHTML={{ __html: createGauge(p.sat / 100, p.color, p.batna) }} />
                  <div style={{ fontWeight: 800, color: p.color }}>{p.human ? 'You' : p.name}</div>
                  <div className="mini">
                    {p.aboveBatna ? '✓ above walk-away' : 'below walk-away'}, {PERSONALITIES[p.personality as keyof typeof PERSONALITIES].label}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid g2" style={{ marginTop: 14 }}>
          <Card>
            <h3>Concession timeline</h3>
            <p className="mini">
              How much each party's own latest offer is worth to itself. Lines fall as they concede towards their walk-away (dashed).
              The dot at the end is the final deal value; purple markers are events.
            </p>
            <svg id="outchart" ref={chartRef} viewBox="0 0 520 220" style={{ width: '100%', marginTop: 8 }} />
            <div className="legend">
              {engineState.agents.map(a => (
                <span key={a.id}><i style={{ background: a.color }}></i>{a.human ? 'You' : a.name}</span>
              ))}
            </div>
          </Card>

          <Card>
            <h3>Concession pattern</h3>
            <div className="metricline"><span>Gave ground first</span><strong>{report.firstGiver ? `${report.firstGiver.name} (turn ${report.firstGiver.firstGiveTurn})` : '—'}</strong></div>
            <div className="metricline"><span>Conceded most</span><strong>{report.most ? `${report.most.name} (−${Math.round(report.most.moved * 100)} pts)` : '—'}</strong></div>

            {report.per.map((p: any) => (
              <div key={p.id}>
                <div className="metricline">
                  <span style={{ color: p.color }}>{p.name}, {p.offers} offer{p.offers === 1 ? '' : 's'}</span>
                  <strong>{Math.round(p.moved * 100)} pts moved</strong>
                </div>
                <div className="bar"><span style={{ width: `${Math.min(100, p.moved * 160)}%`, background: p.color }}></span></div>
              </div>
            ))}

            <h3 style={{ marginTop: 16 }}>Turning points</h3>
            {report.turning.slice(0, 5).map((t: any, idx: number) => (
              <div key={idx} className="habit">
                <span>{t.event ? '⚡' : t.d >= 0 ? '📈' : '📉'}</span>
                <span><b>R{t.round}, {t.who}</b> {t.text?.slice(0, 110)}</span>
              </div>
            ))}

            {prac && report.habits.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Your top habits</h3>
                {report.habits.map((h: any, idx: number) => (
                  <div key={idx} className="habit">
                    <span>{h.good ? '✓' : '!'}</span>
                    <span>{h.t}</span>
                  </div>
                ))}
              </>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Report Generation
// ============================================================================

interface Report {
  deal: boolean;
  reason: string;
  rounds: number;
  turns: number;
  terms: Record<string, number> | null;
  per: any[];
  firstGiver: any;
  most: any;
  turning: any[];
  habits: any[];
  joint: number;
  nash: number;
  events: number;
  risk: number[];
  fairness: string;
  fairnessGap: number;
}

function generateReport(): Report | null {
  const sessionStore = require('@/stores/session-store').useSessionStore.getState();
  const engineState = sessionStore.engineState;
  if (!engineState) return null;

  const scenario = getScenario(engineState.scenario);
  if (!scenario) return null;

  const deal = engineState.status === 'deal';

  // Per-agent metrics
  const per = engineState.agents.map((a: any) => {
    const offs = engineState.offers.filter((f: any) => f.by === a.id);
    const firstU = offs.length ? calculateUtility(a, offs[0].x) : null;
    const lastU = offs.length ? calculateUtility(a, offs[offs.length - 1].x) : null;
    const finalU = engineState.table ? calculateUtility(a, engineState.table.x) : 0;
    const firstGive = offs.findIndex((f: any, i: number) =>
      i > 0 && calculateUtility(a, f.x) < calculateUtility(a, offs[i - 1].x) - 0.005
    );

    return {
      id: a.id,
      name: a.human ? 'You' : a.name,
      human: !!a.human,
      color: a.color,
      personality: a.personality,
      finalU,
      sat: Math.round((deal ? finalU : Math.min(finalU, a.batnaU)) * 100),
      batna: a.batnaU,
      firstU,
      lastU,
      moved: firstU != null ? Math.max(0, firstU - lastU!) : 0,
      offers: offs.length,
      firstGiveTurn: firstGive > 0 ? offs[firstGive].turn : null,
      aboveBatna: finalU >= a.batnaU,
      trustIn: Object.values(engineState.trust[a.id] as Record<string, number>).reduce((s: number, v: number) => s + v, 0) / Math.max(1, Object.keys(engineState.trust[a.id] as Record<string, number>).length),
    };
  });

  const givers = per.filter((p: any) => p.firstGiveTurn != null).sort((a: any, b: any) => a.firstGiveTurn - b.firstGiveTurn);
  const most = per.slice().sort((a: any, b: any) => b.moved - a.moved)[0];

  // Turning points
  const turning: any[] = [];
  for (let i = 1; i < engineState.uHist.length; i++) {
    const a = engineState.uHist[i - 1], b = engineState.uHist[i];
    const d = Object.keys(b.u).reduce((s: number, k: string) => s + (b.u[k] - a.u[k]), 0) / Object.keys(b.u).length;
    turning.push({ turn: b.turn, round: b.round, d });
  }
  turning.sort((a: any, b: any) => Math.abs(b.d) - Math.abs(a.d));

  const topTurning = turning.slice(0, 3).map((t: any) => {
    const e = engineState.transcript.find((x: any) => x.turn === t.turn && x.by && x.by !== 'orchestrator') || engineState.transcript.find((x: any) => x.turn === t.turn);
    return { ...t, who: e ? e.name : 'Moderator', text: e ? e.text : '' };
  });

  engineState.events.forEach((ev: any) => {
    const e = scenario.events.find((ev2: any) => ev2.id === ev.id);
    topTurning.push({ round: ev.round, who: 'Event', text: e ? e.title : ev.id, d: 0, event: true });
  });

  // Habits
  const habits: any[] = [];
  const human = engineState.agents.find((a: any) => a.human);
  if (human) {
    const mine = engineState.transcript.filter((e: any) => e.human);
    const tones: Record<string, number> = {};
    mine.forEach((e: any) => tones[e.tone] = (tones[e.tone] || 0) + 1);
    const qs = mine.filter((e: any) => /\?/.test(e.text)).length;
    const offs = engineState.offers.filter((f: any) => f.by === human.id);
    const steps = offs.slice(1).map((f: any, i: number) => calculateUtility(human, offs[i].x) - calculateUtility(human, f.x));
    const avg = steps.length ? steps.reduce((a: number, b: number) => a + b, 0) / steps.length : 0;

    if ((tones.pushy || 0) >= 2) habits.push({ good: false, t: `You sounded pushy in ${tones.pushy} lines, each one cost trust.` });
    if ((tones.warm || 0) >= 2) habits.push({ good: true, t: `Warm framing in ${tones.warm} lines kept trust up.` });
    if (qs >= 2) habits.push({ good: true, t: `You asked ${qs} questions, good discovery of their needs.` });
    else habits.push({ good: false, t: 'You asked few questions. Probing their priorities reveals trades.' });
    if (avg > 0.08) habits.push({ good: false, t: `Big concession steps (avg ${Math.round(avg * 100)} pts), you gave ground fast.` });
    else if (offs.length >= 2) habits.push({ good: true, t: `Small, steady concessions (avg ${Math.round(avg * 100)} pts) protected your value.` });
    if (offs.length && engineState.offers[0] && engineState.offers[0].by === human.id) habits.push({ good: true, t: 'You anchored first.' });
  }

  const joint = deal ? Math.round(per.reduce((s: number, p: any) => s + p.finalU, 0) / per.length * 100) : 0;
  const nash = deal ? per.reduce((s: number, p: any) => s * Math.max(0.001, p.finalU - p.batna), 1) : 0;

  // Fairness
  const fairnessGap = per.length ? Math.max(...per.map((p: any) => p.sat)) - Math.min(...per.map((p: any) => p.sat)) : 0;
  const fairness = fairnessGap <= 15 ? 'Balanced' : fairnessGap <= 30 ? 'Uneven' : 'Lopsided';

  return {
    deal,
    reason: engineState.endReason,
    rounds: Math.min(engineState.round, engineState.maxRounds),
    turns: engineState.turnCount,
    terms: engineState.table ? engineState.table.x : null,
    per,
    firstGiver: givers[0] || null,
    most,
    turning: topTurning,
    habits: habits.slice(0, 2),
    joint,
    nash,
    events: engineState.events.length,
    risk: engineState.deadlock.riskHist,
    fairness,
    fairnessGap,
  };
}

function findBestForIssue(issue: any, report: Report) {
  let best: any = null, bestVal = -1;
  report.per.forEach((a: any) => {
    const w = a.w?.[issue.id] || 0;
    if (!w) return;
    const vIssue = calculateVIssue(a, issue.id, report.terms?.[issue.id] || 0);
    const val = w * vIssue;
    if (val > bestVal) { bestVal = val; best = a; }
  });
  return best;
}

function calculateVIssue(agent: any, issueId: string, val: number) {
  const p = agent.prefs[issueId];
  if (!p) return 0;
  const d = p.ideal - p.reserve;
  return d === 0 ? 1 : Math.max(0, Math.min(1, (val - p.reserve) / d));
}

function calculateUtility(agent: any, x: Record<string, number>) {
  if (!x) return 0;
  let u = 0;
  // Would need scenario issues - simplified
  return u;
}

function createGauge(val: number, color: string, batna: number): string {
  const a = Math.PI * (1 - Math.max(0, Math.min(1, val)));
  const x = 80 + 62 * Math.cos(a);
  const y = 82 - 62 * Math.sin(a);
  const am = Math.PI * (1 - batna);
  const xm = 80 + 50 * Math.cos(am);
  const ym = 82 - 50 * Math.sin(am);
  const xm2 = 80 + 74 * Math.cos(am);
  const ym2 = 82 - 74 * Math.sin(am);

  return `
    <path d="M${80 + 62 * Math.cos(Math.PI)} ${82 - 62 * Math.sin(Math.PI)} A62 62 0 0 1 ${80 + 62 * Math.cos(0)} ${82 - 62 * Math.sin(0)}" stroke="#25324c" stroke-width="12" fill="none" stroke-linecap="round"/>
    <path d="M${80 + 62 * Math.cos(Math.PI)} ${82 - 62 * Math.sin(Math.PI)} A62 62 0 0 1 ${x} ${y}" stroke="${color}" stroke-width="12" fill="none" stroke-linecap="round"/>
    <line x1="${xm}" y1="${ym}" x2="${xm2}" y2="${ym2}" stroke="#f08b91" stroke-width="2.5" stroke-dasharray="3 2"/>
    <line x1="80" y1="82" x2="${x}" y2="${y}" stroke="#eef3ff" stroke-width="3" stroke-linecap="round"/>
    <circle cx="80" cy="82" r="6" fill="#eef3ff"/>
    <text x="80" y="66" text-anchor="middle" fill="#eef3ff" font-size="17" font-weight="800">${Math.round(val * 100)}%</text>
  `;
}

function drawChart(svg: SVGSVGElement, w: number, h: number) {
  // Would draw concession chart - simplified
}

function exportReport() {
  // Export functionality - simplified
  alert('Export functionality to be implemented');
}