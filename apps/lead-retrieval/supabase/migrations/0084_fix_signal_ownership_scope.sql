-- Forward-only repair for renamed default Campaign Agents.
-- Do not edit 0075 in place: it may already be applied in shared environments.

with renamed_defaults(name) as (
  values
    ('Conversation Brief Agent'),
    ('Company Intel Agent'),
    ('Follow-Up Agent'),
    ('Positioning Agent')
),
default_rows as (
  select s.id
  from public.signals s
  join renamed_defaults d on d.name = s.name
  where s.event_id is null
    and s.source_signal_id is null
    and s.visibility = 'global'
)
update public.signals s
set
  signal_scope = 'default',
  company_id = null,
  owner_user_id = null
from default_rows d
where s.id = d.id
  and (
    s.signal_scope is distinct from 'default'
    or s.company_id is not null
    or s.owner_user_id is not null
  );

with renamed_defaults(name) as (
  values
    ('Conversation Brief Agent'),
    ('Company Intel Agent'),
    ('Follow-Up Agent'),
    ('Positioning Agent')
),
default_rows as (
  select s.id
  from public.signals s
  join renamed_defaults d on d.name = s.name
  where s.signal_scope = 'default'
),
event_copies as (
  select s.id, e.company_id
  from public.signals s
  join default_rows d on d.id = s.source_signal_id
  join public.events e on e.id = s.event_id
)
update public.signals s
set
  signal_scope = 'event',
  company_id = e.company_id,
  owner_user_id = null
from event_copies e
where s.id = e.id
  and (
    s.signal_scope is distinct from 'event'
    or s.company_id is distinct from e.company_id
    or s.owner_user_id is not null
  );

notify pgrst, 'reload schema';
