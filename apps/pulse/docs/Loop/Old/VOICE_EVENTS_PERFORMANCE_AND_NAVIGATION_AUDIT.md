# Voice Events Performance and Navigation Audit

Audit date: 2026-08-06

Audit mode: read-only; no product or production-data changes

Repository: `/Users/ali/Documents/Booth Audio`

Branch / commit: `main` / `c513932aa37fe8d6374bd23fb846bc5afe6c2dee` (`Add flexible event imports and listening windows`)

Production target: `https://voice.signalthread.ai/app?account=shared-hope`

## 1. Executive summary

Voice Events feels as if it repeatedly reloads because its shared workspace navigation actually does perform full document navigations. `EventWorkspaceShell` and the Signals tab bar render ordinary `<a href>` elements rather than Next.js client links. Each click discards the JavaScript realm, account-context cache, React state, abort/deduplication state, and navigation shell. The destination then reconstructs account and event context through client effects and `no-store` APIs.

The most expensive code path is the In-event Overview. After a full-document tab/lifecycle transition it can issue eight reads: account context, analysis, timeline, voice-surveys, structure, a second scoped analysis, intelligence, and signals. Both `/analysis` and `/intelligence` call the same heavy `getEventIntelligenceSummary` aggregation, so the most expensive server computation is duplicated during the same page load. The page intentionally clears all visible state when event/account/lifecycle changes, amplifying the delay as a full-workspace loading state.

Setup has a similar context fan-out. It resolves account context first and only then requests four workspace slices. Three of those slices use `requireAccountAdmin`; for a normal account admin that helper calls Supabase `getUser` twice and reads the Prisma user twice in one request. A normal initial Setup load can therefore perform eight independent Supabase identity checks across five HTTP requests before its route-specific reads are counted.

The Events Home endpoint is also broader than the screen contract. It loads all locations, events, and event questions, then runs a five-query aggregate and two more queries for every live event. Its database cost grows as `10 + 2N` reads for `N` live events in the usual slug path, excluding ORM relation expansion details.

An authenticated production session was not available in the in-app browser. The only production observation was an unauthenticated `/app?account=shared-hope` load: the initial navigation action took 5.242 seconds to DOMContentLoaded while still showing `Loading account data…`; five seconds later the page showed `Unauthorized`. No HTTP redirect, console error, or hydration warning was observed in that limited run. Authenticated JuST 2026 timings, Chrome Performance traces, response sizes, and three-run medians therefore remain unmeasured and are not represented as facts below.

The current working tree also fails `next build` during static generation because an existing uncommitted `ThemeProvider` change calls `useSearchParams` above many routes without the required Suspense coverage. Compilation and TypeScript validation inside the build complete, but static generation fails for 16 routes. This is a P0 deployment risk for the working tree, not evidence about the currently deployed production revision.

Top causes:

1. Full-document navigation for workspace shell, lifecycle, and Signals tabs.
2. Duplicate heavy intelligence aggregation on In-event Overview.
3. Repeated Supabase/account/user/event authorization per parallel API, including duplication inside `requireAccountAdmin`.
4. Client-only context bootstrapping plus broad loading boundaries that discard usable shell/content.
5. Broad endpoints and refresh scopes: Events Home has `2N` live-event fan-out, while agenda/archive mutations refresh all Setup slices.

Highest-value quick win: replace internal workspace anchors with Next `Link` (or router actions where a button is semantically correct), retaining the canonical URLs and adding regression coverage that proves navigation is client-side. This removes the full-document reload without changing data contracts or authorization.

## 2. Environment and methodology

### Environments

| Item | Production | Local repository |
|---|---|---|
| URL | `voice.signalthread.ai/app?account=shared-hope` | No runtime server started because production build failed |
| Account | `shared-hope` | Code inspection only |
| Event | JuST 2026 requested; inaccessible without authentication | No database mutation or fixture creation |
| Authentication | Unauthenticated | No credentials loaded or exposed |
| Browser | Codex in-app browser; no connected external Chrome session | Not applicable |
| Cache | Browser state as opened; API returned 401 | `.next` bundle output from the attempted build |
| Cold/warm | One cold-ish navigation only; warm medians unavailable | Static analysis |
| Deployment ID | Not visible | Commit above; dirty working tree recorded below |

The production browser was used first. It could reach the host, but the shell could not resolve the hostname in its sandbox. Browser performance globals were not available in the browser evaluation sandbox, so Navigation Timing, Paint Timing, Resource Timing, and Web Vitals could not be extracted. The browser session was not signed in and no production mutations were attempted.

The local audit used repository search, direct route/component/service inspection, existing test contracts, an attempted production build, and raw emitted-chunk sizes. Development compile time was not treated as product runtime.

