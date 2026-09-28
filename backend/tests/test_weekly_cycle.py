"""The weekly cycle closes the week it names, at its deadline, and only then.

Until this batch the automatic close had never once run on production (A13).
At the exact moment week W closes, the notice window already names W+1, so the
close looked up a week that did not exist yet, did nothing, and returned
without re-arming anything: one missed close and the cycle stopped for good.
These pin the replacement:

* the close acts on the week it names, solves it, tells staff and the manager
  about that week, and opens the next;
* a close with nothing to do still re-arms the timers;
* a close missed by up to 48 hours still runs, never later than that, and never
  once the week's first shift has begun;
* every side effect is claimed with a guarded write first, so two runners
  never both send;
* the automatic reminder goes once, never after the deadline, and a manager's
  manual Remind does not cancel it;
* the tick reports counts only, and one broken venue cannot stop the rest.

The test venue has one Evening shift at 5pm and the default offsets, which
gives week W (w/c Mon 12 Oct 2026):

    opens      Sat  3 Oct 11:00
    reminder   Thu  8 Oct 11:00
    closes     Fri  9 Oct 11:00   (Mon 17:00, less 72h notice and a 6h buffer)
    1st shift  Mon 12 Oct 17:00

and W1 (w/c 19 Oct) opens Sat 10 Oct, reminds Thu 15 Oct and closes Fri 16 Oct,
all at 11:00. The clock is a London wall-clock value each test sets; the code
reads it through schedule_windows.now_london, as it does in production.
"""

import copy
import functools
import importlib
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from apscheduler.triggers.date import DateTrigger
from fastapi import FastAPI
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

import database
from models.schemas import RemindRequest
from routers import cron, rota
from routers import staff as staff_router
from services import cron_scheduler, email_service, notice_window, schedule_windows
from tests.fake_supabase import FakeSupabase

LONDON = schedule_windows.LONDON

VENUE_ID = "v1"
W, W1, W3 = "2026-10-12", "2026-10-19", "2026-11-02"

OPEN = datetime(2026, 10, 3, 11, 0)
REMIND = datetime(2026, 10, 8, 11, 0)
CLOSE = datetime(2026, 10, 9, 11, 0)
FIRST_SHIFT = datetime(2026, 10, 12, 17, 0)
W1_OPEN = datetime(2026, 10, 10, 11, 0)
W1_REMIND = datetime(2026, 10, 15, 11, 0)
W1_CLOSE = datetime(2026, 10, 16, 11, 0)

SECRET = "s3cret"

OPENED = "send_availability_open_email"
AUTO_SUBMITTED = "send_auto_submit_email"
CLOSED = "send_availability_closed_email"
REVIEW = "send_manager_review_email"
REMINDER = "send_availability_reminder_email"

# Every module on these paths that calls get_supabase(), patched where the name
# is bound (see fake_supabase.patch_supabase for why that matters).
MODULES = (
    "routers.cron",
    "routers.rota",
    "routers.staff",
    "routers.availability",
    "services.notice_window",
    "services.cron_scheduler",
    "services.auth_service",
)


def _utc(london: datetime) -> str:
    """A London wall-clock moment as the UTC timestamptz PostgREST returns."""
    return london.replace(tzinfo=LONDON).astimezone(timezone.utc).isoformat()


def _aware(london: datetime) -> datetime:
    return london.replace(tzinfo=LONDON)


def _email(name: str, venue_id: str = VENUE_ID) -> str:
    return f"{name.lower()}.{venue_id}@example.test"


def _period_id(week: str, venue_id: str = VENUE_ID) -> str:
    return f"p-{venue_id}-{week}"


def _period(week: str, venue_id: str = VENUE_ID, *, since: datetime) -> dict:
    return {
        "id": _period_id(week, venue_id),
        "venue_id": venue_id,
        "week_start": week,
        "status": "collecting",
        "collecting_since": _utc(since),
        "auto_reminder_sent_at": None,
    }


