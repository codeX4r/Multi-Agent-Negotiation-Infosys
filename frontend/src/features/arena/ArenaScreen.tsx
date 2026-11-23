'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { useSessionStore } from '@/stores/session-store';
import { useConfigStore } from '@/stores/config-store';
import { useSimulation } from '@/hooks/useSimulation';
import { Button } from '@/components/ui/Button';
import { getScenario, fmtVal } from '@/engine/scenarios';
import {
  adaptBackendResult,
  BackendUnavailableError,
  buildBackendScenarioConfig,
  runBackendScenarioNegotiation,
} from '@/lib/backendAdapter';
import {
  formatOutcomeReason,
  getOutcomeTitle,
  getSatisfactionTitle,
  shouldShowTurnReasoning,
} from '@/lib/backendResultPresentation';
import {
  PERSONALITIES, CLIMATES, AUTONOMY, BACKDROPS,
  getEmotionFace, getEmotionLabel,
} from '@/engine/types';
import { toneModel } from '@/engine';
import type { Agent, TranscriptEntry, Offer, SimulationState } from '@/engine/types';

/* ─────────────────────────── helpers ─────────────────────────── */

function calculateUtility(agent: Agent, x: Record<string, number>, scenario: any): number {
  if (!x) return 0;
  let u = 0;
  for (const issue of scenario?.issues || []) {
    const p = agent.prefs[issue.id];
    const w = agent.w[issue.id] || 0;
    if (!p || !w) continue;
    const den = p.ideal - p.reserve;
    const v = den === 0 ? 1 : Math.max(0, Math.min(1, (x[issue.id] - p.reserve) / den));
    u += w * v;
  }
  return u;
}

/* ─────────────────────────── sub-components ─────────────────────────── */

