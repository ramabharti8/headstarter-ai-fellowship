"""
MRI Brain Tumor Classifier — FastAPI application entry point.

Run:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Docs:
    http://localhost:8000/docs   (Swagger UI)
    http://localhost:8000/redoc  (ReDoc)
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.routers import mri


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up — pre-loading MRI model...")
    try:
        from app.models.mri_model import get_model
        get_model()
    except FileNotFoundError as e:
        logger.warning(f"MRI model not pre-loaded: {e}")

    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="MRI Brain Tumor Classifier",
    description=(
        "CNN-based brain MRI tumor classification (VGG-16 transfer learning), "
        "served as a production-ready REST endpoint. Classifies scans into "
        "glioma, meningioma, pituitary, or no_tumor."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(mri.router)


@app.get("/", tags=["Health"])
def root():
    return {
        "status": "ok",
        "endpoints": {
            "mri_classifier": "POST /predict/mri",
            "docs": "/docs",
        },
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy"}
