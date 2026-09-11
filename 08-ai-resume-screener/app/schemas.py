"""Request/response models for the public API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Grade = Literal["A", "B", "C", "D", "F"]
Recommendation = Literal["hire", "maybe", "reject"]


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    provider: str
    model: str
    fake_ai: bool
    auth_required: bool = False
    docs_enabled: bool = True


class ScreenResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    grade: Grade
    summary: str
    strengths: list[str]
    gaps: list[str]
    recommendation: Recommendation
    key_skills_matched: list[str]
    key_skills_missing: list[str]
    provider: str
    model: str
    resume_truncated: bool = False
    jd_truncated: bool = False


class ErrorResponse(BaseModel):
    detail: str
