"""The review engine: prompt construction, provider calls, and an offline
heuristic fallback so the service (and its tests) work with no API key."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from .config import Settings
from .schemas import Issue, ReviewRequest

log = logging.getLogger("coderev")

_GROQ_BASE_URL = "https://api.groq.com/openai/v1"

SYSTEM_PROMPT = """\
You are a meticulous senior software engineer performing a code review.
Review the code the user provides and respond with STRICT JSON only — no prose
outside the JSON, no markdown fences.

The JSON must match this shape exactly:
{
  "summary": "1-3 sentences: what the code does and your overall take",
  "language": "the language you detected, lowercase (e.g. python, typescript)",
  "verdict": "approve | comment | request_changes",
  "score": 0-10 number (10 = excellent, ship it; <5 = serious problems),
  "issues": [
    {
      "severity": "critical | high | medium | low | info",
      "category": one of: bug, security, performance, style, maintainability,
                  correctness, documentation,
      "line": integer line number the issue is on, or null,
      "title": "short problem statement",
      "detail": "why it is a problem",
      "suggestion": "concrete fix"
    }
  ],
  "improvements": ["actionable suggestions that are not defects"],
  "refactored_code": "a corrected/improved full version of the code, same language"
}

Rules:
- Be specific and actionable. Reference real line numbers where you can.
- Order issues by severity, most severe first.
- Only set verdict to "approve" when there are no critical/high issues.
- If the input is a unified diff, review only the changes and their impact.
- If you cannot review (e.g. not code), return an empty issues list, a short
  summary explaining why, verdict "comment" and score 0.
- Keep "refactored_code" focused: for a long input, include only the corrected
  critical sections (or an empty string) rather than reprinting the whole file —
  spend the response budget on the issues, not on echoing code.
