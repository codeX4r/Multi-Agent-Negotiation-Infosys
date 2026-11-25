"""Validation layer for LLM negotiation decisions.

Enforces business rules separately from LLM reasoning.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, List
from math import isclose

from app.models import Terms, NegotiationIssue, SumConstraint, NegotiationContext
from app.schemas.llm_negotiation import LLMAgentDecision


@dataclass
class ValidationResult:
    """Result of validating an LLM agent decision."""
    is_valid: bool
    errors: List[str]
    corrected_terms: Optional[Terms] = None


# Field mapping from issue IDs to Terms fields
ISSUE_TO_FIELD = {
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
}


def validate_terms(
    terms: Terms,
    issues: List[NegotiationIssue],
    constraint: Optional[SumConstraint]
) -> List[str]:
    """Validate terms against issue ranges, steps, and sum constraints."""
    errors = []
    issues_by_id = {i.id: i for i in issues}

    for issue in issues:
        field = ISSUE_TO_FIELD[issue.id]
        value = getattr(terms, field)

        if value < issue.min or value > issue.max:
            errors.append(
                f"{issue.id} value {value} outside allowed range [{issue.min}, {issue.max}]"
            )

        # Check step alignment
        units = (value - issue.min) / issue.step
        if abs(units - round(units)) > 1e-8:
            errors.append(
                f"{issue.id} value {value} does not align with step size {issue.step} "
                f"(must be {issue.min} + n*{issue.step})"
            )

    # Check sum constraint for budget scenario
    if constraint:
        derived_field = ISSUE_TO_FIELD[constraint.derived]
        of_fields = [ISSUE_TO_FIELD[oid] for oid in constraint.of]

        derived_value = getattr(terms, derived_field)
        of_values = sum(getattr(terms, f) for f in of_fields)
        total = derived_value + of_values

        if not isclose(total, constraint.total, abs_tol=1e-8):
            errors.append(
                f"Sum constraint violated: {constraint.derived} + {constraint.of} = {total}, "
                f"must equal {constraint.total}"
            )

    return errors


def validate_decision(
    decision: LLMAgentDecision,
    context: NegotiationContext,
    issues: List[NegotiationIssue],
    constraint: Optional[SumConstraint]
) -> ValidationResult:
    """Validate an LLM agent decision against business rules."""
    errors = []

    # Validate proposed terms if present
    if decision.proposed_terms is not None:
        errors.extend(validate_terms(decision.proposed_terms, issues, constraint))

    # Action-specific validation
    if decision.action == "accept":
        if decision.proposed_terms is not None:
            errors.append("accept action must not include proposed_terms")

        # Accept must match current offer exactly
        if context.current_offer is not None:
            current = context.current_offer
            proposed = decision.proposed_terms

            # If no proposed_terms, it's implicitly accepting current
            # If proposed_terms provided, must match current exactly
            if proposed:
                for issue in issues:
                    field = ISSUE_TO_FIELD[issue.id]
                    if getattr(current, field) != getattr(proposed, field):
                        errors.append(
                            f"accept proposed_terms {issue.id} ({getattr(proposed, field)}) "
                            f"does not match current offer ({getattr(current, field)})"
                        )

    elif decision.action == "reject":
        if decision.proposed_terms is not None:
            errors.append("reject action must not include proposed_terms")

    elif decision.action == "counter":
        if decision.proposed_terms is None:
            errors.append("counter action must include proposed_terms")

    elif decision.action == "open":
        if decision.proposed_terms is None:
            errors.append("open action must include proposed_terms")
        if context.current_offer is not None:
            errors.append("open action only valid when no current offer exists")

    return ValidationResult(is_valid=len(errors) == 0, errors=errors)


__all__ = ["ValidationResult", "validate_terms", "validate_decision"]