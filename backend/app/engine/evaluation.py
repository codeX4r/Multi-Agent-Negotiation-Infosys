from app.models import (
    AgentProfile,
    Decision,
    NegotiationContext,
    NegotiationIssue,
    SumConstraint,
    Terms,
)

# How fast each personality gives ground (0 = never, 1 = jumps to the other side)
CONCESSION_RATE = {
    "aggressive": 0.10,
    "collaborative": 0.25,
    "risk_averse": 0.15,
}

# Base pressure per climate — higher pressure makes agents concede faster.
# Mirrors the frontend CLIMATES table (stable/volatile/crisis).
CLIMATE_PRESSURE = {
    "stable": 0.12,
    "volatile": 0.32,
    "crisis": 0.55,
}


def _score(value: float, worst: float, best: float) -> float:
    """Scale a value to 0..1 where 0 = walk-away point and 1 = ideal."""
    if best == worst:
        return 1.0
    s = (value - worst) / (best - worst)
    return max(0.0, min(1.0, s))


def _term_field(issue: NegotiationIssue) -> str:
    return {
        "price": "price",
        "delivery": "delivery_days",
        "warranty": "warranty_months",
        "payment": "payment_days",
        "salary": "salary",
        "bonus": "bonus",
        "start": "start",
        "remote": "remote",
        "eng": "eng",
        "mkt": "mkt",
        "ops": "ops",
        "timeline": "timeline",
    }[issue.id]


def utility(
    agent: AgentProfile,
    offer: Terms,
    issues: list[NegotiationIssue] | None = None,
) -> float:
    """How happy the agent is with an offer, from 0 (bad) to 1 (ideal)."""
    if issues is not None:
        score = 0.0
        for issue in issues:
            field = _term_field(issue)
            score += agent.weights.get(issue.id, 0.0) * _score(
                getattr(offer, field),
                getattr(agent.batna, field),
                getattr(agent.target, field),
            )
        return round(score, 3)

    w = agent.weights
    u = (
        w["price"] * _score(offer.price, agent.batna.price, agent.target.price)
        + w["delivery"] * _score(offer.delivery_days, agent.batna.delivery_days, agent.target.delivery_days)
        + w["warranty"] * _score(offer.warranty_months, agent.batna.warranty_months, agent.target.warranty_months)
        + w.get("payment", 0.0) * _score(offer.payment_days, agent.batna.payment_days, agent.target.payment_days)
    )
    return round(u, 3)


def _beyond_batna(
    agent: AgentProfile,
    offer: Terms,
    issues: list[NegotiationIssue] | None = None,
) -> bool:
    """True if any term is worse than the agent's walk-away point."""
    if issues is not None:
        return first_issue_beyond_batna(agent, offer, issues) is not None

    b = agent.batna
    if agent.wants_higher_price:
        price_bad = offer.price < b.price
    else:
        price_bad = offer.price > b.price
    payment_bad = (
        offer.payment_days > b.payment_days
        if agent.wants_higher_price
        else offer.payment_days < b.payment_days
    )
    # Lower delivery days is always better; more warranty is always better
    return (
        price_bad
        or offer.delivery_days > b.delivery_days
        or offer.warranty_months < b.warranty_months
        or payment_bad
    )


def first_issue_beyond_batna(
    agent: AgentProfile,
    offer: Terms,
    issues: list[NegotiationIssue],
) -> int | None:
    for index, issue in enumerate(issues):
        field = _term_field(issue)
        value = getattr(offer, field)
        target = getattr(agent.target, field)
        walk_away = getattr(agent.batna, field)
        if target > walk_away and value < walk_away:
            return index
        if target < walk_away and value > walk_away:
            return index
        if target == walk_away and value != walk_away:
            return index
    return None


