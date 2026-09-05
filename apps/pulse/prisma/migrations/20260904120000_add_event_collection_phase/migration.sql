-- Historical Survey and Response rows intentionally remain NULL. A separate,
-- evidence-backed audit may classify them later; this migration never guesses.
CREATE TYPE "CollectionPhase" AS ENUM ('PRE', 'DURING', 'POST');

ALTER TABLE "Survey" ADD COLUMN "collectionPhase" "CollectionPhase";
ALTER TABLE "Response" ADD COLUMN "collectionPhase" "CollectionPhase";

CREATE INDEX "Survey_eventId_collectionPhase_idx"
ON "Survey"("eventId", "collectionPhase");

CREATE INDEX "Response_eventId_collectionPhase_status_idx"
ON "Response"("eventId", "collectionPhase", "status");

-- Response phase is historical evidence provenance. Once captured, changing a
-- survey's phase must not rewrite the phase of responses already in flight.
CREATE OR REPLACE FUNCTION prevent_response_collection_phase_change()
RETURNS trigger AS $$
BEGIN
  -- Permit one deliberate NULL -> phase classification for legacy rows. New
  -- Event responses are never created NULL, and any classified value is fixed.
  IF OLD."collectionPhase" IS NOT NULL
     AND OLD."collectionPhase" IS DISTINCT FROM NEW."collectionPhase" THEN
    RAISE EXCEPTION 'Response.collectionPhase is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Response_collectionPhase_immutable"
BEFORE UPDATE OF "collectionPhase" ON "Response"
FOR EACH ROW
EXECUTE FUNCTION prevent_response_collection_phase_change();
