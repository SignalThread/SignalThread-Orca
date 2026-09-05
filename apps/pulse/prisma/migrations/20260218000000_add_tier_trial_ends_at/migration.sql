-- AlterTable
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);

-- Update default tier from 'free' to 'starter' for new accounts (schema default change only; existing rows keep current value)
-- Note: Prisma handles default in application layer; no ALTER needed for default change on existing column
