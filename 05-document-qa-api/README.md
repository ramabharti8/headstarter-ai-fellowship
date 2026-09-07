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
- **`POST /summarize`** — summarise the document as a whole: reads a broad
  sample of chunks from across the PDF (capped by `QA_SUMMARY_MAX_CHUNKS`,
  default 40), batch-summarises, then combines. Optional `focus` string. A few
  model calls — slower than `/ask`. Use for "summarise the whole book".
- **`GET /documents`**, **`GET /documents/{id}`**, **`DELETE /documents/{id}`** —
  manage uploaded documents. Metadata is kept in SQLite so it survives restarts.
- **`GET /health`** — liveness + the active provider.
- **`GET /`** — a chat-style web UI (see below).

## Tech stack

| Layer      | Choice                                         | Why |
|------------|------------------------------------------------|-----|
| API        | FastAPI + Uvicorn                              | async, typed, auto OpenAPI docs |
| LLM        | pluggable — OpenAI / Groq / Gemini             | pick per key; `auto` mode selects one |
| Embeddings | OpenAI, Gemini, or local fastembed (ONNX)      | local option is free and needs no key |
| Vectors    | FAISS (persisted to disk, one index per doc)   | prebuilt wheels on every OS, survives restarts, ships in Docker |
| Chunking   | `RecursiveCharacterTextSplitter` (1000 / 200) | keeps sentences intact, overlap preserves context |
| Metadata   | SQLite                                         | durable document list without a DB server |

> **Why FAISS and not Chroma?** The task brief names ChromaDB, but Chroma's
> `hnswlib` dependency has no prebuilt wheel for Windows and needs a C++
> toolchain. FAISS gives the same similarity-search semantics with zero-friction
> installs everywhere. Swapping back is a ~15-line change in `app/rag.py`.

## Model providers

Set `QA_PROVIDER` (or leave it `auto`, which picks the first key it finds):

| `QA_PROVIDER` | Key env var        | Cost        | Chat model (default)        | Embeddings |
|---------------|--------------------|-------------|-----------------------------|------------|
| `openai`      | `QA_OPENAI_API_KEY`| paid        | `gpt-4o-mini`               | `text-embedding-3-small` |
| `groq`        | `QA_GROQ_API_KEY`  | **free**    | `openai/gpt-oss-20b`        | local fastembed `bge-small-en-v1.5` (no key) |
| `gemini`      | `QA_GOOGLE_API_KEY`| **free tier** | `gemini-2.0-flash`        | `models/text-embedding-004` |
| `fake`        | none               | free/offline | deterministic stub         | deterministic hash vectors |

- **Groq key:** <https://console.groq.com/keys> (no card). First question triggers
  a one-time ~90 MB fastembed model download, then it's cached. Groq rotates its
  hosted models — if `openai/gpt-oss-20b` ever 404s, set `QA_CHAT_MODEL` to any id
  from <https://console.groq.com/docs/models>.
- **Gemini key:** <https://aistudio.google.com/apikey> (no card).
- `QA_FAKE_AI=1` forces `fake` regardless of keys — used by the tests and CI.

> ⚠️ A FAISS index is tied to the embedding model that built it. If you switch
> providers, delete `data/` (or re-upload) so indexes are rebuilt with the new
> embeddings — otherwise `/ask` will fail with a dimension mismatch.

## Quick start

```bash
cd 05-document-qa-api
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

cp .env.example .env          # add one provider key, or set QA_FAKE_AI=1
uvicorn app.main:app --reload
```

Open <http://localhost:8000> for the UI or <http://localhost:8000/docs> for
Swagger. `GET /health` shows the active provider.

## Web UI

`GET /` serves a single-page, chat-style client (no build step — plain
HTML/CSS/JS in `app/static/`, served by FastAPI):

- drag-and-drop PDF upload, document list with delete
- a conversation thread per document, persisted in `localStorage`
- Markdown-rendered answers (tables, lists, code) via `marked` + `DOMPurify`
- source citations as page chips that expand to show the retrieved passage
- per-answer latency, copy button, "Summarize document" action
- light / dark theme, responsive down to mobile
- unlock prompt when `QA_API_KEY` is set (key kept in `localStorage`, "Lock" to clear)

## Docker

```bash
# free provider
QA_GROQ_API_KEY=gsk_... docker compose up --build

# offline demo
QA_FAKE_AI=1 docker compose up --build
```

The `qa_data` volume holds the FAISS indexes and the SQLite database, so uploaded
documents persist across container restarts.

## Deploying publicly

Two env vars lock the instance down (both optional — unset = open, for local dev):

| Var | Effect |
|-----|--------|
| `QA_API_KEY` | Every endpoint except `/health` and the UI shell requires `Authorization: Bearer <key>` or `X-API-Key: <key>`. The web UI shows a one-time unlock prompt and stores the key in `localStorage`. |
| `QA_DOCS_ENABLED=false` | Hides `/docs`, `/redoc` and `/openapi.json` (they 404). |

```bash
QA_GROQ_API_KEY=gsk_... QA_API_KEY=$(openssl rand -hex 16) QA_DOCS_ENABLED=false \
  docker compose up --build
```

`/health` stays open so container / load-balancer health checks keep working.

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

# If QA_API_KEY is set, add:  -H "X-API-Key: <key>"
```

## Configuration

All settings are environment variables prefixed `QA_` (see
[`.env.example`](.env.example)): provider keys, `QA_PROVIDER`, `QA_CHAT_MODEL`,
`QA_EMBEDDING_MODEL`, `QA_FAKE_AI`, `QA_DATA_DIR`, `QA_CHUNK_SIZE`,
`QA_CHUNK_OVERLAP`, `QA_RETRIEVAL_K`, `QA_MAX_ANSWER_TOKENS`, `QA_SNIPPET_CHARS`,
`QA_MAX_UPLOAD_MB`, `QA_CORS_ORIGINS`.

**Getting fuller answers.** `/ask` only shows the model the chunks it retrieves,
so a broad question is limited by `QA_RETRIEVAL_K` (default 6 — raise to 10–12
for wide questions). For a whole-document summary use **`/summarize`**. On free-tier providers (Groq,
Gemini) keep `QA_SUMMARY_MAX_CHUNKS` modest — each extra batch is another
rate-limited call. Generated length is capped by `QA_MAX_ANSWER_TOKENS`.

## Development

```bash
make lint     # ruff check + format check
make test     # pytest in fake-AI mode (no key needed)
make fmt      # auto-fix
```

## Project layout

```
app/
  main.py       FastAPI app + routes
  config.py     pydantic-settings configuration
  schemas.py    request/response models
  rag.py        chunk -> embed -> FAISS retrieve -> answer / summarize
  store.py      SQLite document metadata
  static/       chat-style web UI (index.html + assets/)
tests/          API + config tests, run fully offline
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

### Performance

The embeddings client, the chat client, and loaded FAISS indexes (LRU, 32 docs)
are created once and reused across requests — a cold `/ask` otherwise spent
200–500 ms rebuilding clients and re-reading the index from disk before any
model call. A freshly uploaded document is cached at ingest time, so its first
question skips the reload entirely. After that, `/ask` latency is essentially
just the OpenAI round-trip; lower `QA_RETRIEVAL_K` to trim it further.

## License

MIT © 2026 Rama Bharti
