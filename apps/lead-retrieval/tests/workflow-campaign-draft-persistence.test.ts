import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { persistWorkflowCampaignDraft } from "../lib/campaigns/workflow-campaign-draft-persistence";
import { createFakeSupabase, asAdminClient } from "./helpers/fake-supabase";
import type { createAdminClient } from "../lib/supabase/admin";

describe("persistWorkflowCampaignDraft", () => {
  it("creates a real campaign recipient and draft message", async () => {
    const fake = createFakeSupabase({
      campaigns: [],
      campaign_recipients: [],
      campaign_messages: []
    });

    const result = await persistWorkflowCampaignDraft({
      supabase: asAdminClient<ReturnType<typeof createAdminClient>>(fake),
      companyId: "co-1",
      leadId: "lead-1",
      campaignName: "Workflow Draft - Lead Intel - Ada - run-1",
      subject: "Following up - Ada",
      bodyText: "Hi Ada,\n\nGreat chatting.",
      bodyHtml: null,
      selectedSignalIds: ["sig-1", "sig-2", "sig-1"],
      subjectLine: "Following up - {{first_name}}",
      nowIso: "2026-06-11T12:00:00.000Z"
    });

    assert.ok(result.campaignId);
    assert.ok(result.recipientId);
    assert.ok(result.messageId);

    const campaigns = fake._tables.campaigns as Array<Record<string, unknown>>;
    assert.equal(campaigns.length, 1);
    assert.equal(campaigns[0].company_id, "co-1");
    assert.equal(campaigns[0].name, "Workflow Draft - Lead Intel - Ada - run-1");
    assert.equal(campaigns[0].status, "draft");
    assert.deepEqual(campaigns[0].selected_signals, ["sig-1", "sig-2"]);
    assert.equal(campaigns[0].draft_subject, "Following up - Ada");
    assert.equal(campaigns[0].draft_body_text, "Hi Ada,\n\nGreat chatting.");

    const recipients = fake._tables.campaign_recipients as Array<Record<string, unknown>>;
    assert.equal(recipients.length, 1);
    assert.equal(recipients[0].campaign_id, result.campaignId);
    assert.equal(recipients[0].lead_id, "lead-1");

    const messages = fake._tables.campaign_messages as Array<Record<string, unknown>>;
    assert.equal(messages.length, 1);
    assert.equal(messages[0].campaign_id, result.campaignId);
    assert.equal(messages[0].recipient_id, result.recipientId);
    assert.equal(messages[0].subject, "Following up - Ada");
    assert.equal(messages[0].body_text, "Hi Ada,\n\nGreat chatting.");
    assert.equal(messages[0].status, "draft");
  });

  it("reuses the workflow campaign on repeat and updates the existing draft message", async () => {
    const fake = createFakeSupabase({
      campaigns: [],
      campaign_recipients: [],
      campaign_messages: []
    });
    const supabase = asAdminClient<ReturnType<typeof createAdminClient>>(fake);

    const first = await persistWorkflowCampaignDraft({
      supabase,
      companyId: "co-1",
      leadId: "lead-1",
      campaignName: "Workflow Draft - Lead Intel - Ada - run-1",
      subject: "Subject one",
      bodyText: "Body one",
      selectedSignalIds: ["sig-1"]
    });
    const second = await persistWorkflowCampaignDraft({
      supabase,
      companyId: "co-1",
      leadId: "lead-1",
      campaignName: "Workflow Draft - Lead Intel - Ada - run-1",
      subject: "Subject two",
      bodyText: "Body two",
      selectedSignalIds: ["sig-1", "sig-2"]
    });

    assert.equal(second.campaignId, first.campaignId);
    assert.equal(second.recipientId, first.recipientId);
    assert.equal(second.messageId, first.messageId);
    assert.equal((fake._tables.campaigns as unknown[]).length, 1);
    assert.equal((fake._tables.campaign_recipients as unknown[]).length, 1);
    assert.equal((fake._tables.campaign_messages as unknown[]).length, 1);

    const message = fake._tables.campaign_messages[0] as Record<string, unknown>;
    assert.equal(message.subject, "Subject two");
    assert.equal(message.body_text, "Body two");
  });
});