def _tables(*venue_ids: str) -> dict:
    """Identical venues, each with W collecting since its open. Ada has answered
    for W and Ben has not. Cal registered through the join link and is waiting
    for approval: active, but not on the roster the manager schedules."""
    tables: dict[str, list[dict]] = {
        name: []
        for name in (
            "venues",
            "scheduling_rules",
            "shifts",
            "schedule_week_overrides",
            "staff_members",
            "availability_periods",
            "availability_submissions",
            "rota_assignments",
            "activity_log",
        )
    }
    for vid in venue_ids or (VENUE_ID,):
        tables["venues"].append(
            {
                "id": vid,
                "name": "The Gatehouse",
                "link_token": f"gatehouse-{vid}",
                "manager_id": f"m-{vid}",
                "manager_email": _email("manager", vid),
                "setup_state": None,
                "is_active": True,
                "subscription_status": "active",
            }
        )
        tables["scheduling_rules"].append({"venue_id": vid})
        tables["shifts"].append(
            {"id": f"evening-{vid}", "venue_id": vid, "name": "Evening", "start_time": "5:00pm", "end_time": "11:00pm"}
        )
        for name, pending in (("Ada", False), ("Ben", False), ("Cal", True)):
            tables["staff_members"].append(
                {
                    "id": f"{name.lower()}-{vid}",
                    "venue_id": vid,
                    "name": name,
                    "email": _email(name, vid),
                    "pin": "1234",
                    "is_active": True,
                    "pending": pending,
                    "auto_submit_availability": False,
                }
            )
        tables["availability_periods"].append(_period(W, vid, since=OPEN))
        tables["availability_submissions"].append(
            {"period_id": _period_id(W, vid), "staff_id": f"ada-{vid}", "day_index": 4, "shift_id": f"evening-{vid}", "status": 3}
        )
    return tables


def _no_real_database(*_args, **_kwargs):
    raise AssertionError("a weekly-cycle test reached for a real Supabase client")


class Cycle:
    """The fake database, the clock, and a record of everything sent and
    solved. A test sets `now`, runs the cycle and reads back what happened."""

    def __init__(self, monkeypatch):
        self._mp = monkeypatch
        self.now = OPEN
        # What migration 033's column defaults fill in on a real insert: the
        # open writes neither column and relies on the database for both.
        self.defaults = {
            "availability_periods": {
                "collecting_since": lambda: _utc(self.now),
                "auto_reminder_sent_at": lambda: None,
            }
        }
        self.load(_tables())
        self.settings = SimpleNamespace(
            weekly_cycle_enabled=True, frontend_url="https://app.example.test", cron_secret=SECRET
        )
        self.sent: list[tuple[str, dict]] = []
        self.solved: list[tuple[str, str]] = []
        self.solver = "generated"
        self.scheduler = None

        monkeypatch.setattr(schedule_windows, "now_london", lambda: self.now)
        monkeypatch.setattr(cron, "get_settings", lambda: self.settings)
        monkeypatch.setattr(staff_router, "get_settings", lambda: self.settings)
        monkeypatch.setattr(cron, "run_solver_for_period", self._solve)
        for name in (OPENED, AUTO_SUBMITTED, CLOSED, REVIEW, REMINDER):
            monkeypatch.setattr(email_service, name, functools.partial(self._send, name))
        for module in MODULES:
            monkeypatch.setattr(importlib.import_module(module), "get_supabase", lambda: self.fake)
        # Belt and braces: anything on these paths that reaches for a real client
        # fails the test, rather than reaching whatever database .env points at.
        database.get_supabase.cache_clear()
        monkeypatch.setattr(database, "create_client", _no_real_database)
        monkeypatch.setattr(cron_scheduler, "_scheduler", None)

    def load(self, tables: dict, cls=FakeSupabase) -> None:
        self.fake = cls(tables, defaults=self.defaults)

    def _send(self, which: str, **kwargs) -> dict:
        self.sent.append((which, kwargs))
        return {"status": "sent"}

    def _solve(self, venue, period, *, note=""):
        """Stands in for run_solver_for_period: a solve that places people and
        moves the week to "generated" (the default), or a crash."""
        self.solved.append((venue["id"], str(period["week_start"])))
        if isinstance(self.solver, Exception):
            raise self.solver
        self.fake.table("availability_periods").update({"status": "generated"}).eq("id", period["id"]).execute()
        return {"status": "generated", "conflicts": 2}

    def emails(self, which: str) -> list[dict]:
        return [kwargs for name, kwargs in self.sent if name == which]

    def period(self, week: str, venue_id: str = VENUE_ID):
        rows = [
            p
            for p in self.fake.rows("availability_periods")
            if p["venue_id"] == venue_id and p["week_start"] == week
        ]
        assert len(rows) <= 1
        return rows[0] if rows else None

    def venue(self, venue_id: str = VENUE_ID) -> dict:
        return next(v for v in self.fake.rows("venues") if v["id"] == venue_id)

    def log(self, action=None) -> list[str]:
        return [r["detail"] for r in self.fake.rows("activity_log") if action is None or r["action"] == action]

    def start_timers(self) -> None:
        """A real scheduler, paused: jobs are armed exactly as in production but
        never run, so a test can read them back."""
        self.scheduler = cron_scheduler.new_scheduler()
        self.scheduler.start(paused=True)
        self._mp.setattr(cron_scheduler, "_scheduler", self.scheduler)

    def timers(self) -> dict:
        return {
            job.id: (job.args, job.next_run_time)
            for job in self.scheduler.get_jobs()
            if cron_scheduler._is_timer(job.id)
        }

    def freeze(self, module) -> None:
        """Point module.datetime.now() at this clock, for code that stamps a
        row with the real time rather than schedule_windows.now_london()."""
        cycle = self

        class Frozen(datetime):
            @classmethod
            def now(cls, tz=None):
                moment = cycle.now.replace(tzinfo=LONDON)
                return moment.astimezone(tz) if tz is not None else cycle.now

        self._mp.setattr(module, "datetime", Frozen)

    def close(self) -> None:
        if self.scheduler is not None:
            self.scheduler.shutdown(wait=False)
        cron_scheduler._catch_up_requested.clear()


