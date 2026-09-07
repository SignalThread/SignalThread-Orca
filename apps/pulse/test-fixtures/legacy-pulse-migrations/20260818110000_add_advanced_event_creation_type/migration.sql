-- Preserve all historical EventType values and records. ADVANCED is the
-- explicit compatibility mode for new full-configuration Events workspaces.
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'ADVANCED';
