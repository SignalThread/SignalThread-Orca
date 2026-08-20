DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventFnbSourceMenuSourceType') THEN
    CREATE TYPE "EventFnbSourceMenuSourceType" AS ENUM ('ORIGINAL', 'AMENDMENT', 'REPLACEMENT');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventFnbSourceMenuStatus') THEN
    CREATE TYPE "EventFnbSourceMenuStatus" AS ENUM (
      'UPLOADED',
      'READING_PDF',
      'MAPPING_SECTIONS',
      'EXTRACTING_ITEMS',
      'REVIEW_NEEDED',
      'COMPLETE',
      'FAILED',
      'ARCHIVED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EventFnbSourceMenu" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "eventId" UUID NOT NULL,
  "menuName" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "sourceType" "EventFnbSourceMenuSourceType" NOT NULL DEFAULT 'ORIGINAL',
  "status" "EventFnbSourceMenuStatus" NOT NULL DEFAULT 'UPLOADED',
  "objectKey" TEXT NOT NULL,
  "itemsFound" INTEGER NOT NULL DEFAULT 0,
  "progressSummary" TEXT,
  "lastError" TEXT,
  "baseSourceMenuId" UUID,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventFnbSourceMenu_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventFnbSourceMenu_eventId_fkey'
  ) THEN
    ALTER TABLE "EventFnbSourceMenu"
      ADD CONSTRAINT "EventFnbSourceMenu_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventFnbSourceMenu_baseSourceMenuId_fkey'
  ) THEN
    ALTER TABLE "EventFnbSourceMenu"
      ADD CONSTRAINT "EventFnbSourceMenu_baseSourceMenuId_fkey"
      FOREIGN KEY ("baseSourceMenuId") REFERENCES "EventFnbSourceMenu"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "EventFnbCatalogItem"
  ADD COLUMN IF NOT EXISTS "sourceMenuId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventFnbCatalogItem_sourceMenuId_fkey'
  ) THEN
    ALTER TABLE "EventFnbCatalogItem"
      ADD CONSTRAINT "EventFnbCatalogItem_sourceMenuId_fkey"
      FOREIGN KEY ("sourceMenuId") REFERENCES "EventFnbSourceMenu"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EventFnbSourceMenu_eventId_archivedAt_idx"
  ON "EventFnbSourceMenu"("eventId", "archivedAt");

CREATE INDEX IF NOT EXISTS "EventFnbSourceMenu_eventId_status_idx"
  ON "EventFnbSourceMenu"("eventId", "status");

CREATE INDEX IF NOT EXISTS "EventFnbSourceMenu_baseSourceMenuId_idx"
  ON "EventFnbSourceMenu"("baseSourceMenuId");

CREATE INDEX IF NOT EXISTS "EventFnbSourceMenu_objectKey_idx"
  ON "EventFnbSourceMenu"("objectKey");

CREATE INDEX IF NOT EXISTS "EventFnbCatalogItem_sourceMenuId_idx"
  ON "EventFnbCatalogItem"("sourceMenuId");

WITH existing_sources AS (
  SELECT
    "eventId",
    "sourceMenuFileName",
    regexp_replace("sourceMenuFileName", '\.[^.]+$', '') AS "menuName",
    COUNT(*)::INTEGER AS "itemsFound",
    MAX("updatedAt") AS "latestUpdated"
  FROM "EventFnbCatalogItem"
  WHERE "sourceMenuId" IS NULL
    AND "sourceMenuFileName" IS NOT NULL
    AND btrim("sourceMenuFileName") <> ''
  GROUP BY "eventId", "sourceMenuFileName"
),
inserted_sources AS (
  INSERT INTO "EventFnbSourceMenu" (
    "eventId",
    "menuName",
    "fileName",
    "sourceType",
    "status",
    "objectKey",
    "itemsFound",
    "progressSummary",
    "createdAt",
    "updatedAt"
  )
  SELECT
    "eventId",
    COALESCE(NULLIF("menuName", ''), "sourceMenuFileName"),
    "sourceMenuFileName",
    'ORIGINAL'::"EventFnbSourceMenuSourceType",
    'COMPLETE'::"EventFnbSourceMenuStatus",
    'backfill:' || "eventId"::TEXT || ':' || md5("sourceMenuFileName"),
    "itemsFound",
    "itemsFound"::TEXT || ' approved item' || CASE WHEN "itemsFound" = 1 THEN ' available' ELSE 's available' END,
    COALESCE("latestUpdated", CURRENT_TIMESTAMP),
    COALESCE("latestUpdated", CURRENT_TIMESTAMP)
  FROM existing_sources
  RETURNING "id", "eventId", "fileName"
)
UPDATE "EventFnbCatalogItem" item
SET "sourceMenuId" = source."id"
FROM inserted_sources source
WHERE item."sourceMenuId" IS NULL
  AND item."eventId" = source."eventId"
  AND item."sourceMenuFileName" = source."fileName";
