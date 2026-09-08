import { CampaignBuilder } from "@/components/campaigns/campaign-builder";
import { requireAuth } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CampaignDetail = {
  id: string;
  name: string;
  company_id: string;
  mode: "single" | "group";
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  selected_signals?: string[] | null;
  subject_line?: string | null;
  draft_subject?: string | null;
  draft_body_text?: string | null;
  draft_body_html?: string | null;
  draft_updated_at?: string | null;
  created_at: string;
};

type LeadOptionRow = {
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
  priority_score: number;
  temperature: string | null;
  follow_up_date: string | null;
};

type CompanyNameRow = {
  id: string;
  name: string;
};

type EventNameRow = {
  id: string;
  name: string;
};

export default async function CampaignDetailPage({
  params
}: {
  params: Promise<{ campaignId?: string }>;
}) {
  const sessionUser = await requireAuth();
  const { campaignId: rawCampaignId } = await params;
  const campaignId = rawCampaignId?.trim();

  if (!campaignId) {
    redirect("/exhibitor/campaigns");
  }

  const supabase = await createSupabaseServerClient();
  let campaign: CampaignDetail | null = null;
  let campaignError: { message: string; code?: string } | null = null;

  const campaignWithSignals = (await supabase
    .from("campaigns")
    .select(
      "id, name, company_id, mode, status, selected_signals, subject_line, draft_subject, draft_body_text, draft_body_html, draft_updated_at, created_at"
    )
    .eq("id", campaignId)
    .maybeSingle()) as {
      data: CampaignDetail | null;
    error: { message: string; code?: string } | null;
  };

  if (campaignWithSignals.error?.code === "42703") {
    const fallbackCampaign = (await supabase
      .from("campaigns")
      .select("id, name, company_id, mode, status, created_at")
      .eq("id", campaignId)
      .maybeSingle()) as {
      data: CampaignDetail | null;
      error: { message: string; code?: string } | null;
    };
    campaign = fallbackCampaign.data;
    campaignError = fallbackCampaign.error;
  } else {
    campaign = campaignWithSignals.data;
    campaignError = campaignWithSignals.error;
  }

  if (campaignError || !campaign) {
    if (campaignError) {
      console.error("[campaigns/[campaignId]] campaign fetch failed:", campaignError.message, campaignError.code);
    }
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Campaign Builder</h1>
        <div className="rounded-xl border bg-card p-4 text-sm text-rose-600">
          Couldn&apos;t load campaign.
          {campaignError?.message ? <p className="mt-1 text-xs">{campaignError.message}</p> : null}
        </div>
      </section>
    );
  }

  const { data: leadsData, error: leadsError } = (await supabase
    .from("leads")
    .select(
      "id, full_name, email, company_id, event_id, job_title, enriched_job_title, enriched_company_size, enriched_industry, enriched_company_domain, priority_score, temperature, follow_up_date"
    )
    .eq("company_id", campaign.company_id)
    .order("created_at", { ascending: false })) as {
    data: LeadOptionRow[] | null;
    error: { message: string; code?: string } | null;
  };

  const { data: companiesData, error: companiesError } = (await supabase
    .from("companies")
    .select("id, name")
    .eq("id", campaign.company_id)) as {
    data: CompanyNameRow[] | null;
    error: { message: string; code?: string } | null;
  };

  const eventIds = [...new Set((leadsData ?? []).map((lead) => lead.event_id).filter((eventId): eventId is string => Boolean(eventId)))];
  const { data: eventsData, error: eventsError } = eventIds.length
    ? ((await supabase.from("events").select("id, name").in("id", eventIds)) as {
        data: EventNameRow[] | null;
        error: { message: string; code?: string } | null;
      })
    : ({ data: [] as EventNameRow[], error: null } as {
        data: EventNameRow[] | null;
        error: { message: string; code?: string } | null;
      });

  if (leadsError || companiesError || eventsError) {
    if (leadsError) console.error("[campaigns/[campaignId]] leads fetch failed:", leadsError.message, leadsError.code);
    if (companiesError) console.error("[campaigns/[campaignId]] companies fetch failed:", companiesError.message, companiesError.code);
    if (eventsError) console.error("[campaigns/[campaignId]] events fetch failed:", eventsError.message, eventsError.code);
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Campaign Builder</h1>
        <div className="rounded-xl border bg-card p-4 text-sm text-rose-600">
          Couldn&apos;t load campaign audience data.
        </div>
      </section>
    );
  }

  const companyMap = new Map((companiesData ?? []).map((company) => [company.id, company.name]));
  const eventMap = new Map((eventsData ?? []).map((eventRow) => [eventRow.id, eventRow.name]));
  const availableLeads = (leadsData ?? []).map((lead) => ({
    id: lead.id,
    full_name: lead.full_name,
    email: lead.email,
    company: companyMap.get(lead.company_id) ?? "Unknown Company",
    event_name: lead.event_id ? (eventMap.get(lead.event_id) ?? null) : null,
    role: lead.enriched_job_title ?? lead.job_title ?? "",
    company_size: lead.enriched_company_size,
    industry: lead.enriched_industry,
    company_domain: lead.enriched_company_domain,
    priority_score: lead.priority_score,
    temperature: lead.temperature,
    follow_up_date: lead.follow_up_date
  }));

  return (
    <CampaignBuilder
      campaignId={campaign.id}
      initialName={campaign.name}
      mode={campaign.mode}
      status={campaign.status}
      initialSelectedSignalIds={campaign.selected_signals ?? undefined}
      initialSubjectLine={campaign.subject_line ?? null}
      initialDraftSubject={campaign.draft_subject ?? null}
      initialDraftBodyText={campaign.draft_body_text ?? null}
      viewerRole={sessionUser.role}
      availableLeads={availableLeads}
    />
  );
}
