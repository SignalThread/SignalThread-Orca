-- Reconcile CopilotAuditLog to the Prisma model shape in an idempotent way.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CopilotMode') THEN
    CREATE TYPE "CopilotMode" AS ENUM ('ASK', 'DO');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CopilotActionStatus') THEN
    CREATE TYPE "CopilotActionStatus" AS ENUM ('PROPOSED', 'APPROVED', 'EXECUTED', 'FAILED', 'REJECTED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "CopilotAuditLog" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "orgId" UUID NOT NULL,
  "eventId" UUID,
  "mode" "CopilotMode" NOT NULL,
  "rawPrompt" TEXT NOT NULL,
  "actionType" TEXT,
  "proposedActionJson" JSONB,
  "approved" BOOLEAN NOT NULL DEFAULT false,
  "executed" BOOLEAN NOT NULL DEFAULT false,
  "status" "CopilotActionStatus" NOT NULL DEFAULT 'PROPOSED',
  "resultSummary" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CopilotAuditLog_pkey" PRIMARY KEY ("id")
);

-- Rename legacy columns only when needed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'CopilotAuditLog'
      AND column_name = 'action'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'CopilotAuditLog'
      AND column_name = 'actionType'
  ) THEN
    ALTER TABLE "CopilotAuditLog" RENAME COLUMN "action" TO "actionType";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'CopilotAuditLog'
      AND column_name = 'payload'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'CopilotAuditLog'
      AND column_name = 'proposedActionJson'
  ) THEN
    ALTER TABLE "CopilotAuditLog" RENAME COLUMN "payload" TO "proposedActionJson";
  END IF;
END
$$;

ALTER TABLE "CopilotAuditLog" ADD COLUMN IF NOT EXISTS "userId" UUID;
ALTER TABLE "CopilotAuditLog" ADD COLUMN IF NOT EXISTS "orgId" UUID;
ALTER TABLE "CopilotAuditLog" ADD COLUMN IF NOT EXISTS "eventId" UUID;
ALTER TABLE "CopilotAuditLog" ADD COLUMN IF NOT EXISTS "mode" "CopilotMode";
ALTER TABLE "CopilotAuditLog" ADD COLUMN IF NOT EXISTS "rawPrompt" TEXT;
ALTER TABLE "CopilotAuditLog" ADD COLUMN IF NOT EXISTS "actionType" TEXT;
ALTER TABLE "CopilotAuditLog" ADD COLUMN IF NOT EXISTS "proposedActionJson" JSONB;
ALTER TABLE "CopilotAuditLog" ADD COLUMN IF NOT EXISTS "approved" BOOLEAN DEFAULT false;
ALTER TABLE "CopilotAuditLog" ADD COLUMN IF NOT EXISTS "executed" BOOLEAN DEFAULT false;
ALTER TABLE "CopilotAuditLog" ADD COLUMN IF NOT EXISTS "status" "CopilotActionStatus" DEFAULT 'PROPOSED';
ALTER TABLE "CopilotAuditLog" ADD COLUMN IF NOT EXISTS "resultSummary" TEXT;
ALTER TABLE "CopilotAuditLog" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "CopilotAuditLog" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Backfill from legacy `result` column when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'CopilotAuditLog'
      AND column_name = 'result'
  ) THEN
    UPDATE "CopilotAuditLog"
    SET "resultSummary" = COALESCE("resultSummary", "result"::text)
    WHERE "result" IS NOT NULL;
  END IF;
END
$$;

-- Drop deprecated legacy columns.
ALTER TABLE "CopilotAuditLog" DROP COLUMN IF EXISTS "action";
ALTER TABLE "CopilotAuditLog" DROP COLUMN IF EXISTS "payload";
ALTER TABLE "CopilotAuditLog" DROP COLUMN IF EXISTS "result";

-- Ensure canonical types.
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "actionType" TYPE TEXT;
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "proposedActionJson" TYPE JSONB USING "proposedActionJson"::jsonb;
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "resultSummary" TYPE TEXT USING "resultSummary"::text;
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "errorMessage" TYPE TEXT USING "errorMessage"::text;

-- Canonical defaults and required state.
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "status" SET DEFAULT 'PROPOSED'::"CopilotActionStatus";
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "approved" SET DEFAULT false;
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "executed" SET DEFAULT false;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid') THEN
    ALTER TABLE "CopilotAuditLog" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
  ELSIF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uuid_generate_v4') THEN
    ALTER TABLE "CopilotAuditLog" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
  END IF;
END
$$;

UPDATE "CopilotAuditLog" SET "rawPrompt" = '' WHERE "rawPrompt" IS NULL;
UPDATE "CopilotAuditLog" SET "mode" = 'ASK'::"CopilotMode" WHERE "mode" IS NULL;
UPDATE "CopilotAuditLog" SET "status" = 'PROPOSED'::"CopilotActionStatus" WHERE "status" IS NULL;
UPDATE "CopilotAuditLog" SET "approved" = false WHERE "approved" IS NULL;
UPDATE "CopilotAuditLog" SET "executed" = false WHERE "executed" IS NULL;
UPDATE "CopilotAuditLog" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;

-- Remove irrecoverable legacy rows missing required ownership fields.
DELETE FROM "CopilotAuditLog"
WHERE "userId" IS NULL OR "orgId" IS NULL;

ALTER TABLE "CopilotAuditLog" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "mode" SET NOT NULL;
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "rawPrompt" SET NOT NULL;
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "approved" SET NOT NULL;
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "executed" SET NOT NULL;
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "CopilotAuditLog" ALTER COLUMN "createdAt" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CopilotAuditLog_userId_fkey') THEN
    ALTER TABLE "CopilotAuditLog"
    ADD CONSTRAINT "CopilotAuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CopilotAuditLog_orgId_fkey') THEN
    ALTER TABLE "CopilotAuditLog"
    ADD CONSTRAINT "CopilotAuditLog_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CopilotAuditLog_eventId_fkey') THEN
    ALTER TABLE "CopilotAuditLog"
    ADD CONSTRAINT "CopilotAuditLog_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "CopilotAuditLog_userId_createdAt_idx" ON "CopilotAuditLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "CopilotAuditLog_orgId_createdAt_idx" ON "CopilotAuditLog"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "CopilotAuditLog_eventId_createdAt_idx" ON "CopilotAuditLog"("eventId", "createdAt");
CREATE INDEX IF NOT EXISTS "CopilotAuditLog_status_createdAt_idx" ON "CopilotAuditLog"("status", "createdAt");
