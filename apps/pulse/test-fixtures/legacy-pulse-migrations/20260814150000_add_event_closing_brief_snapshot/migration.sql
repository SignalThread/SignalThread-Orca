CREATE TABLE "EventClosingBriefSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "briefHash" TEXT NOT NULL,
    "briefJson" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventClosingBriefSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventClosingBriefSnapshot_eventId_key" ON "EventClosingBriefSnapshot"("eventId");
CREATE INDEX "EventClosingBriefSnapshot_accountId_idx" ON "EventClosingBriefSnapshot"("accountId");
CREATE INDEX "EventClosingBriefSnapshot_accountId_eventId_idx" ON "EventClosingBriefSnapshot"("accountId", "eventId");
CREATE INDEX "EventClosingBriefSnapshot_briefHash_idx" ON "EventClosingBriefSnapshot"("briefHash");

ALTER TABLE "EventClosingBriefSnapshot" ADD CONSTRAINT "EventClosingBriefSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventClosingBriefSnapshot" ADD CONSTRAINT "EventClosingBriefSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
