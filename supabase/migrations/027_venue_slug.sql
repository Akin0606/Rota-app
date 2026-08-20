-- Per-venue vanity slug (e.g. "bar-so16") for the public team link.
-- The opaque link_token stays the real key; slug is an additional alias that
-- resolves to the same venue (see _get_venue_or_404). Nullable so a venue
-- without one still works via its link_token.

alter table venues add column if not exists slug text;

-- Backfill from the venue name, slugified, de-duplicating collisions with a
-- numeric suffix (-2, -3, …) so the unique index below can be created.
with ranked as (
  select
    id,
    coalesce(
      nullif(trim(both '-' from regexp_replace(lower(coalesce(name, 'venue')), '[^a-z0-9]+', '-', 'g')), ''),
      'venue'
    ) as base,
    row_number() over (
      partition by coalesce(
        nullif(trim(both '-' from regexp_replace(lower(coalesce(name, 'venue')), '[^a-z0-9]+', '-', 'g')), ''),
        'venue'
      )
      order by id
    ) as rn
  from venues
  where slug is null
)
update venues v
set slug = case when r.rn = 1 then r.base else r.base || '-' || r.rn end
from ranked r
where v.id = r.id;

create unique index if not exists venues_slug_key on venues (slug);
