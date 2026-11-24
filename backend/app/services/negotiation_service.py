"""Service layer for negotiation operations."""

from app.engine.orchestrator import run_negotiation as orchestrator_run_negotiation
from app.schemas.negotiation import RunRequest


def run_negotiation(req: RunRequest):
    """Run a negotiation simulation based on the request."""
    defaults = {
        "vendor": ("aggressive", "collaborative"),
        "job": ("collaborative", "collaborative"),
        "budget": ("aggressive", "collaborative"),
    }
    default_opener, default_responder = defaults[req.scenario]
    return orchestrator_run_negotiation(
        req.scenario,
        req.opener_personality or default_opener,
        req.responder_personality or default_responder,
        req.max_rounds,
        req.config,
    )