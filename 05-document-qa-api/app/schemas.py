"""Request/response models for the public API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    provider: str
    ai_enabled: bool
    fake_ai: bool
    auth_required: bool = False
    docs_enabled: bool = True


class UploadResponse(BaseModel):
    doc_id: str
    filename: str
    pages: int
    chunks: int
    created_at: datetime


class DocumentInfo(BaseModel):
    doc_id: str
    filename: str
    pages: int
    chunks: int
    created_at: datetime


class DocumentList(BaseModel):
    documents: list[DocumentInfo]


class QuestionRequest(BaseModel):
    doc_id: str = Field(..., description="ID returned by /upload")
    question: str = Field(..., min_length=3, max_length=2000)


class SummarizeRequest(BaseModel):
    doc_id: str
    focus: str | None = Field(default=None, max_length=500)


class SummaryResponse(BaseModel):
    summary: str
    chunks_used: int


class Source(BaseModel):
    page: int | None
    snippet: str


class AnswerResponse(BaseModel):
    answer: str
    sources: list[Source]


class ErrorResponse(BaseModel):
    detail: str
