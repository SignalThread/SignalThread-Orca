-- Add first-class Question and QuestionAudioAsset tables.
-- Phase 1 is additive only: Event.questionsJson remains unchanged and authoritative.

CREATE TABLE IF NOT EXISTS "Question" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ttsText" TEXT,
    "order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Question_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "QuestionAudioAsset" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL DEFAULT '',
    "textHash" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "storageUrl" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT 'audio/mpeg',
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionAudioAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuestionAudioAsset_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Question_eventId_key_key" ON "Question"("eventId", "key");
CREATE UNIQUE INDEX IF NOT EXISTS "Question_eventId_order_key" ON "Question"("eventId", "order");
CREATE INDEX IF NOT EXISTS "Question_eventId_order_idx" ON "Question"("eventId", "order");

CREATE UNIQUE INDEX IF NOT EXISTS "QuestionAudioAsset_objectKey_key" ON "QuestionAudioAsset"("objectKey");
CREATE UNIQUE INDEX IF NOT EXISTS "QuestionAudioAsset_questionId_provider_voice_language_locale_textHash_key"
  ON "QuestionAudioAsset"("questionId", "provider", "voice", "language", "locale", "textHash");
CREATE INDEX IF NOT EXISTS "QuestionAudioAsset_questionId_createdAt_idx"
  ON "QuestionAudioAsset"("questionId", "createdAt");
CREATE INDEX IF NOT EXISTS "QuestionAudioAsset_questionId_provider_voice_language_locale_idx"
  ON "QuestionAudioAsset"("questionId", "provider", "voice", "language", "locale");
