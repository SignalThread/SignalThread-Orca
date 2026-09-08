import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * Source contracts for the canonical Event Workspace at /exhibitor/dashboard:
 * lifecycle dispatch, the Phase 1 boundary (no deeper intelligence
 * dashboards), and the staged-compatibility rules for Live/Completed.
 */

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const pageSrc = read("app/(app)/exhibitor/dashboard/page.tsx");
const shellSrc = read("app/(app)/exhibitor/dashboard/event-workspace-shell.tsx");
const upcomingSrc = read("app/(app)/exhibitor/dashboard/upcoming-state.tsx");
const liveSrc = read("app/(app)/exhibitor/dashboard/live-state.tsx");
const completedSrc = read("app/(app)/exhibitor/dashboard/completed-state.tsx");
const drawerSrc = read("app/(app)/exhibitor/dashboard/evidence-drawer.tsx");
const liveCoreSrc = read("lib/events/event-workspace-live-core.ts");
const liveLoaderSrc = read("lib/server/event-workspace-live-data.ts");
const completedLoaderSrc = read("lib/server/event-workspace-completed-data.ts");
const metricLoaderSrc = read("lib/server/dashboard-event-lead-metrics.ts");
const metricMigrationSrc = read("supabase/migrations/0098_dashboard_truth_event_timezone.sql");
const workspaceSources = [pageSrc, shellSrc, upcomingSrc, liveSrc, completedSrc, drawerSrc].join("\n");

describe("event workspace — canonical lifecycle dispatch", () => {
  it("the page resolves lifecycle through the canonical resolver, not status mapping", () => {
    assert.match(pageSrc, /resolveEventLifecycle\(eventRow, todayYmd\)/);
    assert.doesNotMatch(pageSrc, /eventPortfolioLifecycleForStatus/);
  });

  it("upcoming renders the Event Readiness body and never the legacy compatibility body", () => {
    const upcomingBranch = pageSrc.slice(
      pageSrc.indexOf('if (lifecycle === "upcoming")'),
      pageSrc.indexOf('if (lifecycle === "live")')
    );
    assert.ok(upcomingBranch.length > 0, "page has an explicit upcoming branch");
    assert.match(upcomingBranch, /UpcomingEventReadinessBody/);
    assert.doesNotMatch(upcomingBranch, /LegacySummaryBody/);
  });

  it("live renders the full Live state", () => {
    const liveBranch = pageSrc.slice(
      pageSrc.indexOf('if (lifecycle === "live")'),
      pageSrc.indexOf("Completed → Post-Event Workspace (full state)")
    );
    assert.ok(liveBranch.length > 0, "page has an explicit live branch");
    assert.match(liveBranch, /LiveEventBody/);
    assert.match(liveBranch, /loadEventWorkspaceLiveData/);
    assert.match(liveBranch, /deriveLiveWorkspace/);
  });

  it("hydrates the full canonical intelligence contract and exposes legacy-schema coverage", () => {
    assert.match(liveLoaderSrc, /from\("lead_cumulative_insights"\)/);
    assert.match(liveLoaderSrc, /buildCanonicalConversationIntelligence/);
    assert.match(liveLoaderSrc, /transcript.*synthesis_error/s);
    assert.match(liveCoreSrc, /isNoSpeechConversation/);
    assert.match(liveSrc, /legacy summary format/);
  });

  it("completed renders the full Post-Event state", () => {
    const completedBranch = pageSrc.slice(
      pageSrc.indexOf("Completed → Post-Event Workspace (full state)"),
      pageSrc.indexOf("Event details unavailable")
    );
    assert.ok(completedBranch.length > 0, "page has an explicit completed branch");
    assert.match(completedBranch, /CompletedEventBody/);
    assert.match(completedBranch, /loadEventWorkspaceCompletedData/);
    assert.match(completedBranch, /deriveCompletedWorkspace/);
  });

  it("a failed events row renders an honest degraded state — never a guessed lifecycle body", () => {
    const fallback = pageSrc.slice(pageSrc.indexOf("Event details unavailable"));
    assert.match(fallback, /could not be loaded/);
    assert.doesNotMatch(fallback, /LiveEventBody|UpcomingEventReadinessBody|CompletedEventBody/);
  });

  it("the legacy generic dashboard is fully removed", () => {
    assert.doesNotMatch(workspaceSources, /LegacySummaryBody|legacy-summary-body/);
    assert.doesNotMatch(workspaceSources, /Leads Over Time|Priority distribution|computeLeadsTimeline/);
    assert.doesNotMatch(workspaceSources, /DASHBOARD_SUMMARY_VIEWS|priorityBucketCount|countLeadsMatchingView/);
    assert.throws(
      () => read("app/(app)/exhibitor/dashboard/legacy-summary-body.tsx"),
      "adapter file must be deleted"
    );
    assert.throws(
      () => read("app/(app)/exhibitor/dashboard/event-command-center-view.tsx"),
      "old command-center view must be deleted"
    );
    // The contradictory score-band "hot" wiring is gone from the drilldown lib.
    const drilldownSrc = read("lib/leads/exhibitorLeadsDrilldown.ts");
    assert.doesNotMatch(drilldownSrc, /DASHBOARD_SUMMARY_VIEWS|priorityBucketCount|Score 80\+/);
  });

  it("no user-facing lifecycle selector exists", () => {
    assert.doesNotMatch(workspaceSources, /Setup \/ Live|lifecycle (switch|toggle|selector)/i);
  });
});

