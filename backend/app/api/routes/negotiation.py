"""Negotiation endpoints."""

from fastapi import APIRouter

from app.schemas.negotiation import RunRequest, NegotiationResponse
from app.services.negotiation_service import run_negotiation

router = APIRouter(prefix="/negotiate", tags=["negotiation"])


@router.post("/run", response_model=NegotiationResponse)
async def negotiate(req: RunRequest):
    """Run a negotiation simulation."""
    return run_negotiation(req)