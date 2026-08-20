CREATE TABLE IF NOT EXISTS "SessionSpeakerAssignment" (
  "sessionId" UUID NOT NULL,
  "speakerId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SessionSpeakerAssignment_pkey" PRIMARY KEY ("sessionId", "speakerId")
);

CREATE INDEX IF NOT EXISTS "SessionSpeakerAssignment_speakerId_idx" ON "SessionSpeakerAssignment"("speakerId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionSpeakerAssignment_sessionId_fkey') THEN
    ALTER TABLE "SessionSpeakerAssignment"
      ADD CONSTRAINT "SessionSpeakerAssignment_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionSpeakerAssignment_speakerId_fkey') THEN
    ALTER TABLE "SessionSpeakerAssignment"
      ADD CONSTRAINT "SessionSpeakerAssignment_speakerId_fkey"
      FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
