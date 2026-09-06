# Helpdesk AI — Customer Support Bot

A multi-tenant AI customer-support platform: context-aware **streaming chat**, a
**RAG knowledge base** (pgvector), an **embeddable widget**, and a **bearer-authed REST API** —
with the auth, testing, and deployment story of a real product.

It started as a ~60-line Express prototype (in-memory sessions, one hardcoded prompt) and was
rebuilt into the app described below.

## Features

| Area                  | What's implemented                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat**              | Streaming responses (Vercel AI SDK v7 `useChat` + `streamText`), per-conversation memory with token-budget trimming, org-specific system prompt + guardrails against prompt injection |
| **RAG**               | Upload `.txt/.md/.pdf` → chunk → embed → store in `pgvector`; cosine-distance retrieval over an HNSW index at answer time; answers cite the source document                  |
| **Multi-tenancy**     | `Organization` / `Membership` (OWNER/ADMIN/MEMBER) / per-org `ApiKey`; every query is org-scoped; email invites                                                              |
| **Public API**        | `POST /api/v1/sessions`, `POST /api/v1/messages` (JSON or streaming), `DELETE /api/v1/sessions/:id` — SHA-256-hashed keys, per-key rate limiting                             |
| **Widget**            | One-line `<script src=".../widget.js" data-org="...">` injects a floating chat iframe backed by the org's bot                                                                |
| **Analytics**         | Conversations/messages/docs, avg response time, 30-day message chart, most-cited documents                                                                                   |
| **Hardening**         | Zod validation on every route + action, consistent error envelope, structured logging (pino), security headers, `/api/health` DB check                                       |
| **Provider-agnostic** | `lib/ai/provider.ts` abstracts the LLM vendor; ships with **Google Gemini** (free tier) + a `mock` provider for hermetic CI                                                  |
| **CI/CD**             | Dockerized (multi-stage, `next standalone`); GitHub Actions runs typecheck / lint / format / unit (Vitest) / build / e2e (Playwright) against an ephemeral pgvector Postgres |

## Architecture

```
Next.js 15 (App Router, one app)
  app/(marketing)         landing page
  app/(auth)              sign-in / sign-up (Auth.js v5: credentials + Google OAuth)
  app/(app)               dashboard · conversations · knowledge base · settings
  app/widget/[orgId]      iframe chat surface        public/widget.js  loader
  app/api/
    chat                  streaming chat for the web UI (session-authed)
    v1/*                  public REST API            (API-key-authed, rate-limited)
    widget/[orgId]        widget backend             (public, per-org+IP rate-limited)
    documents, conversations, health
  lib/
    ai/ provider · prompt · chunk · embeddings · rag
    auth · tenant · api-key · rate-limit · chat-service · ingest · analytics
  prisma/  schema.prisma + SQL migrations (pgvector extension + HNSW index) + seed
```

**Request path for a chat message:** UI (`useChat`) → `POST /api/chat` → `requireOrg()` +
rate-limit → `runChat()` loads history, retrieves KB context, `streamText()` → tokens stream to
the client; `onFinish` persists both messages + a `UsageEvent` in one transaction.

## Tech stack

Next.js 15 · React 19 · TypeScript · Tailwind · Prisma 6 · PostgreSQL + pgvector ·
Auth.js (NextAuth v5) · Vercel AI SDK v7 · Google Gemini (`gemini-flash-lite-latest` for chat,
`gemini-embedding-001` at 768 dims for retrieval) · Vitest · Playwright · Docker · GitHub Actions.

> Google rotates model names fairly often. If chat/embeddings start returning 404, run
> `node scripts/check-ai.mjs`, then update `AI_CHAT_MODEL` / `AI_EMBEDDING_MODEL` in `.env`
> (list current models: `https://ai.google.dev/gemini-api/docs/models`).

## Local setup

Prerequisites: Node 22, Docker (for Postgres).

```bash
cp .env.example .env
# set AUTH_SECRET (npx auth secret) and GOOGLE_GENERATIVE_AI_API_KEY (https://aistudio.google.com/apikey)

docker compose up -d db        # Postgres 16 + pgvector on :5432
npm install
npm run db:migrate             # apply migrations
npm run db:seed                # demo user: demo@example.com / demo12345  (org: Acme Support)
npm run dev                    # http://localhost:3000
```

