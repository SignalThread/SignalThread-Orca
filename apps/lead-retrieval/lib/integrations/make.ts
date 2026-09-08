import "server-only";

import {
  OUTBOUND_WEBHOOK_TRIGGER_EVENTS,
  type OutboundWebhookPayloadTemplate as SharedPayloadTemplate,
  type OutboundWebhookProvider as SharedOutboundWebhookProvider,
  type OutboundWebhookTriggerEvent as SharedTriggerEvent,
} from "@/lib/integrations/outbound-webhook-config";
import { getIntegrationStatus } from "@/lib/integrations/integration-status";
import { createAdminClient } from "@/lib/supabase/admin";

export type MakeTriggerEvent = SharedTriggerEvent;

export type OutboundWebhookProvider = SharedOutboundWebhookProvider;

type PayloadTemplate = SharedPayloadTemplate;

type MakeIntegrationRow = {
  account_id: string | null;
  access_token: string | null;
  provider_account_id: string | null;
  refresh_token: string | null;
  scope: string[] | null;
};

type MakeLeadRow = {
  id: string;
  company_id: string;
  full_name: string | null;
  email: string | null;
  job_title: string | null;
  company_text: string | null;
  rating: number | null;
  priority_score: number | null;
  follow_up_date: string | null;
  status: string | null;
  event_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ConversationSummaryRow = {
  summary: string | null;
  sentiment: string | null;
  objections: unknown;
  next_steps: unknown;
  created_at: string | null;
};

export type MakeWebhookDispatchResult = {
  attempted: boolean;
  delivered: boolean;
  status?: number;
  reason?: string;
  error?: string;
};

const VALID_TRIGGER_EVENTS: ReadonlySet<MakeTriggerEvent> = new Set(OUTBOUND_WEBHOOK_TRIGGER_EVENTS);

const EVENT_NAME_BY_TRIGGER: Record<MakeTriggerEvent, string> = {
  lead_created: "lead.created",
  lead_updated: "lead.updated",
  lead_scored: "lead.scored",
  conversation_completed: "conversation.completed",
};

function normalizeText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter((item): item is string => Boolean(item));
  }

  return [];
}

function parseIsEnabled(refreshToken: string | null | undefined) {
  const normalized = normalizeText(refreshToken)?.toLowerCase();
  if (!normalized) return true;
  return normalized !== "disabled";
}

function parsePayloadTemplate(rawTemplate: string | null | undefined): PayloadTemplate {
  const normalized = normalizeText(rawTemplate);
  if (normalized === "lead_with_insights" || normalized === "conversation_snapshot") {
    return normalized;
  }
  return "lead_core";
}

function parseTriggerEvents(rawScope: string[] | null | undefined): MakeTriggerEvent[] {
  if (!Array.isArray(rawScope)) return [];

  return rawScope
    .map((value) => normalizeText(value)?.toLowerCase())
    .filter((value): value is MakeTriggerEvent => Boolean(value && VALID_TRIGGER_EVENTS.has(value as MakeTriggerEvent)));
}

function maskWebhookUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const trimmedPath = parsed.pathname.replace(/^\/+/, "");
    const pathTail = trimmedPath.split("/").filter(Boolean).slice(-1)[0] ?? "";
    return `${parsed.origin}/.../${pathTail || "webhook"}`;
  } catch {
    return "invalid_url";
  }
}

function toLeadPayload(lead: MakeLeadRow) {
  return {
    id: lead.id,
    full_name: lead.full_name,
    email: lead.email,
    job_title: lead.job_title,
    company_text: lead.company_text,
    rating: lead.rating,
    priority_score: lead.priority_score,
    follow_up_date: lead.follow_up_date,
    status: lead.status,
    event_id: lead.event_id,
    created_at: lead.created_at,
    updated_at: lead.updated_at,
  };
}

async function loadLatestConversationSummary(
  supabase: ReturnType<typeof createAdminClient>,
  leadId: string
) {
  const { data, error } = await (supabase as any)
    .from("lead_conversations")
    .select("summary, sentiment, objections, next_steps, created_at")
    .eq("lead_id", leadId)
    .eq("synthesis_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[make-webhook] failed loading latest conversation summary", {
      leadId,
      error: error.message ?? "unknown_error",
    });
    return null;
  }

  return (data as ConversationSummaryRow | null) ?? null;
}

async function loadLead(
  supabase: ReturnType<typeof createAdminClient>,
  params: { accountId: string; leadId: string }
) {
  const { accountId, leadId } = params;
  const { data, error } = await (supabase as any)
    .from("leads")
    .select(
      "id, company_id, full_name, email, job_title, company_text, rating, priority_score, follow_up_date, status, event_id, created_at, updated_at"
    )
    .eq("id", leadId)
    .eq("company_id", accountId)
    .maybeSingle();

  if (error) {
    return { lead: null as MakeLeadRow | null, error: error.message ?? "Failed loading lead." };
  }

  return { lead: (data as MakeLeadRow | null) ?? null, error: null as string | null };
}

