import test from "node:test";
import assert from "node:assert/strict";
import {
  isExhibitorDirectPortfolioEventAccessResolution,
  type EventAccessResolution
} from "../lib/access/event-access-mode";
import { exhibitorAdminMayUseAppEventManagementRoutes } from "../lib/exhibitor/exhibitor-event-management-access";
import { readFileSync } from "node:fs";
import path from "node:path";

test("Direct portfolio resolution is exactly company_all_events", () => {
  assert.equal(isExhibitorDirectPortfolioEventAccessResolution("company_all_events"), true);
  for (const r of [
    "legacy_event_scoped",
    "company_assigned_only",
    "none",
    "platform_all",
    "organizer_scope"
  ] as EventAccessResolution[]) {
    assert.equal(isExhibitorDirectPortfolioEventAccessResolution(r), false, r);
  }
});

test("exhibitorAdminMayUseAppEventManagementRoutes: exhibitor_admin + company_all_events only", () => {
  assert.equal(
    exhibitorAdminMayUseAppEventManagementRoutes({
      role: "exhibitor_admin",
      resolution: "company_all_events"
    }),
    true
  );
  assert.equal(
    exhibitorAdminMayUseAppEventManagementRoutes({
      role: "exhibitor_admin",
      resolution: "legacy_event_scoped"
    }),
    false
  );
  assert.equal(
    exhibitorAdminMayUseAppEventManagementRoutes({
      role: "exhibitor_admin",
      resolution: "company_assigned_only"
    }),
    false
  );
  assert.equal(
    exhibitorAdminMayUseAppEventManagementRoutes({
      role: "exhibitor_viewer",
      resolution: "company_all_events"
    }),
    false
  );
  assert.equal(
    exhibitorAdminMayUseAppEventManagementRoutes({
      role: "platform_admin",
      resolution: "company_all_events"
    }),
    false
  );
});

test("exhibitor /app/events management routes call the license redirect guard", () => {
  const root = process.cwd();
  for (const rel of [
    "app/app/events/page.tsx",
    "app/app/events/new/page.tsx",
    "app/app/events/[eventId]/settings/page.tsx"
  ]) {
    const src = readFileSync(path.join(root, rel), "utf8");
    assert.match(src, /redirectExhibitorAdminFromAppEventsManagementRoutesIfBlocked/, rel);
  }
});

test("exhibitor event creation surfaces enforce portfolio license gate", () => {
  const root = process.cwd();
  const actionSrc = readFileSync(path.join(root, "app/app/events/new/actions.ts"), "utf8");
  assert.match(actionSrc, /exhibitorAdminMayUseAppEventManagementRoutes/);
  assert.match(actionSrc, /EVENT_MANAGEMENT_FORBIDDEN_LICENSE/);
  const apiSrc = readFileSync(path.join(root, "app/api/exhibitor/events/route.ts"), "utf8");
  assert.match(apiSrc, /exhibitorAdminMayUseAppEventManagementRoutes/);
  assert.match(apiSrc, /EVENT_MANAGEMENT_FORBIDDEN_LICENSE/);
});
