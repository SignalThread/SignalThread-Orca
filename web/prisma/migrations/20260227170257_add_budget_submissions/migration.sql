/*
  Warnings:

  - You are about to drop the column `lineItemId` on the `BudgetSubmission` table. All the data in the column will be lost.
  - The primary key for the `BudgetSubmissionRecipient` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `budgetSubmissionId` on the `BudgetSubmissionRecipient` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `BudgetSubmissionRecipient` table. All the data in the column will be lost.
  - Added the required column `submissionId` to the `BudgetSubmissionRecipient` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "BudgetSubmission" DROP CONSTRAINT "BudgetSubmission_lineItemId_fkey";

-- DropForeignKey
ALTER TABLE "BudgetSubmissionRecipient" DROP CONSTRAINT "BudgetSubmissionRecipient_budgetSubmissionId_fkey";

-- DropIndex
DROP INDEX "BudgetSubmission_lineItemId_idx";

-- DropIndex
DROP INDEX "BudgetSubmission_pulledBackByUserId_idx";

-- DropIndex
DROP INDEX "BudgetSubmission_status_idx";

-- DropIndex
DROP INDEX "BudgetSubmission_submittedByUserId_idx";

-- DropIndex
DROP INDEX "BudgetSubmissionRecipient_budgetSubmissionId_userId_key";

-- AlterTable
ALTER TABLE "BudgetSubmission" DROP COLUMN "lineItemId";

-- AlterTable
ALTER TABLE "BudgetSubmissionRecipient" DROP CONSTRAINT "BudgetSubmissionRecipient_pkey",
DROP COLUMN "budgetSubmissionId",
DROP COLUMN "id",
ADD COLUMN     "submissionId" UUID NOT NULL,
ADD CONSTRAINT "BudgetSubmissionRecipient_pkey" PRIMARY KEY ("submissionId", "userId");

-- CreateTable
CREATE TABLE "BudgetSubmissionLineItem" (
    "submissionId" UUID NOT NULL,
    "budgetLineItemId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetSubmissionLineItem_pkey" PRIMARY KEY ("submissionId","budgetLineItemId")
);

-- CreateIndex
CREATE INDEX "BudgetSubmissionLineItem_budgetLineItemId_idx" ON "BudgetSubmissionLineItem"("budgetLineItemId");

-- AddForeignKey
ALTER TABLE "BudgetSubmissionRecipient" ADD CONSTRAINT "BudgetSubmissionRecipient_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "BudgetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetSubmissionLineItem" ADD CONSTRAINT "BudgetSubmissionLineItem_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "BudgetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetSubmissionLineItem" ADD CONSTRAINT "BudgetSubmissionLineItem_budgetLineItemId_fkey" FOREIGN KEY ("budgetLineItemId") REFERENCES "BudgetLineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
