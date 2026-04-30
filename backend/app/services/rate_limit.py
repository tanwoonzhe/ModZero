"""Phase 2C — simple in-memory token-bucket rate limiter.

Per-key fixed-window counter. Not distributed — for the FYP demo & single-pod
deployments only. Production should swap in Redis + INCR/EXPIRE.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from typing import Deque, Dict, Tuple

_LOCK = threading.Lock()
_BUCKETS: Dict[str, Deque[float]] = {}


def allow(key: str, *, limit: int, window_seconds: int) -> Tuple[bool, int]:
    """Return ``(ok, retry_after_seconds)``.

    Sliding-ish window using a bounded deque of timestamps.
    """
    now = time.monotonic()
    cutoff = now - window_seconds
    with _LOCK:
        dq = _BUCKETS.get(key)
        if dq is None:
            dq = deque()
            _BUCKETS[key] = dq
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= limit:
            retry = max(1, int(window_seconds - (now - dq[0])))
            return False, retry
        dq.append(now)
        return True, 0
