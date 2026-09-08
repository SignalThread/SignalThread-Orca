-- Descriptive event fields for the connected-event overview.
--
-- Both are optional: an event is valid without a venue (virtual) or before one
-- is booked, and `timezone` is an IANA name used only to place the event's
-- calendar days; the lifecycle clock falls back to UTC when it is absent.
-- Platform reads these with a fallback, so the overview keeps working on a
-- project where this migration has not been applied yet.

alter table public.events
  add column if not exists venue text,
  add column if not exists timezone text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass and conname = 'events_timezone_format'
  ) then
    alter table public.events add constraint events_timezone_format
      check (timezone is null or timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$');
  end if;
end $$;

-- Additive only; no existing event data, access rules or product schemas change.
-- Rollback: revert readers/writers first, then drop this constraint and the two
-- descriptive columns only if their data is no longer needed. Not applied here.
