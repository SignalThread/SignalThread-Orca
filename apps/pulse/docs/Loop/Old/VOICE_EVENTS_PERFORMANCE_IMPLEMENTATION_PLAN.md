# Voice Events Performance Implementation Plan

Source audit: `docs/Loop/VOICE_EVENTS_PERFORMANCE_AND_NAVIGATION_AUDIT.md`

Status: proposed; no fixes implemented by the audit

Ordering principle: restore deployability, remove document reloads, eliminate duplicate expensive work, then restructure and optimize payloads based on new measurements.

## Phase 0 — Restore a measurable production-build baseline

### Objective

Make the existing working tree produce a successful production build without reintroducing theme mutation loops, then capture a reproducible authenticated baseline before performance fixes.

### Findings addressed

- P0 dirty-tree production build failure in `ThemeProvider`.
- Missing authenticated production/local-production measurements.

### Likely files

- `components/theme/ThemeProvider.tsx`
- `app/layout.tsx`
- `app/app/layout.tsx`
- theme/account-context tests
- optional uncommitted audit artifacts under a documented temporary directory

### Acceptance criteria

- `npm run build` succeeds for all routes.
- Events and SMB theme behavior remains canonical; no DOM observers or repeated class-removal loops.
- One `next start` instance serves the test port.
- An authenticated Chrome session can open `shared-hope` and the current JuST 2026 event read-only.
- Baseline table contains three cold and three warm runs with median and slowest values.

### Measurements that must be captured

- TTFB, FCP, LCP, CLS, usable time, loading duration, requests, APIs, bytes, JS, long tasks.
- Server-Timing and response bytes for Intelligence.
- Document versus RSC requests for every navigation.
- Production deployment ID, browser, cache state, event ID/name.

### Targeted tests

- Theme provider Events/SMB/no-preference/explicit-preference tests.
- App layout hydration test.
- Production build.

### Browser verification

- Reload Events and SMB with/without saved theme; no hydration warning or dark flash.
- Navigate read-only through all target surfaces and save baseline traces.

### Dependency order

Required before every later phase so before/after results are credible.

## Phase 1 — Remove full-document workspace navigation

### Objective

Keep ordinary Events workspace navigation inside the Next App Router while preserving exact canonical URLs, browser history, accessibility, and product mode.

### Findings addressed

- P1 workspace rail, Setup/Signals switch, lifecycle selector, Signals tab, and contextual links use plain anchors.
- Context cache and all client state are discarded on navigation.
- Scroll/focus and shell are rebuilt.

### Likely files

- `components/app/events/EventWorkspaceShell.tsx`
- `app/app/events/[eventId]/dashboard/page.tsx`
- `components/events/EventSessionsIntelligence.tsx`
- `components/events/EventSpeakersIntelligence.tsx`
- `components/events/EventPreEventSignals.tsx`
- `components/events/EventPostEventClosingBrief.tsx`
- `components/admin/Dashboard2.tsx`
- related component and Playwright tests

### Acceptance criteria

- Rail, lifecycle, Overview, Intelligence, Sessions, Speakers, Actions, and Setup links cause no document request.
- URL/query semantics and back/forward behavior are unchanged.
- Account/event context request does not repeat solely because a tab changed.
- No loading-state or navigation regressions for SMB.
- External/kiosk/print links retain their intended full-navigation behavior.

### Measurements that must improve

- Warm same-event navigation median to ≤250 ms and p95 target ≤500 ms.
- Document request count per workspace tab/lifecycle click: 0.
- Shared JS re-transfer/re-evaluation and account-context calls: 0 on warm transition.

### Targeted tests

- Source/component contracts assert Next `Link` for internal links.
- Navigation integration test records PerformanceResourceTiming and fails on a `document` navigation.
- Back/forward retains selected tab/lifecycle and usable shell.
- Cross-account URL tests preserve encoded account/event IDs.

### Browser verification

- Click the full navigation matrix three times each with Network “Preserve log”.
- Confirm request type is RSC/fetch, not document; verify scroll/focus and no console/hydration error.

### Dependency order

After Phase 0; before interpreting context-cache, API, or render improvements.

## Phase 2 — Eliminate duplicate In-event Overview work

### Objective

Run the canonical heavy event-intelligence aggregation once per Overview load or refresh while preserving the UI contract and historical Intelligence optimizations.

### Findings addressed

- P1 `/analysis` and `/intelligence` both call `getEventIntelligenceSummary`.
- Up to eight Overview reads and a second fetch wave.
- 90-second refresh repeats the duplicate aggregate.

### Likely files

- `app/app/events/[eventId]/dashboard/page.tsx`
- `app/api/app/events/[eventId]/analysis/route.ts`
- `app/api/app/events/[eventId]/intelligence/route.ts`
- `lib/event-intelligence/aggregation.ts`
- `lib/dashboard-request.ts`
- route/service/dashboard tests

### Acceptance criteria

