"""Provider wiring tested against a local fake HTTP server (no internet or key needed)."""
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from llm_wording_engine import WordingEngine
from llm_wording_engine.llm_client import GeminiClient, OllamaClient
from llm_wording_engine.tests.test_engine import buyer_req

REPLY = json.dumps({"reasoning": "They anchored high; I counter low but keep warranty.", "decision": "counter",
                    "message": "That is well above budget. We can do 10 lakh with 20-day delivery.",
                    "offer": {"price": 1000000, "delivery": 20, "warranty": 18}, "tone": "warm"})
SEEN = []


class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, obj):
        b = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        SEEN.append(("GET", self.path, None))
        self._send({"models": [
            {"name": "models/gemini-9.0-flash", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/gemini-9.0-flash-lite", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/gemini-flash-lite-latest", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/gemini-9.5-flash-lite-preview", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/gemini-9.5-flash-image", "supportedGenerationMethods": ["generateContent"]},
            {"name": "models/embedding-001", "supportedGenerationMethods": ["embedContent"]}]})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        SEEN.append(("POST", self.path, body))
        if self.path.startswith("/api/chat"):
            self._send({"message": {"role": "assistant", "content": REPLY}})
        elif "thinkingConfig" in body.get("generationConfig", {}) and "reject-thinking" in self.path:
            b = b'{"error": {"code": 400, "message": "thinkingConfig not supported"}}'
            self.send_response(400)
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
        else:
            self._send({"candidates": [{"content": {"parts": [
                {"text": "internal thoughts", "thought": True}, {"text": REPLY}]}}]})


@pytest.fixture(scope="module")
def server():
    srv = HTTPServer(("127.0.0.1", 0), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def test_ollama_round_trip(server):
    eng = WordingEngine(client=OllamaClient(host=server))
    res = eng.reason(buyer_req())
    assert res.source == "llm" and res.provider == "ollama" and res.offer["price"] == 1000000
    body = SEEN[-1][2]
    assert body["format"] == "json" and body["messages"][0]["role"] == "system"


def test_gemini_picks_current_flash_model_and_parses(server, monkeypatch):
    monkeypatch.setattr(GeminiClient, "BASE", server + "/v1beta")
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    client = GeminiClient(api_key="test-key")
    assert client.model == "gemini-flash-lite-latest"  # fast alias preferred over heavier models
    res = WordingEngine(client=client).reason(buyer_req())
    assert res.source == "llm" and res.decision == "counter"
    method, path, body = SEEN[-1]
    assert path.endswith("gemini-flash-lite-latest:generateContent")
    assert "systemInstruction" in body and "Full conversation so far" in body["contents"][0]["parts"][0]["text"]


def test_gemini_asks_for_low_thinking_and_skips_thought_parts(server, monkeypatch):
    monkeypatch.setattr(GeminiClient, "BASE", server + "/v1beta")
    client = GeminiClient(api_key="k", model="gemini-9.0-flash")
    res = WordingEngine(client=client).reason(buyer_req())
    assert res.source == "llm"                                     # thought part ignored, JSON parsed
    assert SEEN[-1][2]["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "low"}


def test_gemini_retries_without_thinking_setting_if_rejected(server, monkeypatch):
    monkeypatch.setattr(GeminiClient, "BASE", server + "/v1beta")
    client = GeminiClient(api_key="k", model="gemini-3.0-flash-reject-thinking")
    res = WordingEngine(client=client).reason(buyer_req())
    assert res.source == "llm"
    assert "thinkingConfig" not in SEEN[-1][2]["generationConfig"]
    assert client._no_thinking_cfg is True
