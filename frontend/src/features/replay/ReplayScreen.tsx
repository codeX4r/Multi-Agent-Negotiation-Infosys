'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { useSessionStore } from '@/stores/session-store';
import { useConfigStore } from '@/stores/config-store';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { getScenario, fmtVal } from '@/engine/scenarios';
import { PERSONALITIES, CLIMATES, BACKDROPS, SEAT_COLORS } from '@/engine/types';
import { emotionFace, emotionLabel } from '@/engine/agent';
import type { Agent, TranscriptEntry, SimulationState } from '@/engine/types';

export function ReplayScreen() {
  const { setScreen, go, setReplayPerspective } = useUIStore();
  const { engineState, transcript } = useSessionStore();
  const { draft } = useConfigStore();

  const scenario = engineState ? getScenario(engineState.scenario) : null;
  const config = engineState ? { mode: engineState.agents.some(a => a.human) ? 'practice' : 'simulation' } : null;
  const prac = config?.mode === 'practice';
  const maxTurn = engineState?.turnCount || 0;
  const snapshots = (engineState as any)?.snapshots || [];

  const perspectiveOptions: { value: string; label: string }[] = [
    ...(prac && engineState?.agents.find(a => a.human) ? [{ value: 'you', label: 'You' }] : []),
    ...(engineState?.agents.filter(a => !a.human).map(a => ({ value: a.id, label: a.name })) || []),
  ];
  const currentPerspective = 'you';
  const chartRef = useRef<SVGSVGElement>(null);
  const perspectiveAgent = currentPerspective === 'you' ? engineState?.agents.find(a => a.human) : engineState?.agents.find(a => a.id === currentPerspective);
  const them = perspectiveAgent && !perspectiveAgent.human ? perspectiveAgent : null;

  const items = transcript.filter((e) => (e.turn || 0) <= 0);
  const cur = null;
  const snap = snapshots[0] || engineState;
  const mind = them ? [...items].reverse().find(e => e.by === them.id && e.thought) : null;

  const myLines = prac && engineState?.agents.find(a => a.human) ? transcript.filter(e => e.human && e.turn <= 0) : [];
  const worst = myLines.slice().sort((a: any, b: any) => (a.trustDelta || 0) - (b.trustDelta || 0))[0];
  const bestL = myLines.slice().sort((a: any, b: any) => (b.trustDelta || 0) - (a.trustDelta || 0))[0];

  useEffect(() => {
    if (chartRef.current) {
      // drawChart
    }
  }, [0]);

  const handleBack = () => {
    go('outcome');
  };

  const handleExport = () => {
    // export
  };

  const handleSeek = (delta: number) => { /* setReplayTurn */ };
  const handlePlay = () => { /* setReplayPlaying */ };
  const handleFork = () => {
    /* fork logic */
  };

  if (!engineState || !scenario) {
    return (
      <section id="replay" className="screen active">
        <div className="eyebrow">Loading replay...</div>
      </section>
    );
  }

  return (
    <section id="replay" className="screen active">
      <div className="row between">
        <div>
          <div className="eyebrow">Review & learning</div>
          <h1 className="heading">Replay Lab</h1>
          <p className="sub" style={{ margin: 0 }}>
            Scrub the timeline, fork from any turn, or swap perspective to see what the other side was thinking.
          </p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={handleBack}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Outcome
          </button>
          <button className="btn" onClick={handleExport}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M17 10l-5 5 5-5"/></svg> Export
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row between">
          <div className="row">
            <button className="btn sm" onClick={handlePlay}>Play</button>
            <button className="btn sm ghost" onClick={() => handleSeek(-1)}>Prev</button>
            <button className="btn sm ghost" onClick={() => handleSeek(1)}>Next</button>
            <b>Turn 0 / 0</b>
            <span className="mini">Round 0</span>
          </div>
          <div className="row">
            <span className="mini">View as</span>
            <Segmented options={perspectiveOptions} value={currentPerspective} onChange={setReplayPerspective} />
            <button className="btn primary" onClick={handleFork}>Fork here</button>
          </div>
        </div>
        <input type="range" className="scrub" min="0" max={maxTurn} value={0} onChange={(e) => {}} />
        <div className="row mini" style={{ justifyContent: 'space-between' }}>
          {engineState.uHist
            .filter((_: any, i: number) => i % Math.ceil(engineState.uHist.length / 12 || 1) === 0)
            .map((p: any) => <span key={p.turn}>R{p.round}</span>)}
        </div>
      </div>

      <div className="card">
        <h3>Concession timeline</h3>
        <svg id="rpchart" ref={chartRef} viewBox="0 0 420 180" style={{ width: '100%' }} />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Your lines and their impact</h3>
        <p className="mini">No lines from you up to this turn.</p>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Empathy summary</h3>
        <p className="mini">Play a Practice session to see your empathy summary.</p>
        <div className="lbl" style={{ marginTop: 8 }}>Coach hints you might have missed</div>
      </div>
    </section>
  );
}

function drawChart(svg: HTMLCanvasElement, w: number, h: number, upto: number) {
}

function exportReport() {
  // alert('Export functionality to be implemented');
}