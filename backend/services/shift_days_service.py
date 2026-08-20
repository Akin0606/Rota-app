"""Writes and reads for a shift's per-day schedule (`shift_days`).

`shift_days` is the authoritative per-day source (Batch 3 reads everything
through `services.shift_bounds`). The `shifts.*` single columns are kept as a
**derived representative fallback** — the first open day's values — so any code
path not yet plumbed for per-day (the frontend, `earliest_shift_minutes`) still
sees a sensible time.

Three write paths, all here so the invariant "shift_days stays coherent with
shifts.*" lives in one place:

- `sync_uniform` — every day the same (used when a shift is created).
- `propagate_fields` — push just the edited time/staff columns onto existing
  rows (the simple single-field editor; preserves unedited per-day divergence).
- `replace_schedule` — rewrite the whole schedule from an explicit open-day list
  (the per-day editor; the ONLY path that creates closed days / full divergence).

Every path validates times through `shift_bounds.parse_hour`, closing G5 at the
write path: an unparseable time is rejected here instead of silently poisoning a
later solve.
"""

from __future__ import annotations

from services import shift_bounds

DAYS = range(7)
_TIME_FIELDS = ("start_time", "end_time")
_STAFF_FIELDS = ("min_staff", "max_staff")
PER_DAY_FIELDS = _TIME_FIELDS + _STAFF_FIELDS


class ScheduleError(ValueError):
    """Raised on an invalid schedule (unparseable time, min>max, no open day).
    The router turns this into a 400."""


def validate_time(label: str, value: str) -> None:
    try:
        shift_bounds.parse_hour(value)
    except ValueError:
        raise ScheduleError(f"{label} isn't a valid time: {value!r}.")


def _validate_staffing(min_staff: int, max_staff: int) -> None:
    if max_staff < min_staff:
        raise ScheduleError("Max staff can't be lower than min staff.")


def _row(shift_id: str, day_index: int, start, end, min_staff, max_staff) -> dict:
    return {
        "shift_id": shift_id,
        "day_index": day_index,
        "start_time": start,
        "end_time": end,
        "min_staff": min_staff,
        "max_staff": max_staff,
    }


def sync_uniform(supabase, shift_id: str, start, end, min_staff=1, max_staff=2) -> None:
    """Replace the shift's schedule with 7 identical open days. Used on create so
    a new shift is immediately per-day-coherent (runs every day at one time)."""
    validate_time("Start time", start)
    validate_time("End time", end)
    _validate_staffing(min_staff, max_staff)
    supabase.table("shift_days").delete().eq("shift_id", shift_id).execute()
    supabase.table("shift_days").insert(
        [_row(shift_id, d, start, end, min_staff, max_staff) for d in DAYS]
    ).execute()


def propagate_fields(supabase, shift_id: str, fields: dict) -> None:
    """Push only the given per-day columns onto every existing `shift_days` row,
    leaving unedited columns (and per-day divergence in them) intact.

    This is the single-field simple editor's sync: editing min_staff touches only
    min_staff on all days; editing start_time flattens the start across days (the
    intent of a single start field) but keeps per-day end/staff. A shift with no
    rows (unmigrated) is left alone — it runs every day off the shift-level
    fallback, which the caller has already updated."""
    per_day = {k: v for k, v in fields.items() if k in PER_DAY_FIELDS}
    if not per_day:
        return
    if "start_time" in per_day or "end_time" in per_day:
        # Validate against whatever the rows will end up with. We can only
        # validate the incoming values here; a row keeping its own end is
        # already-valid from when it was written.
        if "start_time" in per_day:
            validate_time("Start time", per_day["start_time"])
        if "end_time" in per_day:
            validate_time("End time", per_day["end_time"])
    supabase.table("shift_days").update(per_day).eq("shift_id", shift_id).execute()


def representative(days: list[dict]) -> dict:
    """The values to mirror onto shifts.* — the first open day (lowest index)."""
    first = min(days, key=lambda d: d["day_index"])
    return {
        "start_time": first["start_time"],
        "end_time": first["end_time"],
        "min_staff": first["min_staff"],
        "max_staff": first["max_staff"],
    }


def replace_schedule(supabase, shift_id: str, days: list[dict]) -> dict:
    """Rewrite the whole schedule from an explicit list of OPEN days (each a dict
    with day_index/start_time/end_time/min_staff/max_staff). Days not present are
    closed. Returns the representative shift-level values the caller should mirror
    onto `shifts.*`. Raises ScheduleError on any invalid day / no open day /
    duplicate day."""
    if not days:
        raise ScheduleError("A shift must run on at least one day.")
    seen = set()
    for d in days:
        di = d["day_index"]
        if di in seen:
            raise ScheduleError(f"Day {di} is listed twice.")
        seen.add(di)
        validate_time("Start time", d["start_time"])
        validate_time("End time", d["end_time"])
        _validate_staffing(d["min_staff"], d["max_staff"])

    supabase.table("shift_days").delete().eq("shift_id", shift_id).execute()
    supabase.table("shift_days").insert(
        [
            _row(shift_id, d["day_index"], d["start_time"], d["end_time"], d["min_staff"], d["max_staff"])
            for d in days
        ]
    ).execute()
    return representative(days)


def get_schedule(supabase, shift: dict) -> list[dict]:
    """The shift's 7-day schedule as a list of ShiftDayOut-shaped dicts.

    Mirrors `shift_bounds.exists_on_day`: a day with a row is open (its values);
    a day without a row is closed IF the shift has any rows at all, else it falls
    back to open-every-day at the shift-level time (an unmigrated shift)."""
    rows = (
        supabase.table("shift_days")
        .select("day_index, start_time, end_time, min_staff, max_staff")
        .eq("shift_id", shift["id"])
        .execute()
        .data
    )
    by_day = {r["day_index"]: r for r in rows}
    has_any = bool(rows)
    out = []
    for d in DAYS:
        row = by_day.get(d)
        if row is not None:
            out.append(
                {
                    "day_index": d,
                    "open": True,
                    "start_time": row["start_time"],
                    "end_time": row["end_time"],
                    "min_staff": row["min_staff"],
                    "max_staff": row["max_staff"],
                }
            )
        elif has_any:
            out.append({"day_index": d, "open": False, "min_staff": 1, "max_staff": 2})
        else:
            # Unmigrated shift — no rows at all, so it runs every day off the
            # shift-level fallback.
            out.append(
                {
                    "day_index": d,
                    "open": True,
                    "start_time": shift.get("start_time"),
                    "end_time": shift.get("end_time"),
                    "min_staff": shift.get("min_staff", 1),
                    "max_staff": shift.get("max_staff", 2),
                }
            )
    return out
