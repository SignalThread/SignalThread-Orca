-- Data-only question types for the Advanced Event builder. VOICE remains for
-- legacy survey compatibility and is intentionally not renamed or removed.
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'OPEN_RESPONSE';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'YES_NO';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'SINGLE_CHOICE';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'SPEAKER_FEEDBACK';

ALTER TABLE "Question" ADD COLUMN "configurationJson" JSONB;
