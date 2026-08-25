import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx", "utf8");

test("Session Details conflict selector is absent without active conflicts", () => {
  assert.match(source, /conflictCount > 0/);
  assert.match(source, /Conflicts \{conflictCount\}/);
});

test("Session Details conflict selector uses canonical stable conflict ids", () => {
  assert.match(source, /new Map\(conflicts\.map\(\(conflict\) => \[conflict\.id, conflict\]\)\)/);
  assert.match(source, /conflictCount=\{activeConflicts\.length\}/);
});

test("Session conflict actions target the matching session surface", () => {
  assert.match(source, /switchQuickPanel\("speakers"\)/);
  assert.match(source, /roomSetHref\(session\.eventId, session\.id, "layout"\)/);
  assert.match(source, /switchQuickPanel\("staffing"\)/);
});

test("Session conflict summary refreshes from the current canonical conflicts prop", () => {
  assert.match(source, /\[conflicts\]\)/);
  assert.match(source, /activeQuickPanel === "conflicts" && activeConflicts\.length === 0/);
  assert.match(source, /setActiveQuickPanel\(null\)/);
  assert.match(source, /data-session-conflict-summary/);
});
