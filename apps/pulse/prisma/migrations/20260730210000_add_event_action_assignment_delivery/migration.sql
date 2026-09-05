-- Additive, durable delivery tracking for canonical Event action assignments.
-- Existing actions are untouched; a delivery record is created only by a new
-- assignment or reassignment mutation after this migration is deployed.
CREATE TYPE "EventActionNotificationType" AS ENUM ('ACTION_ASSIGNED');
CREATE TYPE "EventActionDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "EventActionAssignmentDelivery" (
  "id" TEXT NOT NULL,
  "clusterId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "assignedByUserId" TEXT NOT NULL,
  "notificationType" "EventActionNotificationType" NOT NULL DEFAULT 'ACTION_ASSIGNED',
  "idempotencyKey" TEXT NOT NULL,
  "deepLink" TEXT NOT NULL,
  "actionTitle" TEXT NOT NULL,
  "actionPriority" TEXT NOT NULL,
  "actionDueAt" TIMESTAMP(3),
  "provider" TEXT,
  "status" "EventActionDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "providerMessageId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventActionAssignmentDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventActionDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" "EventActionDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT,
  "providerMessageId" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "EventActionDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventActionAssignmentDelivery_clusterId_idempotencyKey_key" ON "EventActionAssignmentDelivery"("clusterId", "idempotencyKey");
CREATE INDEX "EventActionAssignmentDelivery_clusterId_createdAt_idx" ON "EventActionAssignmentDelivery"("clusterId", "createdAt");
CREATE INDEX "EventActionAssignmentDelivery_accountId_idx" ON "EventActionAssignmentDelivery"("accountId");
CREATE INDEX "EventActionAssignmentDelivery_eventId_idx" ON "EventActionAssignmentDelivery"("eventId");
CREATE INDEX "EventActionAssignmentDelivery_recipientUserId_idx" ON "EventActionAssignmentDelivery"("recipientUserId");
CREATE INDEX "EventActionAssignmentDelivery_status_idx" ON "EventActionAssignmentDelivery"("status");

CREATE UNIQUE INDEX "EventActionDeliveryAttempt_deliveryId_idempotencyKey_key" ON "EventActionDeliveryAttempt"("deliveryId", "idempotencyKey");
CREATE UNIQUE INDEX "EventActionDeliveryAttempt_deliveryId_attemptNumber_key" ON "EventActionDeliveryAttempt"("deliveryId", "attemptNumber");
CREATE INDEX "EventActionDeliveryAttempt_accountId_idx" ON "EventActionDeliveryAttempt"("accountId");
CREATE INDEX "EventActionDeliveryAttempt_eventId_idx" ON "EventActionDeliveryAttempt"("eventId");
CREATE INDEX "EventActionDeliveryAttempt_status_idx" ON "EventActionDeliveryAttempt"("status");

ALTER TABLE "EventActionAssignmentDelivery"
ADD CONSTRAINT "EventActionAssignmentDelivery_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "EventIssueCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "EventActionAssignmentDelivery_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "EventActionAssignmentDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventActionDeliveryAttempt"
ADD CONSTRAINT "EventActionDeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "EventActionAssignmentDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "EventActionDeliveryAttempt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "EventActionDeliveryAttempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
