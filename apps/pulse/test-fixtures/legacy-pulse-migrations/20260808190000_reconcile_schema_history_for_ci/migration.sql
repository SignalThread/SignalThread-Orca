-- Forward-only reconciliation for objects already represented in
-- schema.prisma but missing or differently named in historical migrations.
-- Every operation is additive/idempotent so this is safe for databases that
-- were previously repaired outside Prisma migration history.

ALTER TABLE "Account"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;

ALTER TABLE "Account" ALTER COLUMN "tier" SET DEFAULT 'starter';

CREATE UNIQUE INDEX IF NOT EXISTS "Account_stripeCustomerId_key"
  ON "Account"("stripeCustomerId");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'i'
      AND relname = 'QuestionAudioAsset_questionId_provider_voice_language_locale_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'i'
      AND relname = 'QuestionAudioAsset_questionId_provider_voice_language_local_idx'
  ) THEN
    ALTER INDEX "QuestionAudioAsset_questionId_provider_voice_language_locale_id"
      RENAME TO "QuestionAudioAsset_questionId_provider_voice_language_local_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'i'
      AND relname = 'QuestionAudioAsset_questionId_provider_voice_language_locale_te'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'i'
      AND relname = 'QuestionAudioAsset_questionId_provider_voice_language_local_key'
  ) THEN
    ALTER INDEX "QuestionAudioAsset_questionId_provider_voice_language_locale_te"
      RENAME TO "QuestionAudioAsset_questionId_provider_voice_language_local_key";
  END IF;
END $$;
