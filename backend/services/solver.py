"""OR-Tools CP-SAT solver for weekly rota generation.

Note: the schema has no concept of "always need N of role X per shift", so
that constraint from the spec is not enforced here — there's no data source
for it. Everything else (availability, one-shift-per-day, max hours,
minimum rest, preference weighting, hour fairness) is implemented.
"""

from ortools.sat.python import cp_model

from services import shift_bounds

AVAILABLE = 1
UNAVAILABLE = 2
PREFERRED = 3

DAYS = range(7)
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# UK Working Time Regulations minimums for 16-17 year-olds. Stricter than the
# venue's adult rules and never toggleable — always applied when a staff
# member's is_under_18 flag is set.
UNDER18_MAX_HOURS_PER_DAY = 8.0
UNDER18_MAX_HOURS_PER_WEEK = 40.0
UNDER18_MIN_REST_HOURS = 12.0
UNDER18_NIGHT_SAFE_START = 6.0  # 6am — shifts may not start before this
UNDER18_NIGHT_SAFE_END = 22.0  # 10pm — shifts may not run past this


# Time math lives in services.shift_bounds now — the single module allowed to
# read a shift's raw start/end. These thin wrappers keep the solver's existing
# (shift-dict) call sites and the characterization tests working unchanged. They
# read through the accessor at day 0 with no index, which falls back to the
# shift-level times (identical for every day after the Batch 1 backfill) — so no
# start_time/end_time is read directly outside shift_bounds. Batch 3 re-keys the
# solver's per-shift duration/night maps to (shift, day) via the accessor.
_parse_hour = shift_bounds.parse_hour


def _shift_bounds(shift: dict) -> tuple[float, float]:
    """(start, end) as 24h floats, end pushed past 24 if the shift crosses midnight."""
    return shift_bounds.bounds(*shift_bounds.bounds_for(shift, 0))


def shift_duration_hours(shift: dict) -> float:
    return shift_bounds.duration_for(shift, 0)


def _shift_touches_night_hours(shift: dict) -> bool:
    """True if any part of the shift falls between 22:00 and 06:00."""
    return shift_bounds.touches_night_for(shift, 0)


def _rest_gap_hours(shift_a: dict, shift_b: dict) -> float:
    """Rest hours between the end of shift_a (day d) and start of shift_b (day d+1).
    Uses shift_a's unrolled end (via _shift_bounds) so a shift_a that itself
    crosses midnight (e.g. 18:00-02:00, unrolled end 26.0) is measured from its
    true end rather than the raw clock time it wraps back to."""
    _, end_a = _shift_bounds(shift_a)
    start_b = shift_bounds.parse_hour(shift_bounds.bounds_for(shift_b, 0)[0])
    return (24 + start_b) - end_a


