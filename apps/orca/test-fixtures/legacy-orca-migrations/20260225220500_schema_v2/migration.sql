-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BudgetApprovalStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EventActivityType" AS ENUM ('EVENT_CREATED', 'EVENT_UPDATED', 'DEADLINE_CREATED', 'DEADLINE_UPDATED', 'BUDGET_SUBMITTED', 'BUDGET_APPROVED', 'BUDGET_REJECTED', 'MATRIX_UPDATED', 'SEATING_UPDATED', 'REPORT_GENERATED', 'INTEGRATION_SYNCED');

-- CreateEnum
CREATE TYPE "EventIntegrationMetricType" AS ENUM ('REGISTRATION', 'HOUSING');

-- DropForeignKey
ALTER TABLE "BudgetItem" DROP CONSTRAINT "BudgetItem_eventId_fkey";

-- DropIndex
DROP INDEX "BudgetItem_eventId_category_idx";

-- DropIndex
DROP INDEX "BudgetItem_eventId_status_idx";

-- AlterTable
ALTER TABLE "BudgetItem" ADD COLUMN "budgetVersionId" UUID;

-- AlterTable
ALTER TABLE "Deadline" ADD COLUMN "dependsOnDeadlineId" UUID;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "clientId" UUID;

-- AlterTable
ALTER TABLE "MatrixRow"
  ADD COLUMN "roomId" UUID,
  ALTER COLUMN "roomName" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetVersion" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetApproval" (
    "id" UUID NOT NULL,
    "budgetVersionId" UUID NOT NULL,
    "status" "BudgetApprovalStatus" NOT NULL,
    "actedByUserId" UUID NOT NULL,
    "actedAt" TIMESTAMP(3) NOT NULL,
    "comment" TEXT,

    CONSTRAINT "BudgetApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventActivity" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "type" "EventActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventIntegrationMetric" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "type" "EventIntegrationMetricType" NOT NULL,
    "currentValue" INTEGER NOT NULL,
    "goalValue" INTEGER,
    "pacePercent" INTEGER,
    "delta7dPercent" INTEGER,
    "breakdownJson" JSONB,
    "sourceSystem" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventIntegrationMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatingTable" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatingTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatingAttendee" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatingAssignment" (
    "id" UUID NOT NULL,
    "tableId" UUID NOT NULL,
    "attendeeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_orgId_userId_key" ON "Membership"("orgId", "userId");

-- CreateIndex
CREATE INDEX "Client_orgId_idx" ON "Client"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_orgId_slug_key" ON "Client"("orgId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_eventId_key" ON "Budget"("eventId");

-- CreateIndex
CREATE INDEX "Budget_currentVersionId_idx" ON "Budget"("currentVersionId");

-- CreateIndex
CREATE INDEX "BudgetVersion_budgetId_idx" ON "BudgetVersion"("budgetId");

-- CreateIndex
CREATE INDEX "BudgetVersion_createdByUserId_idx" ON "BudgetVersion"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetVersion_budgetId_versionNumber_key" ON "BudgetVersion"("budgetId", "versionNumber");

-- CreateIndex
CREATE INDEX "BudgetApproval_budgetVersionId_idx" ON "BudgetApproval"("budgetVersionId");

-- CreateIndex
CREATE INDEX "BudgetApproval_actedByUserId_idx" ON "BudgetApproval"("actedByUserId");

-- CreateIndex
CREATE INDEX "Room_eventId_idx" ON "Room"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_eventId_name_key" ON "Room"("eventId", "name");

-- CreateIndex
CREATE INDEX "EventActivity_eventId_createdAt_idx" ON "EventActivity"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "EventActivity_actorUserId_idx" ON "EventActivity"("actorUserId");

-- CreateIndex
CREATE INDEX "EventIntegrationMetric_eventId_idx" ON "EventIntegrationMetric"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventIntegrationMetric_eventId_type_key" ON "EventIntegrationMetric"("eventId", "type");

-- CreateIndex
CREATE INDEX "SeatingTable_eventId_sortOrder_idx" ON "SeatingTable"("eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "SeatingAttendee_eventId_name_idx" ON "SeatingAttendee"("eventId", "name");

-- CreateIndex
CREATE INDEX "SeatingAttendee_eventId_email_idx" ON "SeatingAttendee"("eventId", "email");

-- CreateIndex
CREATE INDEX "SeatingAssignment_tableId_idx" ON "SeatingAssignment"("tableId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatingAssignment_tableId_attendeeId_key" ON "SeatingAssignment"("tableId", "attendeeId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatingAssignment_attendeeId_key" ON "SeatingAssignment"("attendeeId");

-- CreateIndex
CREATE INDEX "BudgetItem_budgetVersionId_category_idx" ON "BudgetItem"("budgetVersionId", "category");

-- CreateIndex
CREATE INDEX "BudgetItem_budgetVersionId_status_idx" ON "BudgetItem"("budgetVersionId", "status");

-- CreateIndex
CREATE INDEX "Deadline_dependsOnDeadlineId_idx" ON "Deadline"("dependsOnDeadlineId");

-- CreateIndex
CREATE INDEX "Event_clientId_idx" ON "Event"("clientId");

-- CreateIndex
CREATE INDEX "MatrixRow_eventId_dayDate_roomId_idx" ON "MatrixRow"("eventId", "dayDate", "roomId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_dependsOnDeadlineId_fkey" FOREIGN KEY ("dependsOnDeadlineId") REFERENCES "Deadline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "BudgetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetVersion" ADD CONSTRAINT "BudgetVersion_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetVersion" ADD CONSTRAINT "BudgetVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetApproval" ADD CONSTRAINT "BudgetApproval_budgetVersionId_fkey" FOREIGN KEY ("budgetVersionId") REFERENCES "BudgetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetApproval" ADD CONSTRAINT "BudgetApproval_actedByUserId_fkey" FOREIGN KEY ("actedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill Budget and BudgetVersion for existing events and BudgetItems
INSERT INTO "Budget" ("id", "eventId", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), e."id", 'DRAFT'::"BudgetStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Event" e
LEFT JOIN "Budget" b ON b."eventId" = e."id"
WHERE b."id" IS NULL;

INSERT INTO "BudgetVersion" ("id", "budgetId", "versionNumber", "createdByUserId", "createdAt")
SELECT gen_random_uuid(), b."id", 1, e."createdByUserId", CURRENT_TIMESTAMP
FROM "Budget" b
JOIN "Event" e ON e."id" = b."eventId"
LEFT JOIN "BudgetVersion" bv ON bv."budgetId" = b."id" AND bv."versionNumber" = 1
WHERE bv."id" IS NULL;

UPDATE "Budget" b
SET "currentVersionId" = bv."id",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "BudgetVersion" bv
WHERE bv."budgetId" = b."id"
  AND b."currentVersionId" IS NULL;

UPDATE "BudgetItem" bi
SET "budgetVersionId" = b."currentVersionId"
FROM "Budget" b
WHERE bi."eventId" = b."eventId"
  AND bi."budgetVersionId" IS NULL;

ALTER TABLE "BudgetItem" ALTER COLUMN "budgetVersionId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_budgetVersionId_fkey" FOREIGN KEY ("budgetVersionId") REFERENCES "BudgetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old denormalized link after backfill
ALTER TABLE "BudgetItem" DROP COLUMN "eventId";

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrixRow" ADD CONSTRAINT "MatrixRow_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventActivity" ADD CONSTRAINT "EventActivity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventActivity" ADD CONSTRAINT "EventActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventIntegrationMetric" ADD CONSTRAINT "EventIntegrationMetric_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatingTable" ADD CONSTRAINT "SeatingTable_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatingAttendee" ADD CONSTRAINT "SeatingAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatingAssignment" ADD CONSTRAINT "SeatingAssignment_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "SeatingTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatingAssignment" ADD CONSTRAINT "SeatingAssignment_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "SeatingAttendee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
