CREATE TABLE "UserDashboardLayout" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "roleKey" TEXT NOT NULL,
  "layout" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserDashboardLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDashboardLayout_userId_eventId_roleKey_key" ON "UserDashboardLayout"("userId", "eventId", "roleKey");
CREATE INDEX "UserDashboardLayout_eventId_roleKey_idx" ON "UserDashboardLayout"("eventId", "roleKey");
CREATE INDEX "UserDashboardLayout_userId_idx" ON "UserDashboardLayout"("userId");

ALTER TABLE "UserDashboardLayout" ADD CONSTRAINT "UserDashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserDashboardLayout" ADD CONSTRAINT "UserDashboardLayout_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
