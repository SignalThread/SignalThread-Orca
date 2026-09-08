import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CampaignRow = {
  id: string;
  company_id: string;
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

type RecipientRow = {
  id: string;
  lead_id: string;
  created_at: string;
};

type LeadRow = {
  id: string;
  full_name: string;
  email: string | null;
  event_id: string | null;
  job_title: string | null;
};

type EventRow = {
  id: string;
  name: string;
};

type PreviewMessage = {
  id: string;
  campaign_id: string;
  recipient_id: string;
  lead_id: string;
  full_name: string;
  email: string | null;
  event_name: string | null;
  job_title: string | null;
  subject: string | null;
  body_text: string | null;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  created_at: string;
};

type UpdateDraftPayload = {
  drafts?: Array<{
    leadId?: string;
    subjectText?: string;
    bodyText?: string;
  }>;
};

function toPreviewMessages({
  messages,
  recipients,
  leads,
  eventsById
}: {
  messages: MessageRow[];
  recipients: RecipientRow[];
  leads: LeadRow[];
  eventsById: Map<string, string>;
}): PreviewMessage[] {
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));

  return messages
    .map((message) => {
      const recipient = recipientById.get(message.recipient_id);
      if (!recipient) {
        return null;
      }
      const lead = leadsById.get(recipient.lead_id);
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
        event_name: lead.event_id ? (eventsById.get(lead.event_id) ?? null) : null,
        job_title: lead.job_title,
        subject: message.subject,
        body_text: message.body_text,
        status: message.status,
        created_at: message.created_at
      };
    })
    .filter((message): message is PreviewMessage => Boolean(message));
}

async function getScopedCampaign(campaignId: string, companyId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("campaigns")
    .select("id, company_id")
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

export async function GET(
  _: Request,
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

    const { campaignId: rawCampaignId } = await params;
    const campaignId = rawCampaignId.trim();
    if (!campaignId) {
      return NextResponse.json({ error: "Missing campaign id in route" }, { status: 400 });
    }

    const campaign = await getScopedCampaign(campaignId, sessionUser.company_id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: recipientsData, error: recipientsError } = (await supabase
      .from("campaign_recipients")
      .select("id, lead_id, created_at")
      .eq("campaign_id", campaign.id)
      .order("created_at", { ascending: true })) as {
      data: RecipientRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (recipientsError) {
      console.error("[api/campaigns/messages GET] campaign_recipients fetch failed:", recipientsError.message, recipientsError.code);
      return NextResponse.json(
        { error: `${recipientsError.message} (${recipientsError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const recipients = recipientsData ?? [];
    if (recipients.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    const recipientIds = recipients.map((recipient) => recipient.id);
    const leadIds = recipients.map((recipient) => recipient.lead_id);

    const { data: messagesData, error: messagesError } = (await supabase
      .from("campaign_messages")
      .select("id, campaign_id, recipient_id, subject, body_text, status, created_at")
      .eq("campaign_id", campaign.id)
      .in("recipient_id", recipientIds)
      .order("created_at", { ascending: false })) as {
      data: MessageRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (messagesError) {
      console.error("[api/campaigns/messages GET] campaign_messages fetch failed:", messagesError.message, messagesError.code);
      return NextResponse.json(
        { error: `${messagesError.message} (${messagesError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const { data: leadsData, error: leadsError } = (await supabase
      .from("leads")
      .select("id, full_name, email, event_id, job_title")
      .in("id", leadIds)
      .eq("company_id", sessionUser.company_id)) as {
      data: LeadRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (leadsError) {
      console.error("[api/campaigns/messages GET] leads fetch failed:", leadsError.message, leadsError.code);
      return NextResponse.json(
        { error: `${leadsError.message} (${leadsError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const eventIds = [...new Set((leadsData ?? []).map((lead) => lead.event_id).filter((eventId): eventId is string => Boolean(eventId)))];
    const eventsById = new Map<string, string>();
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
        eventsById.set(eventRow.id, eventRow.name);
      }
    }

    const messages = toPreviewMessages({
      messages: messagesData ?? [],
      recipients,
      leads: leadsData ?? [],
      eventsById
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("[api/campaigns/messages GET]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
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

    const { campaignId: rawCampaignId } = await params;
    const campaignId = rawCampaignId.trim();
    if (!campaignId) {
      return NextResponse.json({ error: "Missing campaign id in route" }, { status: 400 });
    }

    const campaign = await getScopedCampaign(campaignId, sessionUser.company_id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    let payload: UpdateDraftPayload = {};
    try {
      payload = (await request.json()) as UpdateDraftPayload;
    } catch {
      payload = {};
    }

    const drafts = (payload.drafts ?? [])
      .map((draft) => ({
        leadId: draft.leadId?.trim() ?? "",
        subjectText: draft.subjectText ?? "",
        bodyText: draft.bodyText ?? ""
      }))
      .filter((draft) => draft.leadId.length > 0);

    if (drafts.length === 0) {
      return NextResponse.json({ updatedCount: 0 });
    }

    const uniqueLeadIds = [...new Set(drafts.map((draft) => draft.leadId))];
    const supabase = await createSupabaseServerClient();

    const { data: recipientRows, error: recipientError } = (await supabase
      .from("campaign_recipients")
      .select("id, lead_id")
      .eq("campaign_id", campaign.id)
      .in("lead_id", uniqueLeadIds)) as {
      data: RecipientRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (recipientError) {
      return NextResponse.json(
        { error: `${recipientError.message} (${recipientError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const recipientByLeadId = new Map((recipientRows ?? []).map((recipient) => [recipient.lead_id, recipient.id]));
    const rowsToUpsert = drafts
      .map((draft) => {
        const recipientId = recipientByLeadId.get(draft.leadId);
        if (!recipientId) {
          return null;
        }

        return {
          campaign_id: campaign.id,
          recipient_id: recipientId,
          subject: draft.subjectText,
          body_text: draft.bodyText,
          status: "draft"
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    if (rowsToUpsert.length === 0) {
      return NextResponse.json({ updatedCount: 0 });
    }

    const { error: upsertError } = await supabase.from("campaign_messages").upsert(rowsToUpsert as never, {
      onConflict: "campaign_id,recipient_id"
    });

    if (upsertError) {
      return NextResponse.json(
        { error: `${upsertError.message} (${upsertError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    return NextResponse.json({ updatedCount: rowsToUpsert.length });
  } catch (error) {
    console.error("[api/campaigns/messages PATCH]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
