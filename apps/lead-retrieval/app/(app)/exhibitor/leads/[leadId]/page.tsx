import { revalidatePath } from "next/cache";
import { ExhibitorLeadsContextNav } from "@/components/leads/exhibitor-leads-context-nav";
import { ExhibitorLeadDetailTabs } from "@/components/leads/exhibitor-lead-detail-tabs";
import { ExhibitorLeadPreShowBriefPanel } from "@/components/leads/exhibitor-lead-preshow-brief-panel";
import { ExhibitorLeadProfileCard } from "@/components/leads/exhibitor-lead-profile-card";
import { FollowUpEmailButton } from "@/components/leads/follow-up-email-button";
import { EmailActivityList } from "@/components/leads/email-activity-list";
import { GoogleMeetingActivityList, GoogleMeetingPanel } from "@/components/leads/google-meeting-panel";
import {
  EnrichLeadForm,
  type EnrichLeadFormState,
} from "@/components/leads/enrich-lead-form";
import { enrichLead } from "@/lib/enrichment";
import { hasActivePlatformAdminAccountContext, requireExhibitorScope } from "@/lib/auth/session";
import { isExhibitorAdminRole } from "@/lib/auth/role-scope";
import { getUserHasExhibitorWebAdminAccess } from "@/lib/server/exhibitor-permission-aggregates";
import { resolveExhibitorAppActiveEventId } from "@/lib/server/exhibitor-app-active-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseLeadTemperature } from "@/lib/leads/temperature";
import { formatEventLocalDateTime } from "@/lib/events/event-calendar";
import { formatEventLocation } from "@/lib/data/admin-events";
import { parseBriefingContent } from "@/lib/import-wizard/briefing-content-json";
import {
  exhibitorLeadBriefStoredContentHasRenderableAiBriefSections
} from "@/lib/leads/exhibitorLeadAiBriefRenderable";
import { buildPreShowBriefSections } from "@/lib/leads/exhibitor-lead-preshow-brief-sections";
import { deriveConversationDisplayStatus } from "@/lib/conversations/conversation-lifecycle";
import {
  buildCanonicalConversationIntelligence,
  selectCanonicalConversationIntelligence
} from "@/lib/conversations/conversation-intelligence-read-model";
import {
  disconnectedGoogleWorkspaceStatus,
  getGoogleWorkspaceConnectionStatus
} from "@/lib/integrations/google/connection-status";
import { listEmailActivitiesForLead } from "@/lib/integrations/email/send-service";
import { resolveEmailProviderForUser } from "@/lib/integrations/email/provider-preference";
import { listGoogleMeetingsForLead } from "@/lib/integrations/google/calendar-service";
import { getPipedriveConnectionStatus } from "@/lib/integrations/pipedrive/connection-service";
import { getPipedriveLeadSyncState } from "@/lib/integrations/pipedrive/sync-state";
import { PipedriveLeadSyncControl } from "@/components/exhibitor/pipedrive-lead-sync-control";

type SearchParams = {
  eventId?: string;
  view?: string;
  q?: string;
};

type LeadProfile = {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  company_text: string | null;
  linkedin_url: string | null;
  company_domain: string | null;
  industry: string | null;
  company_size: string | null;
  seniority: string | null;
  intent_signals: unknown;
  rating: number;
  temperature: "hot" | "warm" | "cold" | null;
  priority_score: number;
  status: "new" | "follow_up" | "closed";
  follow_up_date: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
  /** Legacy columns; used only as read fallback until backfill / migration. */
  enriched_job_title?: string | null;
  enriched_linkedin_url?: string | null;
  enriched_company_domain?: string | null;
  enriched_industry?: string | null;
  enriched_company_size?: string | null;
  enriched_seniority?: string | null;
};

function nonEmptyText(value: string | null | undefined): string | null {
  const t = String(value ?? "").trim();
  return t === "" ? null : t;
}

