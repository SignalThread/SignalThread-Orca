-- CreateEnum
CREATE TYPE "BudgetLineItemStatus" AS ENUM ('PLANNED', 'COMMITTED', 'PAID');

-- CreateEnum
CREATE TYPE "BudgetLineItemApproval" AS ENUM ('PENDING', 'APPROVED');

-- CreateEnum
CREATE TYPE "BudgetActivityType" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'REVISED');

-- AlterTable
ALTER TABLE "Budget"
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "submittedByUserId" UUID,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedByUserId" UUID,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedByUserId" UUID,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "lockedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BudgetLineItem" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "lineItem" TEXT NOT NULL,
    "vendor" TEXT,
    "forecastCents" INTEGER NOT NULL DEFAULT 0,
    "actualCents" INTEGER NOT NULL DEFAULT 0,
    "status" "BudgetLineItemStatus" NOT NULL DEFAULT 'PLANNED',
    "approval" "BudgetLineItemApproval" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetActivity" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "type" "BudgetActivityType" NOT NULL,
    "actorUserId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Budget_submittedByUserId_idx" ON "Budget"("submittedByUserId");

-- CreateIndex
CREATE INDEX "Budget_approvedByUserId_idx" ON "Budget"("approvedByUserId");

-- CreateIndex
CREATE INDEX "Budget_rejectedByUserId_idx" ON "Budget"("rejectedByUserId");

-- CreateIndex
CREATE INDEX "BudgetLineItem_budgetId_sortOrder_idx" ON "BudgetLineItem"("budgetId", "sortOrder");

-- CreateIndex
CREATE INDEX "BudgetLineItem_budgetId_category_idx" ON "BudgetLineItem"("budgetId", "category");

-- CreateIndex
CREATE INDEX "BudgetLineItem_budgetId_status_idx" ON "BudgetLineItem"("budgetId", "status");

-- CreateIndex
CREATE INDEX "BudgetLineItem_budgetId_approval_idx" ON "BudgetLineItem"("budgetId", "approval");

-- CreateIndex
CREATE INDEX "BudgetActivity_budgetId_createdAt_idx" ON "BudgetActivity"("budgetId", "createdAt");

-- CreateIndex
CREATE INDEX "BudgetActivity_actorUserId_idx" ON "BudgetActivity"("actorUserId");

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLineItem" ADD CONSTRAINT "BudgetLineItem_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetActivity" ADD CONSTRAINT "BudgetActivity_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetActivity" ADD CONSTRAINT "BudgetActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
