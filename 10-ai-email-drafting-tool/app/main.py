import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from typing import Literal

app = FastAPI(title="AI Email Drafting Tool")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

TONES = {
    "professional": "formal and professional business tone",
    "friendly": "warm and friendly tone",
    "assertive": "confident and assertive tone",
    "empathetic": "empathetic and understanding tone",
}

PROMPT = """You are an expert email writer. Draft a complete, polished email based on the bullet points provided.
Include: Subject line (prefixed with 'Subject:'), greeting, body paragraphs, and sign-off.
Tone: {tone}. Keep it concise and impactful."""


class DraftRequest(BaseModel):
    bullet_points: list[str]
    recipient: str = ""
    sender: str = ""
    tone: Literal["professional", "friendly", "assertive", "empathetic"] = "professional"
    context: str = ""


class DraftResponse(BaseModel):
    subject: str
    body: str
    full_email: str
    tone: str


@app.post("/draft", response_model=DraftResponse)
async def draft_email(req: DraftRequest):
    bullets = "\n".join(f"- {b}" for b in req.bullet_points)
    user_content = f"Key points:\n{bullets}"
    if req.recipient:
        user_content += f"\nRecipient: {req.recipient}"
    if req.sender:
        user_content += f"\nSender: {req.sender}"
    if req.context:
        user_content += f"\nAdditional context: {req.context}"

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": PROMPT.format(tone=TONES[req.tone])},
            {"role": "user", "content": user_content},
        ],
        max_tokens=1024,
        temperature=0.7,
    )

    full_email = response.choices[0].message.content
    lines = full_email.strip().split("\n")
    subject = next((l.replace("Subject:", "").strip() for l in lines if l.startswith("Subject:")), "")
    body = "\n".join(l for l in lines if not l.startswith("Subject:")).strip()

    return DraftResponse(subject=subject, body=body, full_email=full_email, tone=req.tone)


@app.get("/health")
def health():
    return {"status": "ok"}
