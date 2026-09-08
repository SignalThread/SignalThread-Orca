import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import {
  combineConversationSummaries,
  isAiSummarySignalName,
} from "@/lib/campaigns/ai-summary-signal";
import { loadLatestCompletedConversationSummaryByLeadId } from "@/lib/campaigns/lead-conversation-summaries";
import {
  buildSignalPromptSections,
  type PromptRecipientContext,
  type SelectedSignalForGeneration
} from "@/lib/campaigns/signal-prompt-composer";
import { generateLeadDraftWithLLM } from "@/lib/campaigns/llm-draft-generator";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CampaignRow = {
  id: string;
  company_id: string;
  name: string;
  subject_line?: string | null;
  draft_subject?: string | null;
  draft_body_text?: string | null;
  draft_body_html?: string | null;
  draft_updated_at?: string | null;
  selected_signals?: string[] | null;
};

type RecipientRow = {
  id: string;
  lead_id: string;
};

type LeadRow = {
  id: string;
  full_name: string;
  email: string | null;
  company_id: string;
  event_id: string | null;
  job_title: string | null;
  enriched_job_title: string | null;
  enriched_company_size: string | null;
  enriched_industry: string | null;
  enriched_company_domain: string | null;
};

type CompanyRow = {
  id: string;
  name: string;
};

type EventRow = {
  id: string;
  name: string;
};

type MessageRow = {
  id: string;
  campaign_id: string;
  recipient_id: string;
  subject: string | null;
  body_text: string | null;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  created_at: string;
};

type PreviewMessage = {
  id: string;
  campaign_id: string;
  recipient_id: string;
  lead_id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  event_name: string | null;
  subject: string | null;
  body_text: string | null;
  final_email_subject: string | null;
  final_email_body: string | null;
  mode: GenerationMode;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  created_at: string;
};

type GenerateDraftPayload = {
  generationMode?: "single" | "group";
  subjectLine?: string;
  selectedSignalIds?: string[];
  leadIds?: string[];
  selectedLeadIds?: string[];
  templateName?: string;
  force?: boolean;
};

type GenerationMode = "single" | "group";

