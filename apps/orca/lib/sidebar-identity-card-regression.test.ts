import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellLayoutSource = readFileSync("app/(shell)/layout.tsx", "utf8");
const shellSource = readFileSync("app/(shell)/_components/shell-scaffold.tsx", "utf8");
const switchSource = readFileSync("app/(shell)/_components/switch-account-button.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("sidebar identity card keeps the current organization and signed-in user visibly separate", () => {
  const identityCardSource = sourceBetween(shellSource, 'data-testid="sidebar-identity-card"', "</aside>");

  assert.match(identityCardSource, /data-testid="sidebar-organization-identity"/);
  assert.match(identityCardSource, /data-testid="sidebar-user-identity"/);
  assert.match(identityCardSource, /\{organizationName\}/);
  assert.match(identityCardSource, /\{userName\}/);
  assert.match(identityCardSource, /\{user\.email\}/);
  assert.match(identityCardSource, /border-t border-slate-200\/80/);
  assert.match(shellSource, /flex flex-col items-center gap-2/);
  assert.doesNotMatch(identityCardSource, /Profile/);
  assert.doesNotMatch(identityCardSource, /Account Settings/);
});

test("the shell derives switch eligibility from canonical accessible organizations", () => {
  assert.match(shellLayoutSource, /listAccessibleOrganizationsForUser/);
  assert.match(shellLayoutSource, /canSwitchAccount=\{accessibleOrganizations\.length > 1\}/);
  assert.match(shellSource, /AccountAccessProvider canSwitchAccount=\{canSwitchAccount\}/);
});

test("single-account users have no switch affordance while eligible users retain the existing action", () => {
  assert.match(switchSource, /if \(!canSwitchAccount\) return null/);
  assert.match(switchSource, /AccountAccessContext/);
  assert.match(switchSource, /method: "DELETE"/);
  assert.match(switchSource, /switchInFlightRef\.current/);
  assert.match(switchSource, /clearOrganizationScopedBrowserState/);
  assert.match(switchSource, /window\.location\.replace\("\/select-account"\)/);
});
