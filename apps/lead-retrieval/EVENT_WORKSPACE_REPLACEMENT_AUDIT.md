# Event Workspace Replacement — Repository Audit and Phase 1 Plan

**Prompt 1 deliverable.** Audit-only; this document is the sole file created. No production code, tests, schema, or configuration were modified.

Sources: repository code on branch `feat/event-workspace-replacement` (clean at audit time), `docs/Loop/LR Event Workspace Brief Phase 1.md` (plan authority), `docs/Loop/LR Event Workspace Prompts Phase 1.md`, prior audits (`ACCOUNT_SURFACE_AUDIT.md`, `DIRECT_CUSTOMER_DASHBOARD_AUDIT.md`), and the four attached visual references (Pre-Event, Live, Post-Event mockups + generic-dashboard anti-reference).

**Stack correction relevant to the whole plan:** this repository does **not** use Prisma. The schema is raw SQL Supabase migrations (`supabase/migrations/0001–0090`); data access is `@supabase/supabase-js` (admin client `lib/supabase/admin.ts`, RLS-protected user clients elsewhere). `types/database.ts` is a stale generated snapshot (missing post-June tables). Every "model" below is a Postgres table.

---

## 1. Executive verdict

Replace the generic Event Command Center at `/exhibitor/dashboard` **in place** with one canonical, lifecycle-aware Event Workspace. Do not create a new route. The existing runtime path — account card → `/app/events/{eventId}` (access guard) → `/exhibitor/dashboard?eventId={id}` — already funnels every entry point (account cards, sidebar "Dashboard", sign-in entry for event-level tenants, settings/help back-links) into one page. That page is the correct place for lifecycle dispatch; everything it currently renders below its header is the low-value generic body the brief targets for removal.

Key findings that shape the plan:

1. **Lifecycle is stored but stale.** `events.status` (ACTIVE/UPCOMING/COMPLETED) is set at creation and never advanced; only the self-serve create path derives it from dates. A new canonical resolver must derive lifecycle from dates (UTC calendar day) with explicit, tested fallbacks (§5).
2. **The contradictory Hot KPI is a real bug with an exact root cause** — the dashboard KPI filters on `temperature === "hot"` but the page's query never selects the `temperature` column, so the KPI is structurally always 0 while the Priority Distribution bars use `priority_score >= 80` (§4).
3. **Per-conversation intelligence is real.** `lead_conversations` carries persisted, production-generated arrays (`priority_themes`, `objections`, `competitors_mentioned`, `buying_signals`, `pain_points`, `next_steps`, `rep_behavior_patterns`, `sentiment`) from a Whisper + gpt-4.1-mini pipeline with DB-constrained status lifecycles. Event-level themes are honestly **derivable** by deterministic aggregation; no fabrication is needed (§6.4).
4. **No deeper intelligence dashboards exist in shipped code.** All Real-Time / Executive / Coaching / Product & Market concepts live only in the unrouted `.audit-reference/` prototype bundle → `FUTURE_ONLY` (§7).
5. **No schema change is required for Phase 1** (§20).
6. Surveys, an evidence table, scanner/device health, meetings-booked, revenue/pipeline, and coaching scores are **unavailable** — the corresponding mockup modules must be omitted or reduced, never faked.

---

## 2. Current route map

### 2.1 Canonical event home (current)

The real event-level dashboard is **`app/(app)/exhibitor/dashboard/page.tsx`** (`ExhibitorDashboardPage`, guarded by `requireExhibitorScope`, so both `exhibitor_admin` and `exhibitor_viewer` render it). Event selection: `?eventId=` query param → `resolveExhibitorAppActiveEventId(userId, requested)` (URL > cookie > first accessible); an inaccessible URL id self-redirects to the resolved id. No-event and multi-event-choice states are handled by `components/app/no-active-event-entry.tsx`.

### 2.2 Runtime path from an account event card

```
/app/events (account Command Center, app/app/events/page.tsx)
  → card/hero href exhibitorOpenEventHref(id) = /app/events/{eventId}
    → app/app/events/[eventId]/page.tsx  (pure guard: requireAuth → role branch
      → assertEventIdAccessibleForUser → redirect)
      → /exhibitor/dashboard?eventId={id}   ← the page being replaced
```

### 2.3 Every route that behaves like an event home or redirects to one

| Route | File | Behavior |
|---|---|---|
| `/exhibitor/dashboard` | `app/(app)/exhibitor/dashboard/page.tsx` | **Renders the generic Event Command Center** (the anti-reference) |
| `/app/events/[eventId]` | `app/app/events/[eventId]/page.tsx` | Guard + redirect to `/exhibitor/dashboard?eventId=` |
| `/app/exhibitor/dashboard` | `app/app/exhibitor/dashboard/page.tsx` | Legacy stub → `/exhibitor/dashboard` (drops query) |
| `/exhibitor`, `/app/exhibitor` | `app/(app)/exhibitor/page.tsx`, `app/app/exhibitor/page.tsx` | Entry resolution → `/api/auth/exhibitor-web-entry` |
| `/dashboard`, `/app/dashboard`, `/app` | `app/(app)/dashboard/page.tsx`, `app/app/dashboard/page.tsx`, `app/app/page.tsx` | Role routers / redirects |

Inbound links to `/exhibitor/dashboard?eventId=` (all found by grep, tests excluded): `app/app/events/[eventId]/page.tsx:40`, `lib/server/exhibitor-app-events-management-redirect.ts:32`, `app/app/settings/page.tsx:59-60`, `app/(app)/exhibitor/settings/page.tsx:50`, `app/help/page.tsx:35`, sidebar item `lib/exhibitor/exhibitor-app-nav.ts:115`, `buildExhibitorDashboardHref` (`lib/leads/exhibitorLeadsDrilldown.ts:195`, used by leads "Back to Dashboard"), `lib/server/exhibitor-web-entry-redirect.ts` (sign-in landing for event-level tenants), workflow gate redirects, `lib/import-wizard/paths.ts` (`EXHIBITOR_HOME_PATH`), `components/layout/sidebar.tsx` (active-state matching).

`middleware.ts` contains no event-route logic (Supabase session refresh only); all guards live in pages.

### 2.4 Current Event Command Center — files

- Page + all derivation calls + inline `KPICard`, chart-path builders (`computeLeadsTimeline`, `buildLinePath`, `buildAreaPath`), inline `relativeTime`/`shortDate`/`formatFollowUpDay`: `app/(app)/exhibitor/dashboard/page.tsx`
- View: `app/(app)/exhibitor/dashboard/event-command-center-view.tsx` (`EventCommandCenterHeader`, `EventQuickActions`, `EventLifecycleBadge`)
- Logic: `lib/exhibitor/event-command-center.ts` (`deriveEventIdentity`, `buildEventQuickActions`), `lib/leads/exhibitorLeadsDrilldown.ts` (`DASHBOARD_SUMMARY_VIEWS`, `countLeadsMatchingView`, `priorityBucketCount`, href builders), `lib/leads/priorityLevels.ts`
- Tests: `tests/exhibitor-event-command-center.test.ts` (identity/quick-actions/page-source contract), `e2e/exhibitor-leads-redirect-and-dashboard.spec.ts`

