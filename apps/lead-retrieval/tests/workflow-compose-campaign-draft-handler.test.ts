import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runComposeCampaignDraftStep,
  type ComposeCampaignDraftAdapters
} from "../lib/workflows/step-handlers/compose-campaign-draft-runner";
import type { WorkflowHandlerContext } from "../lib/workflows/contracts/step-handler";
import type {
  WorkflowRunRow,
  WorkflowStepRow,
  WorkflowStepRunRow
} from "../lib/workflows/contracts/workflow-types";
import type { SelectedSignalForGeneration } from "../lib/campaigns/signal-prompt-composer";
import type { DraftGenerationResult } from "../lib/campaigns/llm-draft-generator";

const UUID_AI_SUMMARY = "11111111-1111-4111-9111-111111111111";
const UUID_CONTEXT = "22222222-2222-4222-9222-222222222222";
const UUID_CTA = "33333333-3333-4333-9333-333333333333";

function makeCtx(overrides?: {
  params?: Record<string, unknown>;
  previousStepOutputs?: Record<string, Record<string, unknown> | null>;
  attemptCount?: number;
  requiresApproval?: boolean;
}): WorkflowHandlerContext {
  const run: WorkflowRunRow = {
    id: "run-1",
    company_id: "co-1",
    template_id: "tpl-1",
    template_version: 1,
    lead_id: "lead-1",
    event_id: "ev-1",
    trigger_event: "lead_captured",
    trigger_payload_jsonb: {},
    status: "running",
    current_step_index: 1,
    started_at: "2026-05-13T01:00:00Z",
    completed_at: null,
    created_at: "2026-05-13T01:00:00Z",
    updated_at: "2026-05-13T01:00:00Z"
  };
  const step: WorkflowStepRow = {
    id: "step-1",
    template_id: "tpl-1",
    step_index: 1,
    step_type: "compose_campaign_draft",
    step_key: "compose",
    params_jsonb: overrides?.params ?? {
      selectedSignalIds: [UUID_CONTEXT, UUID_CTA],
      subjectTemplate: "Following up - {{first_name}}",
      templateName: "Lead Intel"
    },
    requires_approval: overrides?.requiresApproval ?? true,
    created_at: "2026-05-13T01:00:00Z",
    updated_at: "2026-05-13T01:00:00Z"
  };
  const stepRun: WorkflowStepRunRow = {
    id: "step-run-1",
    run_id: "run-1",
    step_id: "step-1",
    step_index: 1,
    step_key: "compose",
    status: "running",
    attempt_count: overrides?.attemptCount ?? 1,
    attempt_id: "att-1",
    scheduled_at: "2026-05-13T01:00:00Z",
    started_at: "2026-05-13T01:00:00Z",
    completed_at: null,
    input_jsonb: null,
    output_jsonb: null,
    error_text: null,
    error_code: null,
    created_at: "2026-05-13T01:00:00Z",
    updated_at: "2026-05-13T01:00:00Z"
  };

  return {
    run,
    step,
    stepRun,
    previousStepOutputs: overrides?.previousStepOutputs ?? {},
    abortSignal: new AbortController().signal
  };
}

type CapturedLlmCall = {
  selectedSignalIds: (string | null)[];
  selectedSignalPrompts: string[];
  subjectTemplate: string;
  templateName: string;
  recipientTitle: string;
  recipientCompanyText: string;
  senderName?: string | null;
};
type CapturedPersistCall = {
  companyId: string;
  leadId: string;
  subject: string;
  bodyText: string;
  selectedSignalIds: string[];
};

