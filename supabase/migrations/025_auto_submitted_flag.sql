-- §6b — auto-submit must never be silent. Mark the rows the cron copies forward
-- so the app can show a "we auto-submitted for you — still right?" banner on the
-- staffer's next open. A manual re-submit re-inserts the rows without this flag
-- (default false), so the banner clears itself the moment they actually edit.
alter table availability_submissions
    add column if not exists auto_submitted boolean not null default false;
