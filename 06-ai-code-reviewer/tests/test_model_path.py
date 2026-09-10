"""Unit tests for the provider path with a stubbed OpenAI client — no network."""

from __future__ import annotations

import httpx
import pytest
from openai import BadRequestError

from app.config import Settings
from app.reviewer import Reviewer
from app.schemas import ReviewRequest


def _bad_request(msg: str) -> BadRequestError:
    req = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    resp = httpx.Response(400, request=req)
    return BadRequestError(msg, response=resp, body=None)


class _Msg:
    def __init__(self, content: str) -> None:
        self.content = content


class _Choice:
    def __init__(self, content: str, finish: str = "stop") -> None:
        self.message = _Msg(content)
        self.finish_reason = finish


class _Resp:
    def __init__(self, content: str, finish: str = "stop") -> None:
        self.choices = [_Choice(content, finish)]


class _Completions:
    def __init__(self, script: list) -> None:
        self._script = list(script)
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        item = self._script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


class _Client:
    def __init__(self, script: list) -> None:
        self.chat = type("_Chat", (), {"completions": _Completions(script)})()


def _reviewer(script: list) -> Reviewer:
    r = Reviewer.__new__(Reviewer)
    r.settings = Settings(_env_file=None, provider="groq", groq_api_key="x")
    r.provider = "groq"
    r.model = "openai/gpt-oss-20b"
    r._client = _Client(script)
    return r


GOOD_JSON = (
    '{"summary": "ok", "language": "python", "verdict": "approve", "score": 8, '
    '"issues": [], "improvements": [], "refactored_code": ""}'
)


def test_happy_path_uses_json_mode():
    r = _reviewer([_Resp(GOOD_JSON)])
    out = r.review(ReviewRequest(code="x = 1", language="python"))
    assert out.summary == "ok"
    assert out.score == 8.0
    assert r._client.chat.completions.calls[0]["response_format"] == {
        "type": "json_object"
    }


def test_retries_without_json_mode_on_json_validate_failure():
    r = _reviewer([_bad_request("Failed to validate JSON"), _Resp(GOOD_JSON)])
    out = r.review(ReviewRequest(code="x = 1", language="python"))
    assert out.summary == "ok"
    calls = r._client.chat.completions.calls
    assert len(calls) == 2
    assert "response_format" in calls[0]
    assert "response_format" not in calls[1]


def test_unparseable_after_retry_raises_clear_error():
    r = _reviewer([_bad_request("Failed to validate JSON"), _Resp("still not json")])
    with pytest.raises(ValueError, match="usable JSON"):
        r.review(ReviewRequest(code="x = 1", language="python"))


def test_non_json_bad_request_is_not_swallowed():
    r = _reviewer([_bad_request("model `foo` does not exist")])
    with pytest.raises(BadRequestError):
        r.review(ReviewRequest(code="x = 1", language="python"))
