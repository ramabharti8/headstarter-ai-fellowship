"""FastAPI application: turn bullet points into a polished email."""

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
from .drafter import Drafter
from .limits import SlidingWindowLimiter
from .schemas import (
    Draft,
    DraftRequest,
    DraftResponse,
    HealthResponse,
    ReviseRequest,
    ReviseResponse,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
log = logging.getLogger("emaildraft")

_STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.drafter = Drafter(settings)
    log.info(
        "AI Email Drafting Tool v%s ready (provider=%s model=%s)",
        __version__,
        settings.resolved_provider,
        settings.active_chat_model or "-",
    )
    yield


_docs = get_settings().docs_enabled
app = FastAPI(
    title="AI Email Drafting Tool",
    version=__version__,
    description="Turn bullet points into a polished, tone-matched email.",
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
    """Gate for the draft/revise endpoints. A no-op unless EM_API_KEY is configured."""
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


def get_drafter() -> Drafter:
    return app.state.drafter


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
    "/draft",
    response_model=DraftResponse,
    tags=["draft"],
    dependencies=guard,
    responses={
        401: {"description": "Bad key"},
        422: {"description": "Invalid request"},
        429: {"description": "Rate limit"},
        502: {"description": "Upstream model error"},
    },
)
def draft_email(
    req: DraftRequest,
    settings: Settings = Depends(_settings),
    drafter: Drafter = Depends(get_drafter),
) -> DraftResponse:
    if req.variants > settings.max_variants:
        raise HTTPException(
            422, f"variants exceeds the limit of {settings.max_variants}."
        )
    try:
        outcomes, truncated = drafter.draft(req)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - surface provider failures cleanly
        log.exception("draft failed")
        raise HTTPException(502, f"Model provider error: {exc}") from exc

    drafts = [
        Draft(subject=o.subject, body=o.body, full_email=o.full_email) for o in outcomes
    ]
    primary = drafts[0]
    return DraftResponse(
        drafts=drafts,
        tone=req.tone,
        length=req.length,
        provider=drafter.provider,
        model=drafter.model or "-",
        truncated=truncated,
        subject=primary.subject,
        body=primary.body,
        full_email=primary.full_email,
    )


@app.post(
    "/revise",
    response_model=ReviseResponse,
    tags=["draft"],
    dependencies=guard,
    responses={
        401: {"description": "Bad key"},
        422: {"description": "Invalid request"},
        429: {"description": "Rate limit"},
        502: {"description": "Upstream model error"},
    },
)
def revise_email(
    req: ReviseRequest,
    drafter: Drafter = Depends(get_drafter),
) -> ReviseResponse:
    try:
        outcome = drafter.revise(req.full_email, req.feedback, req.tone)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.exception("revise failed")
        raise HTTPException(502, f"Model provider error: {exc}") from exc

    return ReviseResponse(
        subject=outcome.subject,
        body=outcome.body,
        full_email=outcome.full_email,
        provider=drafter.provider,
        model=drafter.model or "-",
    )
