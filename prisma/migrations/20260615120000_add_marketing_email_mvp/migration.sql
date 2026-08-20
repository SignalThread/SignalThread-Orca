-- CreateEnum
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MarketingEmailSendStatus" AS ENUM ('DRAFT', 'READY', 'SCHEDULED', 'SENDING', 'SENT', 'PARTIALLY_SENT', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MarketingEmailRecipientStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'DROPPED', 'SPAM_REPORTED', 'UNSUBSCRIBED', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "MarketingEmailEventType" AS ENUM ('PROCESSED', 'DELIVERED', 'OPEN', 'CLICK', 'BOUNCE', 'DROPPED', 'SPAMREPORT', 'UNSUBSCRIBE', 'GROUP_UNSUBSCRIBE', 'DEFERRED');

-- CreateEnum
CREATE TYPE "MarketingSuppressionReason" AS ENUM ('BOUNCE', 'DROPPED', 'SPAM_REPORT', 'UNSUBSCRIBE', 'GROUP_UNSUBSCRIBE', 'MANUAL');

-- CreateEnum
CREATE TYPE "MarketingSuppressionSource" AS ENUM ('SENDGRID_WEBHOOK', 'MANUAL', 'IMPORT');

-- CreateTable
CREATE TABLE "MarketingPlan" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "ownerUserId" UUID,
    "summary" TEXT,
    "goals" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "marketingPlanId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerUserId" UUID,
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "audienceLabel" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingAudience" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingAudienceRecipient" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "audienceId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "company" TEXT,
    "title" TEXT,
    "registrationType" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingAudienceRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingEmailSend" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "audienceId" UUID,
    "ownerUserId" UUID,
    "subject" TEXT NOT NULL,
    "previewText" TEXT,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "fromEmail" TEXT NOT NULL,
    "replyTo" TEXT,
    "registrationUrl" TEXT,
    "utmUrl" TEXT,
    "status" "MarketingEmailSendStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledSendAt" TIMESTAMP(3),
    "actualSentAt" TIMESTAMP(3),
    "sendgridBatchId" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "bounceCount" INTEGER NOT NULL DEFAULT 0,
    "unsubscribeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingEmailSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingEmailSendRecipient" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "emailSendId" UUID NOT NULL,
    "sourceAudienceRecipientId" UUID,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "company" TEXT,
    "title" TEXT,
    "registrationType" TEXT,
    "providerStatus" "MarketingEmailRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sendgridMessageId" TEXT,
    "processedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingEmailSendRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingEmailEvent" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "emailSendId" UUID NOT NULL,
    "emailSendRecipientId" UUID NOT NULL,
    "type" "MarketingEmailEventType" NOT NULL,
    "sgEventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingEmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSuppression" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "reason" "MarketingSuppressionReason" NOT NULL,
    "source" "MarketingSuppressionSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingKpiSnapshot" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "campaignId" UUID,
    "emailSendId" UUID,
    "capturedByUserId" UUID,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "registrationCount" INTEGER,
    "revenueAmountCents" INTEGER,
    "goalValue" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingKpiSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingPlan_ownerUserId_idx" ON "MarketingPlan"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingPlan_eventId_key" ON "MarketingPlan"("eventId");

-- CreateIndex
CREATE INDEX "MarketingCampaign_eventId_status_idx" ON "MarketingCampaign"("eventId", "status");

-- CreateIndex
CREATE INDEX "MarketingCampaign_eventId_updatedAt_idx" ON "MarketingCampaign"("eventId", "updatedAt");

-- CreateIndex
CREATE INDEX "MarketingCampaign_ownerUserId_idx" ON "MarketingCampaign"("ownerUserId");

-- CreateIndex
CREATE INDEX "MarketingCampaign_marketingPlanId_idx" ON "MarketingCampaign"("marketingPlanId");

-- CreateIndex
CREATE INDEX "MarketingAudience_eventId_idx" ON "MarketingAudience"("eventId");

-- CreateIndex
CREATE INDEX "MarketingAudience_eventId_updatedAt_idx" ON "MarketingAudience"("eventId", "updatedAt");

-- CreateIndex
CREATE INDEX "MarketingAudienceRecipient_eventId_idx" ON "MarketingAudienceRecipient"("eventId");

