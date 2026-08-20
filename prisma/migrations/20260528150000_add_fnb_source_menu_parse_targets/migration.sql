DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventFnbSourceMenuParseTargetStatus') THEN
    CREATE TYPE "EventFnbSourceMenuParseTargetStatus" AS ENUM (
      'PENDING',
      'RUNNING',
      'COMPLETE',
      'FAILED'
    );
  END IF;
END $$;

ALTER TABLE "EventFnbSourceMenuParseJob"
  ADD COLUMN IF NOT EXISTS "totalTargetCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "completedTargetCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "failedTargetCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "mapCreatedAt" TIMESTAMP(3);

ALTER TABLE "EventFnbSourceMenuParseJob"
  ALTER COLUMN "workerMode" SET DEFAULT 'bounded_menu_map_worker';

UPDATE "EventFnbSourceMenuParseJob"
SET "workerMode" = 'bounded_menu_map_worker'
WHERE "workerMode" = 'temporary_full_parse_worker';

CREATE TABLE IF NOT EXISTS "EventFnbSourceMenuParseTarget" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "jobId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "sourceMenuId" UUID NOT NULL,
  "targetKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "startPage" INTEGER NOT NULL,
  "endPage" INTEGER NOT NULL,
  "status" "EventFnbSourceMenuParseTargetStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "itemsJson" JSONB,
  "ledgerJson" JSONB,
  "usageJson" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventFnbSourceMenuParseTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventFnbSourceMenuParseTarget_jobId_targetKey_key"
  ON "EventFnbSourceMenuParseTarget"("jobId", "targetKey");

CREATE INDEX IF NOT EXISTS "EventFnbSourceMenuParseTarget_jobId_status_startPage_idx"
  ON "EventFnbSourceMenuParseTarget"("jobId", "status", "startPage");

CREATE INDEX IF NOT EXISTS "EventFnbSourceMenuParseTarget_eventId_sourceMenuId_idx"
  ON "EventFnbSourceMenuParseTarget"("eventId", "sourceMenuId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventFnbSourceMenuParseTarget_jobId_fkey'
  ) THEN
    ALTER TABLE "EventFnbSourceMenuParseTarget"
      ADD CONSTRAINT "EventFnbSourceMenuParseTarget_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "EventFnbSourceMenuParseJob"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventFnbSourceMenuParseTarget_eventId_fkey'
  ) THEN
    ALTER TABLE "EventFnbSourceMenuParseTarget"
      ADD CONSTRAINT "EventFnbSourceMenuParseTarget_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventFnbSourceMenuParseTarget_sourceMenuId_fkey'
  ) THEN
    ALTER TABLE "EventFnbSourceMenuParseTarget"
      ADD CONSTRAINT "EventFnbSourceMenuParseTarget_sourceMenuId_fkey"
      FOREIGN KEY ("sourceMenuId") REFERENCES "EventFnbSourceMenu"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
