/**
 * Mobile `exhibitor_viewer` + `event_users.permissions` app entitlements:
 * static regression for API guards and the TS mirror of `event_app_permission_enabled`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { eventAppPermissionEnabled } from "@/lib/exhibitor/event-app-permission-enabled";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("eventAppPermissionEnabled mirrors JSONB app / alternate keys", () => {
  assert.equal(eventAppPermissionEnabled(null), false);
  assert.equal(eventAppPermissionEnabled({ app: true }), true);
  assert.equal(eventAppPermissionEnabled({ app: "true" }), true);
  assert.equal(eventAppPermissionEnabled({ app: "yes" }), true);
  assert.equal(eventAppPermissionEnabled({ all_events: true }), true);
  assert.equal(eventAppPermissionEnabled({ scope: "all" }), true);
  assert.equal(eventAppPermissionEnabled({ event_scope: "all" }), true);
  assert.equal(eventAppPermissionEnabled({ app: false }), false);
});

test("lead list requires eventId for bearer exhibitor_viewer", () => {
  const src = read("app/api/exhibitor/leads/list/route.ts");
  assert.match(src, /exhibitor_viewer.*isBearer.*!eventId/s);
  assert.match(src, /eventId is required for mobile lead list/);
});

test("lead create enforces event_id before mutate for mobile viewer", () => {
  const src = read("app/api/exhibitor/leads/create/route.ts");
  assert.match(src, /exhibitor_viewer.*isBearer.*!eventId/s);
  assert.match(src, /leadEventId:\s*eventId/);
});

test("lead PATCH gates mutations on existingLead.event_id", () => {
  const src = read("app/api/exhibitor/leads/[leadId]/route.ts");
  assert.match(src, /leadEventId:\s*existingLead\.event_id/);
});

test("lead DELETE remains event-scoped while bulk-delete hard-denies exhibitor_viewer", () => {
  const single = read("app/api/exhibitor/leads/[leadId]/route.ts");
  assert.doesNotMatch(single, /denyExhibitorViewer:\s*true/);
  assert.match(single, /canMutateExhibitorLeadsInContext/);
  assert.match(single, /leadEventId:\s*scopedLead\.event_id/);
  assert.match(single, /assertEventIdAccessibleForUser\(userId,\s*eventId\)/);

  const bulk = read("app/api/exhibitor/leads/bulk-delete/route.ts");
  assert.match(bulk, /role === "exhibitor_viewer" \|\| role === "viewer"/);
  assert.match(bulk, /canMutateExhibitorLeadsInContext/);
  assert.match(bulk, /denyExhibitorViewer:\s*true/);
});

test("single lead delete keeps exhibitor_viewer on the bearer-scoped mutation path", () => {
  const single = read("app/api/exhibitor/leads/[leadId]/route.ts");
  assert.match(single, /role === "exhibitor_viewer"/);
  assert.match(single, /canMutateExhibitorLeadsInContext\(\{[\s\S]*?isBearer,[\s\S]*?leadEventId:\s*scopedLead\.event_id/s);
});

test("getUserHasExhibitorAppAccess uses eventAppPermissionEnabled (not bare .app only)", () => {
  const src = read("lib/server/exhibitor-permission-aggregates.ts");
  assert.match(src, /eventAppPermissionEnabled\(row\?\.permissions\)/);
});

test("accessible-event filter for viewer uses app/admin entitlement helper", () => {
  const src = read("lib/server/company-event-access.ts");
  assert.match(src, /eventMembershipGrantsAppOrAdminSurface\(r\.permissions\)/);
});
