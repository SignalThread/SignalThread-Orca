-- Add durable, nullable provenance for expected attendance.
-- Existing values intentionally remain NULL: their source is not known and must
-- never be silently relabeled as a planner estimate, RSVP, or import.
CREATE TYPE "ExpectedAttendanceSource" AS ENUM ('PLANNER_ESTIMATE', 'REGISTRATION_RSVP', 'IMPORTED');

ALTER TABLE "MatrixRow"
  ADD COLUMN "attendanceSource" "ExpectedAttendanceSource";
