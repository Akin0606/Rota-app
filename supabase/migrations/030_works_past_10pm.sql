-- Young-worker restricted period: 10pm-6am, or 11pm-7am by contract.
--
-- WTR 1998 reg 6A defines the restricted period for a 16-17 year-old as 10pm to
-- 6am -- OR 11pm to 7am where the worker's contract provides for work after
-- 10pm. The solver only ever knew the first, so a pub whose evening shift ends
-- at 11pm could not roster a 16-year-old on ANY evening, on any day, for any
-- reason. That is not what the regulation says, and the venue's answer to it
-- was to stop ticking the under-18 box.
--
-- This is a contract fact about a person, not a venue setting, so it lives on
-- the staff member. Default false: the stricter window stays the default, and
-- nobody's schedule changes until a manager makes the statement deliberately.
alter table staff_members
  add column if not exists works_past_10pm boolean not null default false;

comment on column staff_members.works_past_10pm is
  'Their contract provides for work after 10pm (WTR 1998 reg 6A), so the '
  'restricted period for this 16-17 year-old is 11pm-7am rather than 10pm-6am. '
  'Ignored unless is_under_18 is set.';
