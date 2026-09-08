import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const OUTBOUND_WEBHOOK_PROVIDERS = ["make", "n8n"] as const;
export type OutboundWebhookProvider = (typeof OUTBOUND_WEBHOOK_PROVIDERS)[number];

export const OUTBOUND_WEBHOOK_PAYLOAD_TEMPLATES = [
  "lead_core",
  "lead_with_insights",
  "conversation_snapshot",
] as const;
export type OutboundWebhookPayloadTemplate = (typeof OUTBOUND_WEBHOOK_PAYLOAD_TEMPLATES)[number];

export const OUTBOUND_WEBHOOK_TRIGGER_EVENTS = [
  "lead_created",
  "lead_updated",
  "lead_scored",
  "conversation_completed",
] as const;
export type OutboundWebhookTriggerEvent = (typeof OUTBOUND_WEBHOOK_TRIGGER_EVENTS)[number];

const VALID_OUTBOUND_PAYLOAD_TEMPLATES = new Set<string>(OUTBOUND_WEBHOOK_PAYLOAD_TEMPLATES);
const VALID_OUTBOUND_TRIGGER_EVENTS = new Set<string>(OUTBOUND_WEBHOOK_TRIGGER_EVENTS);

export type SetupIntegrationParams = {
  accountId: string;
  provider: OutboundWebhookProvider;
  webhookUrl: string;
  payloadTemplate: string;
  triggerEvents: string[];
  isEnabled: boolean;
  supabase?: ReturnType<typeof createAdminClient>;
};

function normalizeText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : "";
}

export function isValidOutboundPayloadTemplate(value: string) {
  return VALID_OUTBOUND_PAYLOAD_TEMPLATES.has(normalizeText(value));
}

export function areValidOutboundTriggerEvents(values: string[]) {
  return values.every((value) => VALID_OUTBOUND_TRIGGER_EVENTS.has(normalizeText(value)));
}

export function isOutboundWebhookProvider(value: string): value is OutboundWebhookProvider {
  return OUTBOUND_WEBHOOK_PROVIDERS.includes(value as OutboundWebhookProvider);
}

export async function setupIntegration(params: SetupIntegrationParams) {
  const accountId = normalizeText(params.accountId);
  const webhookUrl = normalizeText(params.webhookUrl);
  const payloadTemplate = normalizeText(params.payloadTemplate);
  const triggerEvents = Array.from(new Set(params.triggerEvents.map((value) => normalizeText(value)).filter(Boolean)));

  const supabase = params.supabase ?? createAdminClient();
  const { error } = await (supabase as any)
    .from("integrations")
    .upsert(
      {
        account_id: accountId,
        provider: params.provider,
        access_token: webhookUrl,
        provider_account_id: payloadTemplate,
        refresh_token: params.isEnabled ? "enabled" : "disabled",
        scope: triggerEvents,
        expires_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,provider" }
    );

  return { error };
}

export async function disableIntegration(
  accountId: string,
  provider: OutboundWebhookProvider,
  options?: { supabase?: ReturnType<typeof createAdminClient> }
) {
  const supabase = options?.supabase ?? createAdminClient();
  const { error } = await (supabase as any)
    .from("integrations")
    .update({
      refresh_token: "disabled",
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", normalizeText(accountId))
    .eq("provider", provider);

  return { error };
}
