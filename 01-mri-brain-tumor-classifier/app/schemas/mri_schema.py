from pydantic import BaseModel


class MRIPredictionResponse(BaseModel):
    prediction: str
    confidence: float
    probabilities: dict[str, float]
    model_version: str = "1.0.0"
