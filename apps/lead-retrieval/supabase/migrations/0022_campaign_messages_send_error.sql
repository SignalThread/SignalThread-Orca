-- Per-recipient send failure detail (SendGrid / validation); provider id stays on success path.
alter table public.campaign_messages
  add column if not exists send_error text null;
