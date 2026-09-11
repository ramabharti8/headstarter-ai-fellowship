"""The inference engine.

Two backends behind one interface:

* ``TransformersAnalyzer`` — the real Hugging Face model. Runs a forward pass and
  a softmax to return the full probability distribution over
  negative / neutral / positive, plus honest token-level truncation detection.
* ``FakeAnalyzer`` — a deterministic lexicon scorer with no torch/transformers
  dependency, so tests, CI and offline demos work with zero downloads.

``SentimentService`` wraps whichever backend is active with an LRU result cache
and dynamic batching.
"""

from __future__ import annotations

import math
import re
import threading
from collections import OrderedDict
from dataclasses import dataclass, field

# Canonical label order. The real model's config is authoritative and usually
# matches this; we fall back to it if the config is missing labels.
LABELS: tuple[str, str, str] = ("negative", "neutral", "positive")

_MENTION_RE = re.compile(r"^@\w")
_URL_RE = re.compile(r"^(https?://|www\.)", re.IGNORECASE)


def preprocess(text: str) -> str:
    """Normalise social-media text the way the cardiffnlp model card recommends:
    replace @mentions with ``@user`` and links with ``http``.
    """
    tokens = []
    for tok in text.split():
        if _MENTION_RE.match(tok):
            tok = "@user"
        elif _URL_RE.match(tok):
            tok = "http"
        tokens.append(tok)
    return " ".join(tokens)


@dataclass
class SentimentOutcome:
    sentiment: str
    confidence: float
    scores: dict[str, float] = field(default_factory=dict)
    truncated: bool = False


def _softmax(xs: list[float]) -> list[float]:
    m = max(xs)
    exps = [math.exp(x - m) for x in xs]
    total = sum(exps)
    return [e / total for e in exps]


def _outcome_from_probs(probs: list[float], labels: list[str], truncated: bool):
    scores = {lbl: round(float(p), 4) for lbl, p in zip(labels, probs, strict=False)}
    top = max(scores, key=scores.__getitem__)
    return SentimentOutcome(
        sentiment=top,
        confidence=scores[top],
        scores=scores,
        truncated=truncated,
    )


class BaseAnalyzer:
    backend: str = "base"
    labels: list[str] = list(LABELS)

    def analyze(self, text: str, *, do_preprocess: bool = True) -> SentimentOutcome:
        return self.analyze_batch([text], do_preprocess=do_preprocess)[0]

    def analyze_batch(
        self, texts: list[str], *, do_preprocess: bool = True
    ) -> list[SentimentOutcome]:
        raise NotImplementedError

    # Overridden by TransformersAnalyzer; here so /health always has an answer.
    @property
    def device(self) -> str:
        return "cpu"


# --------------------------------------------------------------------------- #
# Offline lexicon backend                                                     #
# --------------------------------------------------------------------------- #

_POSITIVE = {
    "good",
    "great",
    "love",
    "loved",
    "loving",
    "amazing",
    "awesome",
    "excellent",
    "happy",
    "best",
    "wonderful",
    "fantastic",
    "nice",
    "glad",
    "thanks",
    "thank",
    "perfect",
    "brilliant",
    "delighted",
    "recommend",
    "recommended",
    "beautiful",
    "enjoy",
    "enjoyed",
    "impressive",
    "superb",
    "win",
    "won",
    "yay",
    "cool",
}
_NEGATIVE = {
    "bad",
    "terrible",
    "hate",
    "hated",
    "awful",
    "worst",
    "horrible",
    "sad",
    "angry",
    "disappointed",
    "disappointing",
    "broken",
    "broke",
    "bug",
    "buggy",
    "poor",
    "annoying",
    "annoyed",
    "slow",
    "crash",
    "crashed",
    "fail",
    "failed",
    "failure",
    "useless",
    "garbage",
    "trash",
    "sucks",
    "sucked",
    "ugly",
    "wrong",
}
_NEGATORS = {"not", "no", "never", "n't", "isn't", "wasn't", "don't", "didn't"}
_WORD_RE = re.compile(r"[a-z']+")


class FakeAnalyzer(BaseAnalyzer):
    """Deterministic, dependency-free. Not accurate — just consistent."""

    backend = "fake"

    def __init__(self, max_length: int = 512) -> None:
        self.max_length = max_length
        self.labels = list(LABELS)

    def analyze_batch(
        self, texts: list[str], *, do_preprocess: bool = True
    ) -> list[SentimentOutcome]:
        out = []
        for raw in texts:
            text = preprocess(raw) if do_preprocess else raw
            words = _WORD_RE.findall(text.lower())
            pos = neg = 0
            for i, w in enumerate(words):
                prev = words[i - 1] if i else ""
                flip = prev in _NEGATORS
                if w in _POSITIVE:
                    neg += 1 if flip else 0
                    pos += 0 if flip else 1
                elif w in _NEGATIVE:
                    pos += 1 if flip else 0
                    neg += 0 if flip else 1
            # Neutral gets a constant pull so short/plain text lands neutral.
            logits = [float(neg), 0.7, float(pos)]
            probs = _softmax(logits)
            truncated = len(words) > self.max_length
            out.append(_outcome_from_probs(probs, self.labels, truncated))
        return out


# --------------------------------------------------------------------------- #
# Real Hugging Face backend                                                   #
# --------------------------------------------------------------------------- #


