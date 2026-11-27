import { fmtVal, snap, utility, type Issue } from '../core/engine';
import { installSeed } from '../core/rng';
import { createPracticeSession, type PracticeSession } from '../core/session';
import type { Check } from '../core/types';
import { HARD, LABEL, ORDER, THRESHOLD } from '../validation/criteria';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const SEATS: Record<string, [string, string][]> = {
  vendor: [['buyer', 'Buyer'], ['vendor', 'Vendor']],
  job: [['candidate', 'Candidate'], ['recruiter', 'Recruiter']],
  budget: [['eng', 'Engineering head'], ['mkt', 'Marketing head']],
};

let s: PracticeSession | null = null;
let useKit = true, busy = false, shownT = 0, shownR = 0;
const all: { who: string; c: Check }[] = [];

function fillSeats() {
  $<HTMLSelectElement>('seat').innerHTML = SEATS[$<HTMLSelectElement>('scenario').value].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
}
const terms = (x?: Record<string, number>) => x && s ? s.scenario.issues.map(i => `${i.label} ${fmtVal(i, x[i.id])}`).join('  ·  ') : '';
const chips = (cs: Check[]) => cs.length ? `<div class="chips">${cs.map(c =>
  `<span class="chip ${c.pass ? 'p' : 'f'}" title="${esc(c.detail)}">${c.pass ? 'pass' : 'fail'} · ${esc(c.label)}</span>`).join('')}</div>` : '';

function add(html: string) { const log = $('log'); log.insertAdjacentHTML('beforeend', html); log.scrollTop = log.scrollHeight; }

function pullReports(filter: (r: any) => boolean) {
  const reps = s!.kit.reports.slice(shownR).filter(filter);
  return reps.flatMap((r: any) => { r.checks.forEach((c: Check) => all.push({ who: r.actorName, c })); return r.checks; });
}

function flushAI() {
  const S = s!.state(), me = s!.human();
  for (; shownT < S.transcript.length; shownT++) {
    const e: any = S.transcript[shownT];
    if (e.by === me.id || e.kind === 'round') continue;
    if (e.by === 'orchestrator' || !e.by) { add(`<div class="sys">${esc(e.text)}</div>`); continue; }
    const cs = pullReports(r => r.actorId === e.by && r.turn === e.turn);
    add(`<div class="msg"><div class="who"><b>${esc(e.name)}</b>${e.decision ? `<span class="dec ${e.decision}">${esc(e.decision.toUpperCase())}</span>` : ''}<span>${esc(e.tone || '')}</span></div>
      ${esc(e.text)}${e.x ? `<div class="terms">${esc(terms(e.x))}</div>` : ''}${chips(cs)}</div>`);
  }
  shownR = s!.kit.reports.length;
}

function renderChecks() {
  const pass = all.filter(a => a.c.pass).length, fail = all.length - pass;
  $('sPass').textContent = String(pass);
  $('sFail').textContent = String(fail); $('sFail').className = fail ? 'no' : '';
  $('checks').innerHTML = all.slice().reverse().map(({ who, c }) =>
    `<div class="ci ${c.pass ? '' : 'f'}"><span><span class="${c.pass ? 'ok' : 'no'}">${c.pass ? 'Pass' : 'Fail'}</span> ${esc(c.label)}${c.hard ? '<span class="hard">hard</span>' : ''}</span><span class="n">${esc(who)}</span><span class="d">${esc(c.detail)}</span></div>`).join('')
    || '<div class="mut" style="font-size:12.5px">Checks appear after each turn.</div>';
}

function renderSliders() {
  const S = s!.state(), me = s!.human();
  const base = S.table?.x ?? {};
  $('sliders').innerHTML = s!.scenario.issues.filter((i: Issue) => !i.derived).map((i: Issue) => {
    const v = base[i.id] ?? me.prefs[i.id]?.ideal ?? i.min;
    return `<div class="sl">${esc(i.label)} <span class="v" id="v_${i.id}">${esc(fmtVal(i, v))}</span>
      <input type="range" id="r_${i.id}" min="${i.min}" max="${i.max}" step="${i.step}" value="${v}"></div>`;
  }).join('');
  for (const i of s!.scenario.issues.filter((i: Issue) => !i.derived)) {
    const r = $<HTMLInputElement>(`r_${i.id}`);
    r.oninput = () => { $(`v_${i.id}`).textContent = fmtVal(i, snap(i, Number(r.value))); };
  }
}

