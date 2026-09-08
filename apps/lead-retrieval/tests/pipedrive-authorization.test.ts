import assert from "node:assert/strict";
import test from "node:test";
import { resolveCompanyIntegrationAuthorization } from "../lib/integrations/company-integration-authorization-core";

test("Pipedrive integration authorization rejects unauthenticated and viewer roles", () => {
  assert.deepEqual(
    resolveCompanyIntegrationAuthorization({
      userId: null,
      role: null,
      companyId: null,
      activeCompanyId: null,
      hasExhibitorWebAdminAccess: false
    }),
    { ok: false, status: 401, error: "Unauthorized" }
  );
  const viewer = resolveCompanyIntegrationAuthorization({
      userId: "viewer-1",
      role: "exhibitor_viewer",
      companyId: "company-a",
      activeCompanyId: null,
      hasExhibitorWebAdminAccess: false
    });
  assert.equal(viewer.ok ? null : viewer.status, 403);
});

test("exhibitor admin requires canonical company scope and web-admin access", () => {
  assert.deepEqual(
    resolveCompanyIntegrationAuthorization({
      userId: "admin-1",
      role: "exhibitor_admin",
      companyId: "company-a",
      activeCompanyId: null,
      hasExhibitorWebAdminAccess: true
    }),
    { ok: true, context: { userId: "admin-1", companyId: "company-a" } }
  );
  const denied = resolveCompanyIntegrationAuthorization({
      userId: "admin-1",
      role: "exhibitor_admin",
      companyId: "company-a",
      activeCompanyId: null,
      hasExhibitorWebAdminAccess: false
    });
  assert.equal(denied.ok ? null : denied.status, 403);
});

test("platform admin uses only the validated selected-company projection", () => {
  assert.deepEqual(
    resolveCompanyIntegrationAuthorization({
      userId: "platform-1",
      role: "platform_admin",
      companyId: "company-b",
      activeCompanyId: "company-b",
      hasExhibitorWebAdminAccess: false
    }),
    { ok: true, context: { userId: "platform-1", companyId: "company-b" } }
  );
  const mismatch = resolveCompanyIntegrationAuthorization({
      userId: "platform-1",
      role: "platform_admin",
      companyId: "company-a",
      activeCompanyId: "company-b",
      hasExhibitorWebAdminAccess: false
    });
  assert.equal(mismatch.ok ? null : mismatch.status, 403);
  const missing = resolveCompanyIntegrationAuthorization({
      userId: "platform-1",
      role: "platform_admin",
      companyId: null,
      activeCompanyId: null,
      hasExhibitorWebAdminAccess: false
    });
  assert.equal(missing.ok ? null : missing.status, 403);
});
