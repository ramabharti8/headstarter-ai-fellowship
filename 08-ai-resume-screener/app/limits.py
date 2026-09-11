"""In-memory abuse protection for public deployments — no external store.

A sliding-window counter keyed by client IP. Good enough for a single-process
demo; swap for Redis if you ever run more than one worker.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class SlidingWindowLimiter:
    def __init__(self, max_events: int, window_s: float) -> None:
        self.max_events = max_events
        self.window_s = window_s
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return self.max_events > 0

    def allow(self, key: str) -> bool:
        if not self.enabled:
            return True
        now = time.monotonic()
        cutoff = now - self.window_s
        with self._lock:
            dq = self._hits[key]
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= self.max_events:
                return False
            dq.append(now)
            self._maybe_gc(cutoff)
            return True

    def retry_after(self, key: str) -> int:
        with self._lock:
            dq = self._hits.get(key)
            if not dq:
                return 1
            return max(1, int(self.window_s - (time.monotonic() - dq[0])) + 1)

    def _maybe_gc(self, cutoff: float) -> None:
        # Opportunistically drop IPs whose windows have fully expired.
        if len(self._hits) < 2048:
            return
        for k in [k for k, v in self._hits.items() if not v or v[-1] < cutoff]:
            del self._hits[k]
