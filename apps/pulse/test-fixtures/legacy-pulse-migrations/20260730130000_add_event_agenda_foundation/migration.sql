-- Additive Events agenda foundation. Agenda sessions continue to use
-- EventStructureItem(kind = 'SESSION'); the legacy recording Session table is
-- intentionally unchanged.

-- CreateEnum
CREATE TYPE "EventSpeakerHeadshotState" AS ENUM ('NONE', 'PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "EventSpeakerRole" AS ENUM ('SPEAKER', 'MODERATOR', 'HOST', 'PANELIST');

-- CreateEnum
CREATE TYPE "EventAgendaImportStatus" AS ENUM ('UPLOADED', 'MAPPING', 'NEEDS_REVIEW', 'READY', 'CONFIRMING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventAgendaImportRowStatus" AS ENUM ('PENDING', 'READY', 'NEEDS_REVIEW', 'DUPLICATE', 'INVALID', 'IGNORED', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "EventAgendaImportConflictType" AS ENUM ('EXACT_DUPLICATE', 'EXTERNAL_ID_MATCH', 'POSSIBLE_DUPLICATE', 'POSSIBLE_OVERLAP', 'AMBIGUOUS_SPEAKER_MATCH');

-- CreateEnum
CREATE TYPE "EventAgendaImportResolution" AS ENUM ('SKIP', 'REPLACE_EXISTING', 'KEEP_BOTH', 'REVIEW');

-- CreateEnum
CREATE TYPE "EventAgendaImportRowResult" AS ENUM ('CREATED', 'UPDATED', 'SKIPPED', 'FAILED');

-- Composite identity supports event-scoped foreign keys without changing
-- existing EventStructureItem primary keys or data.
CREATE UNIQUE INDEX "EventStructureItem_eventId_id_key" ON "EventStructureItem"("eventId", "id");

-- CreateTable
CREATE TABLE "EventSpeakerProfile" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "organization" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "biography" TEXT,
    "headshotState" "EventSpeakerHeadshotState" NOT NULL DEFAULT 'NONE',
    "headshotObjectKey" TEXT,
    "headshotMimeType" TEXT,
    "normalizedName" TEXT NOT NULL,
    "normalizedEmail" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSpeakerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSessionSpeakerAssignment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "speakerId" TEXT NOT NULL,
    "role" "EventSpeakerRole" NOT NULL DEFAULT 'SPEAKER',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSessionSpeakerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAgendaImportJob" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "confirmedByUserId" TEXT,
    "status" "EventAgendaImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "idempotencyKey" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceMimeType" TEXT NOT NULL,
    "sourceFileSizeBytes" INTEGER NOT NULL,
    "sourceChecksumSha256" TEXT NOT NULL,
    "sourceObjectKey" TEXT,
    "worksheetName" TEXT,
    "worksheetIndex" INTEGER,
    "mappingSnapshot" JSONB,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdSessionCount" INTEGER NOT NULL DEFAULT 0,
    "updatedSessionCount" INTEGER NOT NULL DEFAULT 0,
    "skippedRowCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateRowCount" INTEGER NOT NULL DEFAULT 0,
    "failedRowCount" INTEGER NOT NULL DEFAULT 0,
    "createdSpeakerCount" INTEGER NOT NULL DEFAULT 0,
    "matchedSpeakerCount" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventAgendaImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAgendaImportRow" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "stableSourceKey" TEXT NOT NULL,
    "sourceExternalId" TEXT,
    "rawRowSnapshot" JSONB NOT NULL,
    "normalizedRowSnapshot" JSONB,
    "validationIssues" JSONB,
    "status" "EventAgendaImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "conflictType" "EventAgendaImportConflictType",
    "resolution" "EventAgendaImportResolution",
    "speakerResolutionSnapshot" JSONB,
    "existingSessionId" TEXT,
    "result" "EventAgendaImportRowResult",
    "resultSessionId" TEXT,
    "resultMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventAgendaImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventSpeakerProfile_accountId_id_key" ON "EventSpeakerProfile"("accountId", "id");
CREATE INDEX "EventSpeakerProfile_accountId_normalizedName_idx" ON "EventSpeakerProfile"("accountId", "normalizedName");
CREATE INDEX "EventSpeakerProfile_accountId_normalizedEmail_idx" ON "EventSpeakerProfile"("accountId", "normalizedEmail");
CREATE INDEX "EventSpeakerProfile_accountId_isArchived_idx" ON "EventSpeakerProfile"("accountId", "isArchived");

CREATE UNIQUE INDEX "EventSessionSpeakerAssignment_sessionId_speakerId_key" ON "EventSessionSpeakerAssignment"("sessionId", "speakerId");
CREATE INDEX "EventSessionSpeakerAssignment_eventId_sessionId_sortOrder_idx" ON "EventSessionSpeakerAssignment"("eventId", "sessionId", "sortOrder");
CREATE INDEX "EventSessionSpeakerAssignment_accountId_speakerId_idx" ON "EventSessionSpeakerAssignment"("accountId", "speakerId");

CREATE UNIQUE INDEX "EventAgendaImportJob_sourceObjectKey_key" ON "EventAgendaImportJob"("sourceObjectKey");
CREATE UNIQUE INDEX "EventAgendaImportJob_eventId_id_key" ON "EventAgendaImportJob"("eventId", "id");
CREATE UNIQUE INDEX "EventAgendaImportJob_eventId_idempotencyKey_key" ON "EventAgendaImportJob"("eventId", "idempotencyKey");
CREATE INDEX "EventAgendaImportJob_accountId_createdAt_idx" ON "EventAgendaImportJob"("accountId", "createdAt");
CREATE INDEX "EventAgendaImportJob_eventId_status_idx" ON "EventAgendaImportJob"("eventId", "status");
CREATE INDEX "EventAgendaImportJob_eventId_sourceChecksumSha256_idx" ON "EventAgendaImportJob"("eventId", "sourceChecksumSha256");
CREATE INDEX "EventAgendaImportJob_createdByUserId_idx" ON "EventAgendaImportJob"("createdByUserId");
CREATE INDEX "EventAgendaImportJob_confirmedByUserId_idx" ON "EventAgendaImportJob"("confirmedByUserId");

CREATE UNIQUE INDEX "EventAgendaImportRow_importJobId_sourceRowNumber_key" ON "EventAgendaImportRow"("importJobId", "sourceRowNumber");
CREATE UNIQUE INDEX "EventAgendaImportRow_importJobId_stableSourceKey_key" ON "EventAgendaImportRow"("importJobId", "stableSourceKey");
CREATE INDEX "EventAgendaImportRow_eventId_status_idx" ON "EventAgendaImportRow"("eventId", "status");
CREATE INDEX "EventAgendaImportRow_eventId_sourceExternalId_idx" ON "EventAgendaImportRow"("eventId", "sourceExternalId");
CREATE INDEX "EventAgendaImportRow_eventId_existingSessionId_idx" ON "EventAgendaImportRow"("eventId", "existingSessionId");
CREATE INDEX "EventAgendaImportRow_eventId_resultSessionId_idx" ON "EventAgendaImportRow"("eventId", "resultSessionId");

-- AddForeignKey
ALTER TABLE "EventSpeakerProfile" ADD CONSTRAINT "EventSpeakerProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventSessionSpeakerAssignment" ADD CONSTRAINT "EventSessionSpeakerAssignment_eventId_sessionId_fkey" FOREIGN KEY ("eventId", "sessionId") REFERENCES "EventStructureItem"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSessionSpeakerAssignment" ADD CONSTRAINT "EventSessionSpeakerAssignment_accountId_speakerId_fkey" FOREIGN KEY ("accountId", "speakerId") REFERENCES "EventSpeakerProfile"("accountId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventAgendaImportJob" ADD CONSTRAINT "EventAgendaImportJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventAgendaImportJob" ADD CONSTRAINT "EventAgendaImportJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventAgendaImportJob" ADD CONSTRAINT "EventAgendaImportJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventAgendaImportJob" ADD CONSTRAINT "EventAgendaImportJob_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventAgendaImportRow" ADD CONSTRAINT "EventAgendaImportRow_eventId_importJobId_fkey" FOREIGN KEY ("eventId", "importJobId") REFERENCES "EventAgendaImportJob"("eventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventAgendaImportRow" ADD CONSTRAINT "EventAgendaImportRow_existingSessionId_fkey" FOREIGN KEY ("existingSessionId") REFERENCES "EventStructureItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventAgendaImportRow" ADD CONSTRAINT "EventAgendaImportRow_resultSessionId_fkey" FOREIGN KEY ("resultSessionId") REFERENCES "EventStructureItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