@pytest.fixture
def cycle(monkeypatch):
    c = Cycle(monkeypatch)
    yield c
    c.close()


W1_TIMERS = {
    "open_v1": ((VENUE_ID, "open", W1), _aware(W1_OPEN)),
    "remind_v1": ((VENUE_ID, "remind", W1), _aware(W1_REMIND)),
    "close_v1": ((VENUE_ID, "close", W1), _aware(W1_CLOSE)),
}


# The close -------------------------------------------------------------------


def test_the_close_at_its_deadline_closes_that_week_and_opens_the_next(cycle):
    cycle.start_timers()
    cycle.now = CLOSE

    result = cron.run_due_all()

    assert result == {
        "opened": 1, "reminded": 0, "closed": 1, "confirmed": 0, "stale": 0, "errors": 0,
        "venues": 1, "enabled": True,
    }
    # W, the week it names - not the W1 the notice window names by now (A13).
    assert cycle.solved == [(VENUE_ID, W)]
    assert cycle.period(W)["status"] == "generated"
    assert cycle.log("availability_closed") == [f"Availability closed for week of {W}"]

    # Staff hear that W has locked; the manager hears what the solve made of W.
    locked = cycle.emails(CLOSED)
    assert {_email("Ada"), _email("Ben")} <= {e["to_email"] for e in locked}
    assert {e["week_label"] for e in locked} == {"w/c 12 Oct 2026"}
    assert cycle.emails(REVIEW) == [
        {
            "to_email": _email("manager"),
            "manager_name": "there",
            "venue_name": "The Gatehouse",
            "week_label": "w/c 12 Oct 2026",
            "submitted_count": 1,  # Ada, of Ada and Ben: Cal isn't on the roster yet
            "total_count": 2,
            "review_link_url": "https://app.example.test/rota",
            "conflicts": 2,
            "has_rota": True,
        }
    ]
    assert cycle.log("review_email_sent") == [f"Review email sent to manager for week of {W} (1/2 submitted)"]

    # W1 opens at once, so staff always have a week to fill...
    assert cycle.period(W1)["status"] == "collecting"
    assert {e["week_label"] for e in cycle.emails(OPENED)} == {"w/c 19 Oct 2026"}
    # ...and the timers point at W1 now, not at the week that has gone.
    assert cycle.timers() == W1_TIMERS


