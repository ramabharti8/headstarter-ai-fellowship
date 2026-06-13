import os
import uuid
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import chromadb

app = FastAPI(title="Smart Semantic Search API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
chroma_client = chromadb.EphemeralClient()
collection = chroma_client.get_or_create_collection("documents")


def embed(texts: list[str]) -> list[list[float]]:
    response = openai_client.embeddings.create(model="text-embedding-3-small", input=texts)
    return [item.embedding for item in response.data]


class IndexRequest(BaseModel):
    documents: list[str]
    ids: list[str] | None = None
    metadata: list[dict] | None = None


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


@app.post("/index")
async def index_documents(req: IndexRequest):
    ids = req.ids or [str(uuid.uuid4()) for _ in req.documents]
    embeddings = embed(req.documents)
    metadata = req.metadata or [{} for _ in req.documents]

    collection.upsert(
        documents=req.documents,
        embeddings=embeddings,
        ids=ids,
        metadatas=metadata,
    )
    return {"indexed": len(req.documents), "ids": ids}


@app.post("/search")
async def search(req: SearchRequest):
    query_embedding = embed([req.query])[0]
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(req.top_k, collection.count()),
    )
    return {
        "query": req.query,
        "results": [
            {
                "document": doc,
                "id": doc_id,
                "distance": dist,
                "metadata": meta,
            }
            for doc, doc_id, dist, meta in zip(
                results["documents"][0],
                results["ids"][0],
                results["distances"][0],
                results["metadatas"][0],
            )
        ],
    }


@app.delete("/index/{doc_id}")
async def delete_document(doc_id: str):
    collection.delete(ids=[doc_id])
    return {"deleted": doc_id}


@app.get("/health")
def health():
    return {"status": "ok", "total_documents": collection.count()}
