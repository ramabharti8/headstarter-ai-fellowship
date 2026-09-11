from __future__ import annotations

from app.screener import (
    ScreenOutcome,
    _grade_for_score,
    _loads_lenient,
    _outcome_from_data,
    _recommendation_for_score,
    heuristic_screen,
)

JD = """Backend Engineer (Python)
Requirements:
- 3+ years of experience
- Strong Python and FastAPI experience
- PostgreSQL and Redis
- Docker and AWS
"""

STRONG_RESUME = """Jordan Lee — Software Engineer
5 years of experience building backend services in Python.
Built REST APIs with FastAPI, deployed on AWS with Docker.
Used PostgreSQL for storage and Redis for caching.
"""

WEAK_RESUME = """Alex Kim — Graphic Designer
2 years of experience in Adobe Photoshop and Illustrator.
Designed marketing materials and social media graphics.
"""


def test_strong_match_scores_high_and_recommends_hire():
    out = heuristic_screen(STRONG_RESUME, JD)
    assert isinstance(out, ScreenOutcome)
    assert out.score >= 70
    assert out.recommendation == "hire"
    assert "Python" in out.key_skills_matched
    assert "FastAPI" in out.key_skills_matched


def test_weak_match_scores_low_and_recommends_reject():
    out = heuristic_screen(WEAK_RESUME, JD)
    assert out.score < 45
    assert out.recommendation == "reject"
    assert "Python" in out.key_skills_missing


def test_experience_shortfall_lowers_score():
    junior_resume = STRONG_RESUME.replace("5 years", "1 years")
    senior_out = heuristic_screen(STRONG_RESUME, JD)
    junior_out = heuristic_screen(junior_resume, JD)
    assert junior_out.score < senior_out.score


def test_jd_with_no_known_skills_falls_back_to_keywords():
    jd = "Looking for someone passionate about mountains, hiking, and coffee."
    out = heuristic_screen("I love hiking in the mountains every weekend.", jd)
    assert out.key_skills_matched or out.key_skills_missing


def test_grade_thresholds():
    assert _grade_for_score(95) == "A"
    assert _grade_for_score(80) == "B"
    assert _grade_for_score(65) == "C"
    assert _grade_for_score(45) == "D"
    assert _grade_for_score(10) == "F"


def test_recommendation_thresholds():
    assert _recommendation_for_score(90) == "hire"
    assert _recommendation_for_score(50) == "maybe"
    assert _recommendation_for_score(10) == "reject"


def test_parse_outcome_recovers_from_wrapped_json():
    raw = (
        'Here you go:\n```json\n{"score": 82, "grade": "B", "summary": "ok", '
        '"strengths": ["x"], "gaps": [], "recommendation": "hire", '
        '"key_skills_matched": ["Python"], "key_skills_missing": []}\n```'
    )
    out = _outcome_from_data(_loads_lenient(raw))
    assert out.score == 82
    assert out.grade == "B"
    assert out.recommendation == "hire"


def test_parse_outcome_derives_grade_and_recommendation_when_missing():
    raw = '{"score": 92, "summary": "great fit", "strengths": [], "gaps": []}'
    out = _outcome_from_data(_loads_lenient(raw))
    assert out.grade == "A"
    assert out.recommendation == "hire"


def test_parse_outcome_empty_on_garbage():
    out = _outcome_from_data(_loads_lenient("not json at all"))
    assert out.score == 0
    assert out.grade == "F"
    assert out.recommendation == "reject"
