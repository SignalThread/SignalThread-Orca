-- Existing sessions remain internal/operational unless a planner explicitly
-- designates them for the attendee-facing official agenda.
ALTER TABLE "MatrixRow"
ADD COLUMN IF NOT EXISTS "includeInOfficialAgenda" BOOLEAN NOT NULL DEFAULT false;
