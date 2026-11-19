'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Agent, Issue, Role, Scenario, Event } from '@/engine/types';

interface ConfigDraft {
  scenarioId: string | null;
  mode: 'simulation' | 'practice' | null;
  seats: string[]; // ordered role IDs
  human: number; // seat index, -1 for simulation
  climate: 'stable' | 'volatile' | 'crisis';
  eventFreq: 0 | 1 | 2 | 3;
  rounds: number;
  deadlockN: number;
  backdrop: string;
  roles: string[]; // orchestrator roles
  autonomy: 0 | 1 | 2 | 3;
  tab: 'builder' | 'seats' | 'env' | 'orch';
  // Custom scenario data
  customIssues: Issue[];
  customRoles: Role[];
  customEvents: Event[];
}

const defaultDraft: ConfigDraft = {
  scenarioId: null,
  mode: null,
  seats: [],
  human: -1,
  climate: 'volatile',
  eventFreq: 2,
  rounds: 12,
  deadlockN: 3,
  backdrop: 'space',
  roles: ['timekeeper', 'mediator', 'enforcer', 'injector', 'auditor'],
  autonomy: 2,
  tab: 'seats',
  customIssues: [],
  customRoles: [],
  customEvents: [],
};

interface ConfigState {
  draft: ConfigDraft;
  // Scenario selection
  setScenario: (id: string) => void;
  setMode: (mode: 'simulation' | 'practice') => void;
  // Seats & Roles
  setSeats: (seats: string[]) => void;
  setHuman: (seat: number) => void;
  swapSeats: (from: number, to: number) => void;
  updateRole: (roleId: string, patch: Partial<Role>) => void;
  // Environment
  setClimate: (climate: ConfigDraft['climate']) => void;
  setEventFreq: (freq: ConfigDraft['eventFreq']) => void;
  setRounds: (rounds: number) => void;
  setDeadlockN: (n: number) => void;
  setBackdrop: (backdrop: string) => void;
  // Orchestrator
  setOrchestratorRoles: (roles: string[]) => void;
  setAutonomy: (level: 0 | 1 | 2 | 3) => void;
  // Builder tab (custom scenarios)
  setCustomIssues: (issues: Issue[]) => void;
  addCustomIssue: (issue: Issue) => void;
  removeCustomIssue: (index: number) => void;
  setCustomRoles: (roles: Role[]) => void;
  setCustomEvents: (events: Event[]) => void;
  // Tab
  setTab: (tab: ConfigDraft['tab']) => void;
  // Reset
  resetToTemplate: (scenario: Scenario) => void;
  validate: () => string | null;
  // Build engine config
  buildEngineConfig: (draft: any) => import('@/engine/types').EngineConfig;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      draft: defaultDraft,

      setScenario: (id) => {
        set((state) => ({
          draft: { ...state.draft, scenarioId: id, tab: 'seats' },
        }));
      },

      setMode: (mode) => {
        set((state) => ({
          draft: {
            ...state.draft,
            mode,
            human: mode === 'practice' ? 0 : -1,
          },
        }));
      },

      setSeats: (seats) => {
        set((state) => ({
          draft: { ...state.draft, seats },
        }));
      },

      setHuman: (seat) => {
        set((state) => ({
          draft: { ...state.draft, human: seat },
        }));
      },

      swapSeats: (from, to) => {
        set((state) => {
          const seats = [...state.draft.seats];
          [seats[from], seats[to]] = [seats[to], seats[from]];
          let human = state.draft.human;
          if (human === from) human = to;
          else if (human === to) human = from;
          return { draft: { ...state.draft, seats, human } };
        });
      },

      updateRole: (roleId, patch) => {
        set((state) => {
          const scenarioId = state.draft.scenarioId;
          // This is used in the builder tab for custom scenarios
          if (state.draft.tab === 'builder') {
            const customRoles = state.draft.customRoles.map((r) =>
              r.id === roleId ? { ...r, ...patch } : r
            );
            return { draft: { ...state.draft, customRoles } };
          }
          return state;
        });
      },

      setClimate: (climate) => {
        const climateRounds = { stable: 14, volatile: 12, crisis: 9 }[climate];
        set((state) => ({
          draft: { ...state.draft, climate, rounds: climateRounds },
        }));
      },

      setEventFreq: (eventFreq) => {
        set((state) => ({ draft: { ...state.draft, eventFreq } }));
      },

      setRounds: (rounds) => {
        set((state) => ({ draft: { ...state.draft, rounds } }));
      },

      setDeadlockN: (deadlockN) => {
        set((state) => ({ draft: { ...state.draft, deadlockN } }));
      },

      setBackdrop: (backdrop) => {
        set((state) => ({ draft: { ...state.draft, backdrop } }));
      },

      setOrchestratorRoles: (roles) => {
        set((state) => ({ draft: { ...state.draft, roles } }));
      },

      setAutonomy: (autonomy) => {
        set((state) => ({ draft: { ...state.draft, autonomy } }));
      },

      setCustomIssues: (customIssues) => {
        set((state) => ({ draft: { ...state.draft, customIssues } }));
      },

      addCustomIssue: (issue) => {
        set((state) => ({
          draft: { ...state.draft, customIssues: [...state.draft.customIssues, issue] },
        }));
      },

      removeCustomIssue: (index) => {
        set((state) => {
          const customIssues = [...state.draft.customIssues];
          customIssues.splice(index, 1);
          return { draft: { ...state.draft, customIssues } };
        });
      },

      setCustomRoles: (customRoles) => {
        set((state) => ({ draft: { ...state.draft, customRoles } }));
      },

      setCustomEvents: (customEvents) => {
        set((state) => ({ draft: { ...state.draft, customEvents } }));
      },

      setTab: (tab) => {
        set((state) => ({ draft: { ...state.draft, tab } }));
      },

      resetToTemplate: (scenario) => {
        const isCustom = scenario.custom;
        set((state) => ({
          draft: {
            ...defaultDraft,
            scenarioId: scenario.id,
            mode: state.draft.mode,
            seats: isCustom ? scenario.roles.map(r => r.id) : scenario.roles.map(r => r.id),
            human: state.draft.mode === 'practice' ? 0 : -1,
            climate: scenario.climate || 'volatile',
            eventFreq: 2,
            rounds: scenario.climate ? (({ stable: 14, volatile: 12, crisis: 9 } as const)[scenario.climate]) : 12,
            deadlockN: 3,
            backdrop: scenario.backdrop,
            roles: ['timekeeper', 'mediator', 'enforcer', 'injector', 'auditor'],
            autonomy: 2,
            tab: isCustom ? 'builder' : 'seats',
            customIssues: isCustom ? scenario.issues : [],
            customRoles: isCustom ? scenario.roles : [],
            customEvents: isCustom ? scenario.events : [],
          },
        }));
      },

      validate: () => {
        const { draft } = get();
        if (!draft.scenarioId) return 'Pick a scenario.';
        if (!draft.mode) return 'Pick a mode first.';
        if (draft.mode === 'practice' && (draft.human < 0 || draft.human >= draft.seats.length)) {
          return 'Choose which seat you play.';
        }
        // Additional validation would require scenario data
        return null;
      },

      buildEngineConfig: (scenario) => {
        const { draft } = get();
        const { buildEngineConfig } = require('@/engine/simulation');
        return buildEngineConfig({
          scenarioId: draft.scenarioId!,
          mode: draft.mode!,
          seats: draft.seats,
          human: draft.human,
          climate: draft.climate,
          eventFreq: draft.eventFreq,
          rounds: draft.rounds,
          deadlockN: draft.deadlockN,
          backdrop: draft.backdrop,
          roles: draft.roles,
          autonomy: draft.autonomy,
          tab: draft.tab,
        });
      },
    }),
    {
      name: 'na.config',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') return localStorage;
        return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
      }),
      partialize: (state) => ({
        draft: {
          scenarioId: state.draft.scenarioId,
          mode: state.draft.mode,
          seats: state.draft.seats,
          human: state.draft.human,
          climate: state.draft.climate,
          eventFreq: state.draft.eventFreq,
          rounds: state.draft.rounds,
          deadlockN: state.draft.deadlockN,
          backdrop: state.draft.backdrop,
          roles: state.draft.roles,
          autonomy: state.draft.autonomy,
          tab: state.draft.tab,
          customIssues: state.draft.customIssues,
          customRoles: state.draft.customRoles,
          customEvents: state.draft.customEvents,
        },
      }),
    }
  )
);