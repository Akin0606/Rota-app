"""OR-Tools CP-SAT solver for weekly rota generation.

Note: the schema has no concept of "always need N of role X per shift", so
that constraint from the spec is not enforced here — there's no data source
for it. Everything else (availability, one-shift-per-day, max hours,
minimum rest, preference weighting, hour fairness) is implemented.
"""

from ortools.sat.python import cp_model

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


def _parse_hour(time_str: str) -> float:
    """Parse '7:00am' / '2:00pm' / 'close' into a 24h float hour."""
    t = time_str.strip().lower()
    if t == "close":
        return 23.0
    t = t.replace(" ", "")
    period = t[-2:]
    clock = t[:-2]
    h_str, _, m_str = clock.partition(":")
    h = int(h_str)
    m = int(m_str) if m_str else 0
    if period == "am":
        if h == 12:
            h = 0
    else:
        if h != 12:
            h += 12
    return h + m / 60


def _shift_bounds(shift: dict) -> tuple[float, float]:
    """(start, end) as 24h floats, end pushed past 24 if the shift crosses midnight."""
    start = _parse_hour(shift["start_time"])
    end = _parse_hour(shift["end_time"])
    if end <= start:
        end += 24
    return start, end


def shift_duration_hours(shift: dict) -> float:
    start, end = _shift_bounds(shift)
    return end - start


def _shift_touches_night_hours(shift: dict) -> bool:
    """True if any part of the shift falls between 22:00 and 06:00."""
    start, end = _shift_bounds(shift)
    return not (start >= UNDER18_NIGHT_SAFE_START and end <= UNDER18_NIGHT_SAFE_END)


def _rest_gap_hours(shift_a: dict, shift_b: dict) -> float:
    """Rest hours between the end of shift_a (day d) and start of shift_b (day d+1).
    Uses shift_a's unrolled end (via _shift_bounds) so a shift_a that itself
    crosses midnight (e.g. 18:00-02:00, unrolled end 26.0) is measured from its
    true end rather than the raw clock time it wraps back to."""
    _, end_a = _shift_bounds(shift_a)
    start_b = _parse_hour(shift_b["start_time"])
    return (24 + start_b) - end_a


