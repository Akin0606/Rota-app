"""The activity_log line a manager's "reopen availability" writes, and the
reader that gets the week back out of it.

routers/rota.reopen_availability writes it. scripts/close_stale_periods reads
it, to leave alone a week the manager reopened after its deadline. The script
can't use collecting_since for that: migration 033 stamped every existing row
with the moment it ran, so for a reopen before 033 this line is the only record
of when. Writer and reader live together so the wording can't drift away from
the parser, because a reopen the reader misses is a week the script closes."""

import re
from typing import Optional

ACTION = "availability_reopened"

_WEEK = re.compile(r"week of (\d{4}-\d{2}-\d{2})")


def detail(week_start) -> str:
    return f"Availability reopened for week of {week_start}"


def week_of(text: Optional[str]) -> Optional[str]:
    """The ISO week_start a reopen line names, or None if it names none."""
    match = _WEEK.search(text or "")
    return match.group(1) if match else None
