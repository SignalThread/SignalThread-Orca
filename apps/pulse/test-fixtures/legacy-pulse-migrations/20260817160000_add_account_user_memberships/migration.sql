-- Canonical many-to-many account access for regular users. User.accountId is
-- retained as the primary/default account for compatibility and landing.
CREATE TABLE "AccountUserMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountUserMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountUserMembership_userId_accountId_key"
    ON "AccountUserMembership"("userId", "accountId");
CREATE INDEX "AccountUserMembership_accountId_idx"
    ON "AccountUserMembership"("accountId");
CREATE INDEX "AccountUserMembership_userId_idx"
    ON "AccountUserMembership"("userId");

ALTER TABLE "AccountUserMembership"
    ADD CONSTRAINT "AccountUserMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountUserMembership"
    ADD CONSTRAINT "AccountUserMembership_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A default account must never own the user's identity. Deleting one account
-- must preserve a user who still belongs to another account.
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_accountId_fkey";
ALTER TABLE "User"
    ADD CONSTRAINT "User_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deterministic IDs make the data migration safe to retry. Platform admins
-- remain membership-free and keep their existing all-account authorization.
INSERT INTO "AccountUserMembership" ("id", "userId", "accountId", "createdAt", "updatedAt")
SELECT
    'aum_' || md5(u."id" || ':' || u."accountId"),
    u."id",
    u."accountId",
    u."createdAt",
    CURRENT_TIMESTAMP
FROM "User" u
WHERE u."accountId" IS NOT NULL
  AND u."role" <> 'SUPER_ADMIN'
ON CONFLICT ("userId", "accountId") DO NOTHING;
