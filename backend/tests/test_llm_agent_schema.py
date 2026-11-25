"""Tests for LLM Agent decision schemas."""

import pytest
from app.schemas.llm_negotiation import LLMAgentDecision, LLMAgentConfig, Concession
from app.models import Terms


def test_llm_agent_decision_validates_action():
    """Test that action field only accepts valid values."""
    terms = Terms(price=1100000, delivery_days=25, warranty_months=12, payment_days=30)

    # Valid actions with required proposed_terms
    for action in ["open", "counter"]:
        d = LLMAgentDecision(action=action, reasoning_summary="test", message="test", proposed_terms=terms)
        assert d.action == action

    # Valid actions without proposed_terms
    for action in ["accept", "reject"]:
        d = LLMAgentDecision(action=action, reasoning_summary="test", message="test", proposed_terms=None)
        assert d.action == action

    # Invalid action
    with pytest.raises(Exception):
        LLMAgentDecision(action="invalid", reasoning_summary="test", message="test", proposed_terms=terms)


def test_accept_decision_no_proposed_terms():
    """Test that accept action cannot have proposed_terms."""
    d = LLMAgentDecision(
        action="accept",
        reasoning_summary="good",
        message="I accept",
        proposed_terms=None
    )
    assert d.proposed_terms is None


def test_accept_decision_rejects_proposed_terms():
    """Test that accept with proposed_terms raises validation error."""
    terms = Terms(price=1100000, delivery_days=25, warranty_months=12, payment_days=30)
    with pytest.raises(ValueError, match="accept must not have proposed_terms"):
        LLMAgentDecision(
            action="accept",
            reasoning_summary="good",
            message="I accept",
            proposed_terms=terms
        )


def test_reject_decision_no_proposed_terms():
    """Test that reject action cannot have proposed_terms."""
    d = LLMAgentDecision(
        action="reject",
        reasoning_summary="bad",
        message="I reject",
        proposed_terms=None
    )
    assert d.proposed_terms is None


def test_reject_decision_rejects_proposed_terms():
    """Test that reject with proposed_terms raises validation error."""
    terms = Terms(price=1100000, delivery_days=25, warranty_months=12, payment_days=30)
    with pytest.raises(ValueError, match="reject must not have proposed_terms"):
        LLMAgentDecision(
            action="reject",
            reasoning_summary="bad",
            message="I reject",
            proposed_terms=terms
        )


def test_counter_requires_proposed_terms():
    """Test that counter action must have proposed_terms."""
    with pytest.raises(ValueError, match="counter must have proposed_terms"):
        LLMAgentDecision(
            action="counter",
            reasoning_summary="test",
            message="test",
            proposed_terms=None
        )


def test_open_requires_proposed_terms():
    """Test that open action must have proposed_terms."""
    with pytest.raises(ValueError, match="open must have proposed_terms"):
        LLMAgentDecision(
            action="open",
            reasoning_summary="test",
            message="test",
            proposed_terms=None
        )


def test_proposed_terms_validation():
    """Test that proposed_terms are properly validated."""
    terms = Terms(price=1100000, delivery_days=25, warranty_months=12, payment_days=30)
    d = LLMAgentDecision(
        action="counter",
        reasoning_summary="test",
        message="test",
        proposed_terms=terms
    )
    assert d.proposed_terms.price == 1100000
    assert d.proposed_terms.delivery_days == 25


def test_concessions_list():
    """Test that concessions list works correctly."""
    concessions = [
        Concession(issue="price", previous_value=1200000, new_value=1100000, reason="met halfway"),
        Concession(issue="delivery_days", previous_value=30, new_value=25, reason="trade for price"),
    ]
    d = LLMAgentDecision(
        action="counter",
        reasoning_summary="test",
        message="test",
        proposed_terms=Terms(price=1100000, delivery_days=25, warranty_months=12, payment_days=30),
        concessions=concessions,
    )
    assert len(d.concessions) == 2
    assert d.concessions[0].issue == "price"
    assert d.concessions[0].previous_value == 1200000
    assert d.concessions[0].new_value == 1100000


