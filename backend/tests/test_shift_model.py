"""Batch 3 tests — the per-day shift model actually taking effect in the solver.

A synthetic late-night venue with ONE shift ("eve") whose hours differ by day:
    Fri (4) / Sat (5): 5:00pm -> 2:30am  (9.5h, crosses midnight, touches night)
    Sun (6):           2:00pm -> 10:00pm (8h, night-safe, ends on the boundary)
    Mon-Thu (0-3):     no shift_days row  -> closed, no shift runs

The shift's *shift-level* fallback is the old lossy "6:00pm -> close" (reads as
5h). These tests prove the per-day rows override it: real durations across
midnight, per-day U18 night eligibility, the closed-day existence gate, and
adult weekly hours counting the real 9.5h — none of which the single-time model
could express.
"""

from services.shift_bounds import (
    bounds_for,
    duration_for,
    exists_on_day,
    index_shift_days,
    touches_night_for,
)
from services.solver import check_manual_assignment, generate_rota

FRI, SAT, SUN, MON = 4, 5, 6, 0

# Shift-level fallback is deliberately the old lossy "close" (= 5h from 6pm),
# so any test reading the real per-day hours can't be accidentally passing off
# the fallback.
EVE = {
    "id": "eve",
    "name": "Evening",
    "start_time": "6:00pm",
    "end_time": "close",
    "min_staff": 1,
    "max_staff": 2,
    "color": "#333",
}


def _row(day_index, start, end, min_staff=1, max_staff=2):
    return {
        "shift_id": "eve",
        "day_index": day_index,
        "start_time": start,
        "end_time": end,
        "min_staff": min_staff,
        "max_staff": max_staff,
    }


# Fri/Sat late close, Sun night-safe evening, Mon-Thu absent (closed).
SHIFT_DAYS = index_shift_days(
    [
        _row(FRI, "5:00pm", "2:30am"),
        _row(SAT, "5:00pm", "2:30am"),
        _row(SUN, "2:00pm", "10:00pm"),
    ]
)

ADULT = {"id": "ad", "name": "Adult", "is_under_18": False}
U18 = {"id": "u18", "name": "Teen", "is_under_18": True}
RULES = {"max_hours_per_week": 48, "min_rest_hours": 11, "require_day_off": True}


# --------------------------------------------------------------------------- #
# Per-day duration / night / existence                                        #
# --------------------------------------------------------------------------- #

def test_duration_crosses_midnight_per_day():
    # Friday reads the real 9.5h, not the 5h "close" fallback.
    assert duration_for(EVE, FRI, SHIFT_DAYS) == 9.5
    assert duration_for(EVE, FRI, None) == 5.0  # fallback trap, for contrast


def test_sunday_is_shorter_and_night_safe():
    assert duration_for(EVE, SUN, SHIFT_DAYS) == 8.0
    assert touches_night_for(EVE, SUN, SHIFT_DAYS) is False
    assert touches_night_for(EVE, FRI, SHIFT_DAYS) is True


def test_bounds_unroll_across_midnight():
    # 5:00pm -> 2:30am unrolls to 17.0 -> 26.5.
    start, end = bounds_for(EVE, FRI, SHIFT_DAYS)
    assert (start, end) == ("5:00pm", "2:30am")


def test_closed_day_does_not_exist():
    assert exists_on_day(EVE, MON, SHIFT_DAYS) is False
    assert exists_on_day(EVE, FRI, SHIFT_DAYS) is True
    assert exists_on_day(EVE, SUN, SHIFT_DAYS) is True


# --------------------------------------------------------------------------- #
# check_manual_assignment — per-day U18 night eligibility                     #
# --------------------------------------------------------------------------- #

def test_u18_blocked_from_friday_late_close():
    res = check_manual_assignment(
        U18, FRI, EVE, [], {"eve": EVE}, RULES, shift_days_by_key=SHIFT_DAYS
    )
    assert res["severity"] == "block"


def test_u18_allowed_legal_sunday_evening():
    # Same shift, different day: Sunday's 8h night-safe evening is legal.
    res = check_manual_assignment(
        U18, SUN, EVE, [], {"eve": EVE}, RULES, shift_days_by_key=SHIFT_DAYS
    )
    assert res["severity"] == "ok"
    assert res["reason"] is None


