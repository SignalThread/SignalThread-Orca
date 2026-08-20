-- Add parent-child nesting support for timeline items
ALTER TABLE "TimelineItem"
ADD COLUMN "parentId" UUID;

ALTER TABLE "TimelineItem"
ADD CONSTRAINT "TimelineItem_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "TimelineItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TimelineItem_eventId_parentId_sortOrder_idx"
ON "TimelineItem"("eventId", "parentId", "sortOrder");
