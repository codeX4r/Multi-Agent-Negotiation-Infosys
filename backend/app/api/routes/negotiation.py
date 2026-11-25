"""Negotiation endpoints."""

from fastapi import APIRouter

from app.schemas.negotiation import RunRequest, NegotiationResponse, WordingRequest, WordingResponse
from app.services.negotiation_service import run_negotiation
from app.engine.llm_wording import generate_wording
from app.models import AgentProfile, Terms

router = APIRouter(prefix="/negotiate", tags=["negotiation"])


@router.post("/run", response_model=NegotiationResponse)
async def negotiate(req: RunRequest):
    """Run a negotiation simulation."""
    return run_negotiation(req)


@router.post("/wording", response_model=WordingResponse)
async def get_wording(req: WordingRequest):
    """Get LLM-generated wording for a negotiation turn."""
    # Convert frontend field names to internal model field names
    agent_data = req.agent.copy()

    # Map walk_away to batna (internal model uses batna)
    if "walk_away" in agent_data:
        agent_data["batna"] = agent_data.pop("walk_away")

    # Convert target field names
    target = agent_data.get("target", {})
    field_mapping = {
        "delivery": "delivery_days",
        "warranty": "warranty_months",
        "payment": "payment_days",
        "start": "start",
        "remote": "remote",
        "bonus": "bonus",
        "salary": "salary",
        "eng": "eng",
        "mkt": "mkt",
        "ops": "ops",
        "timeline": "timeline",
    }
    internal_target = {field_mapping.get(k, k): v for k, v in target.items()}
    agent_data["target"] = internal_target

    # Convert batna field names
    batna = agent_data.get("batna", {})
    internal_batna = {field_mapping.get(k, k): v for k, v in batna.items()}
    agent_data["batna"] = internal_batna

    # Convert weights field names
    weights = agent_data.get("weights", {})
    internal_weights = {field_mapping.get(k, k): v for k, v in weights.items()}
    agent_data["weights"] = internal_weights

    # Convert current_offer field names
    current_offer = None
    if req.current_offer:
        co = req.current_offer.copy()
        current_offer = Terms(**{field_mapping.get(k, k): v for k, v in co.items()})

    # Convert transcript offers
    transcript = []
    for item in req.transcript:
        t = item.copy()
        if t.get("offer"):
            t["offer"] = {field_mapping.get(k, k): v for k, v in t["offer"].items()}
        transcript.append(t)

    # Convert approved_terms
    approved_terms = None
    if req.approved_terms:
        at = req.approved_terms.copy()
        approved_terms = Terms(**{field_mapping.get(k, k): v for k, v in at.items()})

    # Convert dict to AgentProfile (internal model)
    agent = AgentProfile(**agent_data)

    # Generate wording using the adapter
    message = generate_wording(
        agent=agent,
        scenario=req.scenario,
        decision=req.decision,
        current_offer=current_offer,
        transcript=transcript,
        round_number=req.round_number,
        max_rounds=req.max_rounds,
        deal_reached=req.deal_reached,
        approved_terms=approved_terms,
    )

    # Get engine info for response metadata
    from app.engine.llm_wording import _get_engine
    engine = _get_engine()

    return WordingResponse(
        message=message,
        source="llm" if engine.client else "fallback",
        provider=engine.provider if engine.client else None,
        model=engine.model if engine.client else None,
    )