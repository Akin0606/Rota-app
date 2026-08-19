"""Single source of truth for a shift's per-day hours and staffing.

The per-day shift model (SHIFT_MODEL_BUILD_PROMPT.md) stores real times per
(shift, day) in the `shift_days` table. EVERY read of a shift's hours or
staffing must go through this module — after Batch 2 no code reads
``shift["end_time"]`` / ``shift["start_time"]`` directly (grep-enforced). A
stray direct read is exactly how a Friday 02:30 close would email the wrong
time. The low-level clock math (`parse_hour`, `bounds`, `duration_hours`,
`touches_night`) lives here too, so those direct dict reads live only inside the
accessor module.

During migration these fall back to the shift-level `shifts.*` columns when no
`shift_days` row exists, so Batches 1-2 are behaviour-neutral (the Batch 1
backfill makes all 7 days identical to the old shift-level values).

`shift_days_by_key` is a dict keyed ``(shift_id, day_index) -> row`` — build it
once per request from the venue's `shift_days` rows (see `index_shift_days`).
"""

from __future__ import annotations

# 6am-10pm is the under-18 night-safe window; kept here so night detection and
# the solver share one definition.
NIGHT_SAFE_START = 6.0
NIGHT_SAFE_END = 22.0


# --------------------------------------------------------------------------- #
# Low-level clock math (canonical home; solver re-exports these)              #
# --------------------------------------------------------------------------- #

def parse_hour(time_str: str) -> float:
    """Parse '7:00am' / '2:00pm' / 'close' into a 24h float hour.

    'close' still resolves to 23.0 for now — the per-day migration replaces
    stored 'close' values with real times (Batch 1 backfill), so this branch
    only ever fires on an unmigrated legacy value.

    Raises a clean ``ValueError`` on unparseable text rather than the positional
    ``IndexError``/``ValueError`` the old slicing produced (Batch 3 G5). Callers
    in the solver catch it and drop the offending shift-day with a warning
    instead of crashing the whole solve; a plain 24h ``HH:MM`` is also tolerated.
    """
    t = (time_str or "").strip().lower()
    if t == "close":
        return 23.0
    t = t.replace(" ", "")
    period = t[-2:]
    if period not in ("am", "pm"):
        # No am/pm suffix — accept a bare 24h "HH:MM", else reject cleanly.
        try:
            h_str, _, m_str = t.partition(":")
            h = int(h_str)
            m = int(m_str) if m_str else 0
        except (ValueError, TypeError):
            raise ValueError(f"unparseable shift time: {time_str!r}")
        if not (0 <= h <= 23 and 0 <= m < 60):
            raise ValueError(f"shift time out of range: {time_str!r}")
        return h + m / 60
    clock = t[:-2]
    h_str, _, m_str = clock.partition(":")
    try:
        h = int(h_str)
        m = int(m_str) if m_str else 0
    except (ValueError, TypeError):
        raise ValueError(f"unparseable shift time: {time_str!r}")
    if not (1 <= h <= 12 and 0 <= m < 60):
        raise ValueError(f"shift time out of range: {time_str!r}")
    if period == "am":
        if h == 12:
            h = 0
    else:
        if h != 12:
            h += 12
    return h + m / 60


def bounds(start_str: str, end_str: str) -> tuple[float, float]:
    """(start, end) as 24h floats, end pushed past 24 if it crosses midnight."""
    start = parse_hour(start_str)
    end = parse_hour(end_str)
    if end <= start:
        end += 24
    return start, end


def duration_hours(start_str: str, end_str: str) -> float:
    start, end = bounds(start_str, end_str)
    return end - start


def touches_night(start_str: str, end_str: str) -> bool:
    """True if any part of the shift falls between 22:00 and 06:00."""
    start, end = bounds(start_str, end_str)
    return not (start >= NIGHT_SAFE_START and end <= NIGHT_SAFE_END)


# --------------------------------------------------------------------------- #
# Per-day accessors over shift_days                                           #
# --------------------------------------------------------------------------- #

def index_shift_days(rows: list[dict]) -> dict[tuple[str, int], dict]:
    """Index raw shift_days rows into a ``(shift_id, day_index) -> row`` map."""
    return {(r["shift_id"], r["day_index"]): r for r in rows}


def _row(shift: dict, day_index: int, shift_days_by_key: dict | None) -> dict | None:
    if not shift_days_by_key:
        return None
    return shift_days_by_key.get((shift["id"], day_index))


def exists_on_day(
    shift: dict, day_index: int, shift_days_by_key: dict | None
) -> bool:
    """True if the shift runs on this day.

    With a `shift_days` index present, existence is authoritative: a row means
    it runs, no row means it's a closed day. During migration (no index, or an
    index that predates a shift) we fall back to "runs every day", matching the
    old model where a shift had no per-day concept.
    """
    if shift_days_by_key is None:
        return True
    if (shift["id"], day_index) in shift_days_by_key:
        return True
    # No per-day rows for this shift at all -> unmigrated shift, treat as
    # running every day (fallback). If the shift has SOME rows but not this
    # day, that's a real closed day -> False.
    return not any(sid == shift["id"] for (sid, _d) in shift_days_by_key)


def bounds_for(
    shift: dict, day_index: int, shift_days_by_key: dict | None = None
) -> tuple[str, str]:
    """Return ``(start_time, end_time)`` raw clock strings for (shift, day).

    Prefers the `shift_days` row; falls back to the shift-level columns.
    """
    row = _row(shift, day_index, shift_days_by_key)
    if row is not None:
        return row["start_time"], row["end_time"]
    return shift["start_time"], shift["end_time"]


def duration_for(
    shift: dict, day_index: int, shift_days_by_key: dict | None = None
) -> float:
    """Shift duration in hours for (shift, day), via the per-day bounds."""
    return duration_hours(*bounds_for(shift, day_index, shift_days_by_key))


def touches_night_for(
    shift: dict, day_index: int, shift_days_by_key: dict | None = None
) -> bool:
    """Whether (shift, day) touches 22:00-06:00, via the per-day bounds."""
    return touches_night(*bounds_for(shift, day_index, shift_days_by_key))


def staffing_for(
    shift: dict, day_index: int, shift_days_by_key: dict | None = None
) -> tuple[int, int]:
    """Return ``(min_staff, max_staff)`` for (shift, day).

    Prefers the `shift_days` row; falls back to the shift-level columns with the
    same defaults `_build_summary` has always used (min 1, max 2).
    """
    row = _row(shift, day_index, shift_days_by_key)
    src = row if row is not None else shift
    min_staff = src.get("min_staff", 1)
    max_staff = src.get("max_staff", 2)
    min_staff = 1 if min_staff is None else min_staff
    max_staff = 2 if max_staff is None else max_staff
    return int(min_staff), int(max_staff)


def staffing_source(
    shift: dict, day_index: int, shift_days_by_key: dict | None = None
) -> dict:
    """The dict to read `min_staff`/`max_staff` from for (shift, day): the
    `shift_days` row if present, else the shift itself.

    Unlike `staffing_for`, this applies **no** defaults — it hands back the raw
    source so a caller with its own default/coercion rules (notably the solver,
    whose `max_staff` fallback is an effectively-unbounded 99, not 2) can keep
    them exactly. Byte-identical to reading the shift dict when no per-day row
    exists.
    """
    row = _row(shift, day_index, shift_days_by_key)
    return row if row is not None else shift
