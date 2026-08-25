-- CreateEnum
CREATE TYPE "SpeakerFileReviewStatus" AS ENUM ('RECEIVED', 'NEEDS_CHANGES', 'APPROVED', 'FINAL');

-- AlterTable
ALTER TABLE "SpeakerFile" ADD COLUMN     "sessionId" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "reviewStatus" "SpeakerFileReviewStatus" NOT NULL DEFAULT 'RECEIVED',
ADD COLUMN     "reviewFeedback" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" UUID;

-- CreateIndex
CREATE INDEX "SpeakerFile_speakerId_kind_sessionId_version_idx" ON "SpeakerFile"("speakerId", "kind", "sessionId", "version");

-- CreateIndex
CREATE INDEX "SpeakerFile_sessionId_idx" ON "SpeakerFile"("sessionId");

-- CreateIndex
CREATE INDEX "SpeakerFile_reviewedByUserId_idx" ON "SpeakerFile"("reviewedByUserId");

-- AddForeignKey
ALTER TABLE "SpeakerFile" ADD CONSTRAINT "SpeakerFile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerFile" ADD CONSTRAINT "SpeakerFile_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
