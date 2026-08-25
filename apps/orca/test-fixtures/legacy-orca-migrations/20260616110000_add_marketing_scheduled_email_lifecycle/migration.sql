ALTER TABLE "MarketingEmailSend"
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "canceledByUserId" UUID,
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "sendAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptedAt" TIMESTAMP(3);

CREATE INDEX "MarketingEmailSend_eventId_status_scheduledSendAt_idx"
  ON "MarketingEmailSend"("eventId", "status", "scheduledSendAt");
