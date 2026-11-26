"""Phrase memory: the offline writer learns from every good online run.

Each time the model produces a clean turn (source "llm", no guardrail corrections),
its public message is stored in a JSON file together with the situation it was
written for. Numbers in the message are replaced by slots tied to the offer terms,
for example "10.5 lakh" -> "{own.price:lakh}", so the line can later be reused with
different numbers and can never repeat a wrong figure.

In offline (or fallback) mode the engine asks the memory for the best stored line
for the current situation. Lines from conversations that ended in a deal are
preferred, recently used lines are avoided, and the fixed templates are used only
when nothing fits. The more the online mode runs, the larger and better the
offline phrase bank gets.

    memory = PhraseMemory()                      # default file: llm_wording_engine/memory/phrase_memory.json
    engine = WordingEngine(provider="gemini", memory=memory)

    python -m llm_wording_engine.stats           # show what has been learned
"""
from __future__ import annotations

import hashlib
import json
import os
import random
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .safety import fallback_offer, utility
from .schema import AgentProfile, WordingRequest

DEFAULT_PATH = Path(__file__).resolve().parent / "memory" / "phrase_memory.json"
MAX_ENTRIES = 600
VERSION = 1

# number followed by an optional unit word that changes its scale
_NUM = re.compile(
    r"(?<![\w.])(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
    r"(\s*(?:lakhs?|lacs?|crores?|cr\b|k\b|l\b|lpa\b))?",
    re.IGNORECASE)
_SLOT = re.compile(r"\{(own|table)\.([A-Za-z0-9_]+):([a-z_]+)\}")


# ---------------------------------------------------------------- number <-> slot helpers
def _clean(n: float) -> str:
    return str(int(n)) if float(n).is_integer() else f"{n:.2f}".rstrip("0").rstrip(".")


def _indian(n: float) -> str:
    s = str(int(round(n)))
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts) + "," + tail


def render(value: float, fmt: str) -> str:
    """Format a value the same way the original message wrote it."""
    if fmt == "lakh":
        return _clean(round(value / 100000, 2))
    if fmt == "crore":
        return _clean(round(value / 10000000, 2))
    if fmt == "k":
        return _clean(round(value / 1000, 2))
    if fmt == "indian":
        return _indian(value)
    if fmt == "western":
        return f"{int(round(value)):,}"
    return _clean(value)


def _candidates(token: str, unit: str) -> List[Tuple[float, str]]:
    """Possible (value, format) readings of one number in a message."""
    u = (unit or "").strip().lower()
    raw = float(token.replace(",", ""))
    # a unit word usually scales the number ("10.5 lakh" = 1050000), but some issues are
    # already measured in that unit ("25 lakh INR" budget = 25), so the plain reading is tried too
    if u.startswith(("lakh", "lac")) or u == "l":
        return [(raw * 100000, "lakh"), (raw, "plain")]
    if u.startswith("cr"):
        return [(raw * 10000000, "crore"), (raw, "plain")]
    if u == "k":
        return [(raw * 1000, "k"), (raw, "plain")]
    if "," in token:
        parts = token.split(".")[0].split(",")
        fmt = "western" if all(len(p) == 3 for p in parts[1:]) else "indian"
        return [(raw, fmt)]
    return [(raw, "plain")]


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= max(1e-6, 0.005 * max(abs(a), abs(b)))