### 2.5 Leads Intelligence and existing deep links

- **Leads Intelligence:** `/exhibitor/leads` (`app/(app)/exhibitor/leads/page.tsx`; legacy `/app/exhibitor/leads` re-serializes + redirects). Accepted params: `eventId, q, companyId, view, rating (5|4_plus|3_or_below|unrated), temperature (hot|warm|cold), followUp (overdue|today|this_week|none), workflowStatus`, plus legacy `view/minPriority/followUpDue` which normalize-redirect. Canonical href builder: `buildExhibitorLeadsIntelligenceHref({eventId, view, q, companyId})`.
- **Lead detail:** `/exhibitor/leads/{leadId}?eventId={id}`.
- **Follow-up queue:** no dedicated route — the filtered views `view=follow_up_due` / `followUp=` on Leads Intelligence.
- **Campaigns:** `/exhibitor/campaigns` (company-scoped) and `/campaigns/[campaignId]`.
- **Event settings:** `exhibitorEventSettingsHref(id)` → `/app/events/{id}/settings` for direct/portfolio tenants; `/exhibitor/settings` for event-level tenants.
- **Users / invitations / seats / licenses:** `/exhibitor/users` (event quick action) and `/app/settings` (account tier).
- **Briefing strategy setup:** `/exhibitor/briefings/setup` (writes `events.briefing_strategy`), knowledge items via `/api/exhibitor/briefing-knowledge`.
- **Conversations / recordings / transcripts:** no standalone detail route; conversation content is surfaced on lead detail. Upload/processing APIs under `app/api/conversations/`.

### 2.6 Duplicate or ambiguous event homes

Two route trees (`app/(app)/…` renders; `app/app/…` mostly legacy stubs). The only ambiguity is stylistic: account surfaces link the path form `/app/events/{id}` while everything else uses the query form `/exhibitor/dashboard?eventId={id}`; the path form is a thin guard onto the query form, so there is exactly **one rendering event home** today. No prototype routes are reachable.

---

## 3. Current generic dashboard — section-by-section audit

All in `app/(app)/exhibitor/dashboard/page.tsx` unless noted. Verdicts: REMOVE (with the generic body), REUSE (helper survives into the workspace), RETAIN (unchanged elsewhere).

| Section | Source / semantics | Interaction | Verdict |
|---|---|---|---|
| Header (`EventCommandCenterHeader`) | `deriveEventIdentity` over a narrow `events` select; lifecycle badge from stored `status`; degrades to name-only on failure | "Open Leads Intelligence →" CTA | **REUSE pattern** — becomes the shared shell; badge must switch to the canonical resolver (§5). The escape-hatch CTA is removed as a header fixture (brief §18) |
| KPI row (Total/Hot/Due/Scheduled/Unrated) | `countLeadsMatchingView` per view over one bounded leads query | Tiles link to filtered Leads Intelligence | **REMOVE as a row**; `countLeadsMatchingView` + href builder REUSE. Hot tile is broken (§4). Due (`follow_up_date <= today && status != closed`) ⊂ Scheduled (any non-closed with a date) — overlapping tiles |
| Leads Over Time | `computeLeadsTimeline`: buckets by `updated_at` (not `created_at`), last 7 populated days, cumulative SVG | None (display only) | **REMOVE** — edit-activity masquerading as capture trend; low-value chart named by the brief |
| Priority distribution | `priorityBucketCount` on `priority_score` bands (≥80 hot, 60–79, 40–59, 15–39); `<15` silently excluded while pct divides by total | Bars link to `view=priority_*` | **REMOVE** — legacy-score semantics contradict canonical `temperature`; percentages misleading |
| Next follow-ups | Inline filter `follow_up_date >= today && status != closed`, top 5 — a **different window** than the "Due now" header link (`<= today`), so link and list show disjoint sets | Rows → lead detail | **REMOVE**; the workspace's "leads requiring action" module supersedes it with consistent windows |
| Recent activity | `leads.slice(0,5)` by `updated_at desc` | Rows → lead detail | **REMOVE** — noisy raw activity duplicating the leads list |
| Manage cards (`EventQuickActions`) | `buildEventQuickActions`: Campaigns, Users & licenses, Event settings; permission-gated | Navigation | **REUSE helper** — these become the workspace's permission-aware direct actions instead of a nav grid |

**Account Command Center (`/app/events`) — preserved.** Sections: What-Matters-Now hero, account KPI row, lifecycle-grouped portfolio, portfolio themes (bounded 500-lead sample), recommended steps, team readiness, recent activity. Core: `lib/events/account-command-center-core.ts`; shared with the event level only via `lib/events/event-portfolio.ts` (lifecycle mapping/grouping/hrefs) and `lib/exhibitor/exhibitor-app-nav.ts`. No lead-KPI code is shared between the two surfaces, so replacing the event body cannot regress the account page.

---

## 4. Contradictory KPI root cause (exact)

Two "Hot" definitions coexist on one page, reading **different fields**, and one of them reads a field that is never fetched:

- **KPI tile "Hot"** → `countLeadsMatchingView(leads, "hot")` → `filterLeadsByIntelligenceView` case `"hot"` (`lib/leads/exhibitorLeadsDrilldown.ts:144-147`) filters `parseLeadTemperature(l.temperature) === "hot"`. The dashboard's leads select (`page.tsx:234-239`) is `id, company_id, full_name, priority_score, rating, status, follow_up_date, updated_at` — **no `temperature` column**. `parseLeadTemperature(undefined)` → `null`. **The KPI is structurally always 0.** Its own view metadata even mislabels it "Score 80+" (`DASHBOARD_SUMMARY_VIEWS`, `exhibitorLeadsDrilldown.ts:57`).
- **Priority Distribution "Hot" bar** → `priorityBucketCount(leads, "hot")` → `scoreToPriorityLevel(priority_score) === "hot"` i.e. `priority_score >= 80` (`lib/leads/priorityLevels.ts:30-37`). With 6 such leads out of 6 scored: `6 Hot / 100%`.

Hence the screenshot's `0 Hot` vs `6 Hot / 100%`. The two-field split is deliberate at the helper level (locked by `tests/exhibitor-leads-drilldown.test.ts:61-72,109-116`); the page-level bug is feeding the helper rows without `temperature`. A third definition exists downstream: Leads Intelligence filters `hot` at the DB (`.eq("temperature","hot")`).

**Canonical fix (Phase 1):** `temperature = 'hot'` is THE hot-lead definition — it is the canonical write path (`lib/leads/exhibitorLeadPatch.ts:59-67` converts legacy numeric `priority_score` payloads into `temperature` writes). The workspace must (a) select `temperature` in every leads query, (b) use temperature-based counts everywhere, (c) drop the score-band distribution, and (d) correct or retire the misleading "Score 80+" description. `priority_score`/`scoreToPriorityLevel` remain only where Leads Intelligence legitimately uses them (out of scope to redesign).

---

## 5. Canonical lifecycle and timezone

### 5.1 What exists

