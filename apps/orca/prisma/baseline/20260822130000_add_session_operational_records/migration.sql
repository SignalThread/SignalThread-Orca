CREATE TABLE "SessionOperationalRecord" (
  "id" UUID NOT NULL, "eventId" UUID NOT NULL, "sessionId" UUID NOT NULL,
  "module" "SessionOptionalModule" NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "ownerPersonId" UUID, "partnerName" TEXT,
  "onsiteContact" TEXT, "scope" TEXT, "arrivalAt" TIMESTAMP(3), "confirmedAt" TIMESTAMP(3),
  "notes" TEXT, "documentUrl" TEXT, "notNeededAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionOperationalRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SessionOperationalRecord_eventId_sessionId_module_idx" ON "SessionOperationalRecord"("eventId", "sessionId", "module");
CREATE INDEX "SessionOperationalRecord_sessionId_module_status_idx" ON "SessionOperationalRecord"("sessionId", "module", "status");
CREATE INDEX "SessionOperationalRecord_ownerPersonId_idx" ON "SessionOperationalRecord"("ownerPersonId");
ALTER TABLE "SessionOperationalRecord" ADD CONSTRAINT "SessionOperationalRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionOperationalRecord" ADD CONSTRAINT "SessionOperationalRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionOperationalRecord" ADD CONSTRAINT "SessionOperationalRecord_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "EventPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
