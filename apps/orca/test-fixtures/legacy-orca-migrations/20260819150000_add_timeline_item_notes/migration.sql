-- Preserve imported Timeline source notes as canonical planner context.
ALTER TABLE "TimelineItem" ADD COLUMN "notes" TEXT;

CREATE TABLE "TimelineImportBatch" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "importedCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimelineImportBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TimelineImportBatch_eventId_requestedByUserId_idempotencyKey_key" ON "TimelineImportBatch"("eventId", "requestedByUserId", "idempotencyKey");
CREATE INDEX "TimelineImportBatch_eventId_createdAt_idx" ON "TimelineImportBatch"("eventId", "createdAt");
CREATE INDEX "TimelineImportBatch_requestedByUserId_createdAt_idx" ON "TimelineImportBatch"("requestedByUserId", "createdAt");
ALTER TABLE "TimelineImportBatch" ADD CONSTRAINT "TimelineImportBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimelineImportBatch" ADD CONSTRAINT "TimelineImportBatch_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
