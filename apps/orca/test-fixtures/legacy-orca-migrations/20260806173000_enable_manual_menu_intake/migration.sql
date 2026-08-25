-- Expected/manual menu records have no uploaded file until the source is received.
-- Relaxing these constraints preserves every existing value and enables an honest
-- OUTSTANDING lifecycle state without synthetic storage keys.
ALTER TABLE "EventFnbSourceMenu" ALTER COLUMN "fileName" DROP NOT NULL;
ALTER TABLE "EventFnbSourceMenu" ALTER COLUMN "objectKey" DROP NOT NULL;
