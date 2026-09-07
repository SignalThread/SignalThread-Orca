-- Persist the effective response method for each attendee attempt. Existing
-- responses retain the legacy voice-only behavior.
ALTER TABLE "Response"
ADD COLUMN IF NOT EXISTS "responseMode" "ResponseMode" NOT NULL DEFAULT 'VOICE_ONLY';