def check_manual_assignment(
    staff: dict,
    day_index: int,
    shift: dict,
    other_assignments: list[dict],
    shifts_by_id: dict,
    rules: dict,
    on_leave: bool = False,
    shift_days_by_key: dict | None = None,
) -> dict:
    """Validates a single proposed manual "add" against the same rules
    generate_rota enforces, so the one-off manual-edit path can't bypass them.

    staff: {id, name, is_under_18}
    day_index: the day the shift is being added on
    shift: the shift being added
    other_assignments: this staff's OTHER assignments in the period — i.e.
        excluding whatever's on day_index, since an "add" always clears that
        day first. [{day_index, shift_id}]
    shifts_by_id: all of the venue's shifts, keyed by id
    rules: {max_hours_per_week, min_rest_hours, require_day_off}
    on_leave: True if this staff member has approved leave covering day_index
    shift_days_by_key: optional {(shift_id, day_index): row} index so every
        hours/night/rest read is per-day (Batch 3). None falls back to the
        shift-level times — identical to the old single-time behaviour.

    Judges the proposed add against the POST-add state of the staff member's
    week (their other assignments plus this one) so an adjacent-day rest gap
    or a now-fully-booked week is caught, not just the shift in isolation.

    Returns {"severity": "block" | "confirm" | "ok", "reason": str | None}.
    Under-18 violations are always "block" — no confirm path exists for them,
    matching the solver's non-toggleable hard constraints. Adult violations
    are "confirm", mirroring the existing risk-popup pattern elsewhere in the
    app (managers keep discretion where the law allows it).
    """
    name = staff.get("name") or "Staff member"
    under18 = bool(staff.get("is_under_18"))

    # Existence gate: the shift doesn't run this day (a closed day in the
    # per-day model). generate_rota already refuses to build a variable here;
    # this is the matching guard for the manual paths that share this check —
    # manual add, claim, give-accept, swap. A closed day is a fact about the
    # venue, not manager discretion, so it's a hard block with no confirm path.
    if shift_days_by_key is not None and not shift_bounds.exists_on_day(
        shift, day_index, shift_days_by_key
    ):
        day_label = DAY_NAMES[day_index] if 0 <= day_index <= 6 else f"day {day_index}"
        return {
            "severity": "block",
            "reason": f"'{shift['name']}' doesn't run on {day_label}.",
        }

    days_worked: dict[int, str] = {
        a["day_index"]: a["shift_id"] for a in other_assignments if a.get("shift_id")
    }
    days_worked[day_index] = shift["id"]

    def _gap_between(earlier_shift, earlier_day, later_shift, later_day):
        """Rest hours between the end of earlier_shift (its day) and the start of
        later_shift (its day), each read at its own day. Assumes the two days are
        adjacent, which is all _neighbor_gap ever passes."""
        _, end_a = shift_bounds.bounds(
            *shift_bounds.bounds_for(earlier_shift, earlier_day, shift_days_by_key)
        )
        start_b = shift_bounds.parse_hour(
            shift_bounds.bounds_for(later_shift, later_day, shift_days_by_key)[0]
        )
        return (24 + start_b) - end_a

    def _neighbor_gap(neighbor_day: int):
        if neighbor_day < 0 or neighbor_day > 6 or neighbor_day not in days_worked:
            return None
        neighbor_shift = shifts_by_id.get(days_worked[neighbor_day])
        if not neighbor_shift:
            return None
        if neighbor_day < day_index:
            return _gap_between(neighbor_shift, neighbor_day, shift, day_index)
        return _gap_between(shift, day_index, neighbor_shift, neighbor_day)

    def _duration_on(shid: str, d: int) -> float:
        return shift_bounds.duration_for(shifts_by_id[shid], d, shift_days_by_key)

    if under18:
        duration = shift_bounds.duration_for(shift, day_index, shift_days_by_key)
        if duration > UNDER18_MAX_HOURS_PER_DAY:
            return {
                "severity": "block",
                "reason": (
                    f"{name} is under 18: '{shift['name']}' is {duration:.1f}h, over the "
                    f"{UNDER18_MAX_HOURS_PER_DAY:.0f}h daily limit for under-18s."
                ),
            }
        if shift_bounds.touches_night_for(shift, day_index, shift_days_by_key):
            return {
                "severity": "block",
                "reason": (
                    f"{name} is under 18: '{shift['name']}' falls between 10pm and 6am — "
                    f"under-18s can't work night hours."
                ),
            }

        weekly_cap = min(rules.get("max_hours_per_week", 48), UNDER18_MAX_HOURS_PER_WEEK)
        total_hours = sum(
            _duration_on(shid, d)
            for d, shid in days_worked.items()
            if shid in shifts_by_id
        )
        if total_hours > weekly_cap + 1e-6:
            return {
                "severity": "block",
                "reason": (
                    f"{name} is under 18: this would bring their week to {total_hours:.1f}h, "
                    f"over the {weekly_cap:.0f}h weekly limit for under-18s."
                ),
            }

        for neighbor_day in (day_index - 1, day_index + 1):
            gap = _neighbor_gap(neighbor_day)
            if gap is not None and gap < UNDER18_MIN_REST_HOURS:
                return {
                    "severity": "block",
                    "reason": (
                        f"{name} is under 18: only {gap:.1f}h rest around this shift, short of the "
                        f"{UNDER18_MIN_REST_HOURS:.0f}h minimum for under-18s."
                    ),
                }

        worked_days = set(days_worked.keys())
        has_gap = any(d not in worked_days and (d + 1) not in worked_days for d in range(6))
        if not has_gap:
            return {
                "severity": "block",
                "reason": (
                    f"{name} is under 18: this would leave no 2 consecutive days off in the "
                    f"week, which under-18s are legally entitled to."
                ),
            }

        if on_leave:
            return {
                "severity": "confirm",
                "reason": f"{name} has approved leave covering this day.",
            }

        return {"severity": "ok", "reason": None}

    if on_leave:
        return {
            "severity": "confirm",
            "reason": f"{name} has approved leave covering this day.",
        }

    max_hours = rules.get("max_hours_per_week", 48)
    total_hours = sum(
        _duration_on(shid, d)
        for d, shid in days_worked.items()
        if shid in shifts_by_id
    )
    if total_hours > max_hours + 1e-6:
        return {
            "severity": "confirm",
            "reason": (
                f"{name}: this would bring their week to {total_hours:.1f}h, over the venue's "
                f"{max_hours:.0f}h weekly limit."
            ),
        }

    min_rest = rules.get("min_rest_hours", 11)
    for neighbor_day in (day_index - 1, day_index + 1):
        gap = _neighbor_gap(neighbor_day)
        if gap is not None and gap < min_rest:
            return {
                "severity": "confirm",
                "reason": (
                    f"{name}: only {gap:.1f}h rest around this shift, short of the venue's "
                    f"{min_rest:.0f}h minimum rest."
                ),
            }

    if rules.get("require_day_off", True) and len(days_worked) >= 7:
        return {
            "severity": "confirm",
            "reason": f"{name}: this would leave them working all 7 days this week, with no day off.",
        }

    return {"severity": "ok", "reason": None}


