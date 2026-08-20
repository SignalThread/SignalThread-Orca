-- Slice 4: session-level models are the sole authorities for staff and AV.
-- Legacy Matrix fields/tables remain physically intact for rollback, but runtime
-- readers/writers no longer use them after this migration.

DO $$
BEGIN
  IF to_regclass('"MatrixRowStaffAssignment"') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM "MatrixRowStaffAssignment" legacy
      LEFT JOIN "MatrixRow" session ON session."id" = legacy."matrixRowId"
      LEFT JOIN "EventPerson" person ON person."id" = legacy."eventPersonId"
      WHERE session."id" IS NULL
         OR person."id" IS NULL
         OR session."eventId" <> person."eventId"
    ) THEN
      RAISE EXCEPTION 'Cannot reconcile MatrixRowStaffAssignment rows with missing or cross-event references';
    END IF;

    INSERT INTO "SessionStaffAssignment" ("sessionId", "personId", "role", "createdAt", "updatedAt")
    SELECT legacy."matrixRowId", legacy."eventPersonId", legacy."assignmentrole", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "MatrixRowStaffAssignment" legacy
    JOIN "MatrixRow" session ON session."id" = legacy."matrixRowId"
    JOIN "EventPerson" person ON person."id" = legacy."eventPersonId" AND person."eventId" = session."eventId"
    ON CONFLICT ("sessionId", "personId") DO NOTHING;
  END IF;
END $$;

WITH legacy_av AS (
  SELECT row."id" AS "sessionId", trim(value) AS label
  FROM "MatrixRow" row
  CROSS JOIN LATERAL regexp_split_to_table(concat_ws(E'\n', row."avNeeds", row."avNotes"), E'[\n,;|]+') AS value
  WHERE trim(value) <> ''
), parsed_av AS (
  SELECT DISTINCT ON ("sessionId", lower(regexp_replace(label, E'\\s*\\(\\d+\\)\\s*$', '')))
    "sessionId",
    trim(regexp_replace(label, E'\\s*\\(\\d+\\)\\s*$', '')) AS "avType",
    CASE WHEN label ~ E'\\(\\d+\\)\\s*$' THEN (substring(label FROM E'\\((\\d+)\\)\\s*$'))::integer ELSE NULL END AS quantity
  FROM legacy_av
  ORDER BY "sessionId", lower(regexp_replace(label, E'\\s*\\(\\d+\\)\\s*$', ''))
)
INSERT INTO "SessionAVRequirement" ("id", "sessionId", "avType", "quantity", "createdAt", "updatedAt")
SELECT gen_random_uuid(), parsed."sessionId", parsed."avType", parsed.quantity, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM parsed_av parsed
WHERE parsed."avType" <> ''
  AND NOT EXISTS (SELECT 1 FROM "SessionAVRequirement" structured WHERE structured."sessionId" = parsed."sessionId");
