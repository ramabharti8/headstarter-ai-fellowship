import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from app.model import build_model, predict

app = FastAPI(title="MRI Brain Tumor Classifier")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

model = None


@app.on_event("startup")
async def startup():
    global model
    model = build_model()
    weights_path = os.environ.get("MODEL_WEIGHTS", "")
    if weights_path and os.path.exists(weights_path):
        model.load_weights(weights_path)


@app.post("/classify")
async def classify(file: UploadFile = File(...)):
    image_bytes = await file.read()
    result = predict(model, image_bytes)
    return result


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None}
