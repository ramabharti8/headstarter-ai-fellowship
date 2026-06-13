# AI Customer Support Bot

Context-aware customer support chatbot powered by GPT-4o-mini with per-session conversation memory.

## What It Does

- Maintains conversation history per session
- Stays in role as a helpful support agent
- Trims old messages to keep context within token limits
- Stateless REST interface — sessions stored in-memory

## Tech Stack

- **AI**: OpenAI GPT-4o-mini
- **Server**: Node.js + Express

## Setup

```bash
cp .env.example .env
# Add your OPENAI_API_KEY to .env
npm install
npm start
```

## API

```
POST /api/chat/session          — Create a new chat session
POST /api/chat/message          — Send a message
DELETE /api/chat/session/:id    — End a session
GET  /health                    — Health check
```

### Example

```bash
# 1. Create session
curl -X POST http://localhost:3000/api/chat/session
# → {"sessionId": "abc-123"}

# 2. Send message
curl -X POST http://localhost:3000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "abc-123", "message": "My order hasn'\''t arrived yet."}'
# → {"reply": "I'm sorry to hear that...", "sessionId": "abc-123"}
```