The working tree already contained unrelated changes before this audit, including Events agenda/listening-plan, theme, tour, and workspace changes plus `docs/context/`. Those changes were preserved. Findings describe the inspected working tree; the build failure is explicitly attributed to that dirty state. This audit adds only the two reports named in the brief.

### Measurement confidence legend

- **Measured**: directly observed during this audit.
- **Code-derived**: deterministic from current control flow or static output, but not timed against authenticated production.
- **Historical / unverified**: supplied in the brief and retained only as a comparison target.
- **Not measured**: blocked by authentication, browser tooling, or the failed production build.

## 3. Current measured baseline

### Direct production observation

| Scenario | Result | Confidence |
|---|---|---|
| `/app?account=shared-hope`, first navigation | Browser action reported 5.242 s to DOMContentLoaded; UI still displayed `Loading account data…` | Measured, unauthenticated only |
| Same load after another 5 s | `Error Loading Account` / `Unauthorized` | Measured |
| HTTP redirects | None observed; URL remained unchanged | Measured for this run |
| Console | No console warnings or errors captured | Measured for this run |
| TTFB/FCP/LCP/CLS/long tasks/bytes/API waterfall | Unavailable | Not measured |
| JuST 2026 route/tab timings | Authentication required | Not measured |

The 5.242-second result must not be used as an authenticated dashboard baseline: it ended in a 401 and combines network, document loading, hydration, and client account-context work.

### Historical benchmark status

The prior Intelligence design remains recognizable in code: a bounded attention page (25 default, 50 maximum), a parallel aggregate, `Server-Timing`, `x-response-bytes`, no-store semantics, and an `authorized` object that prevents the aggregation service from re-reading account/event scope. The historical route (1.42–1.64 s), aggregation (0.81–1.04 s), and usable UI (2.03–2.33 s) figures were not re-measured and must not be treated as current.

The “three initial dashboard reads” historical claim does not match every current view. Intelligence uses two initial reads (`analysis?scope=bootstrap` plus `/intelligence`). In-event Overview can use eight reads, listed below.

### Build and bundle baseline

`npm run build` completed help-doc generation, Prisma generation, Next compilation, lint/type validation, and partial chunk emission. Static generation then failed for 16 routes because the dirty `ThemeProvider.tsx` uses `useSearchParams` without sufficient Suspense coverage. A production server could not be started.

Raw, uncompressed, partial-build route chunks:

| Route chunk | Raw bytes |
|---|---:|
| Event dashboard | 328,888 |
| Event Setup | 120,700 |
| Events Home | 63,521 |
| Event survey edit | 37,672 |
| New event survey | 27,101 |
| New event | 26,443 |
| App layout | 15,763 |

Largest shared chunks were 189,937, 172,163, 140,946, 126,657, and 111,776 raw bytes. These are not compressed transfer sizes and are not a successful production-build manifest.

## 4. Redirect and navigation map

### Authentication entry

```text
GET /auth/callback?code=…&next=/app/…
  302 -> /api/auth/link-user?next=/app/…
    - exchanges/verifies Supabase session in callback
    - links canonical Prisma user/account in link-user
  302 -> /app/…?account=<canonical-account-slug>
```

This is the longest confirmed HTTP redirect design: two redirects and three documents/route-handler requests. Both steps currently enforce a real security/identity concern. It is not classified as avoidable without a separate auth design review.

Root `/` uses a client `router.push('/login')` after first paint. On `/login`, an existing session triggers `POST /api/auth/link-user`, then another client `router.push` to `/app`. This is an avoidable first-paint redirect for users entering at `/`, but it is outside the normal authenticated Events deep-link path.

### Voice Events navigation map

| From | To / URL behavior | Mechanism | Result |
|---|---|---|---|
| Events Home | Event Setup | `router.push` buttons | Client navigation |
| Workspace rail | Events / Setup / Signals / Settings | plain `<a href>` | Full document request and runtime reset |
| Setup header | Signals | plain `<a href>` | Full document request |
| Signals header | Setup | plain `<a href>` | Full document request |
| Lifecycle selector | pre/in/post query URL | plain `<a href>` | Full document request; lifecycle state reset |
| Signals tabs | overview/intelligence/sessions/speakers/actions query URL | plain `<a href>` | Full document request; all dashboard state reset |
| Session/Speaker contextual links | Setup or counterpart entity | plain `<a href>` | Full document request |
| Setup tabs | `?tab=…` | `router.push` | Client navigation; initial slice key stays stable |
| Dashboard filters | query replacement | `router.replace` | Client route update; effects refetch relevant data |
| Invalid survey/structure filter | canonicalized query | effect-driven `router.replace` after data resolves | Post-paint navigation |
| Events account opening SMB-only event edit/new survey | dashboard path | effect-driven `router.replace` after account context | Hydration-dependent redirect |
| Browser back/forward | Depends on prior mechanism | full anchors create document history entries; router query changes use App Router | Persistent shell/state not guaranteed |
| Deep-link refresh | Same URL | full document, then client effects | Account and event context rebuilt |

