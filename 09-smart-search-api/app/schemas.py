"""Request/response models for the public API."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    provider: str
    model: str
    dim: int
    total_documents: int
    auth_required: bool = False
    docs_enabled: bool = True


class IndexRequest(BaseModel):
    documents: list[str] = Field(min_length=1, description="Texts to index.")
    ids: list[str] | None = Field(
        default=None, description="Stable ids; omit to auto-generate (uuid4)."
    )
    metadata: list[dict] | None = Field(
        default=None, description="One metadata object per document."
    )

    @model_validator(mode="after")
    def _lengths_match(self) -> IndexRequest:
        n = len(self.documents)
        if self.ids is not None and len(self.ids) != n:
            raise ValueError("ids must have the same length as documents.")
        if self.metadata is not None and len(self.metadata) != n:
            raise ValueError("metadata must have the same length as documents.")
        if any(not d.strip() for d in self.documents):
            raise ValueError("documents cannot contain an empty string.")
        return self


class IndexResponse(BaseModel):
    indexed: int
    ids: list[str]
    truncated_count: int = 0


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int | None = None
    metadata_filter: dict | None = Field(
        default=None, description="Exact-match filter, applied after retrieval."
    )


class SearchResult(BaseModel):
    id: str
    document: str
    score: float
    metadata: dict


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    total_documents: int
    processing_time_ms: float


class DocumentOut(BaseModel):
    id: str
    document: str
    metadata: dict


class DocumentListResponse(BaseModel):
    documents: list[DocumentOut]
    total_documents: int
    limit: int
    offset: int


class DeleteResponse(BaseModel):
    deleted: str
    found: bool


class ErrorResponse(BaseModel):
    detail: str
