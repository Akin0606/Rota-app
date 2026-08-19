# Build prompt — real per-day shift model

Sequenced implementation of the committed change: move the CP-SAT solver off the
hardcoded Day/Evening (17:00 split) model to **real per-day, per-venue shift
definitions**. Full audit + rationale in `SOLVER_AUDIT_PROMPT.md`; this file is
the ordered build plan. Work **one batch at a time, verify, then move on** (the
project's standing rule). Do not start Batch 3 until Batch 2 is proven.

---

## Ground rules for this work

- **`shift_days` is the model.** A new table carrying `(shift_id, day_index,
  start_time, end_time, min_staff, max_staff)`. Row present = shift runs that
  day; row absent = it doesn't. `shifts` stays the identity anchor (name, color,
  sort_order + the old single times as a **fallback** during migration).
- **One shared accessor, no exceptions.** Every read of a shift's hours/staffing
  goes through `bounds_for(shift, day_index)` / `staffing_for(shift, day_index)`
  (reads `shift_days`, falls back to `shifts.*`). After Batch 2, **no code reads
  `shift["end_time"]` directly** — grep-enforce it. This is the single highest-
  leverage discipline; a stray direct read is how a Friday 02:30 close emails the
  wrong time.
- **`"close"` dies here.** It is replaced by a real stored per-day time; keep the
  existing midnight unroll (`if end <= start: end += 24`). No new time type.
- **Compliance reads are atomic.** Batches 1–2 are behaviour-neutral and safe to
  ship alone. Batch 3 (the solver re-key: duration + night + rest + coverage +
  demand) ships as **one release** — never split the compliance-bearing reads
  (U18 night eligibility especially) from the data that corrects them.

---

## Batch 0 — safety net first (do before touching the solver)

**Add solver unit tests.** The solver is the highest-risk, compliance-bearing
code and has **zero coverage** today; refactoring it blind is the real danger.

- Add `backend/tests/test_solver.py` (pytest). Cover, on the *current* code, as a
  characterization baseline: `shift_duration_hours`, `_shift_touches_night_hours`,
  `_rest_gap_hours` across a midnight-crossing shift, and `check_manual_assignment`
  for each U18 hard-block + each adult confirm. Include a `"close"` case so the
  known-lossy `23.0` behaviour is pinned before it changes.
- Wire `pytest` into the backend dev deps if not present. Confirm green.

**Verify:** `pytest backend/tests -q` passes against unchanged solver code.
This baseline is what proves Batches 1–3 don't regress.

---

## Batch 1 — `shift_days` table + total backfill + shared accessor (fallback-only)

Behaviour-neutral. Nothing reads `shift_days` yet.

1. Migration `026_shift_days.sql`:
   ```sql
   create table if not exists shift_days (
       id uuid primary key default gen_random_uuid(),
       shift_id  uuid not null references shifts(id) on delete cascade,
       day_index integer not null check (day_index between 0 and 6),
       start_time text not null,
       end_time   text not null,
       min_staff  integer not null default 1,
       max_staff  integer not null default 2,
       unique (shift_id, day_index),
       check (min_staff >= 0 and max_staff >= 1 and max_staff >= min_staff)
   );
   create index if not exists idx_shift_days_shift_id on shift_days(shift_id);
   ```
2. **Total backfill in the same migration:** for every existing shift, insert 7
   rows (day_index 0–6) copying its `start_time`/`end_time`/`min_staff`/`max_staff`,
   `on conflict (shift_id, day_index) do nothing`. Resolve any `end_time = 'close'`
   to a concrete `'11:00pm'` (defensible — longer than today's silent 23.0, never
   shorter, so it cannot newly under-report) **and** flag those venues for the
   onboarding re-capture in Batch 5.
3. Shared accessor `backend/services/shift_bounds.py` (or extend `solver.py`):
   `bounds_for(shift, day_index, shift_days_by_key)` and
   `staffing_for(...)` — prefer the `shift_days` row, fall back to `shift.*`.
   `exists_on_day(shift_id, day_index, shift_days_by_key) -> bool`.

