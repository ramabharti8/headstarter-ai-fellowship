# AI Resume Screener

Upload a resume and a job description, get a structured hiring screen: a
0–100 score, a letter grade, concrete strengths and gaps, matched/missing
skills, and a hire / maybe / reject recommendation.

Pluggable AI provider (OpenAI GPT-4o / Groq) with an **offline skill-overlap
heuristic** as the default when no key is set — so the service, its tests and
CI all work with zero API keys.

## Features

- **`POST /screen`** — multipart upload: a resume file (PDF / DOCX / text) +
  a job description string → score, grade, summary, strengths, gaps,
  recommendation, matched/missing skills
- **File parsing** — PDF (`pypdf`), Word (`python-docx`), plain text/markdown,
  with clear 422s for unreadable or unsupported files (not silent garbage)
- **Pluggable provider** (`auto` / `openai` / `groq` / `fake`) — JSON-mode
  structured output on the model path, with a lenient parser + retry when a
  provider's JSON is malformed/truncated
- **Offline heuristic screener** — ~140-term skill taxonomy (languages,
  frameworks, cloud, data, soft skills) matched with word-boundary-aware
  regex against both the JD and the resume, a years-of-experience check via
  regex, and a keyword fallback when the JD names none of the known skills —
  deterministic, no network, no key
- **Abuse protection** — per-IP sliding-window rate limit, optional
  `RS_API_KEY` bearer/`X-API-Key` gate (disables the limiter when set)
- **Web UI** at `/` — drag-and-drop resume upload, JD textarea, score gauge,
  matched/missing skill chips, strengths/gaps lists, light/dark
- Dockerised, `docker-compose`, `render.yaml`, GitHub Actions CI, 34 offline
  tests, ruff-clean

## Quick start

```bash
cp .env.example .env
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

No API key needed — with none set it runs the offline heuristic screener.
Add `RS_OPENAI_API_KEY` or `RS_GROQ_API_KEY` in `.env` for real LLM scoring.

## API

### `POST /screen`

```bash
curl -X POST http://localhost:8000/screen \
  -F "resume=@candidate_resume.pdf" \
  -F "job_description=We are looking for a Python backend engineer with FastAPI..."
```

```json
{
  "score": 82,
  "grade": "B",
  "summary": "Matches 6/8 key skills from the job description (75% coverage) — grade B.",
  "strengths": ["Demonstrates Python", "Demonstrates FastAPI", "..."],
  "gaps": ["No clear evidence of Docker", "No clear evidence of AWS"],
  "recommendation": "hire",
  "key_skills_matched": ["Python", "FastAPI", "PostgreSQL", "REST"],
  "key_skills_missing": ["Docker", "AWS"],
  "provider": "fake",
  "model": "-",
  "resume_truncated": false,
  "jd_truncated": false
}
```

### `GET /health`

Provider, model, auth/docs flags.

## Configuration

All via environment / `.env` (prefix `RS_`). See [`.env.example`](.env.example).

| Var | Default | Purpose |
|-----|---------|---------|
| `RS_PROVIDER` | `auto` | `auto` / `openai` / `groq` / `fake` |
| `RS_OPENAI_API_KEY` / `RS_GROQ_API_KEY` | — | Provider keys; `auto` picks the first set, else `fake` |
| `RS_CHAT_MODEL` | per-provider default | Override the chat model |
| `RS_FAKE_AI` | `0` | `1` forces the offline heuristic screener |
| `RS_MAX_RESUME_CHARS` / `RS_MAX_JD_CHARS` | `20000` / `8000` | Truncate longer input (flagged in the response) |
| `RS_MAX_UPLOAD_BYTES` | `5242880` (5 MB) | Reject a larger resume file (413) |
| `RS_MAX_OUTPUT_TOKENS` | `2000` | Ceiling on the model's structured response |
| `RS_API_KEY` | — | When set, gates `/screen`; disables the rate limiter |
| `RS_RATE_LIMIT_PER_MIN` | `20` | Per-IP requests/min (`0` disables) |
| `RS_CORS_ORIGINS` | `*` | Comma-separated origins |
| `RS_DOCS_ENABLED` | `true` | Serve `/docs`, `/redoc`, `/openapi.json` |

## Development

```bash
make install   # deps
make test      # RS_FAKE_AI=1 pytest
make lint      # ruff check + format --check
make run       # uvicorn --reload
```

## Deploy

### Docker

```bash
docker compose up --build
```

### Render

Point a Blueprint at the repo — it reads [`render.yaml`](render.yaml).

## How it works

```
resume file → extract_text (PDF/DOCX/text) ─┐
                                              ├─→ Screener.screen()
job description ─────────────────────────────┘         │
                                                         ▼
                                   fake: skill-overlap heuristic
                                   openai/groq: structured JSON via chat model
                                                         │
                                                         ▼
                                    score, grade, strengths, gaps,
                                    recommendation, matched/missing skills
```

The offline heuristic (`app/screener.py::heuristic_screen`) matches a curated
skill list against both documents, adds an experience-years check
(`"3+ years"` style regex), and falls back to frequency-ranked JD keywords
when none of the known skills appear — so it stays useful on JDs outside tech,
not just a stub that always says "maybe".
