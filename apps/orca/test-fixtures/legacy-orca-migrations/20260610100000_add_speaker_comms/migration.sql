-- AlterEnum
ALTER TYPE "EventActivityType" ADD VALUE 'SPEAKER_UPDATED';

-- AlterTable
ALTER TABLE "Speaker" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);