- `events` columns (migrations `0009`, `0070`): `start_date date NULL`, `end_date date NULL`, `status text NOT NULL CHECK IN ('ACTIVE','UPCOMING','COMPLETED') DEFAULT 'UPCOMING'`, `container_kind CHECK IN ('event','continuous_capture') DEFAULT 'event'`. **No timezone column.**
- `status` is written at creation only: admin form and exhibitor API take it verbatim from input; only the self-serve path derives it (`computeStatusForDates`, `app/app/events/new/actions.ts:33-46` — lexical `YYYY-MM-DD` compare against the **UTC** calendar day, boundaries inclusive: an event is ACTIVE on both start and end day). `update-event-settings` never touches `status` when dates are edited. **Status is therefore authoritative-by-convention but stale by construction.**
- All current classification is status-only: `eventPortfolioLifecycleForStatus` (`lib/events/event-portfolio.ts:51-59`) → `live | upcoming | completed | unknown`; consumed by the portfolio grouping and the dashboard badge. Tests `tests/event-portfolio-grouping.test.ts` lock the mapping and group ordering; `tests/event-date-range-timezone.test.ts` locks display-only date formatting (date-only values render in UTC — no day shift).
- "Active event" (`resolveExhibitorAppActiveEventId`: URL > cookie > first accessible) is pure **selection**, unrelated to lifecycle despite sharing the word "active".

### 5.2 The single lifecycle source of truth (to be created in Prompt 2)

**`lib/events/event-lifecycle.ts`** — a new pure helper, `resolveEventLifecycle(row, todayYmd)` → `'upcoming' | 'live' | 'completed'` (+ `reason`), sibling to and eventually feeding `event-portfolio.ts`. Deterministic rules, in precedence order:

1. `container_kind = 'continuous_capture'` → **live** (ongoing capture bucket; these rows have null dates and are created ACTIVE).
2. Stored `status = 'COMPLETED'` → **completed** (explicit terminal state is honored even inside the date range — an operator can close an event early; the reverse is never true: a stale ACTIVE/UPCOMING does not survive date correction).
3. Both dates present → date-derived on the **UTC calendar day** with lexical `YYYY-MM-DD` comparison (identical regime to `computeStatusForDates` and to the UTC-pinned date rendering): `today < start_date` → upcoming; `today > end_date` → completed; else **live** (start day and end day inclusive).
4. Only `start_date`: `today < start_date` → upcoming, else live. Only `end_date`: `today > end_date` → completed, else live.
5. No dates → stored status mapping (ACTIVE→live, UPCOMING→upcoming); unknown/malformed status with no dates → **upcoming** (renders Event Readiness, where "event dates missing" is itself the top blocker — the safest honest state).

Timezone: with no timezone column, UTC-day boundaries are the only consistent choice already used by creation logic and rendering. This is a documented approximation (±1 day at boundaries for non-UTC venues), acceptable for Phase 1; adding a timezone column is **not** required and is out of scope.

Known cross-surface drift: the account portfolio groups by stored status; a stale status can place a card in a different group than the workspace's state. This exists today, is out of Phase 1 scope to redesign, and is recorded in §21 (risks). No user-facing lifecycle switch will be built.

---

## 6. Event data inventory (production-backed)

Classification: **PERSISTED** (schema + real write path), **DERIVED** (computed from persisted), **GENERATED** (production AI pipeline), **UNAVAILABLE** (no real path / prototype only). All lead-derived reads scope `company_id` (+ `event_id`); RLS backstops user-context clients; admin-client loaders must scope explicitly.

### 6.1 Leads — PERSISTED
`leads`: `company_id` (req), `event_id` (nullable), `owner_user_id`, `full_name`, `email`, `job_title`, `company_text`, `temperature ('hot'|'warm'|'cold')` **(canonical qualification)**, `rating (0-5)`, `status ('new'|'follow_up'|'closed')`, `follow_up_date (YYYY-MM-DD)`, `intent_signals (json)`, `priority_score` **(legacy — canonical writes convert to temperature)**, `is_hot` **(legacy, no live write path)**, `enriched_*` (GENERATED via Apollo/PDL/ZoomInfo), `created_at` (= capture time; no separate capturedAt). Writes: create route (mobile bearer + web session), PATCH (`normalizeExhibitorLeadPatch`), import publish materialization.

### 6.2 Follow-up — DERIVED from two persisted fields
No follow-up model, no sent/completed marker. State = `follow_up_date` + `status`. Canonical windows (`exhibitorLeadsDrilldown.ts`): due = `follow_up_date <= today && status != 'closed'`; scheduled = date set && not closed; filters `overdue|today|this_week|none`. "Follow-up completion" can only honestly mean scheduled/overdue/closed groupings — never "sent". "Contacted/uncontacted" has no field; the only honest proxy is `status = 'new'` and must be labeled as such ("still marked new").

### 6.3 Campaigns & drafts — PERSISTED
`campaigns` (**company-scoped, no event_id**), `campaign_recipients`, `campaign_messages` (send state incl. `sent_at`, provider ids via SendGrid `executeCampaignSend`), `email_events`. `generated_drafts` (**event-scoped**): workflow-composed follow-up drafts, `approval_status pending|approved|rejected|sent`, approval routes + promotion to campaigns. Workflows are feature-flag-gated (`isWorkflowsEnabled`). "Campaign-ready cohort" is not persisted — honest CTA is "Launch follow-up campaign" → `/exhibitor/campaigns`, plus conditional "drafts awaiting review" from `generated_drafts` when the flag is on and rows exist.

### 6.4 Conversations / recordings / transcripts / intelligence — PERSISTED + GENERATED
`lead_conversations` (scoped only via `lead_id` → join through `leads` for event/company): `storage_path` (R2 audio), `transcript` (+`transcription_status pending|processing|completed|failed`, DB CHECK, error/timestamps), synthesis columns (+`synthesis_status`, same enum): `summary`, `sentiment`, `problem_severity`, `buying_intent`, arrays `objections[]`, `next_steps[]`, `competitors_mentioned[]`, `pain_points[]`, `feature_requests[]`, `buying_signals[]`, `desired_outcomes[]`, `rep_behavior_patterns[]`, `priority_themes[]`, and more (migration `0090`). Pipeline genuinely runs (Whisper `whisper-1` + `gpt-4.1-mini`, `lib/conversations/process-upload.ts`; stale-recovery cron). `created_at` supports "conversations today". `lead_voice_notes` (event- and company-scoped) and `lead_cumulative_insights` (per-lead, `gpt-4.1`) also real. **No event-level synthesis service exists** — event themes must be DERIVED by deterministic aggregation of the per-conversation arrays (normalize, count, min-sample, cap, stable ranking). Processing failures per event ARE derivable (`transcription_status/synthesis_status = 'failed'|'pending'` joined through leads).

