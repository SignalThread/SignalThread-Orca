-- CreateTable
CREATE TABLE "PendingProvision" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PendingProvision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingProvision_email_key" ON "PendingProvision"("email");

-- CreateIndex
CREATE INDEX "PendingProvision_email_idx" ON "PendingProvision"("email");

-- CreateIndex
CREATE INDEX "PendingProvision_accountId_idx" ON "PendingProvision"("accountId");

-- CreateIndex
CREATE INDEX "PendingProvision_usedAt_idx" ON "PendingProvision"("usedAt");

-- AddForeignKey
ALTER TABLE "PendingProvision" ADD CONSTRAINT "PendingProvision_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
