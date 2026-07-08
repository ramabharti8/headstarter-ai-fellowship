"""API-key authentication and rate limiting.

Set the `API_KEY` env var to require an `X-API-Key` header on protected routes.
If unset (local dev), auth is disabled so the app runs out of the box.
"""
from __future__ import annotations

import os

from fastapi import Header, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

API_KEY = os.environ.get("API_KEY")               # unset -> auth disabled (dev)
RATE_LIMIT = os.environ.get("RATE_LIMIT", "30/minute")


def rate_limit_key(request: Request) -> str:
    return request.headers.get("x-api-key") or get_remote_address(request)


limiter = Limiter(key_func=rate_limit_key, default_limits=[])


async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if API_KEY is None:
        return
    if not x_api_key or x_api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )


def auth_enabled() -> bool:
    return API_KEY is not None
