# Document Q&A API

Upload a PDF, ask natural-language questions about it, and get answers with the
pages they came from. Retrieval-augmented generation (RAG) over
**LangChain + FAISS + FastAPI**.

[![CI](https://github.com/ramabharti8/headstarter-ai-fellowship/actions/workflows/docqa-ci.yml/badge.svg)](https://github.com/ramabharti8/headstarter-ai-fellowship/actions/workflows/docqa-ci.yml)

---

## What it does

- **`POST /upload`** — accepts a PDF, splits it into overlapping chunks, embeds
  them, and stores the vectors in a persistent Chroma collection. Returns a
  `doc_id`.
- **`POST /ask`** — retrieves the most relevant chunks for a question and asks
  the LLM to answer *using only that context*. Returns the answer plus source
  snippets with page numbers.
- **`GET /documents`**, **`GET /documents/{id}`**, **`DELETE /documents/{id}`** —
  manage uploaded documents. Metadata is kept in SQLite so it survives restarts.
- **`GET /health`** — liveness + whether an AI provider is configured.
- **`GET /`** — a minimal browser UI for demos (upload + ask).

## Tech stack

| Layer      | Choice                                         | Why |
|------------|------------------------------------------------|-----|
| API        | FastAPI + Uvicorn                              | async, typed, auto OpenAPI docs |
| Embeddings | OpenAI `text-embedding-3-small`                | cheaper and better than `ada-002` |
| LLM        | OpenAI `gpt-4o-mini`                           | strong RAG answers at low cost |
| Vectors    | FAISS (persisted to disk, one index per doc)   | prebuilt wheels on every OS, survives restarts, ships in Docker |
| Chunking   | `RecursiveCharacterTextSplitter` (1000 / 200) | keeps sentences intact, overlap preserves context |
| Metadata   | SQLite                                         | durable document list without a DB server |

> **Why FAISS and not Chroma?** The task brief names ChromaDB, but Chroma's
> `hnswlib` dependency has no prebuilt wheel for Windows and needs a C++
> toolchain to install. FAISS gives the same similarity-search semantics with
> zero-friction installs everywhere, which matters for a project meant to run on
> any machine in an interview. Swapping back to Chroma is a ~15-line change in
> `app/rag.py`.

### Demo / offline mode

Set `QA_FAKE_AI=1` and the whole pipeline runs with **no API key and no
network**: deterministic local embeddings and a stub answerer that quotes the
retrieved context. This is what the test suite and CI use, and it's handy for
demoing the system without spending credits.

## Quick start

```bash
cd 05-document-qa-api
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

cp .env.example .env          # add QA_OPENAI_API_KEY  (or set QA_FAKE_AI=1)
uvicorn app.main:app --reload
```

Open <http://localhost:8000> for the UI or <http://localhost:8000/docs> for
Swagger.

## Docker

```bash
# with a real key
QA_OPENAI_API_KEY=sk-... docker compose up --build

# offline demo
QA_FAKE_AI=1 docker compose up --build
```

The `qa_data` volume holds the FAISS indexes and the SQLite database, so uploaded
documents persist across container restarts.

## API examples

```bash
# 1. Upload
curl -X POST http://localhost:8000/upload -F "file=@report.pdf"
# → {"doc_id":"...","filename":"report.pdf","pages":12,"chunks":48,"created_at":"..."}

# 2. Ask
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"doc_id":"<doc_id>","question":"What are the key findings?"}'
# → {"answer":"...","sources":[{"page":3,"snippet":"..."}]}

# 3. List / delete
curl http://localhost:8000/documents
curl -X DELETE http://localhost:8000/documents/<doc_id>
```

## Configuration

All settings are environment variables prefixed `QA_` (see
[`.env.example`](.env.example)): `QA_OPENAI_API_KEY`, `QA_CHAT_MODEL`,
`QA_EMBEDDING_MODEL`, `QA_FAKE_AI`, `QA_DATA_DIR`, `QA_CHUNK_SIZE`,
`QA_CHUNK_OVERLAP`, `QA_RETRIEVAL_K`, `QA_MAX_UPLOAD_MB`, `QA_CORS_ORIGINS`.

## Development

```bash
make lint     # ruff check + format check
make test     # pytest in fake-AI mode (no key needed)
make fmt      # auto-fix
```

## Project layout

```
app/
  main.py     FastAPI app + routes
  config.py   pydantic-settings configuration
  schemas.py  request/response models
  rag.py      chunk -> embed -> FAISS retrieve -> answer (OpenAI or offline stub)
  store.py    SQLite document metadata
  static/     demo UI
tests/        API tests, run fully offline
Dockerfile, docker-compose.yml
```

## How RAG works here

1. **Ingest** — `PyPDFLoader` reads the PDF page by page (page numbers kept in
   chunk metadata). `RecursiveCharacterTextSplitter` cuts each page into
   ~1000-char chunks with 200-char overlap.
2. **Embed & store** — each chunk is embedded and written to a FAISS index saved
   under `<data_dir>/faiss/<doc_id>`, so documents stay isolated from each other.
3. **Retrieve** — at question time the query is embedded and the top `k`
   (default 4) chunks by similarity are pulled back.
4. **Answer** — the chunks become a context block passed to `gpt-4o-mini` with an
   instruction to answer *only* from that context and say "I don't know"
   otherwise. Retrieved chunks are returned as sources.

## License

MIT © 2026 Rama Bharti
