# Document Q&A API

Upload any PDF and ask natural-language questions about it. Uses LangChain + ChromaDB for RAG.

## What It Does

- Accepts PDF uploads and chunks them into a vector store
- Answers questions using retrieval-augmented generation (RAG)
- Returns answers with source page references

## Tech Stack

- **AI**: OpenAI GPT-4o-mini + text-embedding-ada-002
- **RAG**: LangChain + ChromaDB
- **API**: FastAPI + uvicorn

## Setup

```bash
cp .env.example .env
# Add OPENAI_API_KEY
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## API

```
POST /upload    — Upload a PDF document, get back a doc_id
POST /ask       — Ask a question about an uploaded document
GET  /health    — Health check
```

### Example

```bash
# 1. Upload
curl -X POST http://localhost:8000/upload -F "file=@report.pdf"
# → {"doc_id": "uuid", "chunks": 48, "pages": 12}

# 2. Ask
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"doc_id": "uuid", "question": "What are the key findings?"}'
```
