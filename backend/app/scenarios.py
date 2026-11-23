from .models import AgentProfile, IssueTermField, NegotiationConfig, Terms


def build_configured_agents(config: NegotiationConfig) -> list[AgentProfile]:
    issue_ids = [issue.id for issue in config.issues]
    agents = []
    for party in config.parties:
        target = Terms(**{
            IssueTermField[issue_id]: party.target[issue_id]
            for issue_id in issue_ids
        })
        walk_away = Terms(**{
            IssueTermField[issue_id]: party.walk_away[issue_id]
            for issue_id in issue_ids
        })
        weights = {
            issue_id: party.weights.get(issue_id, 0.0)
            for issue_id in issue_ids
        }
        if not party.weights:
            weights = {issue_id: 1 / len(issue_ids) for issue_id in issue_ids}
        else:
            total_weight = sum(weights.values())
            weights = {
                issue_id: weight / total_weight
                for issue_id, weight in weights.items()
            }
        agents.append(AgentProfile(
            id=party.id,
            role=party.role,
            personality=party.personality,
            skill=party.skill,
            wants_higher_price=(
                party.target.get("price", party.target.get("salary", 0))
                >= party.walk_away.get("price", party.walk_away.get("salary", 0))
            ),
            target=target,
            batna=walk_away,
            weights=weights,
        ))
    return agents


def build_frontend_config(
    scenario: str,
    opener_personality: str,
    responder_personality: str,
    max_rounds: int,
    party_personalities: dict[str, str] | None = None,
    party_skills: dict[str, str] | None = None,
) -> NegotiationConfig:
    if scenario == "vendor":
        issues = [
            {"id": "price", "min": 900000, "max": 1300000, "step": 10000},
            {"id": "delivery", "min": 10, "max": 45, "step": 1},
            {"id": "warranty", "min": 6, "max": 36, "step": 6},
            {"id": "payment", "min": 0, "max": 60, "step": 15},
        ]
        parties = [
            {
                "id": "vendor", "role": "Supplier",
                "personality": "aggressive", "skill": "skilled",
                "target": {"price": 1250000, "delivery": 40, "warranty": 6, "payment": 0},
                "walk_away": {"price": 980000, "delivery": 12, "warranty": 30, "payment": 60},
                "weights": {"price": 0.5, "delivery": 0.15, "warranty": 0.2, "payment": 0.15},
            },
            {
                "id": "buyer", "role": "Buyer",
                "personality": "collaborative", "skill": "skilled",
                "target": {"price": 950000, "delivery": 15, "warranty": 24, "payment": 60},
                "walk_away": {"price": 1180000, "delivery": 40, "warranty": 6, "payment": 0},
                "weights": {"price": 0.45, "delivery": 0.25, "warranty": 0.2, "payment": 0.1},
            },
            {
                "id": "finance", "role": "Finance",
                "personality": "risk_averse", "skill": "expert",
                "target": {"price": 950000, "delivery": 20, "warranty": 24, "payment": 60},
                "walk_away": {"price": 1150000, "delivery": 45, "warranty": 6, "payment": 15},
                "weights": {"price": 0.5, "delivery": 0, "warranty": 0.2, "payment": 0.3},
            },
        ]
        opener_id = "vendor"
        responder_id = "buyer"
    elif scenario == "job":
        issues = [
            {"id": "salary", "min": 12, "max": 24, "step": 0.5},
            {"id": "bonus", "min": 0, "max": 3, "step": 0.25},
            {"id": "start", "min": 2, "max": 12, "step": 1},
            {"id": "remote", "min": 0, "max": 5, "step": 1},
        ]
        parties = [
            {
                "id": "candidate", "role": "Candidate",
                "personality": "collaborative", "skill": "skilled",
                "target": {"salary": 22, "bonus": 3, "start": 8, "remote": 4},
                "walk_away": {"salary": 15, "bonus": 0, "start": 3, "remote": 1},
                "weights": {"salary": 0.45, "bonus": 0.15, "start": 0.15, "remote": 0.25},
            },
            {
                "id": "recruiter", "role": "Recruiter",
                "personality": "collaborative", "skill": "skilled",
                "target": {"salary": 14, "bonus": 0, "start": 3, "remote": 2},
                "walk_away": {"salary": 21, "bonus": 2.5, "start": 10, "remote": 4},
                "weights": {"salary": 0.4, "bonus": 0.2, "start": 0.25, "remote": 0.15},
            },
            {
                "id": "manager", "role": "Hiring Mgr",
                "personality": "risk_averse", "skill": "skilled",
                "target": {"salary": 15, "bonus": 0, "start": 2, "remote": 1},
                "walk_away": {"salary": 22, "bonus": 3, "start": 8, "remote": 4},
                "weights": {"salary": 0.2, "bonus": 0, "start": 0.5, "remote": 0.3},
            },
        ]
        opener_id = "recruiter"
        responder_id = "candidate"
    elif scenario == "budget":
        issues = [
            {"id": "eng", "min": 8, "max": 34, "step": 1},
            {"id": "mkt", "min": 6, "max": 30, "step": 1},
            {"id": "ops", "min": 5, "max": 28, "step": 1, "derived": True},
            {"id": "timeline", "min": 3, "max": 9, "step": 1},
        ]
        parties = [
            {
                "id": "eng", "role": "Eng Head",
                "personality": "aggressive", "skill": "skilled",
                "target": {"eng": 28, "mkt": 14, "ops": 8, "timeline": 9},
                "walk_away": {"eng": 14, "mkt": 30, "ops": 6, "timeline": 4},
                "weights": {"eng": 0.65, "mkt": 0, "ops": 0, "timeline": 0.35},
            },
            {
                "id": "mkt", "role": "Mkt Head",
                "personality": "collaborative", "skill": "skilled",
                "target": {"eng": 10, "mkt": 22, "ops": 18, "timeline": 4},
                "walk_away": {"eng": 30, "mkt": 10, "ops": 10, "timeline": 9},
                "weights": {"eng": 0, "mkt": 0.7, "ops": 0, "timeline": 0.3},
            },
            {
                "id": "ops", "role": "Ops Head",
                "personality": "risk_averse", "skill": "skilled",
                "target": {"eng": 10, "mkt": 22, "ops": 18, "timeline": 7},
                "walk_away": {"eng": 30, "mkt": 12, "ops": 8, "timeline": 3},
                "weights": {"eng": 0, "mkt": 0, "ops": 0.6, "timeline": 0.4},
            },
        ]
        opener_id = "eng"
        responder_id = "mkt"
    else:
        raise ValueError(f"frontend config is available for vendor, job, and budget scenarios (got: {scenario})")

    personalities = party_personalities or {}
    skills = party_skills or {}
    for party in parties:
        if party["id"] == opener_id:
            party["personality"] = opener_personality
        elif party["id"] == responder_id:
            party["personality"] = responder_personality
        party["personality"] = personalities.get(party["id"], party["personality"])
        party["skill"] = skills.get(party["id"], party["skill"])

    config_data = {
        "parties": parties,
        "issues": issues,
        "opener_id": opener_id,
        "rounds_limit": max_rounds,
        "deadlock_after_stalled_rounds": 3,
    }
    if scenario == "budget":
        config_data["constraint"] = {
            "type": "sum",
            "total": 50,
            "derived": "ops",
            "of": ["eng", "mkt"],
        }
    return NegotiationConfig.model_validate(config_data)


