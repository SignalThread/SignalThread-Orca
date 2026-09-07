CREATE TYPE "SessionOptionalModule" AS ENUM ('ACCESSIBILITY', 'VENDOR_AND_PRODUCTION', 'SAFETY_AND_ESCALATION');

CREATE TABLE "EventSessionModuleDefault" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "module" "SessionOptionalModule" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventSessionModuleDefault_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessionModuleOverride" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "module" "SessionOptionalModule" NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionModuleOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventSessionModuleDefault_eventId_module_key" ON "EventSessionModuleDefault"("eventId", "module");
CREATE INDEX "EventSessionModuleDefault_eventId_idx" ON "EventSessionModuleDefault"("eventId");
CREATE UNIQUE INDEX "SessionModuleOverride_sessionId_module_key" ON "SessionModuleOverride"("sessionId", "module");
CREATE INDEX "SessionModuleOverride_eventId_sessionId_idx" ON "SessionModuleOverride"("eventId", "sessionId");
CREATE INDEX "SessionModuleOverride_eventId_module_idx" ON "SessionModuleOverride"("eventId", "module");

ALTER TABLE "EventSessionModuleDefault" ADD CONSTRAINT "EventSessionModuleDefault_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionModuleOverride" ADD CONSTRAINT "SessionModuleOverride_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionModuleOverride" ADD CONSTRAINT "SessionModuleOverride_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "MatrixRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
