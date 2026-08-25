-- Additive show-flow timing, concurrency, and publication foundation.
CREATE TYPE "SessionShowFlowTimingMode" AS ENUM ('ABSOLUTE', 'OFFSET');

ALTER TABLE "MatrixRow"
  ADD COLUMN "publicDescription" TEXT;

ALTER TABLE "SessionShowFlowItem"
  ADD COLUMN "speakerId" UUID,
  ADD COLUMN "timingMode" "SessionShowFlowTimingMode" NOT NULL DEFAULT 'ABSOLUTE',
  ADD COLUMN "offsetMin" INTEGER,
  ADD COLUMN "action" TEXT,
  ADD COLUMN "talentName" TEXT,
  ADD COLUMN "avNotes" TEXT,
  ADD COLUMN "audioNotes" TEXT,
  ADD COLUMN "lightingNotes" TEXT,
  ADD COLUMN "internalNotes" TEXT,
  ADD COLUMN "publicDescription" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "SessionShowFlowItem"
  ADD CONSTRAINT "SessionShowFlowItem_offsetMin_check"
    CHECK ("offsetMin" IS NULL OR "offsetMin" >= 0),
  ADD CONSTRAINT "SessionShowFlowItem_durationMin_check"
    CHECK ("durationMin" IS NULL OR "durationMin" > 0),
  ADD CONSTRAINT "SessionShowFlowItem_version_check"
    CHECK ("version" > 0),
  ADD CONSTRAINT "SessionShowFlowItem_timingMode_check"
    CHECK (
      ("timingMode" = 'ABSOLUTE' AND "offsetMin" IS NULL)
      OR ("timingMode" = 'OFFSET' AND "offsetMin" IS NOT NULL)
    );

CREATE INDEX "SessionShowFlowItem_speakerId_idx"
  ON "SessionShowFlowItem"("speakerId");

ALTER TABLE "SessionShowFlowItem"
  ADD CONSTRAINT "SessionShowFlowItem_speakerId_fkey"
  FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SessionShowFlowState" (
  "sessionId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionShowFlowState_pkey" PRIMARY KEY ("sessionId"),
  CONSTRAINT "SessionShowFlowState_revision_check" CHECK ("revision" >= 0)
);

CREATE INDEX "SessionShowFlowState_eventId_updatedAt_idx"
  ON "SessionShowFlowState"("eventId", "updatedAt");

ALTER TABLE "SessionShowFlowState"
  ADD CONSTRAINT "SessionShowFlowState_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SessionShowFlowState_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SessionAgendaPublication" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "showFlowRevision" INTEGER NOT NULL,
  "sessionUpdatedAt" TIMESTAMP(3) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "publishedByUserId" UUID NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionAgendaPublication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionAgendaPublication_version_check" CHECK ("version" > 0),
  CONSTRAINT "SessionAgendaPublication_showFlowRevision_check" CHECK ("showFlowRevision" >= 0)
);

CREATE UNIQUE INDEX "SessionAgendaPublication_sessionId_version_key"
  ON "SessionAgendaPublication"("sessionId", "version");
CREATE INDEX "SessionAgendaPublication_eventId_publishedAt_idx"
  ON "SessionAgendaPublication"("eventId", "publishedAt");
CREATE INDEX "SessionAgendaPublication_sessionId_publishedAt_idx"
  ON "SessionAgendaPublication"("sessionId", "publishedAt");
CREATE INDEX "SessionAgendaPublication_publishedByUserId_idx"
  ON "SessionAgendaPublication"("publishedByUserId");

ALTER TABLE "SessionAgendaPublication"
  ADD CONSTRAINT "SessionAgendaPublication_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SessionAgendaPublication_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SessionAgendaPublication_publishedByUserId_fkey"
  FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing show-flow rows become revision zero canonical state without rewriting cue timing.
INSERT INTO "SessionShowFlowState" ("sessionId", "eventId", "revision", "createdAt", "updatedAt")
SELECT DISTINCT i."sessionId", i."eventId", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SessionShowFlowItem" i
ON CONFLICT ("sessionId") DO NOTHING;
