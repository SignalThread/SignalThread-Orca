import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  EXHIBITOR_ACCOUNT_HREF,
  EXHIBITOR_EVENTS_CREATE_HREF,
  EXHIBITOR_EVENTS_ENTRY_HREF,
  EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF,
  getExhibitorNavItemsForSidebar,
  isExhibitorEntryPathAllowedWithNoEvents
} from "../lib/exhibitor/exhibitor-app-nav";
import {
  buildCompanyAdminInviteAuthData,
  companyAdminInviteMetadataHasNoEventId
} from "../lib/exhibitor/company-admin-invite-metadata";

test("exhibitor_admin with zero events: sidebar shows Manage + Settings + Help", () => {
  // With no accessible events, the URL→mode resolver forces "account" mode,
  // which is structurally [Manage, Settings, Help].
  const items = getExhibitorNavItemsForSidebar({ mode: "account" });
  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((i) => ({ href: i.href, label: i.label })),
    [
      { href: EXHIBITOR_EVENTS_ENTRY_HREF, label: "Manage" },
      { href: EXHIBITOR_ACCOUNT_HREF, label: "Settings" },
      { href: "/help", label: "Help" }
    ]
  );
});

test("company portfolio zero-event state uses the dedicated branded onboarding variant", () => {
  const page = readFileSync(path.join(process.cwd(), "app/app/events/page.tsx"), "utf8");
  const entry = readFileSync(path.join(process.cwd(), "components/app/no-active-event-entry.tsx"), "utf8");
  assert.match(page, /variant="exhibitor-onboarding"/);
  assert.match(entry, /Create your first event to start capturing and managing leads\./);
  assert.match(entry, /data-testid="exhibitor-no-events-onboarding"/);
  assert.match(entry, /href=\{createEventHref\}/);
});

test("organizer zero-event experience remains on the shared default entry state", () => {
  const organizerPage = readFileSync(path.join(process.cwd(), "app/app/organizer/page.tsx"), "utf8");
  assert.match(organizerPage, /<NoActiveEventEntry[\s\S]*?mode="empty"/);
  assert.doesNotMatch(organizerPage, /variant="exhibitor-onboarding"/);
});

test("no-event exhibitor can reach company settings and events routes", () => {
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(EXHIBITOR_EVENTS_ENTRY_HREF), true);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(EXHIBITOR_EVENTS_CREATE_HREF), true);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(EXHIBITOR_ACCOUNT_HREF), true);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(`${EXHIBITOR_ACCOUNT_HREF}/billing`), true);
});

test("event-level tenant with zero events: entry gate allows only /exhibitor/settings", () => {
  const opt = { allowsAppEventsManagementSurfaces: false, eventLevelTenantUi: true };
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF, opt), true);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(EXHIBITOR_ACCOUNT_HREF, opt), false);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents(EXHIBITOR_EVENTS_ENTRY_HREF, opt), false);
});

test("event-level tenant with zero events: sidebar account-mode nav is Settings + Help", () => {
  const items = getExhibitorNavItemsForSidebar({
    mode: "account",
    allowsAppEventsManagementSurfaces: false,
    eventLevelTenantUi: true
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].href, EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF);
  assert.equal(items[1].href, "/help");
});

test("no-event exhibitor cannot reach event-scoped exhibitor app surfaces", () => {
  const blocked = [
    "/exhibitor/dashboard",
    "/exhibitor/leads",
    "/exhibitor/leads/abc",
    "/exhibitor/signals",
    "/exhibitor/campaigns",
    "/exhibitor/users",
    "/exhibitor/integrations",
    "/exhibitor/import/wizard"
  ];
  for (const path of blocked) {
    assert.equal(isExhibitorEntryPathAllowedWithNoEvents(path), false, `expected blocked: ${path}`);
  }
});

test("no-event: event detail and per-event settings stay blocked", () => {
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents("/app/events/evt_1"), false);
  assert.equal(isExhibitorEntryPathAllowedWithNoEvents("/app/events/evt_1/settings"), false);
});

test("exhibitor_admin can invite another admin before any event exists (metadata has no event id)", () => {
  const data = buildCompanyAdminInviteAuthData({
    companyId: "company_x",
    eventAccessMode: "all_company_events"
  });
  assert.equal(companyAdminInviteMetadataHasNoEventId(data), true);
});
