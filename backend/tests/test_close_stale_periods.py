"""scripts/close_stale_periods.py closes only the weeks nobody else will.

The automatic close never ran on production (A13), so every week it should
have closed is still `collecting`. The script tidies those away: it flips a week
to `closed` and writes one activity_log line, with no solve and no email. These
pin which weeks it touches, because getting that wrong either leaves the
backlog in place or closes a week a person is still using:

* too late for the cycle, over, nothing assigned, not reopened: closed;
* anything the cycle can still close itself, anything under way or ahead,
  anything with shifts in it, and anything a manager reopened after its
  deadline: listed and left alone;
* a dry run, the default, reads and never writes;
* --apply refuses production without --i-know-this-is-production, before it
  even connects.

The venue has one Evening shift at 5pm and the default offsets, so each week's
deadline is the Friday before it at 11:00. "Now" is Wednesday 14 October 2026.
"""

import copy
import sys
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest

import database
from routers import cron
from services import reopen_log
from scripts import close_stale_periods as script
from services import schedule_windows
from tests.fake_supabase import FakeSupabase

NOW = datetime(2026, 10, 14, 10, 0)  # Wednesday; this week began Monday 12 Oct


def _period(week: str, venue_id: str = "v1", status: str = "collecting") -> dict:
    return {"id": f"p-{venue_id}-{week}", "venue_id": venue_id, "week_start": week, "status": status}


def _reopened(week: str, at_utc: str, venue_id: str = "v1", action: str = reopen_log.ACTION) -> dict:
    """Written by the app's own writer, so these tests read what a real reopen logs."""
    text = reopen_log.detail(week) if action == reopen_log.ACTION else f"Availability opened for week of {week}"
    return {
        "venue_id": venue_id,
        "action": action,
        "detail": text,
        "created_at": at_utc,
    }


def _tables() -> dict:
    return {
        "venues": [{"id": "v1", "name": "The Gatehouse"}, {"id": "v2", "name": "Quiet Bar"}],
        "scheduling_rules": [{"venue_id": "v1"}],
        # v2 has no shifts, so none of its weeks has a deadline.
        "shifts": [{"id": "evening", "venue_id": "v1", "start_time": "5:00pm", "end_time": "11:00pm"}],
        # The manager brought w/c 19 Oct's deadline forward to yesterday noon.
        "schedule_week_overrides": [{"venue_id": "v1", "week_start": "2026-10-19", "close_at": "2026-10-13T12:00:00"}],
        "availability_periods": [
            _period("2026-09-07", status="published"),
            _period("2026-09-14"),
            _period("2026-09-21"),
            _period("2026-09-28"),
            _period("2026-10-05"),
            _period("2026-10-12"),
            _period("2026-10-19"),
            _period("2026-10-26"),
            _period("2026-10-05", venue_id="v2"),
        ],
        "availability_submissions": [
            # Ada answered two shifts for w/c 21 Sep: one person, two rows.
            {"period_id": "p-v1-2026-09-21", "staff_id": "ada", "day_index": 4},
            {"period_id": "p-v1-2026-09-21", "staff_id": "ada", "day_index": 5},
            {"period_id": "p-v1-2026-09-28", "staff_id": "ada", "day_index": 0},
            {"period_id": "p-v1-2026-09-28", "staff_id": "ben", "day_index": 1},
        ],
        "rota_assignments": [
            {"id": "a1", "period_id": "p-v1-2026-09-28", "staff_id": "ada"},
            {"id": "a2", "period_id": "p-v1-2026-09-28", "staff_id": "ben"},
        ],
        "activity_log": [
            # Reopened on Thu 10 Sep, a day BEFORE its Fri 11 Sep deadline: the
            # deadline then passed with the week collecting, as normal.
            _reopened("2026-09-14", "2026-09-10T09:00:00+00:00"),
            # Reopened twice: once before its Fri 2 Oct deadline and once on
            # Sat 3 Oct, after it. The later one is a manager still collecting.
            _reopened("2026-10-05", "2026-10-01T09:00:00+00:00"),
            _reopened("2026-10-05", "2026-10-03T09:00:00+00:00"),
            # Neither of these is v1 reopening w/c 21 Sep.
            _reopened("2026-09-21", "2026-09-25T09:00:00+00:00", venue_id="v2"),
            _reopened("2026-09-21", "2026-09-25T09:00:00+00:00", action="availability_opened"),
        ],
    }


