# AI Code Reviewer

GPT-4o powered code review API that analyzes code snippets and returns structured feedback.

## What It Does

- Identifies bugs, security vulnerabilities, and logic errors
- Suggests performance and readability improvements
- Returns a refactored version of the code
- Scores code quality out of 10

## Tech Stack

- **AI**: OpenAI GPT-4o
- **API**: FastAPI + uvicorn

## Setup

```bash
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## API

```
POST /review    — Submit code for review
GET  /health    — Health check
```

### Example

```bash
curl -X POST http://localhost:8000/review \
  -H "Content-Type: application/json" \
  -d '{
    "code": "def add(a, b):\n  return a+b",
    "language": "python",
    "context": "utility function for calculator app"
  }'
```

Response includes: summary, issues list, improvement suggestions, refactored code, and a quality score.
