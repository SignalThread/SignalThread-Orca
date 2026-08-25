-- CreateTable
CREATE TABLE "SpeakerOnsiteInfo" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "greenRoomLocation" TEXT,
    "arrivalInstructions" TEXT,
    "badgePickupInfo" TEXT,
    "onsiteContact" TEXT,
    "avRehearsalInfo" TEXT,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeakerOnsiteInfo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpeakerOnsiteInfo_eventId_key" ON "SpeakerOnsiteInfo"("eventId");

-- CreateIndex
CREATE INDEX "SpeakerOnsiteInfo_updatedByUserId_idx" ON "SpeakerOnsiteInfo"("updatedByUserId");

-- AddForeignKey
ALTER TABLE "SpeakerOnsiteInfo" ADD CONSTRAINT "SpeakerOnsiteInfo_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerOnsiteInfo" ADD CONSTRAINT "SpeakerOnsiteInfo_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
