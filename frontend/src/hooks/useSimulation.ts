"use client";

import { useEffect, useRef, useCallback, useState } from "react";
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
import { useShallow } from 'zustand/react/shallow';

export function useSimulation() {
  const simRef = useRef<Simulation | null>(null);
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
        simRef.current = sim;

        // Convert config draft to SessionDraft for buildEngineConfig
        const configDraft = config;
        const sessionDraft: SessionDraft = {
          scenarioId: configDraft.scenarioId!,
          mode: configDraft.mode!,
          seats: configDraft.seats,
          human: configDraft.human,
          climate: configDraft.climate,
          eventFreq: configDraft.eventFreq,
          rounds: configDraft.rounds,
          deadlockN: configDraft.deadlockN,
          backdrop: configDraft.backdrop,
          roles: configDraft.roles,
          autonomy: configDraft.autonomy,
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
            // Small delay for thinking animation
            await new Promise((r) => setTimeout(r, 300 / ui.simulationSpeed));
          },
          onTurn: (entry: TranscriptEntry) => {
            session.appendTranscript(entry);

            // Update current speaker
            if (entry.by !== "orchestrator") {
              session.setCurrentSpeaker(entry.by);
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
              const agent = simRef.current
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
            const state = simRef.current?.getState();
            if (state) {
              session.setEngineState(state);
            }
          },
          onUpdate: () => {
            const state = simRef.current?.getState();
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
            // This will be handled by UI modals
            return "extend";
          },
          onEnd: (status: "deal" | "breakdown" | "running") => {
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

        const initialState = sim.getState();

        if (initialState) {
          session.setEngineState(initialState);
          session.setTranscript(initialState.transcript || []);
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
    [ui, session, config, buildEngineConfig],
  );

  // Main simulation loop
  const runLoop = useCallback(async (force=false) => {
    const sim = simRef.current;
    if (!sim || !isInitialized) return;

    let loopCount = 0;
    const maxLoops = 100; // Safety limit

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

      if (ui.arenaPaused) {
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }

      if (!force && !ui.arenaPlaying && !session.replayPlaying) break;

      const result = await sim.step();
      session.setEngineState(sim.getState());

      if (!result) break;

      // Delay between steps
      const delay = ui.simulationSpeed > 0 ? 260 / ui.simulationSpeed : 120;
      await new Promise((r) => setTimeout(r, delay));

      loopCount++;
    }
  }, [
    isInitialized,
    ui.arenaPaused,
    ui.arenaPlaying,
    ui.simulationSpeed,
    session,
  ]);

  // Toggle play/pause
  const togglePlay = useCallback(
    (force?: boolean) => {
      const sim = simRef.current;
      const state = sim?.getState();
      if (!state || state.status !== "running") {
        ui.showToast("Session finished, open the outcome report.");
        return;
      }
      const playing = force === true ? true : !ui.arenaPlaying;
      ui.setArenaPlaying(playing);
      ui.setArenaPaused(false);
      if (playing) runLoop(true);
    },
    [ui, runLoop],
  );

  const stepOnce = useCallback(async () => {
    const sim = simRef.current;
    const state = sim?.getState();
    if (!state || state.status !== "running") return;
    ui.setArenaPlaying(false);
    ui.setArenaPaused(false);
    if (!sim) return;
    await sim.step();
    session.setEngineState(sim.getState());
  }, [ui, session]);

  const togglePause = useCallback(() => {
    if (
      !simRef.current?.getState() ||
      simRef.current?.getState()?.status !== "running"
    )
      return;
    const paused = !ui.arenaPaused;
    ui.setArenaPaused(paused);
    ui.setArenaPlaying(false);
    ui.showToast(paused ? "Paused, the turn timer is frozen." : "Resumed.");
  }, [ui]);

  const handleSend = useCallback(
    async (text: string, x?: Record<string, number>) => {
      const sim = simRef.current;
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
      const sim = simRef.current;
      if (!sim) return { err: "Not initialized" };
      const result = sim.humanAct({ type: "accept", text });
      session.setEngineState(sim.getState());
      return result;
    },
    [session],
  );

  const walkAway = useCallback(
    async (text?: string) => {
      const sim = simRef.current;
      if (!sim) return { err: "Not initialized" };
      const result = sim.humanAct({ type: "walk", text });
      session.setEngineState(sim.getState());
      return result;
    },
    [session],
  );

  const suggestConcession = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return null;
    const x = sim.suggestConcession();
    return x;
  }, []);

  const getCoachHints = useCallback(() => {
    const sim = simRef.current;
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
