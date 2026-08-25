-- Platform Core migration, Phase 1: canonical user identity.
--
-- Additive and non-destructive. Orca still resolves identity by email during the
-- transition; this column records the canonical SignalThread Platform Core user id so the
-- resolver can key on it instead. No existing data is modified by this migration --
-- linking happens on first authenticated request, or via
-- `web/scripts/backfill-platform-user-ids.ts`.
ALTER TABLE "User" ADD COLUMN "platformUserId" UUID;

-- One Orca user per Platform Core identity. NULLs are unconstrained, so unlinked rows
-- coexist with linked ones for the duration of the transition.
CREATE UNIQUE INDEX "User_platformUserId_key" ON "User"("platformUserId");
CREATE INDEX "User_platformUserId_idx" ON "User"("platformUserId");
