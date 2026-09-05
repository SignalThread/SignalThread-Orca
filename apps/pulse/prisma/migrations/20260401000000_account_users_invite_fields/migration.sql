-- PendingProvision: invite role + display names; User: optional names for team members
ALTER TABLE "PendingProvision" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'ADMIN';
ALTER TABLE "PendingProvision" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "PendingProvision" ADD COLUMN IF NOT EXISTS "lastName" TEXT;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
