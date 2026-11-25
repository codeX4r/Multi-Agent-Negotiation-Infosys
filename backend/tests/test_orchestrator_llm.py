"""Tests for LLM-driven orchestrator."""

from unittest.mock import Mock, patch
from app.engine.orchestrator import run_negotiation
from app.models import (
    NegotiationConfig,
    NegotiationParty,
    NegotiationIssue,
    SumConstraint,
    Terms
)
from app.schemas.llm_negotiation import LLMAgentDecision


def make_vendor_config():
    """Create a minimal 2-party vendor config for testing."""
    return NegotiationConfig(
        parties=[
            NegotiationParty(
                id="vendor",
                role="Vendor",
                personality="aggressive",
                skill="expert",
                target={"price": 1250000, "delivery": 30, "warranty": 24, "payment": 30},
                walk_away={"price": 1000000, "delivery": 45, "warranty": 6, "payment": 60},
                weights={"price": 0.5, "delivery": 0.2, "warranty": 0.2, "payment": 0.1}
            ),
            NegotiationParty(
                id="buyer",
                role="Buyer",
                personality="collaborative",
                skill="skilled",
                target={"price": 900000, "delivery": 15, "warranty": 36, "payment": 60},
                walk_away={"price": 1100000, "delivery": 30, "warranty": 12, "payment": 30},
                weights={"price": 0.4, "delivery": 0.3, "warranty": 0.2, "payment": 0.1}
            ),
        ],
        issues=[
            NegotiationIssue(id="price", min=900000, max=1300000, step=10000),
            NegotiationIssue(id="delivery", min=10, max=45, step=1),
            NegotiationIssue(id="warranty", min=6, max=36, step=6),
            NegotiationIssue(id="payment", min=0, max=60, step=15),
        ],
        opener_id="vendor",
        rounds_limit=6,
        deadlock_after_stalled_rounds=3,
        climate="volatile",
    )


def test_orchestrator_runs_llm_negotiation():
    """Test orchestrator runs a complete LLM-driven negotiation."""
    config = make_vendor_config()

    # Mock LLM provider to return scripted decisions
    with patch('app.engine.llm_provider.create_provider') as mock_create:
        mock_provider = Mock()
        # Sequence: vendor opens, buyer counters, vendor accepts
        mock_provider.complete.side_effect = [
            # Vendor opens
            '{"action": "open", "reasoning_summary": "Opening high", "message": "We offer 12.5L", "proposed_terms": {"price": 1250000, "delivery_days": 30, "warranty_months": 24, "payment_days": 30}, "concessions": [], "confidence": 0.9}',
            # Buyer counters
            '{"action": "counter", "reasoning_summary": "Too high", "message": "We can do 10L", "proposed_terms": {"price": 1000000, "delivery_days": 20, "warranty_months": 18, "payment_days": 30}, "concessions": [], "confidence": 0.7}',
            # Vendor accepts
            '{"action": "accept", "reasoning_summary": "Within range", "message": "Deal", "proposed_terms": null, "concessions": [], "confidence": 0.8}',
        ]
        mock_create.return_value = mock_provider

        result = run_negotiation("vendor", "aggressive", "collaborative", 6, config=config)

        assert result["outcome"] in ["deal", "breakdown", "deadlock"]
        assert "transcript" in result
        assert len(result["transcript"]) >= 2
        # First entry should be open
        assert result["transcript"][0]["decision"] == "open"
        # Should have proper structure
        assert "final_terms" in result
        assert "satisfaction" in result


