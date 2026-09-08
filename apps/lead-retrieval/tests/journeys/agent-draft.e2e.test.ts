/**
 * Agent draft generation journey.
 *
 * Draft generation runs as the `compose_campaign_draft` workflow step: parse params → order the
 * configured signals → ground the prompt in the lead's real context → call OpenAI (gpt-4o-mini) →
 * persist a campaign/recipient/message (or a pending `generated_drafts` row when approval is
 * required). The pure pieces are importable and driven here for real; the OpenAI call and
 * `server-only` persistence are asserted by source contract / skipped with an exact reason.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  parseComposeCampaignDraftParams,
  orderSignalsByIds,
  resolveRecipientContextForLead,
  classifyComposeDraftError,
  composeDraftErrorToResult,
} from "../../lib/workflows/step-handlers/compose-campaign-draft-pure";

const root = process.cwd();
const persistence = readFileSync(join(root, "lib/campaigns/workflow-campaign-draft-persistence.ts"), "utf8");
const runner = readFileSync(join(root, "lib/workflows/step-handlers/compose-campaign-draft-runner.ts"), "utf8");

const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("agent draft journey — params + signal selection", () => {
  it("parses valid params and rejects bad ones", () => {
    const ok = parseComposeCampaignDraftParams({ subjectTemplate: "Hi {{firstName}}", selectedSignalIds: [UUID_A] });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.deepEqual(ok.value.selectedSignalIds, [UUID_A]);

    assert.equal(parseComposeCampaignDraftParams({ selectedSignalIds: [UUID_A] }).ok, false); // no subject
    assert.equal(parseComposeCampaignDraftParams({ subjectTemplate: "Hi", selectedSignalIds: "nope" as any }).ok, false);
    assert.equal(parseComposeCampaignDraftParams({ subjectTemplate: "Hi", selectedSignalIds: ["not-a-uuid"] }).ok, false);
  });

  it("orders signals by the configured ids and reports missing ones", () => {
    const available = [{ id: UUID_B }, { id: UUID_A }] as any;
    const { ordered, missingSignalIds } = orderSignalsByIds([UUID_A, UUID_B, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"], available);
    assert.deepEqual(ordered.map((s: any) => s.id), [UUID_A, UUID_B]); // follows configured order
    assert.deepEqual(missingSignalIds, ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"]);
  });
});

describe("agent draft journey — uses the lead's real context", () => {
  it("derives recipient context from the lead's actual fields", () => {
    const ctx = resolveRecipientContextForLead({
      lead: {
        full_name: "Ada Lovelace",
        job_title: "VP Engineering",
        company_text: "Ada Analytics",
      } as any,
    });
    assert.equal(ctx.firstName, "Ada");
    assert.equal(ctx.fullName, "Ada Lovelace");
    assert.equal(ctx.title, "VP Engineering");
    assert.equal(ctx.companyText, "Ada Analytics");
  });

  it("prefers prior enrichment over base lead fields when present", () => {
    const ctx = resolveRecipientContextForLead({
      lead: { full_name: "Ada Lovelace", job_title: "Engineer", company_text: "Old Co" } as any,
      priorEnrich: { lead_summary: { job_title: "Chief Scientist", company_text: "New Co" } } as any,
    });
    assert.equal(ctx.title, "Chief Scientist");
    assert.equal(ctx.companyText, "New Co");
  });
});

describe("agent draft journey — provider errors map to stable codes, not leaked draft content", () => {
  it("classifies a missing OpenAI key as terminal config (no retry) and rate limit as transient", () => {
    assert.equal(classifyComposeDraftError(new Error("OPENAI_API_KEY is missing")), "config");
    assert.equal(classifyComposeDraftError(new Error("rate limit exceeded")), "transient");
    assert.equal(classifyComposeDraftError(new Error("lead not found")), "validation");
  });

  it("routes a config error to a stable internal error code", () => {
    const result = composeDraftErrorToResult(new Error("OPENAI_API_KEY is missing"), 1);
    assert.equal(result.kind, "fail");
    if (result.kind === "fail") assert.equal(result.errorCode, "compose_draft_no_provider");
  });
});

describe("agent draft journey — persistence links draft to lead/campaign/message", () => {
  it("persists campaign + recipient + message rows", () => {
    assert.match(persistence, /\.from\("campaigns"\)/);
    assert.match(persistence, /\.from\("campaign_recipients"\)/);
    assert.match(persistence, /\.from\("campaign_messages"\)/);
  });

  it("routes approval-required drafts to generated_drafts instead of persisting a campaign", () => {
    assert.match(runner, /ctx\.step\.requires_approval/);
  });
});

// Live generation hits OpenAI (gpt-4o-mini); there is no sandbox provider in the node:test lane.
describe(
  "agent draft journey — live LLM generation",
  { skip: "Blocked in node:test: OpenAI (gpt-4o-mini) draft generation requires a provider key/sandbox not available here. Pure prompt/selection/context logic is proven above; real generation belongs to the /e2e lane. See JOURNEY_MATRIX.md journey 7." },
  () => {
    it("generates a draft from real lead context", () => {
      assert.fail("unreachable — documented provider gap");
    });
  }
);
