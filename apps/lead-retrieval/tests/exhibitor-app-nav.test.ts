import test from "node:test";
import assert from "node:assert/strict";
import {
  EXHIBITOR_ACCOUNT_HREF,
  EXHIBITOR_EVENTS_ENTRY_HREF,
  EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF,
  exhibitorEventSettingsHref,
  getExhibitorNavItemsForSidebar,
  isExhibitorEntryPathAllowedWithNoEvents
} from "../lib/exhibitor/exhibitor-app-nav";

test("account-mode sidebar shows Manage, Settings, and Help", () => {
  const items = getExhibitorNavItemsForSidebar({ mode: "account" });
  assert.equal(items.length, 3);
  assert.equal(items[0].label, "Manage");
  assert.equal(items[0].href, EXHIBITOR_EVENTS_ENTRY_HREF);
  assert.equal(items[0].href, "/app/events");
  assert.equal(items[0].icon, "events");
  assert.equal(items[1].label, "Settings");
  assert.equal(items[1].href, EXHIBITOR_ACCOUNT_HREF);
  assert.equal(items[1].href, "/app/settings");
  assert.equal(items[2].label, "Help");
  assert.equal(items[2].href, "/help");
  assert.equal(items[2].icon, "help");
});

test("event-mode sidebar shows full event app nav with Settings → event-scoped href", () => {
  const items = getExhibitorNavItemsForSidebar({ mode: "event", activeEventId: "evt_123" });
  assert.ok(items.length > 3);
  assert.ok(items.some((i) => i.href === "/exhibitor/dashboard" && i.label === "Dashboard"));
  assert.ok(items.some((i) => i.href === "/exhibitor/leads"));
  const settings = items.find((i) => i.label === "Settings");
  assert.ok(settings, "expected a Settings item");
  assert.equal(settings!.href, "/app/events/evt_123/settings");
  assert.notEqual(settings!.href, EXHIBITOR_ACCOUNT_HREF);
  assert.ok(items.some((i) => i.href === "/help" && i.label === "Help"));
  // Must not leak the legacy "Company account" label anywhere.
  assert.equal(items.some((i) => i.label === "Company account"), false);
});

test("event-mode sidebar keeps Documents & Links and Workflows under Engagement without a separate Email Templates item", () => {
  const items = getExhibitorNavItemsForSidebar({ mode: "event", activeEventId: "evt_123" });
  const documents = items.find((i) => i.href === "/exhibitor/documents");
  assert.ok(documents, "Documents & Links should remain in the nav");
  assert.equal(documents!.label, "Documents & Links");
  assert.equal(items.some((i) => i.href === "/exhibitor/email-templates"), false);

  const workflows = items.find((i) => i.label === "Workflows");
  if (process.env.NEXT_PUBLIC_WORKFLOWS_ENABLED === "false") {
    assert.equal(workflows, undefined);
    return;
  }
  assert.ok(workflows, "expected a Workflows item in event-mode nav");
  assert.equal(workflows!.href, "/exhibitor/workflows");
  assert.equal(workflows!.icon, "workflows");
  const campaignsIdx = items.findIndex((i) => i.href === "/exhibitor/campaigns");
  const workflowsIdx = items.findIndex((i) => i.href === "/exhibitor/workflows");
  assert.ok(campaignsIdx >= 0, "Campaigns should be in the nav");
  assert.ok(campaignsIdx < workflowsIdx, "Campaigns should precede Workflows");
});

test("account-mode sidebar does NOT include Workflows", () => {
  const items = getExhibitorNavItemsForSidebar({ mode: "account" });
  assert.equal(items.some((i) => i.label === "Workflows"), false);
});

test("isExhibitorEntryPathAllowedWithNoEvents: events index, create, account settings", () => {
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents("/app/events"), true);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents("/app/events/"), true);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents("/app/events/new"), true);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents("/app/events/new/"), true);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(EXHIBITOR_ACCOUNT_HREF), true);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(`${EXHIBITOR_ACCOUNT_HREF}/team`), true);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents("/app/events/abc/settings"), false);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents("/exhibitor/dashboard"), false);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents("/exhibitor/leads"), false);
});

test("portfolio viewer path (no portfolio management flag): /app/events* blocked when zero events; account settings still allowed", () => {
  const opt = { allowsAppEventsManagementSurfaces: false };
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents("/app/events", opt), false);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents("/app/events/new", opt), false);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(EXHIBITOR_ACCOUNT_HREF, opt), true);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(`${EXHIBITOR_ACCOUNT_HREF}/team`, opt), true);
});

test("event-level tenant UI: zero-event entry allows only /exhibitor/settings", () => {
  const opt = { allowsAppEventsManagementSurfaces: false, eventLevelTenantUi: true };
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF, opt), true);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(`${EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF}/`, opt), true);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(EXHIBITOR_ACCOUNT_HREF, opt), false);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(`${EXHIBITOR_ACCOUNT_HREF}/team`, opt), false);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents("/app/events", opt), false);
});

test("account-mode event-level nav is Settings plus Help; event-mode Settings uses /exhibitor/settings", () => {
  const accountItems = getExhibitorNavItemsForSidebar({
    mode: "account",
    allowsAppEventsManagementSurfaces: false,
    eventLevelTenantUi: true
  });
  assert.equal(accountItems.length, 2);
  assert.equal(accountItems[0].href, EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF);
  assert.equal(accountItems[1].href, "/help");

  const eventItems = getExhibitorNavItemsForSidebar({
    mode: "event",
    activeEventId: "evt_x",
    allowsAppEventsManagementSurfaces: false,
    eventLevelTenantUi: true
  });
  const settings = eventItems.find((i) => i.label === "Settings");
  assert.ok(settings);
  assert.equal(settings!.href, EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF);
});

test("exhibitorEventSettingsHref is event-scoped (not account settings)", () => {
  assert.equal(exhibitorEventSettingsHref("evt_abc"), "/app/events/evt_abc/settings");
  assert.equal(exhibitorEventSettingsHref(""), EXHIBITOR_EVENTS_ENTRY_HREF);
});