function makeAdapters(overrides?: Partial<ComposeCampaignDraftAdapters> & { captured?: CapturedLlmCall[] }): {
  adapters: ComposeCampaignDraftAdapters;
  captured: CapturedLlmCall[];
  persisted: CapturedPersistCall[];
} {
  const captured: CapturedLlmCall[] = overrides?.captured ?? [];
  const persisted: CapturedPersistCall[] = [];

  const adapters: ComposeCampaignDraftAdapters = {
    async loadLead(leadId) {
      return (
        overrides?.loadLead?.(leadId) ?? {
          id: leadId,
          full_name: "Ada Lovelace",
          email: "ada@example.com",
          job_title: "Engineer",
          enriched_job_title: null,
          enriched_company_size: null,
          enriched_industry: null,
          enriched_company_domain: null,
          company_text: null,
          event_id: "ev-1"
        }
      );
    },
    async loadEventName() {
      return overrides?.loadEventName ? overrides.loadEventName(null) : "Demo Conf";
    },
    async loadActiveSignals(ids) {
      if (overrides?.loadActiveSignals) return overrides.loadActiveSignals(ids);
      const all: SelectedSignalForGeneration[] = [
        { id: UUID_AI_SUMMARY, name: "Conversation Brief Agent", category: "AI_POWERED", defaultPromptText: "summary prompt", tone: [], visibility: "global", roleScope: null, templateScope: null },
        { id: UUID_CONTEXT, name: "Industry Trend", category: "CONTEXTUAL", defaultPromptText: "trend prompt", tone: [], visibility: "global", roleScope: null, templateScope: null },
        { id: UUID_CTA, name: "Book a call", category: "CALL_TO_ACTION", defaultPromptText: "cta prompt", tone: [], visibility: "global", roleScope: null, templateScope: null }
      ];
      return [...ids].map((id) => {
        const sig = all.find((s) => s.id === id);
        if (!sig) throw new Error("test bug: signal id not in fixture");
        return {
          id: sig.id ?? "",
          name: sig.name,
          category: sig.category ?? "",
          default_prompt: sig.defaultPromptText,
          admin_override_prompt: null,
          visibility: (sig.visibility as "global") ?? null,
          signal_scope: "event",
          company_id: "co-1",
          owner_user_id: null,
          role_scope: null,
          template_scope: null,
          tones: sig.tone,
          event_id: "ev-1",
          is_active: true
        };
      });
    },
    async loadConversationSummaryByLeadId(leadIds) {
      if (overrides?.loadConversationSummaryByLeadId) {
        return overrides.loadConversationSummaryByLeadId(leadIds);
      }
      return new Map(leadIds.map((id) => [id, "We chatted about analytical engines."]));
    },
    async loadInitiatorName() {
      return overrides?.loadInitiatorName ? overrides.loadInitiatorName() : "Sarah Meister";
    },
    async invokeLlm(input) {
      captured.push({
        selectedSignalIds: input.selectedSignals.map((s) => s.id),
        selectedSignalPrompts: input.selectedSignals.map((s) => s.defaultPromptText),
        subjectTemplate: input.subjectTemplate,
        templateName: input.templateName,
        recipientTitle: input.recipientContext.title,
        recipientCompanyText: input.recipientContext.companyText,
        senderName: input.senderName
      });
      if (overrides?.invokeLlm) return overrides.invokeLlm(input);
      return {
        subject: "Following up - Ada",
        body: "Hi Ada,\n\nGreat chatting yesterday.\n\nBest,\nMe",
        model: "gpt-test",
        promptPreview: "prompt-preview-text"
      } satisfies DraftGenerationResult;
    },
    async persistCampaignDraft(input) {
      persisted.push({
        companyId: input.companyId,
        leadId: input.leadId,
        subject: input.subject,
        bodyText: input.bodyText,
        selectedSignalIds: [...input.selectedSignalIds]
      });
      if (overrides?.persistCampaignDraft) return overrides.persistCampaignDraft(input);
      return {
        campaignId: "campaign-1",
        recipientId: "recipient-1",
        messageId: "message-1"
      };
    }
  };

  return { adapters, captured, persisted };
}

describe("runComposeCampaignDraftStep — params validation", () => {
  it("fails terminally on missing subjectTemplate", async () => {
    const { adapters } = makeAdapters();
    const result = await runComposeCampaignDraftStep({
      ctx: makeCtx({ params: { selectedSignalIds: [UUID_CONTEXT] } }),
      adapters
    });
    assert.equal(result.kind, "fail");
    if (result.kind === "fail") assert.equal(result.errorCode, "compose_draft_invalid_params");
  });

  it("fails terminally when no usable signals are found", async () => {
    const { adapters } = makeAdapters({
      loadActiveSignals: async () => []
    });
    const result = await runComposeCampaignDraftStep({
      ctx: makeCtx(),
      adapters
    });
    assert.equal(result.kind, "fail");
    if (result.kind === "fail") assert.equal(result.errorCode, "compose_draft_validation");
  });

  it("fails terminally when run has no lead_id", async () => {
    const { adapters } = makeAdapters();
    const ctx = makeCtx();
    ctx.run.lead_id = "";
    const result = await runComposeCampaignDraftStep({ ctx, adapters });
    assert.equal(result.kind, "fail");
    if (result.kind === "fail") assert.equal(result.errorCode, "compose_draft_missing_lead_id");
  });

  it("succeeds with empty selectedSignalIds using lead context only", async () => {
    const { adapters, captured } = makeAdapters();
    const result = await runComposeCampaignDraftStep({
      ctx: makeCtx({
        params: {
          selectedSignalIds: [],
          subjectTemplate: "Hi {{first_name}}",
          templateName: "Lead Intel"
        }
      }),
      adapters
    });
    assert.equal(result.kind, "draft");
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0].selectedSignalIds, []);
  });
});