No `router.refresh()` was found in the audited Events workspace. `Dashboard2` still contains `window.location.assign` for one query update, which explicitly forces a document navigation. Events Home and admin error retries use `window.location.reload()`.

### Redirect risks

- Product navigation is dominated by reloads, not a server redirect loop.
- Invalid dashboard filters are corrected only after surveys/structure load, producing an extra client navigation after first paint.
- Events/SMB route correction on event edit/create happens after client account context resolves.
- Missing authentication on production `/app` showed an inline unauthorized error rather than a login redirect; this avoids a loop but produces a long dead-end loading experience.
- There is no Events middleware rewrite or account-slug canonicalization chain in the inspected workspace path.

## 5. Route-by-route performance table

Authenticated medians and slowest-of-three values could not be captured. The table records exact code-path request counts and blocking behavior so the future baseline run has an explicit checklist.

| Surface | Initial APIs / navigation behavior | Blocking and likely cost | Current timing |
|---|---|---|---|
| Account entry `/app` | 1 broad `/api/app/account` | Full-page 50vh spinner; DB cost approximately `10 + 2N` for N live events | Unauthenticated failure only |
| Event Setup | sequential account context, then 4 parallel slices | 5 APIs; whole shell waits; up to 8 Supabase `getUser` calls | Not measured |
| Setup agenda import | Agenda workspace reads its own agenda model; parent can also refresh all slices | Import library server-side; broad mutation refresh | Not measured |
| Setup speaker import | Same agenda/import route family | Draft/review state client-side plus API | Not measured |
| Survey setup | Separate client page and client account correction | Route chunk 27,101 raw for new survey | Not measured |
| Deployment setup | Included in Setup route | static `qrcode.react`; JSZip lazy only on download | Not measured |
| Pre-event Overview | account context + `/analysis` readiness path | readiness service; entire dashboard shell initially loading | Not measured |
| In-event Overview | account context, analysis, timeline, voice-surveys, structure, second analysis, intelligence, signals | Up to 8 reads; duplicate intelligence aggregate | Predicted slowest; not timed |
| Post-event Overview | account context + analysis closing-brief path + timeline | closing brief is canonical early return | Not measured |
| Intelligence | `analysis?scope=bootstrap` + `/intelligence` in parallel | 2 APIs; bounded evidence list; best current Signals path | Historical only |
| Sessions | bootstrap + `/sessions/intelligence` | 2 APIs; unpaginated session payload/render | Not measured |
| Speakers | bootstrap + `/speakers/intelligence` | 2 APIs; unpaginated speaker payload/render | Not measured |
| Actions | bootstrap + `/actions` | 2 APIs; component owns mutation/refetch state | Not measured |
| Setup ↔ Signals | plain anchor | Full document, chunk/context/API reload | Not measured |
| Lifecycle switch | plain anchor; reset effect clears state | Full document then new analysis lifecycle service | Not measured |
| Back/forward/deep refresh | document/cache dependent | runtime cache often absent after anchor navigation | Not measured |

## 6. Network/API waterfall findings

### In-event Overview waterfall

```text
document + shared/route JavaScript
  ├─ /api/app/account?scope=context
  ├─ /api/app/events/:id/analysis
  └─ /api/app/events/:id/timeline
       after analysis establishes EVENTS + IN_EVENT:
       ├─ /api/app/events/:id/voice-surveys
       └─ /api/app/events/:id/structure
            after both selector options settle:
            ├─ /api/app/events/:id/analysis              (second, scoped)
            ├─ /api/app/events/:id/intelligence          (heavy aggregate again)
            └─ /api/app/events/:id/signals
```

The first `/analysis` already runs `getEventIntelligenceSummary` for Events In-event. The later `/intelligence` runs the same aggregation again with the same account/event/filter scope. This is the largest duplicate server/API work found.

### Intelligence, Sessions, Speakers, Actions

Each non-overview tab starts a lightweight `/analysis?scope=bootstrap` request. The active child starts exactly one tab-specific API in parallel. This preserves event/lifecycle identity without loading the legacy/full dashboard metrics and is a meaningful existing optimization. Full-document tab anchors nevertheless cause shared JavaScript and all client state to reload before those two requests.

### Setup waterfall

```text
/api/app/account?scope=context
  then Promise.all:
  ├─ /api/app/events/:id
  ├─ /api/app/events/:id/voice-surveys
  ├─ /api/app/events/:id/structure
  └─ /api/app/events/:id/agenda?summary=1
```

Account context is a strict sequential gate even though event APIs independently authorize and return enough product/event identity to establish an Events shell. All requests use `no-store` or default uncached client semantics.

