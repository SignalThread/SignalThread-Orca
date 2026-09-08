import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CampaignRow = {
  id: string;
  name: string;
  mode: string | null;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  created_at: string;
  subject_line: string | null;
  draft_subject: string | null;
  draft_body_text: string | null;
  scheduled_at: string | null;
};

type CampaignRecipientRow = {
  id: string;
  campaign_id: string;
  lead_id: string;
};

type CampaignMessageRow = {
  id: string;
  campaign_id: string;
  status: string;
  sent_at: string | null;
  subject: string | null;
  body_text: string | null;
  created_at: string;
};

type EmailEventRow = {
  campaign_message_id: string;
  event_type: string;
  created_at: string;
};

type LeadRow = {
  id: string;
  full_name: string | null;
  company_text: string | null;
};

type CampaignMetrics = {
  recipients_count: number;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
  replied_count: number;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  last_sent_at: string | null;
  preview_subject: string | null;
  preview_text: string | null;
  primary_recipient_name: string | null;
  primary_recipient_company: string | null;
};

function normalizeCampaignMode(rawMode: string | null | undefined): "single" | "group" | null {
  const mode = String(rawMode ?? "").trim().toLowerCase();
  if (mode === "single" || mode === "group") return mode;
  if (mode === "individual") return "single";
  return null;
}

