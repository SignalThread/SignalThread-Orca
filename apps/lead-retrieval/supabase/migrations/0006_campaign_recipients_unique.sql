-- Ensure campaign recipient upserts can target campaign_id + lead_id

create unique index if not exists idx_campaign_recipients_campaign_lead_unique
on public.campaign_recipients(campaign_id, lead_id);
