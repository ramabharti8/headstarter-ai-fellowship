# Smart Search API

Semantic search across documents using OpenAI embeddings and ChromaDB vector similarity.

## What It Does

- Indexes documents as vector embeddings
- Finds semantically similar documents even without keyword overlap
- Supports document deletion and real-time indexing

## Tech Stack

- **Embeddings**: OpenAI `text-embedding-3-small`
- **Vector Store**: ChromaDB (ephemeral, swap for persistent)
- **API**: FastAPI + uvicorn

## Setup

```bash
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## API

```
POST /index           — Add documents to the search index
POST /search          — Semantic search query
DELETE /index/:id     — Remove a document
GET  /health          — Health check + document count
```

### Example

```bash
# Index documents
curl -X POST http://localhost:8000/index \
  -H "Content-Type: application/json" \
  -d '{"documents": ["FastAPI is a modern Python web framework", "React is a JavaScript UI library"]}'

# Search
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Python backend framework", "top_k": 3}'
```
