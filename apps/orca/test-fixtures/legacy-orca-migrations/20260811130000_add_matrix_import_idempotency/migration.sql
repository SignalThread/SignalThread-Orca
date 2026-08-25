CREATE TABLE "MatrixImportBatch" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "importedCount" INTEGER NOT NULL,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatrixImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatrixImportBatch_eventId_requestedByUserId_idempotencyKey_key"
ON "MatrixImportBatch"("eventId", "requestedByUserId", "idempotencyKey");

CREATE INDEX "MatrixImportBatch_eventId_createdAt_idx" ON "MatrixImportBatch"("eventId", "createdAt");
CREATE INDEX "MatrixImportBatch_requestedByUserId_createdAt_idx" ON "MatrixImportBatch"("requestedByUserId", "createdAt");

ALTER TABLE "MatrixImportBatch"
ADD CONSTRAINT "MatrixImportBatch_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatrixImportBatch"
ADD CONSTRAINT "MatrixImportBatch_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
