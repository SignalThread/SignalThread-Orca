-- Additive Prompt 6 session-operation and handoff foundation. Existing data is untouched.
ALTER TABLE "Organization"
  ADD COLUMN "agendaTerm" TEXT,
  ADD COLUMN "runOfShowTerm" TEXT,
  ADD COLUMN "matrixTerm" TEXT,
  ADD COLUMN "showFlowTerm" TEXT;

ALTER TABLE "Room"
  ADD COLUMN "roomSetNotes" TEXT,
  ADD COLUMN "roomSetInternalNotes" TEXT;

CREATE TYPE "SessionShowFlowVisibility" AS ENUM ('INTERNAL', 'PUBLIC');

CREATE TABLE "SessionShowFlowItem" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "startTime" TIME(6),
  "durationMin" INTEGER,
  "label" TEXT NOT NULL,
  "owner" TEXT,
  "department" TEXT,
  "notes" TEXT,
  "visibility" "SessionShowFlowVisibility" NOT NULL DEFAULT 'INTERNAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionShowFlowItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionShowFlowItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SessionShowFlowItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SessionShowFlowItem_sessionId_sortOrder_key" ON "SessionShowFlowItem"("sessionId", "sortOrder");
CREATE INDEX "SessionShowFlowItem_eventId_sessionId_sortOrder_idx" ON "SessionShowFlowItem"("eventId", "sessionId", "sortOrder");
