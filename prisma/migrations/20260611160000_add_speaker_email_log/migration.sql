-- CreateEnum
CREATE TYPE "SpeakerReminderKind" AS ENUM ('INCOMPLETE_PROFILE', 'MISSING_DECK', 'MISSING_DOCUMENT');

-- CreateEnum
CREATE TYPE "SpeakerEmailStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED_NO_PROVIDER');

-- CreateTable
CREATE TABLE "SpeakerEmailLog" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "speakerId" UUID NOT NULL,
    "kind" "SpeakerReminderKind" NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SpeakerEmailStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "error" TEXT,
    "triggeredByUserId" UUID,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeakerEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpeakerEmailLog_eventId_createdAt_idx" ON "SpeakerEmailLog"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "SpeakerEmailLog_speakerId_createdAt_idx" ON "SpeakerEmailLog"("speakerId", "createdAt");

-- CreateIndex
CREATE INDEX "SpeakerEmailLog_triggeredByUserId_idx" ON "SpeakerEmailLog"("triggeredByUserId");

-- AddForeignKey
ALTER TABLE "SpeakerEmailLog" ADD CONSTRAINT "SpeakerEmailLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerEmailLog" ADD CONSTRAINT "SpeakerEmailLog_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerEmailLog" ADD CONSTRAINT "SpeakerEmailLog_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
