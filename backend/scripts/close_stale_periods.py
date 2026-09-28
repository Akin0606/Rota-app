"""Close the past availability weeks the automatic cycle will never close itself.

The weekly cycle (routers/cron.py) closes a week at its deadline, or up to
CATCH_UP_GRACE later if the service slept through the moment, and never after
that: a rota solved and emailed days late gives staff far less notice than the
window exists to guarantee. Until it was fixed it closed nothing at all (A13),
so every week it should have closed is still `collecting` - editable to staff,
with nothing ever going to happen to it.

This flips those weeks to `closed` and does nothing else: no solve, no email,
one activity_log line per week so the manager can see what happened and why.
Reopening the week from the app undoes it.

WHAT IT CLOSES - all of these must hold:

  1. status = 'collecting'
  2. it is too late for the cycle: the deadline passed more than
     CATCH_UP_GRACE ago, or the week's first shift has begun. This is
     schedule_windows.past_catch_up, the cycle's own rule, so a week this
     leaves alone for that reason is one the cycle can still close.
  3. the week is over. A week that is under way, or still ahead, is left
     alone and listed: closed and rota-less, it would become the manager's
     "next job" on Home in place of the week actually collecting, and a week
     still ahead with no rota is something a person needs to see, not a row
     to tidy away.
  4. no rota_assignments. A week with shifts in it is someone's work; listed
     and left alone.
  5. not reopened by the manager after its deadline. That is a manager saying
     "I am still collecting for this week"; listed and left alone.

A venue with no shifts has no deadline to measure, so its weeks are listed and
left alone.

USAGE - dry run first, always:

    cd backend
    PYTHONPATH=. .venv/Scripts/python.exe -m scripts.close_stale_periods
    PYTHONPATH=. .venv/Scripts/python.exe -m scripts.close_stale_periods --apply

It prints which Supabase project it is pointed at before doing anything, and
refuses to --apply without --i-know-this-is-production when that project is the
production one.
"""

import argparse
import sys
from datetime import date, datetime
from typing import Optional

from config import get_settings
from database import get_supabase
from services import notice_window, reopen_log, schedule_windows

PROD_REF = "ymmquszendtaflcslarf"
ACTION = "availability_closed_stale"

BUCKETS = ("close", "under_way", "has_rota", "reopened", "in_grace", "ahead", "no_window")


def _project_ref(url: str) -> str:
    return url.split("//")[-1].split(".")[0]


