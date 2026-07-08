"""API-key authentication and rate limiting for the churn API.

Auth model:
    - Set the `API_KEY` environment variable to enable enforcement.
    - Clients then pass it in the `X-API-Key` header.
    - If `API_KEY` is unset (local dev), auth is disabled and a warning is logged,
      so `make api` still works out of the box.

Rate limiting uses slowapi, keyed by API key when present, else client IP.
"""
from __future__ import annotations

import logging
import os

from fastapi import Header, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger("churn.security")

API_KEY = os.environ.get("API_KEY")  # unset -> auth disabled (dev)
RATE_LIMIT = os.environ.get("RATE_LIMIT", "60/minute")


def rate_limit_key(request: Request) -> str:
    """Rate-limit per API key if provided, otherwise per client IP."""
    return request.headers.get("x-api-key") or get_remote_address(request)


limiter = Limiter(key_func=rate_limit_key, default_limits=[])


async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """FastAPI dependency enforcing the X-API-Key header when API_KEY is set."""
    if API_KEY is None:
        return  # dev mode: auth disabled
    if not x_api_key or x_api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )


def auth_enabled() -> bool:
    return API_KEY is not None
