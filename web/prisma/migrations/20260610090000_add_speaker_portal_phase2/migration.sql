-- CreateEnum
CREATE TYPE "SpeakerSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Speaker" ADD COLUMN     "avNeeds" TEXT,
ADD COLUMN     "travelNeeds" TEXT,
ADD COLUMN     "dietaryRestrictions" TEXT,
ADD COLUMN     "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "websiteUrl" TEXT,
ADD COLUMN     "intakeTokenSentAt" TIMESTAMP(3),
ADD COLUMN     "intakeSubmittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SpeakerIntakeToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "speakerId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeakerIntakeToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeakerProfileSubmission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "speakerId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "tokenId" UUID,
    "status" "SpeakerSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "name" TEXT,
    "title" TEXT,
    "company" TEXT,
    "bio" TEXT,
    "phone" TEXT,
    "headshotUrl" TEXT,
    "avNeeds" TEXT,
    "travelNeeds" TEXT,
    "dietaryRestrictions" TEXT,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "linkedinUrl" TEXT,
    "websiteUrl" TEXT,
    "noteToPlanner" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeakerProfileSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeakerReadinessItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "speakerId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeakerReadinessItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpeakerIntakeToken_tokenHash_key" ON "SpeakerIntakeToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SpeakerIntakeToken_speakerId_eventId_idx" ON "SpeakerIntakeToken"("speakerId", "eventId");

-- CreateIndex
CREATE INDEX "SpeakerIntakeToken_eventId_idx" ON "SpeakerIntakeToken"("eventId");

-- CreateIndex
CREATE INDEX "SpeakerIntakeToken_expiresAt_idx" ON "SpeakerIntakeToken"("expiresAt");

-- CreateIndex
CREATE INDEX "SpeakerProfileSubmission_eventId_status_idx" ON "SpeakerProfileSubmission"("eventId", "status");

-- CreateIndex
CREATE INDEX "SpeakerProfileSubmission_speakerId_status_idx" ON "SpeakerProfileSubmission"("speakerId", "status");

-- CreateIndex
CREATE INDEX "SpeakerProfileSubmission_tokenId_idx" ON "SpeakerProfileSubmission"("tokenId");

-- CreateIndex
CREATE INDEX "SpeakerProfileSubmission_reviewedByUserId_idx" ON "SpeakerProfileSubmission"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SpeakerReadinessItem_speakerId_eventId_key_key" ON "SpeakerReadinessItem"("speakerId", "eventId", "key");

-- CreateIndex
CREATE INDEX "SpeakerReadinessItem_eventId_completed_idx" ON "SpeakerReadinessItem"("eventId", "completed");

-- AddForeignKey
ALTER TABLE "SpeakerIntakeToken" ADD CONSTRAINT "SpeakerIntakeToken_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerIntakeToken" ADD CONSTRAINT "SpeakerIntakeToken_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerProfileSubmission" ADD CONSTRAINT "SpeakerProfileSubmission_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerProfileSubmission" ADD CONSTRAINT "SpeakerProfileSubmission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerProfileSubmission" ADD CONSTRAINT "SpeakerProfileSubmission_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "SpeakerIntakeToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerProfileSubmission" ADD CONSTRAINT "SpeakerProfileSubmission_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerReadinessItem" ADD CONSTRAINT "SpeakerReadinessItem_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerReadinessItem" ADD CONSTRAINT "SpeakerReadinessItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