Run the whole stack in containers instead: `docker compose --profile app up --build`.

## Environment variables

| Var                                                                             | Required     | Notes                                                       |
| ------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------- |
| `DATABASE_URL`                                                                  | yes          | Postgres with the `vector` extension                        |
| `AUTH_SECRET`                                                                   | yes          | `npx auth secret`                                           |
| `AUTH_URL`                                                                      | prod         | Public base URL                                             |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`                                         | optional     | Enables "Sign in with Google"                               |
| `AI_PROVIDER`                                                                   | no           | `google` (default), or `mock` for tests                     |
| `GOOGLE_GENERATIVE_AI_API_KEY`                                                  | yes (google) | Free at Google AI Studio                                    |
| `AI_CHAT_MODEL` / `AI_EMBEDDING_MODEL` / `AI_EMBEDDING_DIM`                     | no           | Defaults: `gemini-flash-lite-latest` / `gemini-embedding-001` / `768` |
| `RATE_LIMIT_CHAT_PER_MINUTE` / `RATE_LIMIT_API_PER_MINUTE` / `MAX_UPLOAD_BYTES` | no           | Limits                                                      |

> Changing `AI_EMBEDDING_DIM` also requires editing the `vector(768)` column in
> `prisma/schema.prisma` and the migration, then re-embedding documents.

## Public API

```bash
# 1. Create a session
curl -sX POST http://localhost:3000/api/v1/sessions \
  -H "Authorization: Bearer sk_live_..."
# → { "sessionId": "clx...", "createdAt": "..." }

# 2. Send a message (JSON reply)
curl -sX POST http://localhost:3000/api/v1/messages \
  -H "Authorization: Bearer sk_live_..." -H "Content-Type: application/json" \
  -d '{"sessionId":"clx...","message":"My order hasn'\''t arrived."}'
# → { "reply": "...", "sessionId": "clx...", "citations": [ ... ] }

# stream instead:  add  "stream": true   → text/event-stream
# 3. End it
curl -sX DELETE http://localhost:3000/api/v1/sessions/clx... -H "Authorization: Bearer sk_live_..."
```

Create keys in **Settings → API keys** (shown once). `429` responses include `Retry-After`.

## Testing

```bash
npm test           # Vitest unit tests (chunking, prompt trimming, RAG formatting, API-key hashing)
npm run e2e        # Playwright: sign-up → conversation → mock reply → health check
```

E2E uses `AI_PROVIDER=mock`, so no API key or network is needed. CI runs the full chain.

## Deployment (Vercel + Neon — default)

1. Create a Neon (or Supabase/Railway) Postgres; run `CREATE EXTENSION IF NOT EXISTS vector;`
   (Prisma migrations do this too).
2. Import the repo into Vercel. Set the env vars above (`AUTH_URL` = the deploy URL).
3. Add repo secrets `DATABASE_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
4. Push to `main` → `.github/workflows/deploy.yml` runs `prisma migrate deploy` then deploys.

Any Docker host works too — the image runs `prisma migrate deploy && node server.js` on boot.

## Design decisions & trade-offs

- **One Next.js app, not a split UI/API.** Fewer moving parts, one deploy, shared types. The
  original Express contract lives on as `/api/v1/*`.
- **pgvector, not a dedicated vector DB.** One datastore, transactional writes with the rest of
  the schema, and every managed Postgres supports it. HNSW index for recall without a training step.
- **Postgres-backed rate limiting.** No Redis to run for a single-region deploy; the limiter is
  one `upsert`. `lib/rate-limit.ts` is a drop-in seam for Upstash later.
- **Inline ingestion.** Small files embed synchronously in the request. For large corpora, move
  `ingestDocument` behind a queue (BullMQ / QStash) — the function is already isolated.
- **JWT sessions.** Required by Auth.js when using the Credentials provider; the Prisma adapter
  still stores users and OAuth accounts.

## Known follow-ups

- Real transactional email for invites/verification (Resend) — currently the invite link is logged.
- Sentry wiring (the seam is `lib/logger.ts` + a consistent error envelope).
- Streaming for the widget + per-org allowed-origin checks.
- Queue-backed ingestion for large document sets.