def test_a_week_the_manager_opened_ahead_is_left_alone(cycle):
    """Managers can open weeks up to four ahead. Closing W must not touch one:
    its deadline is weeks away."""
    cycle.fake.rows("availability_periods").append(_period(W3, since=datetime(2026, 10, 1, 9, 0)))
    before = copy.deepcopy(cycle.period(W3))
    cycle.now = CLOSE

    cron.run_due_all()

    assert cycle.solved == [(VENUE_ID, W)]
    assert cycle.period(W3) == before
    assert [d for d in cycle.log() if W3 in d] == []
    # Every email is about W (locked, reviewed) or W1 (opened) - none about W3.
    assert {e["week_label"] for _, e in cycle.sent} == {"w/c 12 Oct 2026", "w/c 19 Oct 2026"}


def test_a_solver_crash_does_not_stop_the_rest_of_the_close(cycle):
    """The steps of a close are independent: staff still hear the week has
    locked, the manager hears there is no rota yet, and W1 still opens."""
    cycle.solver = RuntimeError("solver crashed")
    cycle.now = CLOSE

    result = cron.run_due_all()

    assert (result["closed"], result["opened"], result["errors"]) == (1, 1, 1)
    assert cycle.period(W)["status"] == "closed"
    assert cycle.emails(CLOSED)
    [review] = cycle.emails(REVIEW)
    assert (review["has_rota"], review["conflicts"]) == (False, 0)
    assert cycle.period(W1)["status"] == "collecting"


# Re-arming -------------------------------------------------------------------

NOTHING_TO_DO = {
    "the week is already closed": lambda c: c.period(W).update(status="closed"),
    "the week does not exist": lambda c: c.fake.rows("availability_periods").clear(),
    "the venue is not entitled": lambda c: c.venue().update(subscription_status="cancelled"),
    "the switch is off": lambda c: setattr(c.settings, "weekly_cycle_enabled", False),
}


@pytest.mark.parametrize("state", NOTHING_TO_DO)
def test_a_close_timer_with_nothing_to_do_still_re_arms(cycle, state):
    """The old close re-armed only on its success path, and it never succeeded,
    so the first miss stopped the cycle for good. A timer that finds nothing to
    do now re-arms exactly like one that closed a week."""
    NOTHING_TO_DO[state](cycle)
    cycle.start_timers()
    cycle.now = CLOSE

    cron_scheduler._run_timer(VENUE_ID, "close", W)

    assert cycle.fake.wrote() == []
    assert cycle.solved == [] and cycle.sent == []
    assert cycle.timers() == W1_TIMERS


def test_a_timer_whose_run_fails_still_re_arms(cycle, monkeypatch):
    def fails(venue_id, **_kwargs):
        raise RuntimeError("connection pool exhausted")

    monkeypatch.setattr(cron, "run_due_for_venue_id", fails)
    cycle.start_timers()
    cycle.now = CLOSE

    cron_scheduler._run_timer(VENUE_ID, "close", W)

    assert cycle.timers() == W1_TIMERS


def test_timers_are_armed_for_the_week_they_belong_to(cycle):
    cycle.start_timers()
    cycle.now = datetime(2026, 10, 5, 9, 0)  # W has opened; its reminder and close are ahead

    cron_scheduler.refresh_jobs(arm_only=True)

    assert cycle.timers() == {
        "remind_v1": ((VENUE_ID, "remind", W), _aware(REMIND)),
        "close_v1": ((VENUE_ID, "close", W), _aware(CLOSE)),
    }


def test_re_arming_drops_unwanted_timers_but_never_one_that_is_due(cycle):
    """A timer whose moment has come is left to fire: removing it in the
    instant between falling due and running would lose it, and it checks
    everything again itself when it runs."""
    cycle.start_timers()
    cycle.now = datetime(2026, 10, 5, 9, 0)
    for kind, at in (("close", cycle.now - timedelta(minutes=1)), ("remind", cycle.now + timedelta(days=1))):
        cycle.scheduler.add_job(
            cron_scheduler._run_timer,
            trigger=DateTrigger(run_date=_aware(at)),
            args=["gone", kind, W],
            id=f"{kind}_gone",
        )

    cron_scheduler.refresh_jobs(arm_only=True)

    assert set(cycle.timers()) == {"remind_v1", "close_v1", "close_gone"}


