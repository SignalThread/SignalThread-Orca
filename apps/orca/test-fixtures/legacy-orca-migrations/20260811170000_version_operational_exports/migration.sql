ALTER TABLE "EventFnbExportRecord"
  ADD COLUMN "projectionKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "projectionVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "format" TEXT NOT NULL DEFAULT 'csv',
  ADD COLUMN "rowCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "checksum" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "generatedFilename" TEXT,
  ADD COLUMN "dataAsOf" TIMESTAMP(3);

CREATE INDEX "EventFnbExportRecord_eventId_recipient_projectionKey_projectionVersion_idx"
  ON "EventFnbExportRecord"("eventId", "recipient", "projectionKey", "projectionVersion");

CREATE INDEX "EventFnbExportRecord_eventId_sourceDataVersion_idx"
  ON "EventFnbExportRecord"("eventId", "sourceDataVersion");