def test_adult_weekly_hours_count_real_hours_not_fallback():
    # Fri already worked (9.5h); adding Sat (9.5h) = 19h, over a 15h cap.
    # The 5h "close" fallback would total only 10h and wrongly pass.
    rules = {**RULES, "max_hours_per_week": 15}
    others = [{"day_index": FRI, "shift_id": "eve"}]
    res = check_manual_assignment(
        ADULT, SAT, EVE, others, {"eve": EVE}, rules, shift_days_by_key=SHIFT_DAYS
    )
    assert res["severity"] == "confirm"
    assert "weekly limit" in res["reason"]
    assert "19.0h" in res["reason"]  # real hours, not the 10h fallback


# --------------------------------------------------------------------------- #
# generate_rota — existence gate + demand end to end                          #
# --------------------------------------------------------------------------- #

def _avail(staff_id, day):
    return {"staff_id": staff_id, "day_index": day, "shift_id": "eve", "status": 3}


def test_solver_closed_day_and_night_eligibility():
    # Both staff put themselves forward for Mon (closed), Fri (late), Sun (safe).
    submissions = [
        _avail("ad", MON), _avail("ad", FRI), _avail("ad", SUN),
        _avail("u18", MON), _avail("u18", FRI), _avail("u18", SUN),
    ]
    result = generate_rota(
        [ADULT, U18], [EVE], submissions, RULES, shift_days_by_key=SHIFT_DAYS
    )
    assignments = result["assignments"]

    # Monday is closed -> no variable, no assignment, ever.
    assert all(a["day_index"] != MON for a in assignments)

    # Friday's late close is night work -> only the adult can be there.
    assert all(a["staff_id"] == "ad" for a in assignments if a["day_index"] == FRI)

    # Sunday's night-safe evening is filled (coverage rewarded).
    assert any(a["day_index"] == SUN for a in assignments)


def test_solver_demand_from_shift_days_not_submissions():
    # Nobody is available on Saturday, but the shift runs (min_staff 1) -> it is
    # demanded and therefore surfaces as uncovered. Monday doesn't run at all,
    # so it is never demanded even though someone submitted for it.
    submissions = [_avail("ad", MON), _avail("ad", SUN)]
    result = generate_rota(
        [ADULT], [EVE], submissions, RULES, shift_days_by_key=SHIFT_DAYS
    )
    uncovered = {(u["day_index"], u["shift_id"]) for u in result["uncovered"]}

    assert (SAT, "eve") in uncovered      # runs, unstaffed -> uncovered
    assert (FRI, "eve") in uncovered      # runs, unstaffed -> uncovered
    assert (MON, "eve") not in uncovered  # closed day is never demanded


def test_solver_unreadable_time_is_skipped_not_crashed():
    junk = {**EVE, "id": "junk", "name": "Junk", "start_time": "banana", "end_time": "??"}
    # No shift_days rows for "junk" -> falls back to its (unparseable) columns.
    submissions = [{"staff_id": "ad", "day_index": SUN, "shift_id": "junk", "status": 3}]
    result = generate_rota([ADULT], [junk], submissions, RULES, shift_days_by_key={})
    # Solve completes; the junk shift is dropped with a warning rather than 500.
    assert any("unreadable time" in w for w in result["warnings"])
    assert all(a["shift_id"] != "junk" for a in result["assignments"])


# --------------------------------------------------------------------------- #
# Batch A — the manual paths get the same closed-day existence gate            #
# --------------------------------------------------------------------------- #

def test_manual_assignment_blocked_on_closed_day():
    # Monday has no shift_days row -> the shift doesn't run -> hard block, so a
    # manager's "+ Add", a claim, a give-accept or a swap can't land there.
    res = check_manual_assignment(
        ADULT, MON, EVE, [], {"eve": EVE}, RULES, shift_days_by_key=SHIFT_DAYS
    )
    assert res["severity"] == "block"
    assert "doesn't run on Monday" in res["reason"]


def test_manual_assignment_not_blocked_on_open_day_by_existence_gate():
    # Sunday runs (8h, night-safe) — the existence gate must not over-block it.
    res = check_manual_assignment(
        ADULT, SUN, EVE, [], {"eve": EVE}, RULES, shift_days_by_key=SHIFT_DAYS
    )
    assert res["severity"] == "ok"


