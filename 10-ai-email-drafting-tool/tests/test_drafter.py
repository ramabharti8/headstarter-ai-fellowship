from __future__ import annotations

from app.drafter import (
    DraftOutcome,
    _derive_subject,
    _parse_email,
    heuristic_draft,
    heuristic_revise,
)

BULLETS = [
    "Meeting rescheduled to Thursday 3pm",
    "New agenda includes budget review",
    "Please confirm attendance",
]


def test_heuristic_draft_covers_all_bullets():
    out = heuristic_draft(BULLETS, "Team", "Rama", "professional", "medium", "")
    assert isinstance(out, DraftOutcome)
    for b in BULLETS:
        assert b in out.body
    assert out.subject.startswith("Update:")
    assert out.full_email.startswith("Subject:")
    assert "Rama" in out.full_email


def test_heuristic_draft_uses_recipient_greeting():
    out = heuristic_draft(BULLETS, "Alex", "", "friendly", "medium", "")
    assert "Alex" in out.body.splitlines()[0]


def test_heuristic_draft_short_is_shorter_than_long():
    short = heuristic_draft(BULLETS, "Team", "Rama", "professional", "short", "")
    long = heuristic_draft(BULLETS, "Team", "Rama", "professional", "long", "")
    assert len(short.body) < len(long.body)


def test_heuristic_draft_variants_differ():
    v0 = heuristic_draft(BULLETS, "Team", "Rama", "professional", "medium", "", 0)
    v1 = heuristic_draft(BULLETS, "Team", "Rama", "professional", "medium", "", 1)
    assert v0.full_email != v1.full_email


def test_heuristic_draft_includes_context():
    out = heuristic_draft(
        BULLETS, "Team", "Rama", "professional", "medium", "Budget cap is $10k"
    )
    assert "Budget cap is $10k" in out.body


def test_tone_changes_signoff():
    professional = heuristic_draft(BULLETS, "Team", "Rama", "professional", "medium", "")
    friendly = heuristic_draft(BULLETS, "Team", "Rama", "friendly", "medium", "")
    assert "Best regards," in professional.full_email
    assert "Cheers," in friendly.full_email


def test_parse_email_extracts_subject_and_body():
    raw = "Subject: Team Sync\n\nHi all,\n\nSee you Thursday.\n\nBest,\nRama"
    out = _parse_email(raw, fallback_subject="fallback")
    assert out.subject == "Team Sync"
    assert "See you Thursday." in out.body
    assert "Subject:" not in out.body


def test_parse_email_falls_back_when_no_subject_line():
    out = _parse_email(
        "Just a plain message with no subject header.", "the fallback topic"
    )
    assert out.subject.startswith("The fallback topic") or out.subject.startswith(
        "the fallback"
    )
    assert out.full_email.startswith("Subject:")


def test_derive_subject_truncates_long_text():
    long_text = "x" * 200
    subject = _derive_subject(long_text, limit=20)
    assert len(subject) <= 20


def test_heuristic_revise_shorten():
    email = (
        "Subject: Update\n\nHi Team,\n\nThis is a long sentence. "
        "It has more detail than needed.\n\nBest regards,\nRama"
    )
    out = heuristic_revise(email, "please make it shorter", None)
    assert len(out.body) < len(email)


def test_heuristic_revise_tone_shift_changes_signoff():
    email = "Subject: Update\n\nHi Team,\n\nSome content here.\n\nBest regards,\nRama"
    out = heuristic_revise(email, "make it more friendly", "friendly")
    assert "Cheers," in out.full_email


def test_heuristic_revise_generic_feedback_appends_note():
    email = "Subject: Update\n\nHi Team,\n\nSome content.\n\nBest regards,\nRama"
    out = heuristic_revise(email, "mention the new deadline is Friday", None)
    assert "new deadline is Friday" in out.body
