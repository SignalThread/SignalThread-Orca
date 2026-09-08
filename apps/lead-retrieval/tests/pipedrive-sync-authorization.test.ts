import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, test } from "node:test";

/**
 * Cross-tenant isolation + RBAC for the three new Phase 2 Pipedrive delivery routes,
 * following the source-inspection style of `cross-tenant-resource-isolation.test.ts`:
 * these handlers are `server-only`, so the canonical route source is the source of truth.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("Pipedrive Phase 2 routes reuse the shared company-integration authorization", () => {
  for (const routePath of [
    "app/api/integrations/pipedrive/sync/route.ts",
    "app/api/integrations/pipedrive/bulk-sync/route.ts",
    "app/api/integrations/pipedrive/test-lead/route.ts"
  ]) {
    it(`${routePath} authorizes via authorizeCompanyIntegrationAdmin before doing any work`, () => {
      const src = read(routePath);
      assert.match(src, /import \{ authorizeCompanyIntegrationAdmin \} from "@\/lib\/integrations\/company-integration-authorization"/);
      assert.match(src, /const authorization = await authorizeCompanyIntegrationAdmin\(\{ supabase: routeAuth\.supabase \}\)/);
      assert.match(src, /if \(!authorization\.ok\)/);
    });

    it(`${routePath} scopes every company-derived value to authorization.context.companyId, never a client-supplied company id`, () => {
      const src = read(routePath);
      assert.equal(/companyId:\s*body\./.test(src), false, `${routePath} must not read companyId from the request body`);
      assert.match(src, /authorization\.context\.companyId/);
    });
  }
});

describe("Pipedrive sync data-access functions co-filter every query by company_id", () => {
  it("sync-service loads the lead scoped to the caller's company", () => {
    const src = read("lib/integrations/pipedrive/sync-service.ts");
    assert.match(src, /\.eq\("id", input\.leadId\)\s*\n?\s*\.eq\("company_id", input\.companyId\)/);
  });

  it("sync-service loads/persists the sync row scoped to company_id + lead_id", () => {
    const src = read("lib/integrations/pipedrive/sync-service.ts");
    assert.match(src, /\.eq\("company_id", input\.companyId\)\s*\n?\s*\.eq\("lead_id", input\.leadId\)/);
  });

  it("sync-state reads are scoped by company_id", () => {
    const src = read("lib/integrations/pipedrive/sync-state.ts");
    const companyScopedQueries = src.match(/\.eq\("company_id", companyId\)/g) ?? [];
    assert.ok(companyScopedQueries.length >= 2, "expected every sync-state query to filter by company_id");
  });

  it("the queue enqueue/claim path scopes lookups by company_id before writing", () => {
    const src = read("lib/integrations/pipedrive/queue.ts");
    assert.match(src, /\.eq\("company_id", input\.companyId\)/);
  });
});

test("the email-draft note only ever sends a human-reviewed draft (approved or sent), never a pending/rejected one", () => {
  const src = read("lib/integrations/pipedrive/sync-service.ts");
  assert.match(src, /\.in\("approval_status", \["approved", "sent"\]\)/);
});

test("the email draft note never triggers an actual email send — no email-sending import in the sync path", () => {
  for (const file of [
    "lib/integrations/pipedrive/sync-orchestrator.ts",
    "lib/integrations/pipedrive/sync-service.ts",
    "lib/integrations/pipedrive/sync-core.ts"
  ]) {
    const src = read(file);
    assert.equal(/send-email|sendEmail|gmail/i.test(src), false, `${file} must not touch any email-sending code path`);
  }
});