- Initial In-event Overview invokes `getEventIntelligenceSummary` exactly once.
- Poll/manual refresh invokes it exactly once.
- Overview totals, sentiment, themes, actions, evidence, selector filters, pre-event, post-event, and SMB outputs remain correct.
- Intelligence retains bounded attention (25 default/50 max), Server-Timing, response-size header, parallel aggregation, and zero GET writes.
- Existing content remains visible during background refresh.

### Measurements that must improve

- Heavy aggregate calls: 2 → 1.
- Overview initial APIs: target ≤5 after selector/bootstrap consolidation.
- Overview usable time and DB queries improve by at least the removed aggregate cost; record exact median/p95.
- Refresh API/query count decreases by one full aggregate.

### Targeted tests

- Route mocks assert one aggregate call for each Events surface.
- Dashboard request contract asserts no full Events `/analysis` when `/intelligence` is authoritative.
- Pre/post/SMB analysis regression tests.
- Explicit read-only Prisma write spy.

### Browser verification

- Capture cold/warm Overview waterfalls and compare with Phase 0.
- Filter survey/structure, manual refresh, and wait one polling interval; no duplicate aggregate or UI flash.

### Dependency order

After client navigation is fixed so reload noise does not obscure API counts.

## Phase 3 — Deduplicate request-scoped authentication and context

### Objective

Resolve Supabase actor and Prisma user once per HTTP request, then reuse that authoritative result through membership, account-admin, product, and event authorization.

### Findings addressed

- P1 `requireAccountAdmin` repeats `getUser` and User lookup.
- Parallel Setup APIs repeat membership/event checks independently.
- Client context is empty and sequentially gates Setup.

### Likely files

- `lib/auth/require-account-membership.ts`
- `lib/auth/require-account-admin.ts`
- `lib/auth/require-events-event-access.ts`
- new request-scoped authenticated-actor helper
- affected route tests
- optionally event layout/bootstrap files from Phase 4

### Acceptance criteria

- A normal-admin API calls Supabase `getUser` once and reads the Prisma User at most once.
- Membership, inactive-user, superadmin, account-contact, role, account type, event ownership, and cross-tenant behavior are unchanged.
- No authorization result is cached across requests.
- Route-specific event checks remain canonical and cannot be supplied by untrusted client data.

### Measurements that must improve

- Normal-admin guard Supabase calls: 2 → 1 per request.
- Normal-admin User queries: 2 → 1 per request.
- Setup initial Supabase calls: code-derived maximum 8 → no more than one per API initially; measure the final count.

### Targeted tests

- Call-count tests for member/admin/superadmin.
- Full permission matrix including inactive and cross-account actors.
- Event outside account and non-Events account rejection.
- Concurrency isolation test proving no actor leakage.

### Browser verification

- Load Setup and all Signals tabs; confirm successful calls and no extra 401/403.
- Test an SMB account and a second Events account read-only.

### Dependency order

Can follow Phase 2; the persistent layout can build on the canonical helper.

## Phase 4 — Add a persistent event workspace layout and narrow loading boundaries

### Objective

Keep event identity and navigation mounted across Setup/Signals and reveal useful content without waiting for unrelated slices.

### Findings addressed

- No nested Events layout.
- Client-only account bootstrap and whole-shell loading.
- Lifecycle reset clears all state.
- Several independent loading systems and false empty-state risk.

### Likely files

- new `app/app/events/[eventId]/layout.tsx`
- optional route-specific `loading.tsx`
- `components/app/events/EventWorkspaceShell.tsx`
- event Setup/Dashboard pages
- canonical account/event bootstrap service

### Acceptance criteria

- Shell/event identity remains mounted through Setup/Signals/tab/lifecycle navigation.
- A slow optional slice cannot hide the rail/header or already-valid content.
- Lifecycle changes preserve shell, focus, and last truthful content until replacement is ready.
- Server-seeded context is account/event scoped and not trusted as authorization for later APIs.
- SMB routes and admin layout remain unchanged.

### Measurements that must improve

- Workspace shell remounts per same-event navigation: 0.
- Page-wide loading duration: 0 for warm transitions.
- Event workspace cold usable target ≤1.8 s p50 / ≤3.0 s p95.
- Layout shift and false empty-state count: 0.

### Targeted tests

- Layout persistence integration test with mount counter.
- Narrow Suspense fallback tests.
- Lifecycle navigation state/focus tests.
- Direct deep-link refresh and account/event scoping tests.

### Browser verification

- Slow-network test each route and lifecycle; shell never disappears.
- Back/forward and deep refresh; no hydration warning or stale cross-event content.

### Dependency order

After the navigation and auth primitives stabilize.

## Phase 5 — Narrow mutation refreshes

### Objective

After common writes, update or invalidate only the affected read models and never reload the workspace.

### Findings addressed

- Agenda child refresh plus parent `ALL_WORKSPACE_SLICES` refresh.
- Structure archive refreshes all slices.
- Potential sequential mutation/read chains.

