-- Preserve every historical EventType while adding stable values for new
-- Events-account creation. Existing rows require no rewrite or backfill.
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'TEMPLATE';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'BLANK';
