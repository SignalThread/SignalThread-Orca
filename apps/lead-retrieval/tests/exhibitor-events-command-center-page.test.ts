import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Source contract for the account Command Center at /app/events:
 * - app/app/events/page.tsx owns auth, scoping, and canonical data loading.
 * - app/app/events/portfolio-view.tsx owns presentation (no server-only imports).
 * - lib/events/account-command-center-core.ts owns all derivations.
 * Canonical scoping, real destinations only, and honest failure states.
 */
const pageSrc = readFileSync(path.join(process.cwd(), "app/app/events/page.tsx"), "utf8");
const viewSrc = readFileSync(path.join(process.cwd(), "app/app/events/portfolio-view.tsx"), "utf8");
const coreSrc = readFileSync(
  path.join(process.cwd(), "lib/events/account-command-center-core.ts"),
  "utf8"
);
const metricLoaderSrc = readFileSync(
  path.join(process.cwd(), "lib/server/dashboard-event-lead-metrics.ts"),
  "utf8"
);
const metricMigrationSrc = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0098_dashboard_truth_event_timezone.sql"),
  "utf8"
);
const combinedSrc = pageSrc + "\n" + viewSrc;

test("page keeps the existing auth gates and role redirects", () => {
  assert.match(pageSrc, /requireAuth\(\)/);
  assert.match(pageSrc, /redirect\("\/admin\/events"\)/);
  assert.match(pageSrc, /redirect\("\/app\/organizer"\)/);
  assert.match(pageSrc, /redirect\("\/app"\)/);
  assert.match(pageSrc, /redirectExhibitorAdminFromAppEventsManagementRoutesIfBlocked/);
});

test("page uses the canonical event-access resolution and scopes the events query to accessible ids", () => {
  assert.match(pageSrc, /getCachedExhibitorAccessibleEventResolution\(sessionUser\.id\)/);
  assert.match(pageSrc, /\.in\("id", access\.eventIds\)/);
  assert.match(
    pageSrc,
    /access\.eventIds\s*\n?\s*\.map\(\(id\) => byId\.get\(id\)\)/,
    "rendered events must be re-derived from the accessible id list"
  );
});

test("every secondary query is company-scoped", () => {
  assert.match(pageSrc, /from\("licenses"\)[\s\S]*?\.eq\("exhibitor_company_id", companyId\)/);
  assert.match(pageSrc, /from\("invite_codes"\)[\s\S]*?\.eq\("exhibitor_company_id", companyId\)/);
  assert.match(pageSrc, /from\("invite_codes"\)[\s\S]*?\.is\("used_at", null\)/, "canonical pending filter");
  assert.match(pageSrc, /from\("users"\)[\s\S]*?\.eq\("company_id", companyId\)/);
  assert.match(
    pageSrc,
    /from\("leads"\)[\s\S]*?\.eq\("company_id", companyId\)[\s\S]*?\.in\("event_id", access\.eventIds\)/,
    "lead themes must be scoped to the company AND accessible events"
  );
  assert.match(
    pageSrc,
    /\.limit\(PORTFOLIO_THEME_SAMPLE_LIMIT\)/,
    "theme sample stays bounded by the documented cap"
  );
});

test("secondary failures degrade to null — never fabricated zeros", () => {
  assert.match(pageSrc, /async function tryRows/);
  assert.match(pageSrc, /if \(error\) return null;/);
  assert.match(pageSrc, /metricsByEvent[\s\S]*:\s*null/);
  assert.match(pageSrc, /if \(!metricRows \|\| metricRows\.some\(\(row\) => row === null\)\) return null/);
  assert.match(viewSrc, /Unavailable right now/);
  assert.match(viewSrc, /unavailable right now/i);
});

test("all derivations live in the core module, not the page or view", () => {
  for (const fn of [
    "deriveAccountSetupItems",
    "deriveAccountFollowUpStatus",
    "computeAccountKpis",
    "selectWhatMattersNow",
    "buildRecommendedNextSteps",
    "summarizeTeamReadiness",
    "deriveLeadThemes",
    "deriveRecentActivity"
  ]) {
    assert.match(pageSrc, new RegExp(fn + "\\("), `page calls ${fn}`);
    assert.match(coreSrc, new RegExp(`export function ${fn}`), `core defines ${fn}`);
  }
  assert.doesNotMatch(viewSrc, /deriveAccountSetupItems|selectWhatMattersNow|deriveRecentActivity/);
});