def test_manual_assignment_no_index_keeps_old_behaviour():
    # With no shift_days index the gate is inert — every day is assumed to run,
    # exactly the pre-per-day model.
    res = check_manual_assignment(ADULT, MON, EVE, [], {"eve": EVE}, RULES)
    assert res["severity"] == "ok"


# --------------------------------------------------------------------------- #
# Batch A — _build_summary demand no longer counts closed-day submissions      #
# --------------------------------------------------------------------------- #

def test_submission_demand_slots_drops_closed_day():
    from routers.rota import _submission_demand_slots

    subs = [
        {"day_index": FRI, "shift_id": "eve", "status": 3},  # runs -> demand
        {"day_index": SUN, "shift_id": "eve", "status": 1},  # runs -> demand
        {"day_index": MON, "shift_id": "eve", "status": 3},  # closed -> dropped
        {"day_index": SAT, "shift_id": "eve", "status": 2},  # can't-work -> not demand
        {"day_index": FRI, "shift_id": "ghost", "status": 3},  # deleted shift -> kept
    ]
    slots = _submission_demand_slots(subs, {"eve": EVE}, SHIFT_DAYS)
    assert (FRI, "eve") in slots
    assert (SUN, "eve") in slots
    assert (MON, "eve") not in slots      # the phantom-gap fix
    assert (SAT, "eve") not in slots
    assert (FRI, "ghost") in slots        # unknown shift still counts (required=1)


# --------------------------------------------------------------------------- #
# Under-18 legal notes must survive a plain read, not only a solve             #
# --------------------------------------------------------------------------- #
# They used to be produced inside generate_rota and returned only on the
# generate response, so the manager's hard-legal-block panel was empty on every
# page load and every week change. These pin the extraction: the notes are a
# pure function of submitted availability, and the solver emits exactly the same
# set — so there is one definition and the panel can't say two different things.

def test_u18_notes_are_derivable_without_solving():
    from services.solver import under18_availability_notes

    # Available for the illegal Friday late-close and the legal Sunday evening.
    subs = [
        {"staff_id": "u18", "day_index": FRI, "shift_id": "eve", "status": 3},
        {"staff_id": "u18", "day_index": SUN, "shift_id": "eve", "status": 3},
    ]
    warnings, _info = under18_availability_notes(
        [U18], subs, [EVE], RULES, shift_days_by_key=SHIFT_DAYS
    )
    # Friday is 9.5h AND touches night; the daily-hours rule is checked first,
    # so that is the one named — the same order the solver applies.
    assert len(warnings) == 1, warnings
    assert "Friday" in warnings[0] and "8h daily limit" in warnings[0], warnings
    # Sunday's evening is night-safe and 8h, so it must NOT be flagged.
    assert "Sunday" not in warnings[0], warnings


def test_u18_notes_match_the_solvers_own_warnings():
    from services.solver import under18_availability_notes

    subs = [
        {"staff_id": "u18", "day_index": FRI, "shift_id": "eve", "status": 3},
        {"staff_id": "u18", "day_index": SAT, "shift_id": "eve", "status": 3},
        {"staff_id": "u18", "day_index": SUN, "shift_id": "eve", "status": 3},
    ]
    pure, _ = under18_availability_notes(
        [U18], subs, [EVE], RULES, shift_days_by_key=SHIFT_DAYS
    )
    solved = generate_rota(
        [U18], [EVE], subs, RULES, shift_days_by_key=SHIFT_DAYS
    )["warnings"]
    assert pure == solved
    assert pure  # and it actually said something


def test_u18_notes_stay_silent_for_an_adult():
    from services.solver import under18_availability_notes

    subs = [{"staff_id": "ad", "day_index": FRI, "shift_id": "eve", "status": 3}]
    warnings, info = under18_availability_notes(
        [ADULT], subs, [EVE], RULES, shift_days_by_key=SHIFT_DAYS
    )
    assert warnings == []
    assert info == []


def test_u18_notes_ignore_a_closed_day():
    from services.solver import under18_availability_notes

    # Monday has no shift_days row — the shift doesn't run, so availability for
    # it is not a legal problem, it's simply not a slot.
    subs = [{"staff_id": "u18", "day_index": MON, "shift_id": "eve", "status": 3}]
    warnings, _ = under18_availability_notes(
        [U18], subs, [EVE], RULES, shift_days_by_key=SHIFT_DAYS
    )
    assert warnings == []