### 6.5 Surveys / evidence model / notes / scanners — UNAVAILABLE (except voice notes)
No survey tables at all. No evidence table (the word appears only in prompt text) — Phase 1 "evidence" = the underlying conversation/lead records themselves. No free-text notes model (notes = voice notes). **No scanner/device/capture-health model**; `events.container_kind` is the only capture-adjacent flag; internal-health checks are platform-aggregate and not event-scopable. Mockup "Scanners online 5/6" and operational-health cards are unimplementable and must be omitted (processing-failure notices from §6.4 are the one supportable operational signal).

### 6.6 Users / invitations / assignment / seats / licenses — PERSISTED
`users` (`role`, `company_id`, `event_access_mode`), `invite_codes` (outstanding = `used_at IS NULL`, `permissions {admin,app}`), `event_users` (per-event membership, `status invited|active`, permissions jsonb, unique `(user_id,event_id)`), `licenses` (`seats_total`, `seats_used` **derived cache** — authoritative counts via `evaluateAppAccessGrant` / reconcilers in `lib/server/event-user-access.ts`; `scope event|company`). Team-preparation per event is fully derivable: assigned = active `event_users` rows for the event; invited = `status='invited'` + outstanding `invite_codes`; seats = active licenses summed (`summarizeSeats` pattern). Real invite flow: `app/api/exhibitor/invite/route.ts` + redeem path, locked by `tests/invite-lifecycle.test.ts`.

### 6.7 Strategy / playbook — PERSISTED, event-scoped, optional
`events.briefing_strategy` (json: `productFocus`, `targetBuyerPersona`, `eventGoal`, `toneOfVoice`, `guardrails`) written by `saveEventBriefingStrategy` via `/api/exhibitor/briefing-setup`; `briefing_event_knowledge_items` (trusted sources: files/urls/notes, event+company scoped). Absence is normal — the module must collapse/hide when unset (brief §7.2F).

### 6.8 Briefs — PERSISTED (+ optional GENERATED polish)
`lead_briefings` / `import_batch_row_briefings` with `approval_status` (`pending|approved`). "Generated" = row with content; "approved" = `approval_status='approved'`. Deterministic compose + optional real AI polish (`gpt-4o-mini`).

### 6.9 Activity / meetings / revenue
No general audit-log table (only `workflow_trigger_decisions` / `workflow_runs` carry event-scoped timestamps, flag-gated). **Meetings booked: no model — UNAVAILABLE.** Pipeline/revenue/ROI: UNAVAILABLE. Prior-event comparison baseline: UNAVAILABLE (no comparability framework).

### 6.10 Signals library — PERSISTED
`signals` with event-scoped copies (migration `0074`); per-lead `intent_signals` json. Usable for account themes today; not required for Phase 1 workspace modules.

---

## 7. Existing deeper intelligence route classification

Zero hits in shipped code for `Real-Time Intelligence`, `Executive Intelligence`, `Coaching Dashboard`, `Product & Market`, `Open Real-Time`, `View Coaching`, intelligence tab bars, or `pulse`. Classification of every concept found:

| Concept | Location | Classification |
|---|---|---|
| Real-Time Intelligence dashboard | `.audit-reference/lr-admin-backend/cc-realtime.jsx` (unrouted mockup) | **FUTURE_ONLY** |
| Executive Intelligence dashboard | `.audit-reference/.../cc-executive.jsx` | **FUTURE_ONLY** |
| Coaching dashboard (+ leaderboard, RepDetailDrawer) | `.audit-reference/.../cc-coaching.jsx` | **FUTURE_ONLY** |
| Product & Market dashboard | `.audit-reference/.../cc-deep.jsx` | **FUTURE_ONLY** |
| Prototype EvidenceDrawer pattern | `.audit-reference/.../cc-realtime.jsx` | **FUTURE_ONLY** as code; the *pattern* is rebuilt net-new in Phase 1 (§16) |
| Generic Event Command Center | `app/(app)/exhibitor/dashboard/*` | Being replaced (this program); its useful helpers are REUSED |
| Account Command Center | `app/app/events/*`, `lib/events/account-command-center-core.ts` | **EXISTING_AND_RETAINED** (out of replacement scope; preserved) |
| Leads Intelligence | `/exhibitor/leads` | **EXISTING_AND_REUSED_AS_RECORD_DETAIL** (canonical drill-down destination) |
| Lead detail | `/exhibitor/leads/[leadId]` | **EXISTING_AND_REUSED_AS_RECORD_DETAIL** |
| Campaigns / settings / users workflows | existing routes (§2.5) | **EXISTING_AND_REUSED_AS_RECORD_DETAIL** (workflow destinations) |

The `.audit-reference/` bundle is not routed, not imported, not built, and is deliberate reference material for this program's documents — **leave untouched** (not DEAD_AND_SAFE_TO_REMOVE within this scope; removal would be unrelated cleanup). No current user depends on any prototype surface. The Phase 1 workspace links to none of them. Nothing here justifies building an intelligence suite, and this audit does not recommend one.

---

## 8. RBAC and tenancy

- **Roles** (`lib/auth/session.ts` `APP_ROLES`): `platform_admin`, `organizer_admin`, `exhibitor_admin`, `exhibitor_viewer`, `viewer` (legacy). Predicates in `lib/auth/role-scope.ts` (`isExhibitorAdminRole` gates writes; `isExhibitorScopedRole` for read surfaces).
- **Canonical access resolution:** `resolveAccessibleEventIdsForUser` (`lib/server/company-event-access.ts:193`, pure core in `company-event-access-core.ts`) → `{eventIds, resolution, companyId, role}`; resolutions `platform_all | organizer_scope | company_all_events | company_assigned_only | legacy_event_scoped | none`. Cached per request via `getCachedExhibitorAccessibleEventResolution`.
- **Direct customer** = `exhibitor_admin` + eligible **company-scoped license** (`licenses.scope='company'`, active, started, unexpired — `exhibitor-company-license-admin-eligibility.ts`) + `users.event_access_mode='all_company_events'` → resolution `company_all_events` (all company events). Assigned exhibitors → `company_assigned_only` / `legacy_event_scoped` via `event_users`. There is no company "type" column and no operating-mode route.
- **Choke points the workspace must use:** `requireExhibitorScope()` (admits admin + viewer), `assertEventIdAccessibleForUser` / `resolveValidatedActiveEventIdForUser` (never trust a client-supplied eventId), then explicit `.eq("company_id", companyId)` + event scoping on every admin-client query (conversations join through `leads`). Inaccessible event → redirect to the resolved accessible event or `/app/events` (existing behavior; no `notFound()`).
- **Viewer read-only:** viewers cannot invite (403), cannot reach `/exhibitor/users` or `/app/events` management (redirects), get `canEdit=false` tables, and RLS grants no DELETE (`0069`). The workspace must hide/disable write CTAs for viewers; server routes already enforce.
- **Platform/organizer:** the workspace page itself redirects them per existing role branches (platform → `/admin/events/{id}`, organizer → `/app/organizer`), preserving explicit overrides.
- **Tenancy tests already locked:** `tests/access-matrix-surfaces.test.ts`, `tests/mobile-events-access.test.ts`, `tests/invite-lifecycle.test.ts`.

---

## 9. Reusable architecture and components

