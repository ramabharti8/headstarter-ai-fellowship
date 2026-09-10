"""FastAPI application: submit code or a diff, get a structured review."""

from __future__ import annotations

import hashlib
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import Settings, get_settings
from .limits import SlidingWindowLimiter
from .reviewer import Reviewer
from .schemas import HealthResponse, ReviewRequest, ReviewResponse

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
log = logging.getLogger("coderev")

_STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.reviewer = Reviewer(settings)
    log.info(
        "AI Code Reviewer v%s ready (provider=%s model=%s)",
        __version__,
        settings.resolved_provider,
        settings.active_chat_model or "-",
    )
    yield


_docs = get_settings().docs_enabled
app = FastAPI(
    title="AI Code Reviewer",
    version=__version__,
    description="Submit a code snippet or a unified diff, get a structured review.",
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
    """Gate for /review. A no-op unless CR_API_KEY is configured."""
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
    # Gated deployments (CR_API_KEY set) trust the caller; skip limiting.
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


def get_reviewer() -> Reviewer:
    return app.state.reviewer


@app.get("/health", response_model=HealthResponse, tags=["meta"])
def health(settings: Settings = Depends(_settings)) -> HealthResponse:
    return HealthResponse(
        version=__version__,
        provider=settings.resolved_provider,
        model=settings.active_chat_model or "-",
        fake_ai=settings.is_fake,
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
def index() -> HTMLResponse:
    return HTMLResponse(_index_html())


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> FileResponse:
    return FileResponse(_STATIC / "assets" / "favicon.svg")


@app.post(
    "/review",
    response_model=ReviewResponse,
    tags=["review"],
    dependencies=guard,
    responses={
        400: {"description": "Invalid request"},
        401: {"description": "Bad key"},
        429: {"description": "Rate limit"},
        502: {"description": "Upstream model error"},
    },
)
def review_code(
    req: ReviewRequest,
    settings: Settings = Depends(_settings),
    reviewer: Reviewer = Depends(get_reviewer),
) -> ReviewResponse:
    try:
        outcome = reviewer.review(req)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - surface provider failures cleanly
        log.exception("review failed")
        raise HTTPException(502, f"Model provider error: {exc}") from exc

    return ReviewResponse(
        summary=outcome.summary,
        verdict=outcome.verdict,
        score=outcome.score,
        issues=outcome.issues,
        improvements=outcome.improvements,
        refactored_code=outcome.refactored_code,
        language=outcome.language,
        provider=reviewer.provider,
        model=reviewer.model or "-",
        truncated=outcome.truncated,
    )
