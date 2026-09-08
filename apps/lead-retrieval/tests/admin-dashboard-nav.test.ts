import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPANY_SCOPED_ADMIN_ROOT_HREF,
  EVENT_SCOPED_ADMIN_ROOT_HREF,
  getAdminDashboardModeTargetHref,
  getAdminSidebarNavItems,
  isAdminNavItemActive,
  resolveAdminDashboardModeForPath
} from "../lib/admin/admin-dashboard-nav";

test("resolveAdminDashboardModeForPath keeps existing admin routes in event_scoped mode", () => {
  assert.equal(resolveAdminDashboardModeForPath("/admin"), "event_scoped");
  assert.equal(resolveAdminDashboardModeForPath("/admin/events"), "event_scoped");
  assert.equal(resolveAdminDashboardModeForPath("/admin/users"), "event_scoped");
});

test("resolveAdminDashboardModeForPath maps company license routes to company_scoped mode", () => {
  assert.equal(resolveAdminDashboardModeForPath("/admin/company-licenses"), "company_scoped");
  assert.equal(resolveAdminDashboardModeForPath("/admin/company-licenses/licenses"), "company_scoped");
});

test("getAdminSidebarNavItems returns company-scoped operations nav without workflows", () => {
  const labels = getAdminSidebarNavItems("company_scoped").map((item) => item.label);
  assert.deepEqual(labels, [
    "Overview",
    "Companies",
    "Licenses",
    "Users",
    "Events",
    "Activity",
    "Settings"
  ]);
});

test("platform admin nav modes do not include Help", () => {
  assert.equal(getAdminSidebarNavItems("event_scoped").some((item) => item.href === "/help"), false);
  assert.equal(getAdminSidebarNavItems("company_scoped").some((item) => item.href === "/help"), false);
});

test("dashboard mode target hrefs point to their root routes", () => {
  assert.equal(getAdminDashboardModeTargetHref("event_scoped"), EVENT_SCOPED_ADMIN_ROOT_HREF);
  assert.equal(getAdminDashboardModeTargetHref("company_scoped"), COMPANY_SCOPED_ADMIN_ROOT_HREF);
});

test("isAdminNavItemActive handles event and company overview roots correctly", () => {
  const eventOverview = getAdminSidebarNavItems("event_scoped")[0]!;
  const companyOverview = getAdminSidebarNavItems("company_scoped")[0]!;

  assert.equal(isAdminNavItemActive(eventOverview, "/admin"), true);
  assert.equal(isAdminNavItemActive(eventOverview, "/admin/events"), false);
  assert.equal(isAdminNavItemActive(companyOverview, "/admin/company-licenses"), true);
  assert.equal(isAdminNavItemActive(companyOverview, "/admin/company-licenses/licenses"), false);
});
