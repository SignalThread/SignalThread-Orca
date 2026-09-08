import test from "node:test";
import assert from "node:assert/strict";
import {
  EXHIBITOR_ACCOUNT_HREF,
  EXHIBITOR_EVENTS_CREATE_HREF,
  EXHIBITOR_EVENTS_ENTRY_HREF,
  EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF,
  exhibitorEventSettingsHref,
  getExhibitorNavItemsForSidebar,
  resolveExhibitorSidebarMode
} from "../lib/exhibitor/exhibitor-app-nav";

/* ------------------------------------------------------------------ *
 * URL → nav-mode resolver
 * ------------------------------------------------------------------ */

test("resolver: /app/events is ACCOUNT mode", () => {
  assert.equal(
    resolveExhibitorSidebarMode({ pathname: "/app/events", hasAccessibleEvents: true }),
    "account"
  );
  // Trailing slash normalized.
  assert.equal(
    resolveExhibitorSidebarMode({ pathname: "/app/events/", hasAccessibleEvents: true }),
    "account"
  );
});

test("resolver: /app/events/new is ACCOUNT mode (Create Event lives in account view)", () => {
  assert.equal(
    resolveExhibitorSidebarMode({ pathname: "/app/events/new", hasAccessibleEvents: true }),
    "account"
  );
});

test("resolver: /app/settings (and subpaths) is ACCOUNT mode", () => {
  assert.equal(
    resolveExhibitorSidebarMode({ pathname: "/app/settings", hasAccessibleEvents: true }),
    "account"
  );
  assert.equal(
    resolveExhibitorSidebarMode({ pathname: "/app/settings/team", hasAccessibleEvents: true }),
    "account"
  );
  assert.equal(
    resolveExhibitorSidebarMode({ pathname: "/app/settings/billing/usage", hasAccessibleEvents: true }),
    "account"
  );
});

test("resolver: per-event routes (incl. /app/events/{id}/settings) are EVENT mode", () => {
  assert.equal(
    resolveExhibitorSidebarMode({ pathname: "/app/events/evt_1", hasAccessibleEvents: true }),
    "event"
  );
  assert.equal(
    resolveExhibitorSidebarMode({ pathname: "/app/events/evt_1/settings", hasAccessibleEvents: true }),
    "event"
  );
});

test("resolver: /exhibitor/* and /campaigns/* are EVENT mode", () => {
  for (const p of [
    "/exhibitor/dashboard",
    "/exhibitor/leads",
    "/exhibitor/leads/abc",
    "/exhibitor/signals",
    "/exhibitor/campaigns",
    "/exhibitor/documents",
    "/exhibitor/email-templates",
    "/exhibitor/users",
    "/exhibitor/integrations",
    "/exhibitor/settings",
    "/campaigns/123/edit"
  ]) {
    assert.equal(
      resolveExhibitorSidebarMode({ pathname: p, hasAccessibleEvents: true }),
      "event",
      `expected event mode for ${p}`
    );
  }
});

test("resolver: zero accessible events forces ACCOUNT mode regardless of URL", () => {
  for (const p of [
    "/exhibitor/dashboard",
    "/app/events/evt_1",
    "/app/events/new",
    "/app/events/evt_1/settings",
    "/app/settings"
  ]) {
    assert.equal(
      resolveExhibitorSidebarMode({ pathname: p, hasAccessibleEvents: false }),
      "account",
      `expected account mode for ${p} when no events`
    );
  }
});

/* ------------------------------------------------------------------ *
 * Sidebar item shape per mode (Scenarios A–E from the IA spec)
 * ------------------------------------------------------------------ */

test("Scenario A: /app/events → left nav is [Manage, Settings, Help] (Settings → /app/settings)", () => {
  const mode = resolveExhibitorSidebarMode({ pathname: "/app/events", hasAccessibleEvents: true });
  const items = getExhibitorNavItemsForSidebar({ mode });
  assert.deepEqual(
    items.map((i) => ({ href: i.href, label: i.label, icon: i.icon })),
    [
      { href: EXHIBITOR_EVENTS_ENTRY_HREF, label: "Manage", icon: "events" },
      { href: EXHIBITOR_ACCOUNT_HREF, label: "Settings", icon: "settings" },
      { href: "/help", label: "Help", icon: "help" }
    ]
  );
});

test("Scenario B: /app/events/new → left nav is [Manage, Settings, Help]", () => {
  const mode = resolveExhibitorSidebarMode({ pathname: "/app/events/new", hasAccessibleEvents: true });
  const items = getExhibitorNavItemsForSidebar({ mode });
  assert.equal(items.length, 3);
  assert.equal(items[0].label, "Manage");
  assert.equal(items[1].label, "Settings");
  assert.equal(items[1].href, EXHIBITOR_ACCOUNT_HREF);
  assert.equal(items[2].href, "/help");
});

test("Scenario C: /app/settings → left nav is [Manage, Settings, Help]", () => {
  const mode = resolveExhibitorSidebarMode({ pathname: "/app/settings", hasAccessibleEvents: true });
  const items = getExhibitorNavItemsForSidebar({ mode });
  assert.equal(items.length, 3);
  // Settings here points at the account page itself (not at any event).
  assert.equal(items[1].href, EXHIBITOR_ACCOUNT_HREF);
  assert.equal(items[2].href, "/help");
});

