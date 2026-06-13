import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

app = FastAPI(title="AI Code Reviewer")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

REVIEW_PROMPT = """You are an expert code reviewer. Analyze the following code and provide:

1. **Summary** — What the code does
2. **Issues** — Bugs, security vulnerabilities, or logic errors (with line references)
3. **Improvements** — Performance, readability, or best-practice suggestions
4. **Refactored Code** — Improved version of the code
5. **Score** — Overall quality score out of 10

Be specific and actionable. Format your response in Markdown."""


class ReviewRequest(BaseModel):
    code: str
    language: str = "python"
    context: str = ""


class ReviewResponse(BaseModel):
    review: str
    language: str


@app.post("/review", response_model=ReviewResponse)
async def review_code(req: ReviewRequest):
    user_message = f"Language: {req.language}\n"
    if req.context:
        user_message += f"Context: {req.context}\n"
    user_message += f"\n```{req.language}\n{req.code}\n```"

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": REVIEW_PROMPT},
            {"role": "user", "content": user_message},
        ],
        max_tokens=2048,
        temperature=0.3,
    )
    return ReviewResponse(review=response.choices[0].message.content, language=req.language)


@app.get("/health")
def health():
    return {"status": "ok"}
