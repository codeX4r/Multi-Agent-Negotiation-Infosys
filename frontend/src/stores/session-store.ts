'use client';

import { create } from 'zustand';
import type { SimulationState, TranscriptEntry, Offer, Agent, AgentThought } from '@/engine/types';

interface SessionState {
  // Running simulation state (not persisted)
  engineState: SimulationState | null;
  setEngineState: (state: SimulationState | null) => void;

  // Transcript entries (for rendering)
  transcript: TranscriptEntry[];
  setTranscript: (entries: TranscriptEntry[]) => void;
  appendTranscript: (entry: TranscriptEntry) => void;

  // Current offer on table
  tableOffer: Offer | null;
  setTableOffer: (offer: Offer | null) => void;

  // Metrics data
  concessionLines: Array<{ agentId: string; values: (number | null)[] }>;
  setConcessionLines: (lines: SessionState['concessionLines']) => void;

  stanceBars: Array<{ agentId: string; target: number }>;
  setStanceBars: (bars: SessionState['stanceBars']) => void;

  zopaOverlap: number;
  setZopaOverlap: (val: number) => void;

  deadlockRisk: number;
  setDeadlockRisk: (val: number) => void;
  deadlockStalled: number;
  setDeadlockStalled: (val: number) => void;

  agreementLikelihood: number;
  setAgreementLikelihood: (val: number) => void;

  // Agent states for rendering
  agentStates: Map<string, {
    emotion: { v: number; a: number };
    currentTone: string;
    lastDecision: string | null;
    accepted: boolean;
  }>;
  updateAgentState: (agentId: string, patch: Partial<SessionState['agentStates'] extends Map<string, infer V> ? V : never>) => void;

  // Inner voice / coach
  innerVoiceText: string;
  setInnerVoiceText: (text: string) => void;

  // Current speaker
  currentSpeaker: string | null;
  setCurrentSpeaker: (id: string | null) => void;

  // Replay state
  replayTurn: number;
  setReplayTurn: (turn: number) => void;
  replayPlaying: boolean;
  setReplayPlaying: (playing: boolean) => void;
  replayPerspective: string | null; // agentId or 'you'
  setReplayPerspective: (id: string | null) => void;

  // Fork state
  forkedFrom: number | null;
  setForkedFrom: (turn: number | null) => void;

  // Climate override (UI-driven during session)
  setEngineClimate: (climate: 'stable' | 'volatile' | 'crisis') => void;

  // Reset
  reset: () => void;
}

const defaultState = {
  engineState: null,
  transcript: [],
  tableOffer: null,
  concessionLines: [],
  stanceBars: [],
  zopaOverlap: 0,
  deadlockRisk: 0.2,
  deadlockStalled: 0,
  agreementLikelihood: 0,
  agentStates: new Map(),
  innerVoiceText: 'Waiting for the first move…',
  currentSpeaker: null,
  replayTurn: 0,
  replayPlaying: false,
  replayPerspective: null,
  forkedFrom: null,
};

export const useSessionStore = create<SessionState>((set, get) => ({
  ...defaultState,

  setEngineState: (engineState) => set({ engineState }),

  setTranscript: (transcript) => set({ transcript }),
  appendTranscript: (entry) => set({ transcript: [...get().transcript, entry] }),

  setTableOffer: (tableOffer) => set({ tableOffer }),

  setConcessionLines: (concessionLines) => set({ concessionLines }),
  setStanceBars: (stanceBars) => set({ stanceBars }),
  setZopaOverlap: (zopaOverlap) => set({ zopaOverlap }),
  setDeadlockRisk: (deadlockRisk) => set({ deadlockRisk }),
  setDeadlockStalled: (deadlockStalled) => set({ deadlockStalled }),
  setAgreementLikelihood: (agreementLikelihood) => set({ agreementLikelihood }),

  updateAgentState: (agentId, patch) => {
    const agentStates = new Map(get().agentStates);
    const current = agentStates.get(agentId) || {
      emotion: { v: 0, a: 0 },
      currentTone: 'neutral',
      lastDecision: null,
      accepted: false,
    };
    agentStates.set(agentId, { ...current, ...patch });
    set({ agentStates });
  },

  setInnerVoiceText: (innerVoiceText) => set({ innerVoiceText }),
  setCurrentSpeaker: (currentSpeaker) => set({ currentSpeaker }),

  setReplayTurn: (replayTurn) => set({ replayTurn }),
  setReplayPlaying: (replayPlaying) => set({ replayPlaying }),
  setReplayPerspective: (replayPerspective) => set({ replayPerspective }),

  setForkedFrom: (forkedFrom) => set({ forkedFrom }),

  reset: () => set(defaultState),

  setEngineClimate: (climate) => {
    const s = get().engineState;
    if (!s) return;
    // Keep in sync with CLIMATES pressure values in engine/types.ts
    const pressureMap: Record<string, number> = { stable: 0.12, volatile: 0.32, crisis: 0.55 };
    set({ engineState: { ...s, climate, pressure: pressureMap[climate] ?? s.pressure } });
  },
}));