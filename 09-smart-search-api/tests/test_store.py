from __future__ import annotations

import math

import pytest

from app.store import Store, StoreCompatibilityError


def _unit(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def _store(tmp_path, dim=4, provider="fake", model="fake-hash-4"):
    return Store(
        data_dir=str(tmp_path / "data"),
        collection="docs",
        dim=dim,
        provider=provider,
        model=model,
    )


def test_upsert_and_search_ranks_by_similarity(tmp_path):
    store = _store(tmp_path)
    store.upsert("a", "alpha doc", {}, _unit([1, 0, 0, 0]))
    store.upsert("b", "beta doc", {}, _unit([0, 1, 0, 0]))
    store.upsert("c", "near-alpha doc", {}, _unit([0.9, 0.1, 0, 0]))

    hits = store.search(_unit([1, 0, 0, 0]), top_k=3)
    assert [h["id"] for h in hits] == ["a", "c", "b"]
    assert hits[0]["score"] > hits[1]["score"] > hits[2]["score"]


def test_count_reflects_documents(tmp_path):
    store = _store(tmp_path)
    assert store.count == 0
    store.upsert("a", "doc a", {}, _unit([1, 0, 0, 0]))
    store.upsert("b", "doc b", {}, _unit([0, 1, 0, 0]))
    assert store.count == 2


def test_upsert_same_id_replaces_not_duplicates(tmp_path):
    store = _store(tmp_path)
    store.upsert("a", "version 1", {}, _unit([1, 0, 0, 0]))
    store.upsert("a", "version 2", {}, _unit([0, 1, 0, 0]))
    assert store.count == 1
    assert store.get("a")["document"] == "version 2"


def test_delete_removes_from_index_and_store(tmp_path):
    store = _store(tmp_path)
    store.upsert("a", "doc a", {}, _unit([1, 0, 0, 0]))
    assert store.delete("a") is True
    assert store.count == 0
    assert store.get("a") is None
    # Deleted vector must not resurface in search.
    assert store.search(_unit([1, 0, 0, 0]), top_k=5) == []


def test_delete_missing_id_returns_false(tmp_path):
    store = _store(tmp_path)
    assert store.delete("nope") is False


def test_metadata_filter_applied_post_search(tmp_path):
    store = _store(tmp_path)
    store.upsert("a", "doc a", {"lang": "en"}, _unit([1, 0, 0, 0]))
    store.upsert("b", "doc b", {"lang": "fr"}, _unit([0.99, 0.01, 0, 0]))

    hits = store.search(_unit([1, 0, 0, 0]), top_k=5, metadata_filter={"lang": "fr"})
    assert [h["id"] for h in hits] == ["b"]


def test_list_documents_paginates(tmp_path):
    store = _store(tmp_path)
    for i in range(5):
        store.upsert(f"id{i}", f"doc {i}", {}, _unit([1, i, 0, 0]))
    page1 = store.list_documents(limit=2, offset=0)
    page2 = store.list_documents(limit=2, offset=2)
    assert len(page1) == 2
    assert len(page2) == 2
    assert {d["id"] for d in page1} != {d["id"] for d in page2}


def test_persists_across_reopen(tmp_path):
    store1 = _store(tmp_path)
    store1.upsert("a", "persisted doc", {}, _unit([1, 0, 0, 0]))

    store2 = _store(tmp_path)
    assert store2.count == 1
    hits = store2.search(_unit([1, 0, 0, 0]), top_k=1)
    assert hits[0]["id"] == "a"


def test_provider_mismatch_raises_clear_error(tmp_path):
    _store(tmp_path, dim=4, provider="fake", model="fake-hash-4")
    with pytest.raises(StoreCompatibilityError, match="Delete"):
        _store(tmp_path, dim=8, provider="fastembed", model="BAAI/bge-small-en-v1.5")


def test_clear_empties_index(tmp_path):
    store = _store(tmp_path)
    store.upsert("a", "doc a", {}, _unit([1, 0, 0, 0]))
    store.clear()
    assert store.count == 0
    assert store.search(_unit([1, 0, 0, 0]), top_k=5) == []
