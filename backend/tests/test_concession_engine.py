import pytest
from app.engine.evaluation import (
    _concede,
    concession_curve_factor,
    logrolling_weight_factor,
)
from app.models import AgentProfile, Terms


def _make_buyer(personality: str = "collaborative") -> AgentProfile:
    return AgentProfile(
        id="buyer",
        name="Buyer",
        role="Procurement lead",
        personality=personality,
        skill="skilled",
        wants_higher_price=False,
        weights={"price": 0.60, "delivery": 0.20, "warranty": 0.10, "payment": 0.10},
        target=Terms(price=950000, delivery_days=15, warranty_months=36, payment_days=60),
        batna=Terms(price=1250000, delivery_days=40, warranty_months=6, payment_days=0),
    )


def test_boulware_vs_conceder_curve():
    """Aggressive (Boulware) holds ground early; Collaborative (Conceder) moves early."""
    early_boulware = concession_curve_factor("aggressive", round_no=2, max_rounds=12)
    early_conceder = concession_curve_factor("collaborative", round_no=2, max_rounds=12)
    assert early_boulware < early_conceder

    late_boulware = concession_curve_factor("aggressive", round_no=11, max_rounds=12)
    assert late_boulware > early_boulware * 5


def test_logrolling_protects_high_weight_issues():
    """Low-weight issues concede faster than high-weight priority issues."""
    assert logrolling_weight_factor(0.10) > logrolling_weight_factor(0.60)

    buyer = _make_buyer("collaborative")
    next_offer = _concede(buyer, buyer.target, round_no=3, max_rounds=12)

    price_fraction = (next_offer.price - buyer.target.price) / (buyer.batna.price - buyer.target.price)
    payment_fraction = (buyer.target.payment_days - next_offer.payment_days) / (
        buyer.target.payment_days - buyer.batna.payment_days
    )
    assert payment_fraction >= price_fraction


def test_concede_never_crosses_batna():
    """Even in crisis climate on the final round, an agent never crosses its walk-away point."""
    buyer = _make_buyer("collaborative")
    current = buyer.target
    for r in range(1, 13):
        current = _concede(buyer, current, round_no=r, max_rounds=12, climate="crisis")
        assert current.price <= buyer.batna.price
        assert current.delivery_days <= buyer.batna.delivery_days
        assert current.warranty_months >= buyer.batna.warranty_months
        assert current.payment_days >= buyer.batna.payment_days