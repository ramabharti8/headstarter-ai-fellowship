"""FastAPI application: index documents, then search them semantically."""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import Settings, get_settings
from .embeddings import Embedder, build_embedder
from .limits import SlidingWindowLimiter
from .schemas import (
    DeleteResponse,
    DocumentListResponse,
    DocumentOut,
    HealthResponse,
    IndexRequest,
    IndexResponse,
    SearchRequest,
    SearchResponse,
    SearchResult,
)
from .store import Store, StoreCompatibilityError

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
log = logging.getLogger("smartsearch")

_STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.embedder = build_embedder(settings)
    try:
        app.state.store = Store(
            data_dir=settings.data_dir,
            collection=settings.collection,
            dim=settings.embedding_dim,
            provider=settings.resolved_provider,
            model=settings.embedding_model,
        )
    except StoreCompatibilityError:
        log.exception("index/provider mismatch")
        raise
    log.info(
        "Smart Search API v%s ready (provider=%s model=%s dim=%d, %d documents)",
        __version__,
        settings.resolved_provider,
        settings.embedding_model,
        settings.embedding_dim,
        app.state.store.count,
    )
    yield


_docs = get_settings().docs_enabled
app = FastAPI(
    title="Smart Search API",
    version=__version__,
    description="Index documents and search them by meaning, not just keywords.",
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
    """Gate for write/search endpoints. A no-op unless SS_API_KEY is configured."""
    if not settings.auth_required:
        return
    supplied = x_api_key or ""
    if not supplied and authorization and authorization.lower().startswith("bearer "):
        supplied = authorization[7:]
    if supplied.strip() != settings.api_key:
        raise HTTPException(401, "Missing or invalid API key.")


_rl = SlidingWindowLimiter(get_settings().rate_limit_per_min, 60)


def _client_ip(request: Request, settings: Settings) -> str:
    if settings.trust_forwarded:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(request: Request, settings: Settings = Depends(_settings)) -> None:
    if settings.auth_required or not _rl.enabled:
        return
    ip = _client_ip(request, settings)
    if not _rl.allow(ip):
        raise HTTPException(
            429,
            "Rate limit exceeded — slow down and try again shortly.",
            headers={"Retry-After": str(_rl.retry_after(ip))},
        )


guard = [Depends(require_key), Depends(rate_limit)]


def get_store() -> Store:
    return app.state.store


def get_embedder() -> Embedder:
    return app.state.embedder


@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health(
    settings: Settings = Depends(_settings), store: Store = Depends(get_store)
) -> HealthResponse:
    return HealthResponse(
        version=__version__,
        provider=settings.resolved_provider,
        model=settings.embedding_model,
        dim=settings.embedding_dim,
        total_documents=store.count,
        auth_required=settings.auth_required,
        docs_enabled=settings.docs_enabled,
    )


app.mount("/assets", StaticFiles(directory=_STATIC / "assets"), name="assets")


def _index_html() -> str:
    h = hashlib.md5()
    for name in ("assets/app.js", "assets/styles.css"):
        h.update((_STATIC / name).read_bytes())
    v = h.hexdigest()[:8]
    return (
        (_STATIC / "index.html")
        .read_text(encoding="utf-8")
        .replace("/assets/app.js", f"/assets/app.js?v={v}")
        .replace("/assets/styles.css", f"/assets/styles.css?v={v}")
    )


@app.get("/", include_in_schema=False)
def index_page() -> HTMLResponse:
    return HTMLResponse(_index_html())


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> FileResponse:
    return FileResponse(_STATIC / "assets" / "favicon.svg")


@app.post(
    "/index",
    response_model=IndexResponse,
    tags=["index"],
    dependencies=guard,
    responses={
        401: {"description": "Bad key"},
        422: {"description": "Invalid request"},
        429: {"description": "Rate limit"},
        502: {"description": "Embedding provider error"},
    },
)
def index_documents(
    req: IndexRequest,
    settings: Settings = Depends(_settings),
    store: Store = Depends(get_store),
    embedder: Embedder = Depends(get_embedder),
) -> IndexResponse:
    if len(req.documents) > settings.max_batch_size:
        raise HTTPException(
            422,
            f"Batch of {len(req.documents)} exceeds the limit of "
            f"{settings.max_batch_size}.",
        )
    if store.count + len(req.documents) > settings.max_documents:
        raise HTTPException(
            422, f"Index is capped at {settings.max_documents} documents."
        )

    ids = req.ids or [str(uuid.uuid4()) for _ in req.documents]
    metadatas = req.metadata or [{} for _ in req.documents]

    truncated_count = 0
    texts: list[str] = []
    for doc in req.documents:
        doc = doc.strip()
        if len(doc) > settings.max_doc_chars:
            doc = doc[: settings.max_doc_chars]
            truncated_count += 1
        texts.append(doc)

    try:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), settings.embed_batch_size):
            chunk = texts[start : start + settings.embed_batch_size]
            vectors.extend(embedder.embed_documents(chunk))
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - surface provider failures cleanly
        log.exception("embedding failed")
        raise HTTPException(502, f"Embedding provider error: {exc}") from exc

    for doc_id, text, metadata, vector in zip(
        ids, texts, metadatas, vectors, strict=True
    ):
        store.upsert(doc_id, text, metadata, vector)

    return IndexResponse(indexed=len(ids), ids=ids, truncated_count=truncated_count)


@app.post(
    "/search",
    response_model=SearchResponse,
    tags=["search"],
    dependencies=guard,
    responses={
        401: {"description": "Bad key"},
        429: {"description": "Rate limit"},
        502: {"description": "Embedding provider error"},
    },
)
def search(
    req: SearchRequest,
    settings: Settings = Depends(_settings),
    store: Store = Depends(get_store),
    embedder: Embedder = Depends(get_embedder),
) -> SearchResponse:
    start = time.perf_counter()
    top_k = min(req.top_k or settings.default_top_k, settings.max_top_k)

    try:
        vector = embedder.embed_query(req.query)
    except Exception as exc:  # noqa: BLE001
        log.exception("query embedding failed")
        raise HTTPException(502, f"Embedding provider error: {exc}") from exc

    hits = store.search(vector, top_k, metadata_filter=req.metadata_filter)
    return SearchResponse(
        query=req.query,
        results=[SearchResult(**h) for h in hits],
        total_documents=store.count,
        processing_time_ms=round((time.perf_counter() - start) * 1000, 2),
    )


@app.get(
    "/documents",
    response_model=DocumentListResponse,
    tags=["index"],
    dependencies=[Depends(require_key)],
)
def list_documents(
    limit: int = 50,
    offset: int = 0,
    store: Store = Depends(get_store),
) -> DocumentListResponse:
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    docs = store.list_documents(limit, offset)
    return DocumentListResponse(
        documents=[DocumentOut(**d) for d in docs],
        total_documents=store.count,
        limit=limit,
        offset=offset,
    )


@app.get(
    "/documents/{doc_id}",
    response_model=DocumentOut,
    tags=["index"],
    dependencies=[Depends(require_key)],
)
def get_document(doc_id: str, store: Store = Depends(get_store)) -> DocumentOut:
    doc = store.get(doc_id)
    if doc is None:
        raise HTTPException(404, f"No document with id '{doc_id}'.")
    return DocumentOut(**doc)


@app.delete(
    "/index/{doc_id}",
    response_model=DeleteResponse,
    tags=["index"],
    dependencies=guard,
)
def delete_document(doc_id: str, store: Store = Depends(get_store)) -> DeleteResponse:
    found = store.delete(doc_id)
    return DeleteResponse(deleted=doc_id, found=found)
