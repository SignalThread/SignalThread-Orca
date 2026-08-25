-- Event Directory MVP: canonical event-level people/contact layer (additive).
-- New models only; no changes to existing Speaker / SeatingAttendee / EventPerson tables.

-- CreateEnum
CREATE TYPE "EventDirectoryPersonStatus" AS ENUM ('ACTIVE', 'NEEDS_REVIEW', 'DUPLICATE_REVIEW', 'REMOVED', 'MERGED');

-- CreateEnum
CREATE TYPE "EventDirectoryRoleType" AS ENUM ('ATTENDEE', 'REGISTRANT', 'SPEAKER', 'EXHIBITOR_CONTACT', 'SPONSOR_CONTACT', 'STAFF', 'VIP', 'PRESS', 'PROSPECT', 'MARKETING_CONTACT', 'SEATING_GUEST');

-- CreateEnum
CREATE TYPE "EventDirectorySourceType" AS ENUM ('MANUAL', 'CSV_IMPORT', 'REGISTRATION_INTEGRATION', 'SPEAKER_INTAKE', 'SPEAKER_MODULE', 'SEATING_MODULE', 'STAFFING_MODULE', 'MARKETING_AUDIENCE', 'EXHIBITOR_PORTAL', 'SPONSOR_IMPORT');

