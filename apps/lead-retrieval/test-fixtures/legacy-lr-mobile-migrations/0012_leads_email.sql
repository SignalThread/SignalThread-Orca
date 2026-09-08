-- App + Admin: editable lead contact email (single canonical column).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email text;
