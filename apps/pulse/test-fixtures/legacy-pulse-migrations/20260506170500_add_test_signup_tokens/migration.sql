CREATE TABLE "TestSignupToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TestSignupToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TestSignupToken_tokenHash_key" ON "TestSignupToken"("tokenHash");
CREATE INDEX "TestSignupToken_createdByUserId_idx" ON "TestSignupToken"("createdByUserId");
CREATE INDEX "TestSignupToken_usedAt_idx" ON "TestSignupToken"("usedAt");
CREATE INDEX "TestSignupToken_expiresAt_idx" ON "TestSignupToken"("expiresAt");

ALTER TABLE "TestSignupToken"
  ADD CONSTRAINT "TestSignupToken_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
