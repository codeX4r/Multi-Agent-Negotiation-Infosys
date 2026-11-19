'use client';

import { useEffect, useRef } from 'react';
import { useUIStore } from '@/stores/ui-store';

const BACKDROPS: Record<string, { fx: string; accent: string; c1: string; c2: string; table: [string, string] }> = {
  tradefloor: { fx: 'grid', accent: '#6ee7e0', c1: '#0e2a3a', c2: '#07131c', table: ['#1d4a5a', '#0f2a36'] },
  glassoffice: { fx: 'bokeh', accent: '#b69cff', c1: '#2a1f4a', c2: '#0d0b1f', table: ['#3b2f66', '#1d173a'] },
  warroom: { fx: 'radar', accent: '#f4c66a', c1: '#3a1d14', c2: '#120a08', table: ['#4a2a1a', '#24130c'] },
  space: { fx: 'stars', accent: '#7aa7ff', c1: '#1b2b4a', c2: '#050812', table: ['#22345a', '#111b33'] },
  zen: { fx: 'leaves', accent: '#67d6a3', c1: '#123a2c', c2: '#06140f', table: ['#1f4d3b', '#0e2a20'] },
  neon: { fx: 'rain', accent: '#ff7ad9', c1: '#3a0f3e', c2: '#0b0514', table: ['#4a1d55', '#1f0b26'] },
};