EXPECTED = {
    "close": [("v1", "2026-09-14"), ("v1", "2026-09-21")],
    "under_way": [("v1", "2026-10-12")],
    "has_rota": [("v1", "2026-09-28")],
    "reopened": [("v1", "2026-10-05")],
    "in_grace": [("v1", "2026-10-19")],
    "ahead": [("v1", "2026-10-26")],
    "no_window": [("v2", "2026-10-05")],
}


def _buckets(found: dict) -> dict:
    return {k: [(r["venue_id"], r["week_start"]) for r in rows] for k, rows in found.items()}


def _status(fake, venue_id: str, week: str) -> str:
    [row] = [p for p in fake.rows("availability_periods") if p["venue_id"] == venue_id and p["week_start"] == week]
    return row["status"]


@pytest.fixture(autouse=True)
def no_real_database(monkeypatch):
    """A test that reached for a real client would reach whatever .env points at."""

    def refuse(*_a, **_k):
        raise AssertionError("a close_stale_periods test reached for a real Supabase client")

    database.get_supabase.cache_clear()
    monkeypatch.setattr(database, "create_client", refuse)
    monkeypatch.setattr(script, "get_supabase", refuse)


# Which weeks -----------------------------------------------------------------


def test_every_collecting_week_is_sorted_and_only_one_kind_is_closed():
    fake = FakeSupabase(_tables())

    found = script.find_stale(fake, NOW)

    assert _buckets(found) == EXPECTED
    assert fake.wrote() == []


def test_what_each_listed_week_says_about_itself():
    found = script.find_stale(FakeSupabase(_tables()), NOW)
    rows = {(k, r["week_start"]): r for k, bucket in found.items() for r in bucket}

    # People, not rows: Ada answering two shifts is one submission.
    assert rows[("close", "2026-09-21")]["submitted"] == 1
    assert rows[("close", "2026-09-21")]["closes_at"] == datetime(2026, 9, 18, 11, 0)
    assert rows[("close", "2026-09-14")]["submitted"] == 0
    assert (rows[("has_rota", "2026-09-28")]["assigned"], rows[("has_rota", "2026-09-28")]["submitted"]) == (2, 2)
    # The reopen that counts is the one after the deadline, in London time.
    assert rows[("reopened", "2026-10-05")]["reopened_at"] == datetime(2026, 10, 3, 10, 0)
    assert rows[("in_grace", "2026-10-19")]["closes_at"] == datetime(2026, 10, 13, 12, 0)


def test_the_script_leaves_every_week_the_cycle_would_still_close():
    """For 48 hours past its deadline, and until its first shift, the cycle
    closes a week properly itself - solved, emailed - so the script must not
    tidy it away first. Both sides read schedule_windows.past_catch_up, so they
    change their minds at the same moment."""
    fake = FakeSupabase(_tables())
    schedule = script._schedules(fake, ["v1"])["v1"]
    period = {"week_start": "2026-10-19", "collecting_since": "2026-10-07T11:00:00+00:00"}
    window = cron._window_for(period, schedule)  # the override: Tue 13 Oct 12:00
    grace_ends = window["closes_at"] + timedelta(hours=48)

    just_before = grace_ends - timedelta(minutes=1)
    assert cron.classify_close(period, window, just_before) == "due"
    assert ("v1", "2026-10-19") in _buckets(script.find_stale(fake, just_before))["in_grace"]

    assert cron.classify_close(period, window, grace_ends) == "stale"
    assert ("v1", "2026-10-19") not in _buckets(script.find_stale(fake, grace_ends))["in_grace"]


# Closing ---------------------------------------------------------------------


