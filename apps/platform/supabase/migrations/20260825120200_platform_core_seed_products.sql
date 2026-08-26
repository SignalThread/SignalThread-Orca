-- SignalThread product catalog. Idempotent: safe to re-run, and re-running does
-- not clobber a name/status an admin has since changed.
insert into public.products (key, name) values
  ('orca',           'Orca'),
  ('registration',   'Registration'),
  ('housing',        'Housing'),
  ('pulse',          'Pulse'),
  ('lead-retrieval', 'Lead Retrieval')
on conflict (key) do nothing;
