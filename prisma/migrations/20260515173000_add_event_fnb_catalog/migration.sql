CREATE TABLE IF NOT EXISTS "EventFnbCatalogItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "eventId" UUID NOT NULL,
  "itemName" TEXT NOT NULL,
  "description" TEXT,
  "price" TEXT,
  "unit" TEXT,
  "category" TEXT,
  "sourceMenuFileName" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventFnbCatalogItem_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventFnbCatalogItem_eventId_fkey'
  ) THEN
    ALTER TABLE "EventFnbCatalogItem"
      ADD CONSTRAINT "EventFnbCatalogItem_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EventFnbCatalogItem_eventId_idx"
  ON "EventFnbCatalogItem"("eventId");

CREATE INDEX IF NOT EXISTS "EventFnbCatalogItem_eventId_category_idx"
  ON "EventFnbCatalogItem"("eventId", "category");

CREATE INDEX IF NOT EXISTS "EventFnbCatalogItem_eventId_archivedAt_idx"
  ON "EventFnbCatalogItem"("eventId", "archivedAt");