def _resolve_device(pref: str, torch) -> str:
    pref = (pref or "auto").lower()
    if pref != "auto":
        return pref
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class TransformersAnalyzer(BaseAnalyzer):
    backend = "transformers"

    def __init__(
        self,
        model_name: str,
        *,
        device: str = "auto",
        max_length: int = 512,
        infer_batch_size: int = 32,
    ) -> None:
        import torch
        from transformers import (
            AutoModelForSequenceClassification,
            AutoTokenizer,
        )

        self._torch = torch
        self._device = _resolve_device(device, torch)
        self.max_length = max_length
        self.infer_batch_size = max(1, infer_batch_size)

        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSequenceClassification.from_pretrained(model_name)
        model.to(self._device)
        model.eval()
        self.model = model

        id2label = getattr(model.config, "id2label", None) or {}
        try:
            self.labels = [id2label[i].lower() for i in range(len(id2label))]
        except Exception:
            self.labels = list(LABELS)
        if len(self.labels) != 3:
            self.labels = list(LABELS)

    @property
    def device(self) -> str:
        return self._device

    def analyze_batch(
        self, texts: list[str], *, do_preprocess: bool = True
    ) -> list[SentimentOutcome]:
        proc = [preprocess(t) if do_preprocess else t for t in texts]
        results: list[SentimentOutcome] = []
        for start in range(0, len(proc), self.infer_batch_size):
            chunk = proc[start : start + self.infer_batch_size]
            results.extend(self._forward(chunk))
        return results

    def _forward(self, chunk: list[str]) -> list[SentimentOutcome]:
        torch = self._torch
        # Untruncated pass — just for length, cheap (no model call).
        raw_lens = self.tokenizer(chunk, truncation=False, padding=False)["input_ids"]
        truncs = [len(ids) > self.max_length for ids in raw_lens]

        enc = self.tokenizer(
            chunk,
            return_tensors="pt",
            truncation=True,
            max_length=self.max_length,
            padding=True,
        )
        enc = {k: v.to(self._device) for k, v in enc.items()}
        with torch.no_grad():
            logits = self.model(**enc).logits
        probs = torch.softmax(logits, dim=-1).cpu().tolist()
        return [
            _outcome_from_probs(p, self.labels, t)
            for p, t in zip(probs, truncs, strict=False)
        ]


# --------------------------------------------------------------------------- #
# Service: cache + batching over a backend                                    #
# --------------------------------------------------------------------------- #


def build_analyzer(settings) -> BaseAnalyzer:
    if settings.resolved_backend == "fake":
        return FakeAnalyzer(max_length=settings.max_length)
    return TransformersAnalyzer(
        settings.model_name,
        device=settings.device,
        max_length=settings.max_length,
        infer_batch_size=settings.infer_batch_size,
    )


class SentimentService:
    def __init__(self, settings, analyzer: BaseAnalyzer | None = None) -> None:
        self.settings = settings
        self.analyzer = analyzer or build_analyzer(settings)
        self.backend = self.analyzer.backend
        self.model_name = settings.model_name if self.backend != "fake" else "fake"
        self.device = self.analyzer.device
        self.labels = list(self.analyzer.labels)
        self._cache: OrderedDict[str, SentimentOutcome] = OrderedDict()
        self._cache_size = max(0, settings.cache_size)
        self._lock = threading.Lock()

    def warmup(self) -> None:
        """Force weights + tokenizer to load and run one pass."""
        self.analyzer.analyze("warmup", do_preprocess=False)

    # -- cache helpers ----------------------------------------------------- #
    def _key(self, text: str, do_pre: bool) -> str:
        return f"{int(do_pre)}\x00{text}"

    def _get(self, key: str) -> SentimentOutcome | None:
        if self._cache_size == 0:
            return None
        with self._lock:
            hit = self._cache.get(key)
            if hit is not None:
                self._cache.move_to_end(key)
            return hit

    def _put(self, key: str, val: SentimentOutcome) -> None:
        if self._cache_size == 0:
            return
        with self._lock:
            self._cache[key] = val
            self._cache.move_to_end(key)
            while len(self._cache) > self._cache_size:
                self._cache.popitem(last=False)

    @property
    def cache_len(self) -> int:
        with self._lock:
            return len(self._cache)

    # -- public API ------------------------------------------------------- #
    def analyze(
        self, text: str, *, do_preprocess: bool = True
    ) -> tuple[SentimentOutcome, bool]:
        key = self._key(text, do_preprocess)
        hit = self._get(key)
        if hit is not None:
            return hit, True
        out = self.analyzer.analyze(text, do_preprocess=do_preprocess)
        self._put(key, out)
        return out, False

    def analyze_batch(
        self, texts: list[str], *, do_preprocess: bool = True
    ) -> list[tuple[SentimentOutcome, bool]]:
        results: list[tuple[SentimentOutcome, bool] | None] = [None] * len(texts)
        pending_idx: list[int] = []
        pending_txt: list[str] = []
        for i, t in enumerate(texts):
            hit = self._get(self._key(t, do_preprocess))
            if hit is not None:
                results[i] = (hit, True)
            else:
                pending_idx.append(i)
                pending_txt.append(t)
        if pending_txt:
            outs = self.analyzer.analyze_batch(pending_txt, do_preprocess=do_preprocess)
            for i, t, o in zip(pending_idx, pending_txt, outs, strict=False):
                self._put(self._key(t, do_preprocess), o)
                results[i] = (o, False)
        return results  # type: ignore[return-value]