Safe to reuse as-is: `components/layout/page-header.tsx` (`PageShell`/`PageHeader`), `components/navigation/back-link.tsx`, `components/layout/exhibitor-multi-event-breadcrumb.tsx`, `lib/exhibitor/exhibitor-app-nav.ts` (canonical hrefs), `lib/events/event-portfolio.ts` (grouping/ordering/`exhibitorOpenEventHref`), `lib/leads/exhibitorLeadsDrilldown.ts` (`countLeadsMatchingView`, `buildExhibitorLeadsIntelligenceHref`), `lib/data/admin-events.ts` (`formatEventDateRange`, `formatEventLocation`), `lib/leads/temperature.ts`, `lib/leads/priorityLevels.ts` (accents), access/gating helpers (§8), and the **null-degradation loader contract** (failed secondary query → `null`, section renders "unavailable", never fabricated 0 — as in `app/app/events/page.tsx` `tryRows`).

Reuse the pattern, extract/rebuild: `KPICard`, `EventLifecycleBadge`, relative-time/short-date helpers (all currently inlined in the dashboard page), quick-action card markup. Net-new: the evidence drawer (no shared Sheet/Drawer primitive exists; nearest analog `components/signals/signal-library-modal.tsx`), the lifecycle resolver, the three state bodies, and the workspace data loaders/derivation cores. There is no chart library (all inline SVG) — Phase 1 needs no charts beyond simple count bars. Layout conventions: `max-w-[1080px]`, `lg:grid-cols-[minmax(0,1fr)_310px]` right-rail, `rounded-2xl border border-slate-200 bg-white p-4 shadow-sm` cards (from `portfolio-view.tsx`) — matches the mockups' width/rail structure.

---

## 10. Upcoming / Event Readiness — module supportability

Conditional display rule for all: render only what its source supports; a `null` (failed/unavailable) source shows an explicit "unavailable" state, never 0. All queries scoped company+event; viewer sees read-only (no action buttons requiring writes).

| Module | Status | Source / semantics | Action | Empty/unavailable | Risk |
|---|---|---|---|---|---|
| Event details item | **SUPPORTED_NOW** | `events` row: name, dates, location present? Missing dates/location = incomplete | Edit → event settings (tenant-aware href) | Incomplete state is the point; query failure → unavailable | Low |
| Team invitations item | **SUPPORTED_NOW** | `event_users` for event (`status='invited'` vs `active`) + outstanding `invite_codes` (company) | → `/exhibitor/users` | 0 pending → complete; no rows → "no team assigned yet" | Low |
| Seats & licenses item | **SUPPORTED_NOW** | Active `licenses` summed `seats_used/seats_total` (label as cached counts) | → `/exhibitor/users` (admin) / `/app/settings` (account) | No license → honest "no active license" | Low; `seats_used` is a cache — display-only |
| Strategy & playbook item | **SUPPORTED_NOW** (optional) | `events.briefing_strategy` set? knowledge items count | → `/exhibitor/briefings/setup` | Unset → restrained optional setup row; never a blocker | Low |
| Lead import & mapping item | **PARTIALLY_SUPPORTED** | Batches are company-scoped (no event FK); honest signal = event lead count + published-batch existence | → `/exhibitor/import/wizard` | No leads → "no leads imported yet (optional)" | Medium — keep reduced wording |
| Mobile capture access item | **PARTIALLY_SUPPORTED** (reduced "capture readiness") | `event_users.permissions.app` per event + seat availability (`evaluateAppAccessGrant` semantics). **No device/scanner data — do not imply hardware state** | → `/exhibitor/users` | No app-enabled members → the blocker | Medium — wording must say "capture access", not scanner health |
| Brief readiness item | **SUPPORTED_NOW** (conditional) | `lead_briefings` counts by `approval_status` for event leads; show only when leads exist | → briefings workspace | No leads → hidden | Low |
| Readiness KPIs (counts, "N of M items complete") | **SUPPORTED_NOW** | Derived deterministically from the checklist items above — no arbitrary percentage | — | Distinguish unavailable vs complete per item | Low |
| What Matters Now (one blocker) | **SUPPORTED_NOW** | Deterministic blocker ranking (fixed severity order, §17); neutral "ready" state when none | One real action per blocker | Neutral state | Low |
| "Opens in N days" | **SUPPORTED_NOW** | `start_date` vs UTC today | — | Hidden when no start date | Low |
| Setup % score, scanner/device rows, fake team-prep beyond the above | **UNSUPPORTED** | — | — | **Omit** (mockup-only) | — |

Team preparation panel (mockup right rail): SUPPORTED_NOW from `event_users` + `users` + `invite_codes` — per-member rows with honest `active`/`invited` states; must not conflate company users with event assignment (§6.6 makes the distinction cleanly).

---

## 11. Live state — module supportability

| Module | Status | Source / semantics | Action / evidence | Empty/unavailable | Risk |
|---|---|---|---|---|---|
| What Matters Now | **SUPPORTED_NOW** | Deterministic priority over live conditions (§17): hot-without-follow-up → overdue → processing failures → top theme (min sample) → neutral | One CTA (filtered leads / follow-up view); evidence where theme-based | Neutral: "N conversations captured today" or quiet state | Low |
| KPI: Conversations today | **SUPPORTED_NOW** | `lead_conversations.created_at` = UTC today, joined through event+company leads; bounded | Optional link to lead list | No conversations → 0 is honest here (real count); query failure → unavailable | Low |
| KPI: Leads captured today | **SUPPORTED_NOW** | `leads.created_at` today, scoped | → Leads Intelligence | Same | Low |
| KPI: Hot leads (needing follow-up) | **SUPPORTED_NOW** | `temperature='hot'`; sub-state: no `follow_up_date` or overdue, `status != 'closed'` — one definition page-wide (§4) | → `/exhibitor/leads?...temperature=hot` | Honest zero | Low |
| KPI: Follow-ups due/overdue | **SUPPORTED_NOW** | Canonical due window (§6.2) | → `view=follow_up_due` | Honest zero | Low |
| KPI: Briefs generated/approved | **SUPPORTED_NOW** (conditional) | `lead_briefings` counts | → briefings | Hidden when no briefing usage | Low |
| KPI: Reps capturing today | **PARTIALLY_SUPPORTED** | Distinct `owner_user_id` among today's captured leads/conversations — label exactly "reps capturing today" (no floor/staffing claim) | — | Hidden when 0/unavailable | Medium — wording |
| KPI: Avg lead quality | **UNSUPPORTED** | No canonical quality definition (rating is a 0–5 user star, not "quality") | — | **Omit** | — |
| Emerging themes / attendee needs | **SUPPORTED_NOW** (conditional) | Deterministic aggregation of `priority_themes[]` (+`pain_points[]`/`desired_outcomes[]`) across event conversations: normalize (trim/casefold), count, min sample ≥ 3 conversations, cap 5 rows, rank by count then A–Z | Row → evidence drawer (supporting conversations) | Below sample → module hidden with quiet note | Medium — normalization quality |
| Rising objections | **SUPPORTED_NOW** (conditional) | Same regime over `objections[]`; **no trend arrows** (no baseline) | Evidence drawer | Hidden below sample | Medium |
| Competitor mentions | **SUPPORTED_NOW** (conditional) | `competitors_mentioned[]` aggregation | Evidence drawer | Hidden | Medium |
| Messaging that's resonating (88%/74% bars) | **UNSUPPORTED** | No outcome/conversion data — percentages would be fabricated | — | **Omit** | — |
| Signal movement / "+12 vs Day 1" | **UNSUPPORTED** | No stored baseline | — | **Omit** (counts only, no deltas) | — |
| "What to do differently" generated callout | **UNSUPPORTED** | No event-level synthesis service | — | **Omit** | — |
| Leads requiring action | **SUPPORTED_NOW** | Capped list: hot without follow-up → overdue follow-ups → recent hot; stable order (temperature, then follow_up_date/created_at, then id) | Rows → lead detail; header → filtered leads | Explicit "all clear" state | Low |
| Coaching callouts | **PARTIALLY_SUPPORTED** (conditional) | Recurring `rep_behavior_patterns[]` across event conversations (count ≥ 3), presented as observed patterns with evidence — **no scores, no leaderboard, no per-rep ranking** | Evidence drawer | Hidden below sample | Medium — framing must stay factual |
| Operational notices | **PARTIALLY_SUPPORTED** (conditional) | Only real signal: event conversations with `transcription_status/synthesis_status = 'failed'` (or stuck pending) — counts, no device claims | → lead detail of affected records via drawer | Hidden when none | Low |
| Scanner/device health, live polling claims | **UNSUPPORTED** | No data (§6.5) | — | **Omit**; show honest "Updated <relative time>" render timestamp only | — |

