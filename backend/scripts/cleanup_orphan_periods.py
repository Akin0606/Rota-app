"""Remove the phantom availability periods batch 2 stopped creating.

A3 and A4 close the two sources of phantoms. They do nothing about the ones
already in the database, and those keep causing the symptom: `planningPeriod()`
on the manager's Home takes the soonest upcoming week that still needs work, and
an empty `collecting` week two weeks out is exactly that. The manager is told
their next job is a week nobody has ever been asked about.

WHAT COUNTS AS A PHANTOM — all four must hold:

  1. status = 'collecting'
  2. no availability_submissions
  3. no rota_assignments
  4. an activity_log row saying "Availability opened for week of <week> (auto)"

Condition 4 is the load-bearing one. The real opener
(cron.open_availability_for_venue) logs the same sentence WITHOUT "(auto)"; only
the deleted `_get_or_create_current_period` and the submit-path helper added it.
That is what separates a phantom from a week a manager deliberately opened
ahead of time, which create_period permits up to four weeks out and which must
never be deleted. Conditions 2 and 3 then protect the submit-path helper, whose
periods always have a submission moments later.

The venue's current notice-window week is excluded outright regardless.

USAGE — dry run first, always:

    cd backend
    PYTHONPATH=. .venv/Scripts/python.exe -m scripts.cleanup_orphan_periods
    PYTHONPATH=. .venv/Scripts/python.exe -m scripts.cleanup_orphan_periods --apply

It prints which Supabase project it is pointed at before doing anything, and
refuses to --apply without --i-know-this-is-production when that project is the
production one. There is no undo.
"""

import argparse
import sys

from config import get_settings
from database import get_supabase
from services import period_resolver

PROD_REF = "ymmquszendtaflcslarf"
AUTO_MARKER = "(auto)"


def _project_ref(url: str) -> str:
    return url.split("//")[-1].split(".")[0]


def find_orphans(supabase) -> list[dict]:
    venues = supabase.table("venues").select("id, name, slug").execute().data or []
    orphans = []

    for venue in venues:
        current = period_resolver.collection_week(venue["id"])
        periods = (
            supabase.table("availability_periods")
            .select("*")
            .eq("venue_id", venue["id"])
            .eq("status", "collecting")
            .execute()
            .data
            or []
        )
        auto_weeks = {
            row["detail"].split("week of ")[-1].split(" ")[0]
            for row in (
                supabase.table("activity_log")
                .select("detail")
                .eq("venue_id", venue["id"])
                .eq("action", "availability_opened")
                .execute()
                .data
                or []
            )
            if AUTO_MARKER in (row.get("detail") or "")
        }

        for period in periods:
            week = str(period["week_start"])
            if current is not None and week == current.isoformat():
                continue
            if week not in auto_weeks:
                continue
            subs = (
                supabase.table("availability_submissions")
                .select("id")
                .eq("period_id", period["id"])
                .limit(1)
                .execute()
                .data
            )
            assigns = (
                supabase.table("rota_assignments")
                .select("id")
                .eq("period_id", period["id"])
                .limit(1)
                .execute()
                .data
            )
            if subs or assigns:
                continue
            orphans.append(
                {
                    "id": period["id"],
                    "venue": venue["name"],
                    "week_start": week,
                    "current_week": current.isoformat() if current else None,
                }
            )
    return orphans


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="actually delete (default is a dry run)")
    parser.add_argument("--i-know-this-is-production", action="store_true")
    args = parser.parse_args()

    url = get_settings().supabase_url
    ref = _project_ref(url)
    is_prod = ref == PROD_REF
    print(f"Supabase project : {ref}  {'*** PRODUCTION ***' if is_prod else '(non-production)'}")
    print(f"Mode             : {'APPLY (deletes rows)' if args.apply else 'dry run'}\n")

    if args.apply and is_prod and not args.i_know_this_is_production:
        print("Refusing to delete from production without --i-know-this-is-production.")
        return 2

    supabase = get_supabase()
    orphans = find_orphans(supabase)

    if not orphans:
        print("No orphan periods found.")
        return 0

    print(f"{len(orphans)} orphan period(s):\n")
    for o in orphans:
        print(f"  {o['venue']:<24} w/c {o['week_start']}   (window is on {o['current_week']})")

    if not args.apply:
        print("\nDry run — nothing deleted. Re-run with --apply to remove these.")
        return 0

    for o in orphans:
        supabase.table("availability_periods").delete().eq("id", o["id"]).execute()
        print(f"deleted {o['venue']} w/c {o['week_start']}")
    print(f"\nDone. {len(orphans)} removed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
