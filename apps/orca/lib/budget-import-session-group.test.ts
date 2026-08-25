import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildSessionTitleIndex,
  normalizeNameKey,
  resolveImportSessionId,
} from "./budget-import-session-group";

// --- pure session resolution -----------------------------------------------

test("normalizeNameKey collapses case and whitespace", () => {
  assert.equal(normalizeNameKey("  Opening   Keynote "), "opening keynote");
});

test("session title index buckets ids by normalized title and skips blank names", () => {
  const index = buildSessionTitleIndex([
    { id: "a", sessionName: "Opening Keynote" },
    { id: "b", sessionName: "opening keynote" },
    { id: "c", sessionName: "Lunch" },
    { id: "d", sessionName: null },
    { id: "e", sessionName: "  " },
  ]);
  assert.deepEqual(index.get("opening keynote"), ["a", "b"]);
  assert.deepEqual(index.get("lunch"), ["c"]);
  assert.equal(index.size, 2);
});

test("resolveImportSessionId matches exactly one, errors on ambiguity, and never guesses", () => {
  const index = buildSessionTitleIndex([
    { id: "a", sessionName: "Opening Keynote" },
    { id: "b", sessionName: "Opening Keynote" },
    { id: "c", sessionName: "Lunch" },
  ]);
  assert.deepEqual(resolveImportSessionId("Lunch", index), { status: "matched", matrixRowId: "c" });
  assert.deepEqual(resolveImportSessionId("opening keynote", index), { status: "ambiguous", matrixRowId: null });
  assert.deepEqual(resolveImportSessionId("Closing", index), { status: "not_found", matrixRowId: null });
  assert.deepEqual(resolveImportSessionId("", index), { status: "empty", matrixRowId: null });
  assert.deepEqual(resolveImportSessionId(undefined, index), { status: "empty", matrixRowId: null });
});

// --- export / import wiring (source assertions) ----------------------------

const serviceSource = readFileSync("src/server/services/budget.ts", "utf8");
const importRoute = readFileSync("app/api/events/[eventId]/budget/import/route.ts", "utf8");
const importLib = readFileSync("lib/budget-import.ts", "utf8");
const mappingLib = readFileSync("lib/budget-import-mapping.ts", "utf8");

test("CSV export includes human-readable Session and Group columns; subcategory labeled legacy", () => {
  assert.match(serviceSource, /"Session",\n\s*"Group",\n\s*"Legacy Subcategory",/);
  assert.match(serviceSource, /lineItem\.sessionTitle \?\? ""/);
  assert.match(serviceSource, /lineItem\.groupName \?\? ""/);
});

test("import resolves session by exact title (ambiguous errors) and create-or-finds groups", () => {
  assert.match(serviceSource, /async function resolveImportSessionIds/);
  assert.match(serviceSource, /matches multiple event sessions/);
  assert.match(serviceSource, /async function resolveImportGroupIds/);
  assert.match(serviceSource, /matrixRowId: sessionIdByRow\[index\]/);
  assert.match(serviceSource, /groupId: groupIdByRow\[index\]/);
});

test("import route forwards Session/Group columns and the actor for group authorship", () => {
  assert.match(importRoute, /Session: String\(item\.Session \?\? ""\)/);
  assert.match(importRoute, /Group: String\(item\.Group \?\? ""\)/);
  assert.match(importRoute, /session: row\.session/);
  assert.match(importRoute, /group: row\.group/);
  assert.match(importRoute, /actorUserId: auth\.user\.id/);
});

test("import column schema + mapping expose Session and Group as first-class fields", () => {
  assert.match(importLib, /"Category",\n\s*"Session",\n\s*"Group",\n\s*"Subcategory",/);
  assert.match(mappingLib, /field: "session"/);
  assert.match(mappingLib, /field: "group"/);
  // Group synonyms moved OFF subcategory onto the new group field.
  assert.match(mappingLib, /synonyms: \["group", "grouping", "budget group"\]/);
});