def test_confidence_bounds():
    """Test that confidence is bounded between 0 and 1."""
    # Valid confidence
    d = LLMAgentDecision(
        action="counter",
        reasoning_summary="test",
        message="test",
        proposed_terms=Terms(price=1100000, delivery_days=25, warranty_months=12, payment_days=30),
        confidence=0.75,
    )
    assert d.confidence == 0.75

    # Default confidence
    d2 = LLMAgentDecision(
        action="counter",
        reasoning_summary="test",
        message="test",
        proposed_terms=Terms(price=1100000, delivery_days=25, warranty_months=12, payment_days=30),
    )
    assert d2.confidence == 0.5

    # Invalid confidence > 1
    with pytest.raises(Exception):
        LLMAgentDecision(
            action="counter",
            reasoning_summary="test",
            message="test",
            proposed_terms=Terms(price=1100000, delivery_days=25, warranty_months=12, payment_days=30),
            confidence=1.5,
        )

    # Invalid confidence < 0
    with pytest.raises(Exception):
        LLMAgentDecision(
            action="counter",
            reasoning_summary="test",
            message="test",
            proposed_terms=Terms(price=1100000, delivery_days=25, warranty_months=12, payment_days=30),
            confidence=-0.1,
        )


def test_reasoning_summary_max_length():
    """Test reasoning_summary max length validation."""
    # Valid length
    d = LLMAgentDecision(
        action="counter",
        reasoning_summary="x" * 500,
        message="test",
        proposed_terms=Terms(price=1100000, delivery_days=25, warranty_months=12, payment_days=30),
    )
    assert len(d.reasoning_summary) == 500

    # Too long
    with pytest.raises(Exception):
        LLMAgentDecision(
            action="counter",
            reasoning_summary="x" * 501,
            message="test",
            proposed_terms=Terms(price=1100000, delivery_days=25, warranty_months=12, payment_days=30),
        )


def test_message_max_length():
    """Test message max length validation."""
    # Valid length
    d = LLMAgentDecision(
        action="counter",
        reasoning_summary="test",
        message="x" * 1000,
        proposed_terms=Terms(price=1100000, delivery_days=25, warranty_months=12, payment_days=30),
    )
    assert len(d.message) == 1000

    # Too long
    with pytest.raises(Exception):
        LLMAgentDecision(
            action="counter",
            reasoning_summary="test",
            message="x" * 1001,
            proposed_terms=Terms(price=1100000, delivery_days=25, warranty_months=12, payment_days=30),
        )


def test_llm_agent_config():
    """Test LLMAgentConfig creation."""
    config = LLMAgentConfig(
        agent_id="vendor",
        role="Vendor",
        personality="aggressive",
        skill_level="expert",
        target=Terms(price=1250000, delivery_days=30, warranty_months=24, payment_days=30),
        walk_away=Terms(price=1000000, delivery_days=45, warranty_months=6, payment_days=60),
        weights={"price": 0.5, "delivery": 0.2, "warranty": 0.2, "payment": 0.1},
        private_objectives="Maximize price, minimize delivery time",
        negotiation_priorities=["price", "delivery"],
        risk_tolerance=0.3,
        communication_style="assertive",
    )
    assert config.agent_id == "vendor"
    assert config.personality == "aggressive"
    assert config.skill_level == "expert"
    assert config.risk_tolerance == 0.3
    assert config.private_objectives == "Maximize price, minimize delivery time"


def test_llm_agent_config_defaults():
    """Test LLMAgentConfig default values."""
    config = LLMAgentConfig(
        agent_id="buyer",
        role="Buyer",
        personality="collaborative",
        skill_level="skilled",
        target=Terms(price=900000, delivery_days=15, warranty_months=36, payment_days=60),
        walk_away=Terms(price=1100000, delivery_days=30, warranty_months=12, payment_days=30),
        weights={"price": 0.4, "delivery": 0.3, "warranty": 0.2, "payment": 0.1},
    )
    assert config.risk_tolerance == 0.5
    assert config.communication_style == "professional"
    assert config.private_objectives is None
    assert config.negotiation_priorities is None


def test_concession_model():
    """Test Concession model."""
    c = Concession(
        issue="price",
        previous_value=1200000,
        new_value=1100000,
        reason="conceded to close deal",
    )
    assert c.issue == "price"
    assert c.previous_value == 1200000
    assert c.new_value == 1100000
    assert c.reason == "conceded to close deal"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])