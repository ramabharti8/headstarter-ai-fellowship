"""The drafting engine: prompt construction, provider calls, and an offline
template-based drafter so the service (and its tests) work with no API key."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from .config import Settings
from .schemas import DraftRequest, Length, Tone

log = logging.getLogger("emaildraft")

_GROQ_BASE_URL = "https://api.groq.com/openai/v1"

_TONE_DESCRIPTIONS: dict[Tone, str] = {
    "professional": "formal, polished, business-appropriate",
    "friendly": "warm, casual, approachable",
    "assertive": "confident, direct, no-nonsense",
    "empathetic": "understanding, compassionate, reassuring",
    "persuasive": "compelling, benefit-focused, motivating action",
    "apologetic": "sincere, accountable, focused on making things right",
}

_LENGTH_GUIDANCE: dict[Length, str] = {
    "short": "very concise — 3-5 sentences total, one short paragraph",
    "medium": "moderate length — 2-3 short paragraphs",
    "long": "thorough — 3-4 paragraphs with brief elaboration on each point",
}

SYSTEM_PROMPT = """\
You are an expert business communication writer. Draft a complete, polished \
email from the key points the user provides.

Output format (plain text, no markdown, no code fences):
Subject: <a concise, specific subject line>

<greeting>

<body paragraphs>

<sign-off>
<sender name, if given>

Rules:
- The first line MUST start with "Subject:".
- Cover every key point; do not invent facts not implied by the input.
- Match the requested tone and length exactly.
- Use the recipient/sender names naturally if given; otherwise keep the
  greeting/sign-off generic.
