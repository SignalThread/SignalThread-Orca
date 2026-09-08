import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Strict scope regression: Account Settings vs Event Settings must never bleed into each other.
 * Event Settings = event configuration only (no people / invites / access UI).
 * Account Settings = team, invites, access, danger zone.
 */

const repoRoot = process.cwd();

function readPage(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

const eventSettingsSrc = readPage("app/app/events/[eventId]/settings/page.tsx");
const accountSettingsSrc = readPage("app/app/settings/page.tsx");
const exhibitorEventLevelSettingsSrc = readPage("app/(app)/exhibitor/settings/page.tsx");

const forbiddenEventSettingsSubstrings = [
  "Event team access",
  "Invite to this event",
  "Invite user",
  "People from your company",
  "Users assigned",
  "Send invite",
  "InviteTeamMemberForm",
  "invite-team-member-form",
  "inviteTeamMemberAction",
  "Per-event configuration",
  "Open Events → choose an event → Settings",
  "managed here in Account",
  "non-access configuration"
];

/* ---------------- Event Settings (configuration only) ---------------- */

test("event Settings page does NOT contain team/invite/access UI copy or components", () => {
  for (const needle of forbiddenEventSettingsSubstrings) {
    assert.equal(
      eventSettingsSrc.includes(needle),
      false,
      `event settings must not contain "${needle}"`
    );
  }
});

test("event Settings page does NOT query or render event_users", () => {
  assert.equal(eventSettingsSrc.includes("event_users"), false);
  assert.equal(eventSettingsSrc.includes("exhibitor_company_id"), false);
});

test("event Settings page does NOT render account/company team management", () => {
  assert.equal(eventSettingsSrc.includes("CompanyTeamSettingsClient"), false);
  assert.equal(eventSettingsSrc.includes("getCompanySettingsTeamPageData"), false);
});

test("event Settings page does NOT contain account Danger zone / Delete account", () => {
  assert.equal(eventSettingsSrc.includes("Delete account"), false);
  assert.equal(eventSettingsSrc.includes("Danger zone"), false);
});

test("event Settings page does NOT contain Create event or events list affordances", () => {
  assert.equal(eventSettingsSrc.includes("EXHIBITOR_EVENTS_CREATE_HREF"), false);
});

test("event Settings page loads event row from events table only", () => {
  assert.match(eventSettingsSrc, /\.from\(\s*"events"\s*\)/);
});

/* ---------------- Account Settings (/app/settings) ---------------- */

test("account Settings page DOES render company team/user management", () => {
  assert.match(accountSettingsSrc, /CompanyTeamSettingsClient/);
  assert.match(accountSettingsSrc, /getCompanySettingsTeamPageData/);
});

test("account Settings page DOES contain Danger zone with Delete account", () => {
  assert.match(accountSettingsSrc, /Danger zone/);
  assert.match(accountSettingsSrc, /Delete account/);
});

test("account Settings page does NOT import removed per-event invite form", () => {
  assert.equal(accountSettingsSrc.includes('from "./invite-team-member-form"'), false);
  assert.equal(accountSettingsSrc.includes("InviteTeamMemberForm"), false);
});

test("account Settings page does NOT include removed per-event helper / guidance card", () => {
  assert.equal(accountSettingsSrc.includes("Per-event configuration"), false);
  assert.equal(accountSettingsSrc.includes("Open Events → choose an event → Settings"), false);
});

/* ---------------- Exhibitor event-level account (/exhibitor/settings) ---------------- */

test("exhibitor event-level settings page does NOT render company team/user management", () => {
  assert.equal(exhibitorEventLevelSettingsSrc.includes("CompanyTeamSettingsClient"), false);
  assert.equal(exhibitorEventLevelSettingsSrc.includes("getCompanySettingsTeamPageData"), false);
});

test("exhibitor event-level settings page does NOT contain Danger zone with Delete account", () => {
  assert.equal(exhibitorEventLevelSettingsSrc.includes("Delete account"), false);
  assert.equal(exhibitorEventLevelSettingsSrc.includes("Danger zone"), false);
});

test("exhibitor event-level settings page includes sign-out affordance", () => {
  assert.match(exhibitorEventLevelSettingsSrc, /SignOutForm/);
});

test("account Settings redirects event-level tenants toward simplified exhibitor settings", () => {
  assert.match(accountSettingsSrc, /EXHIBITOR_EVENT_LEVEL_SETTINGS_HREF/);
  assert.match(accountSettingsSrc, /isExhibitorEventLevelTenantUiResolution/);
});
