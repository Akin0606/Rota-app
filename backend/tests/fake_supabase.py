"""An in-memory stand-in for the Supabase client, good enough for the router
query shapes this codebase actually uses.

Why this exists: every period picker, and every write path we need to pin
before the batch 2 consolidation, calls the module-level `get_supabase()` and
then chains `.table().select().eq().order().limit().execute()`. Without a fake
they are untestable, which is how five functions came to be rewired across nine
call sites with no coverage at all.

Two things to know before using it:

* Routers do `from database import get_supabase`, so the name to patch is the
  one bound *in the router module* — `routers.availability.get_supabase`, not
  `database.get_supabase`. `patch_supabase()` below does this for you.
* It is deliberately not a database. No joins, no constraints, no RLS. It
  models filtering, ordering, limiting and the four verbs, because that is what
  the code under test uses. If a test needs more than that, the test is
  reaching too far and wants a real integration run instead.
"""

from __future__ import annotations

import contextlib
import copy
import importlib
from typing import Any


class _Result:
    def __init__(self, data: list[dict] | dict | None):
        self.data = data


class _Query:
    """One chained query against one table. Every filter narrows `_rows`."""

    def __init__(self, store: "FakeSupabase", table: str):
        self._store = store
        self._table = table
        self._verb = "select"
        self._payload: Any = None
        self._filters: list = []
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None
        self._single = False

    # -- verbs ---------------------------------------------------------------
    def select(self, *_cols, **_kw):
        self._verb = "select"
        return self

    def insert(self, payload):
        self._verb = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._verb = "update"
        self._payload = payload
        return self

    def upsert(self, payload, **_kw):
        self._verb = "insert"
        self._payload = payload
        return self

    def delete(self):
        self._verb = "delete"
        return self

    # -- filters -------------------------------------------------------------
    def eq(self, col, val):
        self._filters.append(lambda r: r.get(col) == val)
        return self

    def neq(self, col, val):
        self._filters.append(lambda r: r.get(col) != val)
        return self

    def in_(self, col, vals):
        vals = list(vals)
        self._filters.append(lambda r: r.get(col) in vals)
        return self

    def is_(self, col, val):
        want = None if val in (None, "null") else val
        self._filters.append(lambda r: r.get(col) is want)
        return self

    def gt(self, col, val):
        self._filters.append(lambda r: r.get(col) is not None and r[col] > val)
        return self

    def gte(self, col, val):
        self._filters.append(lambda r: r.get(col) is not None and r[col] >= val)
        return self

    def lt(self, col, val):
        self._filters.append(lambda r: r.get(col) is not None and r[col] < val)
        return self

    def lte(self, col, val):
        self._filters.append(lambda r: r.get(col) is not None and r[col] <= val)
        return self

    # -- shaping -------------------------------------------------------------
    def order(self, col, desc: bool = False, **_kw):
        self._order = (col, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def single(self):
        self._single = True
        return self

    def maybe_single(self):
        self._single = True
        return self

    # -- run -----------------------------------------------------------------
    def _matching(self) -> list[dict]:
        rows = self._store.tables.setdefault(self._table, [])
        return [r for r in rows if all(f(r) for f in self._filters)]

    def execute(self) -> _Result:
        self._store.calls.append((self._verb, self._table))
        rows = self._store.tables.setdefault(self._table, [])

        if self._verb == "insert":
            payload = self._payload
            new = [copy.deepcopy(payload)] if isinstance(payload, dict) else [copy.deepcopy(r) for r in payload]
            for i, row in enumerate(new):
                row.setdefault("id", f"{self._table}-{len(rows) + i + 1}")
            rows.extend(new)
            return _Result(new)

        if self._verb == "update":
            hit = self._matching()
            for row in hit:
                row.update(copy.deepcopy(self._payload))
            return _Result([copy.deepcopy(r) for r in hit])

        if self._verb == "delete":
            hit = self._matching()
            ids = {id(r) for r in hit}
            self._store.tables[self._table] = [r for r in rows if id(r) not in ids]
            return _Result([copy.deepcopy(r) for r in hit])

        out = self._matching()
        if self._order:
            col, desc = self._order
            out = sorted(out, key=lambda r: (r.get(col) is None, r.get(col)), reverse=desc)
        if self._limit is not None:
            out = out[: self._limit]
        out = [copy.deepcopy(r) for r in out]
        if self._single:
            return _Result(out[0] if out else None)
        return _Result(out)


class FakeSupabase:
    """`tables` is {name: [row, ...]}; `calls` records (verb, table) in order,
    which is how a test asserts that a *read* path performed no writes."""

    def __init__(self, tables: dict[str, list[dict]] | None = None):
        self.tables: dict[str, list[dict]] = copy.deepcopy(tables or {})
        self.calls: list[tuple[str, str]] = []

    def table(self, name: str) -> _Query:
        return _Query(self, name)

    def rows(self, name: str) -> list[dict]:
        return self.tables.setdefault(name, [])

    def wrote(self) -> list[tuple[str, str]]:
        return [c for c in self.calls if c[0] in ("insert", "update", "delete")]


@contextlib.contextmanager
def patch_supabase(fake: FakeSupabase, *module_names: str):
    """Bind `fake` in place of get_supabase() inside the named modules.

    Patches the name where it is *used* — routers do `from database import
    get_supabase`, so patching database.get_supabase would have no effect on an
    already-imported router.
    """
    originals = []
    try:
        for name in module_names:
            mod = importlib.import_module(name)
            originals.append((mod, getattr(mod, "get_supabase")))
            setattr(mod, "get_supabase", lambda: fake)
        yield fake
    finally:
        for mod, original in originals:
            setattr(mod, "get_supabase", original)