def _concede(
    agent: AgentProfile,
    current: Terms,
    round_no: int,
    max_rounds: int,
    issues: list[NegotiationIssue] | None = None,
    constraint: SumConstraint | None = None,
    climate: str = "volatile",
) -> Terms:
    """Move the agent's own position toward its walk-away point."""
    rate = CONCESSION_RATE[agent.personality]
    pressure = 1 + (round_no / max_rounds)      # concede faster as time runs out
    climate_pressure = 1 + CLIMATE_PRESSURE.get(climate, 0.32)  # crisis gives more ground per step
    step = min(1.0, rate * pressure * climate_pressure)

    if issues is not None:
        values = {}
        for issue in issues:
            field = _term_field(issue)
            now = getattr(current, field)
            if constraint is not None and issue.id == constraint.derived:
                continue
            walk_away = getattr(agent.batna, field)
            if now == walk_away:
                values[field] = now
                continue

            raw = now + (walk_away - now) * step * 0.5
            units = round((raw - issue.min) / issue.step)
            value = issue.min + units * issue.step
            value = max(issue.min, min(issue.max, value))
            if walk_away > now:
                value = min(value, walk_away)
                if value <= now:
                    value = min(walk_away, now + issue.step)
            else:
                value = max(value, walk_away)
                if value >= now:
                    value = max(walk_away, now - issue.step)
            value = max(issue.min, min(issue.max, value))
            values[field] = int(value) if float(value).is_integer() else value
        if constraint is not None:
            fields_by_id = {issue.id: _term_field(issue) for issue in issues}
            derived_field = fields_by_id[constraint.derived]
            values[derived_field] = constraint.total - sum(
                values.get(field, getattr(current, field))
                for issue_id in constraint.of
                for field in (fields_by_id[issue_id],)
            )
        return Terms.model_validate({**current.model_dump(), **values})

    specs = (
        ("price", 900000, 1300000, 10000),
        ("delivery_days", 10, 45, 1),
        ("warranty_months", 6, 36, 6),
        ("payment_days", 0, 60, 15),
    )

    def snap(value: float, minimum: int, issue_step: int) -> int:
        return int(minimum + round((value - minimum) / issue_step) * issue_step)

    def move(name: str, now: int | float, batna: int | float,
             minimum: int, maximum: int, issue_step: int) -> int:
        raw = now + (batna - now) * step * 0.5
        value = snap(raw, minimum, issue_step)
        value = max(minimum, min(maximum, value))

        if batna > now:
            value = max(value, min(int(now) + issue_step, int(batna)))
        elif batna < now:
            value = min(value, max(int(now) - issue_step, int(batna)))

        value = max(minimum, min(maximum, value))
        if batna > now:
            value = min(value, int(batna))
        else:
            value = max(value, int(batna))
        return int(value)

    values = {
        "price": move("price", current.price, agent.batna.price, 900000, 1300000, 10000),
        "delivery_days": move("delivery_days", current.delivery_days, agent.batna.delivery_days, 10, 45, 1),
        "warranty_months": move("warranty_months", current.warranty_months, agent.batna.warranty_months, 6, 36, 6),
        "payment_days": move("payment_days", current.payment_days, agent.batna.payment_days, 0, 60, 15),
    }

    selected_name = specs[(round_no - 1) % len(specs)][0]
    selected_minimum, selected_maximum, selected_step = next(
        (minimum, maximum, issue_step)
        for name, minimum, maximum, issue_step in specs
        if name == selected_name
    )
    now = getattr(current, selected_name)
    batna = getattr(agent.batna, selected_name)
    selected = values[selected_name]
    if now != batna and selected == now:
        if batna > now:
            selected = min(int(batna), int(now) + selected_step)
        else:
            selected = max(int(batna), int(now) - selected_step)
        selected = max(selected_minimum, min(selected_maximum, selected))
        values[selected_name] = int(selected)

    return Terms(
        price=values["price"],
        delivery_days=values["delivery_days"],
        warranty_months=values["warranty_months"],
        payment_days=values["payment_days"],
    )


def evaluate_offer(agent: AgentProfile, incoming: Terms, my_last: Terms | None,
                   round_no: int, max_rounds: int = 12, *,
                   context: NegotiationContext | None = None,
                   issues: list[NegotiationIssue] | None = None,
                   constraint: SumConstraint | None = None,
                   climate: str = "volatile") -> Decision:
    if context is not None:
        incoming = context.current_offer
        my_last = context.previous_offer
        round_no = context.round_number
        max_rounds = context.max_rounds

    u = utility(agent, incoming, issues)

    if _beyond_batna(agent, incoming, issues):
        # Still counter if time remains, otherwise reject outright
        if round_no >= max_rounds:
            return Decision(decision="reject", utility=u,
                            reasoning="Offer is worse than my walk-away point and time is up.")
        mine = _concede(
            agent, my_last or agent.target, round_no, max_rounds, issues, constraint, climate
        )
        return Decision(decision="counter", utility=u, counter_offer=mine,
                        reasoning=f"Offer is outside my limits (utility {u}). Countering with a small concession.")

    # Accept threshold: aggressive agents demand more, collaborative accept sooner
    threshold = {"aggressive": 0.75, "collaborative": 0.55, "risk_averse": 0.65}[agent.personality]
    if issues is not None:
        threshold += {"novice": -0.03, "skilled": 0.0, "expert": 0.02}[agent.skill]
    threshold -= 0.02 * round_no               # willingness to settle grows each round

    if u >= threshold:
        return Decision(decision="accept", utility=u,
                        reasoning=f"Utility {u} meets my threshold {round(threshold, 2)}. Accepting.")

    mine = _concede(
        agent, my_last or agent.target, round_no, max_rounds, issues, constraint, climate
    )
    return Decision(decision="counter", utility=u, counter_offer=mine,
                    reasoning=f"Utility {u} is below my threshold {round(threshold, 2)}. Countering.")