# AI Email Drafting Tool

Turn a list of bullet points into a polished, tone-matched email — subject
line, body, and the full formatted email, ready to send or revise.

Pluggable AI provider (OpenAI GPT-4o-mini / Groq) with an **offline
template-based drafter** as the default when no key is set — so the service,
its tests and CI all work with zero API keys.

## Features

- **`POST /draft`** — bullet points → subject + body + full email. Six tones
  (professional, friendly, assertive, empathetic, persuasive, apologetic),
  three lengths (short/medium/long), optional recipient/sender/context
- **Multiple variants in one call** (`variants: 1-3`) — get a few different
  angles on the same points and pick the one you like
- **`POST /revise`** — iterate on a draft with plain-English feedback
  ("make it shorter", "more formal") instead of starting over
- **Pluggable provider** (`auto` / `openai` / `groq` / `fake`) — JSON-free
  plain-text protocol (`Subject: ...` first line) with a robust parser that
  derives a subject even if the model forgets the header
- **Offline template drafter** — not a stub: real tone-specific greetings,
  openers, closers and sign-offs, length-aware body construction, and a
  rule-based `/revise` (shorten / expand / tone-shift / append-note) — fully
  deterministic, used by the test suite and CI
- **Abuse protection** — per-IP sliding-window rate limit, optional
  `EM_API_KEY` bearer/`X-API-Key` gate (disables the limiter when set)
- **Web UI** at `/` — dynamic bullet-point list, tone/length/variants
  controls, variant tabs, one-click copy, an inline revise box, light/dark
- Dockerised, `docker-compose`, `render.yaml`, GitHub Actions CI, 32 offline
  tests, ruff-clean

## Quick start

```bash
cp .env.example .env
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

No API key needed — with none set it runs the offline template drafter.
Add `EM_OPENAI_API_KEY` or `EM_GROQ_API_KEY` in `.env` for real LLM drafting.

## API

### `POST /draft`

```bash
curl -X POST http://localhost:8000/draft \
  -H "Content-Type: application/json" \
  -d '{
    "bullet_points": [
      "Meeting rescheduled to Thursday 3pm",
      "New agenda includes budget review",
      "Please confirm attendance"
    ],
    "recipient": "Team",
    "sender": "Rama",
    "tone": "professional"
  }'
```

```json
{
  "drafts": [
    {
      "subject": "Update: Meeting rescheduled to Thursday 3pm",
      "body": "Dear Team,\n\n...",
      "full_email": "Subject: ...\n\nDear Team,\n\n..."
    }
  ],
  "tone": "professional",
  "length": "medium",
  "provider": "fake",
  "model": "-",
  "truncated": false,
  "subject": "Update: Meeting rescheduled to Thursday 3pm",
  "body": "Dear Team,\n\n...",
  "full_email": "Subject: ...\n\nDear Team,\n\n..."
}
```

`subject`/`body`/`full_email` at the top level mirror `drafts[0]` for callers
that only want one draft; pass `"variants": 2` or `3` to get alternatives in
`drafts[1]`, `drafts[2]`.

### `POST /revise`

```bash
curl -X POST http://localhost:8000/revise \
  -H "Content-Type: application/json" \
  -d '{"full_email": "Subject: ...\n\nDear Team,...", "feedback": "make it shorter and more friendly"}'
```

### `GET /health`

Provider, model, auth/docs flags.

## Configuration

All via environment / `.env` (prefix `EM_`). See [`.env.example`](.env.example).

| Var | Default | Purpose |
|-----|---------|---------|
| `EM_PROVIDER` | `auto` | `auto` / `openai` / `groq` / `fake` |
| `EM_OPENAI_API_KEY` / `EM_GROQ_API_KEY` | — | Provider keys; `auto` picks the first set, else `fake` |
| `EM_CHAT_MODEL` | per-provider default | Override the chat model |
| `EM_FAKE_AI` | `0` | `1` forces the offline template drafter |
| `EM_MAX_BULLETS` / `EM_MAX_BULLET_CHARS` | `20` / `300` | Truncate an oversized request (flagged in the response) |
| `EM_MAX_CONTEXT_CHARS` | `1000` | Truncate longer context |
| `EM_MAX_VARIANTS` | `3` | Reject a larger `variants` value (422) |
| `EM_MAX_OUTPUT_TOKENS` | `900` | Ceiling on the model's response, per draft |
| `EM_API_KEY` | — | When set, gates `/draft` and `/revise`; disables the rate limiter |
| `EM_RATE_LIMIT_PER_MIN` | `30` | Per-IP requests/min (`0` disables) |
| `EM_CORS_ORIGINS` | `*` | Comma-separated origins |
| `EM_DOCS_ENABLED` | `true` | Serve `/docs`, `/redoc`, `/openapi.json` |

## Development

```bash
make install   # deps
make test      # EM_FAKE_AI=1 pytest
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
bullets + tone + length + context → Drafter.draft()
                                         │  fake: template engine (tone-specific
                                         │        greeting/opener/closer/sign-off,
                                         │        length-aware body)
                                         │  openai/groq: chat model, plain-text
                                         │        "Subject: ..." protocol
                                         ▼
                              _parse_email() → subject + body + full_email
```

The model is asked for plain text, not JSON — an email is prose, and forcing
JSON mode would fight the writing. `_parse_email` is deliberately lenient: it
looks for a line starting with `Subject:` anywhere in the response and treats
everything else as the body, falling back to a subject derived from the first
bullet point if the model forgets the header entirely.

`/revise` on the offline path doesn't call an LLM — it pattern-matches the
feedback text ("shorter"/"formal"/"friendly"/etc.) against a small rule set
and edits the existing draft directly (swap sign-off, compress multi-sentence
paragraphs to their first sentence, or append a note), which is enough to
demo the iterate-on-feedback flow with zero network calls.