- Output ONLY the email — no preamble, no explanation, no markdown fences.
"""


@dataclass
class DraftOutcome:
    subject: str
    body: str
    full_email: str


class Drafter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.provider = settings.resolved_provider
        self.model = settings.active_chat_model
        self._client = None if self.provider == "fake" else self._make_client()

    def _make_client(self):
        from openai import OpenAI

        if self.provider == "groq":
            return OpenAI(
                api_key=self.settings.groq_api_key,
                base_url=_GROQ_BASE_URL,
                timeout=self.settings.request_timeout_s,
            )
        return OpenAI(
            api_key=self.settings.openai_api_key,
            timeout=self.settings.request_timeout_s,
        )

    # -- public API ---------------------------------------------------------

    def draft(self, req: DraftRequest) -> tuple[list[DraftOutcome], bool]:
        bullets, b_truncated = _truncate_list(
            req.bullet_points, self.settings.max_bullets, self.settings.max_bullet_chars
        )
        context, c_truncated = _truncate(req.context, self.settings.max_context_chars)
        truncated = b_truncated or c_truncated

        if self.provider == "fake":
            outcomes = [
                heuristic_draft(
                    bullets, req.recipient, req.sender, req.tone, req.length, context, i
                )
                for i in range(req.variants)
            ]
        else:
            outcomes = [
                self._model_draft(bullets, req, context, variant_index=i)
                for i in range(req.variants)
            ]
        return outcomes, truncated

    def revise(self, full_email: str, feedback: str, tone: Tone | None) -> DraftOutcome:
        if self.provider == "fake":
            return heuristic_revise(full_email, feedback, tone)
        return self._model_revise(full_email, feedback, tone)

    # -- provider path -----------------------------------------------------

    def _model_draft(
        self, bullets: list[str], req: DraftRequest, context: str, variant_index: int
    ) -> DraftOutcome:
        user = _build_draft_message(bullets, req, context, variant_index, req.variants)
        raw = self._chat(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user},
            ]
        )
        return _parse_email(raw, fallback_subject=bullets[0] if bullets else "Update")

    def _model_revise(
        self, full_email: str, feedback: str, tone: Tone | None
    ) -> DraftOutcome:
        parts = [
            "Revise the email below based on the feedback. Keep the same "
            "output format (a 'Subject:' first line, blank line, then the "
            "email).",
            f"\nCURRENT EMAIL:\n{full_email.strip()}",
            f"\nFEEDBACK:\n{feedback.strip()}",
        ]
        if tone:
            parts.append(
                f"\nAlso shift the tone to: {_TONE_DESCRIPTIONS.get(tone, tone)}."
            )
        raw = self._chat(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": "\n".join(parts)},
            ]
        )
        return _parse_email(raw, fallback_subject="Revised message")

    def _chat(self, messages: list[dict]) -> str:
        resp = self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=self.settings.temperature,
            max_tokens=self.settings.max_output_tokens,
        )
        choice = resp.choices[0]
        if choice.finish_reason == "length":
            log.warning(
                "draft hit the %s-token cap; may be truncated",
                self.settings.max_output_tokens,
            )
        return choice.message.content or ""


def _build_draft_message(
    bullets: list[str], req: DraftRequest, context: str, variant_index: int, n: int
) -> str:
    parts = [
        "Key points:\n" + "\n".join(f"- {b}" for b in bullets),
        f"Tone: {_TONE_DESCRIPTIONS.get(req.tone, req.tone)}",
        f"Length: {_LENGTH_GUIDANCE.get(req.length, req.length)}",
    ]
    if req.recipient.strip():
        parts.append(f"Recipient: {req.recipient.strip()}")
    if req.sender.strip():
        parts.append(f"Sender: {req.sender.strip()}")
    if context.strip():
        parts.append(f"Additional context: {context.strip()}")
    if n > 1:
        parts.append(
            f"This is variant {variant_index + 1} of {n} — give it a distinct "
            "angle, structure or phrasing from a typical draft, while still "
            "covering all the key points and matching the requested tone."
        )
    return "\n".join(parts)


# -- response parsing -------------------------------------------------------

_SUBJECT_RE = re.compile(r"^\s*subject\s*:\s*(.+)$", re.IGNORECASE)


def _parse_email(raw: str, fallback_subject: str) -> DraftOutcome:
    raw = (raw or "").strip()
    lines = raw.splitlines()
    subject = ""
    body_lines = []
    for line in lines:
        m = _SUBJECT_RE.match(line)
        if m and not subject:
            subject = m.group(1).strip()
        else:
            body_lines.append(line)
    body = "\n".join(body_lines).strip()
    if not subject:
        subject = _derive_subject(fallback_subject)
    if not body:
        body = raw or "(no content generated)"
    full_email = f"Subject: {subject}\n\n{body}"
    return DraftOutcome(subject=subject, body=body, full_email=full_email)


def _derive_subject(source: str, limit: int = 70) -> str:
    text = re.sub(r"\s+", " ", (source or "Update")).strip().rstrip(".!,;:")
    text = text[0].upper() + text[1:] if text else "Update"
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _truncate(text: str, limit: int) -> tuple[str, bool]:
    text = text.strip()
    if len(text) > limit:
        return text[:limit], True
    return text, False


def _truncate_list(
    items: list[str], max_count: int, max_chars: int
) -> tuple[list[str], bool]:
    items = [i.strip() for i in items if i.strip()]
    truncated = False
    if len(items) > max_count:
        items = items[:max_count]
        truncated = True
    out = []
    for item in items:
        if len(item) > max_chars:
            out.append(item[:max_chars].rstrip() + "…")
            truncated = True
        else:
            out.append(item)
    return out, truncated


# -- offline template drafter ------------------------------------------------

_GREETINGS: dict[Tone, list[str]] = {
    "professional": ["Dear {r},", "Hello {r},"],
    "friendly": ["Hi {r},", "Hey {r},"],
    "assertive": ["{r},", "Hello {r},"],
    "empathetic": ["Dear {r},", "Hi {r},"],
    "persuasive": ["Hello {r},", "Dear {r},"],
    "apologetic": ["Dear {r},", "Hello {r},"],
}
_OPENERS: dict[Tone, list[str]] = {
    "professional": [
        "I hope this message finds you well. I'm writing to share the following updates.",
        "I wanted to follow up with a summary of a few important items.",
    ],
    "friendly": [
        "Hope you're doing great! Wanted to run through a few quick things.",
        "Just a quick note to catch you up on a few things.",
    ],
    "assertive": [
        "I need to bring the following points to your attention.",
        "There are a few items that require your immediate attention.",
    ],
    "empathetic": [
        "I wanted to personally reach out and share a few updates.",
        "I appreciate your patience, and wanted to keep you informed on the following.",
    ],
    "persuasive": [
        "I'm reaching out because I believe the following is worth your attention.",
        "I wanted to share something I think will be valuable for you.",
    ],
    "apologetic": [
        "I wanted to reach out personally to address the following, and "
        "apologize for any inconvenience.",
        "I'm sorry for any trouble caused, and wanted to explain and address "
        "the following.",
    ],
}
_CLOSERS: dict[Tone, list[str]] = {
    "professional": [
        "Please let me know if you have any questions.",
        "Happy to provide more detail if useful.",
    ],
    "friendly": ["Let me know what you think!", "Just shout if you need anything!"],
    "assertive": [
        "Please confirm receipt and flag any concerns promptly.",
        "Kindly action the above at your earliest convenience.",
    ],
    "empathetic": [
        "Please don't hesitate to reach out if you need anything at all.",
        "I'm here if you'd like to talk through any of this.",
    ],
    "persuasive": [
        "I'd appreciate your prompt attention to this.",
        "Looking forward to hearing your thoughts soon.",
    ],
    "apologetic": [
        "Again, I'm sorry for the inconvenience, and I'm happy to discuss further.",
        "Please let me know how I can make this right.",
    ],
}
_SIGNOFFS: dict[Tone, str] = {
    "professional": "Best regards,",
    "friendly": "Cheers,",
    "assertive": "Regards,",
    "empathetic": "Warmly,",
    "persuasive": "Thank you for your consideration,",
    "apologetic": "With apologies,",
}
_SUBJECT_PREFIXES: dict[Tone, str] = {
    "professional": "Update:",
    "friendly": "Quick update:",
    "assertive": "Action required:",
    "empathetic": "Following up:",
    "persuasive": "Worth your attention:",
    "apologetic": "Apology and update:",
}


def heuristic_draft(
    bullets: list[str],
    recipient: str,
    sender: str,
    tone: Tone,
    length: Length,
    context: str,
    variant_index: int = 0,
) -> DraftOutcome:
    recipient = recipient.strip() or "there"
    sender = sender.strip()

    greetings = _GREETINGS.get(tone, _GREETINGS["professional"])
    openers = _OPENERS.get(tone, _OPENERS["professional"])
    closers = _CLOSERS.get(tone, _CLOSERS["professional"])
    greeting = greetings[variant_index % len(greetings)].format(r=recipient)
    opener = openers[variant_index % len(openers)]
    closer = closers[variant_index % len(closers)]
    signoff = _SIGNOFFS.get(tone, "Best regards,")

    if length == "short":
        point_text = "; ".join(b.rstrip(".") for b in bullets) + "."
        points_block = f"In short: {point_text}"
    elif length == "long":
        lines = []
        for b in bullets:
            lines.append(f"- {b}")
            lines.append(
                "  This matters because it directly affects our plans going forward."
            )
        points_block = "\n".join(lines)
    else:
        points_block = "\n".join(f"- {b}" for b in bullets)

    paragraphs = [greeting, "", opener, "", points_block]
    if context.strip():
        paragraphs += ["", f"For context: {context.strip()}"]
    paragraphs += ["", closer, "", signoff]
    if sender:
        paragraphs.append(sender)

    body = "\n".join(paragraphs[2:]).strip()  # everything after the greeting
    topic_source = context or (bullets[0] if bullets else "Update")
    subject = (
        f"{_SUBJECT_PREFIXES.get(tone, 'Update:')} {_derive_subject(topic_source, 55)}"
    )

    full_email = f"Subject: {subject}\n\n{greeting}\n\n{body}"
    return DraftOutcome(
        subject=subject, body=f"{greeting}\n\n{body}", full_email=full_email
    )


_FEEDBACK_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"shorter|concise|brief|trim", re.I), "shorten"),
    (re.compile(r"longer|expand|more detail|elaborate", re.I), "expand"),
    (re.compile(r"formal|professional", re.I), "professional"),
    (re.compile(r"friendly|casual|warm", re.I), "friendly"),
    (re.compile(r"assertive|direct|firm", re.I), "assertive"),
    (re.compile(r"apolog", re.I), "apologetic"),
]


def heuristic_revise(full_email: str, feedback: str, tone: Tone | None) -> DraftOutcome:
    outcome = _parse_email(full_email, fallback_subject="Revised message")
    subject, original_body = outcome.subject, outcome.body
    body = original_body

    matched_tone = tone
    action = None
    for pattern, label in _FEEDBACK_RULES:
        if pattern.search(feedback):
            if label in _SIGNOFFS:
                matched_tone = matched_tone or label  # type: ignore[assignment]
            elif action is None:
                action = label

    if matched_tone:
        # Swap the sign-off line to reflect the new tone; keep the rest of the
        # body (a full LLM would rewrite the whole thing — this is the
        # deterministic offline approximation). A no-op when the email is
        # already in that tone — handled below.
        new_signoff = _SIGNOFFS.get(matched_tone, _SIGNOFFS["professional"])
        body = re.sub(
            r"(?:" + "|".join(re.escape(s) for s in _SIGNOFFS.values()) + r")",
            new_signoff,
            body,
            count=1,
        )

    if action == "shorten":
        # Only compress genuine multi-sentence prose lines — leave greetings,
        # bullets, sign-offs and names (anything without an internal ". ")
        # untouched so they don't pick up a stray trailing period.
        body = "\n".join(
            line.split(". ")[0].rstrip(".") + "." if ". " in line else line
            for line in body.splitlines()
        )
    elif action == "expand":
        body += f"\n\nAdditionally: {feedback.strip().rstrip('.')}."

    if body == original_body:
        # Nothing above actually changed the text (e.g. the feedback asked
        # for a tone the email is already in, or matched no rule at all —
        # "make it longer" alone doesn't hit any pattern). Revise should
        # never silently return the same email, so fall back to appending
        # the feedback as a note.
        body += f"\n\nOne more note: {feedback.strip().rstrip('.')}."

    full_email = f"Subject: {subject}\n\n{body}"
    return DraftOutcome(subject=subject, body=body, full_email=full_email)
