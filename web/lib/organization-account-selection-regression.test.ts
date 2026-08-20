import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const requestUserSource = readFileSync("lib/request-user.ts", "utf8");
const meRouteSource = readFileSync("app/api/me/route.ts", "utf8");
const callbackSource = readFileSync("app/auth/callback/route.ts", "utf8");
const loginSource = readFileSync("app/(public)/login/page.tsx", "utf8");
const logoutSource = readFileSync("app/(shell)/_components/logout-button.tsx", "utf8");
const shellSource = readFileSync("app/(shell)/_components/shell-scaffold.tsx", "utf8");
const switchSource = readFileSync("app/(shell)/_components/switch-account-button.tsx", "utf8");
const selectAccountSource = readFileSync("app/(shell)/select-account/page.tsx", "utf8");
const browserStateSource = readFileSync("lib/organization-scoped-browser-state.ts", "utf8");
const eventsRouteSource = readFileSync("app/api/events/route.ts", "utf8");

test("request resolution uses the canonical selection decision instead of membership ordering", () => {
  assert.match(requestUserSource, /resolveOrganizationSelection\(/);
  assert.match(requestUserSource, /listAccessibleOrganizationsForUser/);
  assert.match(requestUserSource, /ORGANIZATION_SELECTION_COOKIE_NAME = "activeOrgSelectionId"/);
  assert.doesNotMatch(requestUserSource, /activeOrgId: firstOrgId/);
  assert.doesNotMatch(requestUserSource, /requestedPlatformOrgId/);
});

test("the selection endpoint validates access and commits both normal-context cookies", () => {
  assert.match(meRouteSource, /listAccessibleOrganizationsForUser/);
  assert.match(meRouteSource, /ORG_CONTEXT_FORBIDDEN/);
  assert.match(meRouteSource, /applyOrganizationSelectionCookie\(response, activeOrgId\)/);
  assert.match(meRouteSource, /clearPlatformContextCookie\(response\)/);
});

test("every completed login clears prior account and platform context before picker routing", () => {
  assert.match(callbackSource, /ACTIVE_ORG_COOKIE_NAME/);
  assert.match(callbackSource, /ORGANIZATION_SELECTION_COOKIE_NAME/);
  assert.match(callbackSource, /PLATFORM_CONTEXT_COOKIE_NAME/);
  assert.match(loginSource, /method: "DELETE"/);
  assert.match(loginSource, /await fetch\("\/api\/me"/);
  assert.match(callbackSource, /new URL\("\/select-account"/);
  assert.match(loginSource, /await supabase\.auth\.getSession\(\)/);
  assert.match(loginSource, /router\.replace\("\/select-account"\)/);
  assert.match(selectAccountSource, /redirect\("\/dashboard"\)/);
});

test("logout clears account context so a later login cannot inherit it", () => {
  assert.match(logoutSource, /method: "DELETE"/);
  assert.match(logoutSource, /await supabase\.auth\.signOut\(\)/);
});

test("the authenticated shell offers a verified, single-flight context-clearing switch action", () => {
  assert.match(shellSource, /SwitchAccountButton/);
  assert.match(switchSource, /method: "DELETE"/);
  assert.match(switchSource, /switchInFlightRef\.current/);
  assert.match(switchSource, /!body\?\.ok \|\| !body\.userId/);
  assert.match(switchSource, /clearOrganizationScopedBrowserState/);
  assert.match(browserStateSource, /matrix2:selectedEventId/);
  assert.match(browserStateSource, /planner-os:event-cc-layout/);
  assert.match(browserStateSource, /sessionStorage/);
  assert.match(switchSource, /window\.location\.replace\("\/select-account"\)/);
  assert.doesNotMatch(switchSource, /\/login/);
});

test("clearing context is authenticated and cannot report false success", () => {
  const deleteHandler = meRouteSource.slice(
    meRouteSource.indexOf("async function deleteHandler"),
    meRouteSource.indexOf("const getWithLogging"),
  );

  assert.match(deleteHandler, /ensureProvisionedUserAndContext\(request\)/);
  assert.match(deleteHandler, /setRequestUserId\(context\.appUserId \?\? null\)/);
  assert.match(deleteHandler, /context\.status === "UNAUTHENTICATED"/);
  assert.match(deleteHandler, /APP_USER_NOT_RESOLVED/);
  assert.match(deleteHandler, /\{ ok: true, userId: context\.appUserId \}/);
  assert.match(deleteHandler, /clearOrganizationContextCookies\(response\)/);
  assert.match(deleteHandler, /clearPlatformContextCookie\(response\)/);
});

test("switched account data is reloaded under the resolved active organization", () => {
  assert.match(eventsRouteSource, /resolveRequestUser\(nextRequest\)/);
  assert.match(eventsRouteSource, /orgId: user\.orgId/);
  assert.match(eventsRouteSource, /Cache-Control", "no-store/);
});

test("development and production share the same authenticated selection resolver", () => {
  assert.match(requestUserSource, /return resolveFromAuthenticatedIdentity\(\{/);
  assert.match(requestUserSource, /if \(process\.env\.NODE_ENV === "development"\)/);
  assert.match(requestUserSource, /const selection = resolveOrganizationSelection\(/);
  assert.doesNotMatch(requestUserSource, /requestedPlatformOrgId/);
});