it("queued workflow generation retains its persisted initiator identity", async () => {
  const { adapters, captured } = makeAdapters({
    loadInitiatorName: async () => "Sarah Meister"
  });
  const result = await runComposeCampaignDraftStep({ ctx: makeCtx(), adapters });
  assert.equal(result.kind, "draft");
  assert.equal(captured[0]?.senderName, "Sarah Meister");
});

describe("runComposeCampaignDraftStep — ordered signal usage", () => {
  it("passes signals to the LLM in the exact order of selectedSignalIds, regardless of DB order", async () => {
    const { adapters, captured } = makeAdapters();
    const result = await runComposeCampaignDraftStep({
      ctx: makeCtx({
        params: {
          selectedSignalIds: [UUID_CTA, UUID_CONTEXT, UUID_AI_SUMMARY],
          subjectTemplate: "Hi {{first_name}}"
        }
      }),
      adapters
    });
    assert.equal(result.kind, "draft");
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0].selectedSignalIds, [UUID_CTA, UUID_CONTEXT, UUID_AI_SUMMARY]);
  });

  it("fails when any selected signal id is unavailable for the workflow event", async () => {
    const { adapters } = makeAdapters({
      loadActiveSignals: async (ids) => {
        // Only return the first id; the rest will appear as missing.
        const [first] = ids;
        return [
          {
            id: first,
            name: "Industry Trend",
            category: "CONTEXTUAL",
            default_prompt: "trend prompt",
            admin_override_prompt: null,
            visibility: "global",
            signal_scope: "event",
            company_id: "co-1",
            owner_user_id: null,
            role_scope: null,
            template_scope: null,
            tones: [],
            event_id: "ev-1",
            is_active: true
          }
        ];
      }
    });
    const result = await runComposeCampaignDraftStep({
      ctx: makeCtx({
        params: {
          selectedSignalIds: [UUID_CONTEXT, UUID_CTA, UUID_AI_SUMMARY],
          subjectTemplate: "Hi"
        }
      }),
      adapters
    });
    assert.equal(result.kind, "fail");
    if (result.kind === "fail") assert.equal(result.errorCode, "compose_draft_validation");
  });
});

describe("runComposeCampaignDraftStep — prior enrich consumption", () => {
  it("uses prior enrich_lead lead_summary fields over lead row enriched_* fields", async () => {
    const { adapters, captured } = makeAdapters({
      loadLead: async (id) => ({
        id,
        full_name: "Ada Lovelace",
        email: null,
        job_title: null,
        enriched_job_title: "Junior Dev",
        enriched_company_size: "1-10",
        enriched_industry: "Aerospace",
        enriched_company_domain: "stale.example.com",
        company_text: null,
        event_id: "ev-1"
      })
    });
    const result = await runComposeCampaignDraftStep({
      ctx: makeCtx({
        previousStepOutputs: {
          enrich: {
            outcome: "updated",
            enriched_fields: ["job_title", "company_text"],
            lead_summary: {
              job_title: "Principal Engineer",
              company_text: "Babbage Engines"
            }
          }
        }
      }),
      adapters
    });
    assert.equal(result.kind, "draft");
    assert.equal(captured[0].recipientTitle, "Principal Engineer");
    assert.equal(captured[0].recipientCompanyText, "Babbage Engines");
  });
});