def templatize(message: str, agent: AgentProfile, own: Optional[Dict[str, float]],
               table: Optional[Dict[str, float]]) -> Optional[str]:
    """Replace every number in a message by a slot. Returns None if any number cannot be explained."""
    sources = [("own", own or {}), ("table", table or {})]
    out, pos = [], 0
    for m in _NUM.finditer(message):
        token, unit = m.group(1), m.group(2) or ""
        hits = []
        for val, fmt in _candidates(token, unit):
            for src, offer in sources:
                for iid, v in offer.items():
                    if v is not None and _close(val, float(v)):
                        hits.append((src, iid, fmt))
        if not hits:
            return None                     # unexplained number: never risk reusing it
        issues = {i.id: i for i in agent.issues}
        if len({(h[0], h[1]) for h in hits}) > 1:
            # ambiguous value: prefer the issue whose name appears right next to the number
            near = message[max(0, m.start() - 30):m.end() + 30].lower()
            named = [h for h in hits if h[1] in issues and (issues[h[1]].label.lower() in near
                                                           or (issues[h[1]].unit and issues[h[1]].unit.lower() in near))]
            if len({(h[0], h[1]) for h in named}) != 1:
                return None
            hits = named
        src, iid, fmt = hits[0]
        out.append(message[pos:m.start(1)])
        out.append("{%s.%s:%s}" % (src, iid, fmt))
        pos = m.end(1)
    out.append(message[pos:])
    return "".join(out)


def fill(template: str, own: Optional[Dict[str, float]], table: Optional[Dict[str, float]]) -> Optional[str]:
    """Put the current numbers into a stored template. None if a needed value is missing."""
    srcs = {"own": own or {}, "table": table or {}}
    missing = False

    def sub(m):
        nonlocal missing
        v = srcs[m.group(1)].get(m.group(2))
        if v is None:
            missing = True
            return ""
        return render(float(v), m.group(3))
    text = _SLOT.sub(sub, template)
    return None if missing else text


# ---------------------------------------------------------------- situation features
def _phase(req: WordingRequest) -> str:
    t = (req.round - 1) / max(1, req.max_rounds - 1)
    return "early" if t < 0.34 else "mid" if t < 0.67 else "late"


def _gap(req: WordingRequest) -> str:
    """How close the offer on the table is to what this agent wants right now."""
    if not req.offer_on_table:
        return "none"
    u = utility(req.agent, req.offer_on_table) or 0.0
    target = utility(req.agent, fallback_offer(req.agent, req.round, req.max_rounds)) or 1.0
    d = target - u
    return "close" if d <= 0.15 else "mid" if d <= 0.45 else "far"


def situation(req: WordingRequest) -> Dict[str, Any]:
    a = req.agent
    return {"agent_id": a.id, "role": a.role, "personality": a.personality, "opening": req.offer_on_table is None,
            "phase": _phase(req), "gap": _gap(req)}


