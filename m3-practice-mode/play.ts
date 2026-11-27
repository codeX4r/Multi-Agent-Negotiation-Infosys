/**
 * Play practice mode in the terminal, against the team's real engine.
 *
 *   npx tsx play.ts --scenario budget              # with the kit
 *   npx tsx play.ts --scenario budget --no-kit     # the current engine, to compare
 *   npx tsx play.ts --scenario vendor --seat vendor --seed 7
 *
 * Type normally ("I can do 10.5 lakh with 20 days delivery"), or use:
 *   /offer price=1050000 delivery=20   /accept   /walk   /table   /help   /quit
 */
import * as readline from 'node:readline';
import { fmtVal } from './core/engine';
import { installSeed } from './core/rng';
import { createPracticeSession } from './core/session';
import type { TurnReport } from './core/types';

const C = process.env.NO_COLOR ? { g: '', r: '', y: '', c: '', m: '', d: '', b: '', x: '' }
  : { g: '\x1b[92m', r: '\x1b[91m', y: '\x1b[93m', c: '\x1b[96m', m: '\x1b[95m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };
const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };

(async () => {
  const scenario = (arg('scenario', 'vendor') as 'vendor' | 'job' | 'budget');
  const useKit = !process.argv.includes('--no-kit');
  const seed = Number(arg('seed', String(Date.now() % 100000)));
  installSeed(seed);
  const s = await createPracticeSession({ scenario, seat: arg('seat'), kit: useKit });
  const sc = s.scenario, me = s.human();
  const terms = (x?: Record<string, number>) => x ? sc.issues.map(i => `${i.label} ${fmtVal(i, x[i.id])}`).join(' | ') : '';
  const tick = (r: TurnReport) => r.checks.length
    ? '  ' + r.checks.map(c => `${c.pass ? C.g + '✓' : C.r + '✗'} ${c.label}${C.x}`).join(C.d + '  ·  ' + C.x) : '';
  let shownT = 0, reportsShown = 0;

  const flush = () => {
    const T = s.state().transcript;
    for (; shownT < T.length; shownT++) {
      const e = T[shownT];
      if (e.by === me.id || e.kind === 'round') continue;
      if (e.by === 'orchestrator' || !e.by) { console.log(`${C.d}  [${e.text}]${C.x}`); continue; }
      const col = e.decision === 'accept' ? C.g : e.decision === 'reject' ? C.r : C.y;
      console.log(`\n${C.b}${e.name}${C.x} ${col}${(e.decision || '').toUpperCase()}${C.x}  ${C.d}${e.tone || ''}${C.x}`);
      console.log(`  "${e.text}"`);
      if (e.x) console.log(`  ${C.c}${terms(e.x)}${C.x}`);
      const rep = s.kit.reports.slice(reportsShown).find(r => r.actorId === e.by && r.turn === e.turn);
      if (rep) console.log(tick(rep));
    }
    reportsShown = s.kit.reports.length;
  };

  console.log(`${C.b}PRACTICE MODE · ${sc.name}${C.x}  ${useKit ? C.g + 'with the practice kit' : C.r + 'current engine (no kit)'}${C.x}  ${C.d}seed ${seed}${C.x}`);
  console.log(`You are ${C.b}${me.name}${C.x} (${me.title}). Goal: ${me.goal}`);
  console.log(`${C.d}Your limits: ${sc.issues.filter(i => me.prefs[i.id] && me.w[i.id] > 0.001).map(i => `${i.label} best ${fmtVal(i, me.prefs[i.id].ideal)}, worst ${fmtVal(i, me.prefs[i.id].reserve)}`).join('; ')}${C.x}`);
  console.log(`${C.d}Type a message or an offer in words. /help for commands.${C.x}`);

  await s.runAI(); flush();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const prompt = () => {
    if (s.state().status !== 'running') return end();
    const t = s.state().table;
    if (t) console.log(`\n${C.d}On the table (${t.by === me.id ? 'yours' : s.state().agents.find(a => a.id === t.by)?.name ?? t.by}): ${terms(t.x)}${C.x}`);
    rl.setPrompt(`${C.m}You> ${C.x}`); rl.prompt();
  };
  const end = () => {
    const S = s.state();
    const all = s.kit.reports.flatMap(r => r.checks);
    console.log(`\n${C.b}Session ${S.status === 'deal' ? C.g + 'ended in a DEAL' : C.r + 'ended without a deal'}${C.x} ${S.endReason ? `(${S.endReason})` : ''}`);
    if (S.status === 'deal' && S.table) console.log(`${C.c}${terms(S.table.x)}${C.x}`);
    console.log(`Realism checks: ${C.g}${all.filter(c => c.pass).length} passed${C.x}, ${all.some(c => !c.pass) ? C.r : ''}${all.filter(c => !c.pass).length} failed${C.x}`);
    process.exit(0);
  };

  // lines are handled one at a time, so a fast typist (or piped input) never acts out of turn
  let queue: Promise<void> = Promise.resolve();
  let closed = false;
  rl.on('line', raw => { queue = queue.then(() => handle(raw)).catch(e => console.error(e)); });
  rl.on('close', () => { closed = true; queue.then(() => end()); });
  const handle = async (raw: string) => {
    if (s.state().status !== 'running') return;
    const line = raw.trim();
    if (!line) return prompt();
    let res: any;
    if (line === '/quit') { closed = true; return end(); }
    if (line === '/help') { console.log('Type in words, or: /offer price=1050000 delivery=20 | /accept | /walk | /table | /quit'); return prompt(); }
    if (line === '/table') return prompt();
    if (line === '/accept') res = s.act({ type: 'accept', text: 'I accept these terms.' });
    else if (line === '/walk') res = s.act({ type: 'walk', text: 'We are walking away.' });
    else if (line.startsWith('/offer')) {
      const x: Record<string, number> = { ...(s.state().table?.x ?? {}) };
      for (const kv of line.slice(6).trim().split(/\s+/)) { const [k, v] = kv.split('='); if (k && v) x[k] = Number(v); }
      res = s.act({ type: 'offer', text: 'Here is my proposal.', x });
    } else res = s.act({ type: 'message', text: line });

    if (res?.err) console.log(`${C.r}  Engine: ${res.err}${C.x}`);
    for (const n of res?.kit?.notes ?? []) console.log(`${C.y}  Kit: ${n}${C.x}`);
    if (res?.tone?.label && line[0] !== '/') console.log(`${C.d}  tone: ${res.tone.label} ${Math.round((res.tone.p?.[res.tone.label] ?? 0) * 100)}%${C.x}`);
    const mine = s.kit.reports.slice(reportsShown).filter(r => r.human);
    for (const r of mine) if (r.checks.length) console.log(tick(r));
    reportsShown = s.kit.reports.length;
    shownT = s.state().transcript.length;
    await s.runAI(); flush();
    if (!closed) prompt();
  };
  prompt();
})();
