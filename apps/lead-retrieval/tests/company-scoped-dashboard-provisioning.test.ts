import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function readWorkspaceFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("company-scoped Add Company reuses the canonical exhibitor provisioning API in company mode", () => {
  const src = readWorkspaceFile("components/admin/company-scoped-create-company-action.tsx");

  assert.match(src, /fetch\("\/api\/v1\/exhibitors"/);
  assert.match(src, /hostCompanyId,/);
  assert.match(src, /exhibitorName: companyName\.trim\(\)/);
  assert.match(src, /seatsPurchased: parsedSeats/);
  assert.match(src, /licenseStatus,/);
  assert.doesNotMatch(src, /Billing Organization/);
  assert.doesNotMatch(src, /eventId:/);
});

test("company-scoped Add License reuses the shared license modal locked to scope='company'", () => {
  const actionSrc = readWorkspaceFile("components/admin/company-scoped-create-license-action.tsx");
  const modalSrc = readWorkspaceFile("components/admin/create-license-modal.tsx");

  assert.match(actionSrc, /CreateLicenseModal/);
  assert.match(actionSrc, /initialScope="company"/);
  assert.match(actionSrc, /scopeLocked/);
  assert.match(actionSrc, /companyScopedSimple/);
  assert.match(modalSrc, /fetch\("\/api\/admin\/licenses"/);
  assert.match(modalSrc, /const isSimpleCompanyScoped = scope === "company" && companyScopedSimple/);
  assert.match(modalSrc, /Expires \/ Renews date/);
  assert.match(modalSrc, /isSimpleCompanyScoped \? "Company \*" : "Exhibitor company \*"/);
});

test("shared license API supports company-scoped licenses and preserves event-scoped provisioning", () => {
  const src = readWorkspaceFile("app/api/admin/licenses/route.ts");

  assert.match(
    src,
    /if \(scope === "company" && sessionUser\.role !== "platform_admin"\)/
  );
  assert.match(src, /\.eq\("scope", "company"\)/);
  assert.match(src, /\.eq\("scope", "event"\)/);
  assert.match(src, /event_id: scope === "event" \? eventId : null/);
  assert.match(src, /if \(scope === "event" && !eventId\)/);
});

test("shared exhibitor provisioning API provisions company-scoped licenses and keeps event-scoped creation intact", () => {
  const src = readWorkspaceFile("app/api/v1/exhibitors/route.ts");

  assert.match(
    src,
    /Only platform admins can create company-scoped exhibitor accounts\./
  );
  assert.match(src, /\.eq\("scope", "company"\)/);
  assert.match(src, /scope: "company"/);
  assert.match(src, /event_id: null/);
  assert.match(src, /scope: "event"/);
  assert.match(src, /\.from\("exhibitors"\)\s*\.insert\(\{/);
});

test("company-scoped Users page reuses the shared invite flow without forcing event scope", () => {
  const pageSrc = readWorkspaceFile("app/admin/company-licenses/users/page.tsx");
  const actionSrc = readWorkspaceFile("components/admin/company-scoped-invite-user-action.tsx");
  const modalSrc = readWorkspaceFile("components/admin/add-user-modal.tsx");
  const serverActionSrc = readWorkspaceFile("app/admin/users/actions.ts");

  assert.match(pageSrc, /CompanyScopedInviteUserAction/);
  assert.match(pageSrc, /getAdminUsersPageData/);
  assert.match(pageSrc, /addUserAction=\{addUserInviteAction\}/);
  assert.match(actionSrc, /AddUserModal/);
  assert.match(actionSrc, /roleOptions=\{\["exhibitor_admin", "exhibitor_viewer"\]\}/);
  assert.match(
    modalSrc,
    /return isCompanyScopedInvite \? "" : \(events\[0\]\?\.id \?\? ""\);/
  );
  assert.match(
    serverActionSrc,
    /if \(requiresManualEventMembership && !eventId\)/
  );
  assert.match(serverActionSrc, /persistUserInviteAccessConfig\(/);
  assert.match(serverActionSrc, /if \(requiresManualEventMembership\) \{/);
});

test("Add User duplicate detection is exact email only and reissues Auth invites through the canonical service", () => {
  const serverActionSrc = readWorkspaceFile("app/admin/users/actions.ts");

  assert.match(serverActionSrc, /findPublicUserProfileByExactEmail/);
  assert.match(serverActionSrc, /emailMatchesExactCaseInsensitive/);
  assert.match(serverActionSrc, /findAuthUserByEmailAdmin/);
  assert.match(serverActionSrc, /existingAuthInviteNeedsReissue/);
  assert.match(serverActionSrc, /resendAuthInvite\(/);
  assert.doesNotMatch(serverActionSrc, /sendExistingAuthInviteLink/);
  assert.doesNotMatch(serverActionSrc, /ilike\(["']email["'],\s*["'`]%/);
  assert.doesNotMatch(serverActionSrc, /\.includes\(\s*email\s*\)/);
  assert.doesNotMatch(serverActionSrc, /split\(["']\+["']\)/);
});
