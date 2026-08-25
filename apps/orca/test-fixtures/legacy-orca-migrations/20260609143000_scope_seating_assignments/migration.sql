ALTER TABLE "SeatingAssignment"
  ADD COLUMN IF NOT EXISTS "seatingPlanId" UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "SeatingAssignment" sa
    LEFT JOIN "SeatingTable" st ON st."id" = sa."tableId"
    WHERE st."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot scope seating assignments: at least one assignment references a missing seating table.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "SeatingAssignment" sa
    JOIN "SeatingTable" st ON st."id" = sa."tableId"
    WHERE sa."eventId" <> st."eventId"
  ) THEN
    RAISE EXCEPTION 'Cannot scope seating assignments: at least one assignment belongs to a different event than its table.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "SeatingAssignment" sa
    JOIN "SeatingTable" st ON st."id" = sa."tableId"
    LEFT JOIN "SeatingPlan" sp ON sp."id" = st."seatingPlanId"
    WHERE st."seatingPlanId" IS NOT NULL
      AND (
        sp."id" IS NULL
        OR sp."eventId" <> sa."eventId"
        OR sp."eventId" <> st."eventId"
      )
  ) THEN
    RAISE EXCEPTION 'Cannot scope seating assignments: at least one scoped table points to a missing or mismatched seating plan.';
  END IF;
END $$;

UPDATE "SeatingAssignment" sa
SET "seatingPlanId" = st."seatingPlanId"
FROM "SeatingTable" st
WHERE sa."tableId" = st."id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "SeatingAssignment"
    WHERE "seatingPlanId" IS NULL
    GROUP BY "eventId", "attendeeId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot scope seating assignments: duplicate event-level assignments would violate event-level seating uniqueness.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "SeatingAssignment"
    WHERE "seatingPlanId" IS NOT NULL
    GROUP BY "eventId", "attendeeId", "seatingPlanId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot scope seating assignments: duplicate scoped assignments would violate plan-level seating uniqueness.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SeatingAssignment_seatingPlanId_fkey') THEN
    ALTER TABLE "SeatingAssignment"
      ADD CONSTRAINT "SeatingAssignment_seatingPlanId_fkey"
      FOREIGN KEY ("seatingPlanId") REFERENCES "SeatingPlan"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS "SeatingAssignment_eventId_attendeeId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "SeatingAssignment_event_attendee_event_level_key"
  ON "SeatingAssignment"("eventId", "attendeeId")
  WHERE "seatingPlanId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "SeatingAssignment_event_attendee_plan_key"
  ON "SeatingAssignment"("eventId", "attendeeId", "seatingPlanId")
  WHERE "seatingPlanId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "SeatingAssignment_eventId_seatingPlanId_idx"
  ON "SeatingAssignment"("eventId", "seatingPlanId");

CREATE INDEX IF NOT EXISTS "SeatingAssignment_seatingPlanId_idx"
  ON "SeatingAssignment"("seatingPlanId");
