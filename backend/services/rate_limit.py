"""In-process sliding-window rate limiting.

Kept intentionally simple (a dict of timestamp deques behind a lock) — fine for
a single-instance pilot deployment. If the backend is ever scaled to multiple
instances this needs to move to a shared store (e.g. Redis), since each process
would otherwise track its own independent counts.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import Request

_lock = threading.Lock()
_events: dict[str, deque] = defaultdict(deque)


def _prune(dq: deque, now: float, window_seconds: int) -> None:
    cutoff = now - window_seconds
    while dq and dq[0] <= cutoff:
        dq.popleft()


def client_ip(request: Request) -> str:
    """Best-effort client IP. Behind Render/other proxies the real client is in
    X-Forwarded-For (first entry); fall back to the direct peer."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _retry_after_seconds(dq: deque, now: float, window_seconds: int) -> int:
    # Seconds until the oldest event in the window ages out, freeing a slot.
    return max(int(dq[0] + window_seconds - now) + 1, 1)


def hit(key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    """Record an attempt for `key` and report whether it's allowed.

    Returns (allowed, retry_after_seconds). When the limit is already reached
    the attempt is NOT recorded and allowed is False.
    """
    now = time.time()
    with _lock:
        dq = _events[key]
        _prune(dq, now, window_seconds)
        if len(dq) >= limit:
            return False, _retry_after_seconds(dq, now, window_seconds)
        dq.append(now)
        return True, 0


def is_locked(key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    """Check whether `key` has already hit `limit` recorded failures within the
    window, without recording anything. Returns (locked, retry_after_seconds)."""
    now = time.time()
    with _lock:
        dq = _events[key]
        _prune(dq, now, window_seconds)
        if len(dq) >= limit:
            return True, _retry_after_seconds(dq, now, window_seconds)
        return False, 0


def record(key: str) -> None:
    """Record a failure timestamp for `key` (used with is_locked for the
    count-only-failures pattern)."""
    with _lock:
        _events[key].append(time.time())


def clear(key: str) -> None:
    """Forget all events for `key` — e.g. after a successful auth."""
    with _lock:
        _events.pop(key, None)


def minutes_from_seconds(seconds: int) -> int:
    return max((seconds + 59) // 60, 1)