### Likely files

- `app/app/events/[eventId]/page.tsx`
- `components/events/EventAgendaWorkspace.tsx`
- agenda/structure/import route contracts
- listening-plan/readiness derivation tests

### Acceptance criteria

- Agenda row edits/import confirmation refresh agenda/listening readiness only as required.
- Structure archive invalidates only contracts proven to depend on it.
- One user action sends one mutation.
- Successful UI state is retained if an unrelated background refresh fails.
- Final import confirmation remains the only point that creates domain records.

### Measurements that must improve

- Common mutation: one mutation plus at most one narrow read.
- No account-context reload, document request, or four-slice refresh.
- Settled UI ≤1.2 s p50 target.

### Targeted tests

- Exact request/invalidation count per mutation.
- Idempotency/double-submit tests.
- Recoverable failure and no-false-success tests.
- No-write-before-confirmation import regression.

### Browser verification

- Edit one session, archive one structure item, confirm a safe fixture import in local QA; inspect Network and UI persistence.

### Dependency order

After the persistent layout/data ownership is clear.

## Phase 6 — Narrow and batch Events Home

### Objective

Return only the Events Home card contract with constant query count as the number of live events grows.

### Findings addressed

- Full account/location/event/question graph.
- `10 + 2N` approximate DB operations.
- Unbounded events payload.

### Likely files

- `app/api/app/account/route.ts`
- `lib/events-home-metrics.ts`
- `app/app/page.tsx`
- metrics/route contract tests
- Prisma schema only if an actual query plan proves an index need

### Acceptance criteria

- Home does not load question bodies unless rendered.
- Satisfaction/top open issue enrichment uses a constant number of queries.
- Metrics/ranking/link selection are byte-for-byte or semantically equivalent.
- SMB account response remains backward compatible.
- No production-data mutation or GET reconciliation.

### Measurements that must improve

- Metrics queries: `5 + 2N` → approximately 7 constant queries.
- Response payload and serialization reduced against the JuST account baseline.
- Account dashboard usable target ≤1.5 s p50 / ≤2.5 s p95.

### Targeted tests

- Multiple-live-event query-count test.
- Metric equivalence and top-issue ranking tests.
- Home DTO contract and SMB regression tests.
- Read-only spy.

### Browser verification

- Compare Home payload bytes/server time across cold/warm runs.
- Confirm all event cards, metrics, launch links, search, and filters remain truthful.

### Dependency order

Independent after Phase 3, but later avoids distracting from workspace navigation gains.

## Phase 7 — Split bundles and profile large lists

### Objective

Load only the selected Setup/Signals surface and optimize 86-session/121-speaker rendering only where profiling proves value.

### Findings addressed

- 328,888-byte raw dashboard route chunk.
- Eager QR dependency on all Setup tabs.
- Static mutually exclusive tab/lifecycle components.
- Unbounded list render/payload.

### Likely files

- `app/app/events/[eventId]/dashboard/page.tsx`
- `app/app/events/[eventId]/page.tsx`
- `components/events/EventDeploymentWorkspace.tsx`
- session/speaker/agenda workspace components
- route-level dynamic import/loading components

### Acceptance criteria

- Deployment/QR code is absent from non-deployment initial chunks.
- Inactive Signals tabs/lifecycle views are absent from the selected initial route chunk.
- No blank page while a lazy component loads; shell and truthful local skeleton remain.
- Search/filter/bulk selection at 86/121 rows has no >50 ms interaction task on the reference machine.
- Pagination/virtualization is added only if measured render/payload budgets fail.

### Measurements that must improve

- Successful analyzer report with compressed/gzip/brotli route sizes.
- Dashboard initial-route JS reduced by a recorded percentage; target at least 30% unless analyzer proves shared dependencies dominate.
- Interaction-to-next-paint for list search/select ≤100 ms p95.

### Targeted tests

- Dynamic boundary and fallback tests.
- Filtering/sorting/bulk-selection regression tests.
- Pagination/virtualization accessibility tests if introduced.

### Browser verification

- Disable cache and load each tab separately; inspect JS initiators and coverage.
- React profile 86 sessions and 121 speakers, including drawers/evidence.

### Dependency order

Last: bundle/list choices should use the stabilized route architecture and real traces.

## Final release gate

All phases must preserve:

- canonical account/product/event authorization;
- Events and SMB behavior;
- zero writes during ordinary GET/page loads;
- no avoidable redirect chains or document reloads;
- no duplicate context or same-data API requests;
- no theme DOM-observer workaround;
- one mutation per user action and narrow truthful refresh;
- no production data changes during performance verification.

The release report should provide before/after three-run medians and slowest runs for every route in the audit, plus HAR/trace identifiers, Server-Timing, response bytes, query counts, bundle analyzer output, React profiles, targeted tests, typecheck, successful production build, and `git diff --check`.