**Verify:** apply migration to prod Supabase via `python -m scripts.migrate`
(from `backend/`, ask first — it's a real schema change). Confirm every shift has
7 `shift_days` rows and none have `end_time = 'close'`. Solver output unchanged
(re-run Batch 0 tests + generate a rota, compare to before).

---

## Batch 2 — cutover every read path to the accessor (still fallback-identical)

No visible change; this just routes existing reads through the accessor so
Batch 3 has one place to change. Do the whole list or none — a half-cutover is
the half-migration hazard.

Touch each consumer from the audit §5:
- `services/solver.py` — `duration`/`touches_night` still computed, but via the
  accessor (still shift-level values, since backfill made all 7 days identical).
- `routers/rota.py` — `_build_summary` total_hours; coverage/uncovered.
- `services/rota_export.py` — `_cell_text` / `_build_matrix` take a day.
- `routers/rota.py` `_send_published_rota_emails` — per-day start/end.
- `frontend/lib/utils.ts` — `sumShiftHours` keyed by `(shift, day)`.
- `frontend/app/v/[venue_token]/availability/page.tsx` — render/label per day.
- prefill + auto-submit (`availability.py`, `cron.py`) — carry-forward aware of
  per-day existence.

**Verify:** rota numbers, PDF/Excel export, and rota emails are **byte-for-byte
unchanged** for the existing venue (all 7 days identical, so they must be). Grep
confirms no remaining direct `["end_time"]` / `["start_time"]` reads outside the
accessor. Batch 0 tests still green.

---

## Batch 3 — solver `(shift, day)` re-key (THE atomic, compliance-bearing release)

Ship as one release. This is where per-day actually takes effect.

1. Re-key `duration` and `touches_night` from `shid` to `(shid, day)` in
   `solver.py` (use sites: variable build, U18 warnings, weekly-cap terms, rest
   loop). Compute from `bounds_for(shift, day)`.
2. **Existence gate:** no `shift_days` row for `(shid, day)` → create no variable
   (same mechanism as the availability filter).
3. Rest gap uses day-specific bounds for both sides.
4. Coverage min/max read `staffing_for(shift, day)`.
5. `check_manual_assignment` gains day-aware bounds (it already receives
   `day_index`) — this propagates the fix to manual-add, claim, give, swap for
   free.
6. **Demand fix (G6):** build the demanded-slot set from *existing shift-days
   with min_staff > 0*, unioned with submitted-available slots — not from
   submissions alone.
7. Robustness (G5): make `_parse_hour` reject non-clock text safely (return a
   sentinel / raise a caught error) instead of a positional crash.

**Verify:** add tests for a synthetic late-night venue — Fri/Sat close 02:30,
Sun 22:30, Mon closed (no rows). Prove: duration correct across midnight; a U18
blocked from the Friday 02:30 close but *allowed* a legal Sunday evening; Monday
produces no variables/assignments; adult weekly hours count the real 9.5h not
6h. Drive `run_solver_for_period` directly with a resolved manager (Learnings
pattern) against a throwaway period — do **not** use the OTP UI.

---

## Batch 4 — manager per-day shift editor + time validation

Backend already accepts per-day after Batch 3; this exposes it.

- Shift editor UI: per-day hours (with a "same every day" shortcut and a
  per-day "closed" toggle that deletes/omits the `shift_days` row).
- Validate times on save (backend `shifts.py` + `shift_days` writes) — closes G5
  at the write path too.

**Verify:** create a shift that runs different hours on different days + one
closed day; confirm it round-trips and the solver honours it.

---

## Batch 5 — onboarding per-day capture (replaces the bridge)

- Rework the "When are you open?" step to capture per-day open/close (closed
  toggle + "same every day"), and have `persistShifts()` write `shift_days`
  directly instead of the hardcoded 17:00 Day/Evening split.
- Coverage step writes per-day `min_staff` on the evening shift-days.
- Prompt the venues flagged in Batch 1 (backfilled `'close'`) to re-enter real
  close times.

**Verify:** run the full onboarding walkthrough with a throwaway auth user; a
closed day emits no rows; entered times land in `shift_days`.

---

## Half-migration guards (check at each ship)

- Backfill must be **total** — never partial — so "no row" only ever means
  "manager deleted it" (closed day), never "not migrated yet."
- Data check before Batch 3: assert no `shift_days.end_time = 'close'` remains.
- Grep after Batch 2: no direct `["start_time"]`/`["end_time"]` reads outside the
  accessor.

---

## On finishing

Per the CLAUDE.md self-maintenance rule: after each batch, update **Current
state / Near-term / Before go-live** and append a Learnings entry. When the
model is fully live, move the "per-day shift model" line out of Near-term into
Roadmap → Done, and strike the `"close"` items in Before go-live / Known bugs.
