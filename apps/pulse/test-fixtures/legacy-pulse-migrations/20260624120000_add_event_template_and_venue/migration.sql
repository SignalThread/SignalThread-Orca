-- Add optional event template provenance and free-text venue.
-- Both columns are nullable with no default, so this is a safe additive change
-- for existing rows (legacy events simply have NULL templateKey/venue).

ALTER TABLE "Event" ADD COLUMN "templateKey" TEXT;
ALTER TABLE "Event" ADD COLUMN "venue" TEXT;
