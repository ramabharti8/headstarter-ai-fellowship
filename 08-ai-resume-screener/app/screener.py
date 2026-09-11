"""The screening engine: prompt construction, provider calls, and an offline
skill-overlap heuristic so the service (and its tests) work with no API key."""

from __future__ import annotations

import json
import logging
import re
from collections import Counter
from dataclasses import dataclass

from .config import Settings

log = logging.getLogger("resumescreener")

_GROQ_BASE_URL = "https://api.groq.com/openai/v1"

SYSTEM_PROMPT = """\
You are an expert technical recruiter and talent-acquisition specialist.
Compare the resume against the job description and respond with STRICT JSON
only — no prose outside the JSON, no markdown fences.

The JSON must match this shape exactly:
{
  "score": 0-100 integer (100 = perfect match for this role),
  "grade": "A | B | C | D | F",
  "summary": "2-3 sentence overview of fit",
  "strengths": ["specific strength grounded in the resume", ...],
  "gaps": ["specific gap or missing requirement", ...],
  "recommendation": "hire | maybe | reject",
  "key_skills_matched": ["skill the resume demonstrates that the JD wants", ...],
  "key_skills_missing": ["skill the JD wants that the resume does not show", ...]
}

Rules:
- Ground every claim in the actual resume text — do not invent experience.
- Weigh required/must-have qualifications more than nice-to-haves.
- "hire" only for a strong, well-evidenced match; "reject" for a poor fit;
  "maybe" otherwise.
- Keep strengths/gaps concrete (name the skill, years, or project), not generic.
- Your entire response MUST be a single valid JSON object and MUST be complete.
"""


@dataclass
class ScreenOutcome:
    score: int
    grade: str
    summary: str
    strengths: list[str]
    gaps: list[str]
    recommendation: str
    key_skills_matched: list[str]
    key_skills_missing: list[str]


class Screener:
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

    def screen(
        self, resume_text: str, job_description: str
    ) -> tuple[ScreenOutcome, bool, bool]:
        resume, resume_truncated = _truncate(resume_text, self.settings.max_resume_chars)
        jd, jd_truncated = _truncate(job_description, self.settings.max_jd_chars)

        if self.provider == "fake":
            outcome = heuristic_screen(resume, jd)
        else:
            outcome = self._model_screen(resume, jd)
        return outcome, resume_truncated, jd_truncated

    # -- provider path -----------------------------------------------------

    def _model_screen(self, resume: str, jd: str) -> ScreenOutcome:
        user = (
            f"JOB DESCRIPTION:\n{jd}\n\nRESUME:\n{resume}\n\n"
            "Return the JSON object described in your instructions."
        )
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
                "too long — try a shorter resume/JD, or raise RS_MAX_OUTPUT_TOKENS)"
            )
        return _outcome_from_data(data)

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


def _truncate(text: str, limit: int) -> tuple[str, bool]:
    text = text.strip()
    if len(text) > limit:
        return text[:limit], True
    return text, False


# -- response parsing -------------------------------------------------------

_VALID_GRADE = {"A", "B", "C", "D", "F"}
_VALID_REC = {"hire", "maybe", "reject"}


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


def _outcome_from_data(data: dict) -> ScreenOutcome:
    score = _clamp_score(data.get("score"))
    grade = str(data.get("grade") or "").upper()
    if grade not in _VALID_GRADE:
        grade = _grade_for_score(score)
    recommendation = str(data.get("recommendation") or "").lower()
    if recommendation not in _VALID_REC:
        recommendation = _recommendation_for_score(score)

    return ScreenOutcome(
        score=score,
        grade=grade,
        summary=str(data.get("summary") or "").strip() or "No summary provided.",
        strengths=_str_list(data.get("strengths")),
        gaps=_str_list(data.get("gaps")),
        recommendation=recommendation,
        key_skills_matched=_str_list(data.get("key_skills_matched")),
        key_skills_missing=_str_list(data.get("key_skills_missing")),
    )


def _str_list(v: object) -> list[str]:
    if not isinstance(v, list):
        return []
    return [str(x).strip() for x in v if str(x).strip()]


