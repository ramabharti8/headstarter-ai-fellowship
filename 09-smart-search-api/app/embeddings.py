"""Turn text into vectors. Four interchangeable backends behind one interface.

* ``OpenAIEmbedder`` / ``GeminiEmbedder`` — real hosted embedding APIs.
* ``FastEmbedEmbedder`` — a real, local, ONNX embedding model
  (BAAI/bge-small-en-v1.5) that needs no API key and no network after the
  first ~130MB model download. This is the "auto" default, so semantic
  search works out of the box with zero configuration.
* ``FakeEmbedder`` — a deterministic hashed bag-of-words vector, dependency-
  and network-free, so tests and CI never touch a real model. Texts that
  share words score more similar than texts that don't, which is enough to
  exercise ranking logic without needing real semantics.

Every backend returns L2-normalised vectors so a FAISS inner-product index
doubles as cosine similarity.
"""

from __future__ import annotations

import hashlib
import math
import re

from .config import Settings

Vector = list[float]


class Embedder:
    provider: str = "base"
    dim: int = 0
    model: str = ""

    def embed_documents(self, texts: list[str]) -> list[Vector]:
        raise NotImplementedError

    def embed_query(self, text: str) -> Vector:
        return self.embed_documents([text])[0]


def build_embedder(settings: Settings) -> Embedder:
    provider = settings.resolved_provider
    if provider == "openai":
        return OpenAIEmbedder(settings)
    if provider == "gemini":
        return GeminiEmbedder(settings)
    if provider == "fastembed":
        return FastEmbedEmbedder(settings)
    return FakeEmbedder(settings)


def _normalise(vec: list[float]) -> Vector:
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


# --------------------------------------------------------------------------- #
# OpenAI                                                                       #
# --------------------------------------------------------------------------- #


class OpenAIEmbedder(Embedder):
    provider = "openai"

    def __init__(self, settings: Settings) -> None:
        from openai import OpenAI

        self.dim = settings.embedding_dim
        self.model = settings.embedding_model
        self._client = OpenAI(api_key=settings.openai_api_key)

    def embed_documents(self, texts: list[str]) -> list[Vector]:
        resp = self._client.embeddings.create(model=self.model, input=texts)
        return [_normalise(item.embedding) for item in resp.data]


# --------------------------------------------------------------------------- #
# Gemini                                                                       #
# --------------------------------------------------------------------------- #


class GeminiEmbedder(Embedder):
    provider = "gemini"

    def __init__(self, settings: Settings) -> None:
        import google.generativeai as genai

        self.dim = settings.embedding_dim
        self.model = settings.embedding_model
        genai.configure(api_key=settings.gemini_api_key)
        self._genai = genai

    def embed_documents(self, texts: list[str]) -> list[Vector]:
        out = []
        for text in texts:
            resp = self._genai.embed_content(
                model=self.model, content=text, task_type="retrieval_document"
            )
            out.append(_normalise(resp["embedding"]))
        return out

    def embed_query(self, text: str) -> Vector:
        resp = self._genai.embed_content(
            model=self.model, content=text, task_type="retrieval_query"
        )
        return _normalise(resp["embedding"])


# --------------------------------------------------------------------------- #
# fastembed — local ONNX, no API key                                          #
# --------------------------------------------------------------------------- #


class FastEmbedEmbedder(Embedder):
    provider = "fastembed"

    def __init__(self, settings: Settings) -> None:
        from fastembed import TextEmbedding

        self.dim = settings.embedding_dim
        self.model = settings.embedding_model
        self._model = TextEmbedding(model_name=self.model)

    def embed_documents(self, texts: list[str]) -> list[Vector]:
        return [_normalise(v.tolist()) for v in self._model.embed(texts)]


# --------------------------------------------------------------------------- #
# fake — deterministic, offline, dependency-free                              #
# --------------------------------------------------------------------------- #

_WORD_RE = re.compile(r"[a-z0-9]+")


class FakeEmbedder(Embedder):
    provider = "fake"

    def __init__(self, settings: Settings) -> None:
        self.dim = settings.embedding_dim
        self.model = settings.embedding_model

    def embed_documents(self, texts: list[str]) -> list[Vector]:
        return [self._vector(t) for t in texts]

    def _vector(self, text: str) -> Vector:
        vec = [0.0] * self.dim
        for word in _WORD_RE.findall(text.lower()):
            digest = hashlib.md5(word.encode("utf-8")).hexdigest()
            h = int(digest, 16)
            idx = h % self.dim
            sign = 1.0 if (h // self.dim) % 2 == 0 else -1.0
            vec[idx] += sign
        return _normalise(vec) if any(vec) else vec