def test_starting_up_reads_nothing_and_queues_a_catch_up(cycle, monkeypatch):
    """Startup must not depend on a connection pool that is often cold at boot:
    the catch-up runs off the startup path, on the scheduler's own thread."""
    scheduler = cron_scheduler.new_scheduler()
    monkeypatch.setattr(scheduler, "start", functools.partial(scheduler.start, paused=True))
    monkeypatch.setattr(cron_scheduler, "new_scheduler", lambda: scheduler)

    cron_scheduler.start_scheduler()
    try:
        assert cycle.fake.calls == []
        assert scheduler.get_job(cron_scheduler.CATCH_UP_JOB_ID) is not None
    finally:
        cron_scheduler.stop_scheduler()


def test_a_catch_up_asked_for_mid_run_runs_again(cycle, monkeypatch):
    """A request that lands while a catch-up is running cannot start a second
    job under the same id, so the running one goes round again instead of the
    request being lost."""
    runs = []

    def run_due_all():
        runs.append(None)
        if len(runs) == 1:
            cron_scheduler._catch_up_requested.set()  # what queue_catch_up does first

    monkeypatch.setattr(cron, "run_due_all", run_due_all)
    cron_scheduler._catch_up_requested.set()

    cron_scheduler._catch_up()

    assert len(runs) == 2


# How late a close may run ----------------------------------------------------


def test_a_close_missed_by_up_to_48_hours_still_runs(cycle):
    """A sleeping service wakes late. Within 48 hours of the deadline, and
    before the first shift, closing late still beats not closing."""
    cycle.now = CLOSE + timedelta(hours=47)

    result = cron.run_due_all()

    assert (result["closed"], result["stale"], result["errors"]) == (1, 0, 0)
    assert cycle.solved == [(VENUE_ID, W)]
    assert cycle.period(W1)["status"] == "collecting"


@pytest.mark.parametrize("hours_late", [48, 49])
def test_a_close_missed_by_48_hours_or_more_is_left_for_a_person(cycle, hours_late):
    """Past the grace, a rota solved and emailed now gives staff days less
    notice than the window promised. The week is counted as stale and nothing
    at all is written."""
    cycle.fake.rows("availability_periods").append(_period(W1, since=W1_OPEN))  # open by now, as it would be
    cycle.now = CLOSE + timedelta(hours=hours_late)

    result = cron.run_due_all()

    assert (result["closed"], result["stale"]) == (0, 1)
    assert cycle.fake.wrote() == []
    assert cycle.solved == [] and cycle.sent == []
    assert cycle.period(W)["status"] == "collecting"


def _late_override(cycle):
    """The manager moved W's deadline to Monday noon, five hours before the
    first shift - under the 72-hour warning, which the Scheduler lets a manager
    confirm through. That puts the whole 48-hour grace after the shift starts."""
    cycle.fake.rows("schedule_week_overrides").append(
        {"venue_id": VENUE_ID, "week_start": W, "close_at": "2026-10-12T12:00:00"}
    )


def test_a_late_override_still_closes_up_to_the_first_shift(cycle):
    _late_override(cycle)
    cycle.now = FIRST_SHIFT - timedelta(minutes=1)

    assert cron.run_due_all()["closed"] == 1
    assert cycle.solved == [(VENUE_ID, W)]


def test_a_late_override_is_not_closed_once_the_first_shift_has_started(cycle):
    _late_override(cycle)
    cycle.fake.rows("availability_periods").append(_period(W1, since=W1_OPEN))
    cycle.now = FIRST_SHIFT  # five hours past the deadline: inside 48h, but people are at work

    result = cron.run_due_all()

    assert (result["closed"], result["stale"]) == (0, 1)
    assert cycle.fake.wrote() == []
    assert cycle.sent == []


def test_a_week_the_manager_reopens_after_its_deadline_is_theirs_to_close(cycle, monkeypatch):
    cycle.now = CLOSE
    cron.run_due_all()
    assert cycle.period(W)["status"] == "generated"

    # An hour later the manager reopens it to take a late reply.
    cycle.now = CLOSE + timedelta(hours=1)
    cycle.freeze(rota)
    monkeypatch.setattr(rota, "_build_summary", lambda *_a, **_k: {})
    rota.reopen_availability(_period_id(W), manager={"id": f"m-{VENUE_ID}"})
    assert cycle.period(W)["status"] == "collecting"
    assert cycle.period(W)["collecting_since"] == _utc(CLOSE + timedelta(hours=1))

    cycle.now = CLOSE + timedelta(hours=2)
    sent = len(cycle.sent)
    result = cron.run_due_all()

    assert (result["closed"], result["stale"], result["reminded"]) == (0, 0, 0)
    assert cycle.period(W)["status"] == "collecting"
    assert cycle.solved == [(VENUE_ID, W)]  # the first close only
    assert len(cycle.sent) == sent


