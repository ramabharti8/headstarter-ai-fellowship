"""FastAPI application: submit text, get sentiment with a probability distribution."""

from __future__ import annotations

import hashlib
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .analyzer import SentimentService
from .config import Settings, get_settings
from .limits import SlidingWindowLimiter
from .metrics import METRICS
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    BatchItem,
    BatchRequest,
    BatchResponse,
    HealthResponse,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
log = logging.getLogger("sentiment")

_STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    service = SentimentService(settings)
    t0 = time.perf_counter()
    service.warmup()
    app.state.service = service
    log.info(
        "Sentiment API v%s ready (backend=%s model=%s device=%s) — warmup %.0f ms",
        __version__,
        service.backend,
        service.model_name,
        service.device,
        (time.perf_counter() - t0) * 1000,
    )
    yield


_docs = get_settings().docs_enabled
app = FastAPI(
    title="Sentiment Analysis API",
    version=__version__,
    description="Real-time sentiment scoring for text and social media.",
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
    """Gate for the analyze endpoints. A no-op unless SENT_API_KEY is configured."""
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
    # Gated deployments (SENT_API_KEY set) trust the caller; skip limiting.
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


def get_service() -> SentimentService:
    return app.state.service


@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health(
    settings: Settings = Depends(_settings),
    service: SentimentService = Depends(get_service),
) -> HealthResponse:
    return HealthResponse(
        version=__version__,
        backend=service.backend,
        model=service.model_name,
        device=service.device,
        labels=service.labels,
        fake_model=settings.is_fake,
        cache_size=settings.cache_size,
        auth_required=settings.auth_required,
        docs_enabled=settings.docs_enabled,
    )


@app.get("/metrics", tags=["meta"], include_in_schema=False)
def metrics(
    settings: Settings = Depends(_settings),
    service: SentimentService = Depends(get_service),
) -> PlainTextResponse:
    if not settings.metrics_enabled:
        raise HTTPException(404, "Metrics are disabled.")
    body = METRICS.render(backend=service.backend, model=service.model_name)
    return PlainTextResponse(body, media_type="text/plain; version=0.0.4")


def _check_text_len(text: str, settings: Settings) -> None:
    if len(text) > settings.max_text_chars:
        raise HTTPException(
            422,
            f"Text exceeds {settings.max_text_chars} characters "
            f"({len(text)}). Split it or raise SENT_MAX_TEXT_CHARS.",
        )


@app.post(
    "/analyze",
    response_model=AnalyzeResponse,
    tags=["analyze"],
    dependencies=guard,
    responses={
        401: {"description": "Bad key"},
        422: {"description": "Invalid request"},
        429: {"description": "Rate limit"},
        502: {"description": "Inference error"},
    },
)
def analyze(
    req: AnalyzeRequest,
    settings: Settings = Depends(_settings),
    service: SentimentService = Depends(get_service),
) -> AnalyzeResponse:
    _check_text_len(req.text, settings)
    start = time.perf_counter()
    try:
        with METRICS.timer():
            outcome, cached = service.analyze(req.text, do_preprocess=req.preprocess)
    except Exception as exc:  # noqa: BLE001 - surface inference failures cleanly
        METRICS.record_request(error=True)
        log.exception("analyze failed")
        raise HTTPException(502, f"Inference error: {exc}") from exc

    METRICS.record_request()
    METRICS.record_texts(1, cache_hits=1 if cached else 0)
    return AnalyzeResponse(
        text=req.text,
        sentiment=outcome.sentiment,
        confidence=outcome.confidence,
        scores=outcome.scores,
        truncated=outcome.truncated,
        cached=cached,
        processing_time_ms=round((time.perf_counter() - start) * 1000, 2),
    )


@app.post(
    "/analyze/batch",
    response_model=BatchResponse,
    tags=["analyze"],
    dependencies=guard,
    responses={
        401: {"description": "Bad key"},
        422: {"description": "Invalid request"},
        429: {"description": "Rate limit"},
        502: {"description": "Inference error"},
    },
)
def analyze_batch(
    req: BatchRequest,
    settings: Settings = Depends(_settings),
    service: SentimentService = Depends(get_service),
) -> BatchResponse:
    if len(req.texts) > settings.max_batch_size:
        raise HTTPException(
            422,
            f"Batch of {len(req.texts)} exceeds the limit of "
            f"{settings.max_batch_size}.",
        )
    if any(not t.strip() for t in req.texts):
        raise HTTPException(422, "Batch contains an empty text.")
    for t in req.texts:
        _check_text_len(t, settings)

    start = time.perf_counter()
    try:
        with METRICS.timer():
            pairs = service.analyze_batch(req.texts, do_preprocess=req.preprocess)
    except Exception as exc:  # noqa: BLE001
        METRICS.record_request(error=True)
        log.exception("batch analyze failed")
        raise HTTPException(502, f"Inference error: {exc}") from exc

    cached_count = sum(1 for _, c in pairs if c)
    METRICS.record_request()
    METRICS.record_texts(len(pairs), cache_hits=cached_count)
    results = [
        BatchItem(
            text=text,
            sentiment=o.sentiment,
            confidence=o.confidence,
            scores=o.scores,
            truncated=o.truncated,
            cached=cached,
        )
        for text, (o, cached) in zip(req.texts, pairs, strict=False)
    ]
    return BatchResponse(
        results=results,
        count=len(results),
        cached_count=cached_count,
        processing_time_ms=round((time.perf_counter() - start) * 1000, 2),
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
def index() -> HTMLResponse:
    return HTMLResponse(_index_html())


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> FileResponse:
    return FileResponse(_STATIC / "assets" / "favicon.svg")
