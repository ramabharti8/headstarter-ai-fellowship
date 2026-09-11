# Smart Search API

Index documents and search them **by meaning, not just keywords**. A query
like *"server side tools for building web APIs"* finds "FastAPI is a modern
Python web framework" even though the two share almost no words.

Persistent FAISS vector index + SQLite docstore (not an ephemeral in-memory
store — a restart doesn't lose your documents), with a pluggable embedding
provider that includes a **real, local, zero-API-key default**.

## Features

- **`POST /index`** — add/update documents (auto id or your own), optional
  per-document metadata
- **`POST /search`** — semantic search with a real cosine-similarity score,
  optional exact-match metadata filter
- **`DELETE /index/:id`** — true deletion (FAISS `IndexIDMap2.remove_ids`, not
  a soft-delete workaround)
- **`GET /documents`** / **`GET /documents/:id`** — browse/paginate the index
- **Pluggable embeddings** (`auto` / `openai` / `gemini` / `fastembed` / `fake`)
  — `fastembed` is a real local ONNX model (`BAAI/bge-small-en-v1.5`) that
  needs **no API key at all**, so semantic search works out of the box
- **Persistent storage** — FAISS index + SQLite metadata store on disk,
  survives restarts; an index/provider dimension mismatch fails fast with a
  clear error instead of silently corrupting results
- **Batch embedding** for large `/index` requests, truncation flags for
  oversized documents
- **Abuse protection** — per-IP sliding-window rate limit, optional
  `SS_API_KEY` gate
- **Web UI** at `/` — search + index tabs, live document browser with delete,
  similarity-scored result cards, light/dark
- Dockerised (default model baked into the image), `docker-compose` with a
  named volume, `render.yaml`, GitHub Actions CI, 34 offline tests, ruff-clean

## Why FAISS, not Chroma (the stub's original choice)

The stub used `chromadb.EphemeralClient()` — in-memory only, gone on every
restart — and Chroma's dependency tree pulls in a Kubernetes client,
OpenTelemetry, and a Pulsar client for what a single-process API needs. FAISS
+ SQLite gets the same job done (fast similarity search, real delete,
metadata) with far fewer dependencies and actual persistence.

## Quick start

```bash
cp .env.example .env
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

No API key needed — `fastembed` downloads its small ONNX model on first use
(~130MB, once) and then embeds fully offline. Set `SS_OPENAI_API_KEY` or
`SS_GEMINI_API_KEY` for a hosted embedding model instead.

## API

```bash
# Index documents
curl -X POST http://localhost:8000/index \
  -H "Content-Type: application/json" \
  -d '{"documents": ["FastAPI is a modern Python web framework", "React is a JavaScript UI library"]}'

# Search — no keyword overlap needed
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "backend server framework in Python", "top_k": 3}'
```

```json
{
  "query": "backend server framework in Python",
  "results": [
    {"id": "...", "document": "FastAPI is a modern Python web framework", "score": 0.71, "metadata": {}}
  ],
  "total_documents": 2,
  "processing_time_ms": 12.4
}
```

`score` is cosine similarity in `[-1, 1]` (in practice `~[0, 1]` for real
text). `POST /index` also accepts `ids` and `metadata` (one entry per
document); `POST /search` accepts an optional `metadata_filter` (exact-match,
applied after retrieval).

## Configuration

All via environment / `.env` (prefix `SS_`). See [`.env.example`](.env.example).

| Var | Default | Purpose |
|-----|---------|---------|
| `SS_PROVIDER` | `auto` | `auto` / `openai` / `gemini` / `fastembed` / `fake` |
| `SS_OPENAI_API_KEY` / `SS_GEMINI_API_KEY` | — | Provider keys; `auto` picks the first set, else `fastembed` |
| `SS_FAKE_EMBED` | `0` | `1` forces the offline hashed-vector embedder (tests/CI only) |
| `SS_DATA_DIR` | `./data` | FAISS index + SQLite docstore location |
| `SS_COLLECTION` | `documents` | Namespaces the on-disk files |
| `SS_MAX_DOCUMENTS` | `50000` | Hard cap on index size |
| `SS_MAX_DOC_CHARS` | `8000` | Truncate a longer document (flagged in the response) |
| `SS_MAX_BATCH_SIZE` | `256` | Reject a larger `/index` request (422) |
| `SS_DEFAULT_TOP_K` / `SS_MAX_TOP_K` | `5` / `50` | Search result count bounds |
| `SS_API_KEY` | — | When set, gates write/search endpoints; disables the rate limiter |
| `SS_RATE_LIMIT_PER_MIN` | `60` | Per-IP requests/min (`0` disables) |
| `SS_CORS_ORIGINS` | `*` | Comma-separated origins |
| `SS_DOCS_ENABLED` | `true` | Serve `/docs`, `/redoc`, `/openapi.json` |

**Switching providers changes the embedding dimension** — an existing index
built with one provider isn't compatible with another. The store detects this
on startup and refuses to run with a clear error rather than silently
returning garbage; delete `SS_DATA_DIR` (or point it elsewhere) to rebuild.

## Development

```bash
make install   # deps
make test      # SS_FAKE_EMBED=1 pytest
make lint      # ruff check + format --check
make run       # uvicorn --reload
```

## Deploy

### Docker

```bash
docker compose up --build
```

`docker-compose.yml` mounts a named volume at `SS_DATA_DIR` so the index
survives container restarts; the Dockerfile pre-downloads the default
`fastembed` model at build time.

### Render

Point a Blueprint at the repo — it reads [`render.yaml`](render.yaml). Note:
Render's free plan has an ephemeral filesystem (the index resets on every
redeploy) — attach a persistent disk on a paid plan to keep it.

## How it works

```
/index → embed (batched) → Store.upsert
                              │  FAISS IndexIDMap2(IndexFlatIP)  — vectors
                              │  SQLite documents table          — text + metadata
                              ▼
/search → embed query → FAISS inner-product search → SQLite lookup
                       → optional metadata post-filter → ranked results
```

Every embedding backend L2-normalises its vectors, so FAISS's inner-product
index doubles as cosine similarity. `IndexIDMap2` (vs. a plain `IndexFlat`)
maps our own string ids onto FAISS's int64 ids and supports real
`remove_ids` — an upsert removes the old vector before adding the new one, so
document counts and deletes are always exact, not approximate.
