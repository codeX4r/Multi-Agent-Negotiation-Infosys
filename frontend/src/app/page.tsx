'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { HomeScreen } from '@/features/home/HomeScreen';
import { ModeScreen } from '@/features/mode/ModeScreen';
import { ScenarioScreen } from '@/features/scenario/ScenarioScreen';
import { SetupScreen } from '@/features/setup/SetupScreen';
import { BriefingScreen } from '@/features/briefing/BriefingScreen';
import { ArenaScreen } from '@/features/arena/ArenaScreen';
import { OutcomeScreen } from '@/features/outcome/OutcomeScreen';
import { ReplayScreen } from '@/features/replay/ReplayScreen';

export default function Page() {
  const { currentScreen, renderStepper } = useUIStore();

  // Initialize stepper on mount
  useEffect(() => {
    renderStepper?.();
  }, [renderStepper]);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home': return <HomeScreen />;
      case 'mode': return <ModeScreen />;
      case 'scenario': return <ScenarioScreen />;
      case 'setup': return <SetupScreen />;
      case 'briefing': return <BriefingScreen />;
      case 'arena': return <ArenaScreen />;
      case 'outcome': return <OutcomeScreen />;
      case 'replay': return <ReplayScreen />;
      default: return <HomeScreen />;
    }
  };

  return renderScreen();
}