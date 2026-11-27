from app.engine.analytics import analyze_zopa, pareto_efficiency
from app.models import AgentProfile, NegotiationIssue, Terms


def _vendor_issues() -> list[NegotiationIssue]:
    return [
        NegotiationIssue(id="price", label="Price", min=900000, max=1300000, step=10000),
        NegotiationIssue(id="delivery", label="Delivery Days", min=10, max=45, step=5),
        NegotiationIssue(id="warranty", label="Warranty Months", min=6, max=36, step=6),
        NegotiationIssue(id="payment", label="Payment Days", min=0, max=60, step=15),
    ]


def _make_pair(seller_batna_price: int = 1050000, buyer_batna_price: int = 1200000):
    seller = AgentProfile(
        id="seller",
        name="Vendor",
        role="Supplier",
        personality="collaborative",
        skill="skilled",
        wants_higher_price=True,
        weights={"price": 0.60, "delivery": 0.10, "warranty": 0.15, "payment": 0.15},
        target=Terms(price=1300000, delivery_days=45, warranty_months=6, payment_days=0),
        batna=Terms(price=seller_batna_price, delivery_days=15, warranty_months=30, payment_days=45),
    )
    buyer = AgentProfile(
        id="buyer",
        name="Buyer",
        role="Procurement",
        personality="collaborative",
        skill="skilled",
        wants_higher_price=False,
        weights={"price": 0.20, "delivery": 0.40, "warranty": 0.25, "payment": 0.15},
        target=Terms(price=900000, delivery_days=10, warranty_months=36, payment_days=60),
        batna=Terms(price=buyer_batna_price, delivery_days=40, warranty_months=12, payment_days=15),
    )
    return [seller, buyer]


def test_zopa_detects_feasible_overlap():
    """When seller BATNA (10.5L) <= buyer BATNA (12.0L), ZOPA exists."""
    agents = _make_pair(seller_batna_price=1050000, buyer_batna_price=1200000)
    report = analyze_zopa(agents, _vendor_issues())

    assert report["deal_possible"] is True
    assert report["issues"]["price"]["has_zopa"] is True
    assert report["issues"]["price"]["low"] == 1050000
    assert report["issues"]["price"]["high"] == 1200000
    assert report["issues"]["price"]["width"] == 150000


def test_zopa_flags_impossible_deal():
    """When seller BATNA (12.5L) > buyer BATNA (10.0L), no ZOPA exists."""
    agents = _make_pair(seller_batna_price=1250000, buyer_batna_price=1000000)
    report = analyze_zopa(agents, _vendor_issues())

    assert report["deal_possible"] is False
    assert report["issues"]["price"]["has_zopa"] is False
    assert report["issues"]["price"]["width"] == 0.0


def test_pareto_detects_suboptimal_vs_integrative_deal():
    """A flat middle-ground deal leaves value on the table compared to a logrolled trade."""
    agents = _make_pair()
    issues = _vendor_issues()

    # Suboptimal: seller gives up price (their top priority) AND buyer gets slow delivery (their top priority)
    weak_deal = Terms(price=1050000, delivery_days=40, warranty_months=12, payment_days=15)
    weak_report = pareto_efficiency(agents, weak_deal, issues)

    # Integrative trade: high price for seller + fast delivery & long warranty for buyer
    strong_deal = Terms(price=1200000, delivery_days=15, warranty_months=30, payment_days=30)
    strong_report = pareto_efficiency(agents, strong_deal, issues)

    assert weak_report["is_pareto_optimal"] is False
    assert weak_report["value_left_on_table"] > 0
    assert strong_report["efficiency_score"] > weak_report["efficiency_score"]