-- CreateEnum
CREATE TYPE "EventPersonRole" AS ENUM ('SPEAKER', 'STAFF', 'VENDOR');

-- CreateTable
CREATE TABLE "EventPerson" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" "EventPersonRole" NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSpeaker" (
    "sessionId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionSpeaker_pkey" PRIMARY KEY ("sessionId", "personId")
);

-- CreateTable
CREATE TABLE "SessionAVRequirement" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "avType" TEXT NOT NULL,
    "quantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SessionAVRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionFoodService" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "serviceType" TEXT NOT NULL,
    "serviceStyle" TEXT,
    "headcount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SessionFoodService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionStaffAssignment" (
    "sessionId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SessionStaffAssignment_pkey" PRIMARY KEY ("sessionId", "personId")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventPerson_eventId_name_key" ON "EventPerson"("eventId", "name");

-- CreateIndex
CREATE INDEX "EventPerson_eventId_role_idx" ON "EventPerson"("eventId", "role");

-- CreateIndex
CREATE INDEX "EventPerson_eventId_email_idx" ON "EventPerson"("eventId", "email");

-- CreateIndex
CREATE INDEX "SessionSpeaker_personId_idx" ON "SessionSpeaker"("personId");

-- CreateIndex
CREATE INDEX "SessionAVRequirement_sessionId_idx" ON "SessionAVRequirement"("sessionId");

-- CreateIndex
CREATE INDEX "SessionAVRequirement_sessionId_avType_idx" ON "SessionAVRequirement"("sessionId", "avType");

-- CreateIndex
CREATE UNIQUE INDEX "SessionFoodService_sessionId_key" ON "SessionFoodService"("sessionId");

-- CreateIndex
CREATE INDEX "SessionStaffAssignment_personId_idx" ON "SessionStaffAssignment"("personId");

-- AddForeignKey
ALTER TABLE "EventPerson"
ADD CONSTRAINT "EventPerson_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSpeaker"
ADD CONSTRAINT "SessionSpeaker_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSpeaker"
ADD CONSTRAINT "SessionSpeaker_personId_fkey"
FOREIGN KEY ("personId") REFERENCES "EventPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAVRequirement"
ADD CONSTRAINT "SessionAVRequirement_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionFoodService"
ADD CONSTRAINT "SessionFoodService_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStaffAssignment"
ADD CONSTRAINT "SessionStaffAssignment_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStaffAssignment"
ADD CONSTRAINT "SessionStaffAssignment_personId_fkey"
FOREIGN KEY ("personId") REFERENCES "EventPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
