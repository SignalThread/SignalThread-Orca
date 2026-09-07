-- CreateEnum
CREATE TYPE "ResponseMode" AS ENUM ('VOICE_ONLY', 'TEXT_ONLY', 'VOICE_AND_TEXT');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "responseMode" "ResponseMode" NOT NULL DEFAULT 'VOICE_ONLY';

-- AlterEnum
ALTER TYPE "ProcessingStep" ADD VALUE 'TEXT_ENTRY';
