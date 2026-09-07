CREATE TABLE "RegistrationAgendaImportBatch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "eventId" UUID NOT NULL,
  "source" "RegistrationAgendaSource" NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT,
  "sizeBytes" INTEGER NOT NULL,
  "mapping" JSONB,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "importedCount" INTEGER NOT NULL DEFAULT 0,
  "invalidCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL,
  "referenceOnly" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistrationAgendaImportBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RegistrationAgendaImportBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RegistrationAgendaImportBatch_eventId_createdAt_idx" ON "RegistrationAgendaImportBatch"("eventId", "createdAt");
