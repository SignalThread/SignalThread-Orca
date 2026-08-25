CREATE TABLE IF NOT EXISTS "SeatingPlan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "eventId" UUID NOT NULL,
  "matrixRowId" UUID,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SeatingPlan_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SeatingTable"
  ADD COLUMN IF NOT EXISTS "seatingPlanId" UUID;

ALTER TABLE "SeatingAssignment"
  ADD COLUMN IF NOT EXISTS "seatIndex" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "SeatingPlan_matrixRowId_key" ON "SeatingPlan"("matrixRowId");
CREATE INDEX IF NOT EXISTS "SeatingPlan_eventId_idx" ON "SeatingPlan"("eventId");
CREATE INDEX IF NOT EXISTS "SeatingPlan_eventId_matrixRowId_idx" ON "SeatingPlan"("eventId", "matrixRowId");
CREATE INDEX IF NOT EXISTS "SeatingTable_eventId_seatingPlanId_sortOrder_idx" ON "SeatingTable"("eventId", "seatingPlanId", "sortOrder");
CREATE INDEX IF NOT EXISTS "SeatingTable_seatingPlanId_idx" ON "SeatingTable"("seatingPlanId");
CREATE UNIQUE INDEX IF NOT EXISTS "SeatingAssignment_tableId_seatIndex_key" ON "SeatingAssignment"("tableId", "seatIndex");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SeatingPlan_eventId_fkey') THEN
    ALTER TABLE "SeatingPlan"
      ADD CONSTRAINT "SeatingPlan_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SeatingPlan_matrixRowId_fkey') THEN
    ALTER TABLE "SeatingPlan"
      ADD CONSTRAINT "SeatingPlan_matrixRowId_fkey"
      FOREIGN KEY ("matrixRowId") REFERENCES "MatrixRow"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SeatingTable_seatingPlanId_fkey') THEN
    ALTER TABLE "SeatingTable"
      ADD CONSTRAINT "SeatingTable_seatingPlanId_fkey"
      FOREIGN KEY ("seatingPlanId") REFERENCES "SeatingPlan"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