describe("runComposeCampaignDraftStep — draft output shape", () => {
  it("returns a proposed email payload without creating the official draft when approval is required", async () => {
    const { adapters, persisted } = makeAdapters();
    const result = await runComposeCampaignDraftStep({
      ctx: makeCtx(),
      adapters
    });
    assert.equal(result.kind, "draft");
    if (result.kind !== "draft") return;
    assert.equal(result.drafts.length, 1);
    assert.equal(result.drafts[0].kind, "email");
    assert.equal(result.drafts[0].content.subject, "Following up - Ada");
    assert.ok(String(result.drafts[0].content.body_text).startsWith("Hi Ada,"));
    assert.equal(result.drafts[0].content.workflow_campaign_name, "Workflow Draft - Lead Intel - Ada Lovelace - run-1");
    assert.equal(result.drafts[0].content.campaign_id, null);
    assert.equal(result.drafts[0].content.campaign_message_id, null);
    assert.equal(result.output.outcome, "draft_pending_review");
    assert.equal(result.output.campaign_id, null);
    assert.equal(result.output.campaign_message_id, null);
    assert.equal(persisted.length, 0);
    // Hard rule: no raw provider payload in the step output.
    const outputKeys = Object.keys(result.output);
    for (const banned of ["raw_provider_payload", "provider_payload", "openai_response"]) {
      assert.equal(outputKeys.includes(banned), false);
    }
  });

  it("creates the official campaign draft immediately when approval is not required", async () => {
    const { adapters, persisted } = makeAdapters();
    const result = await runComposeCampaignDraftStep({
      ctx: makeCtx({ requiresApproval: false }),
      adapters
    });
    assert.equal(result.kind, "draft");
    if (result.kind !== "draft") return;
    assert.equal(result.drafts[0].content.campaign_id, "campaign-1");
    assert.equal(result.drafts[0].content.campaign_message_id, "message-1");
    assert.equal(result.output.outcome, "campaign_draft_created");
    assert.equal(result.output.campaign_id, "campaign-1");
    assert.equal(result.output.campaign_message_id, "message-1");
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].companyId, "co-1");
    assert.equal(persisted[0].leadId, "lead-1");
    assert.equal(persisted[0].subject, "Following up - Ada");
    assert.ok(persisted[0].bodyText.startsWith("Hi Ada,"));
    assert.deepEqual(persisted[0].selectedSignalIds, [UUID_CONTEXT, UUID_CTA]);
  });
});

describe("runComposeCampaignDraftStep — error paths", () => {
  it("retries on LLM rate limit at attempt 1", async () => {
    const { adapters } = makeAdapters({
      invokeLlm: async () => {
        throw new Error("Rate limit exceeded");
      }
    });
    const result = await runComposeCampaignDraftStep({
      ctx: makeCtx({ attemptCount: 1 }),
      adapters
    });
    assert.equal(result.kind, "retry");
  });

  it("fails terminally on config error (no provider key)", async () => {
    const { adapters } = makeAdapters({
      invokeLlm: async () => {
        throw new Error("OPENAI_API_KEY is missing");
      }
    });
    const result = await runComposeCampaignDraftStep({
      ctx: makeCtx(),
      adapters
    });
    assert.equal(result.kind, "fail");
    if (result.kind === "fail") assert.equal(result.errorCode, "compose_draft_no_provider");
  });
});

describe("runComposeCampaignDraftStep — Conversation Brief Agent integration", () => {
  it("uses a completed conversation summary when Conversation Brief Agent is selected", async () => {
    const { adapters, captured } = makeAdapters({
      loadConversationSummaryByLeadId: async (leadIds) =>
        new Map(leadIds.map((id) => [id, "Discussed lead routing and next steps."]))
    });
    const result = await runComposeCampaignDraftStep({
      ctx: makeCtx({
        params: {
          selectedSignalIds: [UUID_AI_SUMMARY, UUID_CONTEXT],
          subjectTemplate: "Hi"
        }
      }),
      adapters
    });
    assert.equal(result.kind, "draft");
    assert.deepEqual(captured[0]?.selectedSignalIds, [UUID_AI_SUMMARY, UUID_CONTEXT]);
    assert.equal(captured[0]?.selectedSignalPrompts[0], "Discussed lead routing and next steps.");
  });

  it("omits unavailable Conversation Brief context and still generates a draft", async () => {
    const { adapters, captured } = makeAdapters({
      loadConversationSummaryByLeadId: async (leadIds) =>
        new Map(leadIds.map((id) => [id, null]))
    });
    const result = await runComposeCampaignDraftStep({
      ctx: makeCtx({
        params: {
          selectedSignalIds: [UUID_AI_SUMMARY, UUID_CONTEXT],
          subjectTemplate: "Hi"
        }
      }),
      adapters
    });
    assert.equal(result.kind, "draft");
    assert.deepEqual(captured[0]?.selectedSignalIds, [UUID_CONTEXT]);
  });

  it("fails clearly only when the workflow explicitly requires conversation context", async () => {
    const { adapters } = makeAdapters({
      loadConversationSummaryByLeadId: async (leadIds) =>
        new Map(leadIds.map((id) => [id, null]))
    });
    const result = await runComposeCampaignDraftStep({
      ctx: makeCtx({
        params: {
          selectedSignalIds: [UUID_AI_SUMMARY, UUID_CONTEXT],
          requiredInputs: ["conversation_summary"],
          subjectTemplate: "Hi"
        }
      }),
      adapters
    });
    assert.equal(result.kind, "fail");
    if (result.kind === "fail") {
      assert.equal(result.errorCode, "compose_draft_validation");
      assert.match(result.errorText, /required by this workflow/i);
    }
  });
});
