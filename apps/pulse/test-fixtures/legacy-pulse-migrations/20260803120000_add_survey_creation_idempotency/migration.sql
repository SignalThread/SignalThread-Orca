-- Make interactive Voice Events survey creation safe to retry after a lost or
-- misleading response. PostgreSQL permits multiple NULL values, preserving all
-- existing and non-interactive Survey creation paths.
ALTER TABLE "Survey"
ADD COLUMN "creationRequestId" TEXT;

CREATE UNIQUE INDEX "Survey_eventId_creationRequestId_key"
ON "Survey"("eventId", "creationRequestId");