def test_orchestrator_three_party_budget():
    """Test orchestrator handles 3-party budget scenario."""
    config = NegotiationConfig(
        parties=[
            NegotiationParty(
                id="eng",
                role="Eng Head",
                personality="collaborative",
                skill="expert",
                target={"eng": 22, "mkt": 14, "ops": 14, "timeline": 6},
                walk_away={"eng": 18, "mkt": 10, "ops": 22, "timeline": 3},
                weights={"eng": 0.4, "mkt": 0.2, "ops": 0.3, "timeline": 0.1}
            ),
            NegotiationParty(
                id="mkt",
                role="Mkt Head",
                personality="aggressive",
                skill="skilled",
                target={"eng": 18, "mkt": 20, "ops": 12, "timeline": 6},
                walk_away={"eng": 10, "mkt": 15, "ops": 25, "timeline": 3},
                weights={"eng": 0.2, "mkt": 0.5, "ops": 0.2, "timeline": 0.1}
            ),
            NegotiationParty(
                id="ops",
                role="Ops Head",
                personality="risk_averse",
                skill="expert",
                target={"eng": 18, "mkt": 12, "ops": 20, "timeline": 6},
                walk_away={"eng": 10, "mkt": 8, "ops": 32, "timeline": 3},
                weights={"eng": 0.2, "mkt": 0.1, "ops": 0.6, "timeline": 0.1}
            ),
        ],
        issues=[
            NegotiationIssue(id="eng", min=8, max=34, step=1),
            NegotiationIssue(id="mkt", min=6, max=30, step=1),
            NegotiationIssue(id="ops", min=5, max=28, step=1, derived=True),
            NegotiationIssue(id="timeline", min=3, max=9, step=1),
        ],
        opener_id="eng",
        rounds_limit=8,
        deadlock_after_stalled_rounds=3,
        climate="volatile",
        constraint=SumConstraint(type="sum", total=50, derived="ops", of=["eng", "mkt"]),
    )

    with patch('app.engine.llm_provider.create_provider') as mock_create:
        mock_provider = Mock()
        # Eng opens, Mkt counters, Ops counters, Eng accepts, Mkt accepts, Ops accepts
        mock_provider.complete.side_effect = [
            # Eng opens
            '{"action": "open", "reasoning_summary": "Opening", "message": "Budget proposal", "proposed_terms": {"eng": 22, "mkt": 14, "ops": 14, "timeline": 6}, "concessions": [], "confidence": 0.9}',
            # Mkt counters
            '{"action": "counter", "reasoning_summary": "Need more marketing", "message": "Counter", "proposed_terms": {"eng": 20, "mkt": 18, "ops": 12, "timeline": 6}, "concessions": [], "confidence": 0.7}',
            # Ops counters
            '{"action": "counter", "reasoning_summary": "Need more ops", "message": "Counter", "proposed_terms": {"eng": 18, "mkt": 14, "ops": 18, "timeline": 6}, "concessions": [], "confidence": 0.7}',
            # Eng accepts
            '{"action": "accept", "reasoning_summary": "Good", "message": "Accept", "proposed_terms": null, "concessions": [], "confidence": 0.8}',
            # Mkt accepts
            '{"action": "accept", "reasoning_summary": "Good", "message": "Accept", "proposed_terms": null, "concessions": [], "confidence": 0.8}',
            # Ops accepts
            '{"action": "accept", "reasoning_summary": "Good", "message": "Accept", "proposed_terms": null, "concessions": [], "confidence": 0.8}',
        ]
        mock_create.return_value = mock_provider

        result = run_negotiation("budget", "collaborative", "aggressive", 8, config=config)

        assert result["outcome"] == "deal"
        assert result["final_terms"] is not None
        # Budget sum should be 50
        terms = result["final_terms"]
        assert abs(terms["eng"] + terms["mkt"] + terms["ops"] - 50) < 1e-8


def test_orchestrator_reject_causes_breakdown():
    """Test that explicit reject causes breakdown."""
    config = make_vendor_config()

    with patch('app.engine.llm_provider.create_provider') as mock_create:
        mock_provider = Mock()
        # Vendor opens, Buyer rejects
        mock_provider.complete.side_effect = [
            '{"action": "open", "reasoning_summary": "Opening", "message": "Offer", "proposed_terms": {"price": 1250000, "delivery_days": 30, "warranty_months": 24, "payment_days": 30}, "concessions": [], "confidence": 0.9}',
            '{"action": "reject", "reasoning_summary": "Unacceptable", "message": "No deal", "proposed_terms": null, "concessions": [], "confidence": 0.9}',
        ]
        mock_create.return_value = mock_provider

        result = run_negotiation("vendor", "aggressive", "collaborative", 6, config=config)

        assert result["outcome"] == "breakdown"


def test_orchestrator_round_limit_deadlock():
    """Test that round limit causes deadlock."""
    config = make_vendor_config()
    config.rounds_limit = 2  # Very short limit

    with patch('app.engine.llm_provider.create_provider') as mock_create:
        mock_provider = Mock()
        # Keep countering without accepting
        mock_provider.complete.side_effect = [
            '{"action": "open", "reasoning_summary": "Opening", "message": "Offer", "proposed_terms": {"price": 1250000, "delivery_days": 30, "warranty_months": 24, "payment_days": 30}, "concessions": [], "confidence": 0.9}',
            '{"action": "counter", "reasoning_summary": "Counter", "message": "Counter", "proposed_terms": {"price": 1000000, "delivery_days": 20, "warranty_months": 18, "payment_days": 30}, "concessions": [], "confidence": 0.7}',
            '{"action": "counter", "reasoning_summary": "Counter", "message": "Counter", "proposed_terms": {"price": 1100000, "delivery_days": 25, "warranty_months": 18, "payment_days": 30}, "concessions": [], "confidence": 0.7}',
            '{"action": "counter", "reasoning_summary": "Counter", "message": "Counter", "proposed_terms": {"price": 1050000, "delivery_days": 25, "warranty_months": 18, "payment_days": 30}, "concessions": [], "confidence": 0.7}',
        ]
        mock_create.return_value = mock_provider

        result = run_negotiation("vendor", "aggressive", "collaborative", 2, config=config)

        assert result["outcome"] in ["deadlock", "breakdown"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])