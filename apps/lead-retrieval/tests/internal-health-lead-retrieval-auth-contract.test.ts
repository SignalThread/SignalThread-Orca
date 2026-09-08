import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  authorizeInternalHealthRequest,
  signInternalHealthPath
} from "@/lib/internal-health/internal-health-auth";
import {
  LEAD_RETRIEVAL_INTERNAL_HEALTH_PATHS,
  isLeadRetrievalInternalHealthPath
} from "@/lib/internal-health/lead-retrieval/paths";

const SECRET = "internal-health-secret";
const TIMESTAMP = "1782820800000";

const ROUTES_BY_PATH: Record<(typeof LEAD_RETRIEVAL_INTERNAL_HEALTH_PATHS)[number], string> = {
  "/api/internal/health/lead-retrieval/conversation-lifecycle":
    "app/api/internal/health/lead-retrieval/conversation-lifecycle/route.ts",
  "/api/internal/health/lead-retrieval/capture-recording-ingestion":
    "app/api/internal/health/lead-retrieval/capture-recording-ingestion/route.ts",
  "/api/internal/health/lead-retrieval/workflow-waits":
    "app/api/internal/health/lead-retrieval/workflow-waits/route.ts",
  "/api/internal/health/lead-retrieval/access-readiness":
    "app/api/internal/health/lead-retrieval/access-readiness/route.ts",
  "/api/internal/health/lead-retrieval/campaign-readiness":
    "app/api/internal/health/lead-retrieval/campaign-readiness/route.ts",
  "/api/internal/health/lead-retrieval/invite-license-seat-access":
    "app/api/internal/health/lead-retrieval/invite-license-seat-access/route.ts",
  "/api/internal/health/lead-retrieval/provider-failure-spikes":
    "app/api/internal/health/lead-retrieval/provider-failure-spikes/route.ts",
  "/api/internal/health/lead-retrieval/job-cron-freshness":
    "app/api/internal/health/lead-retrieval/job-cron-freshness/route.ts"
};

function headers(values: Record<string, string>) {
  const normalized = new Map(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    get(name: string) {
      return normalized.get(name.toLowerCase()) ?? null;
    }
  };
}

describe("Lead Retrieval internal health signing contract", () => {
  it("uses one exact path allowlist for all eight LR health endpoints", () => {
    assert.deepEqual(LEAD_RETRIEVAL_INTERNAL_HEALTH_PATHS, [
      "/api/internal/health/lead-retrieval/conversation-lifecycle",
      "/api/internal/health/lead-retrieval/capture-recording-ingestion",
      "/api/internal/health/lead-retrieval/workflow-waits",
      "/api/internal/health/lead-retrieval/access-readiness",
      "/api/internal/health/lead-retrieval/campaign-readiness",
      "/api/internal/health/lead-retrieval/invite-license-seat-access",
      "/api/internal/health/lead-retrieval/provider-failure-spikes",
      "/api/internal/health/lead-retrieval/job-cron-freshness"
    ]);

    for (const pathname of LEAD_RETRIEVAL_INTERNAL_HEALTH_PATHS) {
      assert.equal(isLeadRetrievalInternalHealthPath(pathname), true);
      assert.equal(isLeadRetrievalInternalHealthPath(`${pathname}/extra`), false);
    }
  });

  it("accepts valid timestamp/path signatures and rejects invalid signatures for all endpoints", () => {
    for (const pathname of LEAD_RETRIEVAL_INTERNAL_HEALTH_PATHS) {
      const signature = signInternalHealthPath({
        secret: SECRET,
        timestamp: TIMESTAMP,
        pathname
      });

      assert.deepEqual(
        authorizeInternalHealthRequest({
          headers: headers({
            "x-internal-health-timestamp": TIMESTAMP,
            "x-internal-health-signature": signature
          }),
          pathname,
          secret: SECRET,
          nowMs: Number(TIMESTAMP)
        }),
        { ok: true },
        pathname
      );

      assert.deepEqual(
        authorizeInternalHealthRequest({
          headers: headers({
            "x-internal-health-timestamp": TIMESTAMP,
            "x-internal-health-signature": signature
          }),
          pathname: `${pathname}/extra`,
          secret: SECRET,
          nowMs: Number(TIMESTAMP)
        }),
        { ok: false, reason: "invalid_signature" },
        pathname
      );
    }
  });

  it("routes share the LR health auth helper before creating DB clients", () => {
    for (const routePath of Object.values(ROUTES_BY_PATH)) {
      const route = readFileSync(join(process.cwd(), routePath), "utf8");
      assert.match(route, /export async function GET/);
      assert.doesNotMatch(route, /export async function POST|export async function PUT|export async function DELETE/);
      assert.ok(
        route.indexOf("authorizeLeadRetrievalInternalHealthRequest") <
          route.indexOf("createAdminClient"),
        `${routePath} should validate signing before DB access`
      );
    }
  });

  it("middleware bypasses user-session auth only through the shared exact LR health predicate", () => {
    const source = readFileSync(join(process.cwd(), "lib/supabase/middleware.ts"), "utf8");

    assert.match(source, /isLeadRetrievalInternalHealthPath\(pathname\)/);
    assert.doesNotMatch(source, /pathname\.startsWith\("\/api\/internal\/health\/lead-retrieval/);
  });
});
