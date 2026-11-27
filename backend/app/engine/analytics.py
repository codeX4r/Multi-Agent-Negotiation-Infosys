from __future__ import annotations

import itertools
from typing import Any

from app.engine.evaluation import _term_field, utility
from app.models import AgentProfile, NegotiationIssue, Terms


def _acceptable_range(
    agent: AgentProfile,
    issue: NegotiationIssue,
) -> tuple[float, float]:
    """Return the [low, high] interval an agent will accept for a single issue."""
    field = _term_field(issue)
    target = float(getattr(agent.target, field))
    batna = float(getattr(agent.batna, field))

    if target > batna:
        return (batna, float(issue.max))
    if target < batna:
        return (float(issue.min), batna)
    return (batna, batna)


def compute_issue_zopa(
    agents: list[AgentProfile],
    issue: NegotiationIssue,
) -> dict[str, Any]:
    """Compute the Zone of Possible Agreement (ZOPA) for a single issue."""
    ranges = [_acceptable_range(agent, issue) for agent in agents]
    low = max(r[0] for r in ranges)
    high = min(r[1] for r in ranges)
    span = max(1e-9, float(issue.max - issue.min))

    if low <= high:
        width = round(high - low, 4)
        return {
            "issue_id": issue.id,
            "has_zopa": True,
            "low": round(low, 4),
            "high": round(high, 4),
            "width": width,
            "overlap_ratio": round(width / span, 3),
        }

    return {
        "issue_id": issue.id,
        "has_zopa": False,
        "low": None,
        "high": None,
        "width": 0.0,
        "overlap_ratio": 0.0,
    }


def analyze_zopa(
    agents: list[AgentProfile],
    issues: list[NegotiationIssue],
) -> dict[str, Any]:
    """Analyze ZOPA across all issues and flag whether a deal is mathematically possible."""
    per_issue = {issue.id: compute_issue_zopa(agents, issue) for issue in issues}
    deal_possible = all(entry["has_zopa"] for entry in per_issue.values())
    avg_overlap = (
        round(sum(e["overlap_ratio"] for e in per_issue.values()) / len(per_issue), 3)
        if per_issue
        else 0.0
    )

    return {
        "deal_possible": deal_possible,
        "average_overlap_ratio": avg_overlap,
        "issues": per_issue,
    }


def _issue_grid(issue: NegotiationIssue, max_points: int = 5) -> list[float]:
    """Generate evenly spaced valid step values across an issue's range."""
    total_steps = max(1, int(round((issue.max - issue.min) / issue.step)))
    if total_steps + 1 <= max_points:
        return [
            round(issue.min + i * issue.step, 4)
            for i in range(total_steps + 1)
        ]

    stride = total_steps / (max_points - 1)
    points = sorted({
        round(issue.min + round(i * stride) * issue.step, 4)
        for i in range(max_points)
    })
    return [min(issue.max, max(issue.min, p)) for p in points]


def pareto_efficiency(
    agents: list[AgentProfile],
    agreement: Terms,
    issues: list[NegotiationIssue],
    grid_points_per_issue: int = 5,
) -> dict[str, Any]:
    """Evaluate whether an agreement is Pareto-optimal or leaves value on the table.

    Checks feasible offers across the issue space to see if any offer makes at least
    one party strictly better off without making any other party worse off.
    """
    agreement_utils = [utility(agent, agreement, issues) for agent in agents]
    agreement_joint = round(sum(agreement_utils), 4)

    grids = [_issue_grid(issue, grid_points_per_issue) for issue in issues]
    fields = [_term_field(issue) for issue in issues]
    base_data = agreement.model_dump()

    best_joint = agreement_joint
    dominating_joint = agreement_joint
    is_optimal = True

    for combo in itertools.product(*grids):
        candidate_data = {**base_data}
        for field, val in zip(fields, combo):
            candidate_data[field] = int(val) if float(val).is_integer() else val
        candidate = Terms.model_validate(candidate_data)

        cand_utils = [utility(agent, candidate, issues) for agent in agents]
        cand_joint = sum(cand_utils)

        if cand_joint > best_joint:
            best_joint = round(cand_joint, 4)

        strictly_better_for_someone = any(
            cu > au + 1e-6 for cu, au in zip(cand_utils, agreement_utils)
        )
        worse_for_no_one = all(
            cu >= au - 1e-6 for cu, au in zip(cand_utils, agreement_utils)
        )
        if strictly_better_for_someone and worse_for_no_one:
            is_optimal = False
            if cand_joint > dominating_joint:
                dominating_joint = round(cand_joint, 4)

    efficiency_score = (
        round(min(1.0, agreement_joint / best_joint), 3)
        if best_joint > 0
        else 1.0
    )
    value_left = round(max(0.0, dominating_joint - agreement_joint), 4)

    return {
        "is_pareto_optimal": is_optimal,
        "efficiency_score": efficiency_score,
        "agreement_joint_utility": agreement_joint,
        "best_feasible_joint_utility": best_joint,
        "value_left_on_table": value_left,
        "party_utilities": {
            agent.id: u for agent, u in zip(agents, agreement_utils)
        },
    }