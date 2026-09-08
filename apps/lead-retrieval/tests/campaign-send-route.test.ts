import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Route contract for the campaign send endpoint (`POST /api/campaigns/[campaignId]/send`).
 * The handler is auth/session-bound and delegates to the canonical `executeCampaignSend` service.
 * This proves the route-level role/scope gate and the result-code → HTTP mapping. The send
 * service's state machine (CAS lock, double-send dedupe, recipients/content requirements,
 * provider id) is covered by tests/journeys/draft-send.e2e.test.ts and campaign-send-status.test.ts.
 *
 * Provider boundary: real SendGrid delivery is NOT exercised (send route contract coverage;
 * SendGrid provider-gated canary still needed).
 */
const src = readFileSync(
  join(process.cwd(), "app/api/campaigns/[campaignId]/send/route.ts"),
  "utf8"
);

describe("campaign send route — role & scope gate", () => {
  it("only exhibitor_admin and platform_admin may send (viewer/other roles rejected)", () => {
    assert.match(src, /function canSendCampaigns\(role[^)]*\)\s*\{\s*return role === "exhibitor_admin" \|\| role === "platform_admin";/);
    assert.match(src, /if \(!canSendCampaigns\(sessionUser\.role\)\)[\s\S]*?\{ error: "Forbidden" \}, \{ status: 403 \}/);
  });

  it("requires authentication and a company before doing any send work", () => {
    assert.match(src, /if \(!sessionUser\)[\s\S]*?status: 401/);
    assert.match(src, /if \(!sessionUser\.company_id\)[\s\S]*?status: 400/);
    // Role gate is enforced before the campaign id / send call.
    const roleAt = src.indexOf("canSendCampaigns(sessionUser.role)");
    const sendAt = src.indexOf("executeCampaignSend(");
    assert.ok(roleAt >= 0 && sendAt >= 0 && roleAt < sendAt, "role must be checked before send");
  });

  it("passes the caller's company_id as the send scope (tenant isolation)", () => {
    assert.match(src, /executeCampaignSend\(\{[\s\S]*?campaignId,[\s\S]*?companyId:\s*sessionUser\.company_id/);
  });

  it("rejects a missing campaign id", () => {
    assert.match(src, /if \(!campaignId\)[\s\S]*?\{ error: "Missing campaign id" \}, \{ status: 400 \}/);
  });
});

describe("campaign send route — result state → HTTP mapping (safe handling)", () => {
  it("maps already-sent and in-progress campaigns to 409 (no double send)", () => {
    assert.match(src, /ALREADY_SENT:\s*409/);
    assert.match(src, /IN_PROGRESS:\s*409/);
  });

  it("maps nothing-to-send (no recipients/content) to 400 and not-found to 404", () => {
    assert.match(src, /NOTHING_TO_SEND:\s*400/);
    assert.match(src, /NOT_FOUND:\s*404/);
  });

  it("maps unauthorized send-scope to 403 and bad state to 500", () => {
    assert.match(src, /UNAUTHORIZED:\s*403/);
    assert.match(src, /BAD_STATE:\s*500/);
  });

  it("returns the send summary only when the service reports success", () => {
    assert.match(src, /if \(!result\.ok\)/);
    assert.match(src, /return NextResponse\.json\(\{ summary: result\.summary \}\)/);
  });
});