function canonicalOrLegacy(
  canonical: string | null | undefined,
  legacy: string | null | undefined
): string | null {
  return nonEmptyText(canonical) ?? nonEmptyText(legacy);
}

function canonicalJobTitleOrLegacy(
  jobTitle: string | null | undefined,
  enrichedJobTitle: string | null | undefined
): string | null {
  return nonEmptyText(jobTitle) ?? nonEmptyText(enrichedJobTitle);
}

type EventRow = {
  id: string;
  name: string;
  location: string | null;
  city: string | null;
  state: string | null;
  timezone: string | null;
};

type CompanyRow = { name: string | null };

type LeadConversationInsight = {
  id: string;
  summary: string | null;
  transcript?: string | null;
  sentiment: string | null;
  objections: string[] | null;
  next_steps: string[] | null;
  competitors_mentioned?: string[] | null;
  pain_points?: string[] | null;
  feature_requests?: string[] | null;
  buying_signals?: string[] | null;
  operational_pains?: string[] | null;
  workflow_constraints?: string[] | null;
  technical_constraints?: string[] | null;
  desired_outcomes?: string[] | null;
  adoption_risks?: string[] | null;
  management_visibility_needs?: string[] | null;
  business_process_concerns?: string[] | null;
  product_objections?: string[] | null;
  rep_behavior_patterns?: string[] | null;
  priority_themes?: string[] | null;
  problem_severity?: string | null;
  buying_intent?: string | null;
  transcription_status?: string | null;
  synthesis_status: string | null;
  transcription_error?: string | null;
  synthesis_error?: string | null;
  storage_path?: string | null;
  recording_url?: string | null;
  audio_url?: string | null;
  created_at: string;
};

type LeadBriefingRow = {
  id: string;
  company_id: string;
  content: unknown;
  approval_status: string | null;
  updated_at: string;
};

function formatDateTime(value: string | null | undefined, timeZone: string | null | undefined) {
  if (!value || !timeZone) return "Timezone not configured";
  return formatEventLocalDateTime(value, timeZone) ?? "Timezone not configured";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) return "NA";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function normalizedSentiment(sentiment: string | null | undefined) {
  const value = String(sentiment ?? "")
    .trim()
    .toLowerCase();
  if (!value)
    return { label: "Unknown", className: "bg-slate-100 text-slate-700" };
  if (value.includes("positive")) {
    return { label: "Positive", className: "bg-emerald-100 text-emerald-700" };
  }
  if (value.includes("negative")) {
    return { label: "Negative", className: "bg-rose-100 text-rose-700" };
  }
  if (value.includes("neutral")) {
    return { label: "Neutral", className: "bg-amber-100 text-amber-700" };
  }
  return {
    label: sentiment ?? "Unknown",
    className: "bg-slate-100 text-slate-700",
  };
}

