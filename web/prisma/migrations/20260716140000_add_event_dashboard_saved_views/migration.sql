-- CONTROLLED RECOVERY PLACEHOLDER (2026-08-06)
-- The original migration is unrecoverable. This is not a recovered historical file.
-- It is idempotent DDL derived from the audited live catalog, used only to make a
-- new canonical chain reproducible. It does not rewrite or delete application data.
DO $$ BEGIN
  CREATE TYPE "EventDashboardViewStarterKey" AS ENUM ('EXECUTIVE', 'EVENT_LEAD', 'FUNCTIONAL', 'CUSTOM', 'MIGRATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "EventDashboardViewVisibility" AS ENUM ('PRIVATE', 'TEAM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "EventDashboardView" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "eventId" UUID NOT NULL, "ownerUserId" UUID NOT NULL,
  "name" TEXT NOT NULL, "description" TEXT, "starterKey" "EventDashboardViewStarterKey" NOT NULL,
  "visibility" "EventDashboardViewVisibility" NOT NULL DEFAULT 'PRIVATE', "isTeamDefault" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3), "layoutVersion" INTEGER NOT NULL DEFAULT 1, "configuration" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventDashboardView_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventDashboardView_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "EventDashboardView_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "EventDashboardView_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "EventDashboardViewPreference" (
  "id" UUID NOT NULL, "viewId" UUID NOT NULL, "userId" UUID NOT NULL, "isPersonalDefault" BOOLEAN NOT NULL DEFAULT false,
  "lastUsedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventDashboardViewPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventDashboardViewPreference_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "EventDashboardView"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "EventDashboardViewPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "EventDashboardView_organizationId_idx" ON "EventDashboardView"("organizationId");
CREATE INDEX IF NOT EXISTS "EventDashboardView_eventId_archivedAt_idx" ON "EventDashboardView"("eventId", "archivedAt");
CREATE INDEX IF NOT EXISTS "EventDashboardView_eventId_visibility_idx" ON "EventDashboardView"("eventId", "visibility");
CREATE INDEX IF NOT EXISTS "EventDashboardView_ownerUserId_eventId_idx" ON "EventDashboardView"("ownerUserId", "eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "EventDashboardView_one_active_team_default_per_event" ON "EventDashboardView"("eventId") WHERE "isTeamDefault" = true AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "EventDashboardViewPreference_viewId_userId_key" ON "EventDashboardViewPreference"("viewId", "userId");
CREATE INDEX IF NOT EXISTS "EventDashboardViewPreference_userId_isPersonalDefault_idx" ON "EventDashboardViewPreference"("userId", "isPersonalDefault");
