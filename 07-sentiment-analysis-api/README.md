# Sentiment Analysis API

Real-time sentiment scoring for text and social media. Submit a sentence (or a
batch), get a label — `negative` / `neutral` / `positive` — a confidence score
and the **full probability distribution** over all three classes.

Built on `cardiffnlp/twitter-roberta-base-sentiment-latest` (Hugging Face
Transformers), served with FastAPI. Ships with an offline lexicon backend so
tests, CI and demos run with **zero downloads and no `torch`**.

## Features

- **`POST /analyze`** — single text → sentiment, confidence, per-label scores,
  truncation flag, latency, cache flag
- **`POST /analyze/batch`** — many texts in one request, chunked through the model
- **Twitter-aware preprocessing** — `@mentions` → `@user`, links → `http`
  (the normalisation the model card recommends), toggleable per request
- **Honest truncation detection** — an untruncated tokenisation pass flags text
  that overran the model window
- **In-process LRU result cache** — repeat texts are served without a forward pass
- **Pluggable backend** — `auto` (real model when `torch`+`transformers` are
  present) / `transformers` / `fake` (deterministic offline lexicon)
- **`GET /metrics`** — Prometheus text format: request/text counters, a latency
  histogram, cache hit/miss
- **Abuse protection** — per-IP sliding-window rate limit, optional `SENT_API_KEY`
  bearer/`X-API-Key` gate (disables the limiter when set)
- **Web UI** at `/` — single + batch modes, sentiment gauge, probability bars,
  light/dark
- Dockerised (model baked into the image), `docker-compose`, `render.yaml`,
  GitHub Actions CI, ~34 offline tests, ruff-clean

## Quick start

```bash
pip install -r requirements-dev.txt        # includes torch + transformers
uvicorn app.main:app --reload
```

The model (~500 MB) downloads on first run. To skip it entirely:

```bash
SENT_FAKE_MODEL=1 uvicorn app.main:app --reload   # offline lexicon backend
```

## API

### `POST /analyze`

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"text": "The new product update is absolutely amazing!"}'
```

```json
{
  "text": "The new product update is absolutely amazing!",
  "sentiment": "positive",
  "confidence": 0.9873,
  "scores": { "negative": 0.0041, "neutral": 0.0086, "positive": 0.9873 },
  "truncated": false,
  "cached": false,
  "processing_time_ms": 42.1
}
```

Body: `{"text": "...", "preprocess": true}` (`preprocess` defaults to `true`).

### `POST /analyze/batch`

```bash
curl -X POST http://localhost:8000/analyze/batch \
  -H "Content-Type: application/json" \
  -d '{"texts": ["love the update", "support never replied, awful"]}'
```

Returns `{ "results": [...], "count": 2, "cached_count": 0, "processing_time_ms": ... }`.

### `GET /health`

Backend, model, device, label order, cache size, auth/docs flags.

### `GET /metrics`

Prometheus exposition. Disable with `SENT_METRICS_ENABLED=false`.

## Configuration

All via environment / `.env` (prefix `SENT_`). See [`.env.example`](.env.example).

| Var | Default | Purpose |
|-----|---------|---------|
| `SENT_MODEL_NAME` | `cardiffnlp/twitter-roberta-base-sentiment-latest` | Any 3-class HF sequence-classification model |
| `SENT_BACKEND` | `auto` | `auto` / `transformers` / `fake` |
| `SENT_FAKE_MODEL` | `0` | `1` forces the offline lexicon backend |
| `SENT_DEVICE` | `auto` | `auto` → cuda / mps / cpu, or pin one |
| `SENT_MAX_LENGTH` | `512` | Model token window; longer text is truncated |
| `SENT_MAX_TEXT_CHARS` | `5000` | Reject a single text longer than this (422) |
| `SENT_MAX_BATCH_SIZE` | `128` | Reject a larger batch (422) |
| `SENT_INFER_BATCH_SIZE` | `32` | Forward-pass chunk size within a batch |
| `SENT_CACHE_SIZE` | `1024` | LRU result cache entries (`0` disables) |
| `SENT_API_KEY` | — | When set, gates the analyze endpoints; disables the rate limiter |
| `SENT_RATE_LIMIT_PER_MIN` | `60` | Per-IP requests/min (`0` disables) |
| `SENT_CORS_ORIGINS` | `*` | Comma-separated origins |
| `SENT_DOCS_ENABLED` | `true` | Serve `/docs`, `/redoc`, `/openapi.json` |
| `SENT_METRICS_ENABLED` | `true` | Serve `/metrics` |

## Development

```bash
make install      # full deps (torch + transformers)
make install-ci   # slim deps — fake-mode tests only, no ML stack
make test         # SENT_FAKE_MODEL=1 pytest
make lint         # ruff check + format --check
make run          # uvicorn --reload
```

The app imports `torch` / `transformers` lazily (only the real backend touches
them), so the offline test suite needs neither.

## Deploy

### Docker

```bash
docker compose up --build
```

The image runs `scripts/download_model.py` at build time, so the container
starts instantly and needs no network at runtime.

### Render

Point a Blueprint at the repo — it reads [`render.yaml`](render.yaml). Note:
`roberta-base` needs more than the free plan's 512 MB RAM; use a paid instance
or set `SENT_FAKE_MODEL=true` for a lightweight demo.

## How it works

```
request → preprocess (optional) → cache lookup
                                     │ miss
                                     ▼
                        tokenizer (truncated + untruncated passes)
                                     ▼
                        model forward → softmax → {neg, neu, pos}
                                     ▼
                           cache store → response
```

The `fake` backend swaps the middle for a negation-aware lexicon scorer with a
softmax over `[neg_count, bias, pos_count]` — not accurate, but deterministic and
dependency-free, which is what CI and the test suite need.