# Two runners at once ---------------------------------------------------------


def test_a_second_run_at_the_same_moment_changes_nothing(cycle):
    cycle.now = CLOSE
    cron.run_due_all()
    calls, sent = len(cycle.fake.calls), len(cycle.sent)

    result = cron.run_due_all()

    assert {k: result[k] for k in cron.COUNT_KEYS} == dict.fromkeys(cron.COUNT_KEYS, 0)
    assert [c for c in cycle.fake.calls[calls:] if c[0] != "select"] == []
    assert len(cycle.sent) == sent
    assert cycle.solved == [(VENUE_ID, W)]


def _window(period: dict) -> dict:
    return cron._window_for(period, notice_window.schedule_for_venue(VENUE_ID))


def test_the_runner_that_loses_the_close_does_nothing(cycle):
    """Two runners read W as collecting - on the free plan the tick is the
    request that wakes the service, so the tick and the boot catch-up start
    together - and the other one's update landed first."""
    stale_read = copy.deepcopy(cycle.period(W))
    cycle.period(W)["status"] = "closed"

    result = cron.close_week(cycle.venue(), stale_read, _window(stale_read), now=CLOSE)

    assert result == {"closed": False, "opened": False, "failed": []}
    assert [c for c in cycle.fake.calls if c[0] == "insert"] == []
    assert cycle.solved == [] and cycle.sent == []
    assert cycle.period(W)["status"] == "closed"


def test_the_runner_that_loses_the_reminder_sends_nothing(cycle):
    stale_read = copy.deepcopy(cycle.period(W))
    cycle.period(W)["auto_reminder_sent_at"] = _utc(REMIND)

    assert cron.send_due_reminder(cycle.venue(), stale_read, _window(stale_read), now=REMIND) is None
    assert cycle.sent == [] and cycle.log() == []


class RacingFake(FakeSupabase):
    """Another runner always inserts the week first, so our insert fails the
    way Postgres fails it."""

    def __init__(self, *args, code=cron.UNIQUE_VIOLATION, **kwargs):
        super().__init__(*args, **kwargs)
        self.code = code

    def table(self, name):
        query = super().table(name)
        if name == "availability_periods":
            run = query.execute

            def execute():
                if query._verb == "insert":
                    raise APIError({"code": self.code, "message": "insert failed", "details": "", "hint": ""})
                return run()

            query.execute = execute
        return query


def _w_already_done() -> dict:
    tables = _tables()
    tables["availability_periods"][0]["status"] = "generated"
    return tables


def test_losing_the_race_to_open_a_week_sends_nothing(cycle):
    cycle.load(_w_already_done(), cls=RacingFake)
    cycle.now = W1_OPEN

    result = cron.run_due_all()

    assert (result["opened"], result["errors"]) == (0, 0)
    assert cycle.sent == [] and cycle.log() == []


def test_any_other_insert_failure_is_an_error_not_a_lost_race(cycle):
    cycle.load(_w_already_done(), cls=functools.partial(RacingFake, code="42501"))
    cycle.now = W1_OPEN

    result = cron.run_due_all()

    assert (result["opened"], result["errors"]) == (0, 1)
    assert cycle.sent == []


# The automatic reminder ------------------------------------------------------


def test_the_automatic_reminder_goes_once(cycle):
    cycle.now = REMIND

    assert cron.run_due_all()["reminded"] == 1
    # Ada has answered and Cal isn't on the roster yet, so only Ben is chased,
    # about W and W's deadline.
    [reminder] = cycle.emails(REMINDER)
    assert reminder["to_email"] == _email("Ben")
    assert reminder["week_label"] == "w/c 12 Oct 2026"
    assert reminder["deadline_label"] == schedule_windows.format_deadline_dt(CLOSE)
    assert cycle.log("reminder_sent") == ["Reminded 1 of 1 staff who haven't submitted (automatic)"]

    cycle.now = REMIND + timedelta(hours=12)
    assert cron.run_due_all()["reminded"] == 0
    assert len(cycle.emails(REMINDER)) == 1


