"""One-shot migration runner.

Applies supabase/migrations/*.sql to the database at settings.database_url,
in filename order, tracked in a `schema_migrations` table. Run from the
Docker entrypoint before uvicorn starts — a failed migration must block the
deploy rather than boot a half-migrated app, so any error here exits
non-zero and nothing after it runs.

Uses a direct psycopg2 connection only. Deliberately does not go through
the Supabase client/API in any way, so it has no dependency on Supabase
Management API access.
"""

from __future__ import annotations

import sys
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


def _apply_file(conn, path: Path) -> None:
    sql = path.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(sql)
        cur.execute("insert into schema_migrations (filename) values (%s)", (path.name,))
    conn.commit()


def main() -> None:
    settings = get_settings()
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        print(f"[migrate] no migration files found in {MIGRATIONS_DIR} — nothing to do")
        return

    conn = psycopg2.connect(settings.database_url)
    conn.autocommit = False

    try:
        _ensure_tracking_table(conn)
    except Exception as exc:
        conn.rollback()
        conn.close()
        print(f"[migrate] FAILED setting up schema_migrations: {exc}", file=sys.stderr)
        sys.exit(1)

    applied = _applied_filenames(conn)
    pending = [f for f in files if f.name not in applied]

    if not pending:
        print("[migrate] database is up to date — nothing to apply")
        conn.close()
        return

    for path in pending:
        print(f"[migrate] applying {path.name} ...")
        try:
            _apply_file(conn, path)
        except Exception as exc:
            conn.rollback()
            conn.close()
            print(f"[migrate] FAILED on {path.name}: {exc}", file=sys.stderr)
            sys.exit(1)
        print(f"[migrate] applied {path.name}")

    conn.close()
    print(f"[migrate] done — applied {len(pending)} migration(s): {', '.join(p.name for p in pending)}")


if __name__ == "__main__":
    main()