function renderStatus() {
  const S = s!.state(), me = s!.human();
  const u = S.table ? utility(me, S.table.x, s!.scenario) : null;
  $('status').textContent = S.status === 'running'
    ? `Round ${S.round} of ${S.maxRounds ?? ''}${u != null ? `  ·  table is worth ${(u * 100).toFixed(0)} to you (walk-away ${(me.batnaU * 100).toFixed(0)})` : ''}`
    : S.status === 'deal' ? 'Deal reached' : 'Ended without a deal';
  const done = S.status !== 'running';
  for (const id of ['send', 'offer', 'accept', 'walk', 'text']) ($(id) as HTMLButtonElement).disabled = done || busy;
  if (done) add(`<div class="sys">${esc(S.status === 'deal' ? 'Deal: ' + terms(S.table?.x) : 'Session over' + (S.endReason ? ': ' + S.endReason : ''))}</div>`);
}

async function start() {
  busy = true;
  const seed = Number($<HTMLInputElement>('seed').value) || 1;
  installSeed(seed);
  all.length = 0; shownT = 0; shownR = 0; $('log').innerHTML = '';
  s = await createPracticeSession({ scenario: $<HTMLSelectElement>('scenario').value as any, seat: $<HTMLSelectElement>('seat').value, kit: useKit });
  const me = s.human(), sc = s.scenario;
  $('title').innerHTML = `${esc(sc.name)} <span class="mut">· ${useKit ? '<span class="ok">with the kit</span>' : '<span class="no">current engine</span>'} · seed ${seed}</span>`;
  $('me').innerHTML = `<b>You are ${esc(me.name)}</b>${esc(me.title || '')}<div style="margin-top:6px">${esc(me.goal || '')}</div>
    <div class="lim">${sc.issues.filter(i => me.prefs[i.id] && me.w[i.id] > 0.001).map(i => `${esc(i.label)}: best ${esc(fmtVal(i, me.prefs[i.id].ideal))}, worst ${esc(fmtVal(i, me.prefs[i.id].reserve))}`).join('<br>')}</div>`;
  await s.runAI(); flushAI(); busy = false;
  renderSliders(); renderChecks(); renderStatus();
}

async function act(a: { type: 'offer' | 'accept' | 'message' | 'walk'; text?: string; x?: Record<string, number> }) {
  if (!s || busy || s.state().status !== 'running') return;
  busy = true; renderStatus();
  const res: any = s.act(a);
  shownT = s.state().transcript.length;
  const cs = pullReports(r => r.human);
  shownR = s.kit.reports.length;
  const label = a.type === 'accept' ? 'Accept' : a.type === 'walk' ? 'Walk away' : a.type === 'offer' ? 'Offer' : '';
  const sentAct = res?.kit?.sent ?? a;
  const sent = sentAct.type === 'offer' && sentAct.x ? { ...sentAct.x } : undefined;
  if (sent) for (const i of s.scenario.issues) if (i.derived && sent[i.id] == null) {
    const rec = s.state().offers.filter((o: any) => o.by === s!.human().id).at(-1);
    if (rec) sent[i.id] = rec.x[i.id];
  }
  add(`<div class="msg you"><div class="who"><b>You</b>${label ? `<span class="dec">${label.toUpperCase()}</span>` : ''}${res?.tone?.label && a.text ? `<span>${esc(res.tone.label)} ${Math.round((res.tone.p?.[res.tone.label] ?? 0) * 100)}%</span>` : ''}</div>
    ${esc(a.text || '')}${sent && a.type !== 'accept' ? `<div class="terms">${esc(terms(sent))}</div>` : ''}
    ${(res?.kit?.notes ?? []).map((n: string) => `<div class="kitnote">Kit: ${esc(n)}</div>`).join('')}
    ${res?.err ? `<div class="err">Engine: ${esc(res.err)}</div>` : ''}${chips(cs)}</div>`);
  await new Promise(r => setTimeout(r, 120));
  await s.runAI(); flushAI();
  busy = false; renderSliders(); renderChecks(); renderStatus();
}

