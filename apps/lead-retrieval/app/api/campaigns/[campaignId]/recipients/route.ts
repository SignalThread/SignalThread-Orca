import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { loadLatestCompletedConversationSummaryByLeadId } from "@/lib/campaigns/lead-conversation-summaries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CampaignRow = {
  id: string;
  company_id: string;
};

type LeadRow = {
  id: string;
  full_name: string;
  company_id: string;
  event_id: string | null;
  job_title: string | null;
  priority_score: number;
  follow_up_date: string | null;
};

type CompanyRow = {
  id: string;
  name: string;
};

type EventRow = {
  id: string;
  name: string;
};

function toRating(priorityScore: number) {
  if (priorityScore >= 81) return 5;
  if (priorityScore >= 61) return 4;
  if (priorityScore >= 41) return 3;
  if (priorityScore >= 21) return 2;
  return 1;
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
    const { data: recipientRows, error: recipientError } = (await supabase
      .from("campaign_recipients")
      .select("lead_id")
      .eq("campaign_id", campaign.id)) as {
      data: { lead_id: string }[] | null;
      error: { message: string; code?: string } | null;
    };

    if (recipientError) {
      console.error("[api/campaigns/recipients GET] campaign_recipients fetch failed:", recipientError.message, recipientError.code);
      return NextResponse.json(
        { error: `${recipientError.message} (${recipientError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const leadIds = [...new Set((recipientRows ?? []).map((row) => row.lead_id))];
    if (leadIds.length === 0) {
      return NextResponse.json({ recipients: [] });
    }

    const { data: leadsData, error: leadsError } = (await supabase
      .from("leads")
      .select("id, full_name, company_id, event_id, job_title, priority_score, follow_up_date")
      .in("id", leadIds)
      .eq("company_id", sessionUser.company_id)) as {
      data: LeadRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (leadsError) {
      console.error("[api/campaigns/recipients GET] leads fetch failed:", leadsError.message, leadsError.code);
      return NextResponse.json(
        { error: `${leadsError.message} (${leadsError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const leads = leadsData ?? [];
    const companyIds = [...new Set(leads.map((lead) => lead.company_id))];
    const eventIds = [...new Set(leads.map((lead) => lead.event_id).filter((eventId): eventId is string => Boolean(eventId)))];

    let companyById = new Map<string, string>();
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

      companyById = new Map((companiesData ?? []).map((company) => [company.id, company.name]));
    }

    let eventById = new Map<string, string>();
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

      eventById = new Map((eventsData ?? []).map((eventRow) => [eventRow.id, eventRow.name]));
    }

    const leadById = new Map(leads.map((lead) => [lead.id, lead]));
    const {
      summaryByLeadId,
      error: conversationSummariesError,
    } = await loadLatestCompletedConversationSummaryByLeadId(supabase, leadIds);

    if (conversationSummariesError) {
      return NextResponse.json(
        { error: `${conversationSummariesError.message} (${conversationSummariesError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const recipients = leadIds
      .map((leadId) => {
        const lead = leadById.get(leadId);
        if (!lead) {
          return null;
        }

        return {
          lead_id: lead.id,
          name: lead.full_name,
          company: companyById.get(lead.company_id) ?? "Unknown Company",
          role: lead.job_title ?? "",
          rating: toRating(lead.priority_score),
          priority_score: lead.priority_score,
          follow_up_date: lead.follow_up_date,
          event_name: lead.event_id ? (eventById.get(lead.event_id) ?? null) : null,
          has_ai_summary: summaryByLeadId.has(lead.id),
          latest_ai_summary: summaryByLeadId.get(lead.id) ?? null
        };
      })
      .filter((recipient): recipient is NonNullable<typeof recipient> => Boolean(recipient));

    return NextResponse.json({ recipients });
  } catch (error) {
    console.error("[api/campaigns/recipients GET]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
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

    let payload: { leadIds?: string[] } = {};
    try {
      payload = (await request.json()) as { leadIds?: string[] };
    } catch {
      payload = {};
    }

    const leadIds = [...new Set((payload.leadIds ?? []).map((leadId) => leadId.trim()).filter(Boolean))];
    if (leadIds.length === 0) {
      return NextResponse.json({ recipientCount: 0 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: scopedLeads, error: leadsError } = (await supabase
      .from("leads")
      .select("id")
      .in("id", leadIds)
      .eq("company_id", sessionUser.company_id)) as {
      data: { id: string }[] | null;
      error: { message: string; code?: string } | null;
    };

    if (leadsError) {
      return NextResponse.json(
        { error: `${leadsError.message} (${leadsError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const scopedLeadIds = (scopedLeads ?? []).map((lead) => lead.id);
    if (scopedLeadIds.length === 0) {
      return NextResponse.json({ recipientCount: 0 });
    }

    const { error: upsertError } = await supabase.from("campaign_recipients").upsert(
      scopedLeadIds.map((leadId) => ({ campaign_id: campaign.id, lead_id: leadId })) as never,
      { onConflict: "campaign_id,lead_id", ignoreDuplicates: true }
    );

    if (upsertError) {
      return NextResponse.json(
        { error: `${upsertError.message} (${upsertError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const { count, error: countError } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id);

    if (countError) {
      return NextResponse.json(
        { error: `${countError.message} (${countError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    return NextResponse.json({ recipientCount: count ?? 0 });
  } catch (error) {
    console.error("[api/campaigns/recipients POST]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
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

    let payload: { leadIds?: string[] } = {};
    try {
      payload = (await request.json()) as { leadIds?: string[] };
    } catch {
      payload = {};
    }

    const leadIds = [...new Set((payload.leadIds ?? []).map((leadId) => leadId.trim()).filter(Boolean))];
    if (leadIds.length === 0) {
      return NextResponse.json({ recipientCount: 0 });
    }

    const supabase = await createSupabaseServerClient();
    const { error: deleteError } = await supabase
      .from("campaign_recipients")
      .delete()
      .eq("campaign_id", campaign.id)
      .in("lead_id", leadIds);

    if (deleteError) {
      return NextResponse.json(
        { error: `${deleteError.message} (${deleteError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const { count, error: countError } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id);

    if (countError) {
      return NextResponse.json(
        { error: `${countError.message} (${countError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    return NextResponse.json({ recipientCount: count ?? 0 });
  } catch (error) {
    console.error("[api/campaigns/recipients DELETE]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
