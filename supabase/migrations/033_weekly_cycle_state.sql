-- Two facts the automatic weekly cycle needs to keep about each week.
--
-- auto_reminder_sent_at: when the automatic "you haven't sent your availability
-- yet" reminder went out for this week. The cycle claims it with a guarded
-- update (... where auto_reminder_sent_at is null and status = 'collecting')
-- BEFORE any email is sent, and only the runner that gets a row back sends.
-- The close needs no column like this -- its status change is the record -- but
-- a reminder has no status to change, and activity_log can't do the job: it has
-- no uniqueness, and a check-then-insert races. That race is real here: on
-- Render's free plan the hourly tick is the request that wakes the service, so
-- the boot catch-up and the tick run at the same moment. A manager's manual
-- Remind deliberately does not set it, so a mid-week chase doesn't cancel the
-- automatic one 24 hours before the deadline.
--
-- collecting_since: when this period last entered 'collecting' -- when it was
-- created, or when a manager reopened it. The automatic close only takes a week
-- that was already collecting when its deadline passed, so a week a manager
-- reopened after its deadline stays theirs to close. Existing rows get the time
-- this migration runs, which takes every week that is already collecting past
-- its deadline off autopilot on purpose: that backlog is closed by a person or
-- by scripts/close_stale_periods.py, never as a side effect of a deploy.
alter table availability_periods
  add column if not exists auto_reminder_sent_at timestamptz,
  add column if not exists collecting_since timestamptz not null default now();

comment on column availability_periods.auto_reminder_sent_at is
  'When the automatic availability reminder was sent for this week. Claimed '
  'with a guarded update before sending, so it goes at most once. Manual '
  'reminders do not set it.';

comment on column availability_periods.collecting_since is
  'When this period last entered collecting (creation or a manager reopen). '
  'The automatic close only takes a week that was collecting before its '
  'deadline passed.';
