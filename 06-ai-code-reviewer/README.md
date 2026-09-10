# AI Code Reviewer

Submit a code snippet or a unified diff and get a **structured code review** back:
a summary, a PR-style verdict, severity-ranked issues with line numbers,
improvement ideas, a refactored version of the code, and a quality score out of 10.

[![CI](https://github.com/ramabharti8/headstarter-ai-fellowship/actions/workflows/coderev-ci.yml/badge.svg)](https://github.com/ramabharti8/headstarter-ai-fellowship/actions/workflows/coderev-ci.yml)

---

## What it does

- **`POST /review`** — send `code` (or a unified `diff`), an optional `language`
  hint, `context`, and `focus` lenses. Returns strict JSON:

  ```jsonc
  {
    "summary": "…",
    "verdict": "approve | comment | request_changes",
    "score": 6.5,
    "issues": [
      { "severity": "critical", "category": "security", "line": 4,
        "title": "SQL built by string concatenation",
        "detail": "…", "suggestion": "Use parameterised queries." }
    ],
    "improvements": ["Add unit tests for the error path", "…"],
    "refactored_code": "…",
    "language": "python",
    "provider": "openai",
    "model": "gpt-4o",
    "truncated": false
  }
  ```

- **`GET /health`** — liveness plus the active provider and model.
- **`GET /`** — a web UI: paste code, pick a language, choose focus areas, and
  read the review with severity badges, a score ring, and the refactor.

## How it works

| Layer | Choice | Why |
|-------|--------|-----|
| API | FastAPI + uvicorn | Async, typed, auto OpenAPI docs at `/docs` |
| Model | OpenAI `gpt-4o` (default) or Groq `openai/gpt-oss-20b` | Same OpenAI SDK — Groq via `base_url`. Free tier available |
| Output | Chat Completions **JSON mode** (`response_format={"type":"json_object"}`) | Deterministic, parseable structure — no brittle markdown scraping |
| Parsing | Lenient JSON loader + schema normalisation | Recovers from fenced/wrapped JSON; clamps score, validates severity/category, sorts by severity, derives the verdict if the model omits it |
| Offline mode | `CR_FAKE_AI=1` → regex/heuristic reviewer | Flags `eval`/`exec`, bare `except`, hard-coded secrets, SQL concatenation, stray `print`/`console.log`, `TODO`s, long lines. Runs the whole service (and its tests) with **no API key** |
| Abuse control | In-memory sliding-window rate limit per IP; optional `CR_API_KEY` bearer gate | Safe to expose publicly |

## Setup

```bash
cp .env.example .env          # optional — add CR_OPENAI_API_KEY for a real review
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://localhost:8000. With no key set it runs the offline heuristic
reviewer; add `CR_OPENAI_API_KEY` (or `CR_GROQ_API_KEY`) for a full AI review.

### Example

```bash
curl -X POST http://localhost:8000/review \
  -H "Content-Type: application/json" \
  -d '{
        "code": "def get_user(uid):\n    return db.execute(\"SELECT * FROM users WHERE id = \" + uid)",
        "language": "python",
        "context": "user lookup in a web backend",
        "focus": ["security"]
      }'
```

## Configuration

All settings are environment variables with the `CR_` prefix (see
[`.env.example`](.env.example)). Key ones:

| Var | Default | Meaning |
|-----|---------|---------|
| `CR_PROVIDER` | `auto` | `auto` picks the first key set (openai → groq), else `fake` |
| `CR_OPENAI_API_KEY` / `CR_GROQ_API_KEY` | — | Provider credentials |
| `CR_CHAT_MODEL` | per-provider | Override the model |
| `CR_FAKE_AI` | `0` | Force the offline heuristic reviewer |
| `CR_API_KEY` | — | Require `Authorization: Bearer` / `X-API-Key` on `/review` (disables the rate limiter) |
| `CR_RATE_LIMIT_PER_MIN` | `20` | Per-IP request cap (0 disables) |
| `CR_MAX_CODE_CHARS` | `20000` | Input longer than this is truncated |
| `CR_MAX_OUTPUT_TOKENS` | `6000` | Ceiling on the model response; raise for very large files |
| `CR_DOCS_ENABLED` | `true` | Serve `/docs`, `/redoc`, `/openapi.json` |

## Tests & linting

```bash
make install        # pip install -r requirements-dev.txt
make test           # CR_FAKE_AI=1 pytest  — no network needed
make lint           # ruff check + format --check
```

## Docker

```bash
docker compose up --build          # http://localhost:8000
# or
docker build -t ai-code-reviewer .
docker run -p 8000:8000 -e CR_OPENAI_API_KEY=sk-... ai-code-reviewer
```

## Deploy

- **Render** — [`render.yaml`](render.yaml) is a Blueprint. Create a new
  Blueprint from this repo, then set `CR_OPENAI_API_KEY` in the dashboard.
- **Railway / Fly / any container host** — build the `Dockerfile`, expose port
  `8000`, set `CR_OPENAI_API_KEY` (or `CR_GROQ_API_KEY`). Health check: `/health`.
- For a public instance, set `CR_API_KEY` and `CR_DOCS_ENABLED=false`.
