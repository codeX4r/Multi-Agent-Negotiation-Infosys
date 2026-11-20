'use client';

import { useEffect, useRef, useState } from 'react';
import { Brain, Bot, Users, Clock } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useConfigStore } from '@/stores/config-store';
import { useSessionStore } from '@/stores/session-store';
import { getScenario } from '@/engine/scenarios';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SEAT_COLORS } from '@/engine/types';
import { getScenario } from '@/engine/scenarios';

interface SeatDemo {
  n: string;
  c: string;
  x: number;
  y: number;
}

const demoSeats: SeatDemo[] = [
  { n: 'Buyer',   c: SEAT_COLORS[0], x: 50, y: 84 },
  { n: 'Vendor',  c: SEAT_COLORS[1], x: 18, y: 26 },
  { n: 'Finance', c: SEAT_COLORS[2], x: 82, y: 26 },
];

const demoLines = [
  ['Our price is ₹12,00,000 for 30-day delivery.', '😤'],
  ['We could do ₹11.2L if delivery is 22 days?',   '🙂'],
  ['That fits the budget if payment is Net-45.',    '😌'],
  ['₹10.8L, 25 days, 12-month warranty. Deal?',    '😊'],
];

const demoPrices    = [1200000, 1120000, 1120000, 1080000];
const demoDeliveries = [30, 22, 22, 25];