def test_a_reminder_the_service_slept_through_is_never_sent_after_the_deadline(cycle):
    cycle.now = CLOSE + timedelta(hours=1)

    cron.run_due_all()

    assert cycle.emails(REMINDER) == []
    assert cycle.period(W)["auto_reminder_sent_at"] is None


def test_a_manual_remind_does_not_cancel_the_automatic_one(cycle):
    """A manager chasing mid-week is not the automatic reminder, so Ben is
    asked again the day before the deadline."""
    cycle.now = REMIND - timedelta(days=2)
    staff_router.remind(RemindRequest(period_id=_period_id(W)), manager={"id": f"m-{VENUE_ID}"})
    assert [e["to_email"] for e in cycle.emails(REMINDER)] == [_email("Ben")]
    assert cycle.period(W)["auto_reminder_sent_at"] is None

    cycle.now = REMIND
    assert cron.run_due_all()["reminded"] == 1
    assert [e["to_email"] for e in cycle.emails(REMINDER)] == [_email("Ben")] * 2


def test_a_week_opened_after_its_reminder_moment_gets_no_automatic_reminder(cycle):
    """The service slept through W's open, so the catch-up opens it after the
    reminder moment. Staff have just been asked; "you haven't replied" minutes
    later would be wrong."""
    cycle.fake.rows("availability_periods").clear()
    cycle.now = REMIND + timedelta(hours=2)
    assert cron.run_due_all()["opened"] == 1
    assert cycle.period(W)["collecting_since"] == _utc(REMIND + timedelta(hours=2))

    cycle.now = REMIND + timedelta(hours=3)
    assert cron.run_due_all()["reminded"] == 0
    assert cycle.emails(REMINDER) == []


def test_the_switch_holds_back_the_automatic_reminder_too(cycle):
    cycle.settings.weekly_cycle_enabled = False
    cycle.now = REMIND

    assert cron.run_due_all()["reminded"] == 0
    assert cycle.sent == []
    assert cycle.period(W)["auto_reminder_sent_at"] is None


# The tick --------------------------------------------------------------------


def _tick(secret=SECRET):
    app = FastAPI()
    app.include_router(cron.router)
    headers = {} if secret is None else {"X-Cron-Secret": secret}
    return TestClient(app).post("/api/cron/tick", headers=headers)


@pytest.mark.parametrize("secret", [None, "", "wrong"])
def test_the_tick_is_refused_without_the_secret(cycle, secret):
    assert _tick(secret).status_code == 401
    assert cycle.fake.calls == []


def test_the_tick_reports_counts_and_nothing_else(cycle):
    """The caller is a GitHub Actions job whose logs are public: the response
    says how many, never which."""
    cycle.now = CLOSE

    res = _tick()

    assert res.status_code == 200
    body = res.json()
    assert set(body) == set(cron.COUNT_KEYS) | {"venues", "enabled"}
    assert (body["closed"], body["opened"], body["venues"], body["enabled"]) == (1, 1, 1, True)
    for private in ("gatehouse", "Gatehouse", "example.test", _period_id(W)):
        assert private not in res.text


def test_one_broken_venue_fails_the_tick_but_not_the_other_venues(cycle, monkeypatch):
    cycle.load(_tables("v1", "v2"))
    run = cron.run_due_for_venue

    def v1_is_broken(venue, **kwargs):
        if venue["id"] == "v1":
            raise RuntimeError("v1 is broken")
        return run(venue, **kwargs)

    monkeypatch.setattr(cron, "run_due_for_venue", v1_is_broken)
    cycle.now = CLOSE

    res = _tick()

    assert res.status_code == 500
    body = res.json()
    assert (body["errors"], body["closed"], body["venues"]) == (1, 1, 2)
    assert cycle.period(W, "v1")["status"] == "collecting"
    assert cycle.period(W, "v2")["status"] == "generated"


def test_a_tick_that_cannot_even_list_the_venues_is_a_500(cycle, monkeypatch):
    def unreachable():
        raise RuntimeError("database unreachable")

    monkeypatch.setattr(cron, "_all_venues", unreachable)

    res = _tick()

    assert res.status_code == 500
    assert res.json() == {"errors": 1, "enabled": True}
