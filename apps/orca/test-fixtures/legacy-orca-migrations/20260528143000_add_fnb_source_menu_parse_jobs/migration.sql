DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventFnbSourceMenuParseJobStatus') THEN
    CREATE TYPE "EventFnbSourceMenuParseJobStatus" AS ENUM (
      'QUEUED',
      'RUNNING',
      'COMPLETE',
      'FAILED',
      'CANCELLED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EventFnbSourceMenuParseJob" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "eventId" UUID NOT NULL,
  "sourceMenuId" UUID NOT NULL,
  "status" "EventFnbSourceMenuParseJobStatus" NOT NULL DEFAULT 'QUEUED',
  "workerMode" TEXT NOT NULL DEFAULT 'temporary_full_parse_worker',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 1,
  "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "heartbeatAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "progressSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventFnbSourceMenuParseJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventFnbSourceMenuParseJob_sourceMenuId_key"
  ON "EventFnbSourceMenuParseJob"("sourceMenuId");

CREATE INDEX IF NOT EXISTS "EventFnbSourceMenuParseJob_eventId_status_runAfter_idx"
  ON "EventFnbSourceMenuParseJob"("eventId", "status", "runAfter");

CREATE INDEX IF NOT EXISTS "EventFnbSourceMenuParseJob_status_runAfter_idx"
  ON "EventFnbSourceMenuParseJob"("status", "runAfter");

CREATE INDEX IF NOT EXISTS "EventFnbSourceMenuParseJob_lockedAt_idx"
  ON "EventFnbSourceMenuParseJob"("lockedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventFnbSourceMenuParseJob_eventId_fkey'
  ) THEN
    ALTER TABLE "EventFnbSourceMenuParseJob"
      ADD CONSTRAINT "EventFnbSourceMenuParseJob_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventFnbSourceMenuParseJob_sourceMenuId_fkey'
  ) THEN
    ALTER TABLE "EventFnbSourceMenuParseJob"
      ADD CONSTRAINT "EventFnbSourceMenuParseJob_sourceMenuId_fkey"
      FOREIGN KEY ("sourceMenuId") REFERENCES "EventFnbSourceMenu"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
