CREATE TYPE "RegistrationAgendaSource" AS ENUM ('SHOWOPS', 'SPREADSHEET', 'MANUAL', 'PDF_REFERENCE');
CREATE TYPE "RegistrationAgendaPublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED');

CREATE TABLE "RegistrationAgendaEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "eventId" UUID NOT NULL,
  "source" "RegistrationAgendaSource" NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "sourceSessionId" UUID,
  "sourceUpdatedAt" TIMESTAMP(3),
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dayDate" DATE NOT NULL,
  "startTime" TIME(6) NOT NULL,
  "endTime" TIME(6) NOT NULL,
  "location" TEXT,
  "sessionType" TEXT,
  "officialStatus" TEXT,
  "speakers" JSONB NOT NULL DEFAULT '[]',
  "publicationStatus" "RegistrationAgendaPublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceFileName" TEXT,
  "sourceReference" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdByUserId" UUID,
  "updatedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationAgendaEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RegistrationAgendaEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RegistrationAgendaEntry_sourceSessionId_fkey" FOREIGN KEY ("sourceSessionId") REFERENCES "MatrixRow"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RegistrationAgendaEntry_sourceSessionId_key" ON "RegistrationAgendaEntry"("sourceSessionId");
CREATE UNIQUE INDEX "RegistrationAgendaEntry_eventId_source_sourceKey_key" ON "RegistrationAgendaEntry"("eventId", "source", "sourceKey");
CREATE INDEX "RegistrationAgendaEntry_eventId_archivedAt_dayDate_startTime_idx" ON "RegistrationAgendaEntry"("eventId", "archivedAt", "dayDate", "startTime");
CREATE INDEX "RegistrationAgendaEntry_eventId_publicationStatus_idx" ON "RegistrationAgendaEntry"("eventId", "publicationStatus");
