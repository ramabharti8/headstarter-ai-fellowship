# AI Resume Screener

Automatically scores resumes against job descriptions using GPT-4o, returning structured hiring recommendations.

## What It Does

- Extracts text from PDF resumes
- Compares resume against job description
- Returns a score (0–100), grade, strengths, gaps, and hire/maybe/reject recommendation
- Lists matched and missing key skills

## Tech Stack

- **AI**: OpenAI GPT-4o
- **PDF Parsing**: pypdf
- **API**: FastAPI + uvicorn

## Setup

```bash
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## API

```
POST /screen    — Upload resume PDF + job description, get screening result
GET  /health    — Health check
```

### Example

```bash
curl -X POST http://localhost:8000/screen \
  -F "resume=@candidate_resume.pdf" \
  -F "job_description=We are looking for a Python backend engineer with FastAPI..."
```

Response:
```json
{
  "score": 82,
  "grade": "B",
  "summary": "Strong Python background with relevant API experience...",
  "strengths": ["FastAPI expertise", "5 years Python"],
  "gaps": ["No cloud deployment experience"],
  "recommendation": "hire",
  "key_skills_matched": ["Python", "FastAPI", "REST APIs"],
  "key_skills_missing": ["AWS", "Docker"]
}
```