function OfferForm({
  values, onChange, onClose, onSend, scenario, human,
}: {
  values: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  onClose: () => void;
  onSend: () => void;
  scenario: any;
  human: Agent;
}) {
  const u = calculateUtility(human, values, scenario);
  const isValid =
    scenario?.issues.every((is: any) =>
      !is.derived || (values[is.id] >= is.min && values[is.id] <= is.max),
    ) ?? true;

  return (
    <div className="offerform">
      {scenario?.issues.map((is: any) =>
        is.derived ? (
          <div key={is.id} className="of">
            <label>
              {is.label} <b>{fmtVal(is, values[is.id])}</b>
            </label>
            <div className="u">auto: remainder</div>
          </div>
        ) : (
          <div key={is.id} className="of">
            <label>
              {is.label} <b>{fmtVal(is, values[is.id])}</b>
            </label>
            <input
              type="range"
              min={is.min}
              max={is.max}
              step={is.step}
              value={values[is.id] || is.min}
              onChange={(e) => onChange({ ...values, [is.id]: +e.target.value })}
            />
            <div className="u">
              {human.prefs[is.id] && (human.w[is.id] || 0) > 0.001
                ? `your best: ${fmtVal(is, human.prefs[is.id].ideal)}, weight ${Math.round(human.w[is.id] * 100)}%`
                : 'not a priority for you'}
            </div>
          </div>
        ),
      )}
      <div className="of">
        <label>
          Value to you{' '}
          <b style={{ color: u < human.batnaU ? 'var(--red)' : 'var(--green)' }}>
            {Math.round(u * 100)} / 100
          </b>
        </label>
        <div className="bar">
          <span style={{ width: `${u * 100}%` }}></span>
        </div>
        <div className="row" style={{ marginTop: 6, gap: 6 }}>
          <Button className="btn sm primary" onClick={onSend} disabled={!isValid || u < human.batnaU}>
            Send offer
          </Button>
          <Button className="btn sm ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Seat avatar rendered on the round table ── */
function Seat({
  agent, state, isHumanTurn, isSpeaking,
}: {
  agent: Agent;
  state: SimulationState;
  isHumanTurn: boolean;
  isSpeaking: boolean;
}) {
  const n = state.agents.length;
  const rot = state.agents.findIndex((a) => a.human);
  const rotation = rot < 0 ? 0 : rot;
  const idx = state.agents.findIndex((a) => a.id === agent.id);
  const pos = Array.from({ length: n }, (_, i) => {
    const a = Math.PI / 2 + i * 2 * Math.PI / n;
    return { x: 50 + 38 * Math.cos(a), y: 49 + 33 * Math.sin(a) };
  })[(idx - rotation + n) % n];

  const emo = state.emo?.[agent.id] || { v: 0.15, a: 0.3, hist: [0.15], ahist: [0.3] };
  const face = getEmotionFace(emo);
  const label = getEmotionLabel(emo);

  const dotStyle = {
    left: `${10 + emo.a * 80}%`,
    top: `${50 - emo.v * 40}%`,
    background:
      emo.v > 0.1 ? '#67d6a3' : emo.v > -0.2 ? '#f4c66a' : '#f08b91',
  };

  const hist = emo.hist.slice(-20);
  const points = hist
    .map((v, i) =>
      `${((i / Math.max(1, hist.length - 1)) * 62 + 1).toFixed(1)},${(12 - v * 10).toFixed(1)}`,
    )
    .join(' ');

  const lastEntry = [...state.transcript]
    .reverse()
    .find((t) => t.by === agent.id && t.decision);
  const tone = lastEntry?.tone ||
    (agent.human
      ? 'neutral'
      : PERSONALITIES[agent.personality as keyof typeof PERSONALITIES]?.label
        .toLowerCase() || 'firm');
  const toneChipClass = `chipx stc ${tone}`;

  let decisionChip: React.ReactNode = null;
  if (lastEntry && lastEntry.decision !== 'message') {
    decisionChip = (
      <span
        className={`chipx dec ${lastEntry.decision === 'open' ? 'open' : lastEntry.decision
          }`}
      >
        {lastEntry.decision}
      </span>
    );
  }
  if (state.accepts.includes(agent.id) && state.table) {
    decisionChip = <span className="chipx dec accept">Accepted</span>;
  }

  return (
    <div
      className={`seat ${pos.y < 45 ? 'top' : ''} ${isSpeaking ? 'speaking' : ''} ${isHumanTurn ? 'waiting' : ''}`}
      id={`seat-${agent.id}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
    >
      <div className="bubble"></div>
      <div className="thought hidden"></div>
      <div className="fig">
        <div className="ring"></div>
        <svg viewBox="0 0 92 96" style={{ width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id={`fg${agent.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={agent.color} />
              <stop offset="1" stopColor={agent.color + '88'} />
            </linearGradient>
          </defs>
          <rect x="12" y="34" width="68" height="58" rx="16" fill="#0b1426" stroke="#ffffff18" />
          <path d="M14 94 C14 66 28 54 46 54 C64 54 78 66 78 94 Z" fill={`url(#fg${agent.id})`} />
          <path d="M38 56 L46 70 L54 56" fill="#ffffff30" />
          <circle cx="46" cy="24" r="21" fill={agent.color} opacity="0.95" />
          <circle cx="46" cy="24" r="21" fill={`url(#fg${agent.id})`} opacity="0.4" />
        </svg>
        {/* Emotion emoji face — always visible on the avatar */}
        <div className="face">{face}</div>
      </div>
      <div className="plate">
        <div className="nm">
          <span className="dot" style={{ width: 9, height: 9, background: agent.color }}></span>
          {agent.human ? `You (${agent.name})` : agent.name}
        </div>
        <div className="chips">
          <span className={toneChipClass}>{tone}</span>
          {decisionChip}
        </div>
        <div className="emo">
          <div className="orb">
            <i style={dotStyle as React.CSSProperties}></i>
          </div>
          <svg className="spark" viewBox="0 0 64 24">
            <line x1="0" x2="64" y1="12" y2="12" stroke="#ffffff18" />
            <polyline
              points={points}
              fill="none"
              stroke={agent.color}
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {hist.length > 0 && (
              <circle
                cx={`${((hist.length - 1) / Math.max(1, hist.length - 1)) * 62 + 1}`}
                cy={`${12 - hist[hist.length - 1] * 10}`}
                r="2.5"
                fill={agent.color}
              />
            )}
          </svg>
          <span className="mini emolbl" style={{ minWidth: 44, textAlign: 'left' }}>
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Offer card displayed on the round table ── */
function OfferCard({
  offer, scenario, agents, accepts,
}: {
  offer: Offer; scenario: any; agents: any[]; accepts: string[];
}) {
  const need = agents.filter((a) => a.id !== offer.by);
  return (
    <div className="offercard" id="offercard">
      <div className="hd">
        <span>OFFER ON TABLE</span>
        <span style={{ color: 'var(--text)' }}>
          by {agents.find((a) => a.id === offer.by)?.name || offer.by}
        </span>
      </div>
      {scenario?.issues.map((is: any) => (
        <div key={is.id} className="tr">
          <span>{is.label}</span>
          <b>
            {offer.x[is.id] == null
              ? 'Not provided by backend'
              : fmtVal(is, offer.x[is.id])}
          </b>
        </div>
      ))}
      <div className="acc">
        <span>Accepted:</span>
        {need.map((a) => (
          <span
            key={a.id}
            className="tk"
            style={{ background: accepts.includes(a.id) ? a.color : '#2b3853' }}
            title={a.name}
          >
            {accepts.includes(a.id) ? '✓' : ''}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          {accepts.length}/{need.length}
        </span>
      </div>
    </div>
  );
}

/* ── Trust-thread SVG ── */
function TrustThreads({ state }: { state: SimulationState }) {
  const W = 600, H = 500;
  const seatXY: Record<string, { x: number; y: number }> = {};
  const n = state.agents.length;
  const rot = state.agents.findIndex((a) => a.human);
  const rotation = rot < 0 ? 0 : rot;

  state.agents.forEach((agent, idx) => {
    const pos = Array.from({ length: n }, (_, i) => {
      const a = Math.PI / 2 + i * 2 * Math.PI / n;
      return { x: 50 + 38 * Math.cos(a), y: 49 + 33 * Math.sin(a) };
    })[(idx - rotation + n) % n];
    seatXY[agent.id] = pos;
  });

  let html = '';
  for (let i = 0; i < state.agents.length; i++) {
    for (let j = i + 1; j < state.agents.length; j++) {
      const a = state.agents[i].id;
      const b = state.agents[j].id;
      const t = ((state.trust[a]?.[b] || 0.5) + (state.trust[b]?.[a] || 0.5)) / 2;
      const p = seatXY[a];
      const q = seatXY[b];
      if (!p || !q) continue;
      const col = t > 0.6 ? '#67d6a3' : t > 0.4 ? '#7aa7ff' : '#f08b91';
      html += `<line x1="${(p.x / 100) * W}" y1="${(p.y / 100) * H}" x2="${(q.x / 100) * W}" y2="${(q.y / 100) * H}" stroke="${col}" stroke-opacity=".55" stroke-width="${(1 + t * 7).toFixed(1)}" stroke-linecap="round"${t < 0.38 ? ' stroke-dasharray="6 7"' : ''}><title>Trust ${Math.round(t * 100)}</title></line>`;
    }
  }
  return (
    <svg
      id="threads"
      viewBox={`0 0 ${W} ${H}`}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/* ── Concession chart ── */
function ConcessionChart({ lines, agents }: { lines: any[]; agents: any[] }) {
  const w = 270, ht = 150, pad = 22;
  const xs = (i: number) =>
    pad + (i / Math.max(1, (lines[0]?.values?.length || 1) - 1)) * (w - pad - 6);
  const ys = (v: number) => ht - 18 - v * (ht - 30);

  let g = `<rect x="${pad}" y="${ys(1)}" width="${w - pad - 6}" height="${ys(0) - ys(1)}" fill="#ffffff05"/>`;
  [0, 0.5, 1].forEach(
    (v) =>
      (g += `<line x1="${pad}" x2="${w - 6}" y1="${ys(v)}" y2="${ys(v)}" stroke="#ffffff12"/><text x="2" y="${ys(v) + 3}" fill="#9aa9c2" font-size="8">${v * 100}</text>`),
  );
  agents.forEach((a) => {
    const line = lines.find((l) => l.agentId === a.id);
    if (!line) return;
    const poly = line.values
      .map((v: number | null, i: number) =>
        v == null ? '' : `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`,
      )
      .filter(Boolean)
      .join(' ');
    if (!poly) return;
    g += `<path d="${poly}" fill="none" stroke="${a.color}" stroke-width="${a.human ? 2.6 : 1.9}" stroke-linejoin="round"/>`;
    const li = line.values.length - 1;
    if (li >= 0 && line.values[li] != null) {
      g += `<circle cx="${xs(li)}" cy="${ys(line.values[li])}" r="3" fill="${a.color}"/>`;
    }
    g += `<line x1="${pad}" x2="${w - 6}" y1="${ys(a.batnaU)}" y2="${ys(a.batnaU)}" stroke="${a.color}" stroke-dasharray="4 4" stroke-opacity=".7"/>`;
  });
  return (
    <svg
      id="chart"
      viewBox={`0 0 ${w} ${ht}`}
      style={{ width: '100%' }}
      dangerouslySetInnerHTML={{ __html: g }}
    />
  );
}

/* ── ZOPA gauge ── */
function ZOPAGauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  const a = Math.PI * (1 - v);
  const x = +(80 + 62 * Math.cos(a)).toFixed(2);
  const y = +(82 - 62 * Math.sin(a)).toFixed(2);
  const col = v > 0.66 ? '#67d6a3' : v > 0.4 ? '#7aa7ff' : '#f4c66a';
  // Avoid degenerate zero-length arc (at v=0 needle is already at left edge M18,82)
  const showArc = v > 0.005;
  return (
    <svg className="gauge" viewBox="0 0 160 92" width="160" style={{ display: 'block', margin: 'auto' }}>
      {/* Full background semicircle: left (18,82) → right (142,82) */}
      <path d="M18 82 A62 62 0 0 1 142 82" stroke="#25324c" strokeWidth="12" fill="none" strokeLinecap="round" />
      {/* Active arc from left edge to current needle position */}
      {showArc && (
        <path
          d={`M18 82 A62 62 0 0 1 ${x} ${y}`}
          stroke={col}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
      )}
      {/* Needle */}
      <line x1="80" y1="82" x2={x} y2={y} stroke="#eef3ff" strokeWidth="3" strokeLinecap="round"
        style={{ transition: 'all 0.6s ease' }} />
      {/* Centre pivot dot */}
      <circle cx="80" cy="82" r="6" fill="#eef3ff" />
      {/* Percentage label */}
      <text x="80" y="62" textAnchor="middle" fill="#eef3ff" fontSize="17" fontWeight="800">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ARENA SCREEN — main export
══════════════════════════════════════════════════════════════ */
export function ArenaScreen() {
  const {
    setScreen,
    mindReveal, setMindReveal,
    arenaPaused, setArenaPaused,
    arenaPlaying, setArenaPlaying,
    simulationSpeed, setSimulationSpeed,
    showToast,
  } = useUIStore();

  const { engineState, transcript, tableOffer, concessionLines, stanceBars,
    zopaOverlap, deadlockRisk, agreementLikelihood, currentSpeaker } = useSessionStore();

  const { initialize, togglePlay, stepOnce, togglePause, sendMessage,
    acceptOffer, walkAway, suggestConcession,
    runLoop } = useSimulation();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const startSession = async () => {
      try {
        const initialDraft = useConfigStore.getState().draft;
        if (!initialDraft.scenarioId) {
          useConfigStore.getState().resetToTemplate(getScenario('vendor'));
          useConfigStore.getState().setMode('simulation');
        }

        await initialize();

        if (cancelled) return;

        const state = useSessionStore.getState().engineState;

        if (state?.agents.some((agent) => agent.human)) {
          // Practice: run until the human's turn.
          setArenaPlaying(true);
          runLoop(true);
          return;
        }

        const draft = useConfigStore.getState().draft;
        const backendScenarioMap = {
          vendor: 'vendor',
          job: 'job',
          budget: 'budget',
          vendor_pricing: 'vendor',
          job_offer: 'job',
          project_budget: 'budget',
        } as const;

        const backendScenario = backendScenarioMap[
          draft.scenarioId as keyof typeof backendScenarioMap
        ];

        if (draft.mode === 'simulation' && draft.scenarioId && backendScenario) {
          const participants = state?.agents ?? [];
          try {
            const engineConfig = useConfigStore.getState().buildEngineConfig(
              getScenario(draft.scenarioId),
            );
            const backendConfig = buildBackendScenarioConfig(engineConfig);
            if (state && participants.length > 1) {
              const result = await runBackendScenarioNegotiation(
                backendScenario,
                backendConfig,
                controller.signal,
              );
              if (cancelled) return;

              const update = adaptBackendResult(result, state, participants);
              const session = useSessionStore.getState();
              session.setEngineState(update.state);
              session.setTranscript(update.transcript);
              session.setTableOffer(update.tableOffer);
              session.setCurrentSpeaker(update.transcript.at(-1)?.by ?? null);
              setArenaPlaying(false);
              setArenaPaused(false);
              return;
            } else {
              showToast('The backend setup needs at least two configured parties; using the local simulation.');
            }
          } catch (error) {
            if (cancelled) return;
            showToast(
              error instanceof BackendUnavailableError
                ? 'FastAPI is unreachable; using the scripted simulation.'
                : `Backend negotiation failed: ${error instanceof Error ? error.message : 'Unknown error'}. Using the scripted simulation.`,
            );
          }
        }

        // Simulation fallback when the backend is unavailable or unsupported.
        togglePlay(true);
      } catch {
        // initialize() already displays the error.
      }
    };

    void startSession();

    return () => {
      cancelled = true;
      controller.abort();
    };

    // Initialize once whenever the Arena screen is entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Derived values */
  const scenario = engineState ? getScenario(engineState.scenario) : null;
  const isSim = !engineState?.agents.some((a) => a.human);
  const prac = !isSim;
  const human = engineState?.agents.find((a) => a.human) || null;
  const myTurn = prac && engineState?.waitingHuman && human != null;

  const msgInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerFormValues, setOfferFormValues] = useState<Record<string, number>>({});
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  /* ── Start the simulation loop once initialised (simulation mode only) ──
     In practice mode the loop is driven by user input.
  */
  useEffect(() => {
    if (engineState && isSim && engineState.status === 'running' && !arenaPlaying) {
      // Don't auto-start — user must press Play
    }
  }, [engineState, isSim, arenaPlaying]);

  /* ── Keyboard shortcuts: Space → play/pause, N → next turn ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if ((e.key === 'n' || e.key === 'N') && isSim) stepOnce();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSim, togglePlay, stepOnce]);

  /* ── Practice mode: message handlers ── */
  const handleSend = useCallback(async () => {
    if (!draft.trim() && !showOfferForm) return;
    await sendMessage(draft, showOfferForm ? offerFormValues : undefined);
    setDraft('');
    setShowOfferForm(false);
    setOfferFormValues({});
  }, [draft, showOfferForm, offerFormValues, sendMessage]);

  const handleAccept = useCallback(async () => {
    await acceptOffer(draft || 'I accept these terms.');
    setDraft('');
  }, [draft, acceptOffer]);

  const handleWalkAway = useCallback(async () => {
    await walkAway(draft || 'This is not working for us. We are walking away.');
  }, [draft, walkAway]);

  const handleConcede = useCallback(() => {
    const x = suggestConcession();
    if (x) {
      setShowOfferForm(true);
      setOfferFormValues(x);
      useSessionStore.getState().setInnerVoiceText(
        'Suggested concession computed from your priorities — it gives ground on your low-weight issues first. Adjust, then Send.',
      );
    }
  }, [suggestConcession]);

  /* ── Loading state ── */
  if (!engineState || !scenario) {
    return (
      <section id="arena" className="screen active">
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Initialising arena…</div>
          <div className="mini">Loading the negotiation engine. This takes a moment.</div>
        </div>
      </section>
    );
  }

  /* ── Computed display values ── */
  const lim = engineState.maxRounds;
  const roundProgress = engineState.round
    ? ((engineState.round - 1) / Math.max(1, lim)) * 100
    : 0;
  const pressure = engineState.pressure * 100;
  const backendOutcome = engineState.backendOutcome;
  const showBackendResult = Boolean(backendOutcome && engineState.status !== 'running');
  const backendOutcomeTitle = backendOutcome ? getOutcomeTitle(backendOutcome) : null;

  /* ── Tone preview (practice only) ── */
  let tonePreview: { label: string; p: Record<string, number> } | null = null;
  if (prac && draft) {
    tonePreview = toneModel.classify(draft);
  }

  /* ───────────────────── JSX ───────────────────── */
  return (
    <section id="arena" className="screen active">

      {/* ══ Top bar ══ */}
      <div className="arenatop">
        <div className="lt">
          {/* Scenario name + status pills */}
          <div>
            <div className="eyebrow" id="a-scen">
              {scenario.name}
              {BACKDROPS[scenario.backdrop as keyof typeof BACKDROPS]
                ? `, ${BACKDROPS[scenario.backdrop as keyof typeof BACKDROPS].name}`
                : ''}
            </div>
            <div className="row" style={{ gap: 6, marginTop: 3 }}>
              <span
                className={`pill ${engineState.status === 'running' && !arenaPaused
                  ? 'live'
                  : engineState.status === 'deal'
                    ? 'live'
                    : 'bad'
                  }`}
                id="a-status"
              >
                {engineState.status === 'running' && !arenaPaused
                  ? 'Live'
                  : backendOutcomeTitle ?? (engineState.status === 'deal' ? 'Deal reached' : 'No deal')}
              </span>
              <span className="pill" id="a-mode">
                {isSim ? 'Simulation' : 'Practice'}
              </span>
              {engineState.forkedFrom && (
                <span className="pill info" id="a-fork">
                  Forked timeline
                </span>
              )}
            </div>
          </div>

          {/* Round counter */}
          <div className="roundbox">
            <div className="metricline" style={{ margin: 0 }}>
              <span>Round</span>
              <strong id="a-round">
                {Math.min(engineState.round, engineState.maxRounds)} /{' '}
                {engineState.maxRounds}
              </strong>
            </div>
            <div className="bar">
              <span id="a-roundbar" style={{ width: `${roundProgress}%` }}></span>
            </div>
          </div>

          {/* Climate pressure */}
          <div className="roundbox">
            <div className="metricline" style={{ margin: 0 }}>
              <span>Climate pressure</span>
              <strong id="a-pressure">{Math.round(pressure)}%</strong>
            </div>
            <div className="bar risk">
              <span id="a-pressurebar" style={{ width: `${pressure}%` }}></span>
            </div>
          </div>

          {/* Climate selector — switches climate & pressure in real-time */}
          <div className="seg" id="a-climate">
            {Object.entries(CLIMATES).map(([k, c]) => (
              <button
                key={k}
                className={engineState.climate === k ? 'on' : ''}
                onClick={() => {
                  useSessionStore.getState().setEngineClimate(k as 'stable' | 'volatile' | 'crisis');
                  showToast(`Climate: ${c.label}`);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right-side controls */}
        <div className="row" style={{ gap: 8 }}>
          {/* Mind Reveal toggle — simulation only */}
          {isSim && (
            <label
              className="tgl"
              id="mindtgl"
              data-tip="Show agents' private thoughts (Simulation only)"
            >
              <input
                type="checkbox"
                id="mindreveal"
                checked={mindReveal}
                onChange={() => setMindReveal(!mindReveal)}
              />
              <span className="tr"></span>
              <span className="t">Mind Reveal</span>
            </label>
          )}

          {/* Pause / Resume */}
          <button
            className={`ibtn ${arenaPaused ? '' : 'on'}`}
            id="a-pause"
            data-tip={arenaPaused ? 'Resume' : 'Pause (Space)'}
            onClick={() => togglePause()}
          >
            {arenaPaused ? '▶' : 'II'}
          </button>

          {/* Finish button */}
          <button
            className="btn sm ghost"
            onClick={() => {
              if (engineState.status !== 'running') {
                setScreen('outcome');
              } else {
                showToast('The session is still running. Walk away or wait for a decision.');
              }
            }}
          >
            Finish
          </button>
        </div>
      </div>

      {showBackendResult && backendOutcome && (
        <section
          className={`card backend-result-summary ${backendOutcome === 'deal' ? 'success' : 'ended'}`}
          aria-live="polite"
          aria-label="Negotiation result"
        >
          <div className="backend-result-heading">
            <span className={`pill ${backendOutcome === 'deal' ? 'live' : 'bad'}`}>Result</span>
            <h2>{backendOutcomeTitle}</h2>
            <p className="mini">{formatOutcomeReason(backendOutcome, engineState.endReason)}</p>
          </div>
          <div className="backend-result-parties">
            <h3>{getSatisfactionTitle(backendOutcome)}</h3>
            <p className="mini">
              {backendOutcome === 'deal'
                ? 'How each party felt about the agreed offer.'
                : 'How close the last offer came to each party’s preferences.'}
            </p>
            <div className="backend-result-party-list">
              {engineState.agents.map((agent) => {
                const satisfaction = engineState.table
                  ? Math.round(calculateUtility(agent, engineState.table.x, scenario) * 100)
                  : null;
                return (
                  <div className="metricline" key={agent.id}>
                    <span>{agent.human ? 'You' : agent.name}</span>
                    <strong>{satisfaction === null ? 'No offer' : `${satisfaction}%`}</strong>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ══ 3-column arena layout ══ */}
      <div
        className={`arena${leftCollapsed ? ' noleft' : ''}${rightCollapsed ? ' noright' : ''}`}
        id="arenagrid"
      >

        {/* ── Left sidebar: Transcript ── */}
        <aside
          className={`card side${leftCollapsed ? ' collapsed' : ''}`}
          id="leftside"
        >
          <button
            className="colbtn"
            onClick={() => setLeftCollapsed((v) => !v)}
            title={leftCollapsed ? 'Expand' : 'Collapse'}
          >
            {leftCollapsed ? '⟩' : '⟨'}
          </button>
          {!leftCollapsed && (
            <>
              <h3>Transcript</h3>
              <p className="mini" style={{ marginBottom: 8 }}>
                Public voice, offers, decisions
              </p>
              <div className="transcript" id="transcript">
                {transcript.length === 0 && (
                  <div className="msg sys">
                    Waiting for the first move…
                  </div>
                )}
                {transcript.map((entry, i) => (
                  <TranscriptMsg
                    key={i}
                    entry={entry}
                    agents={engineState.agents}
                    showReasoning={isSim && mindReveal}
                  />
                ))}
              </div>
            </>
          )}
        </aside>

        {/* ── Centre: Round table ── */}
        <main className="card stage">
          {/* Table wrap: seats + offer card */}
          <div className="tablewrap" id="tablewrap">
            <div className="floor"></div>
            <TrustThreads state={engineState} />
            <div className="bigtable" id="bigtable"></div>

            {tableOffer && (
              <OfferCard
                offer={tableOffer}
                scenario={scenario}
                agents={engineState.agents}
                accepts={engineState.accepts}
              />
            )}

            <div
              id="seats"
              className={engineState.agents.length >= 4 ? 'many' : ''}
            >
              {engineState.agents.map((agent) => (
                <Seat
                  key={agent.id}
                  agent={agent}
                  state={engineState}
                  isHumanTurn={prac && (engineState.waitingHuman ?? false) && human?.id === agent.id}
                  isSpeaking={currentSpeaker === agent.id}
                />
              ))}
            </div>
          </div>

          {/* Composer — shown in Practice mode */}
          {prac && (
            <div id="composer" className="composer">
              {showOfferForm && human && (
                <OfferForm
                  values={offerFormValues}
                  onChange={setOfferFormValues}
                  onClose={() => {
                    setShowOfferForm(false);
                    setOfferFormValues({});
                  }}
                  onSend={handleSend}
                  scenario={scenario}
                  human={human}
                />
              )}

              <div className="line">
                <input
                  ref={msgInputRef}
                  className="msg"
                  id="msginput"
                  placeholder="Type your offer or reply, e.g. I can do ₹10.5L if delivery is 20 days"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSend();
                  }}
                />

                <div className="toneprev" data-tip="Live tone preview (trained classifier)">
                  <div
                    className="toneorb"
                    id="toneorb"
                    style={{
                      background: tonePreview
                        ? ({ warm: '#67d6a3', firm: '#7aa7ff', wary: '#f4c66a', pushy: '#f08b91', neutral: '#556' } as any)[tonePreview.label] || '#556'
                        : '#556',
                    }}
                  ></div>
                  <div>
                    <div className="mini" id="tonelbl">
                      tone {tonePreview ? tonePreview.label : '—'}
                    </div>
                    <div className="meter">
                      <span
                        id="tonemeter"
                        style={{
                          width: tonePreview
                            ? `${Math.min(100, (tonePreview.p.pushy || 0) * 100)}%`
                            : '0%',
                        }}
                      ></span>
                    </div>
                  </div>
                </div>

                <button
                  className="btn primary"
                  onClick={() => void handleSend()}
                  disabled={!draft.trim() && !showOfferForm}
                >
                  Send
                </button>
              </div>

              <div className="row" style={{ marginTop: 9, gap: 7 }}>
                <button
                  className="btn sm"
                  onClick={() => setShowOfferForm(true)}
                  disabled={!myTurn}
                >
                  Make offer
                </button>
                <button
                  className="btn sm"
                  onClick={() => setShowOfferForm(true)}
                  disabled={!myTurn}
                >
                  Counter
                </button>
                <button className="btn sm" onClick={handleConcede} disabled={!myTurn}>
                  Concede
                </button>
                <button
                  className="btn sm"
                  style={{ borderColor: '#2f7a59' }}
                  onClick={() => void handleAccept()}
                  disabled={!myTurn || !tableOffer || tableOffer.by === human?.id}
                >
                  Accept
                </button>
                <span style={{ flex: 1 }}></span>
                <span className="mini" id="turnhint">
                  {myTurn
                    ? tableOffer && tableOffer.by !== human?.id
                      ? 'Respond to the offer on the table'
                      : 'Make your move'
                    : ''}
                </span>
                <button
                  className="btn sm danger"
                  onClick={() => void handleWalkAway()}
                  disabled={!myTurn}
                >
                  Walk away
                </button>
              </div>
            </div>
          )}
        </main>

        {/* ── Right sidebar: Metrics ── */}
        <aside
          className={`card side${rightCollapsed ? ' collapsed' : ''}`}
          id="rightside"
        >
          <button
            className="colbtn"
            onClick={() => setRightCollapsed((v) => !v)}
            title={rightCollapsed ? 'Expand' : 'Collapse'}
          >
            {rightCollapsed ? '⟨' : '⟩'}
          </button>

          {!rightCollapsed && (
            <>
              <h3>Metrics</h3>
              <p className="mini">Live from the state store</p>

              <div className="sect">
                <h4>Concession lines</h4>
                <ConcessionChart lines={concessionLines} agents={engineState.agents} />
                <div className="legend" id="chartleg">
                  {engineState.agents.map((agent) => (
                    <span key={agent.id}>
                      <i style={{ background: agent.color }}></i>
                      {agent.human ? 'You' : agent.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="sect">
                <h4>Stance</h4>
                {engineState.agents.map((agent) => {
                  const target =
                    stanceBars.find((item) => item.agentId === agent.id)?.target || 0;
                  return (
                    <div key={agent.id} className="stance">
                      <span style={{ color: agent.color, fontWeight: 700 }}>
                        {agent.human ? 'You' : agent.name}
                      </span>
                      <div>
                        <div className="bar" style={{ margin: 0 }}>
                          <span
                            style={{
                              width: `${target * 100}%`,
                              background: `linear-gradient(90deg, ${agent.color}88, ${agent.color})`,
                            }}
                          ></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="row between mini">
                  <span>flexible</span>
                  <span>firm</span>
                </div>
              </div>

              <div className="sect">
                <h4>ZOPA overlap</h4>
                <ZOPAGauge value={zopaOverlap} />
                <div className="mini" style={{ textAlign: 'center', marginTop: 4 }}>
                  {prac ? 'estimated, opponents hidden' : 'deal zone overlap'}
                </div>
              </div>

              <div className="sect">
                <h4>Deadlock risk</h4>
                <div className="metricline" style={{ marginTop: 0 }}>
                  <span>
                    Stalled {engineState.deadlock.stalled} rd
                    {engineState.deadlock.stalled === 1 ? '' : 's'}, trigger at 3
                  </span>
                  <strong>{Math.round(deadlockRisk * 100)}%</strong>
                </div>
                <div className="bar risk">
                  <span style={{ width: `${deadlockRisk * 100}%` }}></span>
                </div>
              </div>

              <div className="sect">
                <h4>Agreement likelihood</h4>
                <div className="metricline" style={{ marginTop: 0 }}>
                  <span>Engine estimate</span>
                  <strong>{Math.round(agreementLikelihood * 100)}%</strong>
                </div>
                <div className="bar">
                  <span style={{ width: `${agreementLikelihood * 100}%` }}></span>
                </div>
              </div>

              {isSim && (
                <div id="simctl" className="simctl">
                  <button
                    className="btn primary"
                    id="playbtn"
                    onClick={() => togglePlay()}
                  >
                    {arenaPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button className="btn" onClick={() => stepOnce()}>
                    Next turn
                  </button>
                  <span className="mini">Speed</span>
                  <div className="seg" id="speedseg">
                    {[0.5, 1, 2, 4].map((speed) => (
                      <button
                        key={speed}
                        className={simulationSpeed === speed ? 'on' : ''}
                        onClick={() => setSimulationSpeed(speed)}
                      >
                        {speed}×
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

/* ── Transcript message bubble ── */
function TranscriptMsg({
  entry,
  agents,
  showReasoning,
}: {
  entry: TranscriptEntry;
  agents: Agent[];
  showReasoning: boolean;
}) {
  const agent = agents.find((item) => item.id === entry.by);
  const isMe = Boolean(agent?.human);
  const isOrchestrator = entry.by === 'orchestrator';
  const isEvent = entry.kind === 'event';
  const isRound = entry.kind === 'round';
  const isDeal = entry.kind === 'deal';
  const isBreakdown = entry.kind === 'breakdown';
  const rationale = entry.rationale?.trim();
  const showRationale = shouldShowTurnReasoning(showReasoning, rationale);

  let className = 'msg';
  if (isMe) className += ' me';
  else if (isRound) className += ' round';
  else if (isEvent) className += ' ev';
  else if (isDeal) className += ' deal';
  else if (isBreakdown) className += ' brk';
  else if (isOrchestrator) className += ' sys';

  return (
    <div className={className}>
      <div className="msghead">
        <strong style={{ color: agent?.color || '#9aa9c2' }}>
          {agent?.name || (isOrchestrator ? 'Orchestrator' : entry.by)}
        </strong>
        {entry.tone && <span className={`chipx stc ${entry.tone}`}>{entry.tone}</span>}
        {entry.decision && entry.decision !== 'message' && (
          <span className={`chipx dec ${entry.decision}`}>{entry.decision}</span>
        )}
      </div>
      <div className="msgbody">{entry.text}</div>
      {showRationale && (
        <p className="msgreason">
          <strong>Why they chose this:</strong> {rationale}
        </p>
      )}
    </div>
  );
}
