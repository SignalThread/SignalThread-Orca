-- CreateEnum
CREATE TYPE "CopilotMode" AS ENUM ('ASK', 'DO');

-- CreateEnum
CREATE TYPE "CopilotActionStatus" AS ENUM ('PROPOSED', 'APPROVED', 'EXECUTED', 'FAILED', 'REJECTED');

-- CreateTable
CREATE TABLE "CopilotAuditLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "eventId" UUID,
    "mode" "CopilotMode" NOT NULL,
    "rawPrompt" TEXT NOT NULL,
    "actionType" TEXT,
    "proposedActionJson" JSONB,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "status" "CopilotActionStatus" NOT NULL DEFAULT 'PROPOSED',
    "resultSummary" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CopilotAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopilotAuditLog_userId_createdAt_idx" ON "CopilotAuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CopilotAuditLog_orgId_createdAt_idx" ON "CopilotAuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "CopilotAuditLog_eventId_createdAt_idx" ON "CopilotAuditLog"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "CopilotAuditLog_status_createdAt_idx" ON "CopilotAuditLog"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CopilotAuditLog"
ADD CONSTRAINT "CopilotAuditLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotAuditLog"
ADD CONSTRAINT "CopilotAuditLog_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotAuditLog"
ADD CONSTRAINT "CopilotAuditLog_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
