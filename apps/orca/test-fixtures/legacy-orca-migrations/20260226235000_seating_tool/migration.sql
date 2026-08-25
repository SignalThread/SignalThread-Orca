-- Alter seating attendee shape to first/last name while preserving existing values.
ALTER TABLE "SeatingAttendee"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT;

UPDATE "SeatingAttendee"
SET
  "firstName" = COALESCE(NULLIF(split_part("name", ' ', 1), ''), 'Attendee'),
  "lastName" = COALESCE(
    NULLIF(trim(substr("name", length(split_part("name", ' ', 1)) + 1)), ''),
    ''
  );

ALTER TABLE "SeatingAttendee"
  ALTER COLUMN "firstName" SET NOT NULL,
  ALTER COLUMN "lastName" SET NOT NULL;

DROP INDEX IF EXISTS "SeatingAttendee_eventId_name_idx";
CREATE INDEX "SeatingAttendee_eventId_lastName_firstName_idx"
  ON "SeatingAttendee"("eventId", "lastName", "firstName");

ALTER TABLE "SeatingAttendee" DROP COLUMN "name";

-- Add event scoping to seat assignments.
ALTER TABLE "SeatingAssignment" ADD COLUMN "eventId" UUID;

-- Drop inconsistent legacy assignments where table event and attendee event differ.
DELETE FROM "SeatingAssignment" sa
USING "SeatingTable" st, "SeatingAttendee" at
WHERE sa."tableId" = st."id"
  AND sa."attendeeId" = at."id"
  AND st."eventId" <> at."eventId";

UPDATE "SeatingAssignment" sa
SET "eventId" = at."eventId"
FROM "SeatingAttendee" at
WHERE sa."attendeeId" = at."id";

ALTER TABLE "SeatingAssignment"
  ALTER COLUMN "eventId" SET NOT NULL;

DROP INDEX IF EXISTS "SeatingAssignment_attendeeId_key";
CREATE UNIQUE INDEX "SeatingAssignment_eventId_attendeeId_key"
  ON "SeatingAssignment"("eventId", "attendeeId");
CREATE INDEX "SeatingAssignment_eventId_idx"
  ON "SeatingAssignment"("eventId");
CREATE INDEX "SeatingAssignment_eventId_tableId_idx"
  ON "SeatingAssignment"("eventId", "tableId");

ALTER TABLE "SeatingAssignment"
  ADD CONSTRAINT "SeatingAssignment_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
