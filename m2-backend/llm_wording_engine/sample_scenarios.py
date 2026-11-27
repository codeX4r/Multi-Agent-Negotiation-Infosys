"""Sample agents for the demo and tests, based on the Milestone 1.3 scenario templates.

Two parties per scenario keep the demo short; the engine itself works per agent,
so any number of seats can call it.
"""
from __future__ import annotations

from .schema import AgentProfile, Issue

SCENARIOS = {
    "vendor": {
        "title": "Vendor pricing: bulk hardware order",
        "opener": "vendor",
        "agents": {
            "buyer": lambda p="collaborative": AgentProfile(
                id="buyer", name="Buyer", role="procurement lead", personality=p,
                persona="Methodical procurement lead who cares about total value and on-time delivery.",
                goals=["Land the order under Rs 11 lakh", "Delivery inside 25 days"],
                constraints=["Approved budget is Rs 11.8 lakh"],
                batna="A rival supplier quoted Rs 11.2 lakh with 35-day delivery.", batna_utility=0.30,
                issues=[Issue("price", "Price", ideal=950000, limit=1180000, weight=0.45, unit="INR", min=900000, max=1300000, step=10000),
                        Issue("delivery", "Delivery", ideal=15, limit=40, weight=0.30, unit="days", min=10, max=45, step=1),
                        Issue("warranty", "Warranty", ideal=24, limit=6, weight=0.25, unit="months", min=6, max=36, step=6)]),
            "vendor": lambda p="aggressive": AgentProfile(
                id="vendor", name="Vendor", role="senior sales representative", personality=p,
                persona="Seasoned sales rep, protective of margin.",
                goals=["Close at or above Rs 11.5 lakh", "Keep the warranty short"],
                constraints=["Cannot deliver in under 12 days"],
                batna="Sell the stock to a distributor for Rs 10.1 lakh.", batna_utility=0.30,
                issues=[Issue("price", "Price", ideal=1250000, limit=980000, weight=0.55, unit="INR", min=900000, max=1300000, step=10000),
                        Issue("delivery", "Delivery", ideal=40, limit=12, weight=0.20, unit="days", min=10, max=45, step=1),
                        Issue("warranty", "Warranty", ideal=6, limit=30, weight=0.25, unit="months", min=6, max=36, step=6)]),
        },
    },
    "job": {
        "title": "Job offer: senior engineer",
        "opener": "recruiter",
        "agents": {
            "candidate": lambda p="collaborative": AgentProfile(
                id="candidate", name="Candidate", role="senior engineer", personality=p,
                persona="Strong engineer with a competing offer; values flexibility.",
                goals=["Reach 20 LPA or more", "At least 3 remote days a week"],
                constraints=["Needs at least 3 weeks to serve notice"],
                batna="A competing offer at 16.5 LPA with 2 remote days.", batna_utility=0.30,
                issues=[Issue("salary", "Base salary", ideal=22, limit=15, weight=0.50, unit="LPA", min=12, max=24, step=0.5),
                        Issue("remote", "Remote days", ideal=4, limit=1, weight=0.30, unit="days/week", min=0, max=5, step=1),
                        Issue("start", "Joining in", ideal=8, limit=3, weight=0.20, unit="weeks", min=2, max=12, step=1)]),
            "recruiter": lambda p="collaborative": AgentProfile(
                id="recruiter", name="Recruiter", role="HR business partner", personality=p,
                persona="Friendly but band-conscious recruiter who must keep parity with the team.",
                goals=["Close inside the band, ideally under 19 LPA", "Joining within a month"],
                constraints=["Salary band tops out at 21 LPA", "Remote policy allows at most 4 days"],
                batna="Second-choice candidate at 15 LPA.", batna_utility=0.25,
                issues=[Issue("salary", "Base salary", ideal=14, limit=21, weight=0.50, unit="LPA", min=12, max=24, step=0.5),
                        Issue("remote", "Remote days", ideal=2, limit=4, weight=0.20, unit="days/week", min=0, max=5, step=1),
                        Issue("start", "Joining in", ideal=3, limit=10, weight=0.30, unit="weeks", min=2, max=12, step=1)]),
        },
    },
    "budget": {
        "title": "Project budget: engineering allocation",
        "opener": "eng",
        "agents": {
            "eng": lambda p="aggressive": AgentProfile(
                id="eng", name="Eng Head", role="head of engineering", personality=p,
                persona="Wants a realistic timeline and enough headcount to ship well.",
                goals=["Secure Rs 26 lakh or more", "At least 7 months"],
                constraints=["Cannot ship with less than Rs 14 lakh"],
                batna="Escalate to the CTO for a separate capex line.", batna_utility=0.28,
                issues=[Issue("budget", "Engineering budget", ideal=28, limit=14, weight=0.60, unit="lakh INR", min=8, max=34, step=1),
                        Issue("timeline", "Timeline", ideal=9, limit=4, weight=0.25, unit="months", min=3, max=12, step=1),
                        Issue("contingency", "Contingency", ideal=15, limit=5, weight=0.15, unit="%", min=0, max=20, step=1)]),
            "finance": lambda p="risk_averse": AgentProfile(
                id="finance", name="Finance", role="finance controller", personality=p,
                persona="Cautious controller guarding a fixed annual budget.",
                goals=["Keep engineering under Rs 20 lakh", "Deliver inside 6 months"],
                constraints=["Total project budget is Rs 50 lakh"],
                batna="Defer the project to next quarter.", batna_utility=0.25,
                issues=[Issue("budget", "Engineering budget", ideal=16, limit=27, weight=0.55, unit="lakh INR", min=8, max=34, step=1),
                        Issue("timeline", "Timeline", ideal=5, limit=9, weight=0.25, unit="months", min=3, max=12, step=1),
                        Issue("contingency", "Contingency", ideal=5, limit=15, weight=0.20, unit="%", min=0, max=20, step=1)]),
        },
    },
}


def agents_for(scenario: str, personalities=None):
    """Return (opener, responder) AgentProfiles for a scenario."""
    s = SCENARIOS[scenario]
    personalities = personalities or {}
    ids = list(s["agents"])
    opener_id = s["opener"]
    other_id = [i for i in ids if i != opener_id][0]
    make = lambda i: s["agents"][i](personalities[i]) if i in personalities else s["agents"][i]()
    return make(opener_id), make(other_id)
