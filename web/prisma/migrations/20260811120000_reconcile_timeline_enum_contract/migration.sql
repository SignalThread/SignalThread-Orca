-- Reconcile the original TimelineItem enum names with the stable Prisma API.
--
-- Early databases created TimelineItemStatus/TimelineItemPriority. The Prisma
-- contract later shortened those names without a corresponding migration,
-- which made a clean `prisma migrate deploy` unusable with the generated
-- client. Rename in place when possible so existing values and columns are
-- preserved. If a database already has both names, move the column to the
-- canonical enum and retain the legacy type for backward compatibility.

DO $$
BEGIN
  IF to_regtype('public."TimelineStatus"') IS NULL THEN
    ALTER TYPE "TimelineItemStatus" RENAME TO "TimelineStatus";
  ELSIF to_regtype('public."TimelineItemStatus"') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'TimelineItem'
        AND column_name = 'status'
        AND udt_name = 'TimelineItemStatus'
    ) THEN
    ALTER TABLE "TimelineItem"
      ALTER COLUMN "status" TYPE "TimelineStatus"
      USING "status"::text::"TimelineStatus";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public."TimelinePriority"') IS NULL THEN
    ALTER TYPE "TimelineItemPriority" RENAME TO "TimelinePriority";
  ELSIF to_regtype('public."TimelineItemPriority"') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'TimelineItem'
        AND column_name = 'priority'
        AND udt_name = 'TimelineItemPriority'
    ) THEN
    ALTER TABLE "TimelineItem"
      ALTER COLUMN "priority" TYPE "TimelinePriority"
      USING "priority"::text::"TimelinePriority";
  END IF;
END $$;

ALTER TABLE "TimelineItem"
  ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED'::"TimelineStatus",
  ALTER COLUMN "priority" SET DEFAULT 'MEDIUM'::"TimelinePriority";

ALTER TABLE "TimelineDependency"
  ALTER COLUMN "type" SET DEFAULT 'FINISH_TO_START'::"TimelineDependencyType";

CREATE INDEX IF NOT EXISTS "TimelineItem_eventId_status_idx"
  ON "TimelineItem"("eventId", "status");
