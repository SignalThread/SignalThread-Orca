-- Extend EventActivity into the canonical event-scoped audit feed.
-- This migration is additive and non-destructive: all existing rows are
-- preserved, new columns are nullable or carry safe defaults, and the legacy
-- `type` column is retained for backward compatibility. Final non-null
-- contract constraints are intentionally deferred until writer cutover is done.

-- CreateEnum
CREATE TYPE "EventActivityActorKind" AS ENUM ('USER', 'SYSTEM', 'INTEGRATION', 'PORTAL');

-- CreateEnum
CREATE TYPE "EventActivityModule" AS ENUM ('ROADMAP', 'BUDGET', 'RUN_OF_SHOW', 'DOCUMENTS', 'EVENT_DIRECTORY', 'MARKETING', 'EVENT_SETTINGS', 'SPEAKERS', 'INTEGRATIONS', 'REPORTS');

-- CreateEnum
CREATE TYPE "EventActivityAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'ASSIGNED', 'UNASSIGNED', 'IMPORTED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REOPENED', 'STATUS_CHANGED', 'LINKED', 'UNLINKED', 'MERGED', 'UPLOADED', 'SENT', 'SCHEDULED', 'RESCHEDULED', 'CANCELED', 'RETRIED', 'SYNCED', 'GENERATED');

-- AlterTable: relax legacy NOT NULL constraints and add canonical audit columns.
ALTER TABLE "EventActivity"
  ALTER COLUMN "actorUserId" DROP NOT NULL,
  ALTER COLUMN "type" DROP NOT NULL,
  ADD COLUMN "actorKind" "EventActivityActorKind" NOT NULL DEFAULT 'USER',
  ADD COLUMN "actorLabel" TEXT,
  ADD COLUMN "module" "EventActivityModule",
  ADD COLUMN "actionType" "EventActivityAction",
  ADD COLUMN "entityType" TEXT,
  ADD COLUMN "entityId" TEXT,
  ADD COLUMN "entityLabel" TEXT,
  ADD COLUMN "changes" JSONB,
  ADD COLUMN "sourceRecordType" TEXT,
  ADD COLUMN "sourceRecordId" TEXT;

-- Replace the legacy (eventId, createdAt) index with the stable cursor index.
DROP INDEX "EventActivity_eventId_createdAt_idx";

-- CreateIndex: newest-first cursor + event-scoped filter indexes.
CREATE INDEX "EventActivity_eventId_createdAt_id_idx" ON "EventActivity"("eventId", "createdAt", "id");
CREATE INDEX "EventActivity_eventId_actorUserId_createdAt_id_idx" ON "EventActivity"("eventId", "actorUserId", "createdAt", "id");
CREATE INDEX "EventActivity_eventId_module_createdAt_id_idx" ON "EventActivity"("eventId", "module", "createdAt", "id");
CREATE INDEX "EventActivity_eventId_actionType_createdAt_id_idx" ON "EventActivity"("eventId", "actionType", "createdAt", "id");

-- CreateIndex: event-scoped source-record deduplication. Postgres treats NULLs
-- as distinct, so rows without source identity never collide.
CREATE UNIQUE INDEX "EventActivity_eventId_sourceRecordType_sourceRecordId_key" ON "EventActivity"("eventId", "sourceRecordType", "sourceRecordId");
