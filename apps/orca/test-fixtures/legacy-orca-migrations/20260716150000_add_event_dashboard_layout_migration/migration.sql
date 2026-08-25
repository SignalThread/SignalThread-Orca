-- CONTROLLED RECOVERY PLACEHOLDER (2026-08-06)
-- The original migration is unrecoverable. This non-destructive, idempotent
-- catalog-parity DDL is not presented as historical source truth.
CREATE TABLE IF NOT EXISTS "EventDashboardLayoutMigration" (
  "id" UUID NOT NULL, "eventId" UUID NOT NULL, "userId" UUID NOT NULL, "sourceKey" TEXT NOT NULL,
  "viewId" UUID, "outcome" TEXT NOT NULL, "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventDashboardLayoutMigration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventDashboardLayoutMigration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "EventDashboardLayoutMigration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "EventDashboardLayoutMigration_eventId_userId_key" ON "EventDashboardLayoutMigration"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "EventDashboardLayoutMigration_userId_idx" ON "EventDashboardLayoutMigration"("userId");
