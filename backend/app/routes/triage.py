from fastapi import APIRouter

from app.models.schemas import SymptomRequest

from app.services.triage_engine import analyze_symptoms

router = APIRouter()


@router.post("/triage")
async def triage(data: SymptomRequest):

    result = analyze_symptoms(data.symptoms)

    return {
        "response": result
    }