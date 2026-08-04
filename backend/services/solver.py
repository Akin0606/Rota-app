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


def shift_duration_hours(shift: dict) -> float:
    start = _parse_hour(shift["start_time"])
    end = _parse_hour(shift["end_time"])
    if end <= start:
        end += 24
    return end - start


def _rest_gap_hours(shift_a: dict, shift_b: dict) -> float:
    """Rest hours between the end of shift_a (day d) and start of shift_b (day d+1)."""
    end_a = _parse_hour(shift_a["end_time"])
    start_b = _parse_hour(shift_b["start_time"])
    return (24 - end_a) + start_b


def generate_rota(
    staff: list[dict],
    shifts: list[dict],
    submissions: list[dict],
    rules: dict,
) -> dict:
    """
    staff: [{id, ...}] active staff members
    shifts: [{id, name, start_time, end_time}]
    submissions: [{staff_id, day_index, shift_id, status}] (shift_id may be
        None for day-level notes — those are ignored here)
    rules: {max_hours_per_week, min_rest_hours}

    Returns {
        "assignments": [{"staff_id", "day_index", "shift_id"}],
        "uncovered": [{"day_index", "shift_id"}],
        "warnings": [str],
    }
    """
    max_hours = rules.get("max_hours_per_week", 48)
    min_rest = rules.get("min_rest_hours", 11)

    shifts_by_id = {sh["id"]: sh for sh in shifts}
    duration = {shid: shift_duration_hours(sh) for shid, sh in shifts_by_id.items()}

    availability: dict[tuple, int] = {}
    for sub in submissions:
        if sub.get("shift_id") is None:
            continue
        availability[(sub["staff_id"], sub["day_index"], sub["shift_id"])] = sub["status"]

    staff_ids = [s["id"] for s in staff]
    shift_ids = list(shifts_by_id.keys())

    model = cp_model.CpModel()

    x: dict[tuple, cp_model.IntVar] = {}
    for sid in staff_ids:
        for d in DAYS:
            for shid in shift_ids:
                if availability.get((sid, d, shid), 0) in (AVAILABLE, PREFERRED):
                    x[(sid, d, shid)] = model.NewBoolVar(f"x_{sid}_{d}_{shid}")

    # Hard: at most one shift per staff per day
    for sid in staff_ids:
        for d in DAYS:
            vars_today = [x[(sid, d, shid)] for shid in shift_ids if (sid, d, shid) in x]
            if vars_today:
                model.Add(sum(vars_today) <= 1)

    max_hours_scaled = int(round(max_hours * 10))

    # Hard: max hours per week (scaled x10 to keep everything integer)
    total_hours_vars = []
    for sid in staff_ids:
        terms = [
            int(round(duration[shid] * 10)) * x[(sid, d, shid)]
            for d in DAYS
            for shid in shift_ids
            if (sid, d, shid) in x
        ]
        total = model.NewIntVar(0, max_hours_scaled, f"hours_{sid}")
        model.Add(total == (sum(terms) if terms else 0))
        model.Add(total <= max_hours_scaled)
        total_hours_vars.append(total)

    # Hard: minimum rest between shifts on consecutive days
    for sid in staff_ids:
        for d in range(6):
            for shid_a in shift_ids:
                if (sid, d, shid_a) not in x:
                    continue
                for shid_b in shift_ids:
                    if (sid, d + 1, shid_b) not in x:
                        continue
                    gap = _rest_gap_hours(shifts_by_id[shid_a], shifts_by_id[shid_b])
                    if gap < min_rest:
                        model.Add(x[(sid, d, shid_a)] + x[(sid, d + 1, shid_b)] <= 1)

    # Objective: maximize weighted preference satisfaction, then softly
    # balance total hours across staff as a tie-breaker.
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
    model.Maximize(objective)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    status = solver.Solve(model)

    assignments = []
    warnings = []
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

    return {"assignments": assignments, "uncovered": uncovered, "warnings": warnings}