def check_manual_assignment(
    staff: dict,
    day_index: int,
    shift: dict,
    other_assignments: list[dict],
    shifts_by_id: dict,
    rules: dict,
    on_leave: bool = False,
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

    days_worked: dict[int, str] = {
        a["day_index"]: a["shift_id"] for a in other_assignments if a.get("shift_id")
    }
    days_worked[day_index] = shift["id"]

    def _neighbor_gap(neighbor_day: int):
        if neighbor_day < 0 or neighbor_day > 6 or neighbor_day not in days_worked:
            return None
        neighbor_shift = shifts_by_id.get(days_worked[neighbor_day])
        if not neighbor_shift:
            return None
        if neighbor_day < day_index:
            return _rest_gap_hours(neighbor_shift, shift)
        return _rest_gap_hours(shift, neighbor_shift)

    if under18:
        duration = shift_duration_hours(shift)
        if duration > UNDER18_MAX_HOURS_PER_DAY:
            return {
                "severity": "block",
                "reason": (
                    f"{name} is under 18: '{shift['name']}' is {duration:.1f}h, over the "
                    f"{UNDER18_MAX_HOURS_PER_DAY:.0f}h daily limit for under-18s."
                ),
            }
        if _shift_touches_night_hours(shift):
            return {
                "severity": "block",
                "reason": (
                    f"{name} is under 18: '{shift['name']}' falls between 10pm and 6am — "
                    f"under-18s can't work night hours."
                ),
            }

        weekly_cap = min(rules.get("max_hours_per_week", 48), UNDER18_MAX_HOURS_PER_WEEK)
        total_hours = sum(
            shift_duration_hours(shifts_by_id[shid])
            for shid in days_worked.values()
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
        shift_duration_hours(shifts_by_id[shid])
        for shid in days_worked.values()
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


def generate_rota(
    staff: list[dict],
    shifts: list[dict],
    submissions: list[dict],
    rules: dict,
    leave_days: dict[str, set[int]] | None = None,
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

    shifts_by_id = {sh["id"]: sh for sh in shifts}
    duration = {shid: shift_duration_hours(sh) for shid, sh in shifts_by_id.items()}
    touches_night = {shid: _shift_touches_night_hours(sh) for shid, sh in shifts_by_id.items()}

    def _min_staff(shid) -> int:
        return max(0, int(shifts_by_id[shid].get("min_staff", 1) or 0))

    def _max_staff(shid) -> int:
        return max(1, int(shifts_by_id[shid].get("max_staff", 99) or 1))

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

    warnings: list[str] = []
    info: list[str] = []

    # Build the assignable-variable set. For under-18 staff, shifts that are
    # illegal for them outright (too long, or touching night hours) never get
    # a variable at all — same effect as an availability filter, and it means
    # the solver literally cannot assign them there.
    x: dict[tuple, cp_model.IntVar] = {}
    for sid in staff_ids:
        under18 = is_under18.get(sid, False)
        blocked_days = leave_days.get(sid, set())
        for d in DAYS:
            if d in blocked_days:
                continue
            for shid in shift_ids:
                if availability.get((sid, d, shid), 0) not in (AVAILABLE, PREFERRED):
                    continue
                shift = shifts_by_id[shid]
                if under18 and duration[shid] > UNDER18_MAX_HOURS_PER_DAY:
                    warnings.append(
                        f"{names[sid]} (under 18): available for '{shift['name']}' on {DAY_NAMES[d]} "
                        f"({duration[shid]:.1f}h) — over the {UNDER18_MAX_HOURS_PER_DAY:.0f}h daily limit "
                        f"for under-18s, so this slot can't be used for them."
                    )
                    continue
                if under18 and touches_night[shid]:
                    warnings.append(
                        f"{names[sid]} (under 18): available for '{shift['name']}' on {DAY_NAMES[d]}, which "
                        f"falls between 10pm and 6am — under-18s can't work night hours, so this slot can't "
                        f"be used for them."
                    )
                    continue
                x[(sid, d, shid)] = model.NewBoolVar(f"x_{sid}_{d}_{shid}")

    # Under-18 deterministic notes: computed straight from each person's own
    # legally-eligible slots (x membership), independent of what the solver
    # ends up choosing, so these are never a guess about the solve outcome.
    for sid in staff_ids:
        if not is_under18.get(sid, False):
            continue

        eligible_by_day: dict[int, list[str]] = {}
        for d in DAYS:
            for shid in shift_ids:
                if (sid, d, shid) in x:
                    eligible_by_day.setdefault(d, []).append(shid)

        if not eligible_by_day:
            if any(availability.get((sid, d, shid), 0) in (AVAILABLE, PREFERRED) for d in DAYS for shid in shift_ids):
                warnings.append(
                    f"{names[sid]} (under 18): none of their submitted availability is usable under the "
                    f"under-18 rules (max {UNDER18_MAX_HOURS_PER_DAY:.0f}h/day, no shifts between 10pm-6am) "
                    f"— they won't be scheduled at all this week."
                )
            continue

        # Best-case hours if they worked their longest eligible option every
        # eligible day — a true upper bound, so exceeding the weekly cap here
        # is a certainty, not a maybe.
        max_possible_hours = sum(max(duration[shid] for shid in shids) for shids in eligible_by_day.values())
        weekly_cap = min(max_hours, UNDER18_MAX_HOURS_PER_WEEK)
        if max_possible_hours > weekly_cap:
            info.append(
                f"{names[sid]} (under 18): up to {max_possible_hours:.1f}h of legally-eligible availability "
                f"this week, above the {weekly_cap:.0f}h weekly cap for under-18s — some of it won't be used."
            )

        # If every possible 2-day window has an eligible slot on at least one
        # side, there's no "free" gap in their own availability — the
        # mandatory 2 consecutive days off will definitely cost them some of
        # it, regardless of what the optimiser picks.
        eligible_days = set(eligible_by_day.keys())
        has_natural_gap = any(d not in eligible_days and (d + 1) not in eligible_days for d in range(6))
        if not has_natural_gap:
            info.append(
                f"{names[sid]} (under 18): available across the week with no natural 2-day gap — the "
                f"required 2 consecutive days off for under-18s means some availability won't be used."
            )

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
        model.Add(sum(vars_here) <= _max_staff(shid))

    max_hours_scaled = int(round(max_hours * 10))

    # Hard: max hours per week (scaled x10 to keep everything integer).
    # Under-18 staff get the stricter of the venue's cap and the 40h legal
    # weekly maximum.
    total_hours_vars = []
    for sid in staff_ids:
        terms = [
            int(round(duration[shid] * 10)) * x[(sid, d, shid)]
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
                    gap = _rest_gap_hours(shifts_by_id[shid_a], shifts_by_id[shid_b])
                    if gap < threshold:
                        model.Add(x[(sid, d, shid_a)] + x[(sid, d + 1, shid_b)] <= 1)
                        if under18:
                            warnings.append(
                                f"{names[sid]} (under 18): can't work both '{shifts_by_id[shid_a]['name']}' "
                                f"on {DAY_NAMES[d]} and '{shifts_by_id[shid_b]['name']}' on {DAY_NAMES[d + 1]}"
                                f" — only {gap:.1f}h rest between them, short of the "
                                f"{UNDER18_MIN_REST_HOURS:.0f}h minimum for under-18s."
                            )

    # Coverage: reward filling each demanded slot up to its min_staff target.
    # The target is capped at how many people are actually available, so the
    # solver isn't chasing an impossible headcount — genuine shortfalls are
    # flagged as under-covered conflicts after solving instead.
    coverage_terms = []
    for (d, shid), vars_here in slot_vars.items():
        target = min(_min_staff(shid), len(vars_here))
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

    demand_slots = {
        (d, shid) for (_, d, shid), st in availability.items() if st in (AVAILABLE, PREFERRED)
    }
    assigned_slots = {(a["day_index"], a["shift_id"]) for a in assignments}
    uncovered = [
        {"day_index": d, "shift_id": shid} for (d, shid) in sorted(demand_slots - assigned_slots)
    ]

    return {"assignments": assignments, "uncovered": uncovered, "warnings": warnings, "info": info}
