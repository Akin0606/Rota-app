"""UK date formatting shared across emails, exports and API labels.

Python's ``strftime('%b')`` abbreviates September as "Sep", but en-GB (and the
Rotally frontend, which uses ``toLocaleDateString('en-GB', {month:'short'})``)
abbreviates it "Sept". Every other month matches ``%b``. Routing every
user-facing week/day label through here keeps "Sept" consistent everywhere —
email subjects, rota exports and the scheduler week picker — instead of the
backend saying "Sep" while the app UI says "Sept" (COPY-1).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Union

_DateLike = Union[date, datetime]


def uk_month(d: _DateLike) -> str:
    """en-GB short month name — 'Sept' for September, else the same as %b."""
    return "Sept" if d.month == 9 else d.strftime("%b")


def uk_date(d: _DateLike, with_year: bool = True) -> str:
    """e.g. '14 Sept 2026' (with_year) or '14 Sept'. Zero-padded day, like %d."""
    base = f"{d.strftime('%d')} {uk_month(d)}"
    return f"{base} {d.year}" if with_year else base