### Events Home waterfall

One HTTP response hides a broad DB waterfall: membership, full account graph, global response/sentiment aggregates, five parallel event metrics queries, then two parallel queries per live event. A single endpoint therefore has scale-dependent latency even though the browser sees one request.

### Polling and retries

- In-event Overview polling is guarded and runs every 90 seconds only after both selector lists load. A tick launches analysis, signals, and intelligence together. It preserves stale content on refresh, which is good perceived-performance behavior, but repeats the duplicate aggregate.
- Account context has a 10-second timeout, one retry only for network/5xx failures, pending-request deduplication, and a 60-second resolved cache.
- A full-document anchor navigation erases both account-context maps, defeating these protections.
- Tab-change effects abort prior dashboard requests. No unstable retry loop was found.

## 7. Account, authentication, and event-context findings

`requireAccountMembership` performs one Supabase `auth.getUser`, one Account lookup, and one User lookup. `requireEventsEventAccess` adds an account-scoped Event lookup. This is the correct tenant boundary, but separate APIs repeat it independently.

`requireAccountAdmin` is internally duplicative for non-superadmins:

1. `getUser`
2. User lookup
3. calls `requireAccountMembership`
4. second `getUser`
5. Account lookup
6. second User lookup

Thus every normal-admin GET using this guard performs two remote identity validations and three Prisma identity/account reads before route-specific event scoping. On Setup, voice-surveys, structure, and agenda use this path in parallel. Combined with the event detail guard and the preceding account-context API, the initial Setup path can perform eight Supabase `getUser` calls and at least 15 account/user/event authorization reads before domain data queries.

The browser-side context loader correctly deduplicates concurrent component callers and caches successful context for 60 seconds. `ThemeProvider`, `ProductTour`, `SettingsMenu`, Setup, and Overview can share it while the same JavaScript realm survives. The full-anchor navigation architecture turns this into a per-document cache instead of a workspace cache.

Recommendation: create a canonical request-scoped identity primitive (for example a React/Next `cache()`-backed server helper where supported, or pass an already-resolved actor into membership/admin policy functions), then layer membership, account-admin policy, and event scope without repeating `getUser` or User reads. Do not cache authorization across requests or weaken event/account checks.

## 8. Database/query findings

### Query-count evidence

| Path | Code-derived query shape | Finding |
|---|---|---|
| Account context | membership Account + User, then branding Account | 3 Prisma reads + 1 Supabase call |
| Event access | membership Account + User, then Event | 3 Prisma reads + 1 Supabase call per API |
| Account admin, normal user | User, then membership Account + User | 3 Prisma reads + 2 Supabase calls before domain scope |
| Events Home | membership 2 + account graph 1 + response count 1 + sentiment aggregate 1 + base metrics 5 + `2N` live enrichment | `10 + 2N` Prisma operations, usual slug path |
| Intelligence aggregate | response count, answer count, attention query, intelligence rows, 7 related reads, optional structured answers | approximately 12–13 parallelized reads plus auth/filter validation |
| Sessions intelligence service | agenda scope, sessions with assignments, survey targets/counts, intelligence, issues | 5–6 service reads; last two parallel |
| Speakers intelligence service | agenda scope, speakers/assignments, targets/counts, intelligence | 4 service reads, sequential |

The account endpoint’s `include` loads every active location, every event, and every event question, then serializes question data even though Events Home primarily needs event cards and metrics. No pagination bounds the event list.

Session and speaker intelligence avoid per-row N+1 loops: assignments and counts are included and intelligence is loaded with `IN` predicates. However, the complete 86-session and 121-speaker sets are returned at once. This is acceptable at the current size but has no contract-level upper bound.

No read-time `create`, `update`, `upsert`, or delete was found in the critical account, analysis, timeline, intelligence, session-intelligence, speaker-intelligence, structure, agenda-summary, or voice-survey GET paths. Ordinary audited GETs remain read-only. The implementation phase must retain a write assertion in route/service tests.

No index recommendation is made without an `EXPLAIN (ANALYZE, BUFFERS)` trace. Likely candidates such as `(eventId,status,completedAt)` or intelligence filter composites must be validated against a representative local copy before schema work; authorization lookups are already exact-key or account-scoped.

## 9. React/rendering findings

