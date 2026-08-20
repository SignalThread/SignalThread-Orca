-- Additive Timeline Dashboard taxonomy migration.
-- Adds workstream (top-level category), planningStage (subcategory), and an
-- explicit critical-path flag to TimelineItem. Fully additive: new enum types,
-- nullable workstream/planningStage columns, and a defaulted boolean so existing
-- rows are unaffected. No columns are dropped, renamed, or destructively altered.

-- CreateEnum
CREATE TYPE "TimelineWorkstream" AS ENUM ('VENUE', 'HOUSING', 'REGISTRATION', 'SPEAKERS', 'SPONSORS', 'FNB', 'PRODUCTION', 'MARKETING');

-- CreateEnum
CREATE TYPE "TimelinePlanningStage" AS ENUM ('PRE_PLANNING', 'PLANNING', 'BUILD', 'SHOW_WEEK', 'CLOSE');

-- AlterTable
ALTER TABLE "TimelineItem"
  ADD COLUMN "workstream" "TimelineWorkstream",
  ADD COLUMN "planningStage" "TimelinePlanningStage",
  ADD COLUMN "isCriticalPath" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "TimelineItem_eventId_workstream_idx" ON "TimelineItem"("eventId", "workstream");

-- CreateIndex
CREATE INDEX "TimelineItem_eventId_planningStage_idx" ON "TimelineItem"("eventId", "planningStage");
