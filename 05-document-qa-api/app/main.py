"""FastAPI application: upload PDFs, ask natural-language questions."""

from __future__ import annotations

import logging
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import (
    Depends,
    FastAPI,
    File,
    Header,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import Settings, get_settings
from .limits import SlidingWindowLimiter
from .rag import RagEngine
from .schemas import (
    AnswerResponse,
    DocumentInfo,
    DocumentList,
    HealthResponse,
    QuestionRequest,
    Source,
    SummarizeRequest,
    SummaryResponse,
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
        "Document Q&A API v%s ready (provider=%s model=%s)",
        __version__,
        settings.resolved_provider,
        settings.active_chat_model or "-",
    )
    yield


_docs = get_settings().docs_enabled
app = FastAPI(
    title="Document Q&A API",
    version=__version__,
    description="Upload a PDF, ask questions, get answers with page-level sources.",
    lifespan=lifespan,
    docs_url="/docs" if _docs else None,
    redoc_url="/redoc" if _docs else None,
    openapi_url="/openapi.json" if _docs else None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _no_cache_ui(request: Request, call_next):
    """Force browsers to revalidate the UI so a stale app.js can't linger."""
    response = await call_next(request)
    path = request.url.path
    if path == "/" or path.startswith("/assets"):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response


def _settings() -> Settings:
    return get_settings()


def require_key(
    settings: Settings = Depends(_settings),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
) -> None:
    """Gate for everything except /health and the static UI. A no-op unless
    QA_API_KEY is configured."""
    if not settings.auth_required:
        return
    supplied = x_api_key or ""
    if not supplied and authorization and authorization.lower().startswith("bearer "):
        supplied = authorization[7:]
    if supplied.strip() != settings.api_key:
        raise HTTPException(401, "Missing or invalid API key.")


_rl = SlidingWindowLimiter(get_settings().rate_limit_per_min, 60)
_upload_rl = SlidingWindowLimiter(get_settings().uploads_per_day_per_ip, 86_400)


def _client_ip(request: Request, settings: Settings) -> str:
    if settings.trust_forwarded:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(request: Request, settings: Settings = Depends(_settings)) -> None:
    # Gated deployments (QA_API_KEY set) trust the caller; skip limiting.
    if settings.auth_required or not _rl.enabled:
        return
    ip = _client_ip(request, settings)
    if not _rl.allow(ip):
        raise HTTPException(
            429,
            "Rate limit exceeded — slow down and try again shortly.",
            headers={"Retry-After": str(_rl.retry_after(ip))},
        )


def upload_quota(request: Request, settings: Settings = Depends(_settings)) -> None:
    if settings.auth_required or not _upload_rl.enabled:
        return
    ip = _client_ip(request, settings)
    if not _upload_rl.allow(ip):
        raise HTTPException(
            429,
            f"Daily upload limit reached ({settings.uploads_per_day_per_ip} per day).",
        )


guard = [Depends(require_key), Depends(rate_limit)]


def get_store() -> DocumentStore:
    return app.state.store


def get_rag() -> RagEngine:
    return app.state.rag


@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health(settings: Settings = Depends(_settings)) -> HealthResponse:
    return HealthResponse(
        version=__version__,
        provider=settings.resolved_provider,
        ai_enabled=settings.ai_enabled,
        fake_ai=settings.is_fake,
        auth_required=settings.auth_required,
    )


app.mount("/assets", StaticFiles(directory=_STATIC / "assets"), name="assets")


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(_STATIC / "index.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> FileResponse:
    return FileResponse(_STATIC / "assets" / "favicon.svg")


@app.post(
    "/upload",
    response_model=UploadResponse,
    tags=["documents"],
    dependencies=[*guard, Depends(upload_quota)],
    responses={
        400: {"description": "Invalid file"},
        401: {"description": "Bad key"},
        429: {"description": "Rate / quota limit"},
    },
)
async def upload_document(
    file: UploadFile = File(...),
    settings: Settings = Depends(_settings),
    store: DocumentStore = Depends(get_store),
    rag: RagEngine = Depends(get_rag),
) -> UploadResponse:
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
    _prune_documents(settings, store, rag)
    return UploadResponse(**info.model_dump())


def _prune_documents(settings: Settings, store: DocumentStore, rag: RagEngine) -> None:
    """Keep only the newest `max_documents` so a public demo can't fill the disk."""
    if settings.max_documents <= 0:
        return
    for stale in store.list()[settings.max_documents :]:  # list() is newest-first
        store.delete(stale.doc_id)
        rag.delete(stale.doc_id)
        log.info("pruned old document %s", stale.doc_id)


@app.get(
    "/documents", response_model=DocumentList, tags=["documents"], dependencies=guard
)
def list_documents(store: DocumentStore = Depends(get_store)) -> DocumentList:
    return DocumentList(documents=store.list())


@app.get(
    "/documents/{doc_id}",
    response_model=DocumentInfo,
    tags=["documents"],
    dependencies=guard,
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
    dependencies=guard,
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
    dependencies=guard,
    responses={
        401: {"description": "Bad key"},
        404: {"description": "Document not found"},
        502: {"description": "Upstream model error"},
    },
)
def ask_question(
    req: QuestionRequest,
    settings: Settings = Depends(_settings),
    store: DocumentStore = Depends(get_store),
    rag: RagEngine = Depends(get_rag),
) -> AnswerResponse:
    if not store.get(req.doc_id):
        raise HTTPException(404, "Document not found.")

    try:
        answer, docs = rag.answer(req.doc_id, req.question)
    except Exception as exc:  # noqa: BLE001 - surface provider failures cleanly
        log.exception("answer failed")
        raise HTTPException(502, f"Model provider error: {exc}") from exc
    sources = [
        Source(
            page=d.metadata.get("page"),
            snippet=_excerpt(d.page_content, settings.snippet_chars),
        )
        for d in docs
    ]
    return AnswerResponse(answer=answer, sources=sources)


@app.post(
    "/summarize",
    response_model=SummaryResponse,
    tags=["qa"],
    dependencies=guard,
    responses={
        401: {"description": "Bad key"},
        404: {"description": "Document not found"},
        502: {"description": "Upstream model error"},
    },
)
def summarize_document(
    req: SummarizeRequest,
    store: DocumentStore = Depends(get_store),
    rag: RagEngine = Depends(get_rag),
) -> SummaryResponse:
    """Summarise the document as a whole. Reads a broad sample of chunks across
    the whole PDF (capped by QA_SUMMARY_MAX_CHUNKS) rather than just the few a
    single question retrieves. Slower than /ask and uses more tokens."""
    if not store.get(req.doc_id):
        raise HTTPException(404, "Document not found.")
    try:
        summary, used = rag.summarize(req.doc_id, req.focus)
    except Exception as exc:  # noqa: BLE001
        log.exception("summarize failed")
        raise HTTPException(502, f"Model provider error: {exc}") from exc
    return SummaryResponse(summary=summary, chunks_used=used)


def _excerpt(text: str, limit: int) -> str:
    """Collapse whitespace and clip to `limit` chars on a word boundary."""
    clean = " ".join(text.split())
    if len(clean) <= limit:
        return clean
    cut = clean[:limit].rsplit(" ", 1)[0]
    return f"{cut}…"
