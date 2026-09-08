-- Extend the existing user/company provider preference so the single Default
-- action applies to both email sending and calendar scheduling.

BEGIN;

ALTER TABLE public.integration_provider_preferences
  DROP CONSTRAINT integration_provider_preferences_capability_check;

ALTER TABLE public.integration_provider_preferences
  ADD CONSTRAINT integration_provider_preferences_capability_check
    CHECK (capability IN ('email_send', 'calendar'));

-- Preserve every existing Default selection for calendar immediately. The
-- primary key makes this safe to rerun during migration recovery.
INSERT INTO public.integration_provider_preferences (
  user_id,
  company_id,
  capability,
  provider
)
SELECT
  user_id,
  company_id,
  'calendar',
  provider
FROM public.integration_provider_preferences
WHERE capability = 'email_send'
ON CONFLICT (user_id, company_id, capability)
DO UPDATE SET
  provider = EXCLUDED.provider,
  updated_at = now();

COMMIT;
