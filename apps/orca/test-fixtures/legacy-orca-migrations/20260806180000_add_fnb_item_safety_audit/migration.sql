ALTER TABLE "EventFnbCatalogItem"
  ADD COLUMN "serviceNotes" TEXT,
  ADD COLUMN "vendorNotes" TEXT;

CREATE TABLE "EventFnbCatalogItemSafetyRevision" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "reason" TEXT,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventFnbCatalogItemSafetyRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventFnbCatalogItemSafetyRevision_eventId_createdAt_idx" ON "EventFnbCatalogItemSafetyRevision"("eventId", "createdAt");
CREATE INDEX "EventFnbCatalogItemSafetyRevision_itemId_createdAt_idx" ON "EventFnbCatalogItemSafetyRevision"("itemId", "createdAt");
ALTER TABLE "EventFnbCatalogItemSafetyRevision" ADD CONSTRAINT "EventFnbCatalogItemSafetyRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventFnbCatalogItemSafetyRevision" ADD CONSTRAINT "EventFnbCatalogItemSafetyRevision_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "EventFnbCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
