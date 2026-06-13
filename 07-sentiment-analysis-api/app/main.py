from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import pipeline
from typing import Optional
import time

app = FastAPI(title="Sentiment Analysis API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

sentiment_pipeline = pipeline(
    "sentiment-analysis",
    model="cardiffnlp/twitter-roberta-base-sentiment-latest",
    truncation=True,
    max_length=512,
)

LABEL_MAP = {"LABEL_0": "negative", "LABEL_1": "neutral", "LABEL_2": "positive"}


class TextRequest(BaseModel):
    text: str
    batch: Optional[list[str]] = None


class SentimentResult(BaseModel):
    text: str
    sentiment: str
    confidence: float
    processing_time_ms: float


@app.post("/analyze", response_model=SentimentResult)
async def analyze(req: TextRequest):
    start = time.time()
    result = sentiment_pipeline(req.text)[0]
    elapsed = (time.time() - start) * 1000

    return SentimentResult(
        text=req.text,
        sentiment=LABEL_MAP.get(result["label"], result["label"]).lower(),
        confidence=round(result["score"], 4),
        processing_time_ms=round(elapsed, 2),
    )


@app.post("/analyze/batch")
async def analyze_batch(req: TextRequest):
    if not req.batch:
        return {"error": "No batch provided"}
    start = time.time()
    results = sentiment_pipeline(req.batch)
    elapsed = (time.time() - start) * 1000

    return {
        "results": [
            {
                "text": text,
                "sentiment": LABEL_MAP.get(r["label"], r["label"]).lower(),
                "confidence": round(r["score"], 4),
            }
            for text, r in zip(req.batch, results)
        ],
        "processing_time_ms": round(elapsed, 2),
    }


@app.get("/health")
def health():
    return {"status": "ok", "model": "twitter-roberta-base-sentiment-latest"}
