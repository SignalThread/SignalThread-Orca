-- Canonical SignalThread Platform Core identity mapping (phase 1).
--
-- Additive only: three nullable uuid columns and their indexes. No existing column is
-- altered, no row is written, no backfill is performed and no local primary key changes,
-- so every public URL, QR code, storage key, survey id and response id keeps its value.
--
-- Uniqueness is deliberate and asymmetric (see docs/PLATFORM_IDENTITY_MAPPING.md):
--   User.platformUserId       UNIQUE  — one canonical user resolves to one Pulse user.
--   Event.platformEventId     UNIQUE  — one canonical event resolves to one Pulse
--                                       workspace. Nullable, and Postgres allows
--                                       unlimited NULLs, so Retail campaign Events (which
--                                       are never mapped) are unaffected.
--   Account.platformOrganizationId NOT unique — an organization may legitimately own
--                                       several Pulse Accounts, so the reverse direction
--                                       is resolved as ambiguous rather than constrained.
--
-- Mappings are assigned explicitly by a later phase. Nothing here infers one from email,
-- name, slug, contact email, domain or demo data.

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "platformOrganizationId" UUID;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "platformEventId" UUID;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformUserId" UUID;

-- CreateIndex
CREATE INDEX "Account_platformOrganizationId_idx" ON "Account"("platformOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_platformEventId_key" ON "Event"("platformEventId");

-- CreateIndex
CREATE UNIQUE INDEX "User_platformUserId_key" ON "User"("platformUserId");
