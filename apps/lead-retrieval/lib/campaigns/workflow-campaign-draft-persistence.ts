import type { createAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

export type PersistWorkflowCampaignDraftInput = {
  supabase: SupabaseAdminClient;
  companyId: string;
  leadId: string;
  campaignName: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  selectedSignalIds: string[];
  subjectLine?: string | null;
  nowIso?: string;
};

export type PersistedWorkflowCampaignDraft = {
  campaignId: string;
  recipientId: string;
  messageId: string;
};

type IdRow = { id: string };

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeIds(ids: string[]) {
  return [...new Set(ids.map(cleanId).filter(Boolean))];
}

export async function persistWorkflowCampaignDraft(
  input: PersistWorkflowCampaignDraftInput
): Promise<PersistedWorkflowCampaignDraft> {
  const companyId = cleanId(input.companyId);
  const leadId = cleanId(input.leadId);
  const campaignName = cleanText(input.campaignName);
  const subject = cleanText(input.subject);
  const bodyText = typeof input.bodyText === "string" ? input.bodyText : "";
  const bodyHtml = input.bodyHtml ?? null;
  const nowIso = input.nowIso ?? new Date().toISOString();

  if (!companyId) throw new Error("Missing company id for workflow campaign draft.");
  if (!leadId) throw new Error("Missing lead id for workflow campaign draft.");
  if (!campaignName) throw new Error("Missing campaign name for workflow campaign draft.");
  if (!subject) throw new Error("Missing subject for workflow campaign draft.");
  if (!bodyText.trim()) throw new Error("Missing body for workflow campaign draft.");

  const selectedSignalIds = dedupeIds(input.selectedSignalIds);
  const campaignId = await ensureWorkflowDraftCampaign({
    supabase: input.supabase,
    companyId,
    campaignName,
    subject,
    bodyText,
    bodyHtml,
    selectedSignalIds,
    subjectLine: input.subjectLine ?? subject,
    nowIso
  });
  const recipientId = await ensureCampaignRecipient({
    supabase: input.supabase,
    campaignId,
    leadId
  });
  const messageId = await ensureDraftMessage({
    supabase: input.supabase,
    campaignId,
    recipientId,
    subject,
    bodyText,
    bodyHtml,
    nowIso
  });

  return { campaignId, recipientId, messageId };
}

async function ensureWorkflowDraftCampaign(input: {
  supabase: SupabaseAdminClient;
  companyId: string;
  campaignName: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  selectedSignalIds: string[];
  subjectLine: string;
  nowIso: string;
}) {
  const { data: existing, error: existingError } = await (input.supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            maybeSingle: () => Promise<{ data: IdRow | null; error: { message: string; code?: string } | null }>;
          };
        };
      };
    };
  })
    .from("campaigns")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("name", input.campaignName)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to look up workflow campaign draft: ${existingError.message}`);
  }

  if (existing?.id) {
    const { error: updateError } = await (input.supabase as unknown as {
      from: (t: string) => {
        update: (patch: unknown) => {
          eq: (col: string, val: unknown) => Promise<{ error: { message: string; code?: string } | null }>;
        };
      };
    })
      .from("campaigns")
      .update({
        status: "draft",
        mode: "single",
        selected_signals: input.selectedSignalIds,
        subject_line: input.subjectLine,
        draft_subject: input.subject,
        draft_body_text: input.bodyText,
        draft_body_html: input.bodyHtml,
        draft_updated_at: input.nowIso
      })
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(`Failed to update workflow campaign draft: ${updateError.message}`);
    }

    return String(existing.id);
  }

  const { data: inserted, error: insertError } = await (input.supabase as unknown as {
    from: (t: string) => {
      insert: (row: unknown) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{ data: IdRow | null; error: { message: string; code?: string } | null }>;
        };
      };
    };
  })
    .from("campaigns")
    .insert({
      company_id: input.companyId,
      name: input.campaignName,
      mode: "single",
      status: "draft",
      selected_signals: input.selectedSignalIds,
      subject_line: input.subjectLine,
      draft_subject: input.subject,
      draft_body_text: input.bodyText,
      draft_body_html: input.bodyHtml,
      draft_updated_at: input.nowIso,
      created_at: input.nowIso
    })
    .select("id")
    .maybeSingle();

  if (insertError || !inserted?.id) {
    throw new Error(`Failed to create workflow campaign draft: ${insertError?.message ?? "missing campaign id"}`);
  }

  return String(inserted.id);
}

async function ensureCampaignRecipient(input: {
  supabase: SupabaseAdminClient;
  campaignId: string;
  leadId: string;
}) {
  const { data: existing, error: existingError } = await (input.supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            maybeSingle: () => Promise<{ data: IdRow | null; error: { message: string; code?: string } | null }>;
          };
        };
      };
    };
  })
    .from("campaign_recipients")
    .select("id")
    .eq("campaign_id", input.campaignId)
    .eq("lead_id", input.leadId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to look up workflow campaign recipient: ${existingError.message}`);
  }
  if (existing?.id) return String(existing.id);

  const { data: inserted, error: insertError } = await (input.supabase as unknown as {
    from: (t: string) => {
      insert: (row: unknown) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{ data: IdRow | null; error: { message: string; code?: string } | null }>;
        };
      };
    };
  })
    .from("campaign_recipients")
    .insert({
      campaign_id: input.campaignId,
      lead_id: input.leadId
    })
    .select("id")
    .maybeSingle();

  if (insertError || !inserted?.id) {
    throw new Error(`Failed to create workflow campaign recipient: ${insertError?.message ?? "missing recipient id"}`);
  }

  return String(inserted.id);
}

async function ensureDraftMessage(input: {
  supabase: SupabaseAdminClient;
  campaignId: string;
  recipientId: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  nowIso: string;
}) {
  const { data: existing, error: existingError } = await (input.supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            maybeSingle: () => Promise<{ data: IdRow | null; error: { message: string; code?: string } | null }>;
          };
        };
      };
    };
  })
    .from("campaign_messages")
    .select("id")
    .eq("campaign_id", input.campaignId)
    .eq("recipient_id", input.recipientId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to look up workflow campaign message: ${existingError.message}`);
  }

  if (existing?.id) {
    const { error: updateError } = await (input.supabase as unknown as {
      from: (t: string) => {
        update: (patch: unknown) => {
          eq: (col: string, val: unknown) => Promise<{ error: { message: string; code?: string } | null }>;
        };
      };
    })
      .from("campaign_messages")
      .update({
        subject: input.subject,
        body_text: input.bodyText,
        body_html: input.bodyHtml,
        status: "draft"
      })
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(`Failed to update workflow campaign message: ${updateError.message}`);
    }

    return String(existing.id);
  }

  const { data: inserted, error: insertError } = await (input.supabase as unknown as {
    from: (t: string) => {
      insert: (row: unknown) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{ data: IdRow | null; error: { message: string; code?: string } | null }>;
        };
      };
    };
  })
    .from("campaign_messages")
    .insert({
      campaign_id: input.campaignId,
      recipient_id: input.recipientId,
      subject: input.subject,
      body_text: input.bodyText,
      body_html: input.bodyHtml,
      status: "draft",
      created_at: input.nowIso
    })
    .select("id")
    .maybeSingle();

  if (insertError || !inserted?.id) {
    throw new Error(`Failed to create workflow campaign message: ${insertError?.message ?? "missing message id"}`);
  }

  return String(inserted.id);
}
