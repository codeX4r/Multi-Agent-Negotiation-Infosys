'use client';

import { ReactNode } from 'react';
import { ToastContainer } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { AmbientCanvas } from '@/components/ui/AmbientCanvas';
import { useUIStore } from '@/stores/ui-store';

export function Providers({ children }: { children: ReactNode }) {
  const { modal, drawer, reducedMotion, tooltipsEnabled } = useUIStore();

  return (
    <>
      {typeof window !== 'undefined' && (
        <>
          <style jsx global>{`
            body.reduced * {
              animation: none !important;
              transition: none !important;
            }
            body.notips [data-tip]:hover::after {
              display: none;
            }
          `}</style>
        </>
      )}
      <AmbientCanvas />
      <div className="app" style={{
        position: 'relative',
        zIndex: 1,
        maxWidth: '1480px',
        margin: 'auto',
        padding: '18px 22px 40px'
      }}>
        <header className="top">
          <div className="brand" onClick={() => useUIStore.getState().setScreen('home')}>
            <div className="logo">N</div>
            <div>
              <strong>NEGOTIATION ARENA</strong>
              <small>Multi-agent negotiation simulator</small>
            </div>
          </div>
          <div className="stepper" id="stepper"></div>
          <div className="topright">
            <span className="pill live" id="enginepill" data-tip="Local negotiation engine and trained tone model">
              Engine ready
            </span>
            <button className="ibtn" data-tip="Back" onClick={() => useUIStore.getState().go('home')}>←</button>
            <button className="ibtn" data-tip="Help (?)" onClick={() => useUIStore.getState().openModal(<HelpModal />, true)}>?</button>
            <button className="ibtn" data-tip="Settings" onClick={() => useUIStore.getState().openDrawer('settings')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
              </svg>
            </button>
            <button className="ibtn" data-tip="Save and exit" onClick={() => useUIStore.getState().showToast('Save not yet implemented')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <path d="M17 21v-8H7v8M7 3v5h8"/>
              </svg>
            </button>
          </div>
        </header>

        {children}

        <ToastContainer />
      </div>

      <Modal children={null} />
      <Drawer id="settings" children={null} />

      {/* Boot screen */}
      <BootScreen />
    </>
  );
}

function HelpModal() {
  const { closeModal } = useUIStore.getState();

  return (
    <div>
      <h2>? Quick guide</h2>
      <div className="grid g2" style={{ marginTop: 10 }}>
        {[
          ['1', 'Mode', 'Simulation = watch AI vs AI. Practice = you take a seat.'],
          ['2', 'Scenario', '3 templates + Custom. Each has roles, goals, constraints and its own environment.'],
          ['3', 'Table', 'Drag roles onto chairs, click a chair for the full Role Card, tune climate and the Orchestrator.'],
          ['4', 'Briefing', 'Your private goals and walk-away, shown once.'],
          ['5', 'Arena', 'Offers land on the table; trust threads, emotion orbs and metrics update live.'],
          ['6', 'Outcome & Replay', 'Scores, concession timeline, turning points. Scrub, fork, see their mind.'],
        ].map(([n, t, d]) => (
          <div key={n} className="habit">
            <span className="dot" style={{ background: 'var(--blue)', width: 24, height: 24, fontSize: 11 }}>{n}</span>
            <span><b>{t}</b><br/>{d}</span>
          </div>
        ))}
      </div>
      <h3 style={{ marginTop: 14 }}>Reading the table</h3>
      <div className="grid g2">
        <div className="habit"><span></span><span>Face + orb: x = calm→agitated, y = negative→positive. Sparkline = valence over time.</span></div>
        <div className="habit"><span>〰</span><span>Trust threads: thick green = strong, thin dashed red = fraying.</span></div>
        <div className="habit"><span></span><span>Chips: tone (firm / warm / wary / pushy) and decision (countered / accepted / rejected).</span></div>
        <div className="habit"><span></span><span>Concession lines: value of the table offer per party; dashed = BATNA.</span></div>
      </div>
      <h3 style={{ marginTop: 14 }}>Shortcuts</h3>
      <p className="mini"><kbd>Space</kbd> play / pause, <kbd>N</kbd> next turn, <kbd>M</kbd> Mind Reveal, <kbd>Enter</kbd> send, <kbd>Esc</kbd> close, <kbd>?</kbd> help</p>
      <div className="actions"><Button className="primary" onClick={closeModal}>Got it</Button></div>
    </div>
  );
}

function BootScreen() {
  const { currentScreen } = useUIStore.getState();

  if (currentScreen !== 'home') return null;

  // This would show the boot animation on first load
  // Simplified for now
  return null;
}

function Button({ children, className = '', onClick, disabled, ...props }: any) {
  return (
    <button className={`btn ${className}`} onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  );
}