describe("event workspace — canonical data semantics", () => {
  it("every workspace lead aggregate is company + event scoped", () => {
    for (const loaderSrc of [liveLoaderSrc, completedLoaderSrc]) {
      assert.match(loaderSrc, /loadDashboardEventLeadMetrics\(\{ companyId, eventIds: \[eventId\]/);
    }
    assert.match(metricLoaderSrc, /p_company_id: input\.companyId/);
    assert.match(metricLoaderSrc, /p_event_ids: \[\.\.\.input\.eventIds\]/);
    assert.match(metricMigrationSrc, /where e\.company_id = p_company_id[\s\S]*e\.id = any\(p_event_ids\)/);
  });

  it("the events row comes from the shared workspace loader (one narrow path)", () => {
    assert.match(pageSrc, /loadEventWorkspaceEventRow\(eventId\)/);
    const loaderSrc = read("lib/server/event-workspace-data.ts");
    assert.match(
      loaderSrc,
      /select\("id, name, status, start_date, end_date, city, state, location, timezone, container_kind, briefing_strategy"\)/
    );
    assert.match(loaderSrc, /degrades? to `null`/i);
  });

  it("readiness data loads through the single scoped loader with null degradation", () => {
    assert.match(pageSrc, /loadEventWorkspaceReadinessData\(\{ companyId, eventId \}\)/);
    assert.match(pageSrc, /deriveEventReadiness\(/);
  });
});

describe("event workspace — access invariants preserved", () => {
  it("uses requireExhibitorScope (viewer-inclusive) and web-admin gating", () => {
    assert.match(pageSrc, /await\s+requireExhibitorScope\s*\(\s*\)/);
    assert.match(pageSrc, /isExhibitorAdminRole\(sessionUser\.role\) \|\| platformAdminAccountContextActive/);
    assert.match(pageSrc, /\|\|\s*allowsManagementSurfaces/);
    assert.match(pageSrc, /getUserHasExhibitorWebAdminAccess/);
  });

  it("explicit accessible selection is preserved; invalid URL ids self-correct", () => {
    assert.match(pageSrc, /exhibitorShouldPromptEventChoice/);
    assert.match(
      pageSrc,
      /redirect\(`\/exhibitor\/dashboard\?eventId=\$\{encodeURIComponent\(resolvedEventId\)\}`\)/
    );
  });

  it("viewer readiness is read-only: the body takes canManage and the core suppresses actions", () => {
    assert.match(pageSrc, /<UpcomingEventReadinessBody readiness=\{readiness\} canManage=\{canManage\} \/>/);
    const coreSrc = read("lib/events/event-workspace-readiness-core.ts");
    assert.match(coreSrc, /input\.canManage && href/);
  });
});

describe("event workspace — Phase 1 boundary (no intelligence suite)", () => {
  it("no forbidden deeper-dashboard controls or labels appear anywhere in the workspace", () => {
    const forbidden = [
      /Real-?Time Intelligence/i,
      /Open Real-?Time/i,
      /Executive Intelligence/i,
      /Open Executive/i,
      /View Coaching/i,
      /Coaching Dashboard/i,
      /Product & Market/i,
      /Open intelligence/i,
      /coming soon/i
    ];
    for (const pattern of forbidden) {
      assert.doesNotMatch(workspaceSources, pattern);
    }
  });

  it("no intelligence tab bar and no dead prototype affordances", () => {
    assert.doesNotMatch(workspaceSources, /tab(bar|list)|role="tab"/i);
    assert.doesNotMatch(workspaceSources, /toast/i);
  });

  it("no standalone event-setup route is referenced (briefings setup is an existing workflow)", () => {
    assert.doesNotMatch(workspaceSources, /app\/events\/[^"'`\s]*\/setup/);
    assert.doesNotMatch(workspaceSources, /events\/\$\{[^}]*\}\/setup/);
  });

  it("every workspace destination is an existing production route", () => {
    const hrefs = [...workspaceSources.matchAll(/href=\{?["'`]([^"'`}]+)["'`]\}?/g)].map((m) => m[1]);
    for (const href of hrefs) {
      assert.match(
        href,
        /^\/(exhibitor\/(leads|campaigns|users|settings|briefings\/setup|import\/wizard|workflows\/approvals|dashboard)|app\/(events|settings))/,
        `unexpected destination: ${href}`
      );
    }
  });

  it("drafts review is offered only behind the workflows flag and admin permission", () => {
    assert.match(pageSrc, /canManage && isWorkflowsEnabled\(\)/);
    assert.match(completedLoaderSrc, /isWorkflowsEnabled\(\)\s*\n?\s*\?/);
  });

  it("no unsupported exports, revenue, ROI, or benchmark claims ship in the completed state", () => {
    // Rendered view text only — core doc comments legitimately explain why
    // these claims are absent.
    assert.doesNotMatch(completedSrc, /Export recap|pipeline|revenue|ROI|vs\.? (past|prior|previous)/i);
    assert.doesNotMatch(completedSrc, /median first touch|uncontacted/i);
    // And the core never emits dollar or percent claims in its strings.
    const completedCoreSrc = read("lib/events/event-workspace-completed-core.ts");
    assert.doesNotMatch(completedCoreSrc, /\$\d|\d+%|\bEST\b|CRM \$/);
  });
});

describe("event workspace — live data and evidence contracts", () => {
  it("conversation queries are scoped through the lead join with company AND event filters", () => {
    const conversationSelects = liveLoaderSrc.match(/from\("lead_conversations"\)[\s\S]*?limit\(|from\("lead_conversations"\)[\s\S]*?head: true/g) ?? [];
    assert.ok(conversationSelects.length >= 2, "conversation row + count queries exist");
    for (const block of conversationSelects) {
      assert.match(block, /leads!inner/, "conversations must join through leads");
      assert.match(block, /\.eq\("leads\.company_id", companyId\)/, "company scope required");
      assert.match(block, /\.eq\("leads\.event_id", eventId\)/, "event scope required");
    }
  });

  it("live lead metrics use the single scoped DB aggregate instead of row reads", () => {
    assert.doesNotMatch(liveLoaderSrc, /\.from\("leads"\)/);
    assert.match(liveLoaderSrc, /loadDashboardEventLeadMetrics\(\{ companyId, eventIds: \[eventId\]/);
  });

  it("hot uses the canonical temperature definition — no score-band hot in the live path", () => {
    assert.match(metricMigrationSrc, /lower\(coalesce\(l\.temperature, ''\)\) = 'hot'/);
    assert.doesNotMatch(liveLoaderSrc + liveSrc + liveCoreSrc + metricMigrationSrc, /priority_score|scoreToPriorityLevel/);
  });

  it("derives compact follow-up states from the canonical scoped aggregate", () => {
    assert.match(liveLoaderSrc, /followUpsDueTodayCount/);
    assert.match(liveLoaderSrc, /followUpsOverdueCount/);
    assert.match(liveLoaderSrc, /leadMetrics\?\.dueToday/);
    assert.match(liveLoaderSrc, /leadMetrics\?\.overdue/);
    assert.match(metricMigrationSrc, /l\.follow_up_completed_at is null/);
    assert.match(metricMigrationSrc, /l\.follow_up_date = \(p_now at time zone e\.timezone\)::date/);
    assert.match(metricMigrationSrc, /l\.follow_up_date < \(p_now at time zone e\.timezone\)::date/);
    assert.match(liveLoaderSrc, /\.gte\("created_at", today\.startIso\)/);
    assert.match(liveLoaderSrc, /\.lt\("created_at", today\.endExclusiveIso\)/);
    assert.match(liveCoreSrc, /hotAwaitingFollowUp: input\.hotNeedingFollowUpCount/);
    assert.match(liveCoreSrc, /actionHref: input\.hrefs\.followUpsDue/);
  });

  it("failed queries stay null — the core renders unavailable, never fabricated zeros", () => {
    assert.match(liveLoaderSrc, /degrades? to `null`/i);
    assert.match(liveCoreSrc, /value: number \| null/);
    assert.doesNotMatch(liveCoreSrc, /\?\?\s*0(?![.\d])/, "no null-to-zero coercion in the core");
  });

  it("no fake movement, trend, or confidence claims in the rendered live UI", () => {
    // View sources only: doc comments in the core legitimately explain why
    // trends are absent; the rendered strings must never claim them.
    const rendered = liveSrc + "\n" + drawerSrc;
    assert.doesNotMatch(rendered, /vs\.? Day|↑|↓|\+\d+%|%\s*better|confidence/i);
  });

  it("evidence renders human-readable identity and timestamps — no raw ids or ISO strings", () => {
    assert.doesNotMatch(
      drawerSrc,
      />\s*\{record\.(conversationId|leadId)\}/,
      "ids are React keys and link params only, never rendered text"
    );
    assert.match(drawerSrc, /formatTimestamp/);
    assert.doesNotMatch(drawerSrc, /\{record\.createdAt\}/, "timestamps always pass through the formatter");
  });

  it("evidence links onward only to existing lead detail", () => {
    assert.match(drawerSrc, /\/exhibitor\/leads\/\$\{encodeURIComponent\(leadId\)\}\?eventId=/);
  });

  it("derivation is bounded and deterministic: min sample, caps, count-then-label ranking", () => {
    assert.match(liveCoreSrc, /MIN_MODULE_SAMPLE = 3/);
    assert.match(liveCoreSrc, /MAX_ROWS_PER_MODULE = 5/);
    assert.match(liveCoreSrc, /MAX_EVIDENCE_PER_ROW = 5/);
    assert.match(liveCoreSrc, /b\.conversationCount - a\.conversationCount \|\| compareLabels/);
  });
});

describe("event workspace — shared shell", () => {
  it("all lifecycle branches render through the shared shell", () => {
    const branches = pageSrc.split("EventWorkspaceShell").length - 1;
    assert.ok(branches >= 3, "upcoming, error, and compatibility branches all use the shell");
  });

  it("the shell carries durable context only: back link, badge, dates, timing", () => {
    assert.match(shellSrc, /Back to Events/);
    assert.match(shellSrc, /EventLifecycleBadge/);
    assert.match(shellSrc, /timingText/);
    assert.doesNotMatch(shellSrc, /LegacySummaryBody|Readiness|KPI/);
  });

  it("renders exactly one accessible account-portfolio back link", () => {
    assert.equal((shellSrc.match(/Back to Events/g) ?? []).length, 2, "label and documentation only");
    assert.match(shellSrc, /<BackLink href=\{backHref\}>← Back to Events<\/BackLink>/);
    assert.doesNotMatch(pageSrc, /ExhibitorMultiEventBreadcrumb|topSlot=/);
  });

  it("readiness KPIs distinguish unavailable from complete in the body", () => {
    assert.match(upcomingSrc, /unavailable/);
  });
});

describe("event workspace — live hierarchy and evidence affordances", () => {
  it("keeps topics dominant and separates objections, competitors, and supported messaging into secondary cards", () => {
    assert.match(liveSrc, /const topics = live\.modules\.filter\(\(module\) => module\.key === "topics"\)/);
    assert.match(liveSrc, /module=\{objections\}/);
    assert.match(liveSrc, /module=\{competitors\}/);
    assert.match(liveSrc, /module=\{messaging\}/);
    assert.match(liveCoreSrc, /key: "buying_signals"/);
    assert.match(liveCoreSrc, /Messaging that’s resonating/);
    assert.match(liveSrc, /<LiveIntelligenceModules modules=\{topics\} eventId=\{eventId\} featured \/>/);
  });

  it("uses the existing scoped evidence drawer with clear keyboard-accessible affordances", () => {
    assert.match(drawerSrc, /aria-label=\{`View evidence for \$\{row\.label\}`\}/);
    assert.match(drawerSrc, /View evidence/);
    assert.match(drawerSrc, /leadDetailHref\(record\.leadId, eventId\)/);
  });

  it("replaces the lead rail with an event-scoped follow-up summary and existing queue destination", () => {
    assert.match(liveSrc, /Today’s follow-up status/);
    assert.match(liveSrc, /Hot leads awaiting follow-up/);
    assert.match(liveSrc, /Due today/);
    assert.match(liveSrc, /Overdue/);
    assert.match(liveSrc, /Open follow-up queue/);
    assert.match(pageSrc, /buildExhibitorLeadsIntelligenceHref\(\{ eventId, followUp: "due" \}\)/);
    assert.doesNotMatch(liveSrc, /Leads requiring follow-up|ActionLeadsList|safeLiveLeadDisplayName/);
  });

  it("uses purpose-specific intelligence patterns instead of progress bars or meter tracks", () => {
    assert.match(drawerSrc, /workspace-ranked-needs/);
    assert.match(drawerSrc, /workspace-objection-rows/);
    assert.match(drawerSrc, /workspace-competitor-entities/);
    assert.match(drawerSrc, /workspace-message-insights/);
    assert.match(drawerSrc, /workspace-intelligence-count-badge/);
    assert.doesNotMatch(drawerSrc, /maxCount|style=\{\{ width:|h-1\.5 w-full overflow-hidden|progress-bar|meter-track/);
  });

  it("keeps messaging compact with the approved title while retaining its scoped evidence action", () => {
    const messagingRowsSrc = drawerSrc.slice(
      drawerSrc.indexOf("function MessageInsightRows"),
      drawerSrc.indexOf("/* ===================== Completed-event coaching callouts")
    );
    assert.match(liveCoreSrc, /title: "Messaging that’s resonating"/);
    assert.match(liveSrc, /title="Messaging that’s resonating"/);
    assert.match(messagingRowsSrc, /workspace-message-insights/);
    assert.match(messagingRowsSrc, /<EvidenceAction row=\{row\} onEvidence=\{onEvidence\} \/>/);
    assert.doesNotMatch(messagingRowsSrc, /supportingContext|✦/);
  });

  it("places messaging in the row-one right rail and preserves the lower desktop card positions", () => {
    const messagingCard = liveSrc.slice(liveSrc.indexOf("module={messaging}"), liveSrc.indexOf("<TodayFollowUpStatus"));
    const followUpCard = liveSrc.slice(liveSrc.indexOf("<TodayFollowUpStatus"), liveSrc.indexOf("module={competitors}"));
    const competitorCard = liveSrc.slice(liveSrc.indexOf("module={competitors}"), liveSrc.indexOf("module={objections}"));
    const objectionCard = liveSrc.slice(liveSrc.indexOf("module={objections}"), liveSrc.indexOf("{live.operational"));
    assert.match(messagingCard, /xl:col-span-4 xl:col-start-9 xl:row-start-1/);
    assert.match(followUpCard, /xl:col-span-4 xl:col-start-9 xl:row-start-2/);
    assert.match(competitorCard, /xl:col-span-4 xl:col-start-1 xl:row-start-2/);
    assert.match(objectionCard, /xl:col-span-4 xl:col-start-5 xl:row-start-2/);
    assert.match(followUpCard, /xl:h-full/);
  });

  it("keeps intelligence labels readable and evidence actions separate from row content", () => {
    assert.match(drawerSrc, /text-sm font-bold leading-snug/);
    assert.match(drawerSrc, /line-clamp-2 text-xs leading-relaxed/);
    assert.match(drawerSrc, /function EvidenceAction/);
    assert.doesNotMatch(drawerSrc, /min-w-0 truncate font-semibold text-slate-800/);
  });

  it("uses a dominant follow-up count with compact urgency indicators and an accessible overlap explanation", () => {
    assert.match(liveSrc, /workspace-follow-up-primary/);
    assert.match(liveSrc, /workspace-follow-up-indicators/);
    assert.match(liveSrc, /text-4xl font-bold/);
    assert.match(liveSrc, /aria-label="Counts may overlap/);
    assert.doesNotMatch(liveSrc, /States can overlap;/);
  });

  it("keeps the hero and KPI grid evidence-backed without adding deeper navigation", () => {
    assert.match(liveSrc, /bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600/);
    assert.match(liveSrc, /workspace-live-kpis/);
    assert.match(liveSrc, /lg:grid-cols-4/);
    assert.doesNotMatch(liveSrc + drawerSrc + liveCoreSrc, /What to focus on|focusCallout/);
    assert.doesNotMatch(liveSrc + drawerSrc, /Real-?Time Intelligence|Coaching Dashboard|Executive Intelligence|What to say next|Suggested messaging/);
  });

  it("uses one explicit 8/4 then aligned 4/4/4 desktop grid", () => {
    assert.match(liveSrc, /COMMAND_SURFACE_GRID_CLASS/);
    assert.match(liveSrc, /xl:col-span-8 xl:row-start-1/);
    assert.match(liveSrc, /xl:col-span-4 xl:col-start-9 xl:row-start-1/);
    assert.match(liveSrc, /xl:col-span-4 xl:col-start-9 xl:row-start-2/);
    assert.match(liveSrc, /md:grid-cols-2 xl:grid-cols-12/);
    assert.equal((liveSrc.match(/xl:row-start-2/g) ?? []).length, 3);
  });

  it("stretches only the shared desktop lower row while preserving natural stacked-card heights", () => {
    const followUpCard = liveSrc.slice(liveSrc.indexOf("<TodayFollowUpStatus"), liveSrc.indexOf("module={competitors}"));
    const competitorCard = liveSrc.slice(liveSrc.indexOf("module={competitors}"), liveSrc.indexOf("module={objections}"));
    const objectionCard = liveSrc.slice(liveSrc.indexOf("module={objections}"), liveSrc.indexOf("{live.operational"));
    assert.match(liveSrc, /xl:items-stretch/);
    assert.match(followUpCard, /xl:h-full/);
    assert.match(competitorCard, /xl:h-full/);
    assert.match(objectionCard, /xl:h-full/);
    assert.match(liveSrc, /flex min-h-0 flex-col p-5/);
    assert.doesNotMatch(followUpCard + competitorCard + objectionCard, /min-h-\[\d+px\]|h-\[\d+px\]/);
  });

  it("keeps exactly four primary KPIs in one desktop row and removes Live team/coaching content", () => {
    assert.match(liveSrc, /lg:grid-cols-4/);
    assert.doesNotMatch(liveSrc + liveCoreSrc, /Briefs approved|key: "briefs"/);
    assert.doesNotMatch(liveSrc, /Team intelligence|Team patterns|Reps capturing today|CoachingCallouts|workspace-coaching-callouts/);
    assert.doesNotMatch(liveCoreSrc, /repsCapturingTodayCount|actionLeads/);
  });

  it("keeps the hero follow-up action while removing duplicate header CTA and repeated module metadata", () => {
    assert.doesNotMatch(pageSrc, /Review hot leads/);
    assert.match(liveCoreSrc, /actionLabel: `Follow up \$\{hotCount\} hot`/);
    assert.ok((liveSrc.match(/analyzed conversations/g) ?? []).length >= 2);
    assert.doesNotMatch(drawerSrc, /module\.description|analyzed \{module\.sampleSize\}|Mentioned in event conversations/);
  });

  it("removes helper subtitles and keeps attendee-need summaries concise", () => {
    assert.doesNotMatch(liveSrc, /What attendees keep raising|Open, event-scoped work/);
    assert.match(drawerSrc, /A recurring attendee need across captured conversations\./);
    assert.doesNotMatch(drawerSrc, /function supportingContext/);
  });
});
