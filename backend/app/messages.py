from .models import AgentProfile, Terms

TONE = {
    "aggressive": {"open": "This is my position, and it is firm.",
                   "counter": "I'm willing to move, but only a little.",
                   "accept": "Fine. This works for me."},
    "collaborative": {"open": "Let's find something that works for both of us.",
                      "counter": "Let's meet closer to the middle.",
                      "accept": "Great, I'm happy with this. Deal."},
    "risk_averse": {"open": "I'd like to propose safe, predictable terms.",
                    "counter": "I can adjust slightly, but I need to limit my risk.",
                    "accept": "These terms are acceptable and low-risk. Agreed."},
}


def write_message(agent: AgentProfile, decision: str, terms: Terms | None) -> str:
    # TODO: swap this for an LLM call when an API key is available
    base = TONE[agent.personality].get(decision, "I cannot accept this.")
    if terms and decision != "accept":
        base += f" My offer: {terms.price:,.0f}, {terms.delivery_days} days, {terms.warranty_months} months."
    return base