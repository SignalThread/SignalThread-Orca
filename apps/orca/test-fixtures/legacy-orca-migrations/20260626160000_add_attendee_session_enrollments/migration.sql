CREATE TYPE "EventAttendeeSessionEnrollmentStatus" AS ENUM (
  'REGISTERED',
  'SELECTED',
  'WAITLISTED',
  'CANCELLED',
  'CHECKED_IN',
  'NO_SHOW'
);

CREATE TYPE "EventAttendeeSessionEnrollmentSource" AS ENUM (
  'REGISTRATION_INTEGRATION',
  'CSV_IMPORT',
  'MANUAL',
  'PORTAL',
  'SYSTEM'
);

CREATE TABLE "EventAttendeeSessionEnrollment" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "attendeeId" UUID NOT NULL,
  "matrixRowId" UUID NOT NULL,
  "enrollmentStatus" "EventAttendeeSessionEnrollmentStatus" NOT NULL DEFAULT 'REGISTERED',
  "source" "EventAttendeeSessionEnrollmentSource" NOT NULL DEFAULT 'MANUAL',
  "externalSessionRegistrationId" TEXT,
  "integrationConnectionId" UUID,
  "registrationRecordId" UUID,
  "waitlistedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "checkedInAt" TIMESTAMP(3),
  "createdByUserId" UUID,
  "updatedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventAttendeeSessionEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventAttendeeSessionEnrollment_event_attendee_session_key"
  ON "EventAttendeeSessionEnrollment"("eventId", "attendeeId", "matrixRowId");

CREATE UNIQUE INDEX "EventAttendeeSessionEnrollment_external_registration_key"
  ON "EventAttendeeSessionEnrollment"("eventId", "integrationConnectionId", "externalSessionRegistrationId")
  WHERE "integrationConnectionId" IS NOT NULL AND "externalSessionRegistrationId" IS NOT NULL;

CREATE INDEX "EventAttendeeSessionEnrollment_event_attendee_status_idx"
  ON "EventAttendeeSessionEnrollment"("eventId", "attendeeId", "enrollmentStatus");

CREATE INDEX "EventAttendeeSessionEnrollment_event_matrix_status_idx"
  ON "EventAttendeeSessionEnrollment"("eventId", "matrixRowId", "enrollmentStatus");

CREATE INDEX "EventAttendeeSessionEnrollment_event_registrationRecord_idx"
  ON "EventAttendeeSessionEnrollment"("eventId", "registrationRecordId");

CREATE INDEX "EventAttendeeSessionEnrollment_event_integrationConnection_idx"
  ON "EventAttendeeSessionEnrollment"("eventId", "integrationConnectionId");

ALTER TABLE "EventAttendeeSessionEnrollment"
  ADD CONSTRAINT "EventAttendeeSessionEnrollment_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventAttendeeSessionEnrollment"
  ADD CONSTRAINT "EventAttendeeSessionEnrollment_attendeeId_fkey"
  FOREIGN KEY ("attendeeId") REFERENCES "EventAttendee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventAttendeeSessionEnrollment"
  ADD CONSTRAINT "EventAttendeeSessionEnrollment_matrixRowId_fkey"
  FOREIGN KEY ("matrixRowId") REFERENCES "MatrixRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventAttendeeSessionEnrollment"
  ADD CONSTRAINT "EventAttendeeSessionEnrollment_integrationConnectionId_fkey"
  FOREIGN KEY ("integrationConnectionId") REFERENCES "EventIntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventAttendeeSessionEnrollment"
  ADD CONSTRAINT "EventAttendeeSessionEnrollment_registrationRecordId_fkey"
  FOREIGN KEY ("registrationRecordId") REFERENCES "EventRegistrationRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
