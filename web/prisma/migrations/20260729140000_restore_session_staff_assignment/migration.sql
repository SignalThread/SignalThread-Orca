-- The original session-operations migration is recorded as applied in some
-- development databases where this already-schema-defined table is absent.
-- Restore only the missing canonical table before the Slice 4 reconciliation.
CREATE TABLE IF NOT EXISTS "SessionStaffAssignment" (
    "sessionId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SessionStaffAssignment_pkey" PRIMARY KEY ("sessionId", "personId")
);

CREATE INDEX IF NOT EXISTS "SessionStaffAssignment_personId_idx"
  ON "SessionStaffAssignment"("personId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionStaffAssignment_sessionId_fkey') THEN
    ALTER TABLE "SessionStaffAssignment"
      ADD CONSTRAINT "SessionStaffAssignment_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SessionStaffAssignment_personId_fkey') THEN
    ALTER TABLE "SessionStaffAssignment"
      ADD CONSTRAINT "SessionStaffAssignment_personId_fkey"
      FOREIGN KEY ("personId") REFERENCES "EventPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