def _clamp_score(v: object) -> int:
    try:
        n = int(round(float(v)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0
    return max(0, min(100, n))


def _grade_for_score(score: int) -> str:
    if score >= 90:
        return "A"
    if score >= 75:
        return "B"
    if score >= 60:
        return "C"
    if score >= 40:
        return "D"
    return "F"


def _recommendation_for_score(score: int) -> str:
    if score >= 70:
        return "hire"
    if score >= 45:
        return "maybe"
    return "reject"


# -- offline skill-overlap heuristic -----------------------------------------

# A broad, flat list of common tech + workplace skills. Matched case-insensitively
# with word-boundary-aware regex so "C++"/"C#"/"Node.js" work too.
SKILLS = [
    # Languages
    "Python",
    "JavaScript",
    "TypeScript",
    "Java",
    "C++",
    "C#",
    "Go",
    "Rust",
    "Ruby",
    "PHP",
    "Swift",
    "Kotlin",
    "Scala",
    "R",
    "MATLAB",
    "SQL",
    "Bash",
    # Web / backend frameworks
    "React",
    "Angular",
    "Vue",
    "Next.js",
    "Node.js",
    "Express",
    "Django",
    "Flask",
    "FastAPI",
    "Spring",
    "Spring Boot",
    "Ruby on Rails",
    "ASP.NET",
    "GraphQL",
    "REST",
    "gRPC",
    "Microservices",
    # Data / ML
    "Machine Learning",
    "Deep Learning",
    "TensorFlow",
    "PyTorch",
    "Keras",
    "scikit-learn",
    "Pandas",
    "NumPy",
    "NLP",
    "Computer Vision",
    "LLM",
    "Data Science",
    "Data Analysis",
    "Data Engineering",
    "ETL",
    "Spark",
    "Hadoop",
    "Airflow",
    "Tableau",
    "Power BI",
    # Databases
    "PostgreSQL",
    "MySQL",
    "MongoDB",
    "Redis",
    "SQLite",
    "DynamoDB",
    "Elasticsearch",
    "Cassandra",
    "Oracle",
    "SQL Server",
    # Cloud / DevOps
    "AWS",
    "Azure",
    "GCP",
    "Docker",
    "Kubernetes",
    "Terraform",
    "Ansible",
    "CI/CD",
    "Jenkins",
    "GitHub Actions",
    "GitLab CI",
    "Linux",
    "Nginx",
    "Prometheus",
    "Grafana",
    "Helm",
    # Mobile
    "iOS",
    "Android",
    "React Native",
    "Flutter",
    "SwiftUI",
    # Tools / practices
    "Git",
    "Agile",
    "Scrum",
    "Kanban",
    "JIRA",
    "TDD",
    "Unit Testing",
    "System Design",
    "OOP",
    "Design Patterns",
    "API Design",
    "Security",
    "OAuth",
    "Testing",
    "Debugging",
    "Performance Optimization",
    # Soft / role skills
    "Leadership",
    "Communication",
    "Project Management",
    "Stakeholder Management",
    "Mentoring",
    "Cross-functional Collaboration",
    "Problem Solving",
    "Product Management",
    "Technical Writing",
    "Public Speaking",
]

_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "you",
    "are",
    "your",
    "will",
    "our",
    "that",
    "this",
    "have",
    "has",
    "from",
    "into",
    "who",
    "all",
    "job",
    "work",
    "team",
    "role",
    "years",
    "year",
    "experience",
    "skills",
    "ability",
    "strong",
    "using",
    "such",
    "about",
    "also",
    "can",
    "should",
    "they",
    "their",
}

_WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9+#.]*")
_YEARS_RE = re.compile(r"(\d{1,2})\s*\+?\s*(?:years|yrs)\b", re.IGNORECASE)


def _skill_pattern(skill: str) -> re.Pattern[str]:
    escaped = re.escape(skill.lower())
    return re.compile(rf"(?<![a-z0-9]){escaped}(?![a-z0-9])")


_SKILL_PATTERNS = [(s, _skill_pattern(s)) for s in SKILLS]


def _skills_in(text_lower: str) -> list[str]:
    return [s for s, pat in _SKILL_PATTERNS if pat.search(text_lower)]


def _fallback_keywords(jd_lower: str, cap: int = 12) -> list[str]:
    """When the JD mentions none of our known skills, fall back to its most
    frequent meaningful words so scoring still has something to compare."""
    words = [w.lower() for w in _WORD_RE.findall(jd_lower) if len(w) >= 4]
    words = [w for w in words if w not in _STOPWORDS]
    counts = Counter(words)
    return [w for w, _ in counts.most_common(cap)]


def _max_years(text_lower: str) -> int:
    matches = _YEARS_RE.findall(text_lower)
    return max((int(m) for m in matches), default=0)


def heuristic_screen(resume: str, job_description: str) -> ScreenOutcome:
    """Deterministic, dependency-free. Not as sharp as an LLM — just consistent."""
    resume_l, jd_l = resume.lower(), job_description.lower()

    jd_skills = _skills_in(jd_l)
    used_fallback = False
    if not jd_skills:
        jd_skills = _fallback_keywords(jd_l)
        used_fallback = True

    if jd_skills:
        if used_fallback:
            # Fallback keywords are plain lowercase words; substring is enough.
            matched = [s for s in jd_skills if s in resume_l]
        else:
            # Known skills use their compiled word-boundary patterns for accuracy.
            matched = [
                s for s, pat in _SKILL_PATTERNS if s in jd_skills and pat.search(resume_l)
            ]
        missing = [s for s in jd_skills if s not in matched]
        coverage = len(matched) / len(jd_skills)
    else:
        matched, missing, coverage = [], [], 0.5  # nothing to compare against

    required_years = _max_years(jd_l)
    resume_years = _max_years(resume_l)
    experience_note = None
    bonus = 0
    if required_years:
        if resume_years >= required_years:
            bonus = 8
            experience_note = (
                f"Resume shows {resume_years}+ years of experience, meeting the "
                f"{required_years}+ year requirement."
            )
        else:
            bonus = -8
            experience_note = (
                f"Job asks for {required_years}+ years; resume shows "
                f"{resume_years or 'no clearly stated'} year(s)."
            )

    score = max(0, min(100, round(coverage * 90) + bonus))
    grade = _grade_for_score(score)
    recommendation = _recommendation_for_score(score)

    strengths = [f"Demonstrates {s}" for s in matched[:6]]
    gaps = [f"No clear evidence of {s}" for s in missing[:6]]
    if experience_note:
        (strengths if bonus > 0 else gaps).insert(0, experience_note)
    if not strengths:
        strengths = ["No strong keyword overlap with the job description found."]
    if not gaps and coverage < 1.0 and jd_skills:
        gaps = ["Minor gaps only — most key terms from the JD are present."]

    total = len(jd_skills) or 1
    summary = (
        f"Matches {len(matched)}/{total} key {'terms' if used_fallback else 'skills'} "
        f"from the job description ({coverage:.0%} coverage) — grade {grade}."
    )

    return ScreenOutcome(
        score=score,
        grade=grade,
        summary=summary,
        strengths=strengths,
        gaps=gaps,
        recommendation=recommendation,
        key_skills_matched=matched,
        key_skills_missing=missing,
    )