---

## 12. Completed / Post-Event state — module supportability

| Module | Status | Source / semantics | Action / evidence | Empty/unavailable | Risk |
|---|---|---|---|---|---|
| What Matters Now (final outcome + next action) | **SUPPORTED_NOW** | Deterministic: hot leads with no follow-up scheduled → drafts awaiting review (flag-gated) → overdue follow-ups → strongest final theme → neutral recap | One CTA (filtered leads / drafts / campaigns) | Neutral recap state | Low |
| KPI: Total leads | **SUPPORTED_NOW** | Event lead count | → Leads Intelligence | Honest zero | Low |
| KPI: Hot leads (+ warm/cold split) | **SUPPORTED_NOW** | `temperature` counts — same single definition | → filtered leads | Honest | Low |
| KPI: Follow-up state | **SUPPORTED_NOW** | Scheduled / overdue / none / closed groupings — labeled precisely (no "sent %") | → `followUp=` views | Honest | Low |
| KPI: Briefs approved | **SUPPORTED_NOW** (conditional) | `approval_status='approved'` of generated | → briefings | Hidden when unused | Low |
| KPI: Meetings booked | **UNSUPPORTED** | No model (§6.9) | — | **Omit** | — |
| KPI: Lead quality score | **UNSUPPORTED** | No canonical definition | — | **Omit** (a "rated X of Y" count is allowed) | — |
| Final themes / buying signals / objections / competitors | **SUPPORTED_NOW** (conditional) | Same deterministic aggregation as Live over the whole event window; `buying_signals[]` included; counts, no % movement | Evidence drawer | Hidden below sample | Medium |
| Best-performing messaging | **UNSUPPORTED** | No outcome data | — | **Omit** | — |
| Follow-up readiness panel | **SUPPORTED_NOW** | Hot with no follow-up ("untouched high-priority", honest label), open/overdue follow-ups, `status='new'` count labeled "still marked new", drafts ready (flag-gated `generated_drafts`) | → filtered leads / drafts review | Explicit states | Low |
| Embedded executive snapshot | **PARTIALLY_SUPPORTED** (reduced) | Only deterministic findings: strongest final theme + follow-up gap + one commercial next step. **No pipeline $, no top-account (free-text inference forbidden), no prior-event comparison** | CTA → campaigns / leads | Collapses to nothing extra when below sample | Medium — keep reduced |
| Embedded coaching | **PARTIALLY_SUPPORTED** (conditional) | Recurring `rep_behavior_patterns[]` (whole event) as evidence-backed patterns; no scores/leaderboard | Evidence drawer | Hidden | Medium |
| Take it further | **SUPPORTED_NOW** | Launch follow-up campaign → `/exhibitor/campaigns`; review drafts (flag-gated); open filtered leads; event settings | Real routes only | Rows appear only when destination is real | Low |
| Export recap | **PARTIALLY_SUPPORTED** | No recap export exists; the real export is the existing leads CSV export (leads-export services/routes). Offer "Export leads (CSV)" only | Existing export flow | Hidden if export unavailable to role | Low |
| ROI / revenue / benchmarks / event comparison | **UNSUPPORTED** | No models | — | **Omit** | — |

---

## 13. Mockup-to-production mapping

| Mockup element (Pre/Live/Post references) | Phase 1 production treatment |
|---|---|
| Shell: Back to Events, name, lifecycle chip, dates·location·booth, "Opens in/Day N of M/Wrapped" | Build (shell §15); booth omitted (no booth field); day context from dates; "Updated X min ago" = render-time relative timestamp only |
| Pre: "82% event setup / 9 of 11 steps" | Count form only ("N of M items complete") — no percentage |
| Pre: Team assigned 4/6, Seats 6/10, capture "Not set" | Real: event_users, licenses; capture = mobile-capture access (no device claims) |
| Pre: readiness checklist + team panel + strategy/playbook + final actions | Build per §10 |
| Live: "Follow up 12 hot", What Matters hero | Real temperature-based counts; deterministic hero (§17) |
| Live: KPI 92 conversations "+21 vs Day 1", 7.4 avg quality, 84 briefs | Conversations today (no delta), briefs when real; quality omitted |
| Live: Live intelligence (needs/topics with deltas), "What to do differently" | Themes/objections/competitors as deterministic counts with evidence; deltas and generated advice omitted |
| Live: "Open Real-Time Intelligence", "Real-Time Intelligence" button, Trends → | **Removed** (forbidden Phase 1 controls) — replaced by on-page modules + evidence drawer |
| Live: Team coaching panel "All reps →" | Reduced to conditional pattern callouts; no reps dashboard link |
| Live: Operational (scanners 5/6, capture health) | Only processing-failure notices when real; scanner rows omitted |
| Post: 412/128/46/380 KPI row | Total, hot, follow-up state, briefs approved; meetings omitted |
| Post: Final intelligence recap + buying signals/top objections chips | Build from conversation arrays (deterministic) |
| Post: "Open Executive Intelligence", "View Coaching Dashboard", pipeline $1.8M, "+22% vs Growth Expo", top account | **Removed** — reduced executive snapshot per §12; no revenue/comparison/account inference |
| Post: Follow-up readiness "82 uncontacted · median first touch 6h" | Honest groupings; no median-touch metric (no touch events); "still marked new" labeling |
| Post: Take it further (campaign, route to sales, follow-up, Campaign Agents) | Campaigns + filtered leads + drafts review (flag-gated); "route to sales" omitted (no workflow) |
| Anti-reference (generic dashboard): KPI row, Leads Over Time, Priority Distribution, Next Follow-Ups, Recent Activity, Manage cards | **All removed** by Prompt 4 (§3 verdicts) |

