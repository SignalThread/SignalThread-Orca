import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  salesforceFetch,
  SalesforceIntegrationError,
} from "@/lib/integrations/salesforce/client";
import {
  defaultCrmSyncConfigForProvider,
  normalizeCrmSyncMatchBehavior,
  normalizeCrmSyncRecordType,
  resolveWorkflowCrmSyncConfig,
  type WorkflowCrmResolvedSyncConfig
} from "@/lib/workflows/step-handlers/crm-sync-effective-config";

type LeadRow = {
  id: string;
  company_id: string;
  full_name: string | null;
  email: string | null;
  company_text: string | null;
  job_title: string | null;
};

type SalesforceSyncConfigRow = {
  sync_target_object: "lead" | "contact" | "campaign_member" | null;
  sync_behavior: "create_only" | "update_existing" | "upsert_by_email" | null;
  campaign_name?: string | null;
};

type SalesforceQueryResponse = {
  records?: Array<{ Id?: string }>;
};

type SalesforceCreateResponse = {
  id?: string;
  success?: boolean;
  errors?: string[];
};

export type SalesforceTestSyncResult = {
  success: boolean;
  action?: "created" | "updated";
  salesforceLeadId?: string;
  error?: string;
  status?: number;
};

export type SalesforceTaskCreateResult = {
  success: boolean;
  taskId?: string;
  error?: string;
  status?: number;
};

