"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  createSimulation,
  type Simulation,
  type SessionDraft,
} from "@/engine/simulation";
import type {
  TranscriptEntry,
  Agent,
  ToneResult,
  SimulationState,
  Scenario,
} from "@/engine/types";
import { useUIStore } from "@/stores/ui-store";
import { useConfigStore } from "@/stores/config-store";
import { useSessionStore } from "@/stores/session-store";
import { getScenario } from "@/engine/scenarios";
import {
  buildBackendScenarioConfig,
  runBackendScenarioNegotiation,
  adaptBackendResult,
  mapUIScenarioToBackend,
  getBackendWording,
  BackendUnavailableError,
  type BackendArenaUpdate,
  type WordingRequest,
  type WordingResponse,
} from "@/lib/backendAdapter";
import {
  computeConcessionLines,
  computeStanceBars,
  computeZopaOverlap,
  computeAgreementLikelihood,
} from "@/engine/orchestrator";
import { clamp, r2 } from "@/engine/types";


let activeSim: Simulation | null = null;

export function useSimulation() {
  const simRef = useRef<Simulation | null>(activeSim);
  const isLoopingRef = useRef(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

const ui = useUIStore(
  useShallow((s) => ({
    mindReveal: s.mindReveal,
    arenaPaused: s.arenaPaused,
    arenaPlaying: s.arenaPlaying,
    simulationSpeed: s.simulationSpeed,
    setArenaPlaying: s.setArenaPlaying,
    setArenaPaused: s.setArenaPaused,
    showToast: s.showToast,
    setScreen: s.setScreen,
  }))
);

  const config = useConfigStore((s) => s.draft);
  const buildEngineConfig = useConfigStore((s) => s.buildEngineConfig);

 const session = useSessionStore(
  useShallow((s) => ({
    setEngineState: s.setEngineState,
    setTranscript: s.setTranscript,
    appendTranscript: s.appendTranscript,
    setTableOffer: s.setTableOffer,
    setConcessionLines: s.setConcessionLines,
    setStanceBars: s.setStanceBars,
    setZopaOverlap: s.setZopaOverlap,
    setDeadlockRisk: s.setDeadlockRisk,
    setDeadlockStalled: s.setDeadlockStalled,
    setAgreementLikelihood: s.setAgreementLikelihood,
    updateAgentState: s.updateAgentState,
    setInnerVoiceText: s.setInnerVoiceText,
    setCurrentSpeaker: s.setCurrentSpeaker,
    replayPlaying: s.replayPlaying,
    setReplayTurn: s.setReplayTurn,
    setReplayPlaying: s.setReplayPlaying,
    setReplayPerspective: s.setReplayPerspective,
    reset: s.reset,
  }))
);

  // Initialize simulation
  const initialize = useCallback(
    async (draft?: SessionDraft) => {
      try {
        setError(null);
        session.reset()
        const sim = createSimulation();
        activeSim = sim;
        simRef.current = sim;

        // Convert config draft to SessionDraft for buildEngineConfig
        const configDraft = useConfigStore.getState().draft;
        const sessionDraft: SessionDraft = {
          scenarioId: configDraft.scenarioId || 'vendor',
          mode: configDraft.mode || 'simulation',
          seats: configDraft.seats && configDraft.seats.length ? configDraft.seats : ['buyer', 'vendor', 'finance'],
          human: configDraft.human,
          climate: configDraft.climate || 'volatile',
          eventFreq: configDraft.eventFreq ?? 2,
          rounds: configDraft.rounds || 12,
          deadlockN: configDraft.deadlockN || 3,
          backdrop: configDraft.backdrop || 'tradefloor',
          roles: configDraft.roles || ['timekeeper', 'mediator', 'enforcer', 'injector', 'auditor'],
          autonomy: configDraft.autonomy ?? 2,
          roleOverrides: configDraft.roleOverrides,
        };

        const engineConfig = buildEngineConfig(draft || sessionDraft);
        if (!engineConfig) {
          throw new Error("Invalid configuration");
        }

        const isSimMode = engineConfig.mode === 'simulation';

        // Set up hooks - minimal for simulation mode (backend runs negotiation)
        sim.setHooks({
          onThinking: async (agent: Agent) => {
            if (isSimMode) return; // Backend handles thinking display
            session.setCurrentSpeaker(agent.id);
            session.updateAgentState(agent.id, { lastDecision: "thinking" });
            const seatEl = document.getElementById(`seat-${agent.id}`);
            const bubble = seatEl?.querySelector('.bubble');
            if (seatEl && bubble) {
              seatEl.classList.add('speaking');
              bubble.className = 'bubble typing show';
              bubble.innerHTML = '<b></b><b></b><b></b>';
            }
            const speed = useUIStore.getState().simulationSpeed;
            await new Promise((r) => setTimeout(r, 300 / (speed || 1)));
            if (bubble) {
              bubble.classList.remove('show', 'typing');
            }
          },
          onTurn: (entry: TranscriptEntry) => {
            if (isSimMode) return; // Backend transcript played by playBackendTranscript
            session.appendTranscript(entry);

            // Update current speaker and show bubble
            if (entry.by !== "orchestrator") {
              session.setCurrentSpeaker(entry.by);
              const seatEl = document.getElementById(`seat-${entry.by}`);
              const bubble = seatEl?.querySelector('.bubble');
              if (seatEl && bubble) {
                document.querySelectorAll('.seat').forEach(s => s.classList.remove('speaking', 'waiting'));
                seatEl.classList.add('speaking');
                bubble.className = 'bubble show';
                bubble.textContent = entry.text && entry.text.length > 120 ? entry.text.slice(0, 117) + '…' : (entry.text || '');
                const speed = useUIStore.getState().simulationSpeed;
                setTimeout(() => {
                  bubble.classList.remove('show');
                  seatEl.classList.remove('speaking');
                }, 2600 / Math.min(2, speed || 1));
              }
            }

            // Update table offer
            if (entry.x) {
              session.setTableOffer({
                by: entry.by,
                x: entry.x,
                round: entry.round,
                turn: entry.turn,
              });
            }

            // Update agent state
            if (entry.by !== "orchestrator") {
              const currentSim = simRef.current || activeSim;
              const agent = currentSim
                ?.getState()
                ?.agents.find((candidate) => candidate.id === entry.by);
              if (agent) {
                session.updateAgentState(agent.id, {
                  lastDecision: entry.decision || "message",
                  currentTone: entry.tone || "neutral",
                });
              }
            }

            // Update metrics
            const currentSim = simRef.current || activeSim;
            const state = currentSim?.getState();
            if (state) {
              session.setEngineState(state);
              // Compute and set derived metrics
              const scenario = getScenario(state.scenario);
              session.setConcessionLines(computeConcessionLines(state, scenario));
              session.setStanceBars(computeStanceBars(state, scenario));
              session.setZopaOverlap(computeZopaOverlap(state, scenario));
              session.setDeadlockRisk(state.deadlock.risk);
              session.setDeadlockStalled(state.deadlock.stalled);
              session.setAgreementLikelihood(computeAgreementLikelihood(state, scenario));
            }
          },
          onUpdate: () => {
            if (isSimMode) return; // Backend handles state updates
            const currentSim = simRef.current || activeSim;
            const state = currentSim?.getState();
            if (state) {
              session.setEngineState(state);
              // Compute and set derived metrics
              const scenario = getScenario(state.scenario);
              session.setConcessionLines(computeConcessionLines(state, scenario));
              session.setStanceBars(computeStanceBars(state, scenario));
              session.setZopaOverlap(computeZopaOverlap(state, scenario));
              session.setDeadlockRisk(state.deadlock.risk);
              session.setDeadlockStalled(state.deadlock.stalled);
              session.setAgreementLikelihood(computeAgreementLikelihood(state, scenario));
            }
          },
          onHumanTurn: (agent: Agent) => {
            if (isSimMode) return; // No human turns in simulation mode
            session.setCurrentSpeaker(agent.id);
            session.updateAgentState(agent.id, { lastDecision: "your-turn" });
            // Focus composer input
            setTimeout(() => {
              const input = document.getElementById("msginput");
              input?.focus();
            }, 60);
          },
          onModal: async () => {
            return "extend";
          },
          onEnd: (status: import('@/engine/types').SessionStatus) => {
            useUIStore.getState().setArenaPlaying(false);
            if (status === "deal") {
              ui.showToast("Deal reached! Opening the outcome report...");
              setTimeout(() => {
                ui.setScreen("outcome");
              }, 2200);
            } else if (status === "breakdown") {
              ui.showToast("No deal. Opening the outcome report...");
              setTimeout(() => {
                ui.setScreen("outcome");
              }, 2200);
            }
          },
          rephrase: async (agent: Agent, info: import('@/engine/types').RephraseInfo) => {
            // Get current state to build the request
            const sim = simRef.current || activeSim;
            const state = sim?.getState();
            if (!state) return null;

            const draft = useConfigStore.getState().draft;
            const scenarioMap: Record<string, 'vendor' | 'job' | 'budget'> = {
              vendor_pricing: 'vendor',
              job_offer: 'job',
              project_budget: 'budget',
            };
            const backendScenario = scenarioMap[draft.scenarioId || 'vendor_pricing'];

            if (!backendScenario) return null;

            // Build transcript for request
            const transcript = state.transcript.map(entry => ({
              speaker: entry.name,
              message: entry.text,
              offer: entry.x || null,
              decision: entry.decision || 'message',
              round: entry.round,
              deal_reached: entry.kind === 'deal',
            }));

            // Build current offer from table
            const currentOffer = state.table?.x || null;

            // Build target, walk_away, weights from agent prefs
            const target: Record<string, number> = {};
            const walk_away: Record<string, number> = {};
            const weights: Record<string, number> = {};
            for (const [issueId, pref] of Object.entries(agent.prefs)) {
              target[issueId] = pref.ideal;
              walk_away[issueId] = pref.reserve;
              weights[issueId] = agent.w[issueId] || pref.w;
            }

            const request: WordingRequest = {
              agent: {
                id: agent.id,
                role: agent.name,
                personality: agent.personality as 'aggressive' | 'collaborative' | 'risk_averse',
                skill: agent.skill,
                wants_higher_price: agent.name.toLowerCase().includes('vendor') || agent.name.toLowerCase().includes('supplier') || agent.name.toLowerCase().includes('seller'),
                target,
                walk_away,
                weights,
              },
              scenario: backendScenario,
              decision: info.decision,
              current_offer: currentOffer,
              transcript,
              round_number: state.round,
              max_rounds: state.maxRounds,
              deal_reached: info.decision === 'accept' && state.table != null &&
                state.agents.filter(a => a.id !== state.table!.by).every(a => state.accepts.includes(a.id)) || undefined,
              approved_terms: info.decision === 'counter' ? info.terms as any : undefined,
            };

            try {
              const response = await getBackendWording(request);
              return response.message;
            } catch {
              // Fallback to template message
              return null;
            }
          },
        });

        await sim.init(engineConfig);
        activeSim = sim;
        simRef.current = sim;

        const initialState = sim.getState();
        if (initialState) {
          session.setEngineState(initialState);
          session.setTranscript([]);
          session.setTableOffer(null);
          session.setCurrentSpeaker(null);
          // Compute initial metrics
          const scenario = getScenario(initialState.scenario);
          session.setConcessionLines(computeConcessionLines(initialState, scenario));
          session.setStanceBars(computeStanceBars(initialState, scenario));
          session.setZopaOverlap(computeZopaOverlap(initialState, scenario));
          session.setDeadlockRisk(initialState.deadlock.risk);
          session.setDeadlockStalled(initialState.deadlock.stalled);
          session.setAgreementLikelihood(computeAgreementLikelihood(initialState, scenario));
          session.setInnerVoiceText(
            isSimMode
              ? 'Negotiation in progress. Notes on each move will appear here.'
              : 'Coaching notes appear here. Press Hint whenever you want one.'
          );
        }



        setIsInitialized(true);
        return sim;

      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to initialize simulation";
        setError(msg);
        ui.showToast(msg);
        throw err;
      }
    },
    [ui, session, buildEngineConfig],
  );

  // Main simulation loop - runs backend negotiation and plays back transcript
const runLoop = useCallback(async (force = false) => {
  const sim = simRef.current;
  const state = sim?.getState();

  if (!state || (state.status !== "running" && !force) || isLoopingRef.current) return;
  if (!force && !useUIStore.getState().arenaPlaying && !session.replayPlaying) return;

  isLoopingRef.current = true;

  try {
    const draft = useConfigStore.getState().draft;

    // Build backend config from engine config
    const engineConfig = useConfigStore.getState().buildEngineConfig(draft);
    if (!engineConfig) {
      throw new Error("Invalid configuration");
    }

    // Map UI scenario ID to backend canonical ID
    let backendScenario: 'vendor' | 'job' | 'budget';
    if (engineConfig.scenario === 'vendor' || engineConfig.scenario === 'job' || engineConfig.scenario === 'budget') {
      backendScenario = engineConfig.scenario;
    } else {
      backendScenario = mapUIScenarioToBackend(
        engineConfig.scenario as 'vendor_pricing' | 'job_offer' | 'project_budget'
      );
    }

    const backendConfig = buildBackendScenarioConfig({
      ...engineConfig,
      scenario: backendScenario,
    });

    ui.setArenaPlaying(true);
    ui.setArenaPaused(false);

    // Run full negotiation on backend
    const backendResult = await runBackendScenarioNegotiation(
      backendScenario,
      backendConfig
    );

    // Play back the transcript progressively
    const update = adaptBackendResult(backendResult, state, engineConfig.agents);
    // Base state carries the UI scenario id; getScenario needs the canonical id
    update.state.scenario = backendScenario;
    await playBackendTranscript(
      update,
      engineConfig.agents,
      session,
      ui
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Backend negotiation failed";
    ui.showToast(msg);
    console.error(err);
  } finally {
    isLoopingRef.current = false;
    useUIStore.getState().setArenaPlaying(false);
  }
}, [session, ui, isInitialized]);

  // Toggle play/pause
  const togglePlay = useCallback(
    async (force?: boolean) => {
      const sim = simRef.current || activeSim;
      const state = sim?.getState();
      const draft = useConfigStore.getState().draft;

      // If status is idle, we need to start the negotiation
      if (state && state.status === "idle") {
        // Set status to running first
        session.setEngineState({ ...state, status: "running" });

        // For simulation mode, run backend negotiation
        if (draft.mode === 'simulation') {
          runLoop(true);
          return;
        }

        // For practice mode, start local simulation loop
        ui.setArenaPlaying(true);
        ui.setArenaPaused(false);
        runLoop(true);
        return;
      }

      // Normal toggle play/pause for running state
      if (!state || state.status !== "running") {
        ui.showToast("Session finished, open the outcome report.");
        return;
      }
      const playing = force === true ? true : !ui.arenaPlaying;
      ui.setArenaPlaying(playing);
      ui.setArenaPaused(false);
      if (playing) runLoop(true);
    },
    [ui, runLoop, session],
  );

  // Play back backend transcript progressively (turn by turn)
  const playBackendTranscript = useCallback(
    async (
      update: BackendArenaUpdate,
      participants: Agent[],
      sessionStore: typeof session,
      uiStore: typeof ui
    ) => {
      // Start with empty transcript and initial state
      sessionStore.setEngineState({
        ...update.state,
        transcript: [],
        offers: [],
        accepts: [],
        table: null,
      });
      sessionStore.setTranscript([]);
      sessionStore.setTableOffer(null);
      sessionStore.setCurrentSpeaker(null);

      uiStore.setArenaPlaying(true);
      uiStore.setArenaPaused(false);

      // Play each transcript entry with delay
      for (let i = 0; i < update.transcript.length; i++) {
        const entry = update.transcript[i];

        // Check if paused (read live store state — captured snapshot goes stale)
        const liveUI = useUIStore.getState();
        if (liveUI.arenaPaused) {
          await new Promise((resolve) => {
            const checkPaused = setInterval(() => {
              if (!useUIStore.getState().arenaPaused) {
                clearInterval(checkPaused);
                resolve(true);
              }
            }, 100);
          });
        }

        // Check if stopped
        if (!useUIStore.getState().arenaPlaying) return;

        // Append this entry
        sessionStore.appendTranscript(entry);
        sessionStore.setCurrentSpeaker(entry.by);

        // Visual reaction: speaking bubble + .speaking class (matches local engine onTurn)
        if (entry.by !== "orchestrator") {
          const seatEl = document.getElementById(`seat-${entry.by}`);
          const bubble = seatEl?.querySelector('.bubble');
          if (seatEl && bubble) {
            document.querySelectorAll('.seat').forEach((s) => s.classList.remove('speaking', 'waiting'));
            seatEl.classList.add('speaking');
            bubble.className = 'bubble show';
            bubble.textContent = entry.text && entry.text.length > 120 ? entry.text.slice(0, 117) + '…' : (entry.text || '');
            const speed = useUIStore.getState().simulationSpeed;
            setTimeout(() => {
              bubble.classList.remove('show');
              seatEl.classList.remove('speaking');
            }, 2600 / Math.min(2, speed || 1));
          }
        }

        // Update table offer if this entry has one
        if (entry.x) {
          sessionStore.setTableOffer({
            by: entry.by,
            x: entry.x,
            round: entry.round,
            turn: entry.turn,
          });
        }

        // Update agent states
        const agent = participants.find((a) => a.id === entry.by);
        if (agent) {
          sessionStore.updateAgentState(agent.id, {
            lastDecision: entry.decision || "message",
            currentTone: entry.tone || "neutral",
          });
        }

        // Update engine state progressively
        let currentState;
        if (i === update.transcript.length - 1) {
          // Last entry - set final state
          currentState = update.state;
          sessionStore.setEngineState(currentState);
          sessionStore.setTableOffer(update.tableOffer);
        } else {
          // Intermediate state — recompute accepts and emo progressively
          const slice = update.transcript.slice(0, i + 1);
          const latestByParty = new Map<string, TranscriptEntry>();
          for (const e of slice) latestByParty.set(e.by, e);
          const latestTableOffer = update.tableOffer;
          const accepts = latestTableOffer
            ? participants
              .filter((p) => p.id !== latestTableOffer.by)
              .filter((p) => latestByParty.get(p.id)?.decision === 'accept')
              .map((p) => p.id)
            : [];

          // Build emo per agent from their last seen utility (backend returns uSelf per turn)
          const emo: Record<string, { v: number; a: number; hist: number[]; ahist: number[] }> = {};
          participants.forEach((p) => {
            const lastSelf = slice.filter((e) => e.by === p.id).pop();
            const u = lastSelf?.uSelf ?? 0.45;
            const v = clamp((u - 0.45) / 0.55 * 1.2 - 0.45, -1, 1) * 0.8;
            const a = clamp(0.3 + Math.abs(u - 0.45) * 0.9, 0, 1);
            const hv = clamp(r2(v), -1, 1);
            emo[p.id] = { v, a, hist: [hv], ahist: [r2(a)] };
          });

          currentState = {
            ...update.state,
            transcript: slice,
            offers: update.state.offers.slice(0, i + 1),
            turnCount: i + 1,
            accepts,
            emo,
          };
          sessionStore.setEngineState(currentState);
        }

        // Compute and set derived metrics for current state
        const scenario = getScenario(update.state.scenario);
        sessionStore.setConcessionLines(computeConcessionLines(currentState, scenario));
        sessionStore.setStanceBars(computeStanceBars(currentState, scenario));
        sessionStore.setZopaOverlap(computeZopaOverlap(currentState, scenario));
        sessionStore.setDeadlockRisk(currentState.deadlock.risk);
        sessionStore.setDeadlockStalled(currentState.deadlock.stalled);
        sessionStore.setAgreementLikelihood(computeAgreementLikelihood(currentState, scenario));

        // Delay based on simulation speed
        const speed = uiStore.simulationSpeed;
        const delay = speed > 0 ? 800 / speed : 400;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // Negotiation complete
      uiStore.setArenaPlaying(false);
      uiStore.setArenaPaused(false);
    },
    [session, ui]
  );

  const stepOnce = useCallback(async () => {
    const sim = simRef.current || activeSim;
    const state = sim?.getState();
    const draft = useConfigStore.getState().draft;

    // If status is idle, start the negotiation first
    if (state && state.status === "idle") {
      session.setEngineState({ ...state, status: "running" });

      // For simulation mode, run backend negotiation (single step plays one transcript entry)
      if (draft.mode === 'simulation') {
        runLoop(true);
        return;
      }

      // For practice mode, use local engine
      ui.setArenaPlaying(true);
      ui.setArenaPaused(false);
      runLoop(true);
      return;
    }

    if (!state || state.status !== "running") return;
    useUIStore.getState().setArenaPlaying(false);
    useUIStore.getState().setArenaPaused(false);
    if (!sim) return;
    await sim.step();
    session.setEngineState(sim.getState());
  }, [session, ui, runLoop]);

  const togglePause = useCallback(() => {
    const sim = simRef.current || activeSim;
    if (
      !sim?.getState() ||
      sim.getState()?.status !== "running"
    )
      return;
    const paused = !useUIStore.getState().arenaPaused;
    useUIStore.getState().setArenaPaused(paused);
    useUIStore.getState().setArenaPlaying(false);
    ui.showToast(paused ? "Paused, the turn timer is frozen." : "Resumed.");
  }, [ui]);

  const handleSend = useCallback(
    async (text: string, x?: Record<string, number>) => {
      const sim = simRef.current || activeSim;
      if (!sim) return { err: "Not initialized" };

      // Classify tone if text provided
      let toneResult: ToneResult = {
        label: "neutral",
        p: { warm: 0, firm: 0, wary: 0, pushy: 0, neutral: 1 },
      };
      if (text) {
        const { toneModel } = await import("@/engine/tone-classifier");
        toneResult = toneModel.classify(text);
      }

      const result = sim.humanAct({ type: x ? "offer" : "message", text, x });
      session.setEngineState(sim.getState());
      return { ...result, tone: toneResult };
    },
    [session],
  );

  const acceptOffer = useCallback(
    async (text?: string) => {
      const sim = simRef.current || activeSim;
      if (!sim) return { err: "Not initialized" };
      const result = sim.humanAct({ type: "accept", text });
      session.setEngineState(sim.getState());
      return result;
    },
    [session],
  );

  const walkAway = useCallback(
    async (text?: string) => {
      const sim = simRef.current || activeSim;
      if (!sim) return { err: "Not initialized" };
      const result = sim.humanAct({ type: "walk", text });
      session.setEngineState(sim.getState());
      return result;
    },
    [session],
  );

  const suggestConcession = useCallback(() => {
    const sim = simRef.current || activeSim;
    if (!sim) return null;
    const x = sim.suggestConcession();
    return x;
  }, []);

  const getCoachHints = useCallback(() => {
    const sim = simRef.current || activeSim;
    if (!sim) return [];
    return sim.coach();
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      simRef.current = null;
      setIsInitialized(false);
    };
  }, []);

  return {
    isInitialized,
    error,
    initialize,
    togglePlay,
    stepOnce,
    togglePause,
    sendMessage: handleSend,
    acceptOffer,
    walkAway,
    suggestConcession,
    getCoachHints,
    runLoop,
  };
}
