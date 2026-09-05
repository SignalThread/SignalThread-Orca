-- Development schema-drift repair for
-- 20260806120000_add_direct_speaker_survey_targets.
--
-- Safe to rerun. This script only creates missing enum/column/index/foreign-key
-- objects; it does not update or delete application data. After a successful
-- audit, mark the original Prisma migration applied in the repaired database.

BEGIN;

DO $repair$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS type
    JOIN pg_enum AS enum ON enum.enumtypid = type.oid
    WHERE type.typname = 'SurveyTargetCategory'
      AND enum.enumlabel = 'SPEAKER'
  ) THEN
    ALTER TYPE "SurveyTargetCategory" ADD VALUE 'SPEAKER';
  END IF;
END
$repair$;

ALTER TABLE "SurveyTarget"
ADD COLUMN IF NOT EXISTS "speakerId" TEXT;

CREATE INDEX IF NOT EXISTS "SurveyTarget_eventId_speakerId_category_idx"
ON "SurveyTarget"("eventId", "speakerId", "category");

DO $repair$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'SurveyTarget_speakerId_fkey'
      AND conrelid = '"SurveyTarget"'::regclass
  ) THEN
    ALTER TABLE "SurveyTarget"
    ADD CONSTRAINT "SurveyTarget_speakerId_fkey"
    FOREIGN KEY ("speakerId") REFERENCES "EventSpeakerProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$repair$;

ALTER TABLE "PublicSurveyLink"
ADD COLUMN IF NOT EXISTS "speakerAssignmentId" TEXT;

CREATE INDEX IF NOT EXISTS "PublicSurveyLink_speakerAssignmentId_idx"
ON "PublicSurveyLink"("speakerAssignmentId");

DO $repair$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PublicSurveyLink_speakerAssignmentId_fkey'
      AND conrelid = '"PublicSurveyLink"'::regclass
  ) THEN
    ALTER TABLE "PublicSurveyLink"
    ADD CONSTRAINT "PublicSurveyLink_speakerAssignmentId_fkey"
    FOREIGN KEY ("speakerAssignmentId") REFERENCES "EventSessionSpeakerAssignment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$repair$;

ALTER TABLE "Response"
ADD COLUMN IF NOT EXISTS "speakerAssignmentId" TEXT;

CREATE INDEX IF NOT EXISTS "Response_speakerAssignmentId_idx"
ON "Response"("speakerAssignmentId");

DO $repair$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Response_speakerAssignmentId_fkey'
      AND conrelid = '"Response"'::regclass
  ) THEN
    ALTER TABLE "Response"
    ADD CONSTRAINT "Response_speakerAssignmentId_fkey"
    FOREIGN KEY ("speakerAssignmentId") REFERENCES "EventSessionSpeakerAssignment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$repair$;

COMMIT;
