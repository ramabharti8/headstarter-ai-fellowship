"""A tiny, dependency-free metrics registry that emits Prometheus text format.

Enough for a demo dashboard: request/text counters, a latency histogram and
cache-hit accounting. Not a replacement for prometheus_client in a real fleet.
"""

from __future__ import annotations

import threading
import time
from contextlib import contextmanager

# Upper bounds (seconds) for the latency histogram buckets.
_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)


class Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.requests_total = 0
        self.requests_errors = 0
        self.texts_total = 0
        self.cache_hits = 0
        self.cache_misses = 0
        self._lat_counts = [0] * len(_BUCKETS)
        self._lat_inf = 0
        self._lat_sum = 0.0

    def record_request(self, *, error: bool = False) -> None:
        with self._lock:
            self.requests_total += 1
            if error:
                self.requests_errors += 1

    def record_texts(self, n: int, *, cache_hits: int = 0) -> None:
        with self._lock:
            self.texts_total += n
            self.cache_hits += cache_hits
            self.cache_misses += max(0, n - cache_hits)

    def observe_latency(self, seconds: float) -> None:
        with self._lock:
            self._lat_sum += seconds
            for i, edge in enumerate(_BUCKETS):
                if seconds <= edge:
                    self._lat_counts[i] += 1
                    return
            self._lat_inf += 1

    @contextmanager
    def timer(self):
        start = time.perf_counter()
        try:
            yield
        finally:
            self.observe_latency(time.perf_counter() - start)

    def render(self, *, backend: str, model: str) -> str:
        with self._lock:
            lines = [
                "# HELP sentiment_requests_total Analyze requests handled.",
                "# TYPE sentiment_requests_total counter",
                f'sentiment_requests_total{{backend="{backend}"}} {self.requests_total}',
                "# HELP sentiment_request_errors_total Requests that raised 5xx.",
                "# TYPE sentiment_request_errors_total counter",
                f"sentiment_request_errors_total {self.requests_errors}",
                "# HELP sentiment_texts_total Individual texts scored.",
                "# TYPE sentiment_texts_total counter",
                f"sentiment_texts_total {self.texts_total}",
                "# HELP sentiment_cache_hits_total Result-cache hits.",
                "# TYPE sentiment_cache_hits_total counter",
                f"sentiment_cache_hits_total {self.cache_hits}",
                "# HELP sentiment_cache_misses_total Result-cache misses.",
                "# TYPE sentiment_cache_misses_total counter",
                f"sentiment_cache_misses_total {self.cache_misses}",
                "# HELP sentiment_request_latency_seconds Request latency.",
                "# TYPE sentiment_request_latency_seconds histogram",
            ]
            cumulative = 0
            for edge, count in zip(_BUCKETS, self._lat_counts, strict=False):
                cumulative += count
                lines.append(
                    f'sentiment_request_latency_seconds_bucket{{le="{edge}"}} '
                    f"{cumulative}"
                )
            cumulative += self._lat_inf
            lines.append(
                f'sentiment_request_latency_seconds_bucket{{le="+Inf"}} {cumulative}'
            )
            lines.append(f"sentiment_request_latency_seconds_sum {self._lat_sum:.6f}")
            lines.append(f"sentiment_request_latency_seconds_count {cumulative}")
            lines.append(f'sentiment_build_info{{backend="{backend}",model="{model}"}} 1')
        return "\n".join(lines) + "\n"


METRICS = Metrics()
