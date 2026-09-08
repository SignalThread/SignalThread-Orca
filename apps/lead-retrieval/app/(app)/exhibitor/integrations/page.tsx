import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { INTEGRATION_CATALOG } from "@/lib/config/integration-catalog";
import {
  getIntegrationStatus,
  type IntegrationStatusRow,
} from "@/lib/integrations/integration-status";
import { INTEGRATION_CONNECTION_ERROR_MARKER } from "@/lib/integrations/apollo/constants";
import { buildHubSpotConnectUrl } from "@/lib/integrations/hubspot/oauth";
import { IntegrationsCatalogClient } from "@/components/exhibitor/integrations-catalog-client";
import {
  getZoomInfoConnectionForCompany,
  toZoomInfoPublicStatus
} from "@/lib/server/integrations/zoominfo";
import {
  disconnectedGoogleWorkspaceStatus,
  getGoogleWorkspaceConnectionStatus
} from "@/lib/integrations/google/connection-status";
import {
  disconnectedMicrosoft365Status,
  getMicrosoft365ConnectionStatus,
} from "@/lib/integrations/microsoft/connection-status";
import {
  getPipedriveConnectionStatus,
  type PipedrivePublicConnectionStatus
} from "@/lib/integrations/pipedrive/connection-service";
import { getEmailProviderPreference } from "@/lib/integrations/email/provider-preference";
import { getDefaultSenderControlsState } from "@/lib/integrations/email/default-sender-controls";
import type { EmailProvider } from "@/lib/integrations/email/types";

const SALESFORCE_CONNECT_URL = "/api/integrations/salesforce/connect";

type CompanyIntegrationsRow = {
  zapier_webhook_url: string | null;
  default_enrichment_provider: string | null;
};

function formatOverviewTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ExhibitorIntegrationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    saved?: string;
    error?: string;
    reason?: string;
    pipedrive?: string;
    pipedrive_error?: string;
  }>;
}) {
  const sessionUser = await requireRole("exhibitor_admin");
  const accountId = sessionUser.company_id;
  const hubSpotConnectUrl = buildHubSpotConnectUrl({ accountId });
  const resolvedSearchParams = (await searchParams) ?? {};

  let lookupError: string | null = null;
  let integrationRows: IntegrationStatusRow[] = [];
  let companyZapierWebhookUrl: string | null = null;
  let companyDefaultEnrichmentProvider: string | null = null;
  let zoominfoPublic = toZoomInfoPublicStatus(null);
  let zoominfoRowUpdatedAt: string | null = null;
  let googleWorkspaceStatus = disconnectedGoogleWorkspaceStatus();
  let microsoft365Status = disconnectedMicrosoft365Status();
  let emailProviderPreference: EmailProvider | null = null;
  let pipedriveStatus: PipedrivePublicConnectionStatus = {
    exists: false,
    connected: false,
    status: "not_connected",
    accountId: null,
    accountName: null
  };

  if (accountId) {
    const supabase = createAdminClient();
    const [{ data, error }, { data: companyData, error: companyError }, zoominfoResult] = await Promise.all([
      (supabase as any)
        .from("integrations")
        .select("provider, access_token, provider_account_id")
        .eq("account_id", accountId),
      (supabase as any)
        .from("companies")
        .select("zapier_webhook_url, default_enrichment_provider")
        .eq("id", accountId)
        .maybeSingle(),
      getZoomInfoConnectionForCompany(accountId)
    ]);

    if (error || companyError) {
      lookupError = error?.message ?? companyError?.message ?? "Failed to load integration status.";
    } else {
      integrationRows = (data as IntegrationStatusRow[] | null) ?? [];
      const companyRow = (companyData as CompanyIntegrationsRow | null) ?? null;
      companyZapierWebhookUrl = companyRow?.zapier_webhook_url ?? null;
      companyDefaultEnrichmentProvider = companyRow?.default_enrichment_provider ?? null;
    }

    if (zoominfoResult.error) {
      lookupError = lookupError
        ? `${lookupError} ${zoominfoResult.error.message}`
        : zoominfoResult.error.message;
    } else {
      zoominfoPublic = toZoomInfoPublicStatus(zoominfoResult.row);
      zoominfoRowUpdatedAt = zoominfoResult.row?.updated_at ?? null;
    }

    try {
      googleWorkspaceStatus = await getGoogleWorkspaceConnectionStatus(sessionUser.id, accountId);
    } catch (error) {
      lookupError = lookupError
        ? `${lookupError} Unable to load Google Workspace status.`
        : error instanceof Error
          ? error.message
          : "Unable to load Google Workspace status.";
    }

    try {
      microsoft365Status = await getMicrosoft365ConnectionStatus(sessionUser.id, accountId);
    } catch (error) {
      lookupError = lookupError
        ? `${lookupError} Unable to load Microsoft 365 status.`
        : error instanceof Error
          ? error.message
          : "Unable to load Microsoft 365 status.";
    }

    try {
      emailProviderPreference = await getEmailProviderPreference({
        userId: sessionUser.id,
        companyId: accountId
      });
    } catch (error) {
      lookupError = lookupError
        ? `${lookupError} Unable to load email sender preference.`
        : error instanceof Error
          ? error.message
          : "Unable to load email sender preference.";
    }

    try {
      pipedriveStatus = await getPipedriveConnectionStatus(accountId);
    } catch (error) {
      lookupError = lookupError
        ? `${lookupError} Unable to load Pipedrive status.`
        : error instanceof Error
          ? error.message
          : "Unable to load Pipedrive status.";
    }
  }

  const cards = await Promise.all(INTEGRATION_CATALOG.map(async (integration) => {
    const { status } = accountId
      ? await getIntegrationStatus(accountId, integration.provider, {
          integrationRows,
          zapierWebhookUrl: companyZapierWebhookUrl,
        })
      : {
          status: {
            provider: integration.provider,
            row: null,
            exists: false,
            connected: false,
            configured: false,
            enabled: false,
            triggerEvents: [],
            webhookUrl: null,
            payloadTemplate: null,
          },
        };

    const rowForProvider =
      accountId && integrationRows.length > 0
        ? integrationRows.find(
            (row) => String(row.provider ?? "").trim().toLowerCase() === integration.provider.toLowerCase()
          ) ?? null
        : null;
    const hasStoredToken = Boolean(String(rowForProvider?.access_token ?? "").trim());
    const enrichmentConnectionFailed =
      Boolean(integration.isEnrichmentProvider) &&
      hasStoredToken &&
      rowForProvider?.provider_account_id === INTEGRATION_CONNECTION_ERROR_MARKER;

    let isConnected =
      integration.isEnrichmentProvider && accountId
        ? hasStoredToken && !enrichmentConnectionFailed
        : status.connected;
    let connectionStatus: "connected" | "not_connected" | "error" =
      integration.isEnrichmentProvider && accountId
        ? !hasStoredToken
          ? "not_connected"
          : enrichmentConnectionFailed
            ? "error"
            : "connected"
        : status.connected
          ? "connected"
          : "not_connected";

    if (integration.provider === "zoominfo") {
      isConnected = Boolean(zoominfoPublic.connected && zoominfoPublic.status === "connected");
      connectionStatus =
        zoominfoPublic.status === "error"
          ? "error"
          : isConnected
            ? "connected"
            : "not_connected";
    }

    if (integration.provider === "google_workspace") {
      isConnected = googleWorkspaceStatus.connected && !googleWorkspaceStatus.isPartialGrant;
      connectionStatus = isConnected
        ? "connected"
        : googleWorkspaceStatus.status === "disconnected"
          ? "not_connected"
          : "error";
    }

    if (integration.provider === "microsoft_365") {
      isConnected = microsoft365Status.connected && !microsoft365Status.isPartialGrant;
      connectionStatus = isConnected
        ? "connected"
        : microsoft365Status.status === "disconnected"
          ? "not_connected"
          : "error";
    }

    if (integration.provider === "pipedrive") {
      isConnected = pipedriveStatus.connected;
      connectionStatus = pipedriveStatus.exists
        ? pipedriveStatus.status
        : resolvedSearchParams.pipedrive_error
          ? "error"
          : "not_connected";
    }

    const resolvedConnectHref =
      integration.actionKey === "hubspot_oauth"
        ? hubSpotConnectUrl
        : integration.actionKey === "salesforce_oauth"
          ? SALESFORCE_CONNECT_URL
          : integration.connectRoute ?? null;

    const resolvedManageRoute =
      integration.provider === "hubspot" && isConnected
        ? "/exhibitor/integrations/hubspot"
        : integration.provider === "salesforce" && isConnected
          ? SALESFORCE_CONNECT_URL
          : integration.manageRoute ?? null;

    const zoominfoLastUpdated =
      integration.provider === "zoominfo" ? formatOverviewTimestamp(zoominfoRowUpdatedAt) : null;

    return {
      ...integration,
      status: connectionStatus,
      resolvedConnectHref,
      manageRoute: resolvedManageRoute,
      configured:
        integration.provider === "make" || integration.provider === "n8n"
          ? status.configured
          : true,
      enrichmentDefault:
        integration.isEnrichmentProvider && accountId
          ? {
              isDefault: companyDefaultEnrichmentProvider === integration.provider,
              canSetDefault: hasStoredToken && !enrichmentConnectionFailed,
              provider: integration.provider,
            }
          : undefined,
      overviewMeta:
        integration.provider === "zoominfo"
          ? {
              lastUpdatedLabel: zoominfoLastUpdated,
            }
          : integration.provider === "pipedrive"
            ? {
                lastUpdatedLabel: null,
                accountLabel: pipedriveStatus.accountName ?? pipedriveStatus.accountId,
                canDisconnect: pipedriveStatus.exists
              }
          : undefined,
    };
  }));

  const defaultSenderControls = getDefaultSenderControlsState({
    googleWorkspaceHealthy:
      googleWorkspaceStatus.connected &&
      googleWorkspaceStatus.status === "connected" &&
      googleWorkspaceStatus.capabilities.gmailSend,
    microsoft365Healthy:
      microsoft365Status.connected &&
      microsoft365Status.status === "connected" &&
      microsoft365Status.capabilities.mailSend,
    preference: emailProviderPreference,
  });

  return (
    <div className="space-y-4">
      {lookupError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700">
          {lookupError}
        </p>
      ) : null}
      {resolvedSearchParams.saved === "default" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
          Default enrichment provider updated.
        </p>
      ) : null}
      {resolvedSearchParams.pipedrive === "connected" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
          Pipedrive connected and verified.
        </p>
      ) : resolvedSearchParams.pipedrive === "disconnected" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
          Pipedrive disconnected.
        </p>
      ) : null}
      {resolvedSearchParams.pipedrive_error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700">
          {resolvedSearchParams.pipedrive_error === "access_denied"
            ? "Pipedrive authorization was cancelled."
            : resolvedSearchParams.pipedrive_error === "not_configured"
            ? "Pipedrive is not configured for this environment yet. Please contact support."
            : resolvedSearchParams.pipedrive_error === "invalid_state" ||
                resolvedSearchParams.pipedrive_error === "session_mismatch"
              ? "The Pipedrive authorization session was invalid or expired. Please try again."
              : resolvedSearchParams.pipedrive_error === "disconnect_failed"
                ? "Pipedrive could not be disconnected. Please try again."
                : "Pipedrive could not be connected. Please try again."}
        </p>
      ) : null}
      {resolvedSearchParams.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700">
          {resolvedSearchParams.error === "invalid_provider"
            ? "That enrichment provider is not valid."
            : resolvedSearchParams.error === "missing_account"
              ? "Your account context is missing."
              : resolvedSearchParams.error === "save_failed"
                ? `Could not set default enrichment provider.${
                    process.env.NODE_ENV !== "production" && resolvedSearchParams.reason
                      ? ` ${resolvedSearchParams.reason}`
                      : ""
                  }`
                : "Something went wrong."}
        </p>
      ) : null}
      <IntegrationsCatalogClient
        integrations={cards}
        initialEmailProviderPreference={emailProviderPreference}
        showDefaultSenderControls={defaultSenderControls.visible}
      />
    </div>
  );
}
