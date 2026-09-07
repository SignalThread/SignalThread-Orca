-- CreateEnum
CREATE TYPE "InsightSection" AS ENUM ('WORKING', 'OPPORTUNITY');

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "themeKey" TEXT NOT NULL,
    "section" "InsightSection" NOT NULL,
    "title" TEXT NOT NULL,
    "bodyText" TEXT,
    "isAction" BOOLEAN NOT NULL DEFAULT false,
    "impactScore" INTEGER,
    "priority" TEXT,
    "windowDays" INTEGER NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightSourceAnswer" (
    "id" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,

    CONSTRAINT "InsightSourceAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Insight_eventId_themeKey_key" ON "Insight"("eventId", "themeKey");

-- CreateIndex
CREATE INDEX "Insight_eventId_idx" ON "Insight"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "InsightSourceAnswer_insightId_answerId_key" ON "InsightSourceAnswer"("insightId", "answerId");

-- CreateIndex
CREATE INDEX "InsightSourceAnswer_answerId_idx" ON "InsightSourceAnswer"("answerId");

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightSourceAnswer" ADD CONSTRAINT "InsightSourceAnswer_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "Insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightSourceAnswer" ADD CONSTRAINT "InsightSourceAnswer_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
