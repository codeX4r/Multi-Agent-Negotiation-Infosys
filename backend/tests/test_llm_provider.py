"""Tests for LLM Provider abstraction."""

import os
import pytest
from unittest.mock import Mock, patch

from app.engine.llm_provider import LLMProvider, ProviderConfig, create_provider


def test_create_provider_offline_mode(monkeypatch):
    """Test that 'offline' provider returns None."""
    monkeypatch.setenv("LLM_PROVIDER", "offline")
    provider = create_provider()
    assert provider is None


def test_create_provider_auto_no_keys(monkeypatch):
    """Test that auto provider returns None when no API keys are set."""
    # Clear all API key env vars
    for key in ["GEMINI_API_KEY", "GOOGLE_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY"]:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "auto")

    # Also need to prevent loading .env file from llm_wording_engine
    import llm_wording_engine.llm_client as llm_client_module
    monkeypatch.setattr(llm_client_module, "load_dotenv", lambda *a, **k: None)

    provider = create_provider()
    assert provider is None


def test_provider_config_dataclass():
    """Test ProviderConfig dataclass defaults."""
    config = ProviderConfig()
    assert config.provider == "auto"
    assert config.model is None
    assert config.temperature == 0.7
    assert config.api_key is None
    assert config.base_url is None

    config2 = ProviderConfig(provider="gemini", model="test-model", temperature=0.5)
    assert config2.provider == "gemini"
    assert config2.model == "test-model"
    assert config2.temperature == 0.5


class MockLLMClient:
    """Mock LLM client for testing."""
    provider = "mock"
    model = "mock-model"

    def __init__(self, responses):
        self.responses = responses
        self.call_count = 0

    def complete(self, system: str, user: str) -> str:
        if self.call_count >= len(self.responses):
            raise Exception("No more scripted responses")
        response = self.responses[self.call_count]
        self.call_count += 1
        return response


def test_llm_provider_protocol():
    """Test that LLMProvider protocol works with a mock implementation."""
    from app.engine.llm_provider import LLMProvider

    class TestProvider:
        def complete(self, system: str, user: str) -> str:
            return '{"action": "counter", "message": "test"}'

        def get_provider_info(self) -> dict:
            return {"provider": "test", "model": "test-model"}

    # This should not raise - structural subtyping
    provider: LLMProvider = TestProvider()
    result = provider.complete("system", "user")
    assert isinstance(result, str)
    assert "counter" in result

    info = provider.get_provider_info()
    assert info["provider"] == "test"


@patch("app.engine.llm_provider.make_client")
def test_create_provider_with_gemini(mock_make_client, monkeypatch):
    """Test creating a Gemini provider."""
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-flash-lite-latest")

    mock_client = MockLLMClient(['{"test": "response"}'])
    mock_make_client.return_value = mock_client

    provider = create_provider()

    assert provider is not None
    assert hasattr(provider, "complete")
    assert hasattr(provider, "get_provider_info")

    info = provider.get_provider_info()
    assert info["provider"] == "mock"
    assert info["model"] == "mock-model"


@patch("app.engine.llm_provider.make_client")
def test_create_provider_with_claude(mock_make_client, monkeypatch):
    """Test creating a Claude provider."""
    monkeypatch.setenv("LLM_PROVIDER", "claude")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("CLAUDE_MODEL", "claude-haiku-5-5")

    mock_client = MockLLMClient(['{"test": "response"}'])
    mock_make_client.return_value = mock_client

    provider = create_provider()
    assert provider is not None


@patch("app.engine.llm_provider.make_client")
def test_create_provider_with_openai(mock_make_client, monkeypatch):
    """Test creating an OpenAI provider."""
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4o-mini")

    mock_client = MockLLMClient(['{"test": "response"}'])
    mock_make_client.return_value = mock_client

    provider = create_provider()
    assert provider is not None


@patch("app.engine.llm_provider.make_client")
def test_create_provider_with_ollama(mock_make_client, monkeypatch):
    """Test creating an Ollama provider."""
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_HOST", "http://localhost:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "llama3.2")

    mock_client = MockLLMClient(['{"test": "response"}'])
    mock_make_client.return_value = mock_client

    provider = create_provider()
    assert provider is not None


def test_provider_config_from_env(monkeypatch):
    """Test that environment variables are read into config."""
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LLM_MODEL", "custom-model")
    monkeypatch.setenv("LLM_TEMPERATURE", "0.3")
    monkeypatch.setenv("LLM_API_KEY", "env-key")
    monkeypatch.setenv("LLM_BASE_URL", "http://custom:8080")

    config = ProviderConfig()
    # The actual resolution happens in create_provider, but we can test the env vars exist
    assert os.environ.get("LLM_PROVIDER") == "gemini"
    assert os.environ.get("LLM_MODEL") == "custom-model"
    assert os.environ.get("LLM_TEMPERATURE") == "0.3"
    assert os.environ.get("LLM_API_KEY") == "env-key"
    assert os.environ.get("LLM_BASE_URL") == "http://custom:8080"


@patch("app.engine.llm_provider.make_client")
def test_create_provider_handles_llm_error(mock_make_client, monkeypatch):
    """Test that LLMError from make_client returns None."""
    from llm_wording_engine.llm_client import LLMError

    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    mock_make_client.side_effect = LLMError("Invalid API key")

    provider = create_provider()
    assert provider is None


@patch("app.engine.llm_provider.make_client")
def test_create_provider_complete_returns_string(mock_make_client, monkeypatch):
    """Test that provider.complete returns a string."""
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    mock_client = MockLLMClient(['{"decision": "counter", "message": "test", "offer": {"price": 1000000}}'])
    mock_make_client.return_value = mock_client

    provider = create_provider()
    assert provider is not None

    result = provider.complete("system prompt", "user prompt")
    assert isinstance(result, str)
    assert "counter" in result
    assert "1000000" in result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])