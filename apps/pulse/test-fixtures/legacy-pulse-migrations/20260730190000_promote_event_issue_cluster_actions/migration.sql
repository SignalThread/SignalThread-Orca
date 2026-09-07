-- EventIssueCluster is promoted in place to the canonical operational action.
-- Existing rows remain findings because actionClassification/actionStatus stay NULL;
-- conversion is explicit and transactionally records the first history entry.
CREATE TYPE "EventActionClassification" AS ENUM (
  'DURING_EVENT',
  'AFTER_EVENT_FOLLOW_UP',
  'NEXT_EVENT_LEARNING',
  'INFORMATIONAL'
);

CREATE TYPE "EventActionStatus" AS ENUM (
  'UNASSIGNED',
  'OPEN',
  'WORKING',
  'BLOCKED',
  'COMPLETE',
  'DISMISSED',
  'CANCELLED'
);

CREATE TYPE "EventActionHistoryType" AS ENUM (
  'CONVERTED',
  'NO_CHANGE',
  'ASSIGNED',
  'REASSIGNED',
  'UNASSIGNED',
  'STATUS_CHANGED',
  'DUE_DATE_CHANGED',
  'PRIORITY_CHANGED',
  'CLASSIFICATION_CHANGED',
  'UPDATE_ADDED'
);

CREATE TYPE "EventActionUpdateKind" AS ENUM ('WRITTEN', 'VOICE');
CREATE TYPE "EventActionVoiceStatus" AS ENUM ('UPLOADED', 'TRANSCRIBING', 'COMPLETED', 'FAILED');

ALTER TABLE "EventIssueCluster"
ADD COLUMN "actionClassification" "EventActionClassification",
ADD COLUMN "actionStatus" "EventActionStatus",
ADD COLUMN "actionDueAt" TIMESTAMP(3),
ADD COLUMN "actionBlockedReason" TEXT,
ADD COLUMN "actionResolution" TEXT,
ADD COLUMN "actionConvertedAt" TIMESTAMP(3),
ADD COLUMN "actionConvertedByUserId" TEXT;

CREATE TABLE "EventActionHistory" (
  "id" TEXT NOT NULL,
  "clusterId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "type" "EventActionHistoryType" NOT NULL,
  "fromValue" TEXT,
  "toValue" TEXT,
  "detailsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventActionHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventActionUpdate" (
  "id" TEXT NOT NULL,
  "clusterId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "kind" "EventActionUpdateKind" NOT NULL,
  "body" TEXT,
  "voiceObjectKey" TEXT,
  "voiceMimeType" TEXT,
  "voiceDurationMs" INTEGER,
  "voiceTranscript" TEXT,
  "voiceTranscriptionStatus" "EventActionVoiceStatus",
  "voiceFailureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventActionUpdate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventIssueCluster_eventId_actionStatus_idx" ON "EventIssueCluster"("eventId", "actionStatus");
CREATE INDEX "EventIssueCluster_eventId_actionClassification_idx" ON "EventIssueCluster"("eventId", "actionClassification");

CREATE UNIQUE INDEX "EventActionHistory_clusterId_idempotencyKey_key" ON "EventActionHistory"("clusterId", "idempotencyKey");
CREATE INDEX "EventActionHistory_clusterId_createdAt_idx" ON "EventActionHistory"("clusterId", "createdAt");
CREATE INDEX "EventActionHistory_accountId_idx" ON "EventActionHistory"("accountId");
CREATE INDEX "EventActionHistory_eventId_idx" ON "EventActionHistory"("eventId");
CREATE INDEX "EventActionHistory_actorUserId_idx" ON "EventActionHistory"("actorUserId");

CREATE UNIQUE INDEX "EventActionUpdate_clusterId_idempotencyKey_key" ON "EventActionUpdate"("clusterId", "idempotencyKey");
CREATE INDEX "EventActionUpdate_clusterId_createdAt_idx" ON "EventActionUpdate"("clusterId", "createdAt");
CREATE INDEX "EventActionUpdate_accountId_idx" ON "EventActionUpdate"("accountId");
CREATE INDEX "EventActionUpdate_eventId_idx" ON "EventActionUpdate"("eventId");
CREATE INDEX "EventActionUpdate_authorUserId_idx" ON "EventActionUpdate"("authorUserId");
CREATE INDEX "EventActionUpdate_voiceTranscriptionStatus_idx" ON "EventActionUpdate"("voiceTranscriptionStatus");

ALTER TABLE "EventActionHistory"
ADD CONSTRAINT "EventActionHistory_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "EventIssueCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "EventActionHistory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "EventActionHistory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventActionUpdate"
ADD CONSTRAINT "EventActionUpdate_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "EventIssueCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "EventActionUpdate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "EventActionUpdate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
