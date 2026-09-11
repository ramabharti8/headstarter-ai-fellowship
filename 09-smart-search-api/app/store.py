"""A persistent, on-disk vector store: FAISS for similarity search + SQLite for
document text/metadata. Deliberately not Chroma's ephemeral in-memory client —
a restart shouldn't lose every indexed document, and this has far fewer
dependencies (Chroma pulls in a kubernetes client, OpenTelemetry, a Pulsar
client...) for what a single-process demo API needs.

FAISS's ``IndexIDMap2`` maps our own int64 ids onto an ``IndexFlatIP`` (inner
product) index — with L2-normalised vectors, inner product IS cosine
similarity, and unlike a plain Flat index, ``IndexIDMap2`` supports real
``remove_ids`` deletion (Chroma's advertised "delete" feature, done properly).
"""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path


class StoreCompatibilityError(RuntimeError):
    """The on-disk index was built with a different embedding provider/dim."""


class Store:
    def __init__(
        self, data_dir: str, collection: str, dim: int, provider: str, model: str
    ) -> None:
        import faiss  # heavy import; keep it out of module load for fake-mode tests

        self._faiss = faiss
        self.dir = Path(data_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.index_path = self.dir / f"{collection}.faiss"
        self.db_path = self.dir / f"{collection}.sqlite3"
        self.dim = dim
        self._lock = threading.Lock()

        self._db = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self._init_db()
        self._check_compat(provider, model)
        self._load_or_create_index()

    # -- setup ---------------------------------------------------------------

    def _init_db(self) -> None:
        self._db.execute(
            """CREATE TABLE IF NOT EXISTS documents (
                int_id INTEGER PRIMARY KEY,
                doc_id TEXT UNIQUE NOT NULL,
                document TEXT NOT NULL,
                metadata TEXT NOT NULL
            )"""
        )
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)"
        )
        self._db.commit()

    def _get_meta(self, key: str) -> str | None:
        row = self._db.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return row[0] if row else None

    def _set_meta(self, key: str, value: str) -> None:
        self._db.execute(
            "INSERT INTO meta(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        self._db.commit()

    def _check_compat(self, provider: str, model: str) -> None:
        stored_provider = self._get_meta("provider")
        if stored_provider is None:
            self._set_meta("provider", provider)
            self._set_meta("model", model)
            self._set_meta("dim", str(self.dim))
            return
        stored_dim = int(self._get_meta("dim") or self.dim)
        if stored_provider != provider or stored_dim != self.dim:
            raise StoreCompatibilityError(
                f"The index at {self.dir} was built with provider={stored_provider} "
                f"dim={stored_dim}, but the active provider is {provider} "
                f"dim={self.dim}. Vectors from different models aren't comparable. "
                f"Delete {self.dir} (or set SS_DATA_DIR to a fresh path) to "
                f"rebuild, or switch SS_PROVIDER back."
            )

    def _load_or_create_index(self) -> None:
        faiss = self._faiss
        if self.index_path.exists():
            self._index = faiss.read_index(str(self.index_path))
        else:
            self._index = faiss.IndexIDMap2(faiss.IndexFlatIP(self.dim))

    def _save_index(self) -> None:
        self._faiss.write_index(self._index, str(self.index_path))

    def _next_id(self) -> int:
        row = self._db.execute(
            "SELECT COALESCE(MAX(int_id), -1) FROM documents"
        ).fetchone()
        return row[0] + 1

    # -- public API ------------------------------------------------------------

    @property
    def count(self) -> int:
        return self._db.execute("SELECT COUNT(*) FROM documents").fetchone()[0]

    def upsert(
        self, doc_id: str, document: str, metadata: dict, vector: list[float]
    ) -> None:
        import numpy as np

        with self._lock:
            row = self._db.execute(
                "SELECT int_id FROM documents WHERE doc_id = ?", (doc_id,)
            ).fetchone()
            if row:
                int_id = row[0]
                self._index.remove_ids(np.array([int_id], dtype="int64"))
            else:
                int_id = self._next_id()

            self._index.add_with_ids(
                np.array([vector], dtype="float32"), np.array([int_id], dtype="int64")
            )
            self._db.execute(
                "INSERT INTO documents(int_id, doc_id, document, metadata) "
                "VALUES (?, ?, ?, ?) "
                "ON CONFLICT(doc_id) DO UPDATE SET "
                "document = excluded.document, metadata = excluded.metadata",
                (int_id, doc_id, document, json.dumps(metadata)),
            )
            self._db.commit()
            self._save_index()

    def delete(self, doc_id: str) -> bool:
        import numpy as np

        with self._lock:
            row = self._db.execute(
                "SELECT int_id FROM documents WHERE doc_id = ?", (doc_id,)
            ).fetchone()
            if not row:
                return False
            self._index.remove_ids(np.array([row[0]], dtype="int64"))
            self._db.execute("DELETE FROM documents WHERE doc_id = ?", (doc_id,))
            self._db.commit()
            self._save_index()
            return True

    def search(
        self, vector: list[float], top_k: int, metadata_filter: dict | None = None
    ) -> list[dict]:
        import numpy as np

        with self._lock:
            n = self._index.ntotal
            if n == 0:
                return []
            # Over-fetch when filtering post-hoc so a filter doesn't starve the
            # result set more than necessary.
            k = min(n, top_k * 4 if metadata_filter else top_k)
            scores, ids = self._index.search(np.array([vector], dtype="float32"), k)

        results = []
        for score, int_id in zip(scores[0], ids[0], strict=False):
            if int_id == -1:
                continue
            row = self._db.execute(
                "SELECT doc_id, document, metadata FROM documents WHERE int_id = ?",
                (int(int_id),),
            ).fetchone()
            if not row:
                continue
            doc_id, document, metadata_json = row
            metadata = json.loads(metadata_json)
            if metadata_filter and not _matches(metadata, metadata_filter):
                continue
            results.append(
                {
                    "id": doc_id,
                    "document": document,
                    "metadata": metadata,
                    "score": float(score),
                }
            )
            if len(results) >= top_k:
                break
        return results

    def get(self, doc_id: str) -> dict | None:
        row = self._db.execute(
            "SELECT document, metadata FROM documents WHERE doc_id = ?", (doc_id,)
        ).fetchone()
        if not row:
            return None
        return {"id": doc_id, "document": row[0], "metadata": json.loads(row[1])}

    def list_documents(self, limit: int, offset: int) -> list[dict]:
        rows = self._db.execute(
            "SELECT doc_id, document, metadata FROM documents "
            "ORDER BY int_id LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return [
            {"id": r[0], "document": r[1], "metadata": json.loads(r[2])} for r in rows
        ]

    def clear(self) -> None:
        with self._lock:
            self._db.execute("DELETE FROM documents")
            self._db.commit()
            self._index = self._faiss.IndexIDMap2(self._faiss.IndexFlatIP(self.dim))
            self._save_index()


def _matches(metadata: dict, filt: dict) -> bool:
    return all(metadata.get(k) == v for k, v in filt.items())
