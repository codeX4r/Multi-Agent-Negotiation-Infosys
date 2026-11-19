'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface UIState {
  // Screen navigation
  currentScreen: 'home' | 'mode' | 'scenario' | 'setup' | 'briefing' | 'arena' | 'outcome' | 'replay';
  setScreen: (screen: UIState['currentScreen']) => void;
  go: (screen: UIState['currentScreen']) => void;
  back: () => void;
  confirmHome: () => void;
  screenHistory: string[];
  pushHistory: (screen: string) => void;
  popHistory: () => void;
  renderStepper: () => void; // For stepper component

  // Modals & Drawers
  modal: { isOpen: boolean; content: React.ReactNode; closable: boolean } | null;
  openModal: (content: React.ReactNode, closable?: boolean) => void;
  closeModal: () => void;

  drawer: { isOpen: boolean; id: string } | null;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;

  // Toast notifications
  toasts: Array<{ id: string; message: string; duration?: number }>;
  showToast: (message: string, duration?: number) => void;
  dismissToast: (id: string) => void;

  // Ambient settings (persisted)
  ambientEnabled: boolean;
  setAmbientEnabled: (enabled: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  reducedMotion: boolean;
  setReducedMotion: (enabled: boolean) => void;
  tooltipsEnabled: boolean;
  setTooltipsEnabled: (enabled: boolean) => void;
  confettiEnabled: boolean;
  setConfettiEnabled: (enabled: boolean) => void;

  // Arena specific
  mindReveal: boolean;
  setMindReveal: (enabled: boolean) => void;
  arenaPaused: boolean;
  setArenaPaused: (paused: boolean) => void;
  arenaPlaying: boolean;
  setArenaPlaying: (playing: boolean) => void;
  simulationSpeed: number;
  setSimulationSpeed: (speed: number) => void;

  // Replay specific
  replayPerspective: string;
  setReplayPerspective: (perspective: string) => void;

  // Help
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
}

const defaultState = {
  currentScreen: 'home' as const,
  screenHistory: ['home'],
  modal: null,
  drawer: null,
  toasts: [],
  ambientEnabled: true,
  soundEnabled: true,
  reducedMotion: false,
  tooltipsEnabled: true,
  confettiEnabled: true,
  mindReveal: false,
  arenaPaused: false,
  arenaPlaying: false,
  simulationSpeed: 1,
  helpOpen: false,
  replayPerspective: 'you',
};

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      ...defaultState,

      setScreen: (screen) => {
        const history = get().screenHistory;
        if (history[history.length - 1] !== screen) {
          set({ currentScreen: screen, screenHistory: [...history, screen] });
        } else {
          set({ currentScreen: screen });
        }
      },

      go: (screen) => {
        const history = get().screenHistory;
        if (history[history.length - 1] !== screen) {
          set({ currentScreen: screen, screenHistory: [...history, screen] });
        } else {
          set({ currentScreen: screen });
        }
      },

      back: () => {
        const history = get().screenHistory;
        if (history.length > 1) {
          history.pop();
          const prev = history[history.length - 1] as UIState['currentScreen'];
          set({ screenHistory: history, currentScreen: prev });
        }
      },

      confirmHome: () => {
        get().go('home');
      },

      pushHistory: (screen) => {
        set({ screenHistory: [...get().screenHistory, screen] });
      },

      popHistory: () => {
        const history = get().screenHistory;
        if (history.length > 1) {
          history.pop();
          const prev = history[history.length - 1] as UIState['currentScreen'];
          set({ screenHistory: history, currentScreen: prev });
        }
      },

      openModal: (content, closable = true) => {
        set({ modal: { isOpen: true, content, closable } });
      },

      closeModal: () => {
        set({ modal: null });
      },

      openDrawer: (id) => {
        set({ drawer: { isOpen: true, id } });
      },

      closeDrawer: () => {
        set({ drawer: null });
      },

      showToast: (message, duration = 2600) => {
        const id = Math.random().toString(36).slice(2);
        set({ toasts: [...get().toasts, { id, message, duration }] });
        if (duration > 0) {
          setTimeout(() => get().dismissToast(id), duration);
        }
      },

      dismissToast: (id) => {
        set({ toasts: get().toasts.filter(t => t.id !== id) });
      },

      setAmbientEnabled: (enabled) => set({ ambientEnabled: enabled }),
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setReducedMotion: (enabled) => {
        set({ reducedMotion: enabled });
        if (typeof document !== 'undefined') {
          document.body.classList.toggle('reduced', enabled);
        }
      },
      setTooltipsEnabled: (enabled) => {
        set({ tooltipsEnabled: enabled });
        if (typeof document !== 'undefined') {
          document.body.classList.toggle('notips', !enabled);
        }
      },
      setConfettiEnabled: (enabled) => set({ confettiEnabled: enabled }),

      setMindReveal: (enabled) => set({ mindReveal: enabled }),
      setArenaPaused: (paused) => set({ arenaPaused: paused }),
      setArenaPlaying: (playing) => set({ arenaPlaying: playing }),
      setSimulationSpeed: (speed) => set({ simulationSpeed: speed }),

      setReplayPerspective: (perspective: string) => set({ replayPerspective: perspective }),

      setHelpOpen: (open) => set({ helpOpen: open }),

      renderStepper: () => {
        // This is a placeholder - the actual stepper rendering is done by the Stepper component
      },
    }),
    {
      name: 'na.ui',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') {
          return localStorage;
        }
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      partialize: (state) => ({
        ambientEnabled: state.ambientEnabled,
        soundEnabled: state.soundEnabled,
        reducedMotion: state.reducedMotion,
        tooltipsEnabled: state.tooltipsEnabled,
        confettiEnabled: state.confettiEnabled,
      }),
    }
  )
);