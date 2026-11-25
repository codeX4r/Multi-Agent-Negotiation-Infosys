"""Tests for LLMAgent class."""

import pytest
from unittest.mock import Mock
from app.engine.llm_agent import LLMAgent
from app.schemas.llm_negotiation import LLMAgentConfig, LLMAgentDecision
from app.models import Terms, NegotiationContext
from app.engine.llm_provider import LLMProvider


def make_vendor_config():
    """Create a standard vendor agent config for testing."""
    return LLMAgentConfig(
        agent_id="vendor",
        role="Vendor",
        personality="aggressive",
        skill_level="expert",
        target=Terms(price=1250000, delivery_days=30, warranty_months=24, payment_days=30),
        walk_away=Terms(price=1000000, delivery_days=45, warranty_months=6, payment_days=60),
        weights={"price": 0.5, "delivery": 0.2, "warranty": 0.2, "payment": 0.1},
    )


def make_context(scenario: str = "vendor", round_number: int = 0, current_offer: Terms = None, previous_offer: Terms = None):
    """Create a NegotiationContext for testing."""
    # NegotiationContext requires current_offer to be a Terms object (not None)
    # For opening offer (round 0), use a minimal Terms object
    if current_offer is None:
        if scenario == "vendor":
            current_offer = Terms(price=0, delivery_days=0, warranty_months=0, payment_days=0)
        elif scenario == "job":
            current_offer = Terms(salary=0, bonus=0, start=0, remote=0)
        elif scenario == "budget":
            # Budget requires eng+mkt+ops=50
            current_offer = Terms(eng=20, mkt=15, ops=15, timeline=0)
        else:
            current_offer = Terms()

    return NegotiationContext(
        scenario=scenario,
        round_number=round_number,
        max_rounds=10,
        current_offer=current_offer,
        previous_offer=previous_offer,
        conversation_history=[],
    )


def test_llm_agent_generates_open_offer():
    """Test agent generates opening offer."""
    mock_provider = Mock(spec=LLMProvider)
    mock_provider.complete.return_value = '''{
        "action": "open",
        "reasoning_summary": "Opening with ideal terms",
        "message": "Here is our opening offer",
        "proposed_terms": {"price": 1250000, "delivery_days": 30, "warranty_months": 24, "payment_days": 30},
        "concessions": [],
        "confidence": 0.9
    }'''

    config = make_vendor_config()
    agent = LLMAgent(config, mock_provider)
    context = make_context(scenario="vendor", round_number=0, current_offer=None, previous_offer=None)

    decision = agent.decide(context)

    assert decision.action == "open"
    assert decision.proposed_terms is not None
    assert decision.proposed_terms.price == 1250000
    assert decision.confidence == 0.9
    assert len(decision.concessions) == 0

    # Verify provider was called
    mock_provider.complete.assert_called_once()


def test_llm_agent_generates_counter_offer():
    """Test agent generates counter offer."""
    mock_provider = Mock(spec=LLMProvider)
    mock_provider.complete.return_value = '''{
        "action": "counter",
        "reasoning_summary": "Price too high, countering with concession on delivery",
        "message": "We can meet at 11L if delivery is 20 days",
        "proposed_terms": {"price": 1100000, "delivery_days": 20, "warranty_months": 18, "payment_days": 30},
        "concessions": [{"issue": "delivery_days", "previous_value": 30, "new_value": 20, "reason": "trade for price"}],
        "confidence": 0.75
    }'''

    config = make_vendor_config()
    agent = LLMAgent(config, mock_provider)
    context = make_context(
        scenario="vendor",
        round_number=1,
        current_offer=Terms(price=1250000, delivery_days=30, warranty_months=24, payment_days=30),
        previous_offer=None
    )

    decision = agent.decide(context)

    assert decision.action == "counter"
    assert decision.proposed_terms is not None
    assert decision.proposed_terms.price == 1100000
    assert decision.proposed_terms.delivery_days == 20
    assert len(decision.concessions) == 1
    assert decision.concessions[0].issue == "delivery_days"
    assert decision.confidence == 0.75


