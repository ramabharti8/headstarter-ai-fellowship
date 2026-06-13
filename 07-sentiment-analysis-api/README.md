# Sentiment Analysis API

Real-time sentiment scoring using `cardiffnlp/twitter-roberta-base-sentiment-latest` from Hugging Face.

## What It Does

- Classifies text as `positive`, `neutral`, or `negative`
- Returns confidence scores
- Supports single-text and batch analysis
- Optimized for social media text

## Tech Stack

- **Model**: `cardiffnlp/twitter-roberta-base-sentiment-latest` (Hugging Face Transformers)
- **API**: FastAPI + uvicorn

## Setup

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Model downloads automatically on first run (~500MB).

## API

```
POST /analyze         — Analyze sentiment of a single text
POST /analyze/batch   — Analyze a list of texts
GET  /health          — Health check + model info
```

### Example

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "The new product update is absolutely amazing!"}'
```

Response:
```json
{
  "text": "The new product update is absolutely amazing!",
  "sentiment": "positive",
  "confidence": 0.9873,
  "processing_time_ms": 42.1
}
```