export function HomeScreen() {
  const { setScreen, setAmbientEnabled } = useUIStore();
  const heroTableRef = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);

  /* ── Keep ambient on while on home ── */
  useEffect(() => {
    setAmbientEnabled(true);
  }, [setAmbientEnabled]);

  // Hero table animation (matches HTML prototype: 2300ms bubble, 2700ms turn interval)
  useEffect(() => {
    const container = heroTableRef.current;
    if (!container) return;

    let k = 0;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let nextTimer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const i = k % 3;
      const seatEl = container.querySelector(`#hs${i}`);
      if (!seatEl) return;

      // Remove speaking from all seats
      container.querySelectorAll('.seat').forEach((s) => s.classList.remove('speaking'));
      seatEl.classList.add('speaking');

      // Update speech bubble and emoji face
      const bubble = seatEl.querySelector('.bubble');
      const face = seatEl.querySelector('.face');
      if (bubble && face) {
        bubble.textContent = demoLines[k % 4][0];
        bubble.classList.add('show');
        face.textContent = demoLines[k % 4][1];
      }

      // Update central offer card with bump animation
      const priceEl = container.querySelector('#hp');
      const deliveryEl = container.querySelector('#hd');
      const offerCard = container.querySelector('#herooffer') as HTMLElement | null;
      if (priceEl && deliveryEl && offerCard) {
        priceEl.textContent    = '₹' + demoPrices[k % 4].toLocaleString('en-IN');
        deliveryEl.textContent = demoDeliveries[k % 4] + ' days';
        offerCard.classList.remove('bump');
        void offerCard.offsetWidth;
        offerCard.classList.add('bump');
      }

      // Hide bubble after 2300ms
      hideTimer = setTimeout(() => {
        if (bubble) bubble.classList.remove('show');
      }, 2300);

      // Schedule next turn after 2700ms
      k++;
      nextTimer = setTimeout(tick, 2700);
    };

    // Initial delay of 800ms before first turn
    nextTimer = setTimeout(tick, 800);

    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      if (nextTimer) clearTimeout(nextTimer);
    };
  }, []);

  /* ── Quick Demo ──
     Mirrors the prototype's quickDemo():
       sel = { mode:'simulation', scenario:'vendor' }
       draft = makeDraft('vendor')
       enterArena()
     We build the config from the vendor template, reset session, then
     navigate to 'arena'. The ArenaScreen auto-calls initialize() on mount
     when engineState is null, using the config we just set.
  */
  const quickDemo = () => {
    const ui = useUIStore.getState();
    const config = useConfigStore.getState();

    // Load the complete Vendor Pricing template.
    config.resetToTemplate(getScenario('vendor'));
    config.setMode('simulation');

    ui.setScreen('arena');
  };

  const openSaved = () => {
    useUIStore.getState().openModal(<SavedSessionsModal />, true);
  };

  return (
    <section id="home" className="screen active">
      <div className="hero">
        <div>
          <div className="eyebrow">
            <Brain size={14} style={{ marginRight: 8 }} />
            Negotiation training environment
          </div>
          <h1 className="heading" style={{ fontSize: 40 }}>Enter the arena</h1>
          <p className="sub">
            Set up a table of AI negotiators, each with their own goals, a private walk-away
            point and a personality. Watch them bargain, or take one of the seats yourself.
          </p>
          <div className="actions" style={{ marginTop: 6 }}>
            <Button className="primary" onClick={() => setScreen('mode')}>
              Start new negotiation
            </Button>
            <Button onClick={quickDemo}>Quick demo</Button>
            <Button className="ghost" onClick={openSaved}>
              Saved sessions <span className="pill" id="savedcount">0</span>
            </Button>
          </div>
          <div className="spacer"></div>
          <div className="grid g3">
            <Card className="feat">
              <div>
                <Bot size={26} color="var(--cyan)" />
                <h3>AI vs AI</h3>
                <p className="mini">Watch agents trade, bluff and concede.</p>
              </div>
            </Card>
            <Card className="feat">
              <div>
                <Users size={26} color="var(--cyan)" />
                <h3>Human vs AI</h3>
                <p className="mini">Take a seat; your tone matters.</p>
              </div>
            </Card>
            <Card className="feat">
              <div>
                <Clock size={26} color="var(--cyan)" />
                <h3>Replay Lab</h3>
                <p className="mini">Scrub, fork and see their mind.</p>
              </div>
            </Card>
          </div>
        </div>

        {/* ── Hero table (animated preview — no dummy engine data) ── */}
        <Card className="card herotable" ref={heroTableRef} id="herotable">
          <div className="bigtable"></div>
          <div className="offercard" id="herooffer">
            <div className="hd"><span>OFFER ON TABLE</span><span>LIVE</span></div>
            <div className="tr"><span>Price</span><b id="hp">₹12,00,000</b></div>
            <div className="tr"><span>Delivery</span><b id="hd">30 days</b></div>
          </div>
          {demoSeats.map((d, i) => (
            <div
              key={i}
              className={`seat ${d.y < 40 ? 'top' : ''}`}
              id={`hs${i}`}
              style={{ left: `${d.x}%`, top: `${d.y}%` }}
            >
              <div className="bubble"></div>
              <div className="fig">
                <div className="ring"></div>
                <svg viewBox="0 0 92 96" style={{ width: '100%', height: '100%' }}>
                  <defs>
                    <linearGradient id={`fg${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={d.c} />
                      <stop offset="1" stopColor={d.c + '88'} />
                    </linearGradient>
                  </defs>
                  <rect x="12" y="34" width="68" height="58" rx="16" fill="#0b1426" stroke="#ffffff18" />
                  <path d="M14 94 C14 66 28 54 46 54 C64 54 78 66 78 94 Z" fill={`url(#fg${i})`} />
                  <path d="M38 56 L46 70 L54 56" fill="#ffffff30" />
                  <circle cx="46" cy="24" r="21" fill={d.c} opacity="0.95" />
                  <circle cx="46" cy="24" r="21" fill={`url(#fg${i})`} opacity="0.4" />
                </svg>
                <div className="face">😐</div>
              </div>
              <div className="plate">
                <div className="nm">{d.n}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </section>
  );
}

/* ── Saved Sessions Modal ── */
function SavedSessionsModal() {
  const { closeModal, openModal, showToast } = useUIStore();

  const getSavedSessions = () => {
    try { return JSON.parse(localStorage.getItem('na.sessions') || '[]'); }
    catch { return []; }
  };

  const sessions = getSavedSessions();

  const delSaved = (i: number) => {
    try {
      const L = JSON.parse(localStorage.getItem('na.sessions') || '[]');
      L.splice(i, 1);
      localStorage.setItem('na.sessions', JSON.stringify(L));
      showToast('Session deleted');
      closeModal();
      setTimeout(() => openModal(<SavedSessionsModal />, true), 0);
    } catch { showToast('Could not delete'); }
  };

  const loadSaved = (_i: number) => {
    closeModal();
    showToast('Session restore coming in a future milestone.');
  };

  return (
    <div>
      <h2>Saved sessions</h2>
      <p className="mini">Stored in this browser only.</p>
      <div className="savelist">
        {sessions.length > 0 ? sessions.map((s: any, i: number) => (
          <div key={i} className="sv">
            <div>
              <b>{s.title}</b>
              <div className="mini">
                {new Date(s.at).toLocaleString()},{' '}
                {s.S?.status === 'running'
                  ? 'In progress, round ' + s.S.round
                  : s.S?.status === 'deal' ? 'Deal' : 'No deal'}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Button className="btn sm primary" onClick={() => loadSaved(i)}>
                {s.S?.status === 'running' ? 'Resume' : 'Review'}
              </Button>
              <Button className="btn sm ghost" onClick={() => delSaved(i)}>✕</Button>
            </div>
          </div>
        )) : (
          <div className="note info">No saved sessions yet. Use in the header during a session.</div>
        )}
      </div>
      <div className="actions">
        <Button onClick={closeModal}>Close</Button>
      </div>
    </div>
  );
}
