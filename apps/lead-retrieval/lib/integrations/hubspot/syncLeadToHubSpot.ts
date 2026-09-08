import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getHubSpotIntegration,
  hubSpotFetch,
  HubSpotIntegrationError,
} from "@/lib/integrations/hubspot/client";
import {
  defaultCrmSyncConfigForProvider,
  type WorkflowCrmResolvedSyncConfig
} from "@/lib/workflows/step-handlers/crm-sync-effective-config";

type LeadRow = {
  id: string;
  company_id: string;
  company_text: string | null;
  email: string | null;
  full_name: string;
  job_title: string | null;
};

type HubSpotSearchResponse = {
  results?: Array<{ id?: string }>;
};

type HubSpotContactResponse = {
  id?: string;
};

type HubSpotNoteCreateResponse = {
  engagement?: { id?: number | string };
};

export type HubSpotLeadSyncResult = {
  success: boolean;
  hubspotId?: string;
  error?: string;
  status?: number;
};

export type HubSpotContactNoteResult = {
  success: boolean;
  noteId?: string;
  error?: string;
  status?: number;
};

function splitFullName(fullName: string) {
  const parts = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function mapLeadToHubSpotProperties(lead: LeadRow, companyName: string | null) {
  const properties: Record<string, string> = {};
  const email = String(lead.email ?? "").trim();

  if (email) {
    properties.email = email;
  }

  const { firstName, lastName } = splitFullName(lead.full_name);
  if (firstName) {
    properties.firstname = firstName;
  }
  if (lastName) {
    properties.lastname = lastName;
  }

  const company = String(lead.company_text ?? companyName ?? "").trim();
  if (company) {
    properties.company = company;
  }

  const jobTitle = String(lead.job_title ?? "").trim();
  if (jobTitle) {
    properties.jobtitle = jobTitle;
  }

  return properties;
}

async function findContactByEmail(accountId: string, email: string) {
  const response = await hubSpotFetch(accountId, "/crm/v3/objects/contacts/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "email",
              operator: "EQ",
              value: email,
            },
          ],
        },
      ],
      properties: ["email"],
      limit: 1,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as HubSpotSearchResponse;
  const id = String(payload.results?.[0]?.id ?? "").trim();
  return id || null;
}

export async function syncLeadToHubSpot(
  leadId: string,
  options?: { syncConfig?: WorkflowCrmResolvedSyncConfig }
): Promise<HubSpotLeadSyncResult> {
  const normalizedLeadId = String(leadId ?? "").trim();
  if (!normalizedLeadId) {
    return { success: false, error: "leadId is required.", status: 400 };
  }

  try {
    const supabase = createAdminClient();

    const { data: lead, error: leadError } = await (supabase as any)
      .from("leads")
      .select("id, company_id, company_text, email, full_name, job_title")
      .eq("id", normalizedLeadId)
      .maybeSingle();

    if (leadError || !lead) {
      console.error("[hubspot/syncLeadToHubSpot] failed to load lead", {
        leadId: normalizedLeadId,
        message: leadError?.message ?? "Lead not found",
      });
      return { success: false, error: leadError?.message ?? "Lead not found.", status: leadError ? 500 : 404 };
    }

    const typedLead = lead as LeadRow;
    const accountId = String(typedLead.company_id ?? "").trim();
    if (!accountId) {
      return { success: false, error: "Missing lead company scope.", status: 400 };
    }

    const syncConfig =
      options?.syncConfig ??
      ({
        provider: "hubspot",
        mode: "integration_default",
        ...defaultCrmSyncConfigForProvider("hubspot")
      } satisfies WorkflowCrmResolvedSyncConfig);

    if (syncConfig.recordType !== "contact") {
      return {
        success: false,
        error: "HubSpot workflow sync currently supports HubSpot contact records only.",
        status: 400
      };
    }

    try {
      await getHubSpotIntegration(accountId);
    } catch (integrationError) {
      if (
        integrationError instanceof HubSpotIntegrationError &&
        integrationError.code === "MISSING_INTEGRATION"
      ) {
        return { success: false, error: "HubSpot is not connected for this account.", status: 400 };
      }
      throw integrationError;
    }

    const { data: company, error: companyError } = await (supabase as any)
      .from("companies")
      .select("name")
      .eq("id", accountId)
      .maybeSingle();

    if (companyError) {
      console.warn("[hubspot/syncLeadToHubSpot] failed to load company name", {
        leadId: normalizedLeadId,
        accountId,
        message: companyError.message,
      });
    }

    const properties = mapLeadToHubSpotProperties(
      typedLead,
      typeof company?.name === "string" ? company.name : null
    );

    const email = String(properties.email ?? "").trim();
    if (!email) {
      console.warn("[hubspot/syncLeadToHubSpot] lead missing email, skipping sync", {
        leadId: normalizedLeadId,
      });
      return { success: false, error: "Lead email is required for HubSpot email matching.", status: 400 };
    }

    const existingContactId =
      syncConfig.matchBehavior === "create_only" ? null : await findContactByEmail(accountId, email);

    if (existingContactId) {
      const response = await hubSpotFetch(
        accountId,
        `/crm/v3/objects/contacts/${encodeURIComponent(existingContactId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ properties }),
        }
      );

      const payload = (await response.json().catch(() => ({}))) as HubSpotContactResponse;
      const hubspotId = String(payload.id ?? existingContactId).trim();

      return hubspotId ? { success: true, hubspotId } : { success: true };
    }

    if (syncConfig.matchBehavior === "update_existing") {
      return {
        success: false,
        error: "No existing HubSpot contact found for update_existing behavior.",
        status: 404
      };
    }

    const createResponse = await hubSpotFetch(accountId, "/crm/v3/objects/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties }),
    });

    const createPayload = (await createResponse.json().catch(() => ({}))) as HubSpotContactResponse;
    const hubspotId = String(createPayload.id ?? "").trim();

    return hubspotId ? { success: true, hubspotId } : { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[hubspot/syncLeadToHubSpot] sync failed", {
      leadId: normalizedLeadId,
      message,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "HubSpot sync failed.",
      status: 500
    };
  }
}

export async function createHubSpotContactNote(input: {
  accountId: string;
  contactId: string;
  noteBody: string;
}): Promise<HubSpotContactNoteResult> {
  const accountId = String(input.accountId ?? "").trim();
  const contactId = String(input.contactId ?? "").trim();
  const noteBody = String(input.noteBody ?? "").trim();

  if (!accountId || !contactId || !noteBody) {
    return {
      success: false,
      error: "accountId, contactId, and noteBody are required.",
      status: 400
    };
  }

  const numericContactId = Number(contactId);
  if (!Number.isFinite(numericContactId)) {
    return {
      success: false,
      error: "HubSpot contactId must be numeric.",
      status: 400
    };
  }

  try {
    const response = await hubSpotFetch(accountId, "/engagements/v1/engagements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        engagement: {
          active: true,
          type: "NOTE",
          timestamp: Date.now()
        },
        associations: {
          contactIds: [numericContactId],
          companyIds: [],
          dealIds: [],
          ownerIds: []
        },
        metadata: {
          body: noteBody
        }
      })
    });

    const payload = (await response.json().catch(() => ({}))) as HubSpotNoteCreateResponse;
    const noteId = String(payload.engagement?.id ?? "").trim();
    return { success: true, noteId: noteId || undefined };
  } catch (error) {
    if (error instanceof HubSpotIntegrationError) {
      return {
        success: false,
        error: error.message,
        status: error.status ?? 500
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "HubSpot note creation failed.",
      status: 500
    };
  }
}