## 14. Future-phase controls to remove or replace (explicit list)

Never rendered in Phase 1: `Real-Time Intelligence`, `Open Real-Time Intelligence`, `Executive Intelligence`, `Open Executive Intelligence`, `Coaching`, `View Coaching Dashboard`, `Product & Market`, any Real-Time/Executive/Coaching/Product-&-Market tab bar, cross-dashboard filter bars, `Trends →`, generic "Open intelligence", intermediate intelligence landing pages, "coming soon" navigation, lifecycle switches. Prompt 3/4 tests must assert their absence in workspace source.

---

## 15. Chosen canonical route strategy

**Upgrade `/exhibitor/dashboard` in place.** It stays the single rendering event home; the page gains lifecycle dispatch and the three state bodies.

Why not a new route: `/app/events/[eventId]` (the other candidate) is admin-only today (`exhibitor_viewer` and event-level tenants are deliberately routed away from `/app/events/*` management surfaces), while the workspace must serve viewers read-only and assigned/legacy tenants. Re-homing would force changes to entry redirects, sidebar-mode resolution, management gates, and a dozen inbound links — high breakage for zero product gain. Upgrading in place keeps every existing entry (account cards, sidebar, sign-in landing, help/settings back-links, `buildExhibitorDashboardHref`) working unchanged.

Resulting contract (already true after Prompt 2):

```
Account event card → /app/events/{id} (guard) → /exhibitor/dashboard?eventId={id}
  → resolveEventLifecycle(...) → Upcoming | Live | Completed body on the same route
```

- `/app/events/[eventId]` remains a thin access-checking alias (one hop, documented; not a duplicate home — it renders nothing).
- Legacy stubs (`/app/exhibitor/dashboard`, `/app/dashboard`, …) remain as-is.
- No `/app/events/{id}/setup` route; no new routes at all in Phase 1 (evidence is served in-page).
- Explicit accessible selection is preserved: URL `eventId` validated against `access.eventIds`; never overridden when valid.

## 16. Chosen evidence interaction

**Right-side evidence drawer on the workspace, fed by bounded server-loaded data, linking onward to lead detail.** A theme/objection/competitor/coaching/processing row opens a drawer listing its supporting records: lead full name + company text, conversation `summary` (or the matched array item), relative + short-date timestamp from `created_at`, and a "View lead" link to `/exhibitor/leads/{leadId}?eventId=`. Evidence rows are collected during the same server derivation pass (capped, e.g. ≤ 5 per insight), so no new API route and no client fetch; the drawer is a small client component (net-new — no shared drawer primitive exists). No raw IDs, no JSON, no ISO strings, no cross-event rows (scoping enforced at query time). Viewer sees the same read-only drawer. This is combination (b)+(d) from the prompt's options: drawer + existing record-detail routes.

---

## 17. Deterministic What-Matters-Now selection (all three states)

Fixed priority ladders; first satisfied condition wins; ties inside a condition break by count desc, then lead `created_at` desc, then id asc. Neutral state when nothing fires. No generated prose.

- **Upcoming:** 1) event details incomplete (missing dates/location) → Edit settings; 2) no team member has mobile-capture access → Manage team; 3) invitations outstanding → Resend/manage; 4) seats exhausted / no active license → Manage seats; 5) optional strategy nudge only if partially begun; else neutral "ready" with days-to-launch.
- **Live:** 1) hot leads without follow-up (count ≥ 1) → filtered leads; 2) overdue follow-ups → follow-up view; 3) processing failures (≥ 1) → affected records; 4) top emerging theme (sample ≥ 3 conversations) → evidence; else neutral "N conversations / M leads captured today".
- **Completed:** 1) hot leads with no follow-up scheduled → filtered leads; 2) drafts awaiting review (flag-gated) → drafts; 3) overdue follow-ups → follow-up view; 4) strongest final theme → evidence; else neutral recap (totals).

---

## 18. Exact Prompt 2 plan (≤ 18 files)

Create:
1. `lib/events/event-lifecycle.ts` — canonical resolver (§5.2), pure, no I/O.
2. `lib/events/event-workspace-readiness-core.ts` — pure readiness derivation: checklist items, KPI counts, blocker ranking, team-preparation rows, strategy summary; typed inputs; `null`-aware.
3. `lib/server/event-workspace-data.ts` — scoped loaders (events row incl. `briefing_strategy`; `event_users`+`users`; `invite_codes`; `licenses`; event lead count; `lead_briefings` counts; knowledge-item count) with per-query null-degradation; single entry `loadEventWorkspaceUpcomingData`.
4. `app/(app)/exhibitor/dashboard/event-workspace-shell.tsx` — shared shell (Back to Events via `BackLink` → `/app/events` for portfolio tenants / hidden for event-level single-event tenants; name; lifecycle badge from the new resolver; `formatEventDateRange`/`formatEventLocation`; day/opens-in context; permission-aware direct actions from `buildEventQuickActions` output).
5. `app/(app)/exhibitor/dashboard/upcoming-state.tsx` — Event Readiness body (What Matters Now, KPIs, checklist, team panel, optional strategy, final actions).
6. `app/(app)/exhibitor/dashboard/legacy-summary-body.tsx` — the current generic body extracted verbatim behind one adapter (temporary compatibility for live/completed only; removal marked for Prompt 4).
7. `tests/event-lifecycle.test.ts` — boundaries (day-before/start-day/during/end-day/day-after), UTC regime, missing/one-sided/malformed dates, continuous_capture, explicit COMPLETED precedence, stale-ACTIVE correction.
8. `tests/event-workspace-readiness.test.ts` — checklist derivation, blocker ranking + tiebreaks, unavailable-vs-complete, team distinction (company user ≠ assigned), optional playbook absence, seats states.
9. `tests/event-workspace-page.test.ts` — page-source contract: lifecycle dispatch present; Upcoming never renders legacy body; no `/setup` href; no forbidden labels (§14); temperature selected in leads queries; viewer-safe.

Modify:
10. `app/(app)/exhibitor/dashboard/page.tsx` — lifecycle dispatch: `upcoming` → new body; `live`/`completed` → legacy adapter; select `temperature` in the leads query (fixes the Hot KPI in the interim legacy body too).
11. `app/(app)/exhibitor/dashboard/event-command-center-view.tsx` — export/adjust badge + header pieces the shell reuses (or shrink to what remains).
12. `lib/exhibitor/event-command-center.ts` — badge derivation switches to `resolveEventLifecycle`; keep `buildEventQuickActions`.
13. `tests/exhibitor-event-command-center.test.ts` — update contract to the new shell/dispatch reality.

Reserve (only if needed, staying ≤ 18): `lib/leads/exhibitorLeadsDrilldown.ts` (correct the "Score 80+" description), `components/app/no-active-event-entry.tsx` (unchanged expected), `tests/event-portfolio-grouping.test.ts` (only if badge change ripples). No `/app/events` changes needed — links already correct.