def test_closing_flips_only_those_weeks_and_says_why():
    fake = FakeSupabase(_tables())
    found = script.find_stale(fake, NOW)
    others = [
        copy.deepcopy(p) for p in fake.rows("availability_periods") if p["week_start"] not in ("2026-09-14", "2026-09-21")
    ]

    closed = script.close_weeks(fake, found["close"])

    assert [(r["venue_id"], r["week_start"]) for r in closed] == EXPECTED["close"]
    assert _status(fake, "v1", "2026-09-14") == "closed"
    assert _status(fake, "v1", "2026-09-21") == "closed"
    assert [p for p in fake.rows("availability_periods") if p["week_start"] not in ("2026-09-14", "2026-09-21")] == others
    assert [(r["venue_id"], r["detail"]) for r in fake.rows("activity_log") if r["action"] == script.ACTION] == [
        (
            "v1",
            "Availability closed for week of 2026-09-14 as a tidy-up: its deadline (Friday 11 Sept, 11:00) "
            "passed without the automatic close running. No rota was built and nobody was emailed.",
        ),
        (
            "v1",
            "Availability closed for week of 2026-09-21 as a tidy-up: its deadline (Friday 18 Sept, 11:00) "
            "passed without the automatic close running. No rota was built and nobody was emailed.",
        ),
    ]
    # No solve, no email: nothing but the status flips and their log lines.
    assert fake.wrote() == [("update", "availability_periods"), ("insert", "activity_log")] * 2


def test_a_week_that_stopped_collecting_after_the_dry_run_is_left_as_it_is():
    """Between the dry run and --apply the manager built a rota for w/c 14 Sep.
    Their week is not overwritten, and nothing claims it was closed."""
    fake = FakeSupabase(_tables())
    found = script.find_stale(fake, NOW)
    [row] = [p for p in fake.rows("availability_periods") if p["id"] == "p-v1-2026-09-14"]
    row["status"] = "generated"

    closed = script.close_weeks(fake, found["close"])

    assert [r["week_start"] for r in closed] == ["2026-09-21"]
    assert _status(fake, "v1", "2026-09-14") == "generated"
    assert [r["detail"].split(" as a tidy-up")[0] for r in fake.rows("activity_log") if r["action"] == script.ACTION] == [
        "Availability closed for week of 2026-09-21"
    ]


# Running it -------------------------------------------------------------------

PROD_URL = f"https://{script.PROD_REF}.supabase.co"
STAGING_URL = "https://drgktpkctqoarxxjkezf.supabase.co"


def _run(monkeypatch, url: str, *args: str, fake=None) -> int:
    monkeypatch.setattr(script, "get_settings", lambda: SimpleNamespace(supabase_url=url))
    monkeypatch.setattr(schedule_windows, "now_london", lambda: NOW)
    monkeypatch.setattr(sys, "argv", ["close_stale_periods", *args])
    if fake is not None:
        monkeypatch.setattr(script, "get_supabase", lambda: fake)
    return script.main()


def test_it_will_not_change_production_by_accident(monkeypatch, capsys):
    # get_supabase is left refusing: the guard must stop it before it connects.
    assert _run(monkeypatch, PROD_URL, "--apply") == 2
    out = capsys.readouterr().out
    assert "*** PRODUCTION ***" in out
    assert "Refusing to change production" in out


def test_a_dry_run_reads_and_never_writes(monkeypatch, capsys):
    fake = FakeSupabase(_tables())

    assert _run(monkeypatch, PROD_URL, fake=fake) == 0

    assert fake.wrote() == []
    out = capsys.readouterr().out
    assert "Mode             : dry run" in out
    assert "Would close - too late for the cycle, week over, nothing assigned (2):" in out
    assert "reopened 2026-10-03 10:00" in out
    assert "Dry run - nothing changed." in out


@pytest.mark.parametrize(
    "url, args",
    [(STAGING_URL, ("--apply",)), (PROD_URL, ("--apply", "--i-know-this-is-production"))],
    ids=["staging", "production, confirmed"],
)
def test_apply_closes_the_weeks_it_listed(monkeypatch, capsys, url, args):
    fake = FakeSupabase(_tables())

    assert _run(monkeypatch, url, *args, fake=fake) == 0

    assert _status(fake, "v1", "2026-09-14") == "closed"
    assert _status(fake, "v1", "2026-09-21") == "closed"
    assert _status(fake, "v1", "2026-10-05") == "collecting"
    assert "Done: 2 closed." in capsys.readouterr().out


def test_the_reopen_reader_reads_what_the_reopen_writer_writes():
    """The script leaves a week alone only if it can read the week back out of
    the reopen line. A date object and PostgREST's ISO string both round-trip,
    and a line naming no week reads as None rather than as some other week."""
    assert reopen_log.week_of(reopen_log.detail("2026-09-14")) == "2026-09-14"
    assert reopen_log.week_of(reopen_log.detail(date(2026, 9, 14))) == "2026-09-14"
    assert reopen_log.week_of("Availability reopened") is None
    assert reopen_log.week_of(None) is None