def _rest_gap_between(shift_a, day_a, shift_b, day_b, shift_days_by_key=None) -> float:
    """Rest hours between shift_a on day_a and shift_b on the next day, each read
    at its own day. Uses shift_a's unrolled end so a shift that itself crosses
    midnight is measured from its true end, not the clock time it wraps to."""
    _, end_a = shift_bounds.bounds(*shift_bounds.bounds_for(shift_a, day_a, shift_days_by_key))
    start_b = shift_bounds.parse_hour(
        shift_bounds.bounds_for(shift_b, day_b, shift_days_by_key)[0]
    )
    return (24 + start_b) - end_a


def under18_availability_notes(
    staff,
    submissions,
    shifts,
    rules,
    shift_days_by_key=None,
    leave_days=None,
):
    """The under-18 legal notes for a week, computed from SUBMITTED AVAILABILITY
    alone -- never from what the solver chose.

    Every one of these is a statement about a person's own submitted
    availability measured against the under-18 rules ("you said you could work
    this; legally you can't"), so it is true the moment availability lands and
    stays true until the availability or the shift's hours change. That is why
    it lives here as a pure function rather than inside the solve: the manager's
    rota screen re-reads a week on every load and every scrub, and a hard legal
    block that only rendered in the seconds after a solve is worse than useless.

    Returns (warnings, info, unreadable):
      warnings   -- availability that legally cannot be used at all.
      info       -- availability that will be trimmed by the weekly cap or the
                    2-consecutive-days-off rule.
      unreadable -- shifts whose stored times won't parse, and which are
                    therefore silently dropped from every solve. Returned rather
                    than swallowed for the same reason the warnings are computed
                    here at all: a venue with a corrupt shift time would
                    otherwise see the message once, after a solve, and never
                    again — while the shift kept vanishing from every rota.
    """
    max_hours = rules.get("max_hours_per_week", 48)
    leave_days = leave_days or {}

    warnings = []
    info = []
    unreadable = []

    shifts_by_id = {sh["id"]: sh for sh in shifts}
    names = {s["id"]: s.get("name") or "Staff member" for s in staff}

    availability = {}
    for sub in submissions:
        if sub.get("shift_id") is None:
            continue
        availability[(sub["staff_id"], sub["day_index"], sub["shift_id"])] = sub["status"]

    # Per-(shift, day) duration / night, for the days a shift actually runs.
    # Membership is the existence gate, exactly as in the solve.
    duration = {}
    touches_night = {}
    seen_unreadable = set()
    for shid, sh in shifts_by_id.items():
        for d in DAYS:
            if not shift_bounds.exists_on_day(sh, d, shift_days_by_key):
                continue
            try:
                duration[(shid, d)] = shift_bounds.duration_for(sh, d, shift_days_by_key)
                touches_night[(shid, d)] = shift_bounds.touches_night_for(sh, d, shift_days_by_key)
            except ValueError:
                if shid not in seen_unreadable:
                    unreadable.append(
                        f"'{sh.get('name') or 'A shift'}' has an unreadable time and was "
                        f"skipped — check its hours."
                    )
                    seen_unreadable.add(shid)
                continue

    for member in staff:
        sid = member["id"]
        if not bool(member.get("is_under_18")):
            continue
        blocked_days = leave_days.get(sid, set())

        # The slots this person could legally be given -- the same membership
        # test generate_rota uses to decide whether to create a variable.
        eligible_by_day = {}
        submitted_any = False
        for d in DAYS:
            if d in blocked_days:
                continue
            for shid in shifts_by_id:
                if (shid, d) not in duration:
                    continue
                if availability.get((sid, d, shid), 0) not in (AVAILABLE, PREFERRED):
                    continue
                submitted_any = True
                shift = shifts_by_id[shid]
                if duration[(shid, d)] > UNDER18_MAX_HOURS_PER_DAY:
                    warnings.append(
                        f"{names[sid]} (under 18): available for '{shift['name']}' on {DAY_NAMES[d]} "
                        f"({duration[(shid, d)]:.1f}h) — over the {UNDER18_MAX_HOURS_PER_DAY:.0f}h daily limit "
                        f"for under-18s, so this slot can't be used for them."
                    )
                    continue
                if touches_night[(shid, d)]:
                    warnings.append(
                        f"{names[sid]} (under 18): available for '{shift['name']}' on {DAY_NAMES[d]}, which "
                        f"falls between 10pm and 6am — under-18s can't work night hours, so this slot can't "
                        f"be used for them."
                    )
                    continue
                eligible_by_day.setdefault(d, []).append(shid)

        # Two consecutive eligible days too close together to be legal -- the
        # solver hard-blocks the combination, so say so.
        for d in range(6):
            for shid_a in eligible_by_day.get(d, []):
                for shid_b in eligible_by_day.get(d + 1, []):
                    gap = _rest_gap_between(
                        shifts_by_id[shid_a], d, shifts_by_id[shid_b], d + 1, shift_days_by_key
                    )
                    if gap < UNDER18_MIN_REST_HOURS:
                        warnings.append(
                            f"{names[sid]} (under 18): can't work both '{shifts_by_id[shid_a]['name']}' "
                            f"on {DAY_NAMES[d]} and '{shifts_by_id[shid_b]['name']}' on {DAY_NAMES[d + 1]}"
                            f" — only {gap:.1f}h rest between them, short of the "
                            f"{UNDER18_MIN_REST_HOURS:.0f}h minimum for under-18s."
                        )

        if not eligible_by_day:
            if submitted_any:
                warnings.append(
                    f"{names[sid]} (under 18): none of their submitted availability is usable under the "
                    f"under-18 rules (max {UNDER18_MAX_HOURS_PER_DAY:.0f}h/day, no shifts between 10pm-6am) "
                    f"— they won't be scheduled at all this week."
                )
            continue

        # Best-case hours if they worked their longest eligible option every
        # eligible day -- a true upper bound, so exceeding the weekly cap here
        # is a certainty, not a maybe.
        max_possible_hours = sum(
            max(duration[(shid, d)] for shid in shids) for d, shids in eligible_by_day.items()
        )
        weekly_cap = min(max_hours, UNDER18_MAX_HOURS_PER_WEEK)
        if max_possible_hours > weekly_cap:
            info.append(
                f"{names[sid]} (under 18): up to {max_possible_hours:.1f}h of legally-eligible availability "
                f"this week, above the {weekly_cap:.0f}h weekly cap for under-18s — some of it won't be used."
            )

        # If every possible 2-day window has an eligible slot on at least one
        # side, there is no "free" gap in their own availability -- the
        # mandatory 2 consecutive days off will definitely cost them some of it,
        # regardless of what the optimiser picks.
        eligible_days = set(eligible_by_day.keys())
        has_natural_gap = any(d not in eligible_days and (d + 1) not in eligible_days for d in range(6))
        if not has_natural_gap:
            info.append(
                f"{names[sid]} (under 18): available across the week with no natural 2-day gap — the "
                f"required 2 consecutive days off for under-18s means some availability won't be used."
            )

    return warnings, info, unreadable