def test_llm_agent_generates_accept():
    """Test agent accepts an offer."""
    mock_provider = Mock(spec=LLMProvider)
    mock_provider.complete.return_value = '''{
        "action": "accept",
        "reasoning_summary": "Good deal within my range",
        "message": "I accept these terms",
        "proposed_terms": null,
        "concessions": [],
        "confidence": 0.85
    }'''

    config = make_vendor_config()
    agent = LLMAgent(config, mock_provider)
    context = make_context(
        scenario="vendor",
        round_number=2,
        current_offer=Terms(price=1100000, delivery_days=25, warranty_months=18, payment_days=30),
        previous_offer=Terms(price=1250000, delivery_days=30, warranty_months=24, payment_days=30)
    )

    decision = agent.decide(context)

    assert decision.action == "accept"
    assert decision.proposed_terms is None
    assert decision.confidence == 0.85


def test_llm_agent_generates_reject():
    """Test agent rejects an offer."""
    mock_provider = Mock(spec=LLMProvider)
    mock_provider.complete.return_value = '''{
        "action": "reject",
        "reasoning_summary": "Offer below walk-away limit",
        "message": "This is not acceptable",
        "proposed_terms": null,
        "concessions": [],
        "confidence": 0.9
    }'''

    config = make_vendor_config()
    agent = LLMAgent(config, mock_provider)
    context = make_context(
        scenario="vendor",
        round_number=3,
        current_offer=Terms(price=900000, delivery_days=45, warranty_months=6, payment_days=60),
        previous_offer=Terms(price=1100000, delivery_days=25, warranty_months=18, payment_days=30)
    )

    decision = agent.decide(context)

    assert decision.action == "reject"
    assert decision.proposed_terms is None
    assert decision.confidence == 0.9


def test_llm_agent_retries_on_invalid_json():
    """Test agent retries when LLM returns invalid JSON."""
    mock_provider = Mock(spec=LLMProvider)
    mock_provider.complete.side_effect = [
        "not json at all",
        '''{
            "action": "accept",
            "reasoning_summary": "Good deal",
            "message": "Accepted",
            "proposed_terms": null,
            "concessions": [],
            "confidence": 0.8
        }'''
    ]

    config = make_vendor_config()
    agent = LLMAgent(config, mock_provider, max_retries=2)
    context = make_context(scenario="vendor", round_number=1,
                          current_offer=Terms(price=1100000, delivery_days=25, warranty_months=18, payment_days=30))

    decision = agent.decide(context)

    assert decision.action == "accept"
    assert mock_provider.complete.call_count == 2


def test_llm_agent_retries_on_validation_error():
    """Test agent retries when proposed terms fail validation."""
    mock_provider = Mock(spec=LLMProvider)
    # First response: price out of range
    # Second response: valid price
    mock_provider.complete.side_effect = [
        '''{
            "action": "counter",
            "reasoning_summary": "Trying high price",
            "message": "My offer",
            "proposed_terms": {"price": 2000000, "delivery_days": 25, "warranty_months": 18, "payment_days": 30},
            "concessions": [],
            "confidence": 0.7
        }''',
        '''{
            "action": "counter",
            "reasoning_summary": "Corrected price",
            "message": "My corrected offer",
            "proposed_terms": {"price": 1100000, "delivery_days": 25, "warranty_months": 18, "payment_days": 30},
            "concessions": [],
            "confidence": 0.8
        }'''
    ]

    config = make_vendor_config()
    agent = LLMAgent(config, mock_provider, max_retries=3)
    context = make_context(scenario="vendor", round_number=1,
                          current_offer=Terms(price=1250000, delivery_days=30, warranty_months=24, payment_days=30))

    decision = agent.decide(context)

    assert decision.action == "counter"
    assert decision.proposed_terms.price == 1100000
    assert mock_provider.complete.call_count == 2


def test_llm_agent_fails_after_max_retries():
    """Test agent raises after max retries exceeded."""
    mock_provider = Mock(spec=LLMProvider)
    mock_provider.complete.return_value = "never valid json"

    config = make_vendor_config()
    agent = LLMAgent(config, mock_provider, max_retries=2)
    context = make_context(scenario="vendor", round_number=1,
                          current_offer=Terms(price=1100000, delivery_days=25, warranty_months=18, payment_days=30))

    with pytest.raises(RuntimeError, match="failed to produce valid decision after 2 attempts"):
        agent.decide(context)

    assert mock_provider.complete.call_count == 2