def _as_london(value) -> Optional[datetime]:
    """A timestamptz read back from PostgREST, as naive London wall-clock."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(schedule_windows.LONDON).replace(tzinfo=None)


def _schedules(supabase, venue_ids: list[str]) -> dict[str, Optional[dict]]:
    """{venue_id: schedule}, built the way the cycle builds it, from three reads
    however many venues there are."""
    rules_rows = supabase.table("scheduling_rules").select("*").execute().data or []
    shift_rows = supabase.table("shifts").select("venue_id, start_time").execute().data or []
    override_rows = (
        supabase.table("schedule_week_overrides").select("venue_id, week_start, close_at").execute().data or []
    )
    rules_by_venue = {r["venue_id"]: r for r in rules_rows}
    shifts_by_venue: dict[str, list[dict]] = {}
    for row in shift_rows:
        shifts_by_venue.setdefault(row["venue_id"], []).append(row)
    overrides_by_venue: dict[str, list[dict]] = {}
    for row in override_rows:
        overrides_by_venue.setdefault(row["venue_id"], []).append(row)
    return {
        vid: notice_window.schedule_from(
            rules_by_venue.get(vid, {}),
            shifts_by_venue.get(vid, []),
            notice_window.overrides_map(overrides_by_venue.get(vid, [])),
        )
        for vid in venue_ids
    }


def _reopens(supabase, venue_id: str) -> dict[str, list[datetime]]:
    """{week_start: [each time the manager reopened it]}, from the audit log
    rather than collecting_since: migration 033 stamped every existing row with
    the moment it ran, so for a week reopened before then the log is the only
    record of when."""
    rows = (
        supabase.table("activity_log")
        .select("detail, created_at")
        .eq("venue_id", venue_id)
        .eq("action", reopen_log.ACTION)
        .execute()
        .data
        or []
    )
    out: dict[str, list[datetime]] = {}
    for row in rows:
        week = reopen_log.week_of(row.get("detail"))
        at = _as_london(row.get("created_at"))
        if week and at:
            out.setdefault(week, []).append(at)
    return out


def find_stale(supabase, now: datetime) -> dict[str, list[dict]]:
    """Every collecting week, sorted by what this would do with it. Reads only.

    close      too late for the cycle, over, nothing assigned, not reopened
    under_way  too late for the cycle, but the week has not ended yet
    has_rota   too late for the cycle, but shifts are already assigned
    reopened   too late for the cycle, but reopened after its deadline
    in_grace   deadline passed, but recently enough that the cycle closes it
    ahead      deadline still to come
    no_window  the venue has no shifts, so there is no deadline to measure
    """
    found: dict[str, list[dict]] = {k: [] for k in BUCKETS}
    venues = supabase.table("venues").select("id, name").execute().data or []
    names = {v["id"]: v["name"] for v in venues}
    schedules = _schedules(supabase, list(names))
    this_monday = schedule_windows.monday_of(now.date())

    periods = (
        supabase.table("availability_periods")
        .select("*")
        .eq("status", "collecting")
        .order("week_start")
        .execute()
        .data
        or []
    )
    reopens_by_venue: dict[str, dict[str, list[datetime]]] = {}

    for period in periods:
        venue_id = period["venue_id"]
        week = str(period["week_start"])
        row = {"id": period["id"], "venue_id": venue_id, "venue": names.get(venue_id, venue_id), "week_start": week}

        schedule = schedules.get(venue_id)
        if not schedule:
            found["no_window"].append(row)
            continue
        window = schedule_windows.week_window(date.fromisoformat(week), **schedule)
        row["closes_at"] = window["closes_at"]
        if not schedule_windows.past_catch_up(window, now):
            found["ahead" if now < window["closes_at"] else "in_grace"].append(row)
            continue
        if date.fromisoformat(week) >= this_monday:
            found["under_way"].append(row)
            continue

        row["assigned"] = len(
            supabase.table("rota_assignments").select("id").eq("period_id", period["id"]).execute().data or []
        )
        row["submitted"] = len(
            {
                r["staff_id"]
                for r in (
                    supabase.table("availability_submissions")
                    .select("staff_id")
                    .eq("period_id", period["id"])
                    .execute()
                    .data
                    or []
                )
            }
        )
        if row["assigned"]:
            found["has_rota"].append(row)
            continue

        if venue_id not in reopens_by_venue:
            reopens_by_venue[venue_id] = _reopens(supabase, venue_id)
        late = [at for at in reopens_by_venue[venue_id].get(week, []) if at >= window["closes_at"]]
        if late:
            row["reopened_at"] = max(late)
            found["reopened"].append(row)
            continue

        found["close"].append(row)

    return found


def close_weeks(supabase, weeks: list[dict]) -> list[dict]:
    """Close each week, if it is still collecting, and log it. The update is
    guarded like the cycle's own close: a week that stopped collecting after it
    was found (someone built a rota, or reopened and closed it) is skipped
    rather than overwritten, and only a week actually closed here is logged."""
    closed = []
    for week in weeks:
        won = (
            supabase.table("availability_periods")
            .update({"status": "closed"})
            .eq("id", week["id"])
            .eq("venue_id", week["venue_id"])
            .eq("status", "collecting")
            .execute()
            .data
        )
        if not won:
            continue
        deadline = schedule_windows.format_deadline_dt(week["closes_at"])
        supabase.table("activity_log").insert(
            {
                "venue_id": week["venue_id"],
                "action": ACTION,
                "detail": (
                    f"Availability closed for week of {week['week_start']} as a tidy-up: its deadline "
                    f"({deadline}) passed without the automatic close running. No rota was built and "
                    "nobody was emailed."
                ),
            }
        ).execute()
        closed.append(week)
    return closed


def _line(row: dict, extra: str = "") -> str:
    deadline = schedule_windows.format_deadline_dt(row.get("closes_at")) or "-"
    return f"  {row['venue']:<24} w/c {row['week_start']}   deadline {deadline:<22}{extra}"


def _report(found: dict[str, list[dict]]) -> None:
    sections = [
        ("close", "Would close - too late for the cycle, week over, nothing assigned",
         lambda r: f"   {r['submitted']} submitted"),
        ("has_rota", "Left alone - shifts already assigned",
         lambda r: f"   {r['assigned']} assigned, {r['submitted']} submitted"),
        ("reopened", "Left alone - reopened by the manager after its deadline",
         lambda r: f"   reopened {r['reopened_at']:%Y-%m-%d %H:%M}"),
        ("under_way", "Left alone - too late for the cycle, but the week is under way or ahead",
         lambda r: ""),
        ("in_grace", "Left alone - deadline just passed; the cycle closes these itself when switched on",
         lambda r: ""),
        ("ahead", "Left alone - deadline still to come", lambda r: ""),
        ("no_window", "Left alone - venue has no shifts, so no deadline", lambda r: ""),
    ]
    for i, (key, title, extra) in enumerate(sections):
        if i:
            print()
        print(f"{title} ({len(found[key])}):")
        for row in found[key]:
            print(_line(row, extra(row)))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="actually close the weeks (default is a dry run)")
    parser.add_argument("--i-know-this-is-production", action="store_true")
    args = parser.parse_args()

    ref = _project_ref(get_settings().supabase_url)
    is_prod = ref == PROD_REF
    now = schedule_windows.now_london()
    print(f"Supabase project : {ref}  {'*** PRODUCTION ***' if is_prod else '(non-production)'}")
    print(f"Mode             : {'APPLY (closes weeks)' if args.apply else 'dry run'}")
    print(f"Now (London)     : {now:%Y-%m-%d %H:%M}\n")

    if args.apply and is_prod and not args.i_know_this_is_production:
        print("Refusing to change production without --i-know-this-is-production.")
        return 2

    supabase = get_supabase()
    found = find_stale(supabase, now)
    _report(found)

    if not args.apply:
        print("\nDry run - nothing changed. Re-run with --apply to close the weeks under 'Would close'.")
        return 0

    closed = close_weeks(supabase, found["close"])
    print()
    for row in closed:
        print(f"closed {row['venue']} w/c {row['week_start']}")
    skipped = len(found["close"]) - len(closed)
    tail = f", {skipped} stopped collecting before they could be closed" if skipped else ""
    print(f"\nDone: {len(closed)} closed{tail}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
