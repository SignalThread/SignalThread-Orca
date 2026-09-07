import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * `SessionSpeaker` was a legacy join table between `MatrixRow` and `EventPerson`. It was dropped
 * from the database, but code that still declared the relation kept emitting a join against it,
 * so every event page died with:
 *
 *   The table `public.SessionSpeaker` does not exist in the current database.
 *
 * `SessionSpeakerAssignment` is the canonical model. These tests fail if the legacy name comes
 * back in the schema, in a readiness query, or in the generated client, in any checkout.
 */

const SCHEMA_PATHS = ["prisma/schema.prisma"];

/** Matches the legacy name but never `SessionSpeakerAssignment`. */
const LEGACY_MODEL = /\bSessionSpeaker\b(?!Assignment)/;
const LEGACY_RELATION = /\bsessionSpeakers\b/;

function readIfPresent(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

test("no schema copy declares the legacy SessionSpeaker model or relation", () => {
  const checked: string[] = [];
  for (const schemaPath of SCHEMA_PATHS) {
    const source = readIfPresent(schemaPath);
    if (!source) continue;
    checked.push(schemaPath);
    assert.doesNotMatch(source, /^model SessionSpeaker \{/m, `${schemaPath} still declares the legacy model`);
    assert.doesNotMatch(source, LEGACY_RELATION, `${schemaPath} still declares a sessionSpeakers relation`);
    // The canonical model must still be present, so this cannot pass by deleting both.
    assert.match(source, /^model SessionSpeakerAssignment \{/m, `${schemaPath} lost the canonical model`);
  }
  assert.ok(checked.length > 0, "no Prisma schema was found to check");
});

test("event readiness queries the canonical speaker assignment, never the legacy table", () => {
  const source = readFileSync("lib/event-readiness.ts", "utf8");
  assert.doesNotMatch(source, LEGACY_RELATION);
  assert.doesNotMatch(source, LEGACY_MODEL);
  // The include that actually feeds readiness.
  assert.match(source, /sessionSpeakerAssignments: \{ include: \{ speaker:/);
  // Speaker rows are derived from that include alone.
  assert.match(source, /session\.sessionSpeakerAssignments\.map/);
});

test("no application code queries the legacy relation", () => {
  const roots = ["lib", "src", "app", "components"];
  const offenders: string[] = [];

  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      // Cleanup helpers intentionally reference the dropped table through guarded raw SQL so
      // environments that predate the drop can still be cleaned; they are not query paths.
      if (/fixture-cleanup\.ts$|help-screenshot-seed\.ts$/.test(full)) continue;
      if (full.endsWith(".test.ts")) continue;
      const source = readFileSync(full, "utf8");
      if (LEGACY_RELATION.test(source)) offenders.push(full);
    }
  };

  roots.forEach(walk);
  assert.deepEqual(offenders, [], `these files still reference the legacy relation: ${offenders.join(", ")}`);
});

test("the generated Prisma client exposes no legacy SessionSpeaker delegate", () => {
  const candidates = [
    "node_modules/.prisma/client/index.d.ts",
    // Under npm workspaces the generated client hoists to the repository root, which is two
    // levels up from apps/orca. Without this the check silently finds nothing and the guard
    // that catches a stale client stops guarding anything.
    "../../node_modules/.prisma/client/index.d.ts",
  ];
  let checkedAny = false;

  for (const candidate of candidates) {
    const source = readIfPresent(candidate);
    if (!source) continue;
    checkedAny = true;
    // A stale client regenerated from an old schema is exactly how this bug reaches runtime,
    // so assert on the generated artifact rather than trusting the schema alone.
    const legacyNames = (source.match(/\bSessionSpeaker\b(?!Assignment)/g) ?? []).length;
    assert.equal(legacyNames, 0, `${candidate} was generated from a schema that still has SessionSpeaker`);
    assert.doesNotMatch(source, LEGACY_RELATION, `${candidate} exposes a sessionSpeakers relation`);
    assert.match(source, /SessionSpeakerAssignment/, `${candidate} is missing the canonical model`);
  }

  assert.ok(checkedAny, "no generated Prisma client was found; run prisma generate");
});

test("the readiness include list matches what the canonical schema actually offers", () => {
  const source = readFileSync("lib/event-readiness.ts", "utf8");
  const schema = readIfPresent("prisma/schema.prisma");
  assert.ok(schema, "schema not found");

  // Every relation the readiness query includes on MatrixRow must exist on the model, which is
  // the check that would have caught this before it reached a browser.
  const includeBlock = source.slice(source.indexOf("include: {"), source.indexOf("budgetLineItems"));
  const relations = Array.from(includeBlock.matchAll(/^\s{8}(\w+):/gm)).map((match) => match[1]!);
  assert.ok(relations.length > 3, "could not parse the readiness include block");

  const matrixRow = schema!.slice(schema!.indexOf("model MatrixRow {"), schema!.indexOf("model MatrixImportBatch"));
  for (const relation of relations) {
    assert.match(
      matrixRow,
      new RegExp(`^\\s+${relation}\\s`, "m"),
      `readiness includes "${relation}" but MatrixRow has no such relation`,
    );
  }
});
