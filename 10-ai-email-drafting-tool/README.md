# AI Email Drafting Tool

Generates professional email drafts from bullet points using GPT-4o-mini.

## What It Does

- Converts a list of key points into a polished email
- Supports tone options: professional, friendly, assertive, empathetic
- Returns subject line, body, and full email separately

## Tech Stack

- **AI**: OpenAI GPT-4o-mini
- **API**: FastAPI + uvicorn

## Setup

```bash
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## API

```
POST /draft     — Generate email from bullet points
GET  /health    — Health check
```

### Example

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

Response:
```json
{
  "subject": "Meeting Rescheduled — Thursday 3:00 PM",
  "body": "Dear Team,\n\nI wanted to let you know...",
  "full_email": "Subject: ...\n\nDear Team...",
  "tone": "professional"
}
```