- There is no nested `app/app/events/[eventId]/layout.tsx`. Setup and Signals instantiate `EventWorkspaceShell` separately, so the shell cannot persist across route boundaries.
- Setup and Dashboard are giant client pages. Dashboard statically imports Overview, Intelligence, Sessions, Speakers, Actions, Pre-event, and Post-event views into a 328,888-byte raw route chunk.
- Dashboard’s reset effect clears analysis, timeline, survey/structure options, signals, and intelligence whenever event, account, or lifecycle changes. Lifecycle is a URL display mode, yet it empties the workspace.
- Signals tab changes abort all dashboard-owned request controllers. This is correct cleanup, but full anchors already remount the entire route.
- Setup waits on account context and all four initial slices before leaving the page-level loading shell. A slow optional slice prevents useful event identity/navigation from becoming usable.
- Session/speaker/agenda filtering is memoized, which avoids repeated sorting on unrelated renders.
- Agenda renders every filtered session and speaker. Sessions/Speakers Intelligence render every visible row. No pagination or virtualization exists for the known 86/121 row scale.
- State is copied into several independent client loading systems: shell loading, analysis loading, intelligence loading, signals loading, selector loading, and child-tab loading. This produces multiple visible loading phases and potential zero/empty flashes.
- Filter invalidation performs `router.replace` after option lists resolve, causing a second render/navigation rather than validating the URL before first content.

A broad rewrite is not yet justified. First preserve the runtime with client links and persistent layout, then profile render commits at 86/121 rows. Introduce pagination or virtualization only if the profiler shows material scripting/render cost or the payload budget is exceeded.

## 10. Bundle findings

- Dashboard is the largest inspected app-route chunk at 328,888 raw bytes and statically imports all lifecycle/tab surfaces.
- Setup is 120,700 raw bytes and statically imports `EventDeploymentWorkspace`, which statically imports `qrcode.react`, even when Deployment is not the selected setup tab.
- `JSZip` is correctly lazy-loaded only inside the deployment download handler.
- Agenda XLSX parsing is server-side; no eager client XLSX/JSZip import was found in the ordinary workspace entry.
- Previously lazy import/signage packaging behavior therefore remains partially intact: ZIP is lazy, QR is eager, spreadsheet parsing is server-side.
- Route code uses targeted icon imports in inspected components; no evidence of an entire icon package imported as one namespace was found.
- A successful production bundle analyzer report was not possible because static generation failed. Shared-chunk ownership and compressed transfer size remain unmeasured.

## 11. Loading and perceived-performance findings

- Events Home shows a page-centered spinner for the entire client account fetch, then can end in a separate error page.
- Workspace navigation chrome is reconstructed on every plain-anchor transition.
- Setup replaces all content with a `Loading event workspace…` state until account context and four slices complete.
- Dashboard’s lifecycle reset intentionally sets `loading=true` and removes previously valid data.
- In-event Overview first renders base analysis, then waits for selector options and launches a second data wave. Counts/content can move through multiple states.
- Background 90-second refresh correctly preserves existing Signals/Intelligence data and does not blank the page; this behavior should be retained.
- There are no route-level `loading.tsx` files under the Events tree, so loading behavior is embedded in giant client pages rather than narrow Suspense boundaries.
- Full documents reset scroll and focus by default. The dashboard only recenters the active mobile tab after loading; it does not preserve workspace content/scroll across the reload.

## 12. Mutation/refresh findings

- No `router.refresh()` was found in the Events workspace.
- Setup structure create/update refreshes structure and listening-plan slices, which is appropriately narrow.
- Structure archive refreshes all four Setup slices.
- Settings save refreshes only event data.
- Agenda changes call the parent’s `refreshWorkspaceData(ALL_WORKSPACE_SLICES)` while `EventAgendaWorkspace` also owns/refetches agenda state. A row-level agenda change can therefore trigger a local agenda refresh plus event, surveys, structure, and listening-plan reads.
- Events Home mutations update through local handlers/client reload functions rather than a universal App Router refresh, but its Retry uses a full `window.location.reload`.
- Dashboard action mutation behavior is child-owned; ordinary tab navigation does not need a mutation refresh but currently reloads due anchors.
- Lifecycle preview is read-only query state; it should not invalidate event setup or persisted lifecycle data.

## 13. Prioritized P0–P3 issue list

### Redirect/navigation architecture

#### P1 — Workspace links force full-document navigation

- **Affected:** Events rail, Setup/Signals switch, lifecycle selector, Signals tabs, contextual session/speaker links.
- **Evidence:** ordinary `<a href>` in `components/app/events/EventWorkspaceShell.tsx` and `app/app/events/[eventId]/dashboard/page.tsx`.
- **Root cause:** shared app navigation bypasses Next client navigation.
- **Impact:** route chunks, React tree, account cache, state, scroll, and all data are rebuilt.
- **Correction:** Next `Link` with prefetch policy tuned from measurements; router actions only for button semantics.
- **Benefit:** removes avoidable document loads; likely the largest perceived improvement.
- **Risk:** low; ensure query strings and lifecycle semantics remain canonical.
- **Tests:** link contract, history/back-forward, no document request in Playwright.

#### P2 — Post-paint query canonicalization

