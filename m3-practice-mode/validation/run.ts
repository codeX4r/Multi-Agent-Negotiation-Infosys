/**
 * Validates practice mode across all three scenarios (Milestone 3.4).
 *
 *   npx tsx validation/run.ts              # default 20 games per style
 *   npx tsx validation/run.ts --games 50   # more games
 *
 * Every scenario x human seat x player style is played many times with fixed seeds,
 * once on the current engine (checks only) and once with the kit attached.
 * Writes reports/validation-report.md and reports/validation-report.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { utility } from '../core/engine';
import { installSeed } from '../core/rng';
import { createPracticeSession } from '../core/session';
import { getPack } from '../packs';
import { decide, PLAYERS } from './players';

type Mode = 'before' | 'after';
const SCENARIOS = (process.env.ONLY ? [process.env.ONLY] : ['vendor', 'job', 'budget']) as readonly ('vendor' | 'job' | 'budget')[];
import { HARD, LABEL, THRESHOLD, ORDER } from './criteria';
export { THRESHOLD, ORDER };

interface Tally { pass: number; total: number; example?: string }
type Results = Record<Mode, Record<string, Record<string, Tally>>>;

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
}

export async function validate(games = 20, log = true) {
  const res: Results = { before: {}, after: {} };
  const sessions: Record<Mode, Record<string, { deals: number; total: number; stuck: number; rounds: number }>> = { before: {}, after: {} };
  const t0 = Date.now();
  let seed = 1;
  for (const sc of SCENARIOS) {
    const pack = getPack(sc)!;
    for (const mode of ['before', 'after'] as Mode[]) {
      res[mode][sc] = {};
      sessions[mode][sc] = { deals: 0, total: 0, stuck: 0, rounds: 0 };
      const add = (id: string, pass: boolean, example?: string) => {
        const t = (res[mode][sc][id] ||= { pass: 0, total: 0 });
        t.total++; if (pass) t.pass++; else if (!t.example && example) t.example = example;
      };
      seed = 1000 * (SCENARIOS.indexOf(sc) + 1);
      for (const seat of pack.seats) for (const player of PLAYERS) for (let g = 0; g < games; g++) {
        const restore = installSeed(++seed);
        try {
          const s = await createPracticeSession({ scenario: sc, seat, kit: mode === 'after' });
          let n = 0, stuckTurns = 0, attempts = 0, iter = 0;
          await s.runAI();
          while (s.state().status === 'running' && n < 40 && iter++ < 150) {
            if (!s.sim.isHumanTurn()) { await s.runAI(); if (!s.sim.isHumanTurn()) break; }
            const me = s.human();
            const a = decide(player, { S: s.state(), scenario: s.scenario, pack, me, n });
            const turnBefore = s.state().turnCount;
            s.act(a);
            if (s.state().turnCount === turnBefore && s.state().status === 'running') {
              // the engine ignored the move (dropped offer): a real user would be stuck here
              stuckTurns++; attempts++;
              if (attempts >= 2) { s.act({ type: 'message', text: 'Let me think about it.' }); attempts = 0; }
              continue;
            }
            attempts = 0; n++;
            await s.runAI();
          }
          for (const r of s.kit.reports) for (const c of r.checks) add(c.id, c.pass, `${seat}/${player.id}: ${c.detail}`);
          add('no_stall', stuckTurns === 0, `${seat}/${player.id}: ${stuckTurns} turn(s) where the move was ignored`);
          const S = s.state();
          const ss = sessions[mode][sc];
          ss.total++; ss.rounds += S.round; if (S.status === 'deal') ss.deals++; if (stuckTurns) ss.stuck++;
          if (['fair', 'polite', 'typer'].includes(player.id)) {
            add('deal_reachable', S.status === 'deal', `${seat}/${player.id}: ${S.status} (${S.endReason})`);
          }
          void utility;
        } finally { restore(); }
      }
      if (log) process.stdout.write(`  ${sc} ${mode === 'before' ? 'current engine' : 'with kit      '} done (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
    }
  }
  return { res, sessions, games, seconds: (Date.now() - t0) / 1000 };
}

const C = process.env.NO_COLOR ? { g: '', r: '', y: '', d: '', b: '', x: '' }
  : { g: '\x1b[92m', r: '\x1b[91m', y: '\x1b[93m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };

export function verdict(t: Tally | undefined, id: string) {
  if (!t || !t.total) return { rate: null as number | null, ok: true, text: 'n/a' };
  const rate = t.pass / t.total;
  return { rate, ok: rate >= THRESHOLD[id], text: `${(rate * 100).toFixed(rate === 1 ? 0 : 1)}%` };
}

function printTable(out: Awaited<ReturnType<typeof validate>>) {
  const { res, sessions } = out;
  const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
  console.log(`\n${C.b}${pad('Check', 34)}${SCENARIOS.map(s => pad(`${s}: before -> after`, 26)).join('')}${C.x}`);
  for (const id of ORDER) {
    let line = pad(`${LABEL[id]}${HARD.has(id) ? ' *' : ''}`, 34);
    for (const sc of SCENARIOS) {
      const b = verdict(res.before[sc][id], id), a = verdict(res.after[sc][id], id);
      const col = (v: typeof b) => v.rate == null ? C.d + pad('n/a', 8) + C.x : (v.ok ? C.g : C.r) + pad(v.text, 8) + C.x;
      line += col(b) + ' -> ' + col(a) + '      ';
    }
    console.log(line);
  }
  console.log(`${C.d}* hard rule: must hold every time. Others must reach their threshold (e.g. reciprocity 80%).${C.x}`);
  for (const sc of SCENARIOS) {
    const b = sessions.before[sc], a = sessions.after[sc];
    console.log(`${C.b}${pad(sc, 8)}${C.x} deals ${b.deals}/${b.total} -> ${a.deals}/${a.total}   sessions with ignored moves ${b.stuck} -> ${a.stuck}   avg rounds ${(b.rounds / b.total).toFixed(1)} -> ${(a.rounds / a.total).toFixed(1)}`);
  }
}

function writeReport(out: Awaited<ReturnType<typeof validate>>) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, '..', 'reports');
  mkdirSync(dir, { recursive: true });
  const { res, sessions, games } = out;
  const md: string[] = [
    '# Practice mode validation report (Milestone 3.4)', '',
    `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. ${games} games per player style, 7 styles, 2 human seats per scenario, fixed seeds.`,
    '"Before" is the current practice engine with read-only checks. "After" is the same engine, same seeds, with the practice kit attached.', '',
    `| Check | Threshold | ${SCENARIOS.map(s => `${s} before | ${s} after`).join(' | ')} |`,
    `|---|---|${SCENARIOS.map(() => '---|---').join('|')}|`,
  ];
  for (const id of ORDER) {
    md.push(`| ${LABEL[id]}${HARD.has(id) ? ' (hard)' : ''} | ${(THRESHOLD[id] * 100).toFixed(0)}% | ` +
      SCENARIOS.map(sc => {
        const b = verdict(res.before[sc][id], id), a = verdict(res.after[sc][id], id);
        const f = (v: typeof b) => v.rate == null ? 'n/a' : `${v.ok ? '✅' : '❌'} ${v.text}`;
        return `${f(b)} | ${f(a)}`;
      }).join(' | ') + ' |');
  }
  md.push('', '| Scenario | Deals before | Deals after | Sessions with ignored moves (before -> after) | Avg rounds (before -> after) |', '|---|---|---|---|---|');
  for (const sc of SCENARIOS) {
    const b = sessions.before[sc], a = sessions.after[sc];
    md.push(`| ${sc} | ${b.deals}/${b.total} | ${a.deals}/${a.total} | ${b.stuck} -> ${a.stuck} | ${(b.rounds / b.total).toFixed(1)} -> ${(a.rounds / a.total).toFixed(1)} |`);
  }
  md.push('', '## Example failures', '');
  for (const mode of ['before', 'after'] as Mode[]) for (const sc of SCENARIOS) for (const id of ORDER) {
    const t = res[mode][sc][id]; const v = verdict(t, id);
    if (t && !v.ok && t.example) md.push(`- **${mode} / ${sc} / ${LABEL[id]}**: ${t.example}`);
  }
  writeFileSync(join(dir, 'validation-report.md'), md.join('\n') + '\n');
  writeFileSync(join(dir, 'validation-report.json'), JSON.stringify(out, null, 1));
  return join(dir, 'validation-report.md');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const games = arg('games', 20);
  console.log(`${C.b}Practice mode validation${C.x}: 3 scenarios x 2 seats x ${PLAYERS.length} player styles x ${games} games, before and after the kit`);
  validate(games).then(out => {
    printTable(out);
    console.log(`\nReport: ${writeReport(out)}  (${out.seconds.toFixed(0)}s)`);
  });
}
