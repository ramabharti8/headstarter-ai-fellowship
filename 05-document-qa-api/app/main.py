"""FastAPI application: upload PDFs, ask natural-language questions."""

from __future__ import annotations

import logging
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import __version__
from .config import Settings, get_settings
from .rag import RagEngine
from .schemas import (
    AnswerResponse,
    DocumentInfo,
    DocumentList,
    HealthResponse,
    QuestionRequest,
    Source,
    UploadResponse,
)
from .store import DocumentStore

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
log = logging.getLogger("docqa")

_STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.store = DocumentStore(settings.db_path)
    app.state.rag = RagEngine(settings)
    log.info(
        "Document Q&A API v%s ready (ai_enabled=%s fake_ai=%s)",
        __version__,
        settings.ai_enabled,
        settings.fake_ai,
    )
    yield


app = FastAPI(
    title="Document Q&A API",
    version=__version__,
    description="Upload a PDF, ask questions, get answers with page-level sources.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _settings() -> Settings:
    return get_settings()


def get_store() -> DocumentStore:
    return app.state.store


def get_rag() -> RagEngine:
    return app.state.rag


@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health(settings: Settings = Depends(_settings)) -> HealthResponse:
    return HealthResponse(
        version=__version__,
        ai_enabled=settings.ai_enabled,
        fake_ai=settings.fake_ai,
    )


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(_STATIC / "index.html")


@app.post(
    "/upload",
    response_model=UploadResponse,
    tags=["documents"],
    responses={400: {"description": "Invalid file"}, 503: {"description": "AI disabled"}},
)
async def upload_document(
    file: UploadFile = File(...),
    settings: Settings = Depends(_settings),
    store: DocumentStore = Depends(get_store),
    rag: RagEngine = Depends(get_rag),
) -> UploadResponse:
    if not settings.ai_enabled:
        raise HTTPException(503, "AI provider not configured. Set QA_OPENAI_API_KEY.")
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported.")

    payload = await file.read()
    if len(payload) == 0:
        raise HTTPException(400, "Uploaded file is empty.")
    if len(payload) > settings.max_upload_bytes:
        raise HTTPException(400, f"File exceeds the {settings.max_upload_mb} MB limit.")

    doc_id = store.new_id()
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(payload)
            tmp_path = Path(tmp.name)
        result = rag.ingest_pdf(tmp_path, doc_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        log.exception("ingest failed")
        rag.delete(doc_id)
        raise HTTPException(500, f"Failed to process document: {exc}") from exc
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink()

    info = store.add(doc_id, file.filename, result.pages, result.chunks)
    log.info("ingested %s (%s pages, %s chunks)", doc_id, result.pages, result.chunks)
    return UploadResponse(**info.model_dump())


@app.get("/documents", response_model=DocumentList, tags=["documents"])
def list_documents(store: DocumentStore = Depends(get_store)) -> DocumentList:
    return DocumentList(documents=store.list())


@app.get(
    "/documents/{doc_id}",
    response_model=DocumentInfo,
    tags=["documents"],
    responses={404: {"description": "Not found"}},
)
def get_document(doc_id: str, store: DocumentStore = Depends(get_store)) -> DocumentInfo:
    info = store.get(doc_id)
    if not info:
        raise HTTPException(404, "Document not found.")
    return info


@app.delete(
    "/documents/{doc_id}",
    status_code=204,
    response_model=None,
    tags=["documents"],
    responses={404: {"description": "Not found"}},
)
def delete_document(
    doc_id: str,
    store: DocumentStore = Depends(get_store),
    rag: RagEngine = Depends(get_rag),
) -> Response:
    if not store.get(doc_id):
        raise HTTPException(404, "Document not found.")
    store.delete(doc_id)
    rag.delete(doc_id)
    return Response(status_code=204)


@app.post(
    "/ask",
    response_model=AnswerResponse,
    tags=["qa"],
    responses={
        404: {"description": "Document not found"},
        503: {"description": "AI disabled"},
    },
)
def ask_question(
    req: QuestionRequest,
    settings: Settings = Depends(_settings),
    store: DocumentStore = Depends(get_store),
    rag: RagEngine = Depends(get_rag),
) -> AnswerResponse:
    if not settings.ai_enabled:
        raise HTTPException(503, "AI provider not configured. Set QA_OPENAI_API_KEY.")
    if not store.get(req.doc_id):
        raise HTTPException(404, "Document not found.")

    answer, docs = rag.answer(req.doc_id, req.question)
    sources = [
        Source(
            page=d.metadata.get("page"),
            snippet=d.page_content[:240].strip(),
        )
        for d in docs
    ]
    return AnswerResponse(answer=answer, sources=sources)