- Your entire response MUST be a single valid JSON object and MUST be complete.
"""


@dataclass
class ReviewOutcome:
    summary: str
    language: str
    verdict: str
    score: float
    issues: list[Issue]
    improvements: list[str]
    refactored_code: str
    truncated: bool


class Reviewer:
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

    def review(self, req: ReviewRequest) -> ReviewOutcome:
        source = req.diff.strip() or req.code
        truncated = False
        limit = self.settings.max_code_chars
        if len(source) > limit:
            source = source[:limit]
            truncated = True

        requested = req.language.strip().lower()
        auto = requested in ("", "auto")
        # Our own guess: authoritative for the offline path, a fallback for the
        # model path (the model is the better language detector).
        guess = detect_language(source)
        language = guess if auto else requested

        if self.provider == "fake":
            outcome = heuristic_review(source, language, is_diff=bool(req.diff.strip()))
        else:
            outcome = self._model_review(req, source, auto, language)

        outcome.truncated = truncated
        return outcome

    # -- provider path -----------------------------------------------------

    def _model_review(
        self, req: ReviewRequest, source: str, auto: bool, language: str
    ) -> ReviewOutcome:
        user = _build_user_message(req, source, auto, language)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ]

        raw = self._chat(messages, json_mode=True)
        if raw is None:
            # Some providers (notably Groq) reject their own output when JSON
            # mode produces invalid/truncated JSON. Retry once in plain mode and
            # parse leniently.
            log.warning("strict JSON mode failed; retrying without response_format")
            messages[-1]["content"] += (
                "\n\nReturn ONLY the JSON object — no prose, no code fences."
            )
            raw = self._chat(messages, json_mode=False)

        data = _loads_lenient(raw or "")
        if not data:
            raise ValueError(
                "the model did not return usable JSON (often a response that was "
                "too long — try a shorter snippet, a diff instead of the whole "
                "file, or raise CR_MAX_OUTPUT_TOKENS)"
            )
        return _outcome_from_data(data, fallback_language=language)

    def _chat(self, messages: list[dict], json_mode: bool) -> str | None:
        from openai import BadRequestError

        kwargs: dict = dict(
            model=self.model,
            messages=messages,
            temperature=self.settings.temperature,
            max_tokens=self.settings.max_output_tokens,
        )
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        try:
            resp = self._client.chat.completions.create(**kwargs)
        except BadRequestError as exc:
            if "json" in str(exc).lower():
                return None
            raise
        choice = resp.choices[0]
        if choice.finish_reason == "length":
            log.warning(
                "model output hit the %s-token cap; response may be truncated",
                self.settings.max_output_tokens,
            )
        return choice.message.content


def _build_user_message(
    req: ReviewRequest, source: str, auto: bool, language: str
) -> str:
    parts: list[str] = []
    kind = "unified diff" if req.diff.strip() else "code"
    parts.append(f"Review the following {kind}.")
    if auto:
        guess = language if language and language != "unknown" else ""
        hint = f" (a rough guess is '{guess}', but decide for yourself)" if guess else ""
        parts.append(
            f"Language: not specified — detect it from the code{hint} and put "
            "it in the JSON 'language' field."
        )
    else:
        parts.append(f"Language: {language}")
    if req.context.strip():
        parts.append(f"Context: {req.context.strip()}")
    if req.focus:
        parts.append("Pay particular attention to: " + ", ".join(req.focus))
    if len(source) > 4000:
        parts.append(
            "This input is large — keep 'refactored_code' to the corrected "
            "critical sections only (or leave it empty) and keep the whole "
            "response compact so the JSON stays complete."
        )
    fence = "diff" if req.diff.strip() else ("" if auto else language)
    parts.append(f"\n```{fence}\n{source}\n```")
    return "\n".join(parts)


# -- response parsing -----------------------------------------------------

_VALID_SEVERITY = {"critical", "high", "medium", "low", "info"}
_VALID_CATEGORY = {
    "bug",
    "security",
    "performance",
    "style",
    "maintainability",
    "correctness",
    "documentation",
}
_VALID_VERDICT = {"approve", "comment", "request_changes"}
_SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


def _parse_outcome(raw: str, fallback_language: str) -> ReviewOutcome:
    """Parse a raw model string into an outcome (empty outcome on garbage)."""
    return _outcome_from_data(_loads_lenient(raw), fallback_language)


def _outcome_from_data(data: dict, fallback_language: str) -> ReviewOutcome:
    issues: list[Issue] = []
    for item in data.get("issues") or []:
        if not isinstance(item, dict):
            continue
        severity = str(item.get("severity", "")).lower()
        category = str(item.get("category", "")).lower()
        issues.append(
            Issue(
                severity=severity if severity in _VALID_SEVERITY else "info",
                category=category if category in _VALID_CATEGORY else "maintainability",
                line=_coerce_int(item.get("line")),
                title=str(item.get("title") or "Issue").strip(),
                detail=str(item.get("detail") or "").strip(),
                suggestion=str(item.get("suggestion") or "").strip(),
            )
        )
    issues.sort(key=lambda i: _SEVERITY_ORDER.get(i.severity, 9))

    verdict = str(data.get("verdict", "")).lower()
    if verdict not in _VALID_VERDICT:
        verdict = "request_changes" if _has_blocking(issues) else "comment"

    improvements = [
        str(x).strip() for x in (data.get("improvements") or []) if str(x).strip()
    ]

    return ReviewOutcome(
        summary=str(data.get("summary") or "").strip() or "No summary provided.",
        language=str(data.get("language") or fallback_language).lower() or "unknown",
        verdict=verdict,
        score=_clamp_score(data.get("score")),
        issues=issues,
        improvements=improvements,
        refactored_code=str(data.get("refactored_code") or ""),
        truncated=False,
    )


def _loads_lenient(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?|\n?```$", "", raw).strip()
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if 0 <= start < end:
            try:
                parsed = json.loads(raw[start : end + 1])
                return parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                pass
    log.warning("could not parse model JSON (%d chars)", len(raw))
    return {}


def _has_blocking(issues: list[Issue]) -> bool:
    return any(i.severity in {"critical", "high"} for i in issues)


def _coerce_int(v: object) -> int | None:
    try:
        n = int(v)  # type: ignore[arg-type]
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def _clamp_score(v: object) -> float:
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    return round(max(0.0, min(10.0, f)), 1)


# -- offline heuristic reviewer -----------------------------------------------

_EXT_LANG = {
    "py": "python",
    "js": "javascript",
    "jsx": "javascript",
    "ts": "typescript",
    "tsx": "typescript",
    "go": "go",
    "rs": "rust",
    "java": "java",
    "rb": "ruby",
    "php": "php",
    "c": "c",
    "h": "c",
    "cpp": "cpp",
    "cc": "cpp",
    "cs": "csharp",
    "sql": "sql",
    "sh": "bash",
}

# language -> (weight, [alternatives]). Weighted so a strong signal (a shebang,
# `<?php`, `package main`) beats an ambiguous one (`import `, used by many langs).
# The alternatives are OR-joined into one case-sensitive regex per language,
# matched against the first ~80 lines with MULTILINE on.
_LANG_HINTS: dict[str, tuple[int, list[str]]] = {
    "python": (
        3,
        [
            r"^\s*def\s+\w+\s*\(.*\)\s*:",
            r"^\s*from\s+\S+\s+import\b",
            r"\bself\b",
            r"\belif\b",
            r"\b__name__\b",
            r"\bprint\s*\(",
        ],
    ),
    "javascript": (
        3,
        [
            r"\bconst\s+\w+\s*=",
            r"=>",
            r"\bfunction\s*\*?\s*\w*\s*\(",
            r"console\.(log|error|warn)",
            r"\brequire\s*\(",
            r"\b(document|window)\.",
        ],
    ),
    "typescript": (
        4,
        [
            r"\binterface\s+\w+",
            r"\btype\s+\w+\s*=",
            r":\s*(string|number|boolean)\b",
            r"\bas\s+const\b",
            r"\benum\s+\w+",
            r"\bimplements\b",
        ],
    ),
    "go": (
        4,
        [r"^\s*package\s+\w+", r":=", r"\bfunc\s+\w+\s*\(", r"\bfmt\.[A-Z]"],
    ),
    "rust": (
        4,
        [r"\bfn\s+\w+\s*\(", r"\blet\s+mut\b", r"\bimpl\b", r"println!", r"use\s+std::"],
    ),
    "java": (
        5,
        [r"\bpublic\s+static\s+void\s+main", r"System\.out\.print", r"\bimport\s+java\."],
    ),
    "csharp": (
        5,
        [r"\busing\s+System\b", r"\bnamespace\s+\w+", r"Console\.Write"],
    ),
    "cpp": (
        3,
        [r"#include\s*<", r"std::", r"\bcout\s*<<", r"\bprintf\s*\("],
    ),
    "ruby": (
        3,
        [
            r"\bputs\b",
            r"^\s*end\s*$",
            r"\belsif\b",
            r"\brequire\s+['\"]",
            r"attr_accessor",
        ],
    ),
    "php": (
        4,
        [r"<\?php", r"\$\w+\s*=", r"\becho\s+\$", r"->\w+\("],
    ),
    "sql": (
        4,
        [
            r"\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b",
        ],
    ),
    "bash": (
        4,
        [r"^#!.*\b(bash|sh|zsh)\b", r"\bfi\b", r"\besac\b", r"\$\{\w+\}", r"\bthen\b"],
    ),
}

_LANG_SIGNALS: list[tuple[re.Pattern[str], str, int]] = [
    (
        re.compile("|".join(alts), re.M | (re.I if lang == "sql" else 0)),
        lang,
        weight,
    )
    for lang, (weight, alts) in _LANG_HINTS.items()
]


_SHEBANG = re.compile(r"^#!\s*\S*/(?:env\s+)?(\w+)")


def detect_language(source: str) -> str:
    # A unified diff usually names the file — trust its extension first.
    for m in re.finditer(r"^(?:\+\+\+|---)\s+[ab]/.*?\.([A-Za-z0-9]+)\s*$", source, re.M):
        lang = _EXT_LANG.get(m.group(1).lower())
        if lang:
            return lang

    # A shebang is unambiguous.
    sb = _SHEBANG.match(source.lstrip())
    if sb:
        interp = sb.group(1).lower()
        if interp in ("bash", "sh", "zsh", "ksh"):
            return "bash"
        if interp.startswith("python"):
            return "python"
        if interp in ("node", "deno", "bun"):
            return "javascript"
        if interp in ("ruby", "perl"):
            return "ruby" if interp == "ruby" else "unknown"

    head = "\n".join(source.splitlines()[:80])
    scores: dict[str, int] = {}
    for pattern, lang, weight in _LANG_SIGNALS:
        hits = len(pattern.findall(head))
        if hits:
            scores[lang] = scores.get(lang, 0) + weight + min(hits, 3)
    if not scores:
        return "unknown"
    return max(scores, key=lambda k: scores[k])


@dataclass
class _Rule:
    pattern: re.Pattern[str]
    severity: str
    category: str
    title: str
    detail: str
    suggestion: str
    langs: set[str] | None = None


_RULES: list[_Rule] = [
    _Rule(
        re.compile(r"\beval\s*\(|\bexec\s*\("),
        "critical",
        "security",
        "Use of eval/exec",
        "Executing dynamically built strings is a code-injection risk.",
        "Parse or dispatch explicitly instead of eval/exec.",
    ),
    _Rule(
        re.compile(r"""(?i)(password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]{6,}"""),
        "high",
        "security",
        "Hard-coded credential",
        "Secrets committed to source get leaked through history and logs.",
        "Load it from an environment variable or a secrets manager.",
    ),
    _Rule(
        re.compile(r"except\s*:\s*(#.*)?$", re.M),
        "medium",
        "correctness",
        "Bare except",
        "Catching everything hides real errors and KeyboardInterrupt.",
        "Catch the specific exception type you expect.",
        {"python"},
    ),
    _Rule(
        re.compile(r"==\s*None|!=\s*None"),
        "low",
        "style",
        "Comparison to None with ==",
        "Identity is the idiomatic and safe check for None.",
        "Use 'is None' / 'is not None'.",
        {"python"},
    ),
    _Rule(
        re.compile(r"\bprint\s*\(", re.M),
        "low",
        "maintainability",
        "print() left in code",
        "Stray prints are noise in production and bypass log levels.",
        "Use the logging module (or remove the line).",
        {"python"},
    ),
    _Rule(
        re.compile(r"\bconsole\.log\s*\("),
        "low",
        "maintainability",
        "console.log left in code",
        "Debug logging shipped to production leaks internals and adds noise.",
        "Remove it or use a real logger.",
        {"javascript", "typescript"},
    ),
    _Rule(
        re.compile(r"#\s*(TODO|FIXME|XXX|HACK)\b|//\s*(TODO|FIXME|XXX|HACK)\b"),
        "info",
        "maintainability",
        "Unresolved TODO/FIXME",
        "Tracked work living in comments tends to be forgotten.",
        "File a ticket or resolve it before merging.",
    ),
    _Rule(
        re.compile(r"(SELECT|INSERT|UPDATE|DELETE)\b.*\+\s*\w+", re.I),
        "high",
        "security",
        "Possible SQL string concatenation",
        "Building SQL with string concatenation invites SQL injection.",
        "Use parameterised queries / bound parameters.",
    ),
]


def heuristic_review(source: str, language: str, is_diff: bool) -> ReviewOutcome:
    lines = source.splitlines()
    issues: list[Issue] = []

    for rule in _RULES:
        if rule.langs and language not in rule.langs:
            continue
        for m in rule.pattern.finditer(source):
            line_no = source.count("\n", 0, m.start()) + 1
            issues.append(
                Issue(
                    severity=rule.severity,
                    category=rule.category,
                    line=line_no,
                    title=rule.title,
                    detail=rule.detail,
                    suggestion=rule.suggestion,
                )
            )

    for i, line in enumerate(lines, 1):
        if len(line) > 120:
            issues.append(
                Issue(
                    severity="info",
                    category="style",
                    line=i,
                    title="Long line",
                    detail=f"Line is {len(line)} characters; hard to read in reviews.",
                    suggestion="Wrap to ~100 characters.",
                )
            )
            break

    improvements: list[str] = []
    if language == "python" and lines and not _has_module_docstring(source):
        improvements.append("Add a module-level docstring describing purpose and usage.")
    if not any("test" in ln.lower() for ln in lines):
        improvements.append("Add unit tests covering the happy path and edge cases.")

    issues.sort(key=lambda i: _SEVERITY_ORDER.get(i.severity, 9))
    score = _score_from_issues(issues)
    verdict = (
        "request_changes"
        if _has_blocking(issues)
        else ("comment" if issues else "approve")
    )
    summary = (
        f"Heuristic review of {len(lines)} line(s) of {language}"
        f"{' diff' if is_diff else ''}. "
        f"Found {len(issues)} issue(s). "
        "This is an offline pattern-based pass — set CR_OPENAI_API_KEY for a full "
        "AI review."
    )
    return ReviewOutcome(
        summary=summary,
        language=language,
        verdict=verdict,
        score=score,
        issues=issues,
        improvements=improvements,
        refactored_code="",
        truncated=False,
    )


def _has_module_docstring(source: str) -> bool:
    stripped = source.lstrip()
    return stripped.startswith('"""') or stripped.startswith("'''")


def _score_from_issues(issues: list[Issue]) -> float:
    penalty = {"critical": 4.0, "high": 2.5, "medium": 1.0, "low": 0.4, "info": 0.1}
    total = sum(penalty.get(i.severity, 0.2) for i in issues)
    return round(max(0.0, 10.0 - total), 1)
