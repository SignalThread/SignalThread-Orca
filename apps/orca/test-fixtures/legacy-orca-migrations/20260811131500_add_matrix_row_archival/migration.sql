ALTER TABLE "MatrixRow" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "MatrixRow_eventId_archivedAt_idx" ON "MatrixRow"("eventId", "archivedAt");
