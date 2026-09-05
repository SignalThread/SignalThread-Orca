ALTER TABLE "EventIssueCluster"
ADD COLUMN "ruleType" TEXT NOT NULL DEFAULT 'VOICE_OPERATIONAL',
ADD COLUMN "metricSnapshotJson" JSONB,
ADD COLUMN "ownerUserId" TEXT,
ADD COLUMN "ownerAssignedAt" TIMESTAMP(3),
ADD COLUMN "ownerAssignedByUserId" TEXT,
ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN "acknowledgedByUserId" TEXT,
ADD COLUMN "actingAt" TIMESTAMP(3),
ADD COLUMN "actingByUserId" TEXT,
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "resolvedByUserId" TEXT,
ADD COLUMN "resolutionReason" TEXT,
ADD COLUMN "dismissedAt" TIMESTAMP(3),
ADD COLUMN "dismissedByUserId" TEXT,
ADD COLUMN "dismissalReason" TEXT,
ADD COLUMN "reopenedAt" TIMESTAMP(3),
ADD COLUMN "reopenedByUserId" TEXT,
ADD COLUMN "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "statusChangedAt" TIMESTAMP(3);

-- These are exact compatibility mappings from the previous operational labels.
UPDATE "EventIssueCluster"
SET "status" = 'ACKNOWLEDGED', "statusChangedAt" = "updatedAt"
WHERE "status" = 'INVESTIGATING';

UPDATE "EventIssueCluster"
SET "status" = 'ACTING', "statusChangedAt" = "updatedAt"
WHERE "status" = 'MONITORING';

CREATE TABLE "EventAlertNote" (
  "id" TEXT NOT NULL,
  "clusterId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventAlertNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventIssueCluster_ownerUserId_idx" ON "EventIssueCluster"("ownerUserId");
CREATE INDEX "EventIssueCluster_eventId_ruleType_idx" ON "EventIssueCluster"("eventId", "ruleType");
CREATE INDEX "EventAlertNote_clusterId_createdAt_idx" ON "EventAlertNote"("clusterId", "createdAt");
CREATE INDEX "EventAlertNote_accountId_idx" ON "EventAlertNote"("accountId");
CREATE INDEX "EventAlertNote_eventId_idx" ON "EventAlertNote"("eventId");
CREATE INDEX "EventAlertNote_authorUserId_idx" ON "EventAlertNote"("authorUserId");

ALTER TABLE "EventAlertNote"
ADD CONSTRAINT "EventAlertNote_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "EventIssueCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventAlertNote"
ADD CONSTRAINT "EventAlertNote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventAlertNote"
ADD CONSTRAINT "EventAlertNote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
