import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string): string {
  assert.ok(existsSync(path), `${path} should exist`);
  return readFileSync(path, "utf8");
}

const pageSource = readSource("app/(shell)/timeline/page.tsx");
const listSource = readSource("app/(shell)/timeline/_components/TimelineListView.tsx");
const typesSource = readSource("app/(shell)/timeline/_components/types.ts");
const assignableUsersRouteSource = readSource("app/api/events/[eventId]/assignable-users/route.ts");
const assignableUsersServiceSource = readSource("src/server/services/event-assignable-users.ts");
const timelineServiceSource = readSource("src/server/services/timeline.ts");
const importMappingSource = readSource("lib/timeline-import-mapping.ts");
const importSource = readSource("lib/timeline-import.ts");

test("timeline owner options are loaded from event/account assignable users", () => {
  assert.match(typesSource, /export type TimelineOwnerOption/);
  assert.match(typesSource, /id: string/);
  assert.match(typesSource, /name: string \| null/);
  assert.match(typesSource, /email: string/);
  assert.match(pageSource, /\/api\/events\/\$\{eventId\}\/assignable-users/);
  assert.match(pageSource, /const \[ownerOptions, setOwnerOptions\]/);
  assert.match(pageSource, /void loadOwnerOptions\(selectedEventId\)/);
  assert.match(pageSource, /ownerOptions=\{ownerOptions\}/);
});

test("assignable user API validates event scope and uses EventMember as the canonical event-access source", () => {
  assert.match(assignableUsersRouteSource, /assertEventAccessForUser\(eventId, authResult\.user, "read"\)/);
  assert.match(assignableUsersRouteSource, /listEventAssignableUsers\(eventId\)/);
  assert.match(assignableUsersServiceSource, /export async function listEventAssignableUsers/);
  assert.match(assignableUsersServiceSource, /eventOwnerEligibilityWhere/);
  assert.match(assignableUsersServiceSource, /eventMemberships:\s*\{\s*some: \{ eventId \}/);
  assert.match(assignableUsersServiceSource, /role: user\.eventMemberships\[0\]\?\.eventRole \?\? user\.role/);
});

test("timeline owner filter, inline editor, and bulk edit use the same owner options", () => {
  assert.match(listSource, /ownerOptions: TimelineOwnerOption\[\]/);
  assert.match(listSource, /ownerOptions: assignableOwnerOptions/);
  assert.match(listSource, /for \(const owner of assignableOwnerOptions\)/);
  assert.match(listSource, /no longer has event access/);
  assert.match(listSource, /aria-label="Filter by owner"/);
  assert.match(listSource, /ownerOptions\.map\(\(owner\) =>/);
  assert.match(listSource, /onChange=\{\(e\) => void onCommitCell\(item\.id, "ownerUserId", e\.target\.value, item\)\}/);
  assert.match(listSource, /Set owner\.\.\./);
  assert.match(listSource, /applyBulkPatch\(\{ ownerUserId: value === "__UNASSIGNED__" \? null : value \}\)/);
});

test("timeline create modal can assign a selected account user or remain unassigned", () => {
  assert.match(pageSource, /const \[createOwnerUserId, setCreateOwnerUserId\]/);
  assert.match(pageSource, /const \[createOwnerOptions, setCreateOwnerOptions\]/);
  assert.match(pageSource, /setCreateOwnerUserId\(""\)/);
  assert.match(pageSource, /ownerUserId: createOwnerUserId \|\| null/);
  assert.match(pageSource, /value=\{createOwnerUserId\}/);
  assert.match(pageSource, /setCreateOwnerUserId\(event\.target\.value\)/);
  assert.match(pageSource, /<option value="">Unassigned<\/option>/);
  assert.match(pageSource, /createOwnerOptions\.map\(\(owner\) =>/);
});

test("timeline owner saves remain server-side scoped to assignable event users", () => {
  assert.match(timelineServiceSource, /assertOwnerUserBelongsToEventContext/);
  assert.match(timelineServiceSource, /isEventAssignableUser\(eventId, ownerUserId\)/);
  assert.match(timelineServiceSource, /ownerUserId must be a valid assignable user for the event/);
  assert.match(timelineServiceSource, /ownerUserId: normalized\.ownerUserId \?\? null/);
});

test("timeline import resolves only known event owners and leaves unmatched values unassigned", () => {
  assert.match(importMappingSource, /field: "owner"/);
  assert.match(importMappingSource, /responsible party/);
  assert.match(importSource, /Owner \/ Responsible Party -> ownerUserId/);
  assert.match(importSource, /Owner.*not found and will be left unassigned/);
});
