-- Add new event-scoped fields
ALTER TABLE "DocumentCategory"
ADD COLUMN "eventId" UUID,
ADD COLUMN "slug" TEXT;

-- Backfill slug from name
UPDATE "DocumentCategory"
SET "slug" = lower(regexp_replace(trim("name"), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE "slug" IS NULL;

UPDATE "DocumentCategory"
SET "slug" = trim(both '-' from "slug")
WHERE "slug" IS NOT NULL;

-- Backfill eventId from existing document usage
UPDATE "DocumentCategory" dc
SET "eventId" = src."eventId"
FROM (
  SELECT d."categoryId", min(d."eventId"::text)::uuid AS "eventId"
  FROM "Document" d
  GROUP BY d."categoryId"
) src
WHERE dc."id" = src."categoryId"
  AND dc."eventId" IS NULL;

-- Fallback for categories with no documents: pick first event in same org
UPDATE "DocumentCategory" dc
SET "eventId" = (
  SELECT ev."id"
  FROM "Event" ev
  WHERE ev."orgId" = dc."orgId"
  ORDER BY ev."createdAt" ASC
  LIMIT 1
)
WHERE dc."eventId" IS NULL;

-- Ensure each event/document points to an event-scoped category row.
INSERT INTO "DocumentCategory" ("id", "eventId", "name", "slug", "color", "createdAt", "updatedAt")
SELECT gen_random_uuid(), d."eventId", c."name", c."slug", c."color", now(), now()
FROM "Document" d
JOIN "DocumentCategory" c ON c."id" = d."categoryId"
LEFT JOIN "DocumentCategory" existing
  ON existing."eventId" = d."eventId"
 AND existing."slug" = c."slug"
WHERE existing."id" IS NULL;

UPDATE "Document" d
SET "categoryId" = target."id"
FROM "DocumentCategory" source
JOIN "DocumentCategory" target ON target."slug" = source."slug"
WHERE d."categoryId" = source."id"
  AND target."eventId" = d."eventId"
  AND source."eventId" IS DISTINCT FROM d."eventId";

-- Enforce non-null and new constraints
ALTER TABLE "DocumentCategory"
ALTER COLUMN "eventId" SET NOT NULL,
ALTER COLUMN "slug" SET NOT NULL;

-- Remove old org-scoped constraints/indexes and relation
DROP INDEX IF EXISTS "DocumentCategory_orgId_idx";
DROP INDEX IF EXISTS "DocumentCategory_orgId_name_key";
ALTER TABLE "DocumentCategory" DROP CONSTRAINT IF EXISTS "DocumentCategory_orgId_fkey";
ALTER TABLE "DocumentCategory" DROP COLUMN IF EXISTS "orgId";

-- Add event-scoped indexes/constraints
CREATE INDEX "DocumentCategory_eventId_idx" ON "DocumentCategory" ("eventId");
CREATE UNIQUE INDEX "DocumentCategory_eventId_slug_key" ON "DocumentCategory" ("eventId", "slug");
ALTER TABLE "DocumentCategory"
ADD CONSTRAINT "DocumentCategory_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
