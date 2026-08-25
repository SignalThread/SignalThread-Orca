-- CreateEnum
CREATE TYPE "SpeakerFileKind" AS ENUM ('SLIDES', 'AGREEMENT', 'OTHER');

-- CreateTable
CREATE TABLE "SpeakerFile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "speakerId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "kind" "SpeakerFileKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "uploadedViaPortal" BOOLEAN NOT NULL DEFAULT false,
    "uploadedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeakerFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpeakerFile_objectKey_key" ON "SpeakerFile"("objectKey");

-- CreateIndex
CREATE INDEX "SpeakerFile_eventId_kind_idx" ON "SpeakerFile"("eventId", "kind");

-- CreateIndex
CREATE INDEX "SpeakerFile_speakerId_idx" ON "SpeakerFile"("speakerId");

-- CreateIndex
CREATE INDEX "SpeakerFile_uploadedByUserId_idx" ON "SpeakerFile"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "SpeakerFile" ADD CONSTRAINT "SpeakerFile_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerFile" ADD CONSTRAINT "SpeakerFile_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerFile" ADD CONSTRAINT "SpeakerFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
