/**
 * Draft send journey.
 *
 * Sending happens only through `executeCampaignSend` (a `server-only` service) → SendGrid. The
 * real final-status resolver is pure and driven here; the send service's locking, duplicate-send
 * guard, provider-id persistence, and provider gating are asserted by source contract; and the
 * workflow runtime must never auto-send. Real delivery is provider-gated and skipped.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveFinalCampaignStatus } from "../../lib/campaigns/campaign-send-status";

const root = process.cwd();
const sendService = readFileSync(join(root, "lib/campaigns/executeCampaignSend.ts"), "utf8");
const sendGrid = readFileSync(join(root, "lib/server/email/sendCampaignMail.ts"), "utf8");

describe("draft send journey — final status is truthful", () => {
  it("reports sent only when every recipient succeeded", () => {
    assert.equal(resolveFinalCampaignStatus({ sent: 2, failed: 0, skippedNoEmail: 0 }), "sent");
  });

  it("reports failed when any recipient failed, was skipped for no email, or none sent", () => {
    assert.equal(resolveFinalCampaignStatus({ sent: 1, failed: 1, skippedNoEmail: 0 }), "failed");
    assert.equal(resolveFinalCampaignStatus({ sent: 1, failed: 0, skippedNoEmail: 1 }), "failed");
    assert.equal(resolveFinalCampaignStatus({ sent: 0, failed: 0, skippedNoEmail: 0 }), "failed");
  });
});

describe("draft send journey — send service locks, dedupes, and records provider id", () => {
  it("locks the campaign via a draft|scheduled|failed → sending CAS update", () => {
    assert.match(sendService, /\.update\(\{ status: "sending" \}\)[\s\S]*\.in\("status", \["draft", "scheduled", "failed"\]\)/);
  });

  it("blocks a double-send when already sent or sending (idempotent)", () => {
    assert.match(sendService, /cur\.status === "sent"/);
    assert.match(sendService, /cur\.status === "sending"/);
  });

  it("records the provider message id and resolves the final status canonically", () => {
    assert.match(sendService, /provider_message_id: out\.providerMessageId/);
    assert.match(sendService, /resolveFinalCampaignStatus/);
  });
});

describe("draft send journey — provider is gated; workflows never auto-send", () => {
  it("SendGrid requires real credentials (no fake delivery without them)", () => {
    assert.match(sendGrid, /from "@sendgrid\/mail"/);
    assert.match(sendGrid, /SENDGRID_API_KEY/);
    assert.match(sendGrid, /Missing SENDGRID_API_KEY/);
  });

  it("the workflow compose runner does not import the send service or SendGrid", () => {
    const runner = readFileSync(join(root, "lib/workflows/step-handlers/compose-campaign-draft-runner.ts"), "utf8");
    assert.ok(!/executeCampaignSend/.test(runner), "workflow runtime must not import executeCampaignSend");
    assert.ok(!/@sendgrid|sendCampaignMail/.test(runner), "workflow runtime must not import the send transport");
  });
});

// Real delivery requires a configured SendGrid account; no sandbox transport exists in the
// node:test lane. The no-auto-send invariant is also enforced repo-wide by
// `workflow-no-auto-send-source-contract.test.ts`.
describe(
  "draft send journey — live send through the provider",
  { skip: "Blocked in node:test: SendGrid send requires SENDGRID_API_KEY/FROM and a real/sandbox transport not available here. Status resolution + send contract proven above; real send belongs to the /e2e lane. See JOURNEY_MATRIX.md journey 8." },
  () => {
    it("sends a draft and records sent_at/provider id", () => {
      assert.fail("unreachable — documented provider gap");
    });
  }
);