-- CreateIndex
CREATE INDEX "MarketingAudienceRecipient_audienceId_idx" ON "MarketingAudienceRecipient"("audienceId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingAudienceRecipient_audienceId_normalizedEmail_key" ON "MarketingAudienceRecipient"("audienceId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "MarketingEmailSend_campaignId_idx" ON "MarketingEmailSend"("campaignId");

-- CreateIndex
CREATE INDEX "MarketingEmailSend_eventId_status_idx" ON "MarketingEmailSend"("eventId", "status");

-- CreateIndex
CREATE INDEX "MarketingEmailSend_eventId_scheduledSendAt_idx" ON "MarketingEmailSend"("eventId", "scheduledSendAt");

-- CreateIndex
CREATE INDEX "MarketingEmailSend_audienceId_idx" ON "MarketingEmailSend"("audienceId");

-- CreateIndex
CREATE INDEX "MarketingEmailSend_ownerUserId_idx" ON "MarketingEmailSend"("ownerUserId");

-- CreateIndex
CREATE INDEX "MarketingEmailSendRecipient_eventId_emailSendId_idx" ON "MarketingEmailSendRecipient"("eventId", "emailSendId");

-- CreateIndex
CREATE INDEX "MarketingEmailSendRecipient_sendgridMessageId_idx" ON "MarketingEmailSendRecipient"("sendgridMessageId");

-- CreateIndex
CREATE INDEX "MarketingEmailSendRecipient_sourceAudienceRecipientId_idx" ON "MarketingEmailSendRecipient"("sourceAudienceRecipientId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingEmailSendRecipient_emailSendId_normalizedEmail_key" ON "MarketingEmailSendRecipient"("emailSendId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "MarketingEmailEvent_emailSendRecipientId_occurredAt_idx" ON "MarketingEmailEvent"("emailSendRecipientId", "occurredAt");

-- CreateIndex
CREATE INDEX "MarketingEmailEvent_eventId_occurredAt_idx" ON "MarketingEmailEvent"("eventId", "occurredAt");

-- CreateIndex
CREATE INDEX "MarketingEmailEvent_emailSendId_type_idx" ON "MarketingEmailEvent"("emailSendId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingEmailEvent_sgEventId_key" ON "MarketingEmailEvent"("sgEventId");

-- CreateIndex
CREATE INDEX "MarketingSuppression_eventId_reason_idx" ON "MarketingSuppression"("eventId", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingSuppression_eventId_normalizedEmail_key" ON "MarketingSuppression"("eventId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "MarketingKpiSnapshot_eventId_capturedAt_idx" ON "MarketingKpiSnapshot"("eventId", "capturedAt");

-- CreateIndex
CREATE INDEX "MarketingKpiSnapshot_campaignId_capturedAt_idx" ON "MarketingKpiSnapshot"("campaignId", "capturedAt");

-- CreateIndex
CREATE INDEX "MarketingKpiSnapshot_emailSendId_capturedAt_idx" ON "MarketingKpiSnapshot"("emailSendId", "capturedAt");

-- AddForeignKey
ALTER TABLE "MarketingPlan" ADD CONSTRAINT "MarketingPlan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPlan" ADD CONSTRAINT "MarketingPlan_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_marketingPlanId_fkey" FOREIGN KEY ("marketingPlanId") REFERENCES "MarketingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAudience" ADD CONSTRAINT "MarketingAudience_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAudienceRecipient" ADD CONSTRAINT "MarketingAudienceRecipient_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAudienceRecipient" ADD CONSTRAINT "MarketingAudienceRecipient_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "MarketingAudience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEmailSend" ADD CONSTRAINT "MarketingEmailSend_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEmailSend" ADD CONSTRAINT "MarketingEmailSend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEmailSend" ADD CONSTRAINT "MarketingEmailSend_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "MarketingAudience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEmailSend" ADD CONSTRAINT "MarketingEmailSend_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEmailSendRecipient" ADD CONSTRAINT "MarketingEmailSendRecipient_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEmailSendRecipient" ADD CONSTRAINT "MarketingEmailSendRecipient_emailSendId_fkey" FOREIGN KEY ("emailSendId") REFERENCES "MarketingEmailSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEmailEvent" ADD CONSTRAINT "MarketingEmailEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEmailEvent" ADD CONSTRAINT "MarketingEmailEvent_emailSendId_fkey" FOREIGN KEY ("emailSendId") REFERENCES "MarketingEmailSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEmailEvent" ADD CONSTRAINT "MarketingEmailEvent_emailSendRecipientId_fkey" FOREIGN KEY ("emailSendRecipientId") REFERENCES "MarketingEmailSendRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingSuppression" ADD CONSTRAINT "MarketingSuppression_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingKpiSnapshot" ADD CONSTRAINT "MarketingKpiSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingKpiSnapshot" ADD CONSTRAINT "MarketingKpiSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingKpiSnapshot" ADD CONSTRAINT "MarketingKpiSnapshot_emailSendId_fkey" FOREIGN KEY ("emailSendId") REFERENCES "MarketingEmailSend"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingKpiSnapshot" ADD CONSTRAINT "MarketingKpiSnapshot_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
