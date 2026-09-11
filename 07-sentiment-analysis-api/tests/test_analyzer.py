from __future__ import annotations

import math

import pytest

from app.analyzer import (
    LABELS,
    FakeAnalyzer,
    SentimentService,
    preprocess,
)
from app.config import Settings


def _settings(**kw) -> Settings:
    return Settings(_env_file=None, fake_model=True, **kw)


def test_preprocess_normalises_mentions_and_links():
    src = "thanks @acme_support see https://acme.co/help and www.x.com now"
    assert preprocess(src) == "thanks @user see http and http now"


def test_preprocess_leaves_plain_text_alone():
    assert preprocess("just a normal sentence") == "just a normal sentence"


@pytest.mark.parametrize(
    "text,expected",
    [
        ("I absolutely love this, it's amazing and wonderful", "positive"),
        ("This is terrible, worst experience, awful support", "negative"),
        ("The meeting is scheduled for noon on Tuesday", "neutral"),
    ],
)
def test_fake_analyzer_directionally_correct(text, expected):
    out = FakeAnalyzer().analyze(text)
    assert out.sentiment == expected
    assert out.scores.keys() == set(LABELS)
    assert math.isclose(sum(out.scores.values()), 1.0, abs_tol=1e-3)
    assert 0.0 <= out.confidence <= 1.0


def test_fake_analyzer_handles_negation():
    assert FakeAnalyzer().analyze("this is not good at all").sentiment == "negative"


def test_fake_analyzer_is_deterministic():
    a = FakeAnalyzer().analyze("mixed bag, some good some bad")
    b = FakeAnalyzer().analyze("mixed bag, some good some bad")
    assert a == b


def test_fake_analyzer_truncation_flag():
    short = FakeAnalyzer(max_length=5).analyze("one two three")
    long = FakeAnalyzer(max_length=5).analyze("one two three four five six seven")
    assert short.truncated is False
    assert long.truncated is True


def test_batch_matches_singles():
    fa = FakeAnalyzer()
    texts = ["great job", "awful mess", "it is fine"]
    batch = fa.analyze_batch(texts)
    singles = [fa.analyze(t) for t in texts]
    assert batch == singles


def test_service_cache_hits_on_repeat():
    svc = SentimentService(_settings(cache_size=16))
    _, cached1 = svc.analyze("hello world")
    _, cached2 = svc.analyze("hello world")
    assert cached1 is False
    assert cached2 is True
    assert svc.cache_len == 1


def test_service_cache_disabled_when_zero():
    svc = SentimentService(_settings(cache_size=0))
    svc.analyze("hello world")
    _, cached = svc.analyze("hello world")
    assert cached is False
    assert svc.cache_len == 0


def test_service_cache_evicts_lru():
    svc = SentimentService(_settings(cache_size=2))
    svc.analyze("a")
    svc.analyze("b")
    svc.analyze("c")
    assert svc.cache_len == 2


def test_service_batch_mixes_cached_and_fresh():
    svc = SentimentService(_settings(cache_size=16))
    svc.analyze("already seen")
    pairs = svc.analyze_batch(["already seen", "brand new"])
    assert pairs[0][1] is True
    assert pairs[1][1] is False


def test_preprocess_toggle_changes_cache_key():
    svc = SentimentService(_settings(cache_size=16))
    svc.analyze("hi @bob", do_preprocess=True)
    _, cached = svc.analyze("hi @bob", do_preprocess=False)
    assert cached is False