function ConversationIntelligenceList({
  title,
  items
}: {
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={`${title}-${index}-${item}`}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Playback URL helper — not used in UI until conversation audio is live. */
function resolveConversationAudioUrl(
  conversation: LeadConversationInsight | null,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  if (!conversation) return null;

  const path = String(conversation.storage_path ?? "").trim();
  if (path) {
    const { data } = supabase.storage.from("conversations").getPublicUrl(path);
    const publicUrl = String(data?.publicUrl ?? "").trim();
    if (publicUrl) {
      return publicUrl;
    }
  }

  const directUrl = [conversation.audio_url, conversation.recording_url]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);
  return directUrl ?? null;
}

function eventLocation(event: EventRow | null) {
  if (!event) return "-";
  return formatEventLocation(event.city, event.state, event.location);
}

export default async function ExhibitorLeadProfilePage({
  params,
  searchParams,
}: {
  params: { leadId: string } | Promise<{ leadId: string }>;
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const sessionUser = await requireExhibitorScope();
  const platformAdminAccountContextActive = hasActivePlatformAdminAccountContext(sessionUser);
  const companyIdForWeb = String(sessionUser.company_id ?? "").trim();
  const hasWeb = platformAdminAccountContextActive ||
    (companyIdForWeb.length > 0
      ? await getUserHasExhibitorWebAdminAccess(sessionUser.id, companyIdForWeb)
      : false);
  const canEdit = (isExhibitorAdminRole(sessionUser.role) || platformAdminAccountContextActive) && hasWeb;
  const supabase = await createSupabaseServerClient();
  const resolvedParams = await Promise.resolve(params as any);
  const resolvedSearchParams = await Promise.resolve(
    (searchParams ?? {}) as any,
  );
  const leadId = String(resolvedParams?.leadId ?? "").trim();
  const isDev = process.env.NODE_ENV !== "production";
  const isRouteDebugEnabled = process.env.LEAD_ROUTE_DEBUG === "1";
  const isBriefingRlsDebugEnabled = process.env.LEAD_BRIEFING_RLS_DEBUG === "1";

  async function enrichLeadAction(
    _: EnrichLeadFormState,
    formData: FormData,
  ): Promise<EnrichLeadFormState> {
    "use server";

    const leadId = String(formData.get("leadId") ?? "").trim();
    if (!leadId) {
      return {
        message: "Lead id is missing",
        tone: "error",
      };
    }

    try {
      const result = await enrichLead(leadId);
      revalidatePath(`/exhibitor/leads/${leadId}`);
      revalidatePath("/exhibitor/leads");
      if (result.outcome === "updated") {
        return {
          message: "Lead enriched successfully.",
          tone: "success",
        };
      }
      return {
        message:
          "No enrichment data was found for this lead, or the provider returned no usable firmographic fields. Profile fields were not updated.",
        tone: "info",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Enrichment failed";
      if (message === "No valid enrichment identifiers available") {
        return {
          message:
            "Add an email or a LinkedIn profile URL to enrich this lead.",
          tone: "error",
        };
      }
      return {
        message,
        tone: "error",
      };
    }
  }

  const companyId = sessionUser.company_id ?? null;
  const requestedEventId = String(resolvedSearchParams?.eventId ?? "").trim() || null;
  const activeEventId = isExhibitorAdminRole(sessionUser.role)
    ? await resolveExhibitorAppActiveEventId(sessionUser.id, requestedEventId)
    : requestedEventId;

  if (!companyId) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Lead Profile</h1>
        <p className="text-sm text-slate-600">No company assigned.</p>
      </section>
    );
  }

  if (isRouteDebugEnabled) {
    console.info("LEAD_ROUTE_DEBUG", {
      resolvedParams,
      resolvedSearchParams,
      leadId,
      sessionUserId: sessionUser.id,
      companyId,
    });
  }

  const leadQuery = supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("company_id", companyId);
  if (activeEventId) {
    leadQuery.eq("event_id", activeEventId);
  } else {
    leadQuery.in("event_id", []);
  }
  const { data: rawLead, error } = (await leadQuery.maybeSingle()) as {
    data: LeadProfile | null;
    error: { message: string } | null;
  };

  const lead = rawLead as LeadProfile | null;

  if (error || !lead) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Lead Profile</h1>
        <div className="rounded-xl border bg-card p-4 text-sm text-rose-600">
          Not found or not authorized.
          {isDev ? (
            <p className="mt-1 text-xs">
              {error?.message ?? "Lead not found for this company."}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  const canonicalTemperature = parseLeadTemperature((lead as Record<string, unknown>).temperature);

  const { data: event } = lead.event_id
    ? ((await supabase
        .from("events")
        .select("id, name, location, city, state, timezone")
        .eq("id", lead.event_id)
        .maybeSingle()) as { data: EventRow | null })
    : { data: null as EventRow | null };

  const { data: company } = (await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle()) as { data: CompanyRow | null };

  const { data: rawConversationRows } = (await supabase
    .from("lead_conversations")
    .select("*")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(50)) as { data: LeadConversationInsight[] | null };

  const latestConversation = selectCanonicalConversationIntelligence(
    rawConversationRows ?? []
  ) as LeadConversationInsight | null;
  const { data: rawCumulativeIntelligence } = (await supabase
    .from("lead_cumulative_insights")
    .select("status, insights_json")
    .eq("lead_id", lead.id)
    .eq("company_id", companyId)
    .maybeSingle()) as {
    data: { status: string | null; insights_json: unknown } | null;
  };
  const canonicalIntelligence = buildCanonicalConversationIntelligence(
    latestConversation,
    rawCumulativeIntelligence
  );
  const { data: rawLeadBriefing, error: rawLeadBriefingError } = (await supabase
    .from("lead_briefings")
    .select("id, company_id, content, approval_status, updated_at")
    .eq("lead_id", lead.id)
    .eq("company_id", companyId)
    .maybeSingle()) as {
    data: LeadBriefingRow | null;
    error: { message: string } | null;
  };

  if (isBriefingRlsDebugEnabled) {
    const { data: rpcCurrentCompanyId, error: rpcCompanyIdError } =
      await supabase.rpc("current_company_id");
    const { data: rpcCurrentRole, error: rpcRoleError } =
      await supabase.rpc("current_role");
    const { data: debugUserRow } = (await supabase
      .from("users")
      .select("company_id, role")
      .eq("id", sessionUser.id)
      .maybeSingle()) as {
      data: { company_id: string | null; role: string } | null;
    };

    console.info("LEAD_BRIEFING_RLS_DEBUG", {
      sessionUserId: sessionUser.id,
      resolvedCompanyId: companyId,
      usersTableCompanyId: debugUserRow?.company_id ?? null,
      usersTableRole: debugUserRow?.role ?? null,
      rpcCurrentCompanyId: rpcCurrentCompanyId ?? null,
      rpcCurrentRole: rpcCurrentRole ?? null,
      rpcCompanyIdError: rpcCompanyIdError?.message ?? null,
      rpcRoleError: rpcRoleError?.message ?? null,
      leadCompanyId: lead.company_id,
      leadBriefingSelectError: rawLeadBriefingError?.message ?? null,
      visibleLeadBriefingCompanyId: rawLeadBriefing?.company_id ?? null,
      visibleLeadBriefingId: rawLeadBriefing?.id ?? null,
    });
  }

  const storedBriefing = parseBriefingContent(rawLeadBriefing?.content as any);
  const briefingSections = buildPreShowBriefSections(storedBriefing);
  const briefingHasSections = exhibitorLeadBriefStoredContentHasRenderableAiBriefSections(storedBriefing);

  const latestConversationSummary =
    String(canonicalIntelligence?.summary ?? latestConversation?.summary ?? "").trim() || null;
  const conversationDisplayStatus = deriveConversationDisplayStatus(latestConversation);
  const ts = String(latestConversation?.transcription_status ?? "").trim().toLowerCase();
  const ss = String(latestConversation?.synthesis_status ?? "").trim().toLowerCase();
  const hasConversationTranscript = Boolean(
    String(latestConversation?.transcript ?? "").trim(),
  );
  const insightFailed =
    Boolean(latestConversation) &&
    (ts === "failed" || ss === "failed");
  const insightPending =
    Boolean(latestConversation) &&
    !insightFailed &&
    (ts === "pending" ||
      ts === "processing" ||
      ss === "pending" ||
      ss === "processing" ||
      (ts === "completed" &&
        hasConversationTranscript &&
        ss !== "completed" &&
        ss !== "failed"));
  const sentiment = normalizedSentiment(canonicalIntelligence?.sentiment ?? latestConversation?.sentiment);
  const objections = canonicalIntelligence?.objections ?? [];
  const nextSteps = canonicalIntelligence?.next_steps ?? [];
  const priorityThemes = canonicalIntelligence?.priority_themes ?? [];
  const painPoints = canonicalIntelligence?.pain_points ?? [];
  const buyingSignals = canonicalIntelligence?.buying_signals ?? [];
  const competitorsMentioned = canonicalIntelligence?.competitors_mentioned ?? [];
  const desiredOutcomes = canonicalIntelligence?.desired_outcomes ?? [];

  const eventIdForNav = resolvedSearchParams?.eventId ? String(resolvedSearchParams.eventId) : null;
  const [googleConnection, emailResolution, emailActivities, googleMeetings, pipedriveConnection, pipedriveSyncState] = await Promise.all([
    canEdit
      ? getGoogleWorkspaceConnectionStatus(sessionUser.id, companyId).catch(() => disconnectedGoogleWorkspaceStatus())
      : Promise.resolve(disconnectedGoogleWorkspaceStatus()),
    canEdit
      ? resolveEmailProviderForUser({ userId: sessionUser.id, companyId }).catch(() => ({ ok: false as const, outcome: "missing_connection" as const }))
      : Promise.resolve({ ok: false as const, outcome: "missing_connection" as const }),
    listEmailActivitiesForLead({ companyId, leadId: lead.id }).catch(() => []),
    listGoogleMeetingsForLead({ companyId, leadId: lead.id }).catch(() => []),
    canEdit
      ? getPipedriveConnectionStatus(companyId).catch(() => ({ connected: false }))
      : Promise.resolve({ connected: false }),
    canEdit
      ? getPipedriveLeadSyncState(companyId, lead.id).catch(() => ({ state: "unsent" as const, lastError: null, syncedAt: null }))
      : Promise.resolve({ state: "unsent" as const, lastError: null, syncedAt: null })
  ]);

  return (
    <section className="space-y-4">
      <ExhibitorLeadDetailTabs
        leading={
          <ExhibitorLeadsContextNav
            variant="detail"
            eventId={eventIdForNav}
            leadsListQuery={{
              view: resolvedSearchParams?.view ? String(resolvedSearchParams.view) : null,
              q: resolvedSearchParams?.q ? String(resolvedSearchParams.q) : null
            }}
          />
        }
        toolbarEnrich={
          canEdit ? (
            <EnrichLeadForm
              compact
              primary
              rowLayout
              leadId={lead.id}
              action={enrichLeadAction}
              submitLabel="Enrich Data"
              pendingLabel="Enriching…"
            />
          ) : null
        }
        toolbarEmail={
          <FollowUpEmailButton
            leadId={lead.id}
            leadName={lead.full_name}
            recipientEmail={lead.email}
            availability={emailResolution.ok ? "ready" : emailResolution.outcome}
            provider={emailResolution.ok ? emailResolution.connection.provider : null}
            senderEmail={emailResolution.ok ? emailResolution.connection.senderEmail : null}
            senderName={emailResolution.ok ? emailResolution.connection.senderName : null}
            companyName={company?.name ?? null}
            eventName={event?.name ?? null}
          />
        }
        toolbarMeeting={
          canEdit ? (
            <GoogleMeetingPanel
              leadId={lead.id}
              leadName={lead.full_name}
              recipientEmail={lead.email}
              connectionStatus={googleConnection.status}
              calendarFreeBusy={googleConnection.capabilities.calendarFreeBusy}
              calendarEventsOwned={googleConnection.capabilities.calendarEventsOwned}
              meetings={googleMeetings}
            />
          ) : null
        }
        toolbarPipedrive={
          canEdit && pipedriveConnection.connected ? (
            <PipedriveLeadSyncControl leadId={lead.id} connected initialState={pipedriveSyncState.state} />
          ) : null
        }
        profile={
          <div id="lead-profile">
            <ExhibitorLeadProfileCard
              canEdit={canEdit}
              leadId={lead.id}
              initialFullName={lead.full_name}
              initialJobTitle={canonicalJobTitleOrLegacy(lead.job_title, lead.enriched_job_title)}
              initialCompanyText={lead.company_text}
              initialLinkedinUrl={canonicalOrLegacy(lead.linkedin_url, lead.enriched_linkedin_url)}
              initialCompanyDomain={canonicalOrLegacy(lead.company_domain, lead.enriched_company_domain)}
              initialIndustry={canonicalOrLegacy(lead.industry, lead.enriched_industry)}
              initialCompanySize={canonicalOrLegacy(lead.company_size, lead.enriched_company_size)}
              initialSeniority={canonicalOrLegacy(lead.seniority, lead.enriched_seniority)}
              initialIntentSignals={lead.intent_signals}
              initialRating={Number(lead.rating ?? 0)}
              initialTemperature={canonicalTemperature}
              initialFollowUpDate={lead.follow_up_date}
              initialEmail={lead.email}
              createdAtLabel={formatDateTime(lead.created_at, event?.timezone)}
              eventName={event?.name ?? "-"}
              locationLabel={eventLocation(event)}
            />
            <EmailActivityList activities={emailActivities} />
            <GoogleMeetingActivityList meetings={googleMeetings} leadId={lead.id} leadName={lead.full_name} />
          </div>
        }
        insights={
          <article
            id="lead-insights"
            className="rounded-2xl border border-slate-200 bg-card p-6 shadow-sm ring-1 ring-slate-200/60"
          >
            <div className="border-b border-slate-100 pb-5">
              <h2 className="text-2xl font-bold tracking-tight text-slate-950">
                AI Conversation Insights
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Summary and intelligence from the latest conversation.
              </p>
            </div>

            <section className="mt-6 space-y-2">
              <h3 className="text-lg font-semibold text-slate-900">
                Conversation Brief Agent
              </h3>
              <p className="text-sm leading-6">
                {insightFailed
                  ? conversationDisplayStatus.description
                  : latestConversationSummary ??
                    (insightPending
                      ? conversationDisplayStatus.description
                      : "No conversation summary available.")}
              </p>
            </section>

            {!latestConversation ? (
              <p className="mt-4 text-sm text-slate-600">
                No conversation insights yet.
              </p>
            ) : insightFailed ? null : insightPending ? null : latestConversation.synthesis_status === "completed" ? (
              <div className="mt-5 space-y-5 text-slate-700">
                <section className="space-y-2">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Conversation Sentiment
                  </h3>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${sentiment.className}`}
                  >
                    {sentiment.label}
                  </span>
                </section>

                <ConversationIntelligenceList title="Priority Themes" items={priorityThemes} />
                <ConversationIntelligenceList title="Pain Points & Needs" items={painPoints} />
                <ConversationIntelligenceList title="Buying Signals" items={buyingSignals} />
                <ConversationIntelligenceList title="Competitors Mentioned" items={competitorsMentioned} />
                <ConversationIntelligenceList title="Desired Outcomes" items={desiredOutcomes} />

                <section className="space-y-2">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Key Objections &amp; Concerns
                  </h3>
                  {objections.length === 0 ? (
                    <p className="text-sm text-slate-600">
                      No objections captured.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {objections.map((objection, index) => (
                        <li
                          key={`objection-${index}-${objection}`}
                          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-0.5 text-amber-500"
                          >
                            ⚠
                          </span>
                          <span>{objection}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="space-y-2">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Recommended Next Steps
                  </h3>
                  {nextSteps.length === 0 ? (
                    <p className="text-sm text-slate-600">
                      No next steps captured.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {nextSteps.map((step, index) => (
                        <li
                          key={`next-step-${index}-${step}`}
                          className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-400"
                          />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">
                Insights are not available yet.
              </p>
            )}
          </article>
        }
        brief={
          <article className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 shadow-sm sm:p-8">
            <ExhibitorLeadPreShowBriefPanel
              leadFullName={lead.full_name}
              companyText={lead.company_text}
              temperature={canonicalTemperature}
              rawLeadBriefing={rawLeadBriefing}
              briefingUpdatedAt={rawLeadBriefing?.updated_at ?? null}
              briefingHasSections={briefingHasSections}
              briefingSections={briefingSections}
            />
          </article>
        }
      />
    </section>
  );
}
