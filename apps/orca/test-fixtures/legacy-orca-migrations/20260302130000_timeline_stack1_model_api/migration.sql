-- CreateEnum
CREATE TYPE "TimelineItemStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'AT_RISK', 'COMPLETE');

-- CreateEnum
CREATE TYPE "TimelineItemPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TimelineDependencyType" AS ENUM ('FINISH_TO_START');

-- CreateTable
CREATE TABLE "TimelineItem" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "status" "TimelineItemStatus" NOT NULL,
    "priority" "TimelineItemPriority" NOT NULL,
    "ownerUserId" UUID,
    "startDate" DATE,
    "endDate" DATE,
    "progress" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineDependency" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "predecessorItemId" UUID NOT NULL,
    "successorItemId" UUID NOT NULL,
    "type" "TimelineDependencyType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimelineItem_eventId_sortOrder_idx" ON "TimelineItem"("eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "TimelineItem_eventId_status_idx" ON "TimelineItem"("eventId", "status");

-- CreateIndex
CREATE INDEX "TimelineItem_eventId_startDate_idx" ON "TimelineItem"("eventId", "startDate");

-- CreateIndex
CREATE INDEX "TimelineItem_eventId_endDate_idx" ON "TimelineItem"("eventId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "TimelineDependency_eventId_predecessorItemId_successorItemId_type_key" ON "TimelineDependency"("eventId", "predecessorItemId", "successorItemId", "type");

-- CreateIndex
CREATE INDEX "TimelineDependency_eventId_idx" ON "TimelineDependency"("eventId");

-- CreateIndex
CREATE INDEX "TimelineDependency_predecessorItemId_idx" ON "TimelineDependency"("predecessorItemId");

-- CreateIndex
CREATE INDEX "TimelineDependency_successorItemId_idx" ON "TimelineDependency"("successorItemId");

-- AddForeignKey
ALTER TABLE "TimelineItem" ADD CONSTRAINT "TimelineItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineItem" ADD CONSTRAINT "TimelineItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineDependency" ADD CONSTRAINT "TimelineDependency_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineDependency" ADD CONSTRAINT "TimelineDependency_predecessorItemId_fkey" FOREIGN KEY ("predecessorItemId") REFERENCES "TimelineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineDependency" ADD CONSTRAINT "TimelineDependency_successorItemId_fkey" FOREIGN KEY ("successorItemId") REFERENCES "TimelineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
