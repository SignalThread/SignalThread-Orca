-- Restore the schema-defined EventPersonRole enum where historical databases
-- retained lower-case text values despite recording the original migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'EventPersonRole' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "EventPersonRole" AS ENUM ('SPEAKER', 'STAFF', 'VENDOR');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "EventPerson"
    WHERE lower(trim("role"::text)) NOT IN ('speaker', 'staff', 'vendor')
  ) THEN
    RAISE EXCEPTION 'Cannot normalize EventPerson.role values outside speaker, staff, vendor';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'EventPerson'
      AND column_name = 'role'
      AND udt_name <> 'EventPersonRole'
  ) THEN
    -- The legacy text column has a text-only role check. The enum itself
    -- replaces that constraint after the values were validated above.
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public."EventPerson"'::regclass
        AND conname = 'EventPerson_role_check'
    ) THEN
      ALTER TABLE "EventPerson" DROP CONSTRAINT "EventPerson_role_check";
    END IF;

    ALTER TABLE "EventPerson"
      ALTER COLUMN "role" TYPE "EventPersonRole"
      USING (
        CASE lower(trim("role"::text))
          WHEN 'speaker' THEN 'SPEAKER'::"EventPersonRole"
          WHEN 'staff' THEN 'STAFF'::"EventPersonRole"
          WHEN 'vendor' THEN 'VENDOR'::"EventPersonRole"
        END
      );
  END IF;
END $$;
