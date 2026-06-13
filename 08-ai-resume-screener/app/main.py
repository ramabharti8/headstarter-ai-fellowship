import os
import json
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import pypdf
import io

app = FastAPI(title="AI Resume Screener")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

SCREENER_PROMPT = """You are an expert HR recruiter and talent acquisition specialist.
Analyze the resume against the job description and return a JSON object with:
{
  "score": <0-100>,
  "grade": "<A/B/C/D/F>",
  "summary": "<2-sentence overview>",
  "strengths": ["<strength1>", "<strength2>", ...],
  "gaps": ["<gap1>", "<gap2>", ...],
  "recommendation": "<hire/maybe/reject>",
  "key_skills_matched": ["<skill1>", ...],
  "key_skills_missing": ["<skill1>", ...]
}
Return ONLY the JSON, no markdown."""


def extract_text_from_pdf(file_bytes: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


class ScreenResult(BaseModel):
    score: int
    grade: str
    summary: str
    strengths: list[str]
    gaps: list[str]
    recommendation: str
    key_skills_matched: list[str]
    key_skills_missing: list[str]


@app.post("/screen", response_model=ScreenResult)
async def screen_resume(
    resume: UploadFile = File(...),
    job_description: str = Form(...),
):
    resume_text = extract_text_from_pdf(await resume.read())
    prompt = f"JOB DESCRIPTION:\n{job_description}\n\nRESUME:\n{resume_text}"

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SCREENER_PROMPT},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    return json.loads(response.choices[0].message.content)


@app.get("/health")
def health():
    return {"status": "ok"}