## 19. Exact Prompt 3 plan (≤ 24 files) and Prompt 4 plan (≤ 22 files)

**Prompt 3 — Live state.** Create: `lib/events/event-workspace-live-core.ts` (pure: KPI assembly, theme/objection/competitor aggregation with normalization + min-sample + caps + stable ranking, action-lead selection, coaching-pattern derivation, processing notices, live What-Matters-Now ladder, evidence-row shaping); `lib/server/event-workspace-live-data.ts` (bounded scoped loaders: today's leads/conversations, hot/follow-up slices, conversation-intelligence arrays joined through leads, `generated_drafts` count when flag on); `app/(app)/exhibitor/dashboard/live-state.tsx`; `app/(app)/exhibitor/dashboard/evidence-drawer.tsx` (client, shared with Completed); tests `tests/event-workspace-live-core.test.ts` (derivations, tiebreaks, min-sample, no-fake-zeros, partial failure), `tests/event-workspace-live-page.test.ts` (dispatch, forbidden-label absence, viewer, evidence scoping). Modify: `page.tsx` (live dispatch → new body), shell if live-specific context lands, `event-workspace-data.ts` (shared loader plumbing), existing page test. Live no longer touches the legacy adapter.

**Prompt 4 — Completed state + removal.** Create: `lib/events/event-workspace-completed-core.ts`, `lib/server/event-workspace-completed-data.ts`, `app/(app)/exhibitor/dashboard/completed-state.tsx`, `tests/event-workspace-completed-core.test.ts`, `tests/event-workspace-completed-page.test.ts`, plus a lifecycle-regression test sweep. Modify: `page.tsx` (completed dispatch; delete legacy imports, chart builders, `KPICard`, timeline/priority/next-follow-up/recent-activity sections). Delete: `legacy-summary-body.tsx`. Clean: `DASHBOARD_SUMMARY_VIEWS`/`priorityBucketCount` if then-unused by remaining surfaces (verify by grep — `countLeadsMatchingView` stays for leads page? verify), stale "Score 80+" description, dead styles/imports; repo-wide greps proving no forbidden labels, no stale `/setup`, no orphaned links. Legacy stub routes stay (harmless redirects). Final regression per prompt §L/M.

## 20. Schema verdict

**No schema changes required for Phase 1.** Every SUPPORTED/PARTIAL module above reads existing tables. `ADDITIVE_ALLOWED` is not exercised. Explicitly rejected as unnecessary: a lifecycle column change (derivation suffices), an events.timezone column (UTC-day regime documented), evidence tables (drawer reads existing records), dashboard-only rollup tables (all derivation on read, bounded), meetings/pipeline models (out of scope). No migration files will be created; if a later prompt discovers a hard requirement, that is a stop-and-report event per the loop controller.

## 21. Risks and hard-stop watch items

1. **Stored-status drift vs date-derived lifecycle** (§5.2): an admin-created event with contradictory status will change badge/state on the workspace while the account portfolio group (status-based, out of scope) may disagree. Mitigation: explicit-COMPLETED precedence rule; documented; portfolio unification deferred.
2. **`lead_conversations` lacks event/company columns** — every intelligence query must join through `leads`; a missed join is a tenancy leak. Mitigation: single loader module + scoping tests.
3. **Theme normalization quality** — free-string arrays may fragment counts; deterministic casefold/trim + min-sample keeps it honest; wording avoids overclaiming.
4. **`seats_used` is a derived cache** — display-only usage, labeled.
5. **Workflows feature flag** — draft modules must degrade to hidden when off.
6. **Playwright auth-seeding limitation** — browser E2E requires seeded auth (`E2E_AUTH_BYPASS_ENABLED`); node test suites + page-source contracts are the reliable lane; will be reported honestly per run.
7. **Page-source contract tests** (regex over file text, e.g. `exhibitor-event-command-center.test.ts`) are brittle to refactors — update deliberately in each prompt, never delete assertions that enforce the Phase 1 boundary.
8. File-count pressure in Prompt 3 (24 max) — evidence drawer shared with Prompt 4 keeps it inside budget.

## 22. Decisive recommendation

Proceed with the four-prompt plan exactly as scoped: Prompt 2 builds `resolveEventLifecycle`, the shared shell, and the complete Upcoming/Event Readiness state on `/exhibitor/dashboard` (legacy body isolated behind one adapter for live/completed); Prompt 3 replaces the live path with the full Live state (temperature-canonical KPIs, deterministic conversation-intelligence modules with an evidence drawer, action leads, conditional coaching patterns, real processing notices); Prompt 4 replaces the completed path with the Post-Event state and deletes the generic body, its charts, and its contradictory KPI wiring. No new routes, no schema changes, no intelligence suite. Every module maps to a production source named in §6 or is omitted.

---

### Completion requirements (explicit statements)

- **Canonical event route:** `/exhibitor/dashboard?eventId={id}` (upgraded in place); `/app/events/[eventId]` retained as thin access-checked alias.
- **Canonical lifecycle resolver:** new `lib/events/event-lifecycle.ts` `resolveEventLifecycle` (rules §5.2), replacing status-only badge derivation on the workspace.
- **Account-to-event entry:** unchanged — `/app/events` cards → `/app/events/{id}` → workspace.
- **Upcoming modules** (§10): shell; What Matters Now; readiness KPIs; checklist (details, invitations, seats/licenses, optional strategy/playbook, reduced import + capture-access, conditional briefs); team preparation; final actions.
- **Live modules** (§11): What Matters Now; KPIs (conversations today, leads today, hot needing follow-up, follow-ups due, conditional briefs, reduced reps-capturing); themes; objections; competitors; leads requiring action; conditional coaching patterns; conditional processing notices; evidence drawer.
- **Completed modules** (§12): What Matters Now; outcome KPIs (total, hot, follow-up state, conditional briefs approved); final recap (themes/buying signals/objections/competitors); follow-up readiness; reduced executive snapshot; conditional coaching; Take it further; CSV export where real.
- **Authoritative sources:** named per row in §§10–12, inventory §6.
- **Evidence behavior:** in-page right drawer + lead-detail links (§16); server-scoped; no raw IDs/JSON.
- **Workflow destinations:** Leads Intelligence filters, lead detail, `/exhibitor/campaigns`, drafts review (flag-gated), event settings (tenant-aware), `/exhibitor/users`, `/app/settings`, briefing setup.
- **Legacy retained temporarily:** extracted generic body as the live/completed compatibility adapter (Prompt 2–3 window only).
- **Legacy removed by Prompt 4:** generic KPI row, Leads Over Time, priority distribution, next follow-ups, recent activity, manage-card grid, chart builders, adapter file, contradictory Hot wiring, "Score 80+" description.
- **Deeper intelligence routes:** none exist in production; `.audit-reference/` prototype left untouched; nothing linked.
- **Deferred future-phase items:** Real-Time/Executive/Coaching/Product & Market dashboards, intelligence tabs/filters, trends/deltas, quality scores, meetings, pipeline/ROI, prior-event comparisons, device/scanner monitoring, survey modules, generated advisory prose.
