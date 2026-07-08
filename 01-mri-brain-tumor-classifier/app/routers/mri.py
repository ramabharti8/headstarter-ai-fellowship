"""MRI tumor classification endpoint."""
from fastapi import APIRouter, File, UploadFile, HTTPException
import numpy as np

from app.models.mri_model import get_model
from app.schemas.mri_schema import MRIPredictionResponse
from ml.mri.preprocess import preprocess_bytes, CLASS_NAMES


router = APIRouter(prefix="/predict", tags=["MRI"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/jpg"}


@router.post("/mri", response_model=MRIPredictionResponse)
async def predict_mri(file: UploadFile = File(...)):
    """
    Classify a brain MRI image into: glioma, meningioma, pituitary, or no_tumor.
    Upload a JPG or PNG image.
    """
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file.content_type}'. Only JPEG/PNG allowed.",
        )

    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:  # 10 MB limit
        raise HTTPException(status_code=413, detail="Image too large (max 10MB)")

    try:
        tensor = preprocess_bytes(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    model = get_model()
    probs = model.predict(tensor, verbose=0)[0]

    pred_idx = int(np.argmax(probs))
    prediction = CLASS_NAMES[pred_idx]
    confidence = float(probs[pred_idx])
    probabilities = {cls: round(float(p), 4) for cls, p in zip(CLASS_NAMES, probs)}

    return MRIPredictionResponse(
        prediction=prediction,
        confidence=round(confidence, 4),
        probabilities=probabilities,
    )
