"""Demo of the LLM Wording Engine (Milestone 2: LLM wording).

Run from the backend folder:
    python -m llm_wording_engine.demo                       # uses whichever API key is set, else offline
    python -m llm_wording_engine.demo --provider gemini
    python -m llm_wording_engine.demo --scenario all --turns 6

Part 1: the same situation handled by three personalities (shows persona-driven reasoning).
Part 2: a short live exchange per scenario where every turn is produced by the engine
        from the agent's persona, goals and the full history so far.

Part 2 uses a small demo loop only to feed history back in; it is not the project's
orchestrator. Every run is saved to llm_wording_engine/runs/ as JSON and Markdown.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

from .engine import WordingEngine
from .llm_client import set_logger
from .memory import PhraseMemory
from .prompts import fmt_offer
from .sample_scenarios import SCENARIOS, agents_for
from .schema import WordingRequest, Turn

# ---------------------------------------------------------------- console helpers
if os.name == "nt":
    os.system("")  # enables colour codes in the Windows terminal
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

C = {"b": "\033[1m", "d": "\033[2m", "c": "\033[96m", "g": "\033[92m", "y": "\033[93m", "r": "\033[91m",
     "m": "\033[95m", "x": "\033[0m"}
if os.environ.get("NO_COLOR"):
    C = {k: "" for k in C}
DEC = {"accept": C["g"], "counter": C["y"], "reject": C["r"]}


def line(ch="-", n=78):
    print(C["d"] + ch * n + C["x"])


def show(res, agent, header):
    print(f"\n{C['b']}{header}{C['x']}  {C['d']}[{agent.personality.replace('_', '-')}]{C['x']}")
    print(f"  {C['m']}Private reasoning:{C['x']} {res.reasoning}")
    print(f"  {DEC.get(res.decision, '')}{C['b']}Decision: {res.decision.upper()}{C['x']}"
          f"   {C['d']}tone: {res.tone}{C['x']}")
    print(f"  {C['c']}Says:{C['x']} \"{res.message}\"")
    if res.offer:
        print(f"  {C['b']}Offer:{C['x']} {fmt_offer(agent, res.offer)}"
              f"  {C['d']}(worth {res.utility_of_offer:.2f} to {agent.name}){C['x']}")
    for n in res.guardrail_notes:
        print(f"  {C['y']}Guardrail:{C['x']} {n}")
    ph = {"model": "", "memory": f" | phrased from memory #{res.memory_id}", "template": " | fixed template"}[res.phrasing]
    learned = f" | learned into memory #{res.memory_id}" if res.phrasing == "model" and res.memory_id else ""
    print(f"  {C['d']}source: {res.source} | {res.provider}/{res.model} | {res.latency_ms} ms{ph}{learned}{C['x']}")


def think(engine, req, who):
    """Run one turn while showing that the model is working."""
    if engine.client:
        print(f"  {C['d']}... {who} is thinking ({engine.provider}){C['x']}", flush=True)
    t = time.time()
    res = engine.reason(req)
    if engine.client and time.time() - t > 20:
        print(f"  {C['d']}(slow reply: {time.time() - t:.0f}s){C['x']}")
    return res


# ---------------------------------------------------------------- demo parts
def part_personalities(engine, log, pause):
    line("=")
    print(f"{C['b']}PART 1  Same offer, three personalities{C['x']}")
    print(f"{C['d']}Vendor pricing. The vendor opens; the buyer responds with each personality.{C['x']}")
    line("=")
    vendor, _ = agents_for("vendor")
    opening = {"price": 1250000, "delivery": 40, "warranty": 6}
    history = [Turn(speaker="Vendor", round=1, decision="counter", offer=opening,
                    message="Our price is Rs 12.5 lakh with delivery in 40 days and a 6-month warranty.")]
    print(f"\n{C['d']}Vendor's opening:{C['x']} \"{history[0].message}\"")
    for p in ("aggressive", "collaborative", "risk_averse"):
        _, buyer = agents_for("vendor", {"buyer": p})
        req = WordingRequest(agent=buyer, scenario=SCENARIOS["vendor"]["title"], history=history,
                               offer_on_table=opening, offer_by="vendor", round=1, max_rounds=8)
        res = think(engine, req, f"Buyer ({p.replace('_', '-')})")
        show(res, buyer, f"Buyer as {p.replace('_', '-')}")
        log["part1"].append({"personality": p, "result": res.to_dict()})
        time.sleep(pause)


def part_exchange(engine, scenario, turns, log, pause):
    s = SCENARIOS[scenario]
    a, b = agents_for(scenario)
    line("=")
    print(f"{C['b']}PART 2  Live exchange: {s['title']}{C['x']}")
    print(f"{C['d']}{a.name} ({a.personality}) vs {b.name} ({b.personality}), up to {turns} turns{C['x']}")
    line("=")
    history, table, table_by = [], None, None
    entries = []
    speakers = [a, b]
    for k in range(turns):
        agent = speakers[k % 2]
        rnd = k // 2 + 1
        req = WordingRequest(agent=agent, scenario=s["title"], history=list(history), offer_on_table=table,
                               offer_by=table_by, round=rnd, max_rounds=max(2, (turns + 1) // 2))
        res = think(engine, req, agent.name)
        show(res, agent, f"Turn {k + 1}  {agent.name}")
        entries.append({"turn": k + 1, "agent": agent.name, "result": res.to_dict()})
        history.append(Turn(speaker=agent.name, message=res.message, offer=res.offer, decision=res.decision, round=rnd))
        if res.decision in ("accept", "reject"):
            if engine.memory is not None:
                ids = [e["result"]["memory_id"] for e in entries if e["result"]["memory_id"]]
                engine.memory.reinforce(ids, deal=res.decision == "accept")
            end = "DEAL" if res.decision == "accept" else "NO DEAL"
            print(f"\n  {DEC[res.decision]}{C['b']}{end}{C['x']}"
                  + (f" on: {fmt_offer(agent, table)}" if res.decision == "accept" else ""))
            break
        table, table_by = res.offer, agent.id
        time.sleep(pause)
    else:
        print(f"\n  {C['d']}Turn limit for the demo reached.{C['x']}")
    log["part2"].append({"scenario": scenario, "turns": entries})


def save(log):
    out = Path(__file__).resolve().parent / "runs"
    out.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base = out / f"run_{stamp}_{log['provider']}"
    base.with_suffix(".json").write_text(json.dumps(log, indent=2, ensure_ascii=False), encoding="utf-8")
    md = [f"# Wording engine run {stamp}", "", f"Provider: {log['provider']}  Model: {log['model']}", ""]
    for e in log["part1"]:
        r = e["result"]
        md += [f"## Part 1: buyer as {e['personality']}", f"- Decision: {r['decision']}",
               f"- Reasoning: {r['reasoning']}", f"- Message: {r['message']}", f"- Offer: {r['offer']}", ""]
    for sc in log["part2"]:
        md += [f"## Part 2: {sc['scenario']}"]
        for t in sc["turns"]:
            r = t["result"]
            md += [f"**Turn {t['turn']} {t['agent']}** ({r['decision']}, source {r['source']}): {r['message']}",
                   f"  - reasoning: {r['reasoning']}", f"  - offer: {r['offer']}", ""]
    base.with_suffix(".md").write_text("\n".join(md), encoding="utf-8")
    return base


def main(argv=None):
    ap = argparse.ArgumentParser(description="LLM Wording Engine demo (Milestone 2: LLM wording)")
    ap.add_argument("--provider", default="auto", help="gemini | claude | openai | ollama | auto | offline")
    ap.add_argument("--model", default=None, help="override the model name")
    ap.add_argument("--scenario", default="vendor", help="vendor | job | budget | all")
    ap.add_argument("--turns", type=int, default=6, help="max turns in the live exchange")
    ap.add_argument("--part", default="both", help="1 | 2 | both")
    ap.add_argument("--pause", type=float, default=None, help="seconds between model calls (helps free-tier limits)")
    ap.add_argument("--no-memory", action="store_true", help="do not learn into or reuse the phrase memory")
    args = ap.parse_args(argv)

    set_logger(lambda m: print(f"  {C['y']}{m}{C['x']}", flush=True))
    memory = None if args.no_memory else PhraseMemory()
    start_size = len(memory) if memory is not None else 0
    engine = WordingEngine(provider=args.provider, model=args.model, memory=memory)
    pause = args.pause if args.pause is not None else (4.0 if engine.provider == "gemini" else 0.5 if engine.client else 0)
    line("=")
    print(f"{C['b']}LLM WORDING ENGINE  |  Multi-Agent Negotiation Simulator  |  Milestone 2: LLM wording{C['x']}")
    print(f"Provider: {C['c']}{engine.provider}{C['x']}   Model: {C['c']}{engine.model}{C['x']}   "
          f"Started: {datetime.now().strftime('%d-%m-%Y %H:%M:%S')}")
    if not engine.client:
        print(f"{C['y']}No API key found: running the offline writer. Set GEMINI_API_KEY (or another key) for real model output.{C['x']}")
    if memory is not None:
        print(f"Phrase memory: {len(memory)} learned lines "
              f"({'online turns are learned into it' if engine.client else 'offline turns reuse it'})")
    log = {"provider": engine.provider, "model": engine.model, "started": datetime.now().isoformat(), "part1": [], "part2": []}

    if args.part in ("1", "both"):
        part_personalities(engine, log, pause)
    if args.part in ("2", "both"):
        for sc in (SCENARIOS if args.scenario == "all" else [args.scenario]):
            part_exchange(engine, sc, args.turns, log, pause)

    calls = len(log["part1"]) + sum(len(s["turns"]) for s in log["part2"])
    res = [e["result"] for e in log["part1"]] + [t["result"] for s in log["part2"] for t in s["turns"]]
    llm = sum(1 for r in res if r["source"] == "llm")
    fixes = sum(len(r["guardrail_notes"]) for r in res)
    line("=")
    print(f"{C['b']}Summary{C['x']}: {calls} agent turns | {llm} produced by the model | "
          f"{fixes} guardrail corrections | avg {int(sum(r['latency_ms'] for r in res) / max(1, calls))} ms per turn")
    if memory is not None:
        print(f"{C['b']}Phrase memory{C['x']}: {start_size} -> {len(memory)} lines "
              f"(+{memory.learned_now} learned, {memory.reused_now} reused this run)")
    path = save(log)
    print(f"Saved: {path.with_suffix('.json').name} and {path.with_suffix('.md').name} in llm_wording_engine/runs/")
    line("=")


if __name__ == "__main__":
    main()
