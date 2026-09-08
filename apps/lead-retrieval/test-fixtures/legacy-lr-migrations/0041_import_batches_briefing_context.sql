-- Batch-level briefing context (event/product/persona notes) for import wizard briefing flow.
alter table public.import_batches add column if not exists briefing_context jsonb default null;
