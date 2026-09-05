-- CreateEnum
CREATE TYPE "EventStructureItemKind" AS ENUM ('EVENT', 'SESSION', 'AREA', 'SPONSOR_ACTIVATION', 'CUSTOM_TOUCHPOINT');

-- AlterTable
ALTER TABLE "SurveyTarget" ADD COLUMN "eventStructureItemId" TEXT;

-- CreateTable
CREATE TABLE "EventStructureItem" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "EventStructureItemKind" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "locationId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "timezone" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventStructureItem_pkey" PRIMARY KEY ("id")
);

-- Backfill one canonical event structure item for each existing SurveyTarget.
-- SurveyTarget remains the backward-compatible survey targeting snapshot.
INSERT INTO "EventStructureItem" (
    "id",
    "eventId",
    "kind",
    "name",
    "slug",
    "description",
    "parentId",
    "locationId",
    "startsAt",
    "endsAt",
    "timezone",
    "sortOrder",
    "metadata",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    st."id",
    st."eventId",
    CASE st."category"
        WHEN 'EVENT' THEN 'EVENT'::"EventStructureItemKind"
        WHEN 'SESSION' THEN 'SESSION'::"EventStructureItemKind"
        WHEN 'LOCATION' THEN 'AREA'::"EventStructureItemKind"
        WHEN 'CUSTOM' THEN 'CUSTOM_TOUCHPOINT'::"EventStructureItemKind"
    END,
    st."name",
    st."slug",
    st."description",
    NULL,
    st."locationId",
    NULL,
    NULL,
    NULL,
    0,
    st."metadata",
    st."isActive",
    st."createdAt",
    st."updatedAt"
FROM "SurveyTarget" st;

UPDATE "SurveyTarget"
SET "eventStructureItemId" = "id"
WHERE "eventStructureItemId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EventStructureItem_eventId_slug_key" ON "EventStructureItem"("eventId", "slug");

-- CreateIndex
CREATE INDEX "EventStructureItem_eventId_idx" ON "EventStructureItem"("eventId");

-- CreateIndex
CREATE INDEX "EventStructureItem_kind_idx" ON "EventStructureItem"("kind");

-- CreateIndex
CREATE INDEX "EventStructureItem_parentId_idx" ON "EventStructureItem"("parentId");

-- CreateIndex
CREATE INDEX "EventStructureItem_locationId_idx" ON "EventStructureItem"("locationId");

-- CreateIndex
CREATE INDEX "SurveyTarget_eventStructureItemId_idx" ON "SurveyTarget"("eventStructureItemId");

-- AddForeignKey
ALTER TABLE "EventStructureItem" ADD CONSTRAINT "EventStructureItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStructureItem" ADD CONSTRAINT "EventStructureItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "EventStructureItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStructureItem" ADD CONSTRAINT "EventStructureItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyTarget" ADD CONSTRAINT "SurveyTarget_eventStructureItemId_fkey" FOREIGN KEY ("eventStructureItemId") REFERENCES "EventStructureItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