function sliderOffer() {
  const x: Record<string, number> = { ...(s!.state().table?.x ?? {}) };
  for (const i of s!.scenario.issues.filter((i: Issue) => !i.derived)) x[i.id] = Number($<HTMLInputElement>(`r_${i.id}`).value);
  return x;
}

function renderReport() {
  const R: any = (window as any).__REPORT__;
  const el = $('report');
  if (!R) { el.innerHTML = '<div class="card">No validation report was bundled. Run npm run validate, then npm run build:playground.</div>'; return; }
  const scs = ['vendor', 'job', 'budget'];
  const cell = (t: any, id: string) => {
    if (!t || !t.total) return '<span class="mut">n/a</span>';
    const r = t.pass / t.total, ok = r >= THRESHOLD[id];
    return `<span class="bar ${ok ? '' : 'lo'}"><i style="width:${(r * 100).toFixed(0)}%"></i></span><span class="${ok ? 'ok' : 'no'}">${(r * 100).toFixed(r === 1 ? 0 : 1)}%</span>`;
  };
  const rows = ORDER.map(id => `<tr><td>${esc(LABEL[id])}${HARD.has(id) ? '<span class="hard">hard</span>' : ''}</td><td class="mut">${(THRESHOLD[id] * 100).toFixed(0)}%</td>${scs.map(sc =>
    `<td>${cell(R.res.before[sc]?.[id], id)}</td><td>${cell(R.res.after[sc]?.[id], id)}</td>`).join('')}</tr>`).join('');
  const deals = scs.map(sc => `<td colspan="2">${R.sessions.before[sc].deals}/${R.sessions.before[sc].total} to <b>${R.sessions.after[sc].deals}/${R.sessions.after[sc].total}</b> deals, stuck sessions ${R.sessions.before[sc].stuck} to ${R.sessions.after[sc].stuck}</td>`).join('');
  el.innerHTML = `<div class="card"><h2>Automated validation, ${R.games} games per player style, seat and scenario</h2>
    <p class="mut" style="margin-top:0">Seven simulated player styles (fair, polite, rude, lowballer, stubborn, bluffer, typer) play every seat of every scenario with fixed seeds, once on the current engine and once with the kit attached. Hard rules must hold every time; the rest must reach the threshold.</p>
    <table><thead><tr><th>Check</th><th>Needs</th>${scs.map(sc => `<th>${sc} before</th><th>${sc} after</th>`).join('')}</tr></thead>
    <tbody>${rows}<tr><td>Sessions</td><td></td>${deals}</tr></tbody></table>
    <p class="mut">"AI stays within its own limits" is an engine-level finding: the offer generator can place one term past the agent's own reserve. The kit reports it; the fix is a two-line filter in the engine's offer generator (see INTEGRATION.md).</p></div>`;
}

$('scenario').onchange = fillSeats;
$('kOn').onclick = () => { useKit = true; $('kOn').className = 'on kit'; $('kOff').className = ''; start(); };
$('kOff').onclick = () => { useKit = false; $('kOff').className = 'on raw'; $('kOn').className = ''; start(); };
$('start').onclick = start;
$('send').onclick = () => { const t = $<HTMLInputElement>('text').value.trim(); if (!t) return; $<HTMLInputElement>('text').value = ''; act({ type: 'message', text: t }); };
$('text').onkeydown = (e: KeyboardEvent) => { if (e.key === 'Enter') $('send').click(); };
$('offer').onclick = () => { const t = $<HTMLInputElement>('text').value.trim() || 'Here is my proposal.'; $<HTMLInputElement>('text').value = ''; act({ type: 'offer', text: t, x: sliderOffer() }); };
$('accept').onclick = () => act({ type: 'accept', text: 'We accept these terms.' });
$('walk').onclick = () => act({ type: 'walk', text: 'We are walking away from this.' });
$('tPlay').onclick = () => { $('tPlay').className = 'on'; $('tRep').className = ''; $('play').style.display = ''; $('report').style.display = 'none'; };
$('tRep').onclick = () => { $('tRep').className = 'on'; $('tPlay').className = ''; $('play').style.display = 'none'; $('report').style.display = 'block'; renderReport(); };
$<HTMLInputElement>('seed').value = String(Math.floor(Math.random() * 9000) + 1000);
fillSeats(); start();
