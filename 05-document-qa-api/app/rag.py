"""RAG pipeline: PDF -> chunks -> vector index -> retrieval-augmented answer.

The module is provider-agnostic. With ``QA_FAKE_AI=1`` it uses a deterministic
local embedding + a stub answerer so the whole pipeline runs offline (tests, CI,
interview demos without burning API credits).

The vector store is FAISS, persisted to ``<data_dir>/faiss/<doc_id>``. FAISS was
chosen over Chroma because its native dependency ships prebuilt wheels on every
platform (Chroma's ``hnswlib`` needs a C++ toolchain on Windows); the retrieval
semantics are the same.
"""

from __future__ import annotations

import hashlib
import math
import re
import shutil
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from .config import Settings, get_settings

_ANSWER_PROMPT = (
    "You are a precise assistant. Answer the question using ONLY the context "
    "below. If the answer is not in the context, say you don't know.\n\n"
    "Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"
)

_FAKE_DIM = 128
_TOKEN_RE = re.compile(r"[a-z0-9]+")


class DeterministicEmbeddings(Embeddings):
    """Hashing bag-of-words embedding. No network, stable across runs."""

    def _embed(self, text: str) -> list[float]:
        vec = [0.0] * _FAKE_DIM
        for tok in _TOKEN_RE.findall(text.lower()):
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            vec[h % _FAKE_DIM] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)


@dataclass
class IngestResult:
    pages: int
    chunks: int


class RagEngine:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._index_root = self.settings.data_dir / "faiss"
        self._index_root.mkdir(parents=True, exist_ok=True)
        self._splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.settings.chunk_size,
            chunk_overlap=self.settings.chunk_overlap,
            add_start_index=True,
        )
        # Long-lived, reused across requests. Building these per request added
        # ~200-500ms of client/index setup to every /ask.
        self._embeddings_client: Embeddings | None = None
        self._llm = None
        self._store_cache: OrderedDict[str, FAISS] = OrderedDict()
        self._store_cache_max = 32

    # --- providers -----------------------------------------------------
    def _embeddings(self) -> Embeddings:
        if self._embeddings_client is None:
            if self.settings.fake_ai:
                self._embeddings_client = DeterministicEmbeddings()
            else:
                from langchain_openai import OpenAIEmbeddings

                self._embeddings_client = OpenAIEmbeddings(
                    model=self.settings.embedding_model,
                    api_key=self.settings.openai_api_key,
                )
        return self._embeddings_client

    def _chat(self):
        if self._llm is None:
            from langchain_openai import ChatOpenAI

            self._llm = ChatOpenAI(
                model=self.settings.chat_model,
                api_key=self.settings.openai_api_key,
                temperature=0,
                timeout=30,
            )
        return self._llm

    def _index_path(self, doc_id: str) -> Path:
        return self._index_root / doc_id

    def _load(self, doc_id: str) -> FAISS | None:
        cached = self._store_cache.get(doc_id)
        if cached is not None:
            self._store_cache.move_to_end(doc_id)
            return cached

        path = self._index_path(doc_id)
        if not path.exists():
            return None
        store = FAISS.load_local(
            str(path),
            self._embeddings(),
            allow_dangerous_deserialization=True,
        )
        self._store_cache[doc_id] = store
        if len(self._store_cache) > self._store_cache_max:
            self._store_cache.popitem(last=False)
        return store

    # --- ingestion ---------------------------------------------------
    def ingest_pdf(self, path: Path, doc_id: str) -> IngestResult:
        pages = PyPDFLoader(str(path)).load()
        if not pages or not any(p.page_content.strip() for p in pages):
            raise ValueError("Could not extract any text from this PDF.")
        chunks = self._splitter.split_documents(pages)
        for c in chunks:
            c.metadata["doc_id"] = doc_id
        store = FAISS.from_documents(chunks, self._embeddings())
        store.save_local(str(self._index_path(doc_id)))
        self._store_cache[doc_id] = store  # ready for the first /ask, no reload
        return IngestResult(pages=len(pages), chunks=len(chunks))

    def delete(self, doc_id: str) -> None:
        self._store_cache.pop(doc_id, None)
        shutil.rmtree(self._index_path(doc_id), ignore_errors=True)

    # --- querying --------------------------------------------------
    def answer(self, doc_id: str, question: str) -> tuple[str, list[Document]]:
        store = self._load(doc_id)
        if store is None:
            return "I don't know — this document has no index.", []

        docs = store.similarity_search(question, k=self.settings.retrieval_k)
        if not docs:
            return "I don't know — no relevant content was found in this document.", []

        context = "\n\n---\n\n".join(d.page_content for d in docs)

        if self.settings.fake_ai:
            preview = context[:400].replace("\n", " ")
            return f"[fake-ai] Based on the document: {preview}", docs

        prompt = _ANSWER_PROMPT.format(context=context, question=question)
        return self._chat().invoke(prompt).content, docs
