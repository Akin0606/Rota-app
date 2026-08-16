from fastapi import APIRouter

from models.schemas import OnboardingActivateRequest, OnboardingSessionOut
from services import onboarding

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


@router.post("/activate", response_model=OnboardingSessionOut)
def activate(payload: OnboardingActivateRequest):
    """Token-landing endpoint. Validates + burns the one-time activation token
    and returns a freshly-minted Supabase session (access + refresh) for the
    pre-created manager account. The frontend installs it with setSession — no
    OTP, no magic link, no client-side code exchange."""
    return onboarding.activate(payload.token)
