CREATE TYPE "PlatformUserActionType" AS ENUM ('OTP_GENERATED', 'INVITE_RESENT', 'ROLE_CHANGED', 'USER_DEACTIVATED', 'USER_REACTIVATED');

CREATE TABLE "PlatformUserActionAudit" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "PlatformUserActionType" NOT NULL,
    "targetUserId" TEXT,
    "targetEmail" TEXT NOT NULL,
    "accountId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformUserActionAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformUserActionAudit_actorUserId_createdAt_idx" ON "PlatformUserActionAudit"("actorUserId", "createdAt");
CREATE INDEX "PlatformUserActionAudit_targetUserId_createdAt_idx" ON "PlatformUserActionAudit"("targetUserId", "createdAt");
CREATE INDEX "PlatformUserActionAudit_targetEmail_idx" ON "PlatformUserActionAudit"("targetEmail");
CREATE INDEX "PlatformUserActionAudit_accountId_createdAt_idx" ON "PlatformUserActionAudit"("accountId", "createdAt");

ALTER TABLE "PlatformUserActionAudit" ADD CONSTRAINT "PlatformUserActionAudit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