- **Affected:** invalid survey/structure filters; Events/SMB edit/create route correction.
- **Evidence:** effect-driven `router.replace` after context/options load.
- **Root cause:** route eligibility/filters are validated only in client effects.
- **Correction:** validate in route/server boundary or avoid rendering incompatible page after canonical context.
- **Benefit:** removes a second navigation and false state.
- **Risk:** medium because product-mode authorization must remain canonical.

### Authentication/account/event context

#### P1 — Normal admin authorization repeats identity work inside one request

- **Affected:** Setup voice-surveys, structure, agenda, settings and other admin routes.
- **Evidence:** `requireAccountAdmin` calls `getUser`/User, then `requireAccountMembership` repeats both.
- **Correction:** resolve actor once, pass to membership/admin policy, preserve all tenant checks.
- **Expected benefit:** one fewer Supabase network call and User query per admin API.
- **Risk:** medium/security-sensitive.
- **Tests:** member/admin/superadmin/cross-account/inactive-user matrix plus call counts.

#### P1 — Context cache is discarded by full navigations

- **Affected:** all workspace route transitions.
- **Evidence:** module-level cache is sound but scoped to the document realm.
- **Correction:** client navigation plus a shared event layout/provider seeded from authoritative server context.
- **Expected benefit:** account context becomes a true workspace-level dependency.

### Server/API

#### P1 — In-event Overview computes intelligence twice

- **Affected:** Signals Overview initial load and every 90-second refresh.
- **Evidence:** Events `/analysis` and `/intelligence` both call `getEventIntelligenceSummary` for the same scope.
- **Correction:** make bootstrap/identity separate from a single canonical Overview aggregate; derive the Overview header from `/intelligence` or return a narrowed shared payload once.
- **Expected benefit:** removes one of the slowest 12–13-query services per load/tick.
- **Risk:** medium; response contracts and loading order change.
- **Tests:** one aggregation invocation per navigation/refresh, same metrics, no writes.

#### P2 — Setup account context is a sequential gate

- **Affected:** Event Setup direct entry.
- **Evidence:** `await loadAccountContext` before `Promise.all` workspace slices.
- **Correction:** seed canonical context server-side or parallelize while allowing event identity/shell to render independently.
- **Expected benefit:** removes one network round trip from the critical path.

#### P2 — Events Home contract is too broad

- **Affected:** `/app`.
- **Evidence:** all event questions and a `2N` live-event enrichment are loaded for home cards.
- **Correction:** field-select a Home DTO; batch live satisfaction/top-issue reads across all event IDs.
- **Expected benefit:** smaller payload and constant query count.
- **Risk:** medium; Home metrics truthfulness must be retained.

### Database

#### P2 — Live-event Home enrichment is a server-side N+1

- **Affected:** Events Home accounts with multiple live events.
- **Evidence:** `Promise.all(liveEvents.map())`, two queries per event.
- **Correction:** group satisfaction across all live IDs and fetch bounded open issues in one query, rank per event in memory or by a validated SQL query.
- **Expected benefit:** query count changes from `5 + 2N` metrics reads to approximately 7.
- **Risk:** medium; rankings must remain identical.

#### P3 — Intelligence/session/speaker lists are unbounded

- **Affected:** large events.
- **Evidence:** complete findMany + complete client render.
- **Correction:** measure first; add pagination/virtualization together only if budget is exceeded.
- **Risk:** medium UX complexity; defer until profiling.

### Client rendering

#### P1 — No persistent event layout and monolithic dashboard

- **Affected:** Setup/Signals, lifecycle and tab transitions.
- **Evidence:** no nested Events layout; dashboard route chunk 328,888 raw.
- **Correction:** first add a persistent event layout; then dynamically split mutually exclusive tab/lifecycle bodies.
- **Expected benefit:** stable chrome, smaller initial tab JavaScript, preserved state.
- **Risk:** medium; do incrementally.

#### P2 — Lifecycle change clears the entire dashboard

- **Affected:** pre/in/post preview.
- **Evidence:** reset effect clears all data and sets loading.
- **Correction:** keep shell and last valid view, show route-local pending state, cancel only obsolete data.
- **Expected benefit:** removes blanking and focus/scroll loss.

### Bundles

#### P2 — Hidden dashboard surfaces are statically included

- **Affected:** every Signals route.
- **Evidence:** static imports of every tab/lifecycle component; 328,888-byte route chunk.
- **Correction:** dynamic imports at tab/lifecycle boundaries after client navigation is fixed.
- **Expected benefit:** smaller initial parse/evaluation cost.
- **Risk:** low/medium; provide truthful local skeletons.

#### P3 — QR dependency is eager on all Setup tabs

- **Affected:** Event Setup.
- **Evidence:** Setup statically imports deployment, which imports `qrcode.react`.
- **Correction:** dynamically load deployment/signage UI only when selected.

