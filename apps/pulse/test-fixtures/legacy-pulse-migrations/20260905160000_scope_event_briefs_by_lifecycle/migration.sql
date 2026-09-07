ALTER TABLE "EventClosingBriefSnapshot"
ADD COLUMN "lifecyclePhase" TEXT;

-- Existing snapshots were produced exclusively by the legacy POST-only path.
UPDATE "EventClosingBriefSnapshot"
SET "lifecyclePhase" = 'POST_EVENT'
WHERE "lifecyclePhase" IS NULL;

ALTER TABLE "EventClosingBriefSnapshot"
ALTER COLUMN "lifecyclePhase" SET NOT NULL;

DROP INDEX IF EXISTS "EventClosingBriefSnapshot_eventId_key";

CREATE UNIQUE INDEX "EventClosingBriefSnapshot_eventId_lifecyclePhase_key"
ON "EventClosingBriefSnapshot"("eventId", "lifecyclePhase");
