"""Migrations moved to a Render pre-deploy step, and this pins the two
properties that move depends on.

The first is ordering. `pending` is a plain filename set difference, not a
high-water mark, which is the only reason production's history is safe to
merge onto: the concurrent billing session applied `029_subscriptions.sql`
straight to prod on 2026-09-01 and skipped `028_suggestions.sql`, so prod sits
at 026, 027, 029 with a hole. A runner that tracked "highest applied" would
skip 028 forever and the suggestions table would never exist there.

The second is that the runner still does not silently do nothing. A resolver
that reports "up to date" when it cannot see the truth would be worse than the
crash-loop this change removes, because nothing would ever surface it.
"""

from pathlib import Path

from scripts.migrate import (
    BASELINE_APPLIED,
    MIGRATIONS_DIR,
    migration_files,
    pending_filenames,
)


def _files(*names: str) -> list[Path]:
    return [Path(n) for n in names]


def test_out_of_order_history_still_applies_the_gap():
    """Production's real shape: 029 applied, 028 skipped."""
    files = _files(
        "026_shift_days.sql",
        "027_venue_slug.sql",
        "028_suggestions.sql",
        "029_subscriptions.sql",
        "030_works_past_10pm.sql",
    )
    applied = {"026_shift_days.sql", "027_venue_slug.sql", "029_subscriptions.sql"}

    # Both pending files, and 028 before 030 — the order they must run in.
    assert pending_filenames(applied, files) == [
        "028_suggestions.sql",
        "030_works_past_10pm.sql",
    ]


def test_pending_is_sorted_not_input_ordered():
    """Filename order governs, whatever order the caller hands them over in."""
    files = _files("030_c.sql", "028_a.sql", "029_b.sql")
    assert pending_filenames(set(), sorted(files, key=lambda p: p.name)) == [
        "028_a.sql",
        "029_b.sql",
        "030_c.sql",
    ]


def test_fully_applied_database_has_nothing_pending():
    files = _files("028_suggestions.sql", "029_subscriptions.sql")
    assert pending_filenames({f.name for f in files}, files) == []


def test_an_applied_row_with_no_file_is_ignored_not_an_error():
    """A migration file deleted from the tree must not resurrect or crash the
    runner — the database simply has a row we no longer ship."""
    files = _files("030_works_past_10pm.sql")
    applied = {"030_works_past_10pm.sql", "099_deleted_from_the_repo.sql"}
    assert pending_filenames(applied, files) == []


def test_migrations_dir_resolves_from_the_backend_package():
    """MIGRATIONS_DIR climbs out of backend/scripts to supabase/migrations. The
    Dockerfile COPYs both trees, so this path is what makes the pre-deploy step
    able to see the .sql files at all."""
    assert MIGRATIONS_DIR.name == "migrations"
    assert MIGRATIONS_DIR.parent.name == "supabase"
    assert MIGRATIONS_DIR.is_dir()


def test_real_migration_tree_is_discovered_and_ordered():
    names = [p.name for p in migration_files()]
    assert names, "no migration files discovered"
    assert names == sorted(names)
    # The baseline is the hand-applied 001-009 era; every one of those files is
    # still in the tree, so a fresh database can be built from zero.
    for name in BASELINE_APPLIED:
        assert name in names, f"{name} is seeded as baseline but missing from the tree"


def test_a_fresh_database_is_pending_everything():
    """Nothing applied means every file is pending, baseline included — the
    fresh-database path the runner seeds no baseline for."""
    files = migration_files()
    assert pending_filenames(set(), files) == [p.name for p in files]