export async function GET(request: Request) {
  const loadtestDebug = process.env.LOADTEST_DEBUG === "true";
  const routeName = "campaigns";
  let queryCount = 0;
  const routeStart = Date.now();
  let responseStatus = 500;
  const incrementQueryCount = (label: string) => {
    queryCount += 1;
    if (loadtestDebug) {
      console.log(`[SUPABASE QUERY ${queryCount}] ${label}`);
    }
  };
  if (loadtestDebug) {
    console.log(`[LOADTEST] route=${routeName} phase=start start_ts=${new Date(routeStart).toISOString()}`);
  }
  const respond = (response: NextResponse) => {
    responseStatus = response.status;
    return response;
  };
  try {
    const sessionUser = await resolveApiSession(request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();

    if (role !== "exhibitor_admin" && role !== "platform_admin") {
      return respond(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }
    if (!sessionUser.companyId) {
      return respond(NextResponse.json({ error: "No company assigned" }, { status: 400 }));
    }
    const companyId = sessionUser.companyId;

    const supabase = await createSupabaseServerClient();
    incrementQueryCount("campaigns fetch");
    const { data, error } = (await supabase
      .from("campaigns")
      .select("id, name, mode, status, created_at, subject_line, draft_subject, draft_body_text, scheduled_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })) as {
      data: CampaignRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      console.error("[api/campaigns GET] campaigns fetch failed:", error.message, error.code);
      return respond(NextResponse.json(
        { error: `${error.message} (${error.code ?? "no_code"})` },
        { status: 500 }
      ));
    }

    const campaigns = data ?? [];
    if (campaigns.length === 0) {
      return respond(NextResponse.json({ campaigns: [] }));
    }

    const campaignIds = campaigns.map((campaign) => campaign.id);

    const [recipientsResult, messagesResult] = await Promise.all([
      (async () => {
        incrementQueryCount("campaign_recipients fetch");
        return (await supabase
          .from("campaign_recipients")
          .select("id, campaign_id, lead_id")
          .in("campaign_id", campaignIds)) as {
          data: CampaignRecipientRow[] | null;
          error: { message: string; code?: string } | null;
        };
      })(),
      (async () => {
        incrementQueryCount("campaign_messages fetch");
        return (await supabase
          .from("campaign_messages")
          .select("id, campaign_id, status, sent_at, subject, body_text, created_at")
          .in("campaign_id", campaignIds)) as {
          data: CampaignMessageRow[] | null;
          error: { message: string; code?: string } | null;
        };
      })()
    ]);

    const { data: recipientsData, error: recipientsError } = recipientsResult;
    const { data: messagesData, error: messagesError } = messagesResult;

    if (messagesError) {
      console.error("[api/campaigns GET] campaign_messages fetch failed:", messagesError.message, messagesError.code);
      return respond(NextResponse.json(
        { error: `${messagesError.message} (${messagesError.code ?? "no_code"})` },
        { status: 500 }
      ));
    }

    if (recipientsError) {
      console.error("[api/campaigns GET] campaign_recipients fetch failed:", recipientsError.message, recipientsError.code);
      return respond(NextResponse.json(
        { error: `${recipientsError.message} (${recipientsError.code ?? "no_code"})` },
        { status: 500 }
      ));
    }

    const recipients = recipientsData ?? [];
    const messages = messagesData ?? [];
    const leadIds = [...new Set(recipients.map((recipient) => recipient.lead_id))];

    const messageIds = messages.map((message) => message.id);
    const [leadsResult, eventsResult] = await Promise.all([
      leadIds.length
        ? (async () => {
            incrementQueryCount("leads fetch");
            return (await supabase
              .from("leads")
              .select("id, full_name, company_text")
              .in("id", leadIds)
              .eq("company_id", companyId)) as {
              data: LeadRow[] | null;
              error: { message: string; code?: string } | null;
            };
          })()
        : Promise.resolve({ data: [] as LeadRow[], error: null as { message: string; code?: string } | null }),
      messageIds.length
        ? (async () => {
            incrementQueryCount("email_events fetch");
            return (await supabase
              .from("email_events")
              .select("campaign_message_id, event_type, created_at")
              .in("campaign_message_id", messageIds)) as {
              data: EmailEventRow[] | null;
              error: { message: string; code?: string } | null;
            };
          })()
        : Promise.resolve({
            data: [] as EmailEventRow[],
            error: null as { message: string; code?: string } | null
          })
    ]);

    const { data: leadsData, error: leadsError } = leadsResult;

    if (leadsError) {
      console.error("[api/campaigns GET] leads fetch failed:", leadsError.message, leadsError.code);
      return respond(NextResponse.json(
        { error: `${leadsError.message} (${leadsError.code ?? "no_code"})` },
        { status: 500 }
      ));
    }

    const { data: eventsData, error: eventsError } = eventsResult;

    if (eventsError) {
      console.error("[api/campaigns GET] email_events fetch failed:", eventsError.message, eventsError.code);
      return respond(NextResponse.json(
        { error: `${eventsError.message} (${eventsError.code ?? "no_code"})` },
        { status: 500 }
      ));
    }

    const metricsByCampaign = new Map<string, CampaignMetrics>();
    const previewTimestampByCampaign = new Map<string, string>();
    const leadById = new Map((leadsData ?? []).map((lead) => [lead.id, lead]));
    const messageCampaignById = new Map<string, string>();

    for (const campaign of campaigns) {
      metricsByCampaign.set(campaign.id, {
        recipients_count: 0,
        sent_count: 0,
        opened_count: 0,
        clicked_count: 0,
        replied_count: 0,
        opened_at: null,
        clicked_at: null,
        replied_at: null,
        last_sent_at: null,
        preview_subject: campaign.subject_line ?? campaign.draft_subject ?? null,
        preview_text: campaign.draft_body_text ?? null,
        primary_recipient_name: null,
        primary_recipient_company: null
      });
      previewTimestampByCampaign.set(campaign.id, campaign.created_at);
    }

    for (const recipient of recipients) {
      const metrics = metricsByCampaign.get(recipient.campaign_id);
      if (!metrics) continue;

      metrics.recipients_count += 1;
      if (!metrics.primary_recipient_name || !metrics.primary_recipient_company) {
        const lead = leadById.get(recipient.lead_id);
        if (lead) {
          if (!metrics.primary_recipient_name && lead.full_name) {
            metrics.primary_recipient_name = lead.full_name;
          }
          if (!metrics.primary_recipient_company && lead.company_text) {
            metrics.primary_recipient_company = lead.company_text;
          }
        }
      }
    }

    for (const message of messages) {
      const metrics = metricsByCampaign.get(message.campaign_id);
      if (!metrics) continue;

      messageCampaignById.set(message.id, message.campaign_id);

      if (String(message.status).toLowerCase() === "sent") {
        metrics.sent_count += 1;
      }

      if (message.sent_at && (!metrics.last_sent_at || message.sent_at > metrics.last_sent_at)) {
        metrics.last_sent_at = message.sent_at;
      }

      const currentPreviewTimestamp = previewTimestampByCampaign.get(message.campaign_id) ?? "";
      if (message.created_at >= currentPreviewTimestamp) {
        if (message.subject) {
          metrics.preview_subject = message.subject;
        }
        if (message.body_text) {
          metrics.preview_text = message.body_text;
        }
        previewTimestampByCampaign.set(message.campaign_id, message.created_at);
      }
    }

    for (const event of eventsData ?? []) {
      const campaignId = messageCampaignById.get(event.campaign_message_id);
      if (!campaignId) continue;

      const metrics = metricsByCampaign.get(campaignId);
      if (!metrics) continue;

      const normalizedType = String(event.event_type ?? "").toLowerCase();
      if (normalizedType.includes("open")) {
        metrics.opened_count += 1;
        if (!metrics.opened_at || event.created_at > metrics.opened_at) {
          metrics.opened_at = event.created_at;
        }
        continue;
      }

      if (normalizedType.includes("click")) {
        metrics.clicked_count += 1;
        if (!metrics.clicked_at || event.created_at > metrics.clicked_at) {
          metrics.clicked_at = event.created_at;
        }
        continue;
      }

      if (normalizedType.includes("reply")) {
        metrics.replied_count += 1;
        if (!metrics.replied_at || event.created_at > metrics.replied_at) {
          metrics.replied_at = event.created_at;
        }
      }
    }

    const enrichedCampaigns = campaigns.map((campaign) => {
      const metrics = metricsByCampaign.get(campaign.id) ?? {
        recipients_count: 0,
        sent_count: 0,
        opened_count: 0,
        clicked_count: 0,
        replied_count: 0,
        opened_at: null,
        clicked_at: null,
        replied_at: null,
        last_sent_at: null,
        preview_subject: campaign.subject_line ?? campaign.draft_subject ?? null,
        preview_text: campaign.draft_body_text ?? null,
        primary_recipient_name: null,
        primary_recipient_company: null
      };

      const normalizedStoredMode = normalizeCampaignMode(campaign.mode);
      const normalizedMode =
        metrics.recipients_count > 1
          ? "group"
          : metrics.recipients_count === 1
            ? "single"
            : normalizedStoredMode ?? "group";

      return {
        ...campaign,
        mode: normalizedMode,
        ...metrics
      };
    });

    return respond(NextResponse.json({ campaigns: enrichedCampaigns }));
  } catch (error) {
    if (error instanceof Response) {
      responseStatus = error.status;
      return error;
    }
    console.error("[api/campaigns GET]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return respond(NextResponse.json({ error: message }, { status: 500 }));
  } finally {
    if (loadtestDebug) {
      console.log(`[LOADTEST] route=${routeName} status=${responseStatus} duration_ms=${Date.now() - routeStart} query_count=${queryCount}`);
    }
  }
}

export async function POST(request: Request) {
  const loadtestDebug = process.env.LOADTEST_DEBUG === "true";
  const routeName = "campaigns_post";
  const routeStart = Date.now();
  let responseStatus = 500;
  let queryCount = 0;
  const incrementQueryCount = (label: string) => {
    queryCount += 1;
    if (loadtestDebug) {
      console.log(`[SUPABASE QUERY ${queryCount}] ${label}`);
    }
  };
  if (loadtestDebug) {
    console.log(`[LOADTEST] route=${routeName} phase=start start_ts=${new Date(routeStart).toISOString()}`);
  }
  const respond = (response: NextResponse) => {
    responseStatus = response.status;
    return response;
  };
  try {
    const sessionUser = await resolveApiSession(request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();

    if (role !== "exhibitor_admin" && role !== "platform_admin") {
      return respond(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }

    if (!sessionUser.companyId) {
      return respond(NextResponse.json({ error: "No company assigned" }, { status: 400 }));
    }

    let payload: { name?: string; mode?: "single" | "group" } = {};
    try {
      payload = (await request.json()) as { name?: string; mode?: "single" | "group" };
    } catch {
      payload = {};
    }

    const name = payload.name?.trim() || "Untitled Campaign";
    const mode = payload.mode === "single" ? "single" : "group";

    const supabase = await createSupabaseServerClient();
    incrementQueryCount("campaigns insert");
    const { data, error } = (await supabase
      .from("campaigns")
      .insert({
        company_id: sessionUser.companyId,
        name,
        mode,
        status: "draft",
        created_by: sessionUser.userId
      } as never)
      .select("id")
      .single()) as {
      data: { id: string } | null;
      error: { message: string; code?: string } | null;
    };

    if (error || !data) {
      return respond(NextResponse.json(
        { error: `${error?.message ?? "Failed to create campaign"} (${error?.code ?? "no_code"})` },
        { status: 500 }
      ));
    }

    return respond(NextResponse.json({ campaignId: data.id }));
  } catch (error) {
    if (error instanceof Response) {
      responseStatus = error.status;
      return error;
    }
    console.error("[api/campaigns POST]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return respond(NextResponse.json({ error: message }, { status: 500 }));
  } finally {
    if (loadtestDebug) {
      console.log(`[LOADTEST] route=${routeName} status=${responseStatus} duration_ms=${Date.now() - routeStart} query_count=${queryCount}`);
    }
  }
}