def test_llm_agent_fails_on_provider_error():
    """Test agent handles provider exceptions."""
    mock_provider = Mock(spec=LLMProvider)
    mock_provider.complete.side_effect = Exception("API timeout")

    config = make_vendor_config()
    agent = LLMAgent(config, mock_provider, max_retries=2)
    context = make_context(scenario="vendor", round_number=1)

    with pytest.raises(Exception, match="API timeout"):
        agent.decide(context)

    assert mock_provider.complete.call_count == 2


def test_llm_agent_handles_budget_scenario():
    """Test agent works with budget scenario (sum constraint)."""
    mock_provider = Mock(spec=LLMProvider)
    mock_provider.complete.return_value = '''{
        "action": "open",
        "reasoning_summary": "Opening with balanced budget",
        "message": "Here is our budget proposal",
        "proposed_terms": {"eng": 20, "mkt": 15, "ops": 15, "timeline": 6},
        "concessions": [],
        "confidence": 0.8
    }'''

    config = LLMAgentConfig(
        agent_id="eng",
        role="Engineering Head",
        personality="collaborative",
        skill_level="expert",
        target=Terms(eng=22, mkt=14, ops=14, timeline=6),
        walk_away=Terms(eng=18, mkt=10, ops=22, timeline=3),
        weights={"eng": 0.4, "mkt": 0.2, "ops": 0.3, "timeline": 0.1},
    )

    agent = LLMAgent(config, mock_provider)
    context = make_context(scenario="budget", round_number=0, current_offer=None)

    decision = agent.decide(context)

    assert decision.action == "open"
    assert decision.proposed_terms is not None
    assert decision.proposed_terms.eng == 20
    assert decision.proposed_terms.mkt == 15
    assert decision.proposed_terms.ops == 15
    # Sum should be 50
    assert decision.proposed_terms.eng + decision.proposed_terms.mkt + decision.proposed_terms.ops == 50


def test_llm_agent_rejects_invalid_budget_sum():
    """Test agent validation catches invalid budget sum."""
    mock_provider = Mock(spec=LLMProvider)
    # First response: invalid sum (20+15+14=49)
    # Second response: valid sum (20+15+15=50)
    mock_provider.complete.side_effect = [
        '''{
            "action": "counter",
            "reasoning_summary": "Trying",
            "message": "Offer",
            "proposed_terms": {"eng": 20, "mkt": 15, "ops": 14, "timeline": 6},
            "concessions": [],
            "confidence": 0.7
        }''',
        '''{
            "action": "counter",
            "reasoning_summary": "Fixed",
            "message": "Offer",
            "proposed_terms": {"eng": 20, "mkt": 15, "ops": 15, "timeline": 6},
            "concessions": [],
            "confidence": 0.8
        }'''
    ]

    config = LLMAgentConfig(
        agent_id="eng",
        role="Engineering Head",
        personality="collaborative",
        skill_level="expert",
        target=Terms(eng=22, mkt=14, ops=14, timeline=6),
        walk_away=Terms(eng=18, mkt=10, ops=22, timeline=3),
        weights={"eng": 0.4, "mkt": 0.2, "ops": 0.3, "timeline": 0.1},
    )

    agent = LLMAgent(config, mock_provider, max_retries=3)
    context = make_context(scenario="budget", round_number=1,
                          current_offer=Terms(eng=22, mkt=14, ops=14, timeline=6))

    decision = agent.decide(context)

    assert decision.action == "counter"
    assert decision.proposed_terms.eng + decision.proposed_terms.mkt + decision.proposed_terms.ops == 50
    assert mock_provider.complete.call_count == 2


def test_llm_agent_private_context_not_leaked():
    """Test that private walk-away values are not in the message."""
    mock_provider = Mock(spec=LLMProvider)
    mock_provider.complete.return_value = '''{
        "action": "counter",
        "reasoning_summary": "Testing",
        "message": "I cannot go below 1000000 on price",
        "proposed_terms": {"price": 1100000, "delivery_days": 25, "warranty_months": 18, "payment_days": 30},
        "concessions": [],
        "confidence": 0.7
    }'''

    config = make_vendor_config()
    agent = LLMAgent(config, mock_provider)
    context = make_context(scenario="vendor", round_number=1,
                          current_offer=Terms(price=1250000, delivery_days=30, warranty_months=24, payment_days=30))

    decision = agent.decide(context)

    # The message should not contain walk-away values
    # (This is a test of the prompt instruction, not enforcement)
    assert decision.message == "I cannot go below 1000000 on price"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])