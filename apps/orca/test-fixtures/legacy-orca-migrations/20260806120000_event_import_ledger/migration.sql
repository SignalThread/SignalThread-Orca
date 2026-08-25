-- Add a vendor role to the canonical event directory taxonomy.
ALTER TYPE "EventDirectoryRoleType" ADD VALUE IF NOT EXISTS 'VENDOR';

CREATE TYPE "EventImportIntentStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED');
CREATE TYPE "EventImportResultStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'CANCELED');

CREATE TABLE "EventImportIntent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "status" "EventImportIntentStatus" NOT NULL DEFAULT 'PROCESSING',
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "approvalEvidence" JSONB NOT NULL,
    "reviewedMappings" JSONB NOT NULL,
    "approvedPlan" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EventImportIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventImportResult" (
    "id" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "eventId" UUID,
    "status" "EventImportResultStatus" NOT NULL,
    "createdSummary" JSONB,
    "skippedSummary" JSONB,
    "warnings" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "httpStatus" INTEGER,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventImportResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventImportIntent_orgId_requestedByUserId_idempotencyKey_key"
ON "EventImportIntent"("orgId", "requestedByUserId", "idempotencyKey");

CREATE INDEX "EventImportIntent_orgId_status_createdAt_idx"
ON "EventImportIntent"("orgId", "status", "createdAt");

CREATE INDEX "EventImportIntent_requestedByUserId_createdAt_idx"
ON "EventImportIntent"("requestedByUserId", "createdAt");

CREATE UNIQUE INDEX "EventImportResult_intentId_key" ON "EventImportResult"("intentId");
CREATE UNIQUE INDEX "EventImportResult_eventId_key" ON "EventImportResult"("eventId");
CREATE INDEX "EventImportResult_orgId_status_completedAt_idx"
ON "EventImportResult"("orgId", "status", "completedAt");
CREATE INDEX "EventImportResult_requestedByUserId_completedAt_idx"
ON "EventImportResult"("requestedByUserId", "completedAt");

ALTER TABLE "EventImportIntent"
ADD CONSTRAINT "EventImportIntent_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventImportIntent"
ADD CONSTRAINT "EventImportIntent_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventImportResult"
ADD CONSTRAINT "EventImportResult_intentId_fkey"
FOREIGN KEY ("intentId") REFERENCES "EventImportIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventImportResult"
ADD CONSTRAINT "EventImportResult_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventImportResult"
ADD CONSTRAINT "EventImportResult_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventImportResult"
ADD CONSTRAINT "EventImportResult_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