def generate_rota(
    staff: list[dict],
    shifts: list[dict],
    submissions: list[dict],
    rules: dict,
    leave_days: dict[str, set[int]] | None = None,
    shift_days_by_key: dict | None = None,
) -> dict:
    """
    staff: [{id, name, is_under_18, ...}] active staff members
    shifts: [{id, name, start_time, end_time}]
    submissions: [{staff_id, day_index, shift_id, status}] (shift_id may be
        None for day-level notes — those are ignored here)
    rules: {max_hours_per_week, min_rest_hours, require_day_off}
    leave_days: {staff_id: {day_index, ...}} approved-leave days this week —
        no shift variable is created for that staff member on that day at
        all, same as if they'd marked themselves UNAVAILABLE all day.
    shift_days_by_key: {(shift_id, day_index): row} index of the venue's
        `shift_days` rows (Batch 3). Every shift's hours/night/staffing is read
        per-day through it, and a (shift, day) with no row is a closed day —
        no variable, no demand. None falls back to the shift-level times with
        every day identical, i.e. the old single-time behaviour.

    Returns {
        "assignments": [{"staff_id", "day_index", "shift_id"}],
        "uncovered": [{"day_index", "shift_id"}],
        "warnings": [str],  # under-18 availability that legally can't be used at all
        "info": [str],      # non-blocking notes on under-18 hours trimmed by the weekly
                             # cap or the 2-consecutive-days-off rule
    }
    """
    max_hours = rules.get("max_hours_per_week", 48)
    min_rest = rules.get("min_rest_hours", 11)
    require_day_off = rules.get("require_day_off", True)
    leave_days = leave_days or {}

    warnings: list[str] = []
    info: list[str] = []

    shifts_by_id = {sh["id"]: sh for sh in shifts}

    def _exists(shid, d) -> bool:
        return shift_bounds.exists_on_day(shifts_by_id[shid], d, shift_days_by_key)

    # Per-(shift, day) duration / night, computed only for the days a shift
    # actually runs. Membership of these maps IS the existence gate — a closed
    # day (no shift_days row) simply has no entry, so no variable and no demand
    # is ever built for it. A shift-day whose stored time won't parse (G5) is
    # dropped with a warning rather than crashing the whole solve.
    duration: dict[tuple, float] = {}
    touches_night: dict[tuple, bool] = {}
    unreadable: set = set()
    for shid, sh in shifts_by_id.items():
        for d in DAYS:
            if not _exists(shid, d):
                continue
            try:
                duration[(shid, d)] = shift_bounds.duration_for(sh, d, shift_days_by_key)
                touches_night[(shid, d)] = shift_bounds.touches_night_for(sh, d, shift_days_by_key)
            except ValueError:
                # The manager-facing message for this comes from
                # under18_availability_notes() below, so a plain read of the week
                # reports it too rather than only the seconds after a solve.
                unreadable.add(shid)

    def _min_staff(shid, d) -> int:
        src = shift_bounds.staffing_source(shifts_by_id[shid], d, shift_days_by_key)
        return max(0, int(src.get("min_staff", 1) or 0))

    def _max_staff(shid, d) -> int:
        src = shift_bounds.staffing_source(shifts_by_id[shid], d, shift_days_by_key)
        return max(1, int(src.get("max_staff", 99) or 1))

    def _rest_gap(shid_a, d_a, shid_b, d_b) -> float:
        """Rest hours between shid_a on day d_a and shid_b on day d_b (adjacent),
        each read at its own day."""
        _, end_a = shift_bounds.bounds(
            *shift_bounds.bounds_for(shifts_by_id[shid_a], d_a, shift_days_by_key)
        )
        start_b = shift_bounds.parse_hour(
            shift_bounds.bounds_for(shifts_by_id[shid_b], d_b, shift_days_by_key)[0]
        )
        return (24 + start_b) - end_a

    is_under18 = {s["id"]: bool(s.get("is_under_18")) for s in staff}
    names = {s["id"]: s.get("name") or "Staff member" for s in staff}

    availability: dict[tuple, int] = {}
    for sub in submissions:
        if sub.get("shift_id") is None:
            continue
        availability[(sub["staff_id"], sub["day_index"], sub["shift_id"])] = sub["status"]

    staff_ids = [s["id"] for s in staff]
    shift_ids = list(shifts_by_id.keys())

    model = cp_model.CpModel()

    # Build the assignable-variable set. A (shift, day) with no entry in the
    # duration map doesn't run that day (closed day or unreadable time) — the
    # existence gate — so it gets no variable. For under-18 staff, shifts that
    # are illegal for them outright (too long, or touching night hours) also
    # never get a variable — same effect as an availability filter, and it means
    # the solver literally cannot assign them there.
    x: dict[tuple, cp_model.IntVar] = {}
    for sid in staff_ids:
        under18 = is_under18.get(sid, False)
        blocked_days = leave_days.get(sid, set())
        for d in DAYS:
            if d in blocked_days:
                continue
            for shid in shift_ids:
                if (shid, d) not in duration:
                    continue  # closed day / unreadable time — no shift here
                if availability.get((sid, d, shid), 0) not in (AVAILABLE, PREFERRED):
                    continue
                # Shifts an under-18 legally cannot work get no variable at
                # all, so the solver literally cannot place them there. The
                # manager-facing explanation of *why* is produced by
                # under18_availability_notes() below — one definition, so the
                # rota screen shows the same block on every read, not only in
                # the seconds after a solve.
                if under18 and duration[(shid, d)] > UNDER18_MAX_HOURS_PER_DAY:
                    continue
                if under18 and touches_night[(shid, d)]:
                    continue
                x[(sid, d, shid)] = model.NewBoolVar(f"x_{sid}_{d}_{shid}")

    # Under-18 legal notes. Deliberately NOT derived from the solve: they are
    # facts about submitted availability measured against the under-18 rules, so
    # they are computed by the same pure function the rota summary calls on every
    # read. Keeping one definition is what stops the manager's legal block from
    # saying something different after a solve than it does on the next load.
    u18_warnings, u18_info, unreadable_warnings = under18_availability_notes(
        staff, submissions, shifts, rules, shift_days_by_key, leave_days
    )
    warnings.extend(unreadable_warnings)
    warnings.extend(u18_warnings)
    info.extend(u18_info)

    # Hard: at most one shift per staff per day
    for sid in staff_ids:
        for d in DAYS:
            vars_today = [x[(sid, d, shid)] for shid in shift_ids if (sid, d, shid) in x]
            if vars_today:
                model.Add(sum(vars_today) <= 1)

    # Hard: at least one full day off in each 7-day rota week. Since each
    # staff member works at most one shift per day, the sum of their shifts
    # across the week is already a 0/6 day-count, so capping it at 6 is enough.
    if require_day_off:
        for sid in staff_ids:
            week_vars = [x[(sid, d, shid)] for d in DAYS for shid in shift_ids if (sid, d, shid) in x]
            if week_vars:
                model.Add(sum(week_vars) <= 6)

    # Hard, under-18 only: at least one *2-consecutive-day* off window in the
    # week (48h continuous rest) — stricter than the general day-off rule
    # above, which both still apply. window_off[d] being true forces both
    # day d and day d+1 fully clear; requiring at least one true window
    # forces the solver to actually leave one such window open.
    for sid in staff_ids:
        if not is_under18.get(sid, False):
            continue
        window_off_vars = []
        for d in range(6):
            window_vars = [
                x[(sid, dd, shid)] for dd in (d, d + 1) for shid in shift_ids if (sid, dd, shid) in x
            ]
            window_off = model.NewBoolVar(f"weekoff_{sid}_{d}")
            if window_vars:
                model.Add(sum(window_vars) == 0).OnlyEnforceIf(window_off)
            window_off_vars.append(window_off)
        model.Add(sum(window_off_vars) >= 1)

    # Per-(day, shift) staffing: vars for everyone available for that slot.
    slot_vars: dict[tuple, list] = {}
    for (sid, d, shid), var in x.items():
        slot_vars.setdefault((d, shid), []).append(var)

    # Hard: never assign more than max_staff to a single shift on a day.
    for (d, shid), vars_here in slot_vars.items():
        model.Add(sum(vars_here) <= _max_staff(shid, d))

    max_hours_scaled = int(round(max_hours * 10))

    # Hard: max hours per week (scaled x10 to keep everything integer).
    # Under-18 staff get the stricter of the venue's cap and the 40h legal
    # weekly maximum.
    total_hours_vars = []
    for sid in staff_ids:
        terms = [
            int(round(duration[(shid, d)] * 10)) * x[(sid, d, shid)]
            for d in DAYS
            for shid in shift_ids
            if (sid, d, shid) in x
        ]
        cap_hours = min(max_hours, UNDER18_MAX_HOURS_PER_WEEK) if is_under18.get(sid, False) else max_hours
        cap_scaled = int(round(cap_hours * 10))
        total = model.NewIntVar(0, cap_scaled, f"hours_{sid}")
        model.Add(total == (sum(terms) if terms else 0))
        model.Add(total <= cap_scaled)
        total_hours_vars.append(total)

    # Hard: minimum rest between shifts on consecutive days. Under-18 staff
    # get the stricter 12h minimum instead of the venue's adult min_rest.
    for sid in staff_ids:
        under18 = is_under18.get(sid, False)
        threshold = UNDER18_MIN_REST_HOURS if under18 else min_rest
        for d in range(6):
            for shid_a in shift_ids:
                if (sid, d, shid_a) not in x:
                    continue
                for shid_b in shift_ids:
                    if (sid, d + 1, shid_b) not in x:
                        continue
                    gap = _rest_gap(shid_a, d, shid_b, d + 1)
                    if gap < threshold:
                        # The block itself. The under-18 explanation of this
                        # pair is raised by under18_availability_notes().
                        model.Add(x[(sid, d, shid_a)] + x[(sid, d + 1, shid_b)] <= 1)

    # Coverage: reward filling each demanded slot up to its min_staff target.
    # The target is capped at how many people are actually available, so the
    # solver isn't chasing an impossible headcount — genuine shortfalls are
    # flagged as under-covered conflicts after solving instead.
    coverage_terms = []
    for (d, shid), vars_here in slot_vars.items():
        target = min(_min_staff(shid, d), len(vars_here))
        if target <= 0:
            continue
        covered = model.NewIntVar(0, target, f"cov_{d}_{shid}")
        model.Add(covered <= sum(vars_here))
        coverage_terms.append(covered)

    # Objective: meet min_staff coverage first (dominant weight), then maximize
    # weighted preference satisfaction, then softly balance hours as a tie-break.
    preference_terms = [
        (3 if availability[(sid, d, shid)] == PREFERRED else 1) * var
        for (sid, d, shid), var in x.items()
    ]

    fairness_penalty = 0
    if total_hours_vars:
        max_h = model.NewIntVar(0, max_hours_scaled, "max_hours")
        min_h = model.NewIntVar(0, max_hours_scaled, "min_hours")
        model.AddMaxEquality(max_h, total_hours_vars)
        model.AddMinEquality(min_h, total_hours_vars)
        fairness_penalty = max_h - min_h

    objective = fairness_penalty
    if preference_terms:
        objective = sum(preference_terms) * 100 - fairness_penalty
    if coverage_terms:
        objective = sum(coverage_terms) * 100000 + objective
    model.Maximize(objective)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    status = solver.Solve(model)

    assignments = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for (sid, d, shid), var in x.items():
            if solver.Value(var):
                assignments.append({"staff_id": sid, "day_index": d, "shift_id": shid})
    else:
        warnings.append("Solver could not find a solution — check availability data.")

    # Demand (G6): a slot is demanded if the venue's shift definition asks for
    # staff there (an existing shift-day with min_staff > 0), OR if someone put
    # themselves forward for it — not from submissions alone, so a shift nobody
    # happened to answer for still shows as uncovered rather than silently
    # vanishing. Both are gated on the shift actually running that day (a slot
    # with no shift-day entry doesn't exist and can't be uncovered).
    demanded_from_shifts = {
        (d, shid)
        for shid in shift_ids
        for d in DAYS
        if (shid, d) in duration and _min_staff(shid, d) > 0
    }
    demanded_from_avail = {
        (d, shid)
        for (_, d, shid), st in availability.items()
        if st in (AVAILABLE, PREFERRED) and (shid, d) in duration
    }
    demand_slots = demanded_from_shifts | demanded_from_avail
    assigned_slots = {(a["day_index"], a["shift_id"]) for a in assignments}
    uncovered = [
        {"day_index": d, "shift_id": shid} for (d, shid) in sorted(demand_slots - assigned_slots)
    ]

    return {"assignments": assignments, "uncovered": uncovered, "warnings": warnings, "info": info}