function normalizeSelectedSignalIds(signalIds?: string[] | null) {
  return [...new Set((signalIds ?? []).map((signalId) => signalId.trim()).filter(Boolean))];
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidLike(value: string) {
  return UUID_REGEX.test(value.trim());
}

function normalizeLeadIds(leadIds?: string[]) {
  return [...new Set((leadIds ?? []).map((leadId) => leadId.trim()).filter(Boolean))];
}

function uniqRecipientsByLeadId(recipients: RecipientRow[]) {
  const seen = new Set<string>();
  const uniqueRecipients: RecipientRow[] = [];

  for (const recipient of recipients) {
    if (seen.has(recipient.lead_id)) {
      continue;
    }
    seen.add(recipient.lead_id);
    uniqueRecipients.push(recipient);
  }

  return uniqueRecipients;
}

function uniqValues(values: string[]) {
  return [...new Set(values)];
}

function firstNameFromFullName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return "there";
  }
  return trimmed.split(/\s+/)[0] || "there";
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function hasUnresolvedPlaceholders(value: string) {
  return /\{\{[^{}]+\}\}/.test(value) || /\{[^{}]+\}/.test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueNormalizedValues(values: Array<string | null | undefined>) {
  return uniqValues(
    values
      .map((value) => normalizeWhitespace(String(value ?? "")))
      .filter(Boolean)
  );
}

function sharedValueOrFallback(values: Array<string | null | undefined>, fallback: string) {
  const uniqueValues = uniqueNormalizedValues(values);
  return uniqueValues.length === 1 ? uniqueValues[0] : fallback;
}

function stripLeadNamesFromText(value: string, leadNames: string[], replacement: string) {
  if (!value.trim() || leadNames.length === 0) {
    return value;
  }

  return normalizeWhitespace(
    leadNames.reduce((current, leadName) => {
      const normalizedLeadName = leadName.trim();
      if (!normalizedLeadName) {
        return current;
      }
      const pattern = new RegExp(`\\b${escapeRegExp(normalizedLeadName)}\\b`, "gi");
      return current.replace(pattern, replacement);
    }, value)
  );
}

function resolveLeadContextValues({
  lead,
  companyById,
  eventNameById
}: {
  lead: LeadRow & {
    company_text?: string | null;
    company?: string | null;
  };
  companyById: Map<string, string>;
  eventNameById: Map<string, string>;
}) {
  const firstName = firstNameFromFullName(lead.full_name);
  const leadName = lead.full_name.trim() || firstName;
  const companyText =
    lead.company_text?.trim() ||
    lead.enriched_company_domain?.trim() ||
    lead.company?.trim() ||
    companyById.get(lead.company_id) ||
    "your company";
  const title = lead.enriched_job_title?.trim() || lead.job_title?.trim() || "your role";
  const companySize = lead.enriched_company_size?.trim() || "company";
  const industry = lead.enriched_industry?.trim() || "industry";
  const companyDomain = lead.enriched_company_domain?.trim() || "";
  const eventName = lead.event_id ? (eventNameById.get(lead.event_id) ?? "our event") : "our event";

  return {
    firstName,
    leadName,
    companyText,
    title,
    companySize,
    industry,
    companyDomain,
    eventName
  };
}

type SignalRow = {
  id: string;
  name: string;
  category: string;
  default_prompt: string;
  admin_override_prompt: string | null;
  visibility: "global" | "role" | "template";
  role_scope: string | null;
  template_scope: string | null;
  tones: string[] | null;
};

function normalizeSignalDefinitionsFromIds({
  selectedSignalIds,
  databaseSignals
}: {
  selectedSignalIds: string[];
  databaseSignals: SignalRow[];
}) {
  const databaseSignalsById = new Map(databaseSignals.map((signal) => [signal.id, signal]));
  const orderedKeys = selectedSignalIds;
  const seen = new Set<string>();

  const selectedSignalDefinitions: SelectedSignalForGeneration[] = [];
  for (const key of orderedKeys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const row = databaseSignalsById.get(key);
    if (!row) {
      continue;
    }

    selectedSignalDefinitions.push({
      id: row.id,
      name: row.name,
      category: row.category,
      defaultPromptText: row.admin_override_prompt?.trim() || row.default_prompt?.trim() || "",
      tone: row.tones ?? [],
      visibility: row.visibility ?? null,
      roleScope: row.role_scope ?? null,
      templateScope: row.template_scope ?? null
    });
  }

  return selectedSignalDefinitions;
}

function normalizeRole(role: string | null | undefined) {
  return String(role ?? "").trim().toLowerCase();
}

function isSignalUsableForContext({
  signal,
  role,
  templateName
}: {
  signal: SelectedSignalForGeneration;
  role: string;
  templateName: string;
}) {
  const visibility = normalizeRole(signal.visibility);
  if (!visibility || visibility === "global") {
    return { allowed: true as const };
  }

  if (visibility === "role") {
    const roleScope = normalizeRole(signal.roleScope);
    if (!roleScope) {
      return { allowed: false as const, reason: "missing_role_scope" };
    }
    if (role === "platform_admin") {
      return { allowed: true as const };
    }
    if (roleScope !== role) {
      return { allowed: false as const, reason: "role_mismatch" };
    }
    return { allowed: true as const };
  }

  if (visibility === "template") {
    const templateScope = String(signal.templateScope ?? "").trim().toLowerCase();
    if (!templateScope) {
      return { allowed: false as const, reason: "missing_template_scope" };
    }
    if (templateScope !== templateName.trim().toLowerCase()) {
      return { allowed: false as const, reason: "template_mismatch" };
    }
    return { allowed: true as const };
  }

  return { allowed: false as const, reason: "unsupported_visibility" };
}

function toPreviewMessages({
  messages,
  recipients,
  leadById,
  eventNameById,
  generationMode
}: {
  messages: MessageRow[];
  recipients: RecipientRow[];
  leadById: Map<string, LeadRow>;
  eventNameById: Map<string, string>;
  generationMode: GenerationMode;
}): PreviewMessage[] {
  const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));

  return messages
    .map((message) => {
      const recipient = recipientById.get(message.recipient_id);
      if (!recipient) {
        return null;
      }
      const lead = leadById.get(recipient.lead_id);
      if (!lead) {
        return null;
      }

      return {
        id: message.id,
        campaign_id: message.campaign_id,
        recipient_id: message.recipient_id,
        lead_id: lead.id,
        full_name: lead.full_name,
        email: lead.email,
        job_title: lead.job_title,
        event_name: lead.event_id ? (eventNameById.get(lead.event_id) ?? null) : null,
        subject: message.subject,
        body_text: message.body_text,
        final_email_subject: message.subject,
        final_email_body: message.body_text,
        mode: generationMode,
        status: message.status,
        created_at: message.created_at
      };
    })
    .filter((row): row is PreviewMessage => Boolean(row));
}

