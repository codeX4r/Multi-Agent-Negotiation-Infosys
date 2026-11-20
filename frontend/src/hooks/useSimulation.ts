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
} from "@/engine/types";
import { useUIStore } from "@/stores/ui-store";
import { useConfigStore } from "@/stores/config-store";
import { useSessionStore } from "@/stores/session-store";

let activeSim: Simulation | null = null;

export function useSimulation() {
  const simRef = useRef<Simulation | null>(activeSim);
  const isLoopingRef = useRef(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store selectors (using useShallow to prevent infinite loops)
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
      appendTranscript: s.appendTranscript,
      setTranscript: s.setTranscript,
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

        // Set up hooks
        sim.setHooks({
          onThinking: async (agent: Agent) => {
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
            }
          },
          onUpdate: () => {
            const currentSim = simRef.current || activeSim;
            const state = currentSim?.getState();
            if (state) {
              session.setEngineState(state);
            }
          },
          onHumanTurn: (agent: Agent) => {
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
          onEnd: (status: "deal" | "breakdown" | "running") => {
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
          rephrase: undefined,
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
          session.setInnerVoiceText(
            engineConfig.mode === 'simulation'
              ? 'Press Play or the space bar to start. Notes on each move will appear here.'
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

  // Main simulation loop
  const runLoop = useCallback(async () => {
    const sim = simRef.current || activeSim;
    if (!sim || !sim.getState()) return;
    if (isLoopingRef.current) return;
    isLoopingRef.current = true;

    try {
      let loopCount = 0;
      const maxLoops = 200;

      while (loopCount < maxLoops) {
        const state = sim.getState();
        if (
          !state ||
          state.status !== "running" ||
          state.waitingHuman ||
          state.blocked
        ) {
          break;
        }

        const currentUI = useUIStore.getState();
        if (currentUI.arenaPaused) {
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }

        if (!currentUI.arenaPlaying && !useSessionStore.getState().replayPlaying) {
          break;
        }

        const result = await sim.step();
        session.setEngineState(sim.getState());

        if (!result) break;

        // Delay between steps
        const speed = useUIStore.getState().simulationSpeed;
        const delay = speed > 0 ? 260 / speed : 120;
        await new Promise((r) => setTimeout(r, delay));

        loopCount++;
      }
    } finally {
      isLoopingRef.current = false;
      const finalState = sim.getState();
      if (!finalState || finalState.status !== "running") {
        useUIStore.getState().setArenaPlaying(false);
      }
    }
  }, [session]);

  // Toggle play/pause
  const togglePlay = useCallback(
    (force?: boolean) => {
      const sim = simRef.current || activeSim;
      const state = sim?.getState();
      if (!state || state.status !== "running") {
        ui.showToast("Session finished, open the outcome report.");
        return;
      }
      const currentlyPlaying = useUIStore.getState().arenaPlaying;
      const playing = force === true ? true : !currentlyPlaying;
      useUIStore.getState().setArenaPlaying(playing);
      useUIStore.getState().setArenaPaused(false);
      if (playing) {
        runLoop();
      }
    },
    [ui, runLoop],
  );

  const stepOnce = useCallback(async () => {
    const sim = simRef.current || activeSim;
    const state = sim?.getState();
    if (!state || state.status !== "running") return;
    useUIStore.getState().setArenaPlaying(false);
    useUIStore.getState().setArenaPaused(false);
    if (!sim) return;
    await sim.step();
    session.setEngineState(sim.getState());
  }, [session]);

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
