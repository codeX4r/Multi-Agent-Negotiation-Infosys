from .models import AgentProfile, Terms

TONE = {
    "aggressive": {"open": "This is my position, and it is firm.",
                   "reject": "I'm walking away; these terms cross my limit.",
                   "accept": "Fine. This works for me."},
    "collaborative": {"open": "Let's find something that works for both of us.",
                      "reject": "I can't find a workable agreement in these terms.",
                      "accept": "Great, I'm happy with this. Deal."},
    "risk_averse": {"open": "I'd like to propose safe, predictable terms.",
                    "reject": "I can't accept terms that leave this level of risk.",
                    "accept": "These terms are acceptable and low-risk. Agreed."},
}

COUNTER_LINES = {
    "aggressive": (
        "I'm holding firm on {issue}; move closer to my terms.",
        "I won't give much on {issue}.",
        "Your {issue} terms still need to move my way.",
        "I can shift slightly, but not on {issue}.",
    ),
    "collaborative": (
        "Could we meet nearer my position on {issue}?",
        "I can trade on other terms, but need {issue} to move.",
        "Let's find a middle ground on {issue}.",
        "A small adjustment on {issue} would help us close.",
    ),
    "risk_averse": (
        "I need safer {issue} terms before I can agree.",
        "I'm not comfortable with the current {issue} terms.",
        "Please bring {issue} within a range I can accept.",
        "I can continue if we reduce the risk around {issue}.",
    ),
}

ISSUES = {
    "vendor": ("price", "delivery timing", "warranty", "payment timing"),
    "job": ("salary", "joining bonus", "joining date", "remote days"),
    "budget": ("Engineering allocation", "Marketing allocation", "Operations allocation", "project timeline"),
}


def issue_for_terms(terms: Terms | None, issue_index: int = 0) -> str:
    if terms is not None and terms.eng is not None:
        scenario = "budget"
    elif terms is not None and terms.salary is not None:
        scenario = "job"
    else:
        scenario = "vendor"
    return ISSUES[scenario][issue_index % len(ISSUES[scenario])]


def _format_inr(value: float) -> str:
    value = int(round(value))
    raw = str(value)
    if len(raw) <= 3:
        return raw
    last = raw[-3:]
    rest = raw[:-3]
    groups = []
    while len(rest) > 2:
        groups.insert(0, rest[-2:])
        rest = rest[:-2]
    if rest:
        groups.insert(0, rest)
    return ",".join(groups + [last])


def write_message(
    agent: AgentProfile,
    decision: str,
    terms: Terms | None,
    counter_index: int = 0,
    issue_index: int | None = None,
    deal_reached: bool = False,
) -> str:
    tone = TONE[agent.personality]
    if decision == "counter":
        line_index = counter_index % len(COUNTER_LINES[agent.personality])
        issue = issue_for_terms(terms, counter_index)
        base = COUNTER_LINES[agent.personality][line_index].format(issue=issue)
    elif decision == "reject":
        rejected_issue = counter_index if issue_index is None else issue_index
        base = f"{tone['reject']} The {issue_for_terms(terms, rejected_issue)} terms are beyond my walk-away point."
    elif decision == "accept":
        base = tone["accept"] if deal_reached else "I can accept this, if the others agree."
    else:
        base = tone.get(decision, tone["reject"])
    if terms and decision in ("open", "counter"):
        if terms.eng is not None and terms.mkt is not None and terms.ops is not None and terms.timeline is not None:
            base += (
                f" My offer: Engineering {terms.eng:,.0f}L, Marketing {terms.mkt:,.0f}L, "
                f"Operations {terms.ops:,.0f}L, Timeline {terms.timeline} months."
            )
            return base
        if terms.salary is not None:
            base += (
                f" My offer: ₹{_format_inr(terms.salary * 100000)} salary, "
                f"₹{_format_inr(terms.bonus * 100000)} joining bonus, "
                f"{terms.start} weeks, {terms.remote} remote days/week."
            )
            return base
        base += (
            f" My offer: ₹{_format_inr(terms.price)}, {terms.delivery_days} days, "
            f"{terms.warranty_months} months, payment {terms.payment_days} days after delivery."
        )
    return base


def format_terms(terms: Terms) -> str:
    values = terms.model_dump(exclude_none=True)
    if "eng" in values:
        return (
            f"Engineering ₹{values['eng']:,}L, Marketing ₹{values['mkt']:,}L, "
            f"Operations ₹{values['ops']:,}L, Timeline {values['timeline']} months"
        )
    if "salary" in values:
        salary_rupees = values["salary"] * 100000
        bonus_rupees = values["bonus"] * 100000
        return (
            f"₹{_format_inr(salary_rupees)} salary, ₹{_format_inr(bonus_rupees)} joining bonus, "
            f"{values['start']} weeks, {values['remote']} remote days/week"
        )
    if "price" in values:
        return (
            f"₹{_format_inr(values['price'])}, {values['delivery_days']} days, "
            f"{values['warranty_months']} months, payment {values['payment_days']} days"
        )
    return ""