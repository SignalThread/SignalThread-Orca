CREATE TABLE IF NOT EXISTS "SessionFnbCatalogAssignment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sessionId" UUID NOT NULL,
  "eventFnbCatalogItemId" UUID NOT NULL,
  "quantity" INTEGER,
  "serviceTiming" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionFnbCatalogAssignment_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SessionFnbCatalogAssignment_sessionId_fkey'
  ) THEN
    ALTER TABLE "SessionFnbCatalogAssignment"
      ADD CONSTRAINT "SessionFnbCatalogAssignment_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SessionFnbCatalogAssignment_eventFnbCatalogItemId_fkey'
  ) THEN
    ALTER TABLE "SessionFnbCatalogAssignment"
      ADD CONSTRAINT "SessionFnbCatalogAssignment_eventFnbCatalogItemId_fkey"
      FOREIGN KEY ("eventFnbCatalogItemId") REFERENCES "EventFnbCatalogItem"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SessionFnbCatalogAssignment_sessionId_eventFnbCatalogItemId_key"
  ON "SessionFnbCatalogAssignment"("sessionId", "eventFnbCatalogItemId");

CREATE INDEX IF NOT EXISTS "SessionFnbCatalogAssignment_sessionId_idx"
  ON "SessionFnbCatalogAssignment"("sessionId");

CREATE INDEX IF NOT EXISTS "SessionFnbCatalogAssignment_eventFnbCatalogItemId_idx"
  ON "SessionFnbCatalogAssignment"("eventFnbCatalogItemId");
