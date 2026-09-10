"""Request/response models for the public API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

Severity = Literal["critical", "high", "medium", "low", "info"]
Category = Literal[
    "bug",
    "security",
    "performance",
    "style",
    "maintainability",
    "correctness",
    "documentation",
]
Verdict = Literal["approve", "comment", "request_changes"]


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    provider: str
    model: str
    fake_ai: bool
    auth_required: bool = False
    docs_enabled: bool = True


class ReviewRequest(BaseModel):
    """Submit either a `code` snippet or a unified `diff` (not both empty)."""

    code: str = Field(default="", description="Source code to review.")
    diff: str = Field(
        default="",
        description="Unified diff to review instead of a whole snippet.",
    )
    language: str = Field(
        default="auto",
        description="Language hint, e.g. 'python'. 'auto' asks the model to detect.",
        max_length=40,
    )
    context: str = Field(
        default="",
        max_length=2000,
        description="What the code is for — helps the reviewer judge intent.",
    )
    focus: list[str] = Field(
        default_factory=list,
        description="Optional lenses to emphasise, e.g. ['security', 'performance'].",
    )

    @model_validator(mode="after")
    def _needs_input(self) -> ReviewRequest:
        if not self.code.strip() and not self.diff.strip():
            raise ValueError("Provide 'code' or 'diff'.")
        return self


class Issue(BaseModel):
    severity: Severity
    category: Category
    line: int | None = Field(default=None, description="1-based line, if identifiable.")
    title: str
    detail: str
    suggestion: str = ""


class ReviewResponse(BaseModel):
    summary: str
    verdict: Verdict
    score: float = Field(ge=0, le=10, description="Overall quality, 0–10.")
    issues: list[Issue]
    improvements: list[str]
    refactored_code: str = ""
    language: str
    provider: str
    model: str
    truncated: bool = False


class ErrorResponse(BaseModel):
    detail: str
