-- Attendee lifecycle foundation (additive): EventAttendee + EventRegistrationRecord,
-- plus provider-agnostic EventIntegrationConnection + EventExternalIdentity.
-- New models/enums only; no changes to existing tables. Built on Event Directory.

-- CreateEnum
CREATE TYPE "EventAttendeeAttendanceStatus" AS ENUM ('EXPECTED', 'CONFIRMED', 'ATTENDED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "EventAttendeeRegistrationStatus" AS ENUM ('NOT_REGISTERED', 'INVITED', 'REGISTERED', 'PENDING_APPROVAL', 'WAITLISTED', 'CANCELLED', 'TRANSFERRED', 'CHECKED_IN', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "EventAttendeeSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'REGISTRATION_INTEGRATION', 'MARKETING_CAMPAIGN', 'SPEAKER_INTAKE', 'EXHIBITOR_PORTAL', 'SPONSOR_UPLOAD', 'BACKFILLED', 'PORTAL_SELF_UPDATE');

-- CreateEnum
CREATE TYPE "EventAttendeeSyncStatus" AS ENUM ('LOCAL_ONLY', 'SYNCED', 'PENDING_WRITEBACK', 'WRITEBACK_FAILED', 'CONFLICT', 'READ_ONLY_EXTERNAL', 'STALE');

-- CreateEnum
CREATE TYPE "EventAttendeePortalStatus" AS ENUM ('NOT_INVITED', 'INVITED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "EventRegistrationWritebackStatus" AS ENUM ('NOT_APPLICABLE', 'SUPPORTED', 'PENDING', 'FAILED', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "EventIntegrationConnectionStatus" AS ENUM ('NOT_CONNECTED', 'CONNECTED', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "EventIntegrationSyncMode" AS ENUM ('READ_ONLY', 'READ_WRITE', 'MANUAL');

-- CreateTable
CREATE TABLE "EventAttendee" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "directoryPersonId" UUID NOT NULL,
    "attendanceStatus" "EventAttendeeAttendanceStatus" NOT NULL DEFAULT 'EXPECTED',
    "registrationStatus" "EventAttendeeRegistrationStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
    "registrationType" TEXT,
    "badgeType" TEXT,
    "ticketType" TEXT,
    "source" "EventAttendeeSource" NOT NULL DEFAULT 'MANUAL',
    "syncStatus" "EventAttendeeSyncStatus" NOT NULL DEFAULT 'LOCAL_ONLY',
    "portalAccessStatus" "EventAttendeePortalStatus" NOT NULL DEFAULT 'NOT_INVITED',
    "notes" TEXT,
    "registeredAt" TIMESTAMP(3),
    "waitlistedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdByUserId" UUID,
    "importedByUserId" UUID,
    "syncedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistrationRecord" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "attendeeId" UUID NOT NULL,
    "directoryPersonId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "externalRegistrationId" TEXT,
    "externalPersonId" TEXT,
    "externalOrderId" TEXT,
    "registrationStatus" "EventAttendeeRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "registrationType" TEXT,
    "ticketType" TEXT,
    "badgeType" TEXT,
    "paymentStatus" TEXT,
    "syncStatus" "EventAttendeeSyncStatus" NOT NULL DEFAULT 'LOCAL_ONLY',
    "writebackStatus" "EventRegistrationWritebackStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "registeredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "providerUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistrationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventIntegrationConnection" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT,
    "connectionStatus" "EventIntegrationConnectionStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "syncMode" "EventIntegrationSyncMode" NOT NULL DEFAULT 'READ_ONLY',
    "lastSyncAt" TIMESTAMP(3),
    "canPullAttendees" BOOLEAN NOT NULL DEFAULT false,
    "canCreateAttendees" BOOLEAN NOT NULL DEFAULT false,
    "canUpdateAttendees" BOOLEAN NOT NULL DEFAULT false,
    "canCancelAttendees" BOOLEAN NOT NULL DEFAULT false,
    "canPullSessions" BOOLEAN NOT NULL DEFAULT false,
    "canPushSessions" BOOLEAN NOT NULL DEFAULT false,
    "canPullSessionRegistrations" BOOLEAN NOT NULL DEFAULT false,
    "canPushSessionRegistrations" BOOLEAN NOT NULL DEFAULT false,
    "supportsWebhooks" BOOLEAN NOT NULL DEFAULT false,
    "supportsOrders" BOOLEAN NOT NULL DEFAULT false,
    "supportsBadgeTypes" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventIntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventExternalIdentity" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "directoryPersonId" UUID NOT NULL,
    "attendeeId" UUID,
    "provider" TEXT NOT NULL,
    "externalObjectType" TEXT NOT NULL,
    "externalObjectId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventAttendee_directoryPersonId_key" ON "EventAttendee"("directoryPersonId");

-- CreateIndex
CREATE INDEX "EventAttendee_eventId_registrationStatus_idx" ON "EventAttendee"("eventId", "registrationStatus");

-- CreateIndex
CREATE INDEX "EventAttendee_eventId_attendanceStatus_idx" ON "EventAttendee"("eventId", "attendanceStatus");

-- CreateIndex
CREATE INDEX "EventAttendee_eventId_source_idx" ON "EventAttendee"("eventId", "source");

-- CreateIndex
CREATE INDEX "EventAttendee_eventId_syncStatus_idx" ON "EventAttendee"("eventId", "syncStatus");

-- CreateIndex
CREATE INDEX "EventAttendee_directoryPersonId_idx" ON "EventAttendee"("directoryPersonId");

-- CreateIndex
CREATE INDEX "EventRegistrationRecord_attendeeId_idx" ON "EventRegistrationRecord"("attendeeId");

-- CreateIndex
CREATE INDEX "EventRegistrationRecord_directoryPersonId_idx" ON "EventRegistrationRecord"("directoryPersonId");

-- CreateIndex
CREATE INDEX "EventRegistrationRecord_eventId_provider_idx" ON "EventRegistrationRecord"("eventId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistrationRecord_eventId_provider_externalRegistrati_key" ON "EventRegistrationRecord"("eventId", "provider", "externalRegistrationId");

-- CreateIndex
CREATE INDEX "EventIntegrationConnection_eventId_idx" ON "EventIntegrationConnection"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventIntegrationConnection_eventId_provider_key" ON "EventIntegrationConnection"("eventId", "provider");

-- CreateIndex
CREATE INDEX "EventExternalIdentity_directoryPersonId_idx" ON "EventExternalIdentity"("directoryPersonId");

-- CreateIndex
CREATE INDEX "EventExternalIdentity_attendeeId_idx" ON "EventExternalIdentity"("attendeeId");

-- CreateIndex
CREATE INDEX "EventExternalIdentity_eventId_provider_idx" ON "EventExternalIdentity"("eventId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "EventExternalIdentity_eventId_provider_externalObjectType_e_key" ON "EventExternalIdentity"("eventId", "provider", "externalObjectType", "externalObjectId");

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_directoryPersonId_fkey" FOREIGN KEY ("directoryPersonId") REFERENCES "EventDirectoryPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistrationRecord" ADD CONSTRAINT "EventRegistrationRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistrationRecord" ADD CONSTRAINT "EventRegistrationRecord_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "EventAttendee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistrationRecord" ADD CONSTRAINT "EventRegistrationRecord_directoryPersonId_fkey" FOREIGN KEY ("directoryPersonId") REFERENCES "EventDirectoryPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIntegrationConnection" ADD CONSTRAINT "EventIntegrationConnection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventExternalIdentity" ADD CONSTRAINT "EventExternalIdentity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventExternalIdentity" ADD CONSTRAINT "EventExternalIdentity_directoryPersonId_fkey" FOREIGN KEY ("directoryPersonId") REFERENCES "EventDirectoryPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventExternalIdentity" ADD CONSTRAINT "EventExternalIdentity_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "EventAttendee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

