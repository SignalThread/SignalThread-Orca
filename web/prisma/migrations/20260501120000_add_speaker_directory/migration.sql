DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SpeakerStatus') THEN
    CREATE TYPE "SpeakerStatus" AS ENUM ('NEEDS_INFO', 'INVITED', 'CONFIRMED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Speaker" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "title" TEXT,
  "company" TEXT,
  "bio" TEXT,
  "headshotUrl" TEXT,
  "status" "SpeakerStatus" NOT NULL DEFAULT 'NEEDS_INFO',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Speaker_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Speaker_eventId_status_idx" ON "Speaker"("eventId", "status");
CREATE INDEX IF NOT EXISTS "Speaker_eventId_idx" ON "Speaker"("eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "Speaker_eventId_email_key" ON "Speaker"("eventId", "email");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Speaker_eventId_fkey') THEN
    ALTER TABLE "Speaker"
      ADD CONSTRAINT "Speaker_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
