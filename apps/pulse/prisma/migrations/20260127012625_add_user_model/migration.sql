/*
  Warnings:

  - You are about to drop the column `answerId` on the `Analysis` table. All the data in the column will be lost.
  - You are about to drop the column `answerType` on the `Answer` table. All the data in the column will be lost.
  - You are about to drop the column `language` on the `Answer` table. All the data in the column will be lost.
  - You are about to drop the column `questionId` on the `Answer` table. All the data in the column will be lost.
  - You are about to drop the column `answerId` on the `ProcessingLog` table. All the data in the column will be lost.
  - You are about to drop the column `attendeeId` on the `Response` table. All the data in the column will be lost.
  - You are about to drop the column `answerId` on the `Transcript` table. All the data in the column will be lost.
  - You are about to drop the `Attendee` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Question` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `role` on table `Admin` required. This step will fail if there are existing NULL values in that column.
  - Made the column `isActive` on table `Admin` required. This step will fail if there are existing NULL values in that column.
  - Made the column `sessionId` on table `Analysis` required. This step will fail if there are existing NULL values in that column.
  - Made the column `questionKey` on table `Answer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `locationId` on table `Event` required. This step will fail if there are existing NULL values in that column.
  - Made the column `eventType` on table `Event` required. This step will fail if there are existing NULL values in that column.
  - Made the column `isActive` on table `Event` required. This step will fail if there are existing NULL values in that column.
  - Made the column `sessionId` on table `ProcessingLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `anonymousId` on table `Response` required. This step will fail if there are existing NULL values in that column.
  - Made the column `sessionId` on table `Transcript` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'VIEWER');

-- DropForeignKey
ALTER TABLE "Analysis" DROP CONSTRAINT "Analysis_answerId_fkey";

-- DropForeignKey
ALTER TABLE "Answer" DROP CONSTRAINT "Answer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "Attendee" DROP CONSTRAINT "Attendee_eventId_fkey";

-- DropForeignKey
ALTER TABLE "ProcessingLog" DROP CONSTRAINT "ProcessingLog_answerId_fkey";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Response" DROP CONSTRAINT "Response_attendeeId_fkey";

-- DropForeignKey
ALTER TABLE "Transcript" DROP CONSTRAINT "Transcript_answerId_fkey";

-- DropIndex
DROP INDEX "Analysis_answerId_idx";

-- DropIndex
DROP INDEX "Analysis_answerId_key";

-- DropIndex
DROP INDEX "Answer_answerType_idx";

-- DropIndex
DROP INDEX "Answer_questionId_idx";

-- DropIndex
DROP INDEX "Event_createdAt_idx";

-- DropIndex
DROP INDEX "ProcessingLog_answerId_idx";

-- DropIndex
DROP INDEX "Response_attendeeId_idx";

-- DropIndex
DROP INDEX "Transcript_answerId_idx";

-- DropIndex
DROP INDEX "Transcript_answerId_key";

-- AlterTable
ALTER TABLE "Admin" ALTER COLUMN "role" SET NOT NULL,
ALTER COLUMN "isActive" SET NOT NULL;

-- AlterTable
ALTER TABLE "Analysis" DROP COLUMN "answerId",
ALTER COLUMN "sessionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Answer" DROP COLUMN "answerType",
DROP COLUMN "language",
DROP COLUMN "questionId",
ALTER COLUMN "questionKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "locationId" SET NOT NULL,
ALTER COLUMN "eventType" SET NOT NULL,
ALTER COLUMN "isActive" SET NOT NULL;

-- AlterTable
ALTER TABLE "ProcessingLog" DROP COLUMN "answerId",
ALTER COLUMN "sessionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Response" DROP COLUMN "attendeeId",
ALTER COLUMN "anonymousId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Transcript" DROP COLUMN "answerId",
ALTER COLUMN "sessionId" SET NOT NULL;

-- DropTable
DROP TABLE "Attendee";

-- DropTable
DROP TABLE "Question";

-- DropEnum
DROP TYPE "AnswerType";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "accountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_accountId_idx" ON "User"("accountId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