def build_scenario(name: str, opener_personality: str, responder_personality: str):
    """Returns (opener, responder). The opener makes the first offer."""
    if name == "vendor":
        opener = AgentProfile(
            id="supplier", role="Supplier", personality=opener_personality,
            wants_higher_price=True,
            target=Terms(price=1200000, delivery_days=30, warranty_months=6, payment_days=15),
            batna=Terms(price=900000, delivery_days=45, warranty_months=6, payment_days=45),
            weights={"price": 0.4, "delivery": 0.25, "warranty": 0.2, "payment": 0.15})
        responder = AgentProfile(
            id="buyer", role="Buyer", personality=responder_personality,
            wants_higher_price=False,
            target=Terms(price=950000, delivery_days=20, warranty_months=12, payment_days=60),
            batna=Terms(price=1150000, delivery_days=40, warranty_months=6, payment_days=30),
            weights={"price": 0.35, "delivery": 0.3, "warranty": 0.2, "payment": 0.15})

    elif name == "job":   # price = salary (LPA), days = joining time, warranty = benefits months
        opener = AgentProfile(
            id="candidate", role="Candidate", personality=opener_personality,
            wants_higher_price=True,
            target=Terms(salary=22, bonus=3, start=8, remote=4,
                         price=2200000, delivery_days=8, warranty_months=3, payment_days=4),
            batna=Terms(salary=15, bonus=0, start=3, remote=1,
                        price=1500000, delivery_days=12, warranty_months=1, payment_days=1),
            weights={"price": 0.5, "delivery": 0.1, "warranty": 0.25, "payment": 0.15})
        responder = AgentProfile(
            id="employer", role="Employer", personality=responder_personality,
            wants_higher_price=False,
            target=Terms(salary=14, bonus=0, start=3, remote=2,
                         price=1400000, delivery_days=3, warranty_months=0, payment_days=2),
            batna=Terms(salary=21, bonus=2.5, start=10, remote=4,
                        price=2100000, delivery_days=10, warranty_months=3, payment_days=4),
            weights={"price": 0.45, "delivery": 0.25, "warranty": 0.15, "payment": 0.15})

    elif name == "budget":   # price = budget (lakhs), days = timeline, warranty = support months
        opener = AgentProfile(
            id="project_lead", role="Project Lead", personality=opener_personality,
            wants_higher_price=True,
            target=Terms(eng=28, mkt=14, ops=8, timeline=9,
                         price=28, delivery_days=9, warranty_months=8, payment_days=14),
            batna=Terms(eng=14, mkt=30, ops=6, timeline=4,
                        price=14, delivery_days=4, warranty_months=6, payment_days=30),
            weights={"price": 0.65, "delivery": 0.1, "warranty": 0.1, "payment": 0.15})
        responder = AgentProfile(
            id="finance", role="Finance", personality=responder_personality,
            wants_higher_price=False,
            target=Terms(eng=18, mkt=10, ops=22, timeline=6,
                         price=18, delivery_days=6, warranty_months=22, payment_days=10),
            batna=Terms(eng=34, mkt=6, ops=10, timeline=9,
                        price=34, delivery_days=9, warranty_months=10, payment_days=6),
            weights={"price": 0.25, "delivery": 0.15, "warranty": 0.35, "payment": 0.25})
    else:
        raise ValueError("scenario must be vendor, job, or budget")

    return opener, responder