export function buildOutboundWebhookPayload(input: {
  accountId: string;
  trigger: MakeTriggerEvent;
  lead: MakeLeadRow;
  payloadTemplate: PayloadTemplate;
  conversationSummary: ConversationSummaryRow | null;
}) {
  const { accountId, trigger, lead, payloadTemplate, conversationSummary } = input;
  const payload: Record<string, unknown> = {
    event: EVENT_NAME_BY_TRIGGER[trigger],
    trigger,
    account_id: accountId,
    timestamp: new Date().toISOString(),
    payload_template: payloadTemplate,
    lead: toLeadPayload(lead),
  };

  if (payloadTemplate === "lead_with_insights" || payloadTemplate === "conversation_snapshot") {
    payload.ai_insights = {
      summary: conversationSummary?.summary ?? null,
      sentiment: conversationSummary?.sentiment ?? null,
      objections: toStringArray(conversationSummary?.objections),
      next_steps: toStringArray(conversationSummary?.next_steps),
    };
  }

  if (payloadTemplate === "conversation_snapshot") {
    payload.conversation_snapshot = {
      summary: conversationSummary?.summary ?? null,
      sentiment: conversationSummary?.sentiment ?? null,
      created_at: conversationSummary?.created_at ?? null,
    };
  }

  return payload;
}

export async function dispatchOutboundWebhook(params: {
  provider: OutboundWebhookProvider;
  accountId: string;
  trigger: MakeTriggerEvent;
  leadId: string;
  lead?: MakeLeadRow | null;
}): Promise<MakeWebhookDispatchResult> {
  const provider = params.provider;
  const logPrefix = `[${provider}-webhook]`;
  const accountId = normalizeText(params.accountId);
  const leadId = normalizeText(params.leadId);

  if (!accountId || !leadId) {
    return {
      attempted: false,
      delivered: false,
      reason: "missing_account_or_lead",
    };
  }

  console.info(`${logPrefix} trigger entered`, {
    accountId,
    provider,
    trigger: params.trigger,
    leadId,
  });

  const supabase = createAdminClient();
  const { status: integrationStatus, error: integrationStatusError } = await getIntegrationStatus(
    accountId,
    provider,
    { supabase }
  );
  const config = (integrationStatus.row as MakeIntegrationRow | null) ?? null;
  const configError = integrationStatusError?.message ?? null;

  if (configError) {
    console.error(`${logPrefix} failed loading config`, {
      accountId,
      provider,
      error: configError,
    });
    return {
      attempted: false,
      delivered: false,
      reason: "config_load_failed",
      error: configError,
    };
  }

  const webhookUrl = normalizeText(config?.access_token);
  const payloadTemplate = parsePayloadTemplate(config?.provider_account_id);
  const isEnabled = parseIsEnabled(config?.refresh_token);
  const configuredEvents = parseTriggerEvents(config?.scope);

  console.info(`${logPrefix} webhook config loaded`, {
    accountId,
    provider,
    hasConfig: Boolean(config),
    hasWebhookUrl: Boolean(webhookUrl),
    isEnabled,
    payloadTemplate,
    configuredEvents,
  });

  if (!config || !webhookUrl) {
    return {
      attempted: false,
      delivered: false,
      reason: "missing_webhook_config",
    };
  }

  if (!isEnabled) {
    return {
      attempted: false,
      delivered: false,
      reason: "integration_disabled",
    };
  }

  if (configuredEvents.length > 0 && !configuredEvents.includes(params.trigger)) {
    return {
      attempted: false,
      delivered: false,
      reason: "trigger_not_configured",
    };
  }

  const leadFromParams = params.lead ?? null;
  const { lead, error: leadLoadError } = leadFromParams
    ? { lead: leadFromParams, error: null as string | null }
    : await loadLead(supabase, { accountId, leadId });

  if (leadLoadError) {
    console.error(`${logPrefix} failed loading lead`, {
      accountId,
      provider,
      leadId,
      error: leadLoadError,
    });
    return {
      attempted: false,
      delivered: false,
      reason: "lead_load_failed",
      error: leadLoadError,
    };
  }

  if (!lead) {
    return {
      attempted: false,
      delivered: false,
      reason: "lead_not_found",
    };
  }

  const conversationSummary =
    payloadTemplate === "lead_core" ? null : await loadLatestConversationSummary(supabase, leadId);

  const webhookPayload = buildOutboundWebhookPayload({
    accountId,
    trigger: params.trigger,
    lead,
    payloadTemplate,
    conversationSummary,
  });

  console.info(`${logPrefix} POST attempted`, {
    accountId,
    provider,
    leadId,
    trigger: params.trigger,
    destination: maskWebhookUrl(webhookUrl),
  });

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webhookPayload),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      console.error(`${logPrefix} response error`, {
        accountId,
        provider,
        leadId,
        trigger: params.trigger,
        status: response.status,
        body: responseText.slice(0, 400),
      });
      return {
        attempted: true,
        delivered: false,
        status: response.status,
        reason: "non_2xx",
      };
    }

    console.info(`${logPrefix} response status`, {
      accountId,
      provider,
      leadId,
      trigger: params.trigger,
      status: response.status,
    });

    return {
      attempted: true,
      delivered: true,
      status: response.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook request failed.";
    console.error(`${logPrefix} POST failed`, {
      accountId,
      provider,
      leadId,
      trigger: params.trigger,
      error: message,
    });
    return {
      attempted: true,
      delivered: false,
      reason: "request_failed",
      error: message,
    };
  }
}

export async function dispatchOutboundLeadWebhooks(params: {
  accountId: string;
  trigger: MakeTriggerEvent;
  leadId: string;
  lead?: MakeLeadRow | null;
  providers?: OutboundWebhookProvider[];
}) {
  const providerList = params.providers && params.providers.length ? params.providers : (["make", "n8n"] as const);

  const results = await Promise.all(
    providerList.map(async (provider) => ({
      provider,
      result: await dispatchOutboundWebhook({
        provider,
        accountId: params.accountId,
        trigger: params.trigger,
        leadId: params.leadId,
        lead: params.lead,
      }),
    }))
  );

  return results;
}