### Loading UX

#### P2 — Broad client loading boundaries hide usable chrome/data

- **Affected:** Events Home, Setup, lifecycle switches.
- **Correction:** persistent shell plus slice-level Suspense/status, retain stale truthful data during refresh.

### Mutation refresh behavior

#### P2 — Agenda/archive changes over-refresh Setup

- **Affected:** agenda edits/import confirmation, structure archive.
- **Evidence:** parent `ALL_WORKSPACE_SLICES` refresh plus child agenda refresh.
- **Correction:** return changed read models from mutation or invalidate only agenda/listening-plan/readiness counts.
- **Expected benefit:** fewer authorization and domain reads after common writes.

### Deployment safety

#### P0 — Current dirty working tree cannot produce a production build

- **Affected:** 16 statically generated routes including `/app` and `/`.
- **Evidence:** `next build` errors that `useSearchParams()` must be wrapped in Suspense; source is existing uncommitted `ThemeProvider.tsx`.
- **Correction:** resolve search-param consumption at an appropriate Suspense/client boundary without returning to DOM mutation loops.
- **Risk:** high if deployed as-is; ownership belongs to the pre-existing theme change.
- **Tests:** successful clean production build plus Events/SMB theme and hydration tests.

## 14. Quick wins

1. Replace workspace, lifecycle, Signals tab, and contextual internal anchors with Next `Link`; preserve exact URLs.
2. Remove the duplicate Overview intelligence call by making `/analysis` bootstrap-only when `/intelligence` is also requested.
3. Refactor `requireAccountAdmin` to reuse one resolved actor/membership result.
4. Narrow agenda/archive mutation refreshes to the affected slices.
5. Lazy-load Deployment/QR and mutually exclusive dashboard tab bodies.

Each change needs before/after request counts and browser traces; do not combine them into one unreviewable rewrite.

## 15. Structural fixes

- Add a nested event workspace layout that owns canonical account/event identity and navigation chrome.
- Keep Setup and Signals as routes but place tab/lifecycle content below the persistent layout.
- Separate event bootstrap identity from heavy analytics and share the single canonical intelligence response with Overview.
- Introduce a request-scoped auth context primitive reused by membership/admin/event checks.
- Replace Events Home’s account graph with a purpose-built DTO and batch live metrics.
- Add narrow data invalidation contracts per mutation.

## 16. Larger architecture recommendations

Only after the quick wins are measured:

- Consider nested routes for `overview`, `intelligence`, `sessions`, `speakers`, and `actions` if route-specific bundles and Suspense boundaries materially improve budgets. Separate routes are useful only with a persistent parent layout.
- Consider server-seeding account/event bootstrap data into the client layout to eliminate client-empty context, while keeping client refresh for mutations.
- Add pagination/virtualization for session/speaker lists only when React profiling or payload measurements exceed the budgets below.
- Consider an internal read-model/BFF endpoint for In-event Overview if sharing the aggregation through normal request memoization is impossible across separate HTTP requests.

Do not add broad cross-request authorization caching, stale tenant decisions, DOM observers, repeated theme class mutations, or GET-time reconciliation writes.

## 17. Proposed performance budgets

These are target budgets, not achieved results. All timings should be measured in authenticated production at p50 and p95 on a representative laptop/network, with three-run medians during implementation.

| Scenario | Target usable UI | Network/API budget | UX invariants |
|---|---:|---|---|
| Account dashboard cold entry | p50 ≤ 1.5 s; p95 ≤ 2.5 s | 1 Home API; constant DB query count | no full-page spinner after shell |
| Event workspace cold entry | p50 ≤ 1.8 s; p95 ≤ 3.0 s | context/bootstrap + visible-slice reads only | shell visible immediately |
| Warm same-event tab | p50 ≤ 250 ms; p95 ≤ 500 ms | no document request; ≤ 2 APIs | preserve shell/scroll/focus |
| Cold same-event tab | p50 ≤ 1.2 s; p95 ≤ 2.0 s | bootstrap + one tab API | local skeleton only |
| Lifecycle switch | p50 ≤ 500 ms cached; p95 ≤ 1.5 s cold | no document request; one lifecycle read | no shell blanking |
| Intelligence | p50 ≤ 1.5 s; p95 ≤ 2.5 s | one heavy aggregate + bootstrap; aggregation p50 ≤ 1.0 s | retain old UI during refresh |
| Sessions | p50 ≤ 1.0 s; p95 ≤ 1.8 s | bootstrap + one bounded API | 86 rows responsive |
| Speakers | p50 ≤ 1.0 s; p95 ≤ 1.8 s | bootstrap + one bounded API | 121 rows responsive |
| Actions | p50 ≤ 1.0 s; p95 ≤ 1.8 s | bootstrap + one API | mutation state preserved |
| Common row mutation | acknowledgement p50 ≤ 500 ms; settled ≤ 1.2 s | mutation + ≤ 1 narrow read | no workspace reload |

