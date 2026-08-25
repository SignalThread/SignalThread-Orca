-- AlterEnum
ALTER TYPE "DocumentLinkType" ADD VALUE 'SPEAKER';

-- CreateTable
CREATE TABLE "SpeakerDocumentRequest" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "speakerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "requiresSignature" BOOLEAN NOT NULL DEFAULT false,
    "speakerFileId" UUID,
    "documentId" UUID,
    "createdByUserId" UUID,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeakerDocumentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpeakerDocumentRequest_eventId_idx" ON "SpeakerDocumentRequest"("eventId");

-- CreateIndex
CREATE INDEX "SpeakerDocumentRequest_speakerId_idx" ON "SpeakerDocumentRequest"("speakerId");

-- CreateIndex
CREATE INDEX "SpeakerDocumentRequest_documentId_idx" ON "SpeakerDocumentRequest"("documentId");

-- CreateIndex
CREATE INDEX "SpeakerDocumentRequest_speakerFileId_idx" ON "SpeakerDocumentRequest"("speakerFileId");

-- CreateIndex
CREATE INDEX "SpeakerDocumentRequest_createdByUserId_idx" ON "SpeakerDocumentRequest"("createdByUserId");

-- AddForeignKey
ALTER TABLE "SpeakerDocumentRequest" ADD CONSTRAINT "SpeakerDocumentRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerDocumentRequest" ADD CONSTRAINT "SpeakerDocumentRequest_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerDocumentRequest" ADD CONSTRAINT "SpeakerDocumentRequest_speakerFileId_fkey" FOREIGN KEY ("speakerFileId") REFERENCES "SpeakerFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerDocumentRequest" ADD CONSTRAINT "SpeakerDocumentRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerDocumentRequest" ADD CONSTRAINT "SpeakerDocumentRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
