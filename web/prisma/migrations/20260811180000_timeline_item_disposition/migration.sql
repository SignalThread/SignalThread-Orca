CREATE TYPE "TimelineItemDisposition" AS ENUM ('ACTIVE', 'NOT_NEEDED');

ALTER TABLE "TimelineItem"
  ADD COLUMN "disposition" "TimelineItemDisposition" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "dispositionReason" TEXT,
  ADD COLUMN "dispositionActorUserId" UUID,
  ADD COLUMN "dispositionAt" TIMESTAMP(3);

ALTER TABLE "TimelineItem"
  ADD CONSTRAINT "TimelineItem_dispositionActorUserId_fkey"
  FOREIGN KEY ("dispositionActorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TimelineItem"
  ADD CONSTRAINT "TimelineItem_not_needed_evidence_check"
  CHECK (
    ("disposition" = 'ACTIVE' AND "dispositionReason" IS NULL AND "dispositionActorUserId" IS NULL AND "dispositionAt" IS NULL)
    OR
    ("disposition" = 'NOT_NEEDED' AND length(btrim("dispositionReason")) > 0 AND "dispositionActorUserId" IS NOT NULL AND "dispositionAt" IS NOT NULL)
  );

CREATE INDEX "TimelineItem_eventId_disposition_endDate_idx"
  ON "TimelineItem"("eventId", "disposition", "endDate");
