"""LLM Wording Engine for the Multi-Agent Negotiation Simulator (Milestone 2: LLM wording).

Gives every agent natural, persona-driven language written by a real model from
its persona, goals and the full conversation history: the public message, an
explained rationale and well-formed terms, checked against the agent's own limits.
Designed to phrase the decisions of the team's existing evaluation engine
(pass them as decision_hint).

Standalone: depends only on the Python standard library.
"""
from .schema import Issue, AgentProfile, Turn, WordingRequest, WordingResult
from .engine import WordingEngine
from .memory import PhraseMemory

__all__ = ["Issue", "AgentProfile", "Turn", "WordingRequest", "WordingResult", "WordingEngine", "PhraseMemory"]
__version__ = "1.0.0"
