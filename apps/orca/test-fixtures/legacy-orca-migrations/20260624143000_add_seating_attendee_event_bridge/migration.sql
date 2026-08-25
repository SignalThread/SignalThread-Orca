-- Bridge canonical EventAttendee records into legacy seating identities.
-- This keeps existing SeatingAssignment compatibility while letting Room Set
-- surface attendee-backed people without duplicating them.

-- AddColumn
ALTER TABLE "SeatingAttendee"
ADD COLUMN IF NOT EXISTS "eventAttendeeId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SeatingAttendee_eventAttendeeId_key"
ON "SeatingAttendee"("eventAttendeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SeatingAttendee_eventId_eventAttendeeId_idx"
ON "SeatingAttendee"("eventId", "eventAttendeeId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SeatingAttendee_eventAttendeeId_fkey'
  ) THEN
    ALTER TABLE "SeatingAttendee"
    ADD CONSTRAINT "SeatingAttendee_eventAttendeeId_fkey"
    FOREIGN KEY ("eventAttendeeId") REFERENCES "EventAttendee"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
