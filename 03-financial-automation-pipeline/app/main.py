from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from app.pipeline import load_transactions, generate_report

app = FastAPI(title="Financial Automation Pipeline")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    file_bytes = await file.read()
    df = load_transactions(file_bytes, file.filename)
    report = generate_report(df)
    return report


@app.get("/health")
def health():
    return {"status": "ok"}
