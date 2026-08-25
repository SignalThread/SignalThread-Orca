import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const rootRepairMigration = "test-fixtures/legacy-orca-migrations/20260729140000_restore_session_staff_assignment/migration.sql";
const webRepairMigration = "test-fixtures/legacy-orca-migrations/20260729140000_restore_session_staff_assignment/migration.sql";
const rootSlice4Migration = "test-fixtures/legacy-orca-migrations/20260729150000_slice4_session_authorities/migration.sql";
const webSlice4Migration = "test-fixtures/legacy-orca-migrations/20260729150000_slice4_session_authorities/migration.sql";
const rootEventPersonRoleRepair = "test-fixtures/legacy-orca-migrations/20260730120000_repair_event_person_role_enum/migration.sql";
const webEventPersonRoleRepair = "test-fixtures/legacy-orca-migrations/20260730120000_repair_event_person_role_enum/migration.sql";
const matrix2Source = readFileSync("lib/matrix2.ts", "utf8");
const matrix2SessionSource = readFileSync("lib/matrix2-session.ts", "utf8");

test("active Prisma migration history restores the canonical staff model before Slice 4 reconciliation", () => {
  for (const migration of [rootRepairMigration, webRepairMigration, rootSlice4Migration, webSlice4Migration]) {
    assert.ok(existsSync(migration), `missing migration: ${migration}`);
  }

  const repairSql = readFileSync(webRepairMigration, "utf8");
  assert.match(repairSql, /CREATE TABLE IF NOT EXISTS "SessionStaffAssignment"/);
  assert.match(repairSql, /SessionStaffAssignment_pkey/);
  assert.match(repairSql, /SessionStaffAssignment_personId_idx/);
  assert.match(repairSql, /SessionStaffAssignment_sessionId_fkey/);
  assert.match(repairSql, /SessionStaffAssignment_personId_fkey/);
  assert.equal(readFileSync(rootRepairMigration, "utf8"), repairSql);
  assert.equal(readFileSync(rootSlice4Migration, "utf8"), readFileSync(webSlice4Migration, "utf8"));
});

test("legacy text EventPerson roles are normalized to the canonical enum without dropping staffing rows", () => {
  for (const migration of [rootEventPersonRoleRepair, webEventPersonRoleRepair]) {
    assert.ok(existsSync(migration), `missing migration: ${migration}`);
  }

  const repairSql = readFileSync(webEventPersonRoleRepair, "utf8");
  assert.match(repairSql, /CREATE TYPE "EventPersonRole" AS ENUM \('SPEAKER', 'STAFF', 'VENDOR'\)/);
  assert.match(repairSql, /Cannot normalize EventPerson\.role values outside speaker, staff, vendor/);
  assert.match(repairSql, /WHEN 'staff' THEN 'STAFF'::"EventPersonRole"/);
  assert.match(repairSql, /ALTER COLUMN "role" TYPE "EventPersonRole"/);
  assert.doesNotMatch(repairSql, /'staff'\s*\)/);
  assert.equal(readFileSync(rootEventPersonRoleRepair, "utf8"), repairSql);

  assert.match(matrix2Source, /\$\{persistedRole\}::"EventPersonRole"/);
  assert.match(matrix2SessionSource, /\$\{persistedRole\}::"EventPersonRole"/);
});

test("the read-only Matrix snapshot does not open a nested interactive transaction", () => {
  const snapshotSource = matrix2Source.slice(
    matrix2Source.indexOf("export async function getMatrix2Snapshot"),
    matrix2Source.indexOf("const roomById"),
  );
  const templateSource = readFileSync("lib/session-requirements.ts", "utf8").slice(
    readFileSync("lib/session-requirements.ts", "utf8").indexOf("export async function getEventSessionRequirementTemplate"),
    readFileSync("lib/session-requirements.ts", "utf8").indexOf("/** Explicit write-time initialization"),
  );

  assert.doesNotMatch(snapshotSource, /\$transaction/);
  assert.match(snapshotSource, /const \[roomsFromTable, rows, peopleAssignments, requirements\] = await Promise\.all/);
  assert.match(matrix2Source, /usedTransaction: false/);
  assert.doesNotMatch(templateSource, /\$transaction/);
});

test("a missing canonical staffing table fails the Matrix snapshot visibly instead of selecting a legacy authority", () => {
  const authorityReader = matrix2Source.slice(
    matrix2Source.indexOf("async function listMatrixRowStaffAssignmentsCompat"),
    matrix2Source.indexOf("export async function listMatrix2People"),
  );

  assert.match(authorityReader, /db\.sessionStaffAssignment\.findMany/);
  assert.match(authorityReader, /isMissingCanonicalSessionAuthority/);
  assert.match(authorityReader, /new Matrix2Error\(/);
  assert.match(authorityReader, /required database migration has not been applied/);
  assert.doesNotMatch(authorityReader, /\$queryRaw/);
});
