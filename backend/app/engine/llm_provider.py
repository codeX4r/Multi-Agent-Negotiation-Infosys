"""LLM Provider abstraction for the negotiation engine.

Wraps the existing llm_wording_engine provider infrastructure with a clean
interface for the negotiation orchestrator.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional, Protocol

# Import the existing provider infrastructure
from llm_wording_engine.llm_client import LLMClient, LLMError, make_client


class LLMProvider(Protocol):
    """Protocol for LLM providers used by negotiation agents."""

    def complete(self, system: str, user: str) -> str:
        """Send a completion request and return the response text."""
        ...

    def get_provider_info(self) -> dict:
        """Return provider metadata (name, model, etc.)."""
        ...


@dataclass
class ProviderConfig:
    """Configuration for LLM provider selection."""
    provider: str = "auto"           # gemini | claude | openai | ollama | auto | offline
    model: Optional[str] = None      # Specific model override
    temperature: float = 0.7
    api_key: Optional[str] = None    # Override API key
    base_url: Optional[str] = None   # Override base URL (for Ollama/custom)


class _ProviderWrapper:
    """Wraps an LLMClient to implement the LLMProvider protocol."""

    def __init__(self, client: LLMClient):
        self._client = client

    def complete(self, system: str, user: str) -> str:
        return self._client.complete(system, user)

    def get_provider_info(self) -> dict:
        return {
            "provider": self._client.provider,
            "model": self._client.model,
        }


def _resolve_env_vars(config: ProviderConfig) -> ProviderConfig:
    """Resolve environment variables into config, with new vars taking priority."""
    # New standard env vars
    provider = os.environ.get("LLM_PROVIDER", config.provider)
    model = os.environ.get("LLM_MODEL", config.model)
    api_key = os.environ.get("LLM_API_KEY", config.api_key)
    base_url = os.environ.get("LLM_BASE_URL", config.base_url)
    temperature_str = os.environ.get("LLM_TEMPERATURE")
    temperature = float(temperature_str) if temperature_str else config.temperature

    # Backward compatibility: map new vars to old ones expected by make_client
    if provider != "auto" and provider != "offline":
        # Set the old env vars that make_client expects
        if provider == "gemini" and api_key:
            os.environ.setdefault("GEMINI_API_KEY", api_key)
        elif provider == "claude" and api_key:
            os.environ.setdefault("ANTHROPIC_API_KEY", api_key)
        elif provider == "openai" and api_key:
            os.environ.setdefault("OPENAI_API_KEY", api_key)
        elif provider == "ollama" and base_url:
            os.environ.setdefault("OLLAMA_HOST", base_url)

    if model:
        # Set model-specific env vars
        if provider == "gemini" or (provider == "auto" and "GEMINI_API_KEY" in os.environ):
            os.environ.setdefault("GEMINI_MODEL", model)
        elif provider == "claude" or (provider == "auto" and "ANTHROPIC_API_KEY" in os.environ):
            os.environ.setdefault("CLAUDE_MODEL", model)
        elif provider == "openai" or (provider == "auto" and "OPENAI_API_KEY" in os.environ):
            os.environ.setdefault("OPENAI_MODEL", model)
        elif provider == "ollama":
            os.environ.setdefault("OLLAMA_MODEL", model)

    return ProviderConfig(
        provider=provider,
        model=model,
        temperature=temperature,
        api_key=api_key,
        base_url=base_url,
    )


def create_provider(config: Optional[ProviderConfig] = None) -> Optional[LLMProvider]:
    """Create an LLM provider from configuration.

    Args:
        config: Optional ProviderConfig. If None, reads from environment variables.

    Returns:
        LLMProvider instance, or None if provider is "offline" or no keys configured.

    Environment Variables:
        LLM_PROVIDER: gemini | claude | openai | ollama | auto | offline (default: auto)
        LLM_MODEL: Specific model name (optional)
        LLM_API_KEY: API key for the provider (optional, can use provider-specific vars)
        LLM_BASE_URL: Base URL for Ollama or custom endpoints (optional)
        LLM_TEMPERATURE: Model temperature (default: 0.7)
    """
    if config is None:
        config = ProviderConfig()

    config = _resolve_env_vars(config)

    if config.provider.lower() == "offline":
        return None

    try:
        # Use the existing make_client which handles provider selection and key validation
        client = make_client(
            provider=config.provider,
            model=config.model,
            temperature=config.temperature,
        )
        if client is None:
            return None
        return _ProviderWrapper(client)
    except LLMError as e:
        # No valid provider configured (e.g., no API keys)
        return None
    except Exception as e:
        # Log but don't crash - return None for offline fallback
        import logging
        logging.getLogger(__name__).warning(f"Failed to create LLM provider: {e}")
        return None


# For backward compatibility with tests that may check this
__all__ = ["LLMProvider", "ProviderConfig", "create_provider"]