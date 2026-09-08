import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  authorizeInternalHealthRequest,
  signInternalHealthPath,
} from "@/lib/internal-health/internal-health-auth";
import {
  getLeadRetrievalCampaignReadinessHealth,
  CRITICAL_DRAFT_FAILURE_COUNT,
  CRITICAL_MISSING_CONTENT_COUNT,
} from "@/lib/internal-health/lead-retrieval/campaign-readiness";
import { asAdminClient, createFakeSupabase } from "./helpers/fake-supabase";

const PATHNAME = "/api/internal/health/lead-retrieval/campaign-readiness";
const SECRET = "internal-health-secret";
const NOW = "2026-06-30T12:00:00.000Z";

function headers(values: Record<string, string>) {
  const normalized = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => normalized.get(name.toLowerCase()) ?? null };
}

const EMPTY = {
  workflow_step_runs: [],
  generated_drafts: [],
  campaigns: [],
  campaign_recipients: [],
  campaign_messages: [],
};

describe("campaign-readiness signing", () => {
  it("accepts a valid signature for this path", () => {
    const timestamp = "1782820800000";
    const signature = signInternalHealthPath({ secret: SECRET, timestamp, pathname: PATHNAME });
    assert.deepEqual(
      authorizeInternalHealthRequest({
        headers: headers({
          "x-internal-health-timestamp": timestamp,
          "x-internal-health-signature": signature,
        }),
        pathname: PATHNAME,
        secret: SECRET,
        nowMs: Number(timestamp),
      }),
      { ok: true }
    );
  });
});

describe("getLeadRetrievalCampaignReadinessHealth", () => {
  it("is healthy when drafts generate and recipients have messages", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      campaigns: [{ id: "campaign-1", status: "sent" }],
      generated_drafts: [{ approval_status: "approved", created_at: "2026-06-30T11:30:00.000Z" }],
      campaign_recipients: [{ id: "recipient-1", campaign_id: "campaign-1" }],
      campaign_messages: [
        { recipient_id: "recipient-1", status: "sent", body_text: "generated body", created_at: "2026-06-30T11:31:00.000Z" },
      ],
    });
    const health = await getLeadRetrievalCampaignReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.check, "campaign-readiness");
    assert.equal(health.source, "campaign-readiness");
    assert.equal(health.status, "healthy");
    assert.equal(health.metrics.generatedDraftsCreatedLast60m, 1);
    assert.equal(health.metrics.recipientsWithoutMessage, 0);
    assert.deepEqual(health.issues, []);
    assert.doesNotMatch(JSON.stringify(health), /generated body|recipient-1/);
  });

  it("marks draft generation broadly blocked as critical when nothing succeeds", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      workflow_step_runs: [
        ...Array.from({ length: CRITICAL_DRAFT_FAILURE_COUNT }, () => ({
          status: "failed",
          error_code: "compose_draft_no_provider",
          completed_at: "2026-06-30T11:40:00.000Z",
        })),
        // Non-draft failure must not count.
        { status: "failed", error_code: "enrich_failed", completed_at: "2026-06-30T11:41:00.000Z" },
      ],
    });
    const health = await getLeadRetrievalCampaignReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.draftGenerationFailuresLast60m, CRITICAL_DRAFT_FAILURE_COUNT);
    assert.equal(health.metrics.providerDraftFailuresLast60m, CRITICAL_DRAFT_FAILURE_COUNT);
    assert.equal(health.status, "critical");
    assert.ok(health.issues.some((i) => i.code === "campaign_draft_generation_failures" && i.severity === "critical"));
  });

  it("downgrades draft failures to warning when some drafts still generate", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      workflow_step_runs: Array.from({ length: CRITICAL_DRAFT_FAILURE_COUNT }, () => ({
        status: "failed",
        error_code: "compose_draft_transient",
        completed_at: "2026-06-30T11:40:00.000Z",
      })),
      generated_drafts: [{ approval_status: "approved", created_at: "2026-06-30T11:45:00.000Z" }],
    });
    const health = await getLeadRetrievalCampaignReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.generatedDraftsCreatedLast60m, 1);
    assert.equal(health.status, "warning");
    assert.ok(health.issues.some((i) => i.code === "campaign_draft_generation_failures" && i.severity === "warning"));
  });

  it("marks many messages missing generated content as critical", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      campaign_messages: Array.from({ length: CRITICAL_MISSING_CONTENT_COUNT }, (_, i) => ({
        recipient_id: `r-${i}`,
        status: "draft",
        body_text: null,
        created_at: "2026-06-30T11:50:00.000Z",
      })),
    });
    const health = await getLeadRetrievalCampaignReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.messagesMissingContent, CRITICAL_MISSING_CONTENT_COUNT);
    assert.ok(health.issues.some((i) => i.code === "campaign_messages_missing_content" && i.severity === "critical"));
  });

  it("warns on stale pending approval drafts without going critical", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      generated_drafts: [{ approval_status: "pending", created_at: "2026-06-28T11:00:00.000Z" }],
    });
    const health = await getLeadRetrievalCampaignReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.pendingApprovalDrafts, 1);
    assert.equal(health.metrics.staleApprovalDrafts, 1);
    assert.equal(health.status, "warning");
    assert.ok(!health.issues.some((i) => i.severity === "critical"));
  });

  it("warns on campaign recipients without a generated message", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      campaigns: [{ id: "campaign-sent", status: "sent" }],
      campaign_recipients: [
        { id: "r-1", campaign_id: "campaign-sent" },
        { id: "r-2", campaign_id: "campaign-sent" },
      ],
      campaign_messages: [{ recipient_id: "r-1", status: "sent", body_text: "x", created_at: "2026-06-30T11:30:00.000Z" }],
    });
    const health = await getLeadRetrievalCampaignReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.totalCampaignRecipients, 2);
    assert.equal(health.metrics.recipientsWithoutMessage, 1);
    assert.equal(health.status, "warning");
  });

  it("does not warn on draft campaign recipients before messages are generated", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      campaigns: [{ id: "campaign-draft", status: "draft" }],
      campaign_recipients: [
        { id: "r-1", campaign_id: "campaign-draft" },
        { id: "r-2", campaign_id: "campaign-draft" },
      ],
      campaign_messages: [],
    });
    const health = await getLeadRetrievalCampaignReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.totalCampaignRecipients, 2);
    assert.equal(health.metrics.recipientsWithoutMessage, 0);
    assert.equal(health.status, "healthy");
    assert.ok(!health.issues.some((i) => i.code === "campaign_recipients_without_message"));
  });

  it("route contract: GET only, authenticates before DB, no content columns selected", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/internal/health/lead-retrieval/campaign-readiness/route.ts"),
      "utf8"
    );
    const service = readFileSync(
      join(process.cwd(), "lib/internal-health/lead-retrieval/campaign-readiness.ts"),
      "utf8"
    );
    assert.match(route, /export async function GET/);
    assert.doesNotMatch(route, /export async function POST|export async function PUT|export async function DELETE/);
    assert.ok(route.indexOf("authorizeLeadRetrievalInternalHealthRequest") < route.indexOf("createAdminClient"));
    assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(/);
    assert.doesNotMatch(service, /select:\s*"[^"]*\b(body_text|body_html|subject|subject_line|draft_body_text)\b[^"]*"/);
  });
});
