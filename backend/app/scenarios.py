from .models import AgentProfile, Terms


def build_scenario(name: str, opener_personality: str, responder_personality: str):
    """Returns (opener, responder). The opener makes the first offer."""
    if name == "vendor":
        opener = AgentProfile(
            id="supplier", role="Supplier", personality=opener_personality,
            wants_higher_price=True,
            target=Terms(price=12000, delivery_days=30, warranty_months=6),
            batna=Terms(price=9000, delivery_days=45, warranty_months=3))
        responder = AgentProfile(
            id="buyer", role="Buyer", personality=responder_personality,
            wants_higher_price=False,
            target=Terms(price=9500, delivery_days=20, warranty_months=12),
            batna=Terms(price=11500, delivery_days=40, warranty_months=6),
            weights={"price": 0.4, "delivery": 0.4, "warranty": 0.2})

    elif name == "job":   # price = salary (LPA), days = joining time, warranty = benefits months
        opener = AgentProfile(
            id="candidate", role="Candidate", personality=opener_personality,
            wants_higher_price=True,
            target=Terms(price=1800000, delivery_days=45, warranty_months=12),
            batna=Terms(price=1400000, delivery_days=60, warranty_months=6),
            weights={"price": 0.6, "delivery": 0.1, "warranty": 0.3})
        responder = AgentProfile(
            id="employer", role="Employer", personality=responder_personality,
            wants_higher_price=False,
            target=Terms(price=1400000, delivery_days=15, warranty_months=6),
            batna=Terms(price=1900000, delivery_days=60, warranty_months=12),
            weights={"price": 0.5, "delivery": 0.3, "warranty": 0.2})

    elif name == "budget":   # price = budget (lakhs), days = timeline, warranty = support months
        opener = AgentProfile(
            id="project_lead", role="Project Lead", personality=opener_personality,
            wants_higher_price=True,
            target=Terms(price=5000000, delivery_days=90, warranty_months=12),
            batna=Terms(price=3500000, delivery_days=120, warranty_months=6),
            weights={"price": 0.5, "delivery": 0.2, "warranty": 0.3})
        responder = AgentProfile(
            id="finance", role="Finance", personality=responder_personality,
            wants_higher_price=False,
            target=Terms(price=3000000, delivery_days=60, warranty_months=6),
            batna=Terms(price=4800000, delivery_days=110, warranty_months=10),
            weights={"price": 0.6, "delivery": 0.2, "warranty": 0.2})
    else:
        raise ValueError("scenario must be vendor, job, or budget")

    return opener, responder