import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Route contract for the campaign builder draft-generation endpoint
 * (`POST /api/campaigns/[campaignId]/generate-draft`). The handler is auth/session-bound and
 * calls the LLM provider, so this proves auth/scope/validation and the provider boundary by
 * reading the canonical route source. Pure composer logic is covered by
 * workflow-compose-campaign-draft-pure.test.ts and signal-prompt-composer.test.ts.
 *
 * Provider boundary: draft generation calls generateLeadDraftWithLLM (OpenAI). This is browser/
 * route contract coverage — live LLM output is NOT exercised here (provider-gated canary needed).
 */
const src = readFileSync(
  join(process.cwd(), "app/api/campaigns/[campaignId]/generate-draft/route.ts"),
  "utf8"
);

describe("campaign generate-draft route — auth & tenant scope", () => {
  it("requires an authenticated session and a company", () => {
    assert.match(src, /const sessionUser = await getCurrentSessionUser\(\)/);
    assert.match(src, /if \(!sessionUser\)[\s\S]*?\{ error: "Unauthorized" \}, \{ status: 401 \}/);
    assert.match(src, /if \(!sessionUser\.company_id\)[\s\S]*?status: 400/);
  });

  it("scopes the campaign to the caller's company and 404s otherwise", () => {
    assert.match(src, /\.from\("campaigns"\)[\s\S]*?\.eq\("id", campaignId\)[\s\S]*?\.eq\("company_id", companyId\)/);
    assert.match(src, /if \(!campaign\)[\s\S]*?\{ error: "Campaign not found" \}, \{ status: 404 \}/);
  });

  it("scopes lead reads to the caller's company (no cross-tenant leads)", () => {
    // Both the eligibility check and the draft lead fetch pin company_id.
    const leadCompanyScopedCount = (src.match(/\.from\("leads"\)[\s\S]*?\.eq\("company_id", sessionUser\.company_id\)/g) ?? []).length;
    assert.ok(leadCompanyScopedCount >= 2, "lead reads must be company-scoped");
  });
});

describe("campaign generate-draft route — input validation", () => {
  it("rejects legacy inline signal payloads (only selectedSignalIds is supported)", () => {
    assert.match(src, /"selectedSignals" in \(payload as Record<string, unknown>\)/);
    assert.match(src, /Only selectedSignalIds is supported/);
  });

  it("requires selectedSignalIds to be a non-empty array of valid UUIDs", () => {
    assert.match(src, /if \(!Array\.isArray\(payload\.selectedSignalIds\)\)[\s\S]*?status: 400/);
    assert.match(src, /if \(selectedSignalIds\.length === 0\)[\s\S]*?status: 400/);
    assert.match(src, /invalidSignalIds[\s\S]*?isUuidLike/);
  });

  it("only uses active signals and rejects missing/inactive ones", () => {
    assert.match(src, /\.from\("signals"\)[\s\S]*?\.eq\("is_active", true\)/);
    assert.match(src, /missingSignalIds[\s\S]*?status: 400/);
  });

  it("enforces role-based signal visibility (platform_admin bypass, role_scope match)", () => {
    assert.match(src, /if \(role === "platform_admin"\)\s*\{\s*return \{ allowed: true as const \}/);
    assert.match(src, /if \(roleScope !== role\)\s*\{\s*return \{ allowed: false as const, reason: "role_mismatch" \}/);
    assert.match(src, /if \(usableSignalDefinitions\.length === 0\)[\s\S]*?status: 400/);
  });
});

describe("campaign generate-draft route — draft persistence & provider boundary", () => {
  it("persists generated messages as draft status via the canonical campaign_messages table", () => {
    assert.match(src, /\.from\("campaign_messages"\)\s*\.upsert\(/);
    assert.match(src, /status:\s*"draft" as const/);
  });

  it("calls the LLM draft generator (OpenAI provider boundary)", () => {
    assert.match(src, /generateLeadDraftWithLLM\(/);
    assert.match(src, /from "@\/lib\/campaigns\/llm-draft-generator"/);
  });
});
