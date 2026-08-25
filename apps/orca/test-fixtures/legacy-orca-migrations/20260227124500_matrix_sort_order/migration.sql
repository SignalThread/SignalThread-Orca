ALTER TABLE "MatrixRow"
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "eventId"
      ORDER BY "dayDate" ASC, "startTime" ASC, "createdAt" ASC
    ) - 1 AS next_order
  FROM "MatrixRow"
)
UPDATE "MatrixRow" m
SET "sortOrder" = ranked.next_order
FROM ranked
WHERE ranked."id" = m."id";

CREATE INDEX IF NOT EXISTS "MatrixRow_eventId_dayDate_startTime_sortOrder_idx"
ON "MatrixRow"("eventId", "dayDate", "startTime", "sortOrder");

CREATE INDEX IF NOT EXISTS "MatrixRow_eventId_idx"
ON "MatrixRow"("eventId");
