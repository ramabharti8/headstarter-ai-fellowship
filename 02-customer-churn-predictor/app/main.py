import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.model import predict_churn, FEATURES
import joblib

app = FastAPI(title="Customer Churn Predictor")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

pipeline = None


@app.on_event("startup")
async def startup():
    global pipeline
    model_path = os.environ.get("MODEL_PATH", "models/churn_model.joblib")
    if os.path.exists(model_path):
        pipeline = joblib.load(model_path)


class CustomerFeatures(BaseModel):
    tenure: float
    monthly_charges: float
    total_charges: float
    num_products: int
    has_internet: int
    has_phone: int
    contract_type: int
    payment_method: int
    paperless_billing: int
    senior_citizen: int


@app.post("/predict")
async def predict(customer: CustomerFeatures):
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Model not loaded — run training first")
    result = predict_churn(pipeline, customer.model_dump())
    return result


@app.get("/features")
def get_features():
    return {"required_features": FEATURES}


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": pipeline is not None}
