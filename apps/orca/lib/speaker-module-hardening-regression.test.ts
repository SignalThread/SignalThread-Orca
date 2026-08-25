import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Module-wide hardening sweeps for the Speaker module. These pin the
 * cross-cutting invariants; per-feature behavior is pinned by the
 * feature-specific speaker-*-regression test files.
 */

function collectFiles(dir: string, suffixes: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full, suffixes));
    } else if (suffixes.some((suffix) => full.endsWith(suffix))) {
      out.push(full);
    }
  }
  return out;
}

const SPEAKER_SERVICE_FILES = collectFiles("src/server/services", [".ts"]).filter((path) =>
  path.includes("speaker"),
);

const PORTAL_ROUTE_FILES = collectFiles("app/api/public/speaker-portal", ["route.ts"]);
const PORTAL_COMPONENT_FILES = collectFiles("app/speaker-portal", [".tsx"]);

test("speaker services never write to canonical Matrix, Docs Hub, or Deadlines records", () => {
  assert.equal(SPEAKER_SERVICE_FILES.length >= 10, true, "expected the full speaker service set");

  for (const path of SPEAKER_SERVICE_FILES) {
    const source = readFileSync(path, "utf8");
    for (const forbidden of [
      "matrixRow.update",
      "matrixRow.create",
      "matrixRow.delete",
      "deadline.update",
      "deadline.create",
      "deadline.delete",
      "document.update(",
      "documentApproval.create",
      "documentVersion.create",
    ]) {
      assert.equal(
        source.includes(forbidden),
        false,
        `${path} must not write canonical records directly (${forbidden})`,
      );
    }
  }
});

test("every speaker service write path is guarded by event access or portal token resolution", () => {
  for (const path of SPEAKER_SERVICE_FILES) {
    const source = readFileSync(path, "utf8");
    // Only count database writes (crypto helpers like hmac.update() are not writes).
    const performsWrites =
      source.includes("getPrisma") &&
      [".create(", ".update(", ".updateMany(", ".upsert(", ".delete(", ".createMany("].some((term) =>
        source.includes(term),
      );
    if (!performsWrites) continue;

    const guarded =
      source.includes("assertEventAccessForUser") || source.includes("resolveSpeakerPortalToken");
    assert.equal(guarded, true, `${path} performs writes but has no server-side access guard`);
  }
});

test("portal surface never references internal-only data or admin services", () => {
  for (const path of [...PORTAL_ROUTE_FILES, ...PORTAL_COMPONENT_FILES]) {
    const source = readFileSync(path, "utf8");
    for (const forbidden of [
      "internalNote",
      "InternalNote",
      "speaker-reminders",
      "speaker-activity",
      "listSpeakerEmailLogs",
      "resolveRequestUser",
      "assertEventAccessForUser",
      "senderName",
      "reviewedByUserId",
      "uploadedByUserId",
      "objectKey: true",
    ]) {
      assert.equal(source.includes(forbidden), false, `${path} must not reference ${forbidden}`);
    }
  }
});

test("portal services derive speaker identity from the token, never from client input", () => {
  for (const path of SPEAKER_SERVICE_FILES) {
    const source = readFileSync(path, "utf8");
    const portalFunctions = source.match(/export async function \w*Portal\w*\([\s\S]*?\n\}/g) ?? [];
    for (const fn of portalFunctions) {
      if (!fn.includes("rawToken")) continue;
      assert.equal(fn.includes("input.speakerId"), false, `${path} portal path must not trust input.speakerId`);
      assert.equal(fn.includes("input.eventId"), false, `${path} portal path must not trust input.eventId`);
    }
  }
});

test("all speaker tables are event-scoped in the schema", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const speakerModels = schema.match(/model Speaker\w* \{[\s\S]*?\n\}/g) ?? [];
  assert.equal(speakerModels.length >= 8, true, "expected the full speaker model set");

  for (const model of speakerModels) {
    const name = model.slice(0, model.indexOf("{")).trim();
    assert.equal(model.includes("eventId"), true, `${name} must be event-scoped`);
    assert.equal(model.includes("Json"), false, `${name} must not use JSON blobs`);
  }
});

test("speaker module migrations are strictly additive", () => {
  const migrationDirs = readdirSync("test-fixtures/legacy-orca-migrations").filter((dir) => dir.includes("speaker"));
  assert.equal(migrationDirs.length >= 4, true, "expected the speaker module migration set");

  for (const dir of migrationDirs) {
    const sql = readFileSync(join("test-fixtures/legacy-orca-migrations", dir, "migration.sql"), "utf8");
    for (const forbidden of ["DROP TABLE", "DROP COLUMN", "RENAME COLUMN", "DELETE FROM", "TRUNCATE"]) {
      assert.equal(sql.toUpperCase().includes(forbidden), false, `${dir} must stay additive (${forbidden})`);
    }
  }
});

test("no speaker service invents email sending, cron, or background work", () => {
  for (const path of SPEAKER_SERVICE_FILES) {
    const source = readFileSync(path, "utf8").toLowerCase();
    for (const forbidden of ["nodemailer", "sendgrid", "postmark", "smtp", "setinterval(", "cron"]) {
      assert.equal(source.includes(forbidden), false, `${path} must not include ${forbidden}`);
    }
  }
});