async function getScopedCampaign(campaignId: string, companyId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("campaigns")
    .select("id, company_id, name, subject_line, draft_subject, draft_body_text, draft_body_html, draft_updated_at, selected_signals")
    .eq("id", campaignId)
    .eq("company_id", companyId)
    .maybeSingle()) as {
    data: CampaignRow | null;
    error: { message: string; code?: string } | null;
  };

  if (error) {
    throw new Error(`${error.message} (${error.code ?? "no_code"})`);
  }

  return data;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!sessionUser.company_id) {
      return NextResponse.json({ error: "No company assigned" }, { status: 400 });
    }
    const senderName = String(sessionUser.fullName ?? sessionUser.full_name ?? "").trim() || null;

    const { campaignId: rawCampaignId } = await params;
    const campaignId = rawCampaignId.trim();
    if (!campaignId) {
      return NextResponse.json({ error: "Missing campaign id in route" }, { status: 400 });
    }

    const campaign = await getScopedCampaign(campaignId, sessionUser.company_id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    let payload: GenerateDraftPayload = {};
    try {
      payload = (await req.json()) as GenerateDraftPayload;
    } catch {
      payload = {};
    }

    if ("selectedSignals" in (payload as Record<string, unknown>) || "selectedSignalDefinitions" in (payload as Record<string, unknown>)) {
      return NextResponse.json(
        { error: "Only selectedSignalIds is supported for Campaign Agent selection." },
        { status: 400 }
      );
    }

    if (!Array.isArray(payload.selectedSignalIds)) {
      return NextResponse.json({ error: "selectedSignalIds must be an array of UUIDs." }, { status: 400 });
    }

    const selectedSignalIds = normalizeSelectedSignalIds(payload.selectedSignalIds);
    const forceRegenerate = payload.force === true;
    const requestedLeadIds = normalizeLeadIds(payload.selectedLeadIds ?? payload.leadIds);
    const payloadGenerationMode = payload.generationMode === "group" || payload.generationMode === "single"
      ? payload.generationMode
      : null;
    const generationMode: GenerationMode =
      requestedLeadIds.length <= 1
        ? "single"
        : payloadGenerationMode ?? "group";
    const templateName = payload.templateName?.trim() || "Lead Intel";
    const subjectTemplate =
      payload.subjectLine?.trim() || campaign.subject_line?.trim() || `Following up from ${campaign.name} - {{first_name}}`;

    if (process.env.NODE_ENV !== "production") {
      console.log("CAMPAIGN_GENERATE_DRAFT_REQUEST", {
        campaignId,
        selectedLeadIds: payload.selectedLeadIds ?? null,
        leadIds: payload.leadIds ?? null,
        requestedLeadIds,
        generationMode,
        selectedSignalIds: payload.selectedSignalIds ?? null
      });
    }

    if (selectedSignalIds.length === 0) {
      return NextResponse.json({ error: "Select at least one Campaign Agent before generating a draft" }, { status: 400 });
    }

    const invalidSignalIds = selectedSignalIds.filter((signalId) => !isUuidLike(signalId));
    if (invalidSignalIds.length > 0) {
      return NextResponse.json(
        { error: "selectedSignalIds must contain only valid UUIDs." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    const signalQuery = supabase
      .from("signals")
      .select(
        "id, name, category, default_prompt, admin_override_prompt, visibility, role_scope, template_scope, tones"
      )
      .eq("is_active", true)
      .in("id", selectedSignalIds);

    const { data: selectedSignalRows, error: selectedSignalRowsError } = (await signalQuery) as {
      data: SignalRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (selectedSignalRowsError) {
      return NextResponse.json(
        { error: `${selectedSignalRowsError.message} (${selectedSignalRowsError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const selectedSignalRowsById = new Map((selectedSignalRows ?? []).map((signal) => [signal.id, signal]));
    const missingSignalIds = selectedSignalIds.filter((signalId) => !selectedSignalRowsById.has(signalId));
    if (missingSignalIds.length > 0) {
      return NextResponse.json(
        { error: "One or more selected Campaign Agents are missing or inactive.", missingSignalIds },
        { status: 400 }
      );
    }

    const selectedSignalDefinitions = normalizeSignalDefinitionsFromIds({
      selectedSignalIds,
      databaseSignals: selectedSignalRows ?? []
    });

    const normalizedSessionRole = normalizeRole(sessionUser.role);
    const omittedSignals = selectedSignalDefinitions
      .map((signal) => {
        const rule = isSignalUsableForContext({
          signal,
          role: normalizedSessionRole,
          templateName
        });
        return rule.allowed ? null : { id: signal.id ?? signal.name, reason: rule.reason };
      })
      .filter((item): item is { id: string; reason: string } => Boolean(item));

    const usableSignalDefinitions = selectedSignalDefinitions.filter((signal) =>
      isSignalUsableForContext({
        signal,
        role: normalizedSessionRole,
        templateName
      }).allowed
    );

    if (usableSignalDefinitions.length === 0) {
      return NextResponse.json({ error: "Selected Campaign Agents are unavailable or inactive" }, { status: 400 });
    }

    if (process.env.NODE_ENV !== "production") {
      const promptPreview = buildSignalPromptSections({
        selectedSignals: usableSignalDefinitions,
        recipientContext: {
          firstName: "there",
          fullName: "there",
          leadName: "there",
          eventName: "our event",
          companyText: "your company",
          title: "your role",
          companySize: "company",
          industry: "industry",
          companyDomain: "company.com",
          leadCount: generationMode === "group" ? requestedLeadIds.length : 1,
          isMultiLeadDraft: generationMode === "group"
        },
        templateName
      });
      console.log("CAMPAIGN_GENERATE_SELECTED_SIGNALS", {
        campaignId: campaign.id,
        recipientCount: requestedLeadIds.length,
        generationMode,
        requestSelectedSignalIds: selectedSignalIds,
        usedSelectedSignalIds: usableSignalDefinitions.map((signal) => signal.id).filter(Boolean),
        usedSelectedSignalNames: usableSignalDefinitions.map((signal) => signal.name),
        categoriesUsed: promptPreview.categoriesUsed,
        omittedSignals
      });
    }

    const selectedSignalIdsToPersist = normalizeSelectedSignalIds(
      usableSignalDefinitions.map((signal) => signal.id ?? "")
    );

    const { error: saveSignalsError } = await supabase
      .from("campaigns")
      .update({ selected_signals: selectedSignalIdsToPersist } as never)
      .eq("id", campaign.id)
      .eq("company_id", sessionUser.company_id);

    if (saveSignalsError) {
      return NextResponse.json(
        { error: `${saveSignalsError.message} (${saveSignalsError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const { data: scopedLeads, error: scopedLeadsError } = (await supabase
      .from("leads")
      .select("id")
      .in("id", requestedLeadIds.length > 0 ? requestedLeadIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("company_id", sessionUser.company_id)) as {
      data: { id: string }[] | null;
      error: { message: string; code?: string } | null;
    };

    if (scopedLeadsError) {
      return NextResponse.json(
        { error: `${scopedLeadsError.message} (${scopedLeadsError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const scopedLeadIds = (scopedLeads ?? []).map((lead) => lead.id);
    const targetLeadIds = requestedLeadIds.length > 0 ? scopedLeadIds : [];

    if (targetLeadIds.length === 0) {
      return NextResponse.json({
        generationMode,
        generatedCount: 0,
        requestedLeadCount: requestedLeadIds.length,
        messages: []
      });
    }

    const { error: recipientUpsertError } = await supabase.from("campaign_recipients").upsert(
      targetLeadIds.map((leadId) => ({ campaign_id: campaign.id, lead_id: leadId })) as never,
      { onConflict: "campaign_id,lead_id", ignoreDuplicates: true }
    );

    if (recipientUpsertError) {
      return NextResponse.json(
        { error: `${recipientUpsertError.message} (${recipientUpsertError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const { data: recipientRows, error: recipientsError } = (await supabase
      .from("campaign_recipients")
      .select("id, lead_id")
      .eq("campaign_id", campaign.id)
      .in("lead_id", targetLeadIds)) as {
      data: RecipientRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (recipientsError) {
      return NextResponse.json(
        { error: `${recipientsError.message} (${recipientsError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const recipients = uniqRecipientsByLeadId(recipientRows ?? []);
    const recipientByLeadId = new Map(recipients.map((recipient) => [recipient.lead_id, recipient]));
    const missingRecipientLeadIds = targetLeadIds.filter((leadId) => !recipientByLeadId.has(leadId));
    if (missingRecipientLeadIds.length > 0) {
      return NextResponse.json(
        {
          error: `Missing campaign recipients for ${missingRecipientLeadIds.length} lead(s)`,
          missingLeadIds: missingRecipientLeadIds
        },
        { status: 500 }
      );
    }

    if (forceRegenerate) {
      const { error: deleteMessagesError } = await supabase
        .from("campaign_messages")
        .delete()
        .eq("campaign_id", campaign.id);

      if (deleteMessagesError) {
        return NextResponse.json(
          { error: `${deleteMessagesError.message} (${deleteMessagesError.code ?? "no_code"})` },
          { status: 500 }
        );
      }
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("CAMPAIGN_GENERATE_DRAFT_RECIPIENTS", {
        campaignId: campaign.id,
        recipientCount: recipients.length,
        recipientSample: recipients.slice(0, 5)
      });
    }

    if (recipients.length === 0) {
      if (process.env.NODE_ENV !== "production") {
        console.log("CAMPAIGN_GENERATE_DRAFT_RESPONSE", {
          campaignId: campaign.id,
          generationMode,
          generatedCount: 0,
          messages: []
        });
      }
      return NextResponse.json({ generationMode, generatedCount: 0 });
    }

    const leadIds = targetLeadIds;
    const { data: leadsData, error: leadsError } = (await supabase
      .from("leads")
      .select(
        "id, full_name, email, company_id, event_id, job_title, enriched_job_title, enriched_company_size, enriched_industry, enriched_company_domain"
      )
      .in("id", leadIds)
      .eq("company_id", sessionUser.company_id)) as {
      data: LeadRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (leadsError) {
      return NextResponse.json(
        { error: `${leadsError.message} (${leadsError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const leads = leadsData ?? [];
    const leadIdsReturned = uniqValues(leads.map((lead) => lead.id));
    const missingLeadRows = leadIds.filter((leadId) => !leadIdsReturned.includes(leadId));
    if (missingLeadRows.length > 0) {
      return NextResponse.json(
        {
          error: `Missing lead rows for ${missingLeadRows.length} selected lead(s)`,
          missingLeadIds: missingLeadRows
        },
        { status: 500 }
      );
    }
    const leadById = new Map(leads.map((lead) => [lead.id, lead]));
    const companyIds = [...new Set(leads.map((lead) => lead.company_id))];
    const eventIds = uniqValues(leads.map((lead) => lead.event_id).filter((eventId): eventId is string => Boolean(eventId)));

    const companyById = new Map<string, string>();
    if (companyIds.length > 0) {
      const { data: companiesData, error: companiesError } = (await supabase
        .from("companies")
        .select("id, name")
        .in("id", companyIds)) as {
        data: CompanyRow[] | null;
        error: { message: string; code?: string } | null;
      };

      if (companiesError) {
        return NextResponse.json(
          { error: `${companiesError.message} (${companiesError.code ?? "no_code"})` },
          { status: 500 }
        );
      }

      for (const company of companiesData ?? []) {
        companyById.set(company.id, company.name);
      }
    }

    const eventNameById = new Map<string, string>();
    if (eventIds.length > 0) {
      const { data: eventsData, error: eventsError } = (await supabase
        .from("events")
        .select("id, name")
        .in("id", eventIds)) as {
        data: EventRow[] | null;
        error: { message: string; code?: string } | null;
      };

      if (eventsError) {
        return NextResponse.json(
          { error: `${eventsError.message} (${eventsError.code ?? "no_code"})` },
          { status: 500 }
        );
      }

      for (const eventRow of eventsData ?? []) {
        eventNameById.set(eventRow.id, eventRow.name);
      }
    }

    const aiSummarySignalSelected = usableSignalDefinitions.some((signal) =>
      isAiSummarySignalName(signal.name)
    );

    let resolvedAiSummary: string | null = null;
    if (aiSummarySignalSelected) {
      const {
        summaryByLeadId,
        error: conversationSummaryError,
      } = await loadLatestCompletedConversationSummaryByLeadId(supabase, targetLeadIds);

      if (conversationSummaryError) {
        return NextResponse.json(
          { error: `${conversationSummaryError.message} (${conversationSummaryError.code ?? "no_code"})` },
          { status: 500 }
        );
      }

      const availableSummaries = targetLeadIds
        .map((leadId) => summaryByLeadId.get(leadId) ?? null)
        .filter((summary): summary is string => Boolean(summary));

      if (availableSummaries.length === 0) {
        return NextResponse.json(
          { error: "No conversation summary available" },
          { status: 400 }
        );
      }

      resolvedAiSummary =
        targetLeadIds.length === 1
          ? availableSummaries[0]
          : combineConversationSummaries(availableSummaries);
    }

    const resolvedSignalDefinitions = usableSignalDefinitions.map((signal) => {
      if (!resolvedAiSummary || !isAiSummarySignalName(signal.name)) {
        return signal;
      }

      return {
        ...signal,
        defaultPromptText: resolvedAiSummary
      };
    });

    const now = new Date().toISOString();
    let rowsToUpsert: Array<{
      campaign_id: string;
      recipient_id: string;
      subject: string;
      body_text: string;
      status: "draft";
      created_at: string;
    }> = [];
    let groupDraftResponse:
      | {
          subject: string;
          body_text: string;
          updated_at: string;
        }
      | null = null;

    if (generationMode === "group") {
      const primaryRecipient = recipients[0];
      if (!primaryRecipient) {
        return NextResponse.json({ error: "No recipients available for group draft generation" }, { status: 400 });
      }

      const leadNameTokens = uniqValues(
        leads
          .flatMap((lead) => [lead.full_name, firstNameFromFullName(lead.full_name)])
          .map((token) => token.trim())
          .filter((token) => token.length > 1)
      );
      const leadContexts = leads.map((lead) =>
        resolveLeadContextValues({
          lead: lead as LeadRow & {
            company_text?: string | null;
            company?: string | null;
          },
          companyById,
          eventNameById
        })
      );
      const aggregatedContext: PromptRecipientContext = {
        firstName: "team",
        fullName: "team",
        leadName: "team",
        eventName: sharedValueOrFallback(leadContexts.map((context) => context.eventName), "our recent event"),
        companyText: sharedValueOrFallback(leadContexts.map((context) => context.companyText), "your organization"),
        title: sharedValueOrFallback(leadContexts.map((context) => context.title), "leaders like you"),
        companySize: sharedValueOrFallback(leadContexts.map((context) => context.companySize), "organizations"),
        industry: sharedValueOrFallback(leadContexts.map((context) => context.industry), "industry"),
        companyDomain: sharedValueOrFallback(leadContexts.map((context) => context.companyDomain), ""),
        leadCount: targetLeadIds.length,
        isMultiLeadDraft: true
      };

      if (process.env.NODE_ENV !== "production") {
        console.log("CAMPAIGN_GENERATE_DRAFT_GROUP_CONTEXT", {
          campaignId: campaign.id,
          leadCount: targetLeadIds.length,
          leadIds: targetLeadIds,
          aggregatedContext
        });
      }

      const generatedDraft = await generateLeadDraftWithLLM({
        subjectTemplate,
        templateName,
        selectedSignals: resolvedSignalDefinitions,
        recipientContext: aggregatedContext,
        senderName
      });

      const subject =
        stripLeadNamesFromText(generatedDraft.subject, leadNameTokens, "team") ||
        `Following up from ${aggregatedContext.eventName}`;
      const body = stripLeadNamesFromText(generatedDraft.body, leadNameTokens, "team");

      if (
        process.env.NODE_ENV !== "production" &&
        (hasUnresolvedPlaceholders(subject) || hasUnresolvedPlaceholders(body))
      ) {
        throw new Error("UNRESOLVED_PLACEHOLDERS_ROUTE_ASSERT");
      }

      rowsToUpsert = [
        {
          campaign_id: campaign.id,
          recipient_id: primaryRecipient.id,
          subject: normalizeWhitespace(subject),
          body_text: body,
          status: "draft" as const,
          created_at: now
        }
      ];
      groupDraftResponse = {
        subject: rowsToUpsert[0].subject,
        body_text: rowsToUpsert[0].body_text,
        updated_at: now
      };

      if (process.env.NODE_ENV !== "production") {
        console.log("CAMPAIGN_LLM_DRAFT_RESULT_GROUP", {
          campaignId: campaign.id,
          recipientId: primaryRecipient.id,
          model: generatedDraft.model,
          subjectPreview: rowsToUpsert[0].subject,
          bodyPreview: rowsToUpsert[0].body_text.slice(0, 220),
          promptPreview: generatedDraft.promptPreview
        });
      }
    } else {
      rowsToUpsert = (
        await Promise.all(
          targetLeadIds.map(async (leadId) => {
            const recipient = recipientByLeadId.get(leadId);
            const lead = leadById.get(leadId);
            if (!recipient || !lead) {
              return null;
            }

            const resolvedContext = resolveLeadContextValues({
              lead: lead as LeadRow & {
                company_text?: string | null;
                company?: string | null;
              },
              companyById,
              eventNameById
            });
            const recipientContext: PromptRecipientContext = {
              firstName: resolvedContext.firstName,
              fullName: lead.full_name,
              leadName: resolvedContext.leadName,
              eventName: resolvedContext.eventName,
              companyText: resolvedContext.companyText,
              title: resolvedContext.title,
              companySize: resolvedContext.companySize,
              industry: resolvedContext.industry,
              companyDomain: resolvedContext.companyDomain,
              // Each generated draft is per-recipient. Keep context singular so output stays personalized.
              leadCount: 1,
              isMultiLeadDraft: false
            };

            if (process.env.NODE_ENV !== "production") {
              console.log("CAMPAIGN_GENERATE_DRAFT_LEAD_CONTEXT", {
                campaignId: campaign.id,
                leadId: lead.id,
                fullName: lead.full_name,
                jobTitle: lead.job_title,
                enrichedJobTitle: lead.enriched_job_title,
                enrichedCompanySize: lead.enriched_company_size,
                enrichedIndustry: lead.enriched_industry,
                enrichedCompanyDomain: lead.enriched_company_domain,
                resolvedContext: recipientContext
              });
            }

            const generatedDraft = await generateLeadDraftWithLLM({
              subjectTemplate,
              templateName,
              selectedSignals: resolvedSignalDefinitions,
              recipientContext,
              senderName
            });

            if (
              process.env.NODE_ENV !== "production" &&
              (hasUnresolvedPlaceholders(generatedDraft.subject) || hasUnresolvedPlaceholders(generatedDraft.body))
            ) {
              throw new Error("UNRESOLVED_PLACEHOLDERS_ROUTE_ASSERT");
            }

            if (process.env.NODE_ENV !== "production") {
              console.log("CAMPAIGN_LLM_DRAFT_RESULT", {
                campaignId: campaign.id,
                leadId,
                recipientId: recipient.id,
                model: generatedDraft.model,
                subjectPreview: generatedDraft.subject,
                bodyPreview: generatedDraft.body.slice(0, 220),
                promptPreview: generatedDraft.promptPreview
              });
            }

            return {
              campaign_id: campaign.id,
              recipient_id: recipient.id,
              subject: normalizeWhitespace(generatedDraft.subject),
              body_text: generatedDraft.body,
              status: "draft" as const,
              created_at: now
            };
          })
        )
      ).filter((row): row is NonNullable<typeof row> => Boolean(row));
    }

    const expectedRowCount = generationMode === "group" ? 1 : targetLeadIds.length;
    if (rowsToUpsert.length !== expectedRowCount) {
      return NextResponse.json(
        {
          error: `Draft generation mismatch: expected ${expectedRowCount} rows, built ${rowsToUpsert.length}`
        },
        { status: 500 }
      );
    }

    if (rowsToUpsert.length === 0) {
      if (process.env.NODE_ENV !== "production") {
        console.log("CAMPAIGN_GENERATE_DRAFT_RESPONSE", {
          campaignId: campaign.id,
          generatedCount: 0,
          messages: []
        });
      }
      return NextResponse.json({ generatedCount: 0 });
    }

    const { data: upsertedMessages, error: upsertError } = (await supabase
      .from("campaign_messages")
      .upsert(rowsToUpsert as never, {
        onConflict: "campaign_id,recipient_id"
      })
      .select("id, campaign_id, recipient_id, subject, body_text, status, created_at")) as {
      data: MessageRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (upsertError) {
      return NextResponse.json(
        { error: `${upsertError.message} (${upsertError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("CAMPAIGN_GENERATE_DRAFT_UPSERT", {
        campaignId: campaign.id,
        upsertCount: upsertedMessages?.length ?? 0,
        upsertSample: upsertedMessages?.slice(0, 3) ?? []
      });
    }

    const recipientIds = recipients.map((recipient) => recipient.id);
    const { data: refreshedMessages, error: refreshedError } = (await supabase
      .from("campaign_messages")
      .select("id, campaign_id, recipient_id, subject, body_text, status, created_at")
      .eq("campaign_id", campaign.id)
      .in("recipient_id", recipientIds)
      .order("created_at", { ascending: false })) as {
      data: MessageRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (refreshedError) {
      return NextResponse.json(
        { error: `${refreshedError.message} (${refreshedError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const messages = toPreviewMessages({
      messages: refreshedMessages ?? [],
      recipients,
      leadById,
      eventNameById,
      generationMode
    });

    const messageLeadIds = uniqValues(messages.map((message) => message.lead_id));
    const missingMessageLeadIds =
      generationMode === "single"
        ? targetLeadIds.filter((leadId) => !messageLeadIds.includes(leadId))
        : [];
    if (missingMessageLeadIds.length > 0) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("CAMPAIGN_GENERATE_DRAFT_MISSING_MESSAGES", {
          campaignId: campaign.id,
          requestedLeadCount: targetLeadIds.length,
          messageCount: messages.length,
          missingLeadIds: missingMessageLeadIds
        });
      }
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("CAMPAIGN_GENERATE_DRAFT_RESPONSE", {
        campaignId: campaign.id,
        generationMode,
        generatedCount: generationMode === "group" ? 1 : rowsToUpsert.length,
        messagesCount: messages.length,
        messageSample: messages.slice(0, 3)
      });
    }

    return NextResponse.json({
      generationMode,
      generatedCount: generationMode === "group" ? 1 : messageLeadIds.length,
      requestedLeadCount: targetLeadIds.length,
      messages,
      missingLeadIds: missingMessageLeadIds,
      selectedSignalIds: normalizeSelectedSignalIds(
        resolvedSignalDefinitions.map((signal) => signal.id ?? "")
      ),
      ...(groupDraftResponse
        ? {
            groupDraft: groupDraftResponse
          }
        : {}),
      omittedSignals
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