export function AmbientCanvas() {
  const { ambientEnabled, reducedMotion } = useUIStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const partsRef = useRef<any[]>([]);
  const fxRef = useRef('stars');
  const accentRef = useRef('#7aa7ff');
  const crisisRef = useRef(false);
  const speedRef = useRef(1);
  const tRef = useRef(0);

  // Initialize ambient
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const init = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const W = canvas.width, H = canvas.height;

      const n = { grid: 50, bokeh: 22, radar: 14, stars: 140, leaves: 34, rain: 120 }[fxRef.current] || 140;
      partsRef.current = Array.from({ length: n }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random(),
        s: Math.random(),
        a: Math.random() * Math.PI * 2,
        life: Math.random()
      }));
    };

    init();
    window.addEventListener('resize', init);
    return () => window.removeEventListener('resize', init);
  }, []);

  // Animation loop
  useEffect(() => {
    if (!ambientEnabled || reducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const frame = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      if (!ambientEnabled || reducedMotion) {
        animationId = requestAnimationFrame(frame);
        return;
      }

      const sp = speedRef.current;
      const A = accentRef.current;
      tRef.current += 0.016 * sp;

      ctx.save();

      if (fxRef.current === 'grid') {
        ctx.strokeStyle = A + '14';
        ctx.lineWidth = 1;
        const off = (tRef.current * 20) % 40;
        for (let x = -40 + off; x < W; x += 40) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H);
          ctx.stroke();
        }
        for (let y = -40 + off; y < H; y += 40) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }
        partsRef.current.forEach(p => {
          p.y -= (0.3 + p.s) * sp;
          if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
          ctx.fillStyle = A + Math.floor(40 + p.r * 80).toString(16);
          ctx.fillRect(p.x, p.y, 2, 6 + p.r * 10);
        });
      }

      if (fxRef.current === 'bokeh') {
        partsRef.current.forEach(p => {
          p.x += Math.cos(p.a) * 0.25 * sp;
          p.y += Math.sin(p.a) * 0.18 * sp;
          if (p.x < -80) p.x = W + 80;
          if (p.x > W + 80) p.x = -80;
          if (p.y < -80) p.y = H + 80;
          if (p.y > H + 80) p.y = -80;
          const r = 20 + p.r * 60;
          const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          const c = p.s > .5 ? '#b69cff' : '#ff9de2';
          gr.addColorStop(0, c + '30');
          gr.addColorStop(1, c + '00');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, 7);
          ctx.fill();
        });
      }

      if (fxRef.current === 'radar') {
        const cx = W * .82, cy = H * .7, R0 = Math.max(W, H) * .6;
        ctx.strokeStyle = A + '18';
        for (let r = 80; r < R0; r += 90) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, 7);
          ctx.stroke();
        }
        const ang = tRef.current * 0.9;
        if (ctx.createConicGradient) {
          const gr = ctx.createConicGradient(ang, cx, cy);
          gr.addColorStop(0, A + '30');
          gr.addColorStop(.08, A + '00');
          gr.addColorStop(1, A + '00');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(cx, cy, R0, 0, 7);
          ctx.fill();
        }
        partsRef.current.forEach(p => {
          p.life += 0.004 * sp;
          if (p.life > 1) { p.life = 0; p.x = cx + (Math.random() - .5) * W; p.y = cy + (Math.random() - .7) * H; }
          ctx.fillStyle = A + Math.floor((1 - p.life) * 200).toString(16).padStart(2, '0');
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, 7);
          ctx.fill();
        });
      }

      if (fxRef.current === 'stars') {
        partsRef.current.forEach(p => {
          const tw = 0.4 + 0.6 * Math.abs(Math.sin(tRef.current * (0.5 + p.s * 2) + p.a));
          ctx.fillStyle = `rgba(220,232,255,${tw * (0.3 + p.r * 0.6)})`;
          ctx.fillRect(p.x, p.y, p.r > .9 ? 2 : 1.2, p.r > .9 ? 2 : 1.2);
          p.x -= 0.03 * sp * (p.r + .2);
          if (p.x < 0) p.x = W;
        });
        const sh = (tRef.current * 0.25) % 1;
        if (sh < 0.25) {
          const x = W * (1 - sh * 4), y = H * 0.15 + sh * 200;
          ctx.strokeStyle = '#ffffffaa';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 70, y - 22);
          ctx.stroke();
        }
      }

      if (fxRef.current === 'leaves') {
        partsRef.current.forEach(p => {
          p.x += (0.3 + p.s * 0.5) * sp;
          p.y += Math.sin(tRef.current + p.a) * 0.4 + 0.25 * sp;
          p.a += 0.01 * sp;
          if (p.x > W + 20) p.x = -20;
          if (p.y > H + 20) p.y = -20;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.a);
          ctx.fillStyle = `rgba(103,214,163,${0.12 + p.r * 0.25})`;
          ctx.beginPath();
          ctx.ellipse(0, 0, 9 + p.r * 8, 3 + p.r * 2, 0, 0, 7);
          ctx.fill();
          ctx.restore();
        });
      }

      if (fxRef.current === 'rain') {
        partsRef.current.forEach(p => {
          p.y += (6 + p.s * 8) * sp;
          p.x -= 1.2 * sp;
          if (p.y > H) { p.y = -20; p.x = Math.random() * W * 1.2; }
          ctx.strokeStyle = (p.r > .5 ? '#ff7ad9' : '#6ee7e0') + Math.floor(30 + p.r * 60).toString(16);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - 3, p.y + 14 + p.r * 10);
          ctx.stroke();
        });
        ctx.fillStyle = '#ff7ad908';
        ctx.fillRect(0, H * .82, W, H * .18);
      }

      if (crisisRef.current) {
        ctx.fillStyle = `rgba(240,80,90,${0.03 + 0.03 * Math.abs(Math.sin(tRef.current * 2.2))})`;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.restore();
      animationId = requestAnimationFrame(frame);
    };

    animationId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationId);
  }, [ambientEnabled, reducedMotion]);

  // Expose methods for external control
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).ambientApi = {
        setBackdrop: (key: string) => {
          const b = BACKDROPS[key] || BACKDROPS.space;
          fxRef.current = b.fx;
          accentRef.current = b.accent;
          // Update CSS variables
          document.documentElement.style.setProperty('--env1', b.c1);
          document.documentElement.style.setProperty('--env2', b.c2);
          document.documentElement.style.setProperty('--accent', b.accent);
          document.documentElement.style.setProperty('--t1', b.table[0]);
          document.documentElement.style.setProperty('--t2', b.table[1]);
        },
        setCrisis: (crisis: boolean) => {
          crisisRef.current = crisis;
        },
        setSpeed: (speed: number) => {
          speedRef.current = speed;
        },
      };
    }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="ambient"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.75
      }}
    />
  );
}