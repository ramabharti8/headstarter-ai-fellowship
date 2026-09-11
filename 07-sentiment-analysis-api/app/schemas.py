"""Request / response models for the public API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Sentiment = Literal["negative", "neutral", "positive"]


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    backend: str
    model: str
    device: str
    labels: list[str]
    fake_model: bool
    cache_size: int
    auth_required: bool = False
    docs_enabled: bool = True


class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, description="Text to score.")
    preprocess: bool = Field(
        default=True,
        description="Normalise @mentions and links before scoring (recommended "
        "for social-media text).",
    )


class BatchRequest(BaseModel):
    texts: list[str] = Field(min_length=1, description="Texts to score.")
    preprocess: bool = True


class Scores(BaseModel):
    negative: float
    neutral: float
    positive: float


class AnalyzeResponse(BaseModel):
    text: str
    sentiment: Sentiment
    confidence: float = Field(ge=0, le=1)
    scores: dict[str, float] = Field(
        description="Full probability distribution over the labels."
    )
    truncated: bool = False
    cached: bool = False
    processing_time_ms: float


class BatchItem(BaseModel):
    text: str
    sentiment: Sentiment
    confidence: float = Field(ge=0, le=1)
    scores: dict[str, float]
    truncated: bool = False
    cached: bool = False


class BatchResponse(BaseModel):
    results: list[BatchItem]
    count: int
    cached_count: int
    processing_time_ms: float


class ErrorResponse(BaseModel):
    detail: str