function normalize(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function splitName(fullName: string | null) {
  const parts = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function escapeSoqlLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findLeadByEmail(accountId: string, email: string) {
  const soql =
    "SELECT Id FROM Lead " +
    `WHERE Email = '${escapeSoqlLiteral(email)}' ` +
    "ORDER BY LastModifiedDate DESC LIMIT 1";

  const response = await salesforceFetch(
    accountId,
    `/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
    { method: "GET" }
  );

  const payload = (await response.json().catch(() => ({}))) as SalesforceQueryResponse;
  const id = normalize(payload.records?.[0]?.Id);
  return id;
}

function buildLeadPayload(lead: LeadRow) {
  const { firstName, lastName } = splitName(lead.full_name);

  const payload: Record<string, string> = {};
  const email = normalize(lead.email);
  const company = normalize(lead.company_text) ?? "Lead Intel";
  const title = normalize(lead.job_title);

  if (firstName) payload.FirstName = firstName;
  payload.LastName = lastName ?? firstName ?? "Lead Intel";
  if (email) payload.Email = email;
  payload.Company = company;
  if (title) payload.Title = title;

  return payload;
}

export async function syncLeadToSalesforce(input: {
  accountId: string;
  leadId: string;
  syncConfig?: WorkflowCrmResolvedSyncConfig;
}): Promise<SalesforceTestSyncResult> {
  const accountId = normalize(input.accountId);
  const leadId = normalize(input.leadId);

  if (!accountId || !leadId) {
    return { success: false, error: "accountId and leadId are required.", status: 400 };
  }

  const supabase = createAdminClient();

  const { data: leadData, error: leadError } = await (supabase as any)
    .from("leads")
    .select("id, company_id, full_name, email, company_text, job_title")
    .eq("id", leadId)
    .eq("company_id", accountId)
    .maybeSingle();

  if (leadError) {
    return { success: false, error: leadError.message ?? "Failed to load lead.", status: 500 };
  }
  if (!leadData) {
    return { success: false, error: "Lead not found for this account.", status: 404 };
  }

  const lead = leadData as LeadRow;

  let resolvedSyncConfig = input.syncConfig ?? null;
  if (!resolvedSyncConfig) {
    const { data: configData, error: configError } = await (supabase as any)
      .from("integration_sync_configs")
      .select("sync_target_object, sync_behavior, campaign_name")
      .eq("account_id", accountId)
      .eq("provider", "salesforce")
      .maybeSingle();

    if (configError) {
      return {
        success: false,
        error: configError.message ?? "Failed to load Salesforce sync settings.",
        status: 500,
      };
    }

    const config = (configData ?? {}) as SalesforceSyncConfigRow;
    resolvedSyncConfig = resolveWorkflowCrmSyncConfig({
      provider: "salesforce",
      integrationDefault: {
        recordType: normalizeCrmSyncRecordType(config.sync_target_object) ?? defaultCrmSyncConfigForProvider("salesforce").recordType,
        matchBehavior:
          normalizeCrmSyncMatchBehavior(config.sync_behavior) ??
          defaultCrmSyncConfigForProvider("salesforce").matchBehavior,
        sourceLabel: normalize(config.campaign_name)
      }
    });
  }

  const syncTarget = resolvedSyncConfig.recordType;
  const syncBehavior = resolvedSyncConfig.matchBehavior;

  if (syncTarget !== "lead") {
    return {
      success: false,
      error: "Test sync currently supports sync target object Lead only.",
      status: 400,
    };
  }

  const salesforcePayload = buildLeadPayload(lead);
  const email = normalize(salesforcePayload.Email);

  try {
    if (syncBehavior === "create_only") {
      const createResponse = await salesforceFetch(accountId, "/services/data/v60.0/sobjects/Lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salesforcePayload),
      });
      const created = (await createResponse.json().catch(() => ({}))) as SalesforceCreateResponse;
      const createdId = normalize(created.id);
      return {
        success: true,
        action: "created",
        salesforceLeadId: createdId ?? undefined,
      };
    }

    if (!email) {
      return {
        success: false,
        error: "Lead email is required for Salesforce upsert/update by email.",
        status: 400,
      };
    }

    const existingLeadId = await findLeadByEmail(accountId, email);

    if (existingLeadId) {
      await salesforceFetch(
        accountId,
        `/services/data/v60.0/sobjects/Lead/${encodeURIComponent(existingLeadId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(salesforcePayload),
        }
      );
      return {
        success: true,
        action: "updated",
        salesforceLeadId: existingLeadId,
      };
    }

    if (syncBehavior === "update_existing") {
      return {
        success: false,
        error: "No existing Salesforce lead found for update_existing behavior.",
        status: 404,
      };
    }

    const createResponse = await salesforceFetch(accountId, "/services/data/v60.0/sobjects/Lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(salesforcePayload),
    });
    const created = (await createResponse.json().catch(() => ({}))) as SalesforceCreateResponse;
    const createdId = normalize(created.id);
    return {
      success: true,
      action: "created",
      salesforceLeadId: createdId ?? undefined,
    };
  } catch (error) {
    if (error instanceof SalesforceIntegrationError) {
      if (error.status === 401) {
        return {
          success: false,
          error: "Salesforce token expired. Reconnect Salesforce and try again.",
          status: 401,
        };
      }

      return {
        success: false,
        error: error.message,
        status: error.status ?? 500,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Salesforce sync failed.",
      status: 500,
    };
  }
}

export async function createSalesforceLeadTask(input: {
  accountId: string;
  salesforceLeadId: string;
  noteBody: string;
  subject?: string;
}): Promise<SalesforceTaskCreateResult> {
  const accountId = normalize(input.accountId);
  const salesforceLeadId = normalize(input.salesforceLeadId);
  const noteBody = String(input.noteBody ?? "").trim();
  const subject = normalize(input.subject) ?? "Lead Retrieval AI Follow-up Notes";

  if (!accountId || !salesforceLeadId || !noteBody) {
    return {
      success: false,
      error: "accountId, salesforceLeadId, and noteBody are required.",
      status: 400
    };
  }

  try {
    const createResponse = await salesforceFetch(accountId, "/services/data/v60.0/sobjects/Task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Subject: subject,
        Status: "Not Started",
        WhoId: salesforceLeadId,
        Description: noteBody
      })
    });

    const created = (await createResponse.json().catch(() => ({}))) as SalesforceCreateResponse;
    return {
      success: true,
      taskId: normalize(created.id) ?? undefined
    };
  } catch (error) {
    if (error instanceof SalesforceIntegrationError) {
      if (error.status === 401) {
        return {
          success: false,
          error: "Salesforce token expired. Reconnect Salesforce and try again.",
          status: 401
        };
      }

      return {
        success: false,
        error: error.message,
        status: error.status ?? 500
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Salesforce task creation failed.",
      status: 500
    };
  }
}
