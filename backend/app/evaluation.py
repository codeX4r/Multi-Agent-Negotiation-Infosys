from .models import AgentProfile, Decision, NegotiationContext, Terms

# How fast each personality gives ground (0 = never, 1 = jumps to the other side)
CONCESSION_RATE = {
    "aggressive": 0.08,
    "collaborative": 0.25,
    "risk_averse": 0.15,
}


def _score(value: float, worst: float, best: float) -> float:
    """Scale a value to 0..1 where 0 = walk-away point and 1 = ideal."""
    if best == worst:
        return 1.0
    s = (value - worst) / (best - worst)
    return max(0.0, min(1.0, s))


def utility(agent: AgentProfile, offer: Terms) -> float:
    """How happy the agent is with an offer, from 0 (bad) to 1 (ideal)."""
    w = agent.weights
    u = (
        w["price"] * _score(offer.price, agent.batna.price, agent.target.price)
        + w["delivery"] * _score(offer.delivery_days, agent.batna.delivery_days, agent.target.delivery_days)
        + w["warranty"] * _score(offer.warranty_months, agent.batna.warranty_months, agent.target.warranty_months)
    )
    return round(u, 3)


def _beyond_batna(agent: AgentProfile, offer: Terms) -> bool:
    """True if any term is worse than the agent's walk-away point."""
    b = agent.batna
    if agent.wants_higher_price:
        price_bad = offer.price < b.price
    else:
        price_bad = offer.price > b.price
    # Lower delivery days is always better; more warranty is always better
    return price_bad or offer.delivery_days > b.delivery_days or offer.warranty_months < b.warranty_months


def _concede(agent: AgentProfile, current: Terms, round_no: int, max_rounds: int) -> Terms:
    """Move the agent's own position toward its walk-away point."""
    rate = CONCESSION_RATE[agent.personality]
    pressure = 1 + (round_no / max_rounds)      # concede faster as time runs out
    step = min(1.0, rate * pressure)

    def move(now, target, batna):
        return now + (batna - now) * step * 0.5

    return Terms(
        price=round(move(current.price, agent.target.price, agent.batna.price)),
        delivery_days=round(move(current.delivery_days, agent.target.delivery_days, agent.batna.delivery_days)),
        warranty_months=round(move(current.warranty_months, agent.target.warranty_months, agent.batna.warranty_months)),
    )


def evaluate_offer(agent: AgentProfile, incoming: Terms, my_last: Terms | None,
                   round_no: int, max_rounds: int = 12, *,
                   context: NegotiationContext | None = None) -> Decision:
    if context is not None:
        incoming = context.current_offer
        my_last = context.previous_offer
        round_no = context.round_number
        max_rounds = context.max_rounds

    u = utility(agent, incoming)

    if _beyond_batna(agent, incoming):
        # Still counter if time remains, otherwise reject outright
        if round_no >= max_rounds:
            return Decision(decision="reject", utility=u,
                            reasoning="Offer is worse than my walk-away point and time is up.")
        mine = _concede(agent, my_last or agent.target, round_no, max_rounds)
        return Decision(decision="counter", utility=u, counter_offer=mine,
                        reasoning=f"Offer is outside my limits (utility {u}). Countering with a small concession.")

    # Accept threshold: aggressive agents demand more, collaborative accept sooner
    threshold = {"aggressive": 0.75, "collaborative": 0.55, "risk_averse": 0.65}[agent.personality]
    threshold -= 0.02 * round_no               # willingness to settle grows each round

    if u >= threshold:
        return Decision(decision="accept", utility=u,
                        reasoning=f"Utility {u} meets my threshold {round(threshold, 2)}. Accepting.")

    mine = _concede(agent, my_last or agent.target, round_no, max_rounds)
    return Decision(decision="counter", utility=u, counter_offer=mine,
                    reasoning=f"Utility {u} is below my threshold {round(threshold, 2)}. Countering.")