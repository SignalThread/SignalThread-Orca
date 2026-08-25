import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layoutSource = readFileSync("app/platform/layout.tsx", "utf8");
const shellLayoutSource = readFileSync("app/(shell)/layout.tsx", "utf8");
const shellScaffoldSource = readFileSync("app/(shell)/_components/shell-scaffold.tsx", "utf8");
const overviewPageSource = readFileSync("app/platform/page.tsx", "utf8");
const accountsPageSource = readFileSync("app/platform/accounts/page.tsx", "utf8");
const detailPageSource = readFileSync("app/platform/accounts/[orgId]/page.tsx", "utf8");
const clientSource = readFileSync("app/platform/_components/platform-accounts-client.tsx", "utf8");
const tablesSource = readFileSync("app/platform/_components/platform-admin-tables.tsx", "utf8");
const requestUserSource = readFileSync("lib/request-user.ts", "utf8");
const eventsServiceSource = readFileSync("lib/events.ts", "utf8");

test("Platform Admin root redirects to the canonical server-rendered account list", () => {
  assert.match(overviewPageSource, /redirect\("\/platform\/accounts"\)/);
  assert.doesNotMatch(overviewPageSource, /PlatformAccountsClient mode="overview"/);
});

test("Accounts list uses the server-rendered scoped table with available account fields", () => {
  assert.match(accountsPageSource, /<AccountsTable searchParams=/);
  assert.match(tablesSource, /listPlatformAccountsPage/);
  assert.match(tablesSource, /<table/);
  for (const label of ["Account", "Primary admin", "Users / memberships", "Events", "Created"]) assert.match(tablesSource, new RegExp(label));
  assert.match(tablesSource, /href=\{`\/platform\/accounts\/\$\{account\.id\}`\}/);
});

test("Create Account form calls the platform account API", () => {
  assert.match(clientSource, /Create Account/);
  assert.match(clientSource, /method: "POST"/);
  assert.match(clientSource, /fetch\("\/api\/platform\/accounts"/);
  assert.match(clientSource, /body: JSON\.stringify\(\{/);
});

test("Create Account handles validation and API errors", () => {
  assert.match(clientSource, /setErrorMessage\(toErrorMessage\(payload/);
  assert.match(clientSource, /Account could not be created/);
  assert.match(clientSource, /Network error while creating the account/);
});

test("Create Account does not show fake success before API confirmation", () => {
  const createAccountSource = clientSource.slice(
    clientSource.indexOf("async function submitCreateAccount"),
    clientSource.indexOf("function AddAccountUserModal"),
  );

  assert.match(createAccountSource, /if \(!response\.ok\)/);
  assert.match(createAccountSource, /if \(payload\.account\)/);
  assert.match(createAccountSource, /onCreated\(payload\.account\)/);
  assert.doesNotMatch(createAccountSource, /onCreated\([^)]*\)[\s\S]*if \(!response\.ok\)/);
});

test("Account detail page renders account overview from the account API", () => {
  assert.match(detailPageSource, /PlatformAccountsClient mode="detail"/);
  assert.match(clientSource, /Account details/);
  assert.match(clientSource, /Created/);
  assert.match(clientSource, /Primary admin/);
  assert.match(clientSource, /Users/);
  assert.match(clientSource, /Events/);
});

test("Users tab renders account users and no-event-access warning", () => {
  assert.match(clientSource, /AccountUsersPanel/);
  assert.match(clientSource, /fetch\(`\/api\/platform\/accounts\/\$\{orgId\}\/users`/);
  assert.match(clientSource, />Members</);
  assert.match(clientSource, /Platform role/);
  assert.match(clientSource, /No event access/);
  assert.match(clientSource, /Manage event access/);
});

test("Account detail users and events are loaded through account-scoped endpoints", () => {
  assert.match(clientSource, /function AccountUsersPanel\(\{[\s\S]*orgId/);
  assert.match(clientSource, /fetch\(`\/api\/platform\/accounts\/\$\{orgId\}\/users`/);
  assert.match(clientSource, /function AccountEventsPanel\(\{[\s\S]*orgId/);
  assert.match(clientSource, /fetch\(`\/api\/platform\/accounts\/\$\{orgId\}\/events`/);
  assert.doesNotMatch(clientSource, /\/api\/platform\/users/);
  assert.doesNotMatch(clientSource, /\/api\/platform\/events"/);
});

test("Events tab renders account events", () => {
  assert.match(clientSource, /AccountEventsPanel/);
  assert.match(clientSource, /fetch\(`\/api\/platform\/accounts\/\$\{orgId\}\/events`/);
  assert.match(clientSource, />Events</);
  assert.match(clientSource, /Manage EventMember access for events that belong to this account only/);
  assert.match(clientSource, /Event/);
  assert.match(clientSource, /Client/);
  assert.match(clientSource, /Members/);
  assert.match(clientSource, /Manage access/);
});

test("Manage access UI renders account users and current event access", () => {
  assert.match(clientSource, /EventAccessModal/);
  assert.match(clientSource, /fetch\(`\/api\/platform\/accounts\/\$\{orgId\}\/users`/);
  assert.match(clientSource, /fetch\(`\/api\/platform\/accounts\/\$\{orgId\}\/events\/\$\{selectedEventId\}\/members`/);
  assert.match(clientSource, /Event visibility is granted only by EventMember rows/);
  assert.match(clientSource, /Has event access/);
  assert.match(clientSource, /No event access assigned yet\./);
  assert.match(clientSource, /EVENT_MEMBER_ROLES/);
});

test("Users and event access UI show server validation errors clearly", () => {
  assert.match(clientSource, /User could not be linked to this account/);
  assert.match(clientSource, /Role could not be updated/);
  assert.match(clientSource, /User could not be removed from this account/);
  assert.match(clientSource, /Event access could not be granted/);
  assert.match(clientSource, /Event access could not be revoked/);
  assert.match(clientSource, /toErrorMessage\(payload/);
});

test("Grant access calls POST on the event members API and refreshes state", () => {
  assert.match(clientSource, /async function grantAccess/);
  assert.match(clientSource, /method: "POST"/);
  assert.match(clientSource, /fetch\(`\/api\/platform\/accounts\/\$\{orgId\}\/events\/\$\{selectedEventId\}\/members`/);
  assert.match(clientSource, /body: JSON\.stringify\(\{ userId, eventRole \}\)/);
  assert.match(clientSource, /await refreshMembers\(\)/);
  assert.match(clientSource, /onChanged\(\)/);
});

test("Grant access does not show fake success when API rejects mutation", () => {
  const grantSource = clientSource.slice(
    clientSource.indexOf("async function grantAccess"),
    clientSource.indexOf("async function revokeAccess"),
  );

  assert.match(grantSource, /if \(!response\.ok\)/);
  assert.match(grantSource, /return;/);
  assert.match(grantSource, /await refreshMembers\(\)/);
  assert.match(grantSource, /onChanged\(\)/);
});

test("Revoke access calls DELETE on the event member API and refreshes state", () => {
  assert.match(clientSource, /async function revokeAccess/);
  assert.match(clientSource, /method: "DELETE"/);
  assert.match(clientSource, /fetch\(`\/api\/platform\/accounts\/\$\{orgId\}\/events\/\$\{selectedEventId\}\/members\/\$\{userId\}`/);
  assert.match(clientSource, /await refreshMembers\(\)/);
  assert.match(clientSource, /onChanged\(\)/);
});

test("Revoke access does not show fake success when API rejects mutation", () => {
  const revokeSource = clientSource.slice(
    clientSource.indexOf("async function revokeAccess"),
    clientSource.indexOf("return (", clientSource.indexOf("async function revokeAccess")),
  );

  assert.match(revokeSource, /if \(!response\.ok\)/);
  assert.match(revokeSource, /return;/);
  assert.match(revokeSource, /await refreshMembers\(\)/);
  assert.match(revokeSource, /onChanged\(\)/);
});

test("Cross-org event access is not represented as available", () => {
  assert.match(clientSource, /events that belong to this account only/);
  assert.match(clientSource, /\/api\/platform\/accounts\/\$\{orgId\}\/events/);
  assert.doesNotMatch(clientSource, /allEvents/);
  assert.doesNotMatch(clientSource, /activeOrgId/);
});

test("Jump in calls the platform context API and routes into normal shell", () => {
  assert.match(clientSource, /async function jumpIntoAccount/);
  assert.match(clientSource, /fetch\("\/api\/platform\/context"/);
  assert.match(clientSource, /method: "POST"/);
  assert.match(clientSource, /body: JSON\.stringify\(\{ orgId \}\)/);
  assert.match(clientSource, /router\.push\("\/events"\)/);
  assert.match(clientSource, /Jump In/);
  assert.doesNotMatch(clientSource, /imperson/i);
});

test("Platform viewing banner renders only from server-provided PlatformAdmin context", () => {
  assert.match(shellLayoutSource, /authContext\.role === "SUPER_ADMIN"/);
  assert.match(shellLayoutSource, /getActivePlatformOrgContext\(\)/);
  assert.match(shellLayoutSource, /platformContext=/);
  assert.match(shellScaffoldSource, /PlatformViewingBanner/);
  assert.match(shellScaffoldSource, /Platform Admin viewing:/);
  assert.match(shellScaffoldSource, /Exit account/);
  assert.match(shellScaffoldSource, /fetch\("\/api\/platform\/context"/);
  assert.match(shellScaffoldSource, /method: "DELETE"/);
  assert.match(shellScaffoldSource, /router\.push\("\/platform"\)/);
});

test("Access denied shell is server-gated and cannot be bypassed by client role text", () => {
  assert.match(layoutSource, /ensureProvisionedUserAndContext/);
  assert.match(layoutSource, /requirePlatformAdminFromContext\(context\)/);
  assert.match(layoutSource, /Platform Admin access is required/);
  assert.doesNotMatch(clientSource, /role ===/);
  assert.doesNotMatch(clientSource, /SUPER_ADMIN/);
});

test("platform context remains separate from normal account selection", () => {
  assert.doesNotMatch(requestUserSource, /PLATFORM_CONTEXT_COOKIE_NAME/);
  assert.doesNotMatch(requestUserSource, /requestedPlatformOrgId/);
  assert.match(requestUserSource, /appUser\.role === UserRole\.SUPER_ADMIN/);
  assert.match(eventsServiceSource, /resolveEventVisibility/);
  assert.match(eventsServiceSource, /role === UserRole\.SUPER_ADMIN/);
  assert.match(eventsServiceSource, /input\.orgId && canListOrganizationEvents\(input\.role\)/);
  assert.match(eventsServiceSource, /eventMembers/);
});

test("Add account user flow calls the platform account users API", () => {
  assert.match(clientSource, /AddAccountUserModal/);
  assert.match(clientSource, /Platform roles remain unchanged/);
  assert.match(clientSource, /organization membership/);
  assert.match(clientSource, /Organization membership does not grant event visibility/);
  assert.match(clientSource, /mode: "addExisting"/);
  assert.match(clientSource, /method: "POST"/);
  assert.match(clientSource, /fetch\(`\/api\/platform\/accounts\/\$\{orgId\}\/users`/);
  assert.match(clientSource, /User could not be linked to this account/);
});

test("Role change calls PATCH on the account user API", () => {
  assert.match(clientSource, /async function updateRole/);
  assert.match(clientSource, /method: "PATCH"/);
  assert.match(clientSource, /fetch\(`\/api\/platform\/accounts\/\$\{orgId\}\/users\/\$\{userId\}`/);
  assert.match(clientSource, /body: JSON\.stringify\(\{ role \}\)/);
});

test("Remove account user calls DELETE with confirmation", () => {
  assert.match(clientSource, /async function removeUser/);
  assert.match(clientSource, /window\.confirm/);
  assert.match(clientSource, /method: "DELETE"/);
  assert.match(clientSource, /fetch\(`\/api\/platform\/accounts\/\$\{orgId\}\/users\/\$\{user\.id\}`/);
});

test("Unsupported edit action remains disabled while Jump In is active", () => {
  assert.match(clientSource, /Edit/);
  assert.match(clientSource, /Jump In/);
  assert.match(clientSource, /disabled/);
  assert.doesNotMatch(clientSource, /impersonat/i);
});

test("Disabled future actions remain disabled when APIs do not exist", () => {
  assert.match(clientSource, /Edit/);
  assert.match(clientSource, /<button\s+type="button"\s+disabled[\s\S]*?Edit/);
  assert.doesNotMatch(clientSource, /fetch\("\/api\/platform\/accounts\/\$\{account\.id\}\/settings/);
  assert.doesNotMatch(clientSource, /method: "DELETE"[\s\S]*\/api\/platform\/accounts\/\$\{account\.id\}/);
});

test("Non-PlatformAdmin handling is server-gated and does not show fake success", () => {
  assert.match(layoutSource, /ensureProvisionedUserAndContext/);
  assert.match(layoutSource, /requirePlatformAdminFromContext\(context\)/);
  assert.match(layoutSource, /redirect\("\/login"\)/);
  assert.match(layoutSource, /Platform Admin access is required/);
  assert.doesNotMatch(clientSource, /UserRole/);
  assert.doesNotMatch(clientSource, /SUPER_ADMIN/);
  assert.doesNotMatch(clientSource, /DEV_ALLOW_NO_MEMBERSHIP/);
});
