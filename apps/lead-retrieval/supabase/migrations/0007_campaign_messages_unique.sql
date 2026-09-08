-- Ensure campaign draft generation upserts by campaign + recipient

create unique index if not exists idx_campaign_messages_campaign_recipient_unique
on public.campaign_messages(campaign_id, recipient_id);