# ---------------------------------------------------------------- the memory store
class PhraseMemory:
    def __init__(self, path: Optional[str] = None, autosave: bool = True, max_entries: int = MAX_ENTRIES):
        self.path = Path(path or os.environ.get("NEGOTIATION_MEMORY_PATH") or DEFAULT_PATH)
        self.autosave = autosave
        self.max_entries = max_entries
        self.entries: List[Dict[str, Any]] = []
        self.recent: List[str] = []          # ids used recently in this session (avoid repeats)
        self.learned_now = 0
        self.reused_now = 0
        self.load()

    # ---------- persistence
    def load(self) -> None:
        if self.path.is_file():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                self.entries = data.get("entries", [])
            except (ValueError, OSError):
                self.entries = []            # unreadable file: start fresh rather than crash

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = {"version": VERSION, "updated": time.strftime("%Y-%m-%d %H:%M:%S"), "count": len(self.entries),
                "entries": self.entries}
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.path)           # atomic: a crash never leaves a half-written file

    def __len__(self) -> int:
        return len(self.entries)

    # ---------- learning from the online mode
    def learn(self, req: WordingRequest, decision: str, message: str, offer: Optional[Dict[str, float]],
              tone: str, notes: List[str], provider: str = "", model: str = "") -> Optional[str]:
        """Store a clean model-written turn. Returns the entry id, or None if it was not stored."""
        if not message or len(message) < 12 or len(message) > 400:
            return None
        if notes:
            return None                      # only learn from turns the guardrails did not have to fix
        template = templatize(message, req.agent, offer, req.offer_on_table)
        if template is None:
            return None
        key = hashlib.sha1(re.sub(r"\W+", " ", template.lower()).strip().encode()).hexdigest()[:12]
        sit = situation(req)
        for e in self.entries:
            if e["id"] == key:
                e["seen"] += 1
                e["quality"] = min(2.0, e["quality"] + 0.05)
                self._maybe_save()
                return key
        self.entries.append({
            "id": key, "template": template, "decision": decision, "tone": tone, **sit,
            "scenario": req.scenario, "slots": sorted({m.group(1) + "." + m.group(2) for m in _SLOT.finditer(template)}),
            "quality": 1.0, "seen": 1, "used": 0, "wins": 0, "learned_from": f"{provider}/{model}".strip("/"),
            "created": time.strftime("%Y-%m-%d %H:%M:%S")})
        self.learned_now += 1
        self._trim()
        self._maybe_save()
        return key

    def reinforce(self, ids: List[str], deal: bool) -> None:
        """Feedback after a conversation ends: lines from successful deals rank higher next time."""
        for e in self.entries:
            if e["id"] in ids:
                if deal:
                    e["wins"] += 1
                    e["quality"] = min(2.0, e["quality"] + 0.15)
                else:
                    e["quality"] = max(0.2, e["quality"] - 0.05)
        self._maybe_save()

    # ---------- reuse in the offline mode
    def recall(self, req: WordingRequest, decision: str, offer: Optional[Dict[str, float]],
               tone: str) -> Optional[Tuple[str, str]]:
        """Best stored line for this situation, filled with the current numbers: (message, entry id)."""
        sit = situation(req)
        issues = {i.id for i in req.agent.issues}
        best, best_score = None, -1e9
        for e in self.entries:
            if e["personality"] != sit["personality"] or e["decision"] != decision or e["opening"] != sit["opening"]:
                continue
            if any(s.split(".", 1)[1] not in issues for s in e["slots"]):
                continue
            text = fill(e["template"], offer, req.offer_on_table)
            if text is None:
                continue
            score = (e["quality"]
                     + 0.6 * (e["agent_id"] == sit["agent_id"]) + 0.3 * (e["role"] == sit["role"])
                     + 0.25 * (e["phase"] == sit["phase"]) + 0.25 * (e["gap"] == sit["gap"])
                     + 0.15 * (e["tone"] == tone) + 0.1 * min(e["wins"], 5) / 5
                     - (0.8 if e["id"] in self.recent[-6:] else 0.0)
                     + random.uniform(0, 0.05))
            if score > best_score:
                best, best_score = (text, e), score
        if not best:
            return None
        text, e = best
        e["used"] += 1
        self.recent.append(e["id"])
        self.reused_now += 1
        self._maybe_save()
        return text, e["id"]

    # ---------- housekeeping
    def _trim(self) -> None:
        if len(self.entries) > self.max_entries:
            self.entries.sort(key=lambda e: (e["quality"] + 0.1 * e["wins"] + 0.02 * e["seen"], e["created"]), reverse=True)
            del self.entries[self.max_entries:]

    def _maybe_save(self) -> None:
        if self.autosave:
            self.save()

    def stats(self) -> Dict[str, Any]:
        by = {}
        for e in self.entries:
            k = f"{e['personality']}/{e['decision']}"
            by[k] = by.get(k, 0) + 1
        return {"path": str(self.path), "entries": len(self.entries), "by_personality_decision": by,
                "total_wins": sum(e["wins"] for e in self.entries), "total_reuses": sum(e["used"] for e in self.entries)}


def main() -> None:
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    m = PhraseMemory()
    s = m.stats()
    print(f"Phrase memory: {s['entries']} learned lines  ({s['path']})")
    print(f"Reused offline {s['total_reuses']} times, part of {s['total_wins']} successful deals")
    for k, v in sorted(s["by_personality_decision"].items()):
        print(f"  {k:28s} {v}")
    top = sorted(m.entries, key=lambda e: (e["quality"], e["wins"]), reverse=True)[:5]
    if top:
        print("\nTop lines:")
        for e in top:
            print(f"  [{e['personality']}/{e['decision']}, quality {e['quality']:.2f}, wins {e['wins']}] {e['template']}")


if __name__ == "__main__":
    main()
