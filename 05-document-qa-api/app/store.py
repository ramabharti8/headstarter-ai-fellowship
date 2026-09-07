"""SQLite-backed metadata for uploaded documents.

The vector data lives in FAISS indexes on disk; this table is the source of
truth for "which documents exist" and survives process restarts.
"""

from __future__ import annotations

import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from .schemas import DocumentInfo

_SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    doc_id     TEXT PRIMARY KEY,
    filename   TEXT NOT NULL,
    pages      INTEGER NOT NULL,
    chunks     INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
"""


class DocumentStore:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as conn:
            conn.executescript(_SCHEMA)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    @staticmethod
    def new_id() -> str:
        return uuid.uuid4().hex

    def add(self, doc_id: str, filename: str, pages: int, chunks: int) -> DocumentInfo:
        created = datetime.now(UTC)
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO documents VALUES (?, ?, ?, ?, ?)",
                (doc_id, filename, pages, chunks, created.isoformat()),
            )
        return DocumentInfo(
            doc_id=doc_id,
            filename=filename,
            pages=pages,
            chunks=chunks,
            created_at=created,
        )

    def get(self, doc_id: str) -> DocumentInfo | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM documents WHERE doc_id = ?", (doc_id,)
            ).fetchone()
        return self._row_to_info(row) if row else None

    def list(self) -> list[DocumentInfo]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM documents ORDER BY created_at DESC"
            ).fetchall()
        return [self._row_to_info(r) for r in rows]

    def delete(self, doc_id: str) -> bool:
        with self._conn() as conn:
            cur = conn.execute("DELETE FROM documents WHERE doc_id = ?", (doc_id,))
        return cur.rowcount > 0

    @staticmethod
    def _row_to_info(row: sqlite3.Row) -> DocumentInfo:
        return DocumentInfo(
            doc_id=row["doc_id"],
            filename=row["filename"],
            pages=row["pages"],
            chunks=row["chunks"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )
