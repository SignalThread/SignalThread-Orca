import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type IntegrationStatusRow = {
  provider: string | null;
  account_id: string | null;
  access_token: string | null;
  provider_account_id: string | null;
  refresh_token: string | null;
  scope: string[] | null;
};

type CompanyZapierRow = {
  zapier_webhook_url: string | null;
};

type IntegrationStatusError = {
  message: string;
  code?: string;
} | null;

export type IntegrationStatus = {
  provider: string;
  row: IntegrationStatusRow | null;
  exists: boolean;
  connected: boolean;
  configured: boolean;
  enabled: boolean;
  triggerEvents: string[];
  webhookUrl: string | null;
  payloadTemplate: string | null;
};

function normalizeText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseEnabled(refreshToken: string | null | undefined) {
  const normalized = normalizeText(refreshToken)?.toLowerCase();
  if (!normalized) return true;
  return normalized !== "disabled";
}

function parseScope(scope: string[] | null | undefined) {
  if (!Array.isArray(scope)) return [] as string[];
  return scope.map((value) => String(value ?? "").trim()).filter(Boolean);
}

function findRow(rows: IntegrationStatusRow[] | null | undefined, provider: string) {
  if (!Array.isArray(rows)) return null;
  const normalizedProvider = provider.trim().toLowerCase();
  return (
    rows.find((row) => String(row.provider ?? "").trim().toLowerCase() === normalizedProvider) ?? null
  );
}

function buildStatus(provider: string, row: IntegrationStatusRow | null, zapierWebhookUrl: string | null): IntegrationStatus {
  const normalizedProvider = provider.trim().toLowerCase();

  if (normalizedProvider === "zapier") {
    const hasWebhook = Boolean(normalizeText(zapierWebhookUrl));
    return {
      provider: normalizedProvider,
      row,
      exists: hasWebhook,
      connected: hasWebhook,
      configured: hasWebhook,
      enabled: hasWebhook,
      triggerEvents: [],
      webhookUrl: normalizeText(zapierWebhookUrl),
      payloadTemplate: null,
    };
  }

  const hasRow = Boolean(row);
  const webhookUrl = normalizeText(row?.access_token);
  const payloadTemplate = normalizeText(row?.provider_account_id);
  const isOutboundWebhookProvider = normalizedProvider === "make" || normalizedProvider === "n8n";

  const configured = isOutboundWebhookProvider
    ? Boolean(webhookUrl) && Boolean(payloadTemplate)
    : hasRow;

  return {
    provider: normalizedProvider,
    row,
    exists: hasRow,
    connected: configured,
    configured,
    enabled: isOutboundWebhookProvider ? parseEnabled(row?.refresh_token) : hasRow,
    triggerEvents: parseScope(row?.scope),
    webhookUrl,
    payloadTemplate,
  };
}

export async function getIntegrationStatus(
  accountId: string,
  provider: string,
  options?: {
    supabase?: ReturnType<typeof createAdminClient>;
    integrationRows?: IntegrationStatusRow[] | null;
    zapierWebhookUrl?: string | null;
  }
): Promise<{ status: IntegrationStatus; error: IntegrationStatusError }> {
  const normalizedAccountId = String(accountId ?? "").trim();
  const normalizedProvider = String(provider ?? "").trim().toLowerCase();

  if (!normalizedAccountId || !normalizedProvider) {
    return {
      status: buildStatus(normalizedProvider || provider, null, null),
      error: { message: "Missing account or provider." },
    };
  }

  const rowFromOptions = findRow(options?.integrationRows, normalizedProvider);
  const shouldQueryIntegrations = !options?.integrationRows;
  const shouldQueryZapier = normalizedProvider === "zapier" && options?.zapierWebhookUrl === undefined;

  if (!shouldQueryIntegrations && !shouldQueryZapier) {
    return {
      status: buildStatus(normalizedProvider, rowFromOptions, options?.zapierWebhookUrl ?? null),
      error: null,
    };
  }

  const supabase = options?.supabase ?? createAdminClient();
  let row = rowFromOptions;
  let zapierWebhookUrl = options?.zapierWebhookUrl ?? null;

  if (shouldQueryIntegrations) {
    const { data, error } = await (supabase as any)
      .from("integrations")
      .select("provider, account_id, access_token, provider_account_id, refresh_token, scope")
      .eq("account_id", normalizedAccountId)
      .eq("provider", normalizedProvider)
      .maybeSingle();

    if (error) {
      return {
        status: buildStatus(normalizedProvider, null, zapierWebhookUrl),
        error: { message: error.message ?? "Failed loading integration status.", code: error.code },
      };
    }

    row = (data as IntegrationStatusRow | null) ?? null;
  }

  if (shouldQueryZapier) {
    const { data, error } = await (supabase as any)
      .from("companies")
      .select("zapier_webhook_url")
      .eq("id", normalizedAccountId)
      .maybeSingle();

    if (error) {
      return {
        status: buildStatus(normalizedProvider, row, null),
        error: { message: error.message ?? "Failed loading integration status.", code: error.code },
      };
    }

    const companyRow = (data as CompanyZapierRow | null) ?? null;
    zapierWebhookUrl = companyRow?.zapier_webhook_url ?? null;
  }

  return {
    status: buildStatus(normalizedProvider, row, zapierWebhookUrl),
    error: null,
  };
}
