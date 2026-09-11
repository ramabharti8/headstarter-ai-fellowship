"""Request/response models for the public API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

Tone = Literal[
    "professional", "friendly", "assertive", "empathetic", "persuasive", "apologetic"
]
Length = Literal["short", "medium", "long"]


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    provider: str
    model: str
    fake_ai: bool
    auth_required: bool = False
    docs_enabled: bool = True


class DraftRequest(BaseModel):
    bullet_points: list[str] = Field(min_length=1, description="Key points to cover.")
    recipient: str = Field(default="", max_length=200)
    sender: str = Field(default="", max_length=200)
    tone: Tone = "professional"
    length: Length = "medium"
    context: str = Field(
        default="",
        max_length=2000,
        description="Extra background the model should factor in.",
    )
    variants: int = Field(
        default=1, ge=1, le=3, description="How many alternative drafts to generate."
    )

    @model_validator(mode="after")
    def _bullets_not_blank(self) -> DraftRequest:
        if all(not b.strip() for b in self.bullet_points):
            raise ValueError("bullet_points cannot all be empty.")
        return self


class Draft(BaseModel):
    subject: str
    body: str
    full_email: str


class DraftResponse(BaseModel):
    drafts: list[Draft]
    tone: Tone
    length: Length
    provider: str
    model: str
    truncated: bool = False
    # Mirrors drafts[0] for callers that only want a single draft (the common
    # case, and what the original single-draft API shape looked like).
    subject: str
    body: str
    full_email: str


class ReviseRequest(BaseModel):
    full_email: str = Field(min_length=1, max_length=6000)
    feedback: str = Field(min_length=1, max_length=1000)
    tone: Tone | None = Field(
        default=None, description="Optionally shift tone while revising."
    )


class ReviseResponse(BaseModel):
    subject: str
    body: str
    full_email: str
    provider: str
    model: str


class ErrorResponse(BaseModel):
    detail: str
