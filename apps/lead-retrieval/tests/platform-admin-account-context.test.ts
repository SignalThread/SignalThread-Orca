import test from "node:test";
import assert from "node:assert/strict";
import {
  PLATFORM_ADMIN_ACCOUNT_CONTEXT_COOKIE,
  accountScopedCacheKey,
  projectAccountContextOntoPrincipal,
  resolvePlatformAdminAccountContext
} from "../lib/auth/platform-admin-account-context-core";
import { resolveAccessibleEventIdsForUserWithDeps } from "../lib/server/company-event-access-core";

const principal = { userId: "admin-1", role: "platform_admin" as const, companyId: null };
const companyA = { id: "company-a", name: "Acme" };
const companyB = { id: "company-b", name: "Beta" };

function context(company = companyA) {
  return resolvePlatformAdminAccountContext({
    principal,
    requestedCompanyId: company.id,
    company
  });
}

test("platform_admin can enter an existing company without changing authenticated identity", () => {
  const resolved = context();
  assert.deepEqual(resolved, { companyId: "company-a", companyName: "Acme" });
  const projected = projectAccountContextOntoPrincipal({ principal, context: resolved });
  assert.equal(projected.authenticatedUserId, "admin-1");
  assert.equal(projected.authenticatedRole, "platform_admin");
  assert.equal(projected.companyId, "company-a");
});

test("normal users cannot set or override account context", () => {
  const requested = resolvePlatformAdminAccountContext({
    principal: { userId: "user-1", role: "exhibitor_admin" },
    requestedCompanyId: companyB.id,
    company: companyB
  });
  assert.equal(requested, null);
  const projected = projectAccountContextOntoPrincipal({
    principal: { userId: "user-1", role: "exhibitor_admin", companyId: "company-a" },
    context: { companyId: "company-b", companyName: "Beta" }
  });
  assert.equal(projected.companyId, "company-a");
  assert.equal(projected.activeCompanyId, null);
});

test("reads resolve only the selected company's event ids", async () => {
  const result = await resolveAccessibleEventIdsForUserWithDeps(
    { userId: "admin-1", platformAdminCompanyId: "company-b" },
    {
      loadUser: async () => ({ id: "admin-1", role: "platform_admin", companyId: null, eventAccessMode: null }),
      loadCompanyLicenseEligibility: async () => false,
      loadCompanyOwnedEventIds: async (companyId) => companyId === "company-b" ? ["b-event-1", "b-event-2"] : ["a-event"],
      loadAssignedCompanyEventIds: async () => [],
      loadLegacyEventIds: async () => [],
      loadOrganizerEventIds: async () => []
    }
  );
  assert.equal(result.companyId, "company-b");
  assert.deepEqual(result.eventIds, ["b-event-1", "b-event-2"]);
});

test("writes use selected company while audit actor stays the real platform_admin", () => {
  const projected = projectAccountContextOntoPrincipal({ principal, context: context() });
  assert.deepEqual(
    { company_id: projected.companyId, owner_user_id: projected.authenticatedUserId },
    { company_id: "company-a", owner_user_id: "admin-1" }
  );
  assert.equal(projected.authenticatedRole, "platform_admin");
});

test("switching companies partitions cache identity and cannot reuse prior-company state", () => {
  assert.notEqual(accountScopedCacheKey("company-a", "leads"), accountScopedCacheKey("company-b", "leads"));
});

test("refresh persistence uses a stable server cookie contract", () => {
  assert.equal(PLATFORM_ADMIN_ACCOUNT_CONTEXT_COOKIE, "st_platform_admin_company");
  assert.deepEqual(context(), context());
});

test("Exit fully clears effective company context", () => {
  const projected = projectAccountContextOntoPrincipal({ principal, context: null });
  assert.equal(projected.companyId, null);
  assert.equal(projected.activeCompanyId, null);
});

test("unknown or mismatched companies are rejected", () => {
  assert.equal(resolvePlatformAdminAccountContext({ principal, requestedCompanyId: "company-a", company: companyB }), null);
});
