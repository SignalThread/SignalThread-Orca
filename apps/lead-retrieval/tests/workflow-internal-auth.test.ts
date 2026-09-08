import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { authorizeInternalWorkerRequest } from "../lib/workflows/runner/internal-auth";

const SECRET = "s3cret-token-with-some-length";

describe("authorizeInternalWorkerRequest", () => {
  it("rejects when expected secret is unset (worker fails closed)", () => {
    const r = authorizeInternalWorkerRequest("Bearer anything", "");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "missing_secret_env");

    const r2 = authorizeInternalWorkerRequest("Bearer anything", [null, "", "   "]);
    assert.equal(r2.ok, false);
    if (!r2.ok) assert.equal(r2.reason, "missing_secret_env");
  });

  it("rejects when authorization header is missing", () => {
    assert.deepEqual(authorizeInternalWorkerRequest(null, SECRET), {
      ok: false,
      reason: "missing_header"
    });
    assert.deepEqual(authorizeInternalWorkerRequest("", SECRET), {
      ok: false,
      reason: "missing_header"
    });
    assert.deepEqual(authorizeInternalWorkerRequest("   ", SECRET), {
      ok: false,
      reason: "missing_header"
    });
  });

  it("rejects non-bearer schemes", () => {
    assert.deepEqual(authorizeInternalWorkerRequest(`Basic ${SECRET}`, SECRET), {
      ok: false,
      reason: "invalid_token"
    });
  });

  it("rejects mismatched tokens of equal length", () => {
    const wrong = "x".repeat(SECRET.length);
    assert.deepEqual(authorizeInternalWorkerRequest(`Bearer ${wrong}`, SECRET), {
      ok: false,
      reason: "invalid_token"
    });
  });

  it("rejects tokens of different length without leaking via length", () => {
    assert.deepEqual(authorizeInternalWorkerRequest(`Bearer ${SECRET}x`, SECRET), {
      ok: false,
      reason: "invalid_token"
    });
    assert.deepEqual(authorizeInternalWorkerRequest(`Bearer ${SECRET.slice(0, -1)}`, SECRET), {
      ok: false,
      reason: "invalid_token"
    });
  });

  it("accepts a valid bearer (case-insensitive scheme)", () => {
    assert.deepEqual(authorizeInternalWorkerRequest(`Bearer ${SECRET}`, SECRET), { ok: true });
    assert.deepEqual(authorizeInternalWorkerRequest(`bearer ${SECRET}`, SECRET), { ok: true });
    assert.deepEqual(authorizeInternalWorkerRequest(`BEARER ${SECRET}`, SECRET), { ok: true });
  });

  it("accepts either the workflow kick secret or Vercel CRON_SECRET bearer", () => {
    const workflowSecret = "workflow-secret";
    const cronSecret = "vercel-cron-secret";

    assert.deepEqual(
      authorizeInternalWorkerRequest(`Bearer ${workflowSecret}`, [workflowSecret, cronSecret]),
      { ok: true }
    );
    assert.deepEqual(
      authorizeInternalWorkerRequest(`Bearer ${cronSecret}`, [workflowSecret, cronSecret]),
      { ok: true }
    );
    assert.deepEqual(
      authorizeInternalWorkerRequest("Bearer public", [workflowSecret, cronSecret]),
      { ok: false, reason: "invalid_token" }
    );
  });

  it("middleware lets only exact signed internal API paths bypass user-session auth", () => {
    const source = readFileSync(join(process.cwd(), "lib/supabase/middleware.ts"), "utf8");

    assert.match(source, /INTERNAL_WORKFLOW_TICK_PATH\s*=\s*"\/api\/internal\/workflow-tick"/);
    assert.match(source, /isLeadRetrievalInternalHealthPath\(pathname\)/);
    assert.match(source, /isApiRoute && pathname === INTERNAL_WORKFLOW_TICK_PATH/);
    assert.doesNotMatch(source, /pathname\.startsWith\("\/api\/internal/);
  });

  it("workflow tick route keeps route-level internal auth and supports Vercel Cron secret", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/internal/workflow-tick/route.ts"),
      "utf8"
    );

    assert.match(source, /authorizeInternalWorkerRequest\(/);
    assert.match(source, /process\.env\.WORKFLOW_TICK_SECRET/);
    assert.match(source, /process\.env\.CRON_SECRET/);
    assert.match(source, /return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/);
    assert.match(source, /export async function GET/);
    assert.match(source, /export async function POST/);
  });
});