-- CreateEnum
CREATE TYPE "EventDirectorySyncStatus" AS ENUM ('LINKED', 'PULLED', 'PUSHED', 'CONFLICT', 'ERROR', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "EventDirectoryImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "EventDirectoryImportRowResult" AS ENUM ('CREATED', 'UPDATED', 'DUPLICATE_REVIEW', 'INVALID', 'SKIPPED');

-- CreateEnum
CREATE TYPE "EventDirectoryModuleType" AS ENUM ('SPEAKER', 'SEATING_ATTENDEE', 'EVENT_PERSON', 'MARKETING_RECIPIENT', 'EXHIBITOR_CONTACT', 'SPONSOR_CONTACT');

-- CreateTable
CREATE TABLE "EventDirectoryPerson" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "clientId" UUID,
    "eventId" UUID NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "normalizedEmail" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "title" TEXT,
    "status" "EventDirectoryPersonStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EventDirectoryPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDirectoryRole" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "role" "EventDirectoryRoleType" NOT NULL,
    "sourceId" UUID,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventDirectoryRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDirectorySource" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "type" "EventDirectorySourceType" NOT NULL,
    "label" TEXT NOT NULL,
    "provider" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventDirectorySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDirectoryExternalIdentity" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalPersonId" TEXT NOT NULL,
    "externalRegistrationId" TEXT,
    "externalAccountId" TEXT,
    "externalEventId" TEXT,
    "syncStatus" "EventDirectorySyncStatus" NOT NULL DEFAULT 'LINKED',
    "lastPulledAt" TIMESTAMP(3),
    "lastPushedAt" TIMESTAMP(3),
    "externalUpdatedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventDirectoryExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDirectoryImportBatch" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "sourceId" UUID,
    "fileName" TEXT,
    "uploadedByUserId" UUID,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetRole" "EventDirectoryRoleType",
    "sourceLabel" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "EventDirectoryImportStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "EventDirectoryImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDirectoryImportRow" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawName" TEXT,
    "rawEmail" TEXT,
    "rawCompany" TEXT,
    "parsedFirstName" TEXT,
    "parsedLastName" TEXT,
    "parsedEmail" TEXT,
    "result" "EventDirectoryImportRowResult" NOT NULL,
    "matchedPersonId" UUID,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventDirectoryImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDirectoryModuleLink" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "module" "EventDirectoryModuleType" NOT NULL,
    "moduleRecordId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventDirectoryModuleLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventDirectoryPerson_eventId_normalizedEmail_idx" ON "EventDirectoryPerson"("eventId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "EventDirectoryPerson_eventId_status_idx" ON "EventDirectoryPerson"("eventId", "status");

-- CreateIndex
CREATE INDEX "EventDirectoryPerson_eventId_company_idx" ON "EventDirectoryPerson"("eventId", "company");

-- CreateIndex
CREATE INDEX "EventDirectoryPerson_eventId_displayName_idx" ON "EventDirectoryPerson"("eventId", "displayName");

-- CreateIndex
CREATE INDEX "EventDirectoryPerson_orgId_idx" ON "EventDirectoryPerson"("orgId");

-- CreateIndex
CREATE INDEX "EventDirectoryPerson_clientId_idx" ON "EventDirectoryPerson"("clientId");

-- CreateIndex
CREATE INDEX "EventDirectoryRole_eventId_role_idx" ON "EventDirectoryRole"("eventId", "role");

-- CreateIndex
CREATE INDEX "EventDirectoryRole_personId_idx" ON "EventDirectoryRole"("personId");

-- CreateIndex
CREATE INDEX "EventDirectoryRole_sourceId_idx" ON "EventDirectoryRole"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "EventDirectoryRole_eventId_personId_role_key" ON "EventDirectoryRole"("eventId", "personId", "role");

-- CreateIndex
CREATE INDEX "EventDirectorySource_eventId_type_idx" ON "EventDirectorySource"("eventId", "type");

-- CreateIndex
CREATE INDEX "EventDirectorySource_eventId_label_idx" ON "EventDirectorySource"("eventId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "EventDirectorySource_eventId_type_label_key" ON "EventDirectorySource"("eventId", "type", "label");

-- CreateIndex
CREATE INDEX "EventDirectoryExternalIdentity_personId_idx" ON "EventDirectoryExternalIdentity"("personId");

-- CreateIndex
CREATE INDEX "EventDirectoryExternalIdentity_eventId_provider_idx" ON "EventDirectoryExternalIdentity"("eventId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "EventDirectoryExternalIdentity_eventId_provider_externalPer_key" ON "EventDirectoryExternalIdentity"("eventId", "provider", "externalPersonId");

-- CreateIndex
CREATE INDEX "EventDirectoryImportBatch_eventId_uploadedAt_idx" ON "EventDirectoryImportBatch"("eventId", "uploadedAt");

-- CreateIndex
CREATE INDEX "EventDirectoryImportBatch_sourceId_idx" ON "EventDirectoryImportBatch"("sourceId");

-- CreateIndex
CREATE INDEX "EventDirectoryImportRow_batchId_rowNumber_idx" ON "EventDirectoryImportRow"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "EventDirectoryImportRow_eventId_result_idx" ON "EventDirectoryImportRow"("eventId", "result");

-- CreateIndex
CREATE INDEX "EventDirectoryModuleLink_personId_idx" ON "EventDirectoryModuleLink"("personId");

-- CreateIndex
CREATE INDEX "EventDirectoryModuleLink_eventId_module_idx" ON "EventDirectoryModuleLink"("eventId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "EventDirectoryModuleLink_eventId_module_moduleRecordId_key" ON "EventDirectoryModuleLink"("eventId", "module", "moduleRecordId");

-- AddForeignKey
ALTER TABLE "EventDirectoryPerson" ADD CONSTRAINT "EventDirectoryPerson_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDirectoryRole" ADD CONSTRAINT "EventDirectoryRole_personId_fkey" FOREIGN KEY ("personId") REFERENCES "EventDirectoryPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDirectoryRole" ADD CONSTRAINT "EventDirectoryRole_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EventDirectorySource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDirectorySource" ADD CONSTRAINT "EventDirectorySource_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDirectoryExternalIdentity" ADD CONSTRAINT "EventDirectoryExternalIdentity_personId_fkey" FOREIGN KEY ("personId") REFERENCES "EventDirectoryPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDirectoryImportBatch" ADD CONSTRAINT "EventDirectoryImportBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDirectoryImportBatch" ADD CONSTRAINT "EventDirectoryImportBatch_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EventDirectorySource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDirectoryImportRow" ADD CONSTRAINT "EventDirectoryImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "EventDirectoryImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDirectoryImportRow" ADD CONSTRAINT "EventDirectoryImportRow_matchedPersonId_fkey" FOREIGN KEY ("matchedPersonId") REFERENCES "EventDirectoryPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDirectoryModuleLink" ADD CONSTRAINT "EventDirectoryModuleLink_personId_fkey" FOREIGN KEY ("personId") REFERENCES "EventDirectoryPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

