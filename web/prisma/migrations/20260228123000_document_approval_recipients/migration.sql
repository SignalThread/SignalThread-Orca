-- CreateTable
CREATE TABLE "DocumentApprovalRecipient" (
    "approvalId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentApprovalRecipient_pkey" PRIMARY KEY ("approvalId", "userId")
);

-- CreateIndex
CREATE INDEX "DocumentApprovalRecipient_userId_idx" ON "DocumentApprovalRecipient"("userId");

-- AddForeignKey
ALTER TABLE "DocumentApprovalRecipient" ADD CONSTRAINT "DocumentApprovalRecipient_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "DocumentApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApprovalRecipient" ADD CONSTRAINT "DocumentApprovalRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
