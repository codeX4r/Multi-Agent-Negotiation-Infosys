"""Model providers behind one interface: complete(system, user) -> text.

Supported: Gemini, Claude (Anthropic), OpenAI, Ollama (local).
Standard library only. Keys come from environment variables or a .env file:
  GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, OLLAMA_HOST (optional)
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable, List, Optional


class LLMError(RuntimeError):
    pass


_LOG = None


def set_logger(fn) -> None:
    """Register a function that receives progress lines (retries, waits). The demo prints them."""
    global _LOG
    _LOG = fn


def _log(msg: str) -> None:
    if _LOG:
        _LOG(msg)


def load_dotenv(path: Optional[str] = None) -> None:
    """Minimal .env reader (KEY=VALUE lines). Existing environment values win."""
    candidates = [Path(path)] if path else [Path(__file__).resolve().parent / ".env", Path.cwd() / ".env"]
    for p in candidates:
        if p.is_file():
            for line in p.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _post(url: str, body: dict, headers: dict, timeout: int = 45, attempts: int = 3) -> dict:
    data = json.dumps(body).encode("utf-8")
    last = None
    for attempt in range(1, attempts + 1):
        req = urllib.request.Request(url, data=data, method="POST",
                                     headers={"Content-Type": "application/json", **headers})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:400]
            last = LLMError(f"HTTP {e.code}: {detail}")
            if e.code in (429, 500, 502, 503, 529) and attempt < attempts:   # rate limit / overloaded
                wait = 15 * attempt if e.code == 429 else 3 * attempt
                _log(f"HTTP {e.code} ({'rate limit' if e.code == 429 else 'server busy'}), retry {attempt}/{attempts - 1} in {wait}s")
                time.sleep(wait)
                continue
            raise last
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = LLMError(f"network error or timeout after {timeout}s: {e}")
            if attempt < attempts:
                _log(f"no reply within {timeout}s ({e.__class__.__name__}), retry {attempt}/{attempts - 1}")
                time.sleep(2)
    raise last or LLMError("request failed")


def _get(url: str, headers: Optional[dict] = None, timeout: int = 30) -> dict:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise LLMError(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")
    except urllib.error.URLError as e:
        raise LLMError(f"network error: {e}")


class LLMClient:
    provider = "base"

    def __init__(self, model: Optional[str] = None, temperature: float = 0.7):
        self.model = model or ""
        self.temperature = temperature

    def complete(self, system: str, user: str) -> str:  # pragma: no cover - interface
        raise NotImplementedError


class GeminiClient(LLMClient):
    provider = "gemini"
    BASE = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(self, model=None, temperature=0.7, api_key=None):
        super().__init__(model, temperature)
        self.key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not self.key:
            raise LLMError("GEMINI_API_KEY is not set")
        self.model = model or os.environ.get("GEMINI_MODEL") or self._pick_model()

    def _pick_model(self) -> str:
        """Choose a fast, current text model from the account's model list.

        Short negotiation lines do not need a heavy model, and free-tier limits favour
        light ones, so the order is: the 'flash-lite-latest' alias (always points at a
        current model), then the newest numbered flash-lite, then the newest flash.
        """
        import re
        try:
            data = _get(f"{self.BASE}/models?pageSize=200&key={self.key}")
        except LLMError:
            return "gemini-flash-lite-latest"
        names = []
        for m in data.get("models", []):
            name = m.get("name", "").replace("models/", "")
            if "generateContent" not in m.get("supportedGenerationMethods", []):
                continue
            if "gemini" not in name or "flash" not in name:
                continue
            if any(x in name for x in ("image", "tts", "live", "audio", "exp", "preview", "thinking", "transcribe", "omni")):
                continue
            names.append(name)
        if "gemini-flash-lite-latest" in names:
            return "gemini-flash-lite-latest"

        def ver(n):
            v = re.findall(r"gemini-(\d+(?:\.\d+)?)", n)
            return float(v[0]) if v else 0.0
        lite = [n for n in names if "lite" in n and ver(n) > 0]
        if lite:
            return max(lite, key=ver)
        flash = [n for n in names if ver(n) > 0]
        if flash:
            return max(flash, key=ver)
        return names[0] if names else "gemini-flash-lite-latest"

    def _thinking_config(self):
        """Ask for minimal 'thinking': a short negotiation line does not need long deliberation."""
        import re
        v = re.findall(r"gemini-(\d+)", self.model)
        major = int(v[0]) if v else 0
        if major >= 3:
            return {"thinkingLevel": "low"}
        if major == 2 and "2.5" in self.model:
            return {"thinkingBudget": 0}
        return None

    def complete(self, system, user):
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": self.temperature, "responseMimeType": "application/json"},
        }
        tc = None if getattr(self, "_no_thinking_cfg", False) else self._thinking_config()
        if tc:
            body["generationConfig"]["thinkingConfig"] = tc
        url = f"{self.BASE}/models/{self.model}:generateContent"
        try:
            r = _post(url, body, {"x-goog-api-key": self.key})
        except LLMError as e:
            if tc and "HTTP 400" in str(e):
                # this model does not accept the thinking setting: remember and retry without it
                self._no_thinking_cfg = True
                _log("model rejected the thinking setting, retrying without it")
                body["generationConfig"].pop("thinkingConfig", None)
                r = _post(url, body, {"x-goog-api-key": self.key})
            else:
                raise
        try:
            parts = r["candidates"][0]["content"]["parts"]
            return "".join(p.get("text", "") for p in parts if not p.get("thought"))
        except (KeyError, IndexError):
            raise LLMError(f"unexpected Gemini response: {json.dumps(r)[:300]}")


class ClaudeClient(LLMClient):
    provider = "claude"

    def __init__(self, model=None, temperature=0.7, api_key=None):
        super().__init__(model or os.environ.get("CLAUDE_MODEL") or "claude-haiku-5-5", temperature)
        self.key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.key:
            raise LLMError("ANTHROPIC_API_KEY is not set")

    def complete(self, system, user):
        r = _post("https://api.anthropic.com/v1/messages",
                  {"model": self.model, "max_tokens": 700, "temperature": self.temperature, "system": system,
                   "messages": [{"role": "user", "content": user}]},
                  {"x-api-key": self.key, "anthropic-version": "2023-06-01"})
        try:
            return "".join(b.get("text", "") for b in r["content"] if b.get("type") == "text")
        except (KeyError, TypeError):
            raise LLMError(f"unexpected Claude response: {json.dumps(r)[:300]}")


class OpenAIClient(LLMClient):
    provider = "openai"

    def __init__(self, model=None, temperature=0.7, api_key=None):
        super().__init__(model or os.environ.get("OPENAI_MODEL") or "gpt-4o-mini", temperature)
        self.key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.key:
            raise LLMError("OPENAI_API_KEY is not set")

    def complete(self, system, user):
        r = _post("https://api.openai.com/v1/chat/completions",
                  {"model": self.model, "temperature": self.temperature, "response_format": {"type": "json_object"},
                   "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
                  {"Authorization": f"Bearer {self.key}"})
        try:
            return r["choices"][0]["message"]["content"]
        except (KeyError, IndexError):
            raise LLMError(f"unexpected OpenAI response: {json.dumps(r)[:300]}")


class OllamaClient(LLMClient):
    provider = "ollama"

    def __init__(self, model=None, temperature=0.7, host=None):
        super().__init__(model or os.environ.get("OLLAMA_MODEL") or "llama3.2", temperature)
        self.host = (host or os.environ.get("OLLAMA_HOST") or "http://localhost:11434").rstrip("/")

    def complete(self, system, user):
        r = _post(f"{self.host}/api/chat",
                  {"model": self.model, "stream": False, "format": "json", "options": {"temperature": self.temperature},
                   "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
                  {}, timeout=180, attempts=2)
        try:
            return r["message"]["content"]
        except KeyError:
            raise LLMError(f"unexpected Ollama response: {json.dumps(r)[:300]}")


class ScriptedClient(LLMClient):
    """Returns pre-written replies in order. Used by the tests; not a model."""
    provider = "scripted"

    def __init__(self, replies: List[str]):
        super().__init__("scripted")
        self.replies = list(replies)
        self.calls: List[tuple] = []

    def complete(self, system, user):
        self.calls.append((system, user))
        if not self.replies:
            raise LLMError("no scripted replies left")
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


PROVIDERS = {"gemini": GeminiClient, "claude": ClaudeClient, "openai": OpenAIClient, "ollama": OllamaClient}
KEY_ENV = {"gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY"), "claude": ("ANTHROPIC_API_KEY",), "openai": ("OPENAI_API_KEY",)}


def make_client(provider: str = "auto", model: Optional[str] = None, temperature: float = 0.7) -> Optional[LLMClient]:
    """Build a client. 'auto' picks the first provider with a key; 'offline' returns None."""
    load_dotenv()
    p = (provider or "auto").lower()
    if p == "offline":
        return None
    if p == "auto":
        for name, envs in KEY_ENV.items():
            if any(os.environ.get(e) for e in envs):
                return PROVIDERS[name](model=model, temperature=temperature)
        return None
    if p not in PROVIDERS:
        raise LLMError(f"unknown provider '{provider}', choose from {', '.join(PROVIDERS)} or offline")
    return PROVIDERS[p](model=model, temperature=temperature)
