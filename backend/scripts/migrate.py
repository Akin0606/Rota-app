"""Migration runner.

Applies supabase/migrations/*.sql to the database at settings.database_url,
in filename order, tracked in a `schema_migrations` table.

WHERE THIS RUNS, AND WHY IT MATTERS
-----------------------------------
This used to run from the Docker entrypoint under `set -e`, immediately
before `exec uvicorn` — so a migration that could not be applied did not
degrade the API, it *deleted* it: no uvicorn, a crash-loop, `/health` gone.
Migration 027 took production down exactly that way, and on a transient
connection blip rather than a bad migration.

It now runs from Render's **pre-deploy command** (`backend/predeploy.sh`),
which executes on a separate instance after the build and before traffic
moves. A failure there fails the *deploy* while the last good instance keeps
serving. That is the whole point of the move: the same guarantee that a
half-migrated app never serves traffic, without the API being the thing that
dies when the database is briefly unreachable.

The entrypoint still calls this as a fallback for any service that has no
pre-deploy command configured (see entrypoint.sh), but it no longer blocks
the boot. Two runners therefore become possible, which is why the apply
phase takes an advisory lock.

Uses a direct psycopg2 connection only. Deliberately does not go through
the Supabase client/API in any way, so it has no dependency on Supabase
Management API access.

Usage:
    python -m scripts.migrate            # apply pending migrations
    python -m scripts.migrate --check    # report only; exit 1 if any pending
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import psycopg2

from config import get_settings

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent / "supabase" / "migrations"

# Migrations 001-009 were applied by hand in the Supabase SQL editor before
# this runner existed. Seeded once, only when schema_migrations is first
# created AND the database already looks migrated (see _looks_already_migrated)
# — never on a genuinely fresh database. 010 onward is left for the runner
# to apply for real, starting with 010_day_off_in_seven.sql.
BASELINE_APPLIED = [
    "001_initial_schema.sql",
    "002_venue_link_pin_auth.sql",
    "003_shift_fk_on_delete.sql",
    "004_waitlist.sql",
    "005_shift_staffing.sql",
    "006_availability_window_datetimes.sql",
    "007_venue_is_active.sql",
    "008_delete_cascades.sql",
    "009_notice_window.sql",
]

# A session-level advisory lock held across the apply phase, so two runners can
# never apply the same file twice. That race is new: with a pre-deploy step AND
# the entrypoint fallback, a service whose MIGRATE_ON_BOOT was never set could
# run both at once. Fixed 64-bit key, recorded here so it can be recomputed:
# zlib.crc32(b"rotally:schema_migrations").
MIGRATION_LOCK_KEY = 327870497

# Bounded retry around connect(). The 027 outage was a transient Supabase pool
# blip at boot, not a bad migration — psycopg2.connect raised, nothing caught
# it, and the process died. Retrying costs seconds and removes that whole class
# of failure wherever this runs.
CONNECT_ATTEMPTS = 5
CONNECT_BACKOFF_SECONDS = 2


def _connect(database_url: str):
    """Connect, retrying a few times on a transient failure.

    Re-raises the last error if every attempt fails — the caller decides
    whether that is fatal (pre-deploy: yes) or merely loud (boot fallback: no).
    """
    last: Exception | None = None
    for attempt in range(1, CONNECT_ATTEMPTS + 1):
        try:
            return psycopg2.connect(database_url)
        except Exception as exc:  # noqa: BLE001 - any connect failure is retryable
            last = exc
            if attempt < CONNECT_ATTEMPTS:
                wait = CONNECT_BACKOFF_SECONDS * attempt
                print(
                    f"[migrate] connect attempt {attempt}/{CONNECT_ATTEMPTS} failed "
                    f"({exc}); retrying in {wait}s",
                    file=sys.stderr,
                )
                time.sleep(wait)
    assert last is not None
    raise last


def _looks_already_migrated(cur) -> bool:
    """True if the app schema already exists (e.g. prod, hand-migrated
    before this runner existed). `venues` is the first table 001 creates,
    so its presence is a reliable marker."""
    cur.execute("select to_regclass('venues')")
    return cur.fetchone()[0] is not None


def _ensure_tracking_table(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("select to_regclass('schema_migrations')")
        if cur.fetchone()[0] is not None:
            return

        cur.execute(
            """
            create table schema_migrations (
                filename text primary key,
                applied_at timestamptz not null default now()
            )
            """
        )

        if _looks_already_migrated(cur):
            print(
                f"[migrate] existing schema detected — seeding baseline "
                f"({len(BASELINE_APPLIED)} files) as already-applied"
            )
            for name in BASELINE_APPLIED:
                cur.execute("insert into schema_migrations (filename) values (%s)", (name,))
        else:
            print("[migrate] fresh database — no baseline seeded, will apply migrations from 001")

    conn.commit()


def _applied_filenames(conn) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("select filename from schema_migrations")
        return {row[0] for row in cur.fetchall()}


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def pending_filenames(applied: set[str], files: list[Path] | None = None) -> list[str]:
    """Files on disk with no `schema_migrations` row, in filename order.

    A plain set difference, not a high-water mark — which is what makes an
    out-of-order history safe. Prod carries exactly that shape: the billing
    session applied 029 directly and skipped 028, so 028 and 030 are both
    still pending there and both apply, in sorted order, on the next run.
    """
    source = files if files is not None else migration_files()
    return [f.name for f in source if f.name not in applied]


def _acquire_lock(conn) -> None:
    with conn.cursor() as cur:
        # Postgres' own lock_timeout rather than a hand-rolled poll: if another
        # runner is mid-apply we wait briefly, then give up with a clear error.
        cur.execute("set lock_timeout = '60s'")
        cur.execute("select pg_advisory_lock(%s)", (MIGRATION_LOCK_KEY,))
    conn.commit()


def _apply_file(conn, path: Path) -> None:
    sql = path.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(sql)
        cur.execute("insert into schema_migrations (filename) values (%s)", (path.name,))
    conn.commit()


def _check(conn, files: list[Path]) -> int:
    """Report pending migrations without applying any. Returns an exit code."""
    applied = _applied_filenames(conn)
    pending = pending_filenames(applied, files)
    if not pending:
        print(f"[migrate] check: database is up to date ({len(applied)} applied)")
        return 0
    print(
        f"[migrate] check: {len(pending)} migration(s) PENDING: {', '.join(pending)}",
        file=sys.stderr,
    )
    return 1


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Apply pending database migrations.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="report pending migrations and exit 1 if any; apply nothing",
    )
    args = parser.parse_args(argv)

    settings = get_settings()
    files = migration_files()
    if not files:
        print(f"[migrate] no migration files found in {MIGRATIONS_DIR} — nothing to do")
        return

    conn = _connect(settings.database_url)
    conn.autocommit = False

    try:
        _ensure_tracking_table(conn)
    except Exception as exc:
        conn.rollback()
        conn.close()
        print(f"[migrate] FAILED setting up schema_migrations: {exc}", file=sys.stderr)
        sys.exit(1)

    if args.check:
        try:
            code = _check(conn, files)
        finally:
            conn.close()
        sys.exit(code)

    try:
        _acquire_lock(conn)
    except Exception as exc:
        conn.rollback()
        conn.close()
        print(f"[migrate] FAILED taking the migration lock: {exc}", file=sys.stderr)
        sys.exit(1)

    # Read the applied set *after* the lock, so a runner that waited sees what
    # the one ahead of it just committed instead of a stale list.
    applied = _applied_filenames(conn)
    pending = pending_filenames(applied, files)

    if not pending:
        print("[migrate] database is up to date — nothing to apply")
        conn.close()
        return

    for name in pending:
        path = MIGRATIONS_DIR / name
        print(f"[migrate] applying {name} ...")
        try:
            _apply_file(conn, path)
        except Exception as exc:
            conn.rollback()
            conn.close()
            print(f"[migrate] FAILED on {name}: {exc}", file=sys.stderr)
            sys.exit(1)
        print(f"[migrate] applied {name}")

    conn.close()
    print(f"[migrate] done — applied {len(pending)} migration(s): {', '.join(pending)}")


if __name__ == "__main__":
    main()
