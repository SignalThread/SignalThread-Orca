import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  authorizeMobileIntegrationRequestWithDeps,
  type MobileIntegrationAuthorizationDeps
} from "../lib/integrations/mobile-oauth/authorization-core";

const USER_ID = "mobile-user-a";
const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

function bearerRequest() {
  return new Request("https://lr.example/api/mobile/integrations/connections", {
    headers: { authorization: "Bearer valid-access-token" }
  });
}

function deps(
  overrides: Partial<MobileIntegrationAuthorizationDeps> = {}
): MobileIntegrationAuthorizationDeps {
  return {
    resolveSession: async () => ({
      userId: USER_ID,
      companyId: COMPANY_A,
      role: "exhibitor_viewer"
    }),
    resolveEventAccess: async () => ({
      eventIds: ["event-a"],
      companyId: COMPANY_A,
      role: "exhibitor_viewer"
    }),
    ...overrides
  };
}

test("valid authenticated mobile LR user can read integration connection state", async () => {
  const result = await authorizeMobileIntegrationRequestWithDeps(bearerRequest(), deps());

  assert.deepEqual(result, {
    ok: true,
    context: {
      userId: USER_ID,
      companyId: COMPANY_A,
      role: "exhibitor_viewer"
    }
  });
});

test("cross-company or invalid event scope is still rejected", async () => {
  const crossCompany = await authorizeMobileIntegrationRequestWithDeps(
    bearerRequest(),
    deps({
      resolveEventAccess: async () => ({
        eventIds: ["foreign-event"],
        companyId: COMPANY_B,
        role: "exhibitor_viewer"
      })
    })
  );
  assert.deepEqual(crossCompany, { ok: false, status: 403, error: "Forbidden" });

  const noAccessibleEvent = await authorizeMobileIntegrationRequestWithDeps(
    bearerRequest(),
    deps({
      resolveEventAccess: async () => ({
        eventIds: [],
        companyId: COMPANY_A,
        role: "exhibitor_viewer"
      })
    })
  );
  assert.deepEqual(noAccessibleEvent, { ok: false, status: 403, error: "Forbidden" });
});

test("unauthenticated integration connection request is rejected before session lookup", async () => {
  let sessionLookups = 0;
  const result = await authorizeMobileIntegrationRequestWithDeps(
    new Request("https://lr.example/api/mobile/integrations/connections"),
    deps({
      resolveSession: async () => {
        sessionLookups += 1;
        throw new Error("must not run");
      }
    })
  );

  assert.deepEqual(result, { ok: false, status: 401, error: "Unauthorized" });
  assert.equal(sessionLookups, 0);
});

test("all adjacent mobile integration routes share the scoped authorization model", () => {
  const routes = [
    "app/api/mobile/integrations/connections/route.ts",
    "app/api/mobile/integrations/connections/[provider]/oauth/route.ts",
    "app/api/mobile/integrations/connections/[provider]/route.ts"
  ];

  for (const route of routes) {
    const source = readFileSync(route, "utf8");
    assert.match(source, /authorizeMobileIntegrationRequest/);
    assert.doesNotMatch(source, /isExhibitorAdminRole/);
  }
});
