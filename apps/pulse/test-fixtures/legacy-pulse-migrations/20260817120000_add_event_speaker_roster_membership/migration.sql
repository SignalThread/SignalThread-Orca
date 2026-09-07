-- Event-level roster membership uses the existing speaker-assignment table.
-- A null sessionId represents membership in the event without inventing a
-- synthetic session; non-null rows retain their session-assignment behavior.
ALTER TABLE "EventSessionSpeakerAssignment"
  ALTER COLUMN "sessionId" DROP NOT NULL;

-- Event-only rows do not participate in the composite session foreign key, so
-- keep their event lifecycle protected directly as well.
ALTER TABLE "EventSessionSpeakerAssignment"
  ADD CONSTRAINT "EventSessionSpeakerAssignment_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- PostgreSQL compound unique constraints allow repeated NULL values, so the
-- partial index makes one event-level membership row per speaker deterministic.
CREATE UNIQUE INDEX "EventSessionSpeakerAssignment_eventId_speakerId_roster_key"
  ON "EventSessionSpeakerAssignment"("eventId", "speakerId")
  WHERE "sessionId" IS NULL;

-- Existing session assignments already prove that these speakers participate
-- in their events. Backfill the explicit membership rows for current data.
INSERT INTO "EventSessionSpeakerAssignment" (
  "id",
  "accountId",
  "eventId",
  "sessionId",
  "speakerId",
  "role",
  "sortOrder",
  "metadata",
  "createdAt",
  "updatedAt"
)
SELECT
  'event-roster-' || md5(sa."eventId" || ':' || sa."speakerId"),
  MIN(sa."accountId"),
  sa."eventId",
  NULL,
  sa."speakerId",
  'SPEAKER'::"EventSpeakerRole",
  0,
  '{"eventRosterMembership":true}'::jsonb,
  MIN(sa."createdAt"),
  NOW()
FROM "EventSessionSpeakerAssignment" sa
WHERE sa."sessionId" IS NOT NULL
GROUP BY sa."eventId", sa."speakerId"
ON CONFLICT DO NOTHING;
