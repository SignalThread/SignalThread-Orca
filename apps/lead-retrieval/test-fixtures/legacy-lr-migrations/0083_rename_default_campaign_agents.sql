with rename_map(old_name, new_name) as (
  values
    ('AI Summary', 'Conversation Brief Agent'),
    ('Company Context', 'Company Intel Agent'),
    ('Suggested Next Step', 'Follow-Up Agent'),
    ('Strategic Angle', 'Positioning Agent')
),
default_renames as (
  select s.id, r.old_name, r.new_name
  from public.signals s
  join rename_map r on s.name = r.old_name
  where s.signal_scope = 'default'
)
update public.signals s
set name = d.new_name
from default_renames d
where s.id = d.id
  or s.source_signal_id = d.id;

notify pgrst, 'reload schema';