test("grouping and ordering stay in the canonical portfolio helper; no ad-hoc sorting in page or view", () => {
  assert.match(viewSrc, /groupEventsForPortfolio\(events, todayYmd\)/);
  assert.match(viewSrc, /EVENT_PORTFOLIO_GROUP_ORDER\.map/);
  assert.doesNotMatch(pageSrc, /\.sort\(/);
  assert.doesNotMatch(viewSrc, /\.sort\(/);
});

test("event links use the canonical href builders with the exact event id", () => {
  assert.match(viewSrc, /exhibitorOpenEventHref\(event\.id\)/);
  assert.match(viewSrc, /exhibitorEventSettingsHref\(event\.id\)/);
  assert.doesNotMatch(combinedSrc, /href=\{`\/app\/events\/\$\{/);
});

test("account setup actions route to existing settings pages", () => {
  assert.match(coreSrc, /exhibitorEventSettingsHref\(event\.id\)/);
  assert.doesNotMatch(coreSrc, /\/setup/);
});

test("create event stays gated on the existing management-route permission", () => {
  assert.match(pageSrc, /exhibitorAdminMayUseAppEventManagementRoutes\(\{/);
  assert.match(pageSrc, /EXHIBITOR_EVENTS_CREATE_HREF/);
  assert.match(viewSrc, /createEventHref \?[\s\S]*?Create event/);
});

test("required sections render with honest states", () => {
  assert.match(viewSrc, /data-testid="what-matters-now"/);
  assert.match(viewSrc, /data-testid="account-kpis"/);
  assert.match(viewSrc, /data-testid="recommended-next-steps"/);
  assert.match(viewSrc, /data-testid="team-readiness"/);
  assert.match(viewSrc, /data-testid="recent-activity"/);
  assert.match(viewSrc, /data-testid="cross-event-follow-up-status"/);
  assert.match(viewSrc, /Nothing needs your attention right now/);
  assert.match(viewSrc, /No recent account activity/);
});

test("what matters now uses the account indigo treatment while preserving its two action hierarchy", () => {
  const heroStart = viewSrc.indexOf("export function WhatMattersNowHero");
  const heroEnd = viewSrc.indexOf("/* ================================ KPI row", heroStart);
  const heroSrc = viewSrc.slice(heroStart, heroEnd);

  assert.match(heroSrc, /border-indigo-200 bg-indigo-50\/70/);
  assert.match(heroSrc, /text-indigo-700/);
  assert.match(heroSrc, /text-slate-950/);
  assert.match(heroSrc, /text-slate-600/);
  assert.match(heroSrc, /bg-indigo-600[\s\S]*?hover:bg-indigo-700/);
  assert.match(heroSrc, /border-slate-200 bg-white[\s\S]*?text-slate-700/);
  assert.doesNotMatch(heroSrc, /bg-slate-900|border-white\/25|text-slate-300/);
});

test("account KPIs are the approved four — hot leads and follow-ups are not headline KPIs", () => {
  assert.match(viewSrc, /label="Events"/);
  assert.match(viewSrc, /label="Setup items open"/);
  assert.match(viewSrc, /label="Team seats used"/);
  assert.match(viewSrc, /label="Active licenses"/);
  assert.doesNotMatch(viewSrc, /label="Hot leads"|label="Follow-ups due"/i);
});

test("events query failure shows a generic error without raw backend details", () => {
  assert.match(pageSrc, /Failed to load your events/);
  assert.doesNotMatch(pageSrc, /error\.message|errorMessage|eventsResult\.error\.message/);
});

test("empty portfolio keeps the existing NoActiveEventEntry empty state", () => {
  assert.match(pageSrc, /NoActiveEventEntry/);
  assert.match(pageSrc, /mode="empty"/);
});

test("no prototype-only metrics, AI copy, or dead destinations are rendered", () => {
  assert.doesNotMatch(combinedSrc, /realtime|coaching|executive|trends/i);
  assert.doesNotMatch(combinedSrc, /scanner|device|recording|conversation|readiness score/i);
  assert.doesNotMatch(combinedSrc, /Import leads|toast/i);
  assert.doesNotMatch(combinedSrc, /\bAI\b/);
});

test("themes panel: real derivation, honest empty state, no trends or commentary", () => {
  assert.match(viewSrc, /data-testid="portfolio-themes"/);
  assert.match(viewSrc, /Themes across your events/);
  assert.match(viewSrc, /Portfolio themes will appear as leads are captured across your events\./);
  assert.match(viewSrc, /Portfolio themes are unavailable right now\./);
  // No fake movement or generated commentary anywhere in the panel/view.
  assert.doesNotMatch(viewSrc, /trend|vs\.\s|↑|↓|▲|▼|last (week|month|period)|period-over-period/i);
  // No dead intelligence link.
  assert.doesNotMatch(viewSrc, /Open intelligence|intelligence/i);
});

test("themes context states the real bounded sample without overclaiming coverage", () => {
  assert.match(viewSrc, /Patterns found across \{result\.sampleSize\.toLocaleString\("en-US"\)\}/);
  assert.match(viewSrc, /from your accessible events/);
  assert.doesNotMatch(viewSrc, /all leads|complete history|every lead/i, "no total-coverage claim");
  // Context renders only when themes exist — never dressing up an empty result.
  assert.match(viewSrc, /result !== null && result\.themes\.length > 0/);
  const coreSrc = readFileSync(
    path.join(process.cwd(), "lib/events/account-command-center-core.ts"),
    "utf8"
  );
  assert.match(coreSrc, /export const PORTFOLIO_THEME_SAMPLE_LIMIT = 500;/);
  assert.match(coreSrc, /sampleSize/);
});

test("each theme row shows its count against the bounded sample denominator", () => {
  assert.match(
    viewSrc,
    /of \{sampleSize\.toLocaleString\("en-US"\)\} \{sampleSize === 1 \? "lead" : "leads"\}/,
    "per-row context reads 'N of sampleSize leads'"
  );
});

test("recommendation rows keep full-row click, visible arrow, hover/focus/pressed states", () => {
  // Full-row link, stronger hover, indigo arrow on hover, pressed + focus preserved.
  assert.match(viewSrc, /hover:border-indigo-200 hover:bg-white hover:shadow-md/);
  assert.match(viewSrc, /active:bg-slate-100 active:shadow-sm/);
  assert.match(viewSrc, /group-hover:text-indigo-600/, "arrow gains contrast on hover");
  assert.match(viewSrc, /aria-label=\{`\$\{step\.label\} — \$\{step\.actionLabel\}`\}/);
  // Recommendation link still routes through the real step href only.
  assert.match(viewSrc, /href=\{step\.href\}/);
});

test("section-heading icons use the higher-contrast slate-600 treatment", () => {
  for (const icon of ["IconBuilding", "IconChart", "IconListCheck", "IconUsers", "IconClock"]) {
    assert.match(
      viewSrc,
      new RegExp(`<${icon} size=\\{\\d+\\} className="text-slate-600" />`),
      `${icon} section heading should be slate-600`
    );
  }
});

test("activity aggregates lead captures in the core, fed by the full bounded sample", () => {
  assert.match(pageSrc, /leads: portfolioLeads\s*\n?\s*\}\);/, "no tiny slice that would understate counts");
  const coreSrc = readFileSync(
    path.join(process.cwd(), "lib/events/account-command-center-core.ts"),
    "utf8"
  );
  assert.match(coreSrc, /new leads captured/, "plural aggregation wording lives in the core");
  assert.match(coreSrc, /per \(event, UTC calendar day\)/, "aggregation contract documented");
});

test("icons come from local aria-hidden SVGs (existing convention), no emoji", () => {
  assert.match(viewSrc, /"aria-hidden": true/);
  assert.ok((viewSrc.match(/function Icon[A-Z]/g) ?? []).length >= 10, "restrained local icon set");
  assert.doesNotMatch(viewSrc, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "no emoji");
  assert.doesNotMatch(viewSrc, /from "lucide|react-icons|@heroicons/, "no new icon dependency");
});

test("team readiness labels reflect the actual scope", () => {
  assert.match(viewSrc, /Company users/);
  assert.doesNotMatch(viewSrc, /Active on this event/, "account panel must not claim event assignment");
});

test("Your events removes repeated entry guidance", () => {
  assert.doesNotMatch(viewSrc, /Open an event to enter its Command Center\./);
});

test("account Command Center uses lifecycle lanes and a balanced support row", () => {
  assert.match(viewSrc, /PageShell/);
  assert.match(viewSrc, /PageHeader/);
  assert.match(viewSrc, /data-testid="lifecycle-events"/);
  assert.match(viewSrc, /data-testid=\{`lifecycle-lane-\$\{lane\.key\}`\}/);
  assert.match(viewSrc, /No event on the floor/);
  assert.match(viewSrc, /xl:grid-cols-3/);
  assert.match(viewSrc, /data-testid="account-primary-grid"/);
  assert.match(viewSrc, /xl:grid-cols-3 xl:items-stretch/);
  assert.match(viewSrc, /data-testid="account-lower-grid"/);
  assert.match(viewSrc, /data-testid="account-lower-grid"/);
  assert.doesNotMatch(viewSrc, /max-w-\[1080px\]/);
  assert.doesNotMatch(viewSrc, /min-h-\[\d+px\]|h-\[\d+px\]/);
});

test("lifecycle cards and All Events table are derived through the canonical lifecycle helper", () => {
  assert.match(pageSrc, /deriveLifecycleEventCards/);
  assert.match(coreSrc, /export function deriveLifecycleEventCards/);
  assert.match(coreSrc, /groupEventsForPortfolio\(input\.events, input\.todayYmd, input\.todayByEvent\)/);
  assert.match(coreSrc, /describeEventTiming/);
  assert.match(viewSrc, /All events →/);
  assert.match(viewSrc, /AllEventsTable/);
  assert.match(viewSrc, /Search events, cities, or playbooks/);
  assert.match(viewSrc, /filterLifecycleEventCards/);
  assert.match(viewSrc, /\+ \{more\} more/);
  assert.match(pageSrc, /loadEventWorkspaceReadinessData/);
  assert.match(pageSrc, /deriveEventReadinessPercent/);
});

test("cross-event follow-up counts are independently scoped and use canonical existing queue destinations", () => {
  assert.match(pageSrc, /loadDashboardEventLeadMetrics\(\{ companyId, eventIds: access\.eventIds, now \}\)/);
  assert.match(metricLoaderSrc, /p_company_id: input\.companyId/);
  assert.match(metricLoaderSrc, /p_event_ids: \[\.\.\.input\.eventIds\]/);
  assert.match(metricMigrationSrc, /where e\.company_id = p_company_id[\s\S]*e\.id = any\(p_event_ids\)/);
  assert.match(metricMigrationSrc, /hot_awaiting_follow_up/);
  assert.match(metricMigrationSrc, /due_today/);
  assert.match(metricMigrationSrc, /overdue/);
  assert.match(viewSrc, /Hot awaiting follow-up/);
  assert.match(viewSrc, /Due today/);
  assert.match(viewSrc, /Overdue/);
  assert.match(viewSrc, /Open due follow-ups/);
  assert.match(coreSrc, /followUp: "awaiting"/);
  assert.match(coreSrc, /followUp: "today"/);
  assert.match(coreSrc, /followUp: "overdue"/);
  assert.match(coreSrc, /followUp: "due"/);
  assert.match(viewSrc, /Counts may overlap because each status is independently derived/);
  assert.doesNotMatch(viewSrc, /progress-bar|meter-track|<progress|conic-gradient/);
});

test("cards and rows render production-backed phase metrics and canonical navigation", () => {
  assert.match(viewSrc, /formatEventDateRange\(event\.start_date, event\.end_date\)/);
  assert.match(viewSrc, /formatEventLocation\(event\.city, event\.state, event\.location\)/);
  assert.match(coreSrc, /eventPortfolioLifecycleForEvent\(event, input\.todayYmd, input\.todayByEvent\)/);
  assert.match(viewSrc, /EVENT_PORTFOLIO_GROUP_LABEL\[lifecycle\]/);
  assert.match(viewSrc, /Continuous capture · ongoing/);
  assert.match(viewSrc, /leads today/);
  assert.match(viewSrc, /pipeline/);
  assert.match(coreSrc, /pipelineValue: null/, "pipeline stays unavailable until a canonical field exists");
  assert.match(viewSrc, /exhibitorOpenEventHref\(card\.event\.id\)/);
  assert.match(viewSrc, /overflow-x-auto/, "All Events table remains usable in narrow layouts");
});

test("the view stays free of server-only concerns", () => {
  assert.doesNotMatch(viewSrc, /createAdminClient|createSupabaseServerClient|requireAuth|requireRole/);
  assert.doesNotMatch(viewSrc, /@\/lib\/supabase\/admin/);
});
