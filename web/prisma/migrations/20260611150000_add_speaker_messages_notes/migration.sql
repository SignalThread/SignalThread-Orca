-- CreateEnum
CREATE TYPE "SpeakerMessageSender" AS ENUM ('PLANNER', 'SPEAKER');

-- CreateTable
CREATE TABLE "SpeakerMessage" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "speakerId" UUID NOT NULL,
    "sessionId" UUID,
    "speakerFileId" UUID,
    "senderType" "SpeakerMessageSender" NOT NULL,
    "senderUserId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeakerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeakerInternalNote" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "speakerId" UUID NOT NULL,
    "sessionId" UUID,
    "speakerFileId" UUID,
    "authorUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeakerInternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpeakerMessage_eventId_idx" ON "SpeakerMessage"("eventId");

-- CreateIndex
CREATE INDEX "SpeakerMessage_speakerId_createdAt_idx" ON "SpeakerMessage"("speakerId", "createdAt");

-- CreateIndex
CREATE INDEX "SpeakerMessage_sessionId_idx" ON "SpeakerMessage"("sessionId");

-- CreateIndex
CREATE INDEX "SpeakerMessage_speakerFileId_idx" ON "SpeakerMessage"("speakerFileId");

-- CreateIndex
CREATE INDEX "SpeakerMessage_senderUserId_idx" ON "SpeakerMessage"("senderUserId");

-- CreateIndex
CREATE INDEX "SpeakerInternalNote_eventId_idx" ON "SpeakerInternalNote"("eventId");

-- CreateIndex
CREATE INDEX "SpeakerInternalNote_speakerId_createdAt_idx" ON "SpeakerInternalNote"("speakerId", "createdAt");

-- CreateIndex
CREATE INDEX "SpeakerInternalNote_sessionId_idx" ON "SpeakerInternalNote"("sessionId");

-- CreateIndex
CREATE INDEX "SpeakerInternalNote_speakerFileId_idx" ON "SpeakerInternalNote"("speakerFileId");

-- CreateIndex
CREATE INDEX "SpeakerInternalNote_authorUserId_idx" ON "SpeakerInternalNote"("authorUserId");

-- AddForeignKey
ALTER TABLE "SpeakerMessage" ADD CONSTRAINT "SpeakerMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerMessage" ADD CONSTRAINT "SpeakerMessage_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerMessage" ADD CONSTRAINT "SpeakerMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerMessage" ADD CONSTRAINT "SpeakerMessage_speakerFileId_fkey" FOREIGN KEY ("speakerFileId") REFERENCES "SpeakerFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerMessage" ADD CONSTRAINT "SpeakerMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerInternalNote" ADD CONSTRAINT "SpeakerInternalNote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerInternalNote" ADD CONSTRAINT "SpeakerInternalNote_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerInternalNote" ADD CONSTRAINT "SpeakerInternalNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerInternalNote" ADD CONSTRAINT "SpeakerInternalNote_speakerFileId_fkey" FOREIGN KEY ("speakerFileId") REFERENCES "SpeakerFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerInternalNote" ADD CONSTRAINT "SpeakerInternalNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