Global budgets: no avoidable redirects, no full-document request for workspace navigation, one account/event context resolution per HTTP request, no duplicate same-data APIs, zero page-read writes, stable navigation chrome, no false empty-state flash, and no entire-workspace invalidation for a row mutation.

## 18. Recommended implementation sequence

1. Restore build safety for the pre-existing ThemeProvider change; establish a runnable production baseline.
2. Convert internal anchors and add navigation request-count tests.
3. Eliminate duplicate Overview aggregation and capture Server-Timing/bytes before and after.
4. Deduplicate request-local auth/admin context.
5. Add the persistent event layout and narrow loading boundaries.
6. Narrow Setup mutation invalidation.
7. Batch/narrow Events Home.
8. Split bundles and profile large lists; paginate/virtualize only if needed.

The companion implementation plan expands this into separately verifiable phases.

## 19. Verification plan

With an authenticated Chrome session and a successful production build:

1. Record environment, deployment ID, account, JuST event ID/name, browser version, network profile, and cache state.
2. Run every route/navigation in the brief three times cold and three times warm; report median and slowest.
3. Save Chrome Network HAR and Performance trace for Events Home, Setup, In-event Overview, Intelligence, Sessions, Speakers, Actions, lifecycle switch, back/forward, and deep refresh.
4. Confirm workspace tab/lifecycle clicks issue an RSC/client navigation, never a document request.
5. Capture TTFB, FCP, LCP, CLS, usable time, loading duration, long tasks, request/API counts, transfer and JS bytes.
6. Record `Server-Timing` and `x-response-bytes` from Intelligence and add equivalent route timing only where it is retained intentionally.
7. Use safe local Prisma query event logging or a test Prisma adapter to count route queries. Run `EXPLAIN (ANALYZE, BUFFERS)` only against non-production representative data.
8. React-profile 86 sessions and 121 speakers for render commits, scripting time, filtering, bulk selection, drawer open/close, and evidence loading.
9. Verify ordinary GETs perform zero writes and mutations submit once.
10. Verify account/event cross-tenant denials and canonical product-mode behavior after auth-context changes.
11. Re-run targeted Vitest suites, `npm run typecheck`, `npm run build`, and `git diff --check`.

## 20. Evidence and artifact index

| Evidence | Location / result |
|---|---|
| Production browser observation | In-app browser, `voice.signalthread.ai/app?account=shared-hope`; unauthorized, no saved trace |
| Navigation shell | `components/app/events/EventWorkspaceShell.tsx` |
| Signals tab/lifecycle fetch state | `app/app/events/[eventId]/dashboard/page.tsx` |
| Setup slice waterfall | `app/app/events/[eventId]/page.tsx` |
| Account context cache | `lib/account-context-client.ts` |
| Membership/admin/event authorization | `lib/auth/require-account-membership.ts`, `require-account-admin.ts`, `require-events-event-access.ts` |
| Events Home endpoint/metrics | `app/api/app/account/route.ts`, `lib/events-home-metrics.ts` |
| Intelligence routes/service | `app/api/app/events/[eventId]/analysis/route.ts`, `intelligence/route.ts`, `lib/event-intelligence/aggregation.ts` |
| Session/speaker services | `lib/event-session-intelligence.ts`, `lib/event-speaker-intelligence.ts` |
| Raw partial-build chunks | `.next/static/chunks`; not committed |
| Production build | Failed during static generation; compile and type validation passed |
| Browser traces/screenshots/HAR | Not created because authenticated production and local production runtime were unavailable |
| Production data changes | None |

### Verification command results

- Targeted Vitest run: 112 tests collected; 106 passed and 6 failed. Passing suites covered account-context deduplication/cache, account membership, Events Home metrics, the intelligence aggregate, the analysis route, the intelligence route, and the workspace shell. The failures are baseline source-contract drift outside this audit: three stale string assertions in `app/app/page.test.ts`, one stale string assertion in `app/app/events/[eventId]/dashboard/page.test.ts`, and two exact-`select` assertions in `lib/auth/require-events-event-access.test.ts` that omit fields now returned by the canonical event guard. This audit did not edit those tests or application files.
- `npm run typecheck`: passed.
- `npm run build`: failed during static generation for the ThemeProvider/Suspense issue documented above; compile and the build's type validation passed first.
- `git diff --check`: passed for tracked changes. The two new untracked reports were also checked explicitly with `git diff --no-index --check`.
- Browser: limited unauthenticated production observation only; no authenticated JuST event, Chrome trace, HAR, or local production runtime was available.
