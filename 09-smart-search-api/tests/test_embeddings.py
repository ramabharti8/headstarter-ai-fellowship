from __future__ import annotations

import math

from app.config import Settings
from app.embeddings import FakeEmbedder


def _settings(**kw) -> Settings:
    return Settings(_env_file=None, fake_embed=True, **kw)


def _cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))


def test_vectors_are_unit_normalised():
    emb = FakeEmbedder(_settings())
    vec = emb.embed_query("python fastapi backend framework")
    norm = math.sqrt(sum(x * x for x in vec))
    assert math.isclose(norm, 1.0, abs_tol=1e-6)


def test_deterministic():
    emb = FakeEmbedder(_settings())
    a = emb.embed_query("hello world")
    b = emb.embed_query("hello world")
    assert a == b


def test_shared_words_score_more_similar_than_unrelated():
    emb = FakeEmbedder(_settings())
    query = emb.embed_query("python backend web framework")
    close = emb.embed_query("python web framework for backend apis")
    far = emb.embed_query("golden retriever puppies playing in a park")

    sim_close = _cosine(query, close)
    sim_far = _cosine(query, far)
    assert sim_close > sim_far


def test_embed_documents_matches_embed_query_elementwise():
    emb = FakeEmbedder(_settings())
    docs = ["alpha beta", "gamma delta"]
    batch = emb.embed_documents(docs)
    singles = [emb.embed_query(d) for d in docs]
    assert batch == singles


def test_dim_matches_settings():
    emb = FakeEmbedder(_settings())
    assert len(emb.embed_query("x")) == 64