test("Scenario D: /exhibitor/dashboard → full event nav including Dashboard…Integrations + Settings", () => {
  const mode = resolveExhibitorSidebarMode({
    pathname: "/exhibitor/dashboard",
    hasAccessibleEvents: true
  });
  const items = getExhibitorNavItemsForSidebar({ mode, activeEventId: "evt_99" });
  const labels = items.map((i) => i.label);
  for (const expected of [
    "Dashboard",
    "Leads",
    "Campaign Agents",
    "Documents & Links",
    "Campaigns",
    "Users",
    "Integrations",
    "Settings"
  ]) {
    assert.ok(labels.includes(expected), `expected nav label ${expected}`);
  }
  assert.equal(labels.includes("Email Templates"), false);
  // Account-mode items must NOT appear in event mode.
  assert.equal(items.some((i) => i.href === EXHIBITOR_EVENTS_ENTRY_HREF), false);
});

test("Scenario E: event-level Settings in event mode points at /exhibitor/settings", () => {
  const items = getExhibitorNavItemsForSidebar({
    mode: "event",
    activeEventId: "evt_42",
    allowsAppEventsManagementSurfaces: false,
    eventLevelTenantUi: true
  });
  const settings = items.find((i) => i.label === "Settings");
  assert.ok(settings, "expected a Settings item in event nav");
  assert.equal(settings!.href, EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF);
});

test("Scenario E (direct license): event-mode Settings opens event management settings page", () => {
  const items = getExhibitorNavItemsForSidebar({
    mode: "event",
    activeEventId: "evt_42",
    allowsAppEventsManagementSurfaces: true
  });
  const settings = items.find((i) => i.label === "Settings");
  assert.ok(settings, "expected a Settings item in event nav");
  assert.equal(settings!.href, exhibitorEventSettingsHref("evt_42"));
  assert.equal(settings!.href, "/app/events/evt_42/settings");
  assert.notEqual(settings!.href, EXHIBITOR_ACCOUNT_HREF);
});

test("event-mode Settings without active event + direct license falls back to events index", () => {
  const items = getExhibitorNavItemsForSidebar({
    mode: "event",
    activeEventId: null,
    allowsAppEventsManagementSurfaces: true
  });
  const settings = items.find((i) => i.label === "Settings");
  assert.ok(settings);
  assert.equal(settings!.href, EXHIBITOR_EVENTS_ENTRY_HREF);
  assert.notEqual(settings!.href, EXHIBITOR_ACCOUNT_HREF);
});

test("event-mode Settings without active event + event-level uses /exhibitor/settings", () => {
  const items = getExhibitorNavItemsForSidebar({
    mode: "event",
    activeEventId: null,
    allowsAppEventsManagementSurfaces: false,
    eventLevelTenantUi: true
  });
  const settings = items.find((i) => i.label === "Settings");
  assert.ok(settings);
  assert.equal(settings!.href, EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF);
});

test("event-mode Settings without active event + portfolio viewer path falls back to account settings", () => {
  const items = getExhibitorNavItemsForSidebar({
    mode: "event",
    activeEventId: null,
    allowsAppEventsManagementSurfaces: false,
    eventLevelTenantUi: false
  });
  const settings = items.find((i) => i.label === "Settings");
  assert.ok(settings);
  assert.equal(settings!.href, EXHIBITOR_ACCOUNT_HREF);
});

test("two Settings concepts must point at two different routes (portfolio / direct license)", () => {
  const accountSettings = getExhibitorNavItemsForSidebar({ mode: "account" }).find(
    (i) => i.label === "Settings"
  );
  const eventSettings = getExhibitorNavItemsForSidebar({
    mode: "event",
    activeEventId: "evt_1"
  }).find((i) => i.label === "Settings");
  assert.ok(accountSettings && eventSettings);
  assert.notEqual(
    accountSettings!.href,
    eventSettings!.href,
    "account and event Settings must NEVER point at the same route for portfolio tenants"
  );
});

test("event-level tenant may use one simplified settings route in both sidebar modes", () => {
  const accountSettings = getExhibitorNavItemsForSidebar({
    mode: "account",
    allowsAppEventsManagementSurfaces: false,
    eventLevelTenantUi: true
  }).find((i) => i.label === "Settings");
  const eventSettings = getExhibitorNavItemsForSidebar({
    mode: "event",
    activeEventId: "evt_1",
    allowsAppEventsManagementSurfaces: false,
    eventLevelTenantUi: true
  }).find((i) => i.label === "Settings");
  assert.ok(accountSettings && eventSettings);
  assert.equal(accountSettings!.href, EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF);
  assert.equal(accountSettings!.href, eventSettings!.href);
});

test("account mode does not include any event-app surfaces", () => {
  const items = getExhibitorNavItemsForSidebar({ mode: "account" });
  const forbidden = [
    "/exhibitor/dashboard",
    "/exhibitor/leads",
    "/exhibitor/signals",
    "/exhibitor/campaigns",
    "/exhibitor/users",
    "/exhibitor/integrations"
  ];
  for (const href of forbidden) {
    assert.equal(
      items.some((i) => i.href === href),
      false,
      `account-mode nav must not include ${href}`
    );
  }
  // Also: never expose Create Event in the left nav itself.
  assert.equal(items.some((i) => i.href === EXHIBITOR_EVENTS_CREATE_HREF), false);
});
