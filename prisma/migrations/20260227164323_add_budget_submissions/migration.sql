-- CreateEnum
CREATE TYPE "BudgetSubmissionStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'PULLED_BACK');

-- CreateTable
CREATE TABLE "BudgetSubmission" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "budgetVersionId" UUID NOT NULL,
    "lineItemId" UUID NOT NULL,
    "submittedByUserId" UUID NOT NULL,
    "pulledBackByUserId" UUID,
    "status" "BudgetSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "message" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pulledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetSubmissionRecipient" (
    "id" UUID NOT NULL,
    "budgetSubmissionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetSubmissionRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetSubmission_budgetId_submittedAt_idx" ON "BudgetSubmission"("budgetId", "submittedAt");

-- CreateIndex
CREATE INDEX "BudgetSubmission_budgetVersionId_idx" ON "BudgetSubmission"("budgetVersionId");

-- CreateIndex
CREATE INDEX "BudgetSubmission_lineItemId_idx" ON "BudgetSubmission"("lineItemId");

-- CreateIndex
CREATE INDEX "BudgetSubmission_submittedByUserId_idx" ON "BudgetSubmission"("submittedByUserId");

-- CreateIndex
CREATE INDEX "BudgetSubmission_pulledBackByUserId_idx" ON "BudgetSubmission"("pulledBackByUserId");

-- CreateIndex
CREATE INDEX "BudgetSubmission_status_idx" ON "BudgetSubmission"("status");

-- CreateIndex
CREATE INDEX "BudgetSubmissionRecipient_userId_idx" ON "BudgetSubmissionRecipient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetSubmissionRecipient_budgetSubmissionId_userId_key" ON "BudgetSubmissionRecipient"("budgetSubmissionId", "userId");

-- AddForeignKey
ALTER TABLE "BudgetSubmission" ADD CONSTRAINT "BudgetSubmission_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetSubmission" ADD CONSTRAINT "BudgetSubmission_budgetVersionId_fkey" FOREIGN KEY ("budgetVersionId") REFERENCES "BudgetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetSubmission" ADD CONSTRAINT "BudgetSubmission_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "BudgetLineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetSubmission" ADD CONSTRAINT "BudgetSubmission_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetSubmission" ADD CONSTRAINT "BudgetSubmission_pulledBackByUserId_fkey" FOREIGN KEY ("pulledBackByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetSubmissionRecipient" ADD CONSTRAINT "BudgetSubmissionRecipient_budgetSubmissionId_fkey" FOREIGN KEY ("budgetSubmissionId") REFERENCES "BudgetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetSubmissionRecipient" ADD CONSTRAINT "BudgetSubmissionRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
