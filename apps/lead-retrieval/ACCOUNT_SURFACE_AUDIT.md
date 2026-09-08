# Account Surface Audit — Direct Customer Home / Command Center

**Question:** What account-level home or Command Center experience exists in the *production* app for a Direct Customer? Source of truth: application code only (no prototype, no prior audit docs).

**Who the "Direct Customer" is in code:** not a distinct role. Roles are `platform_admin | organizer_admin | exhibitor_admin | exhibitor_viewer | viewer` (`lib/auth/session.ts`). A direct customer is an **`exhibitor_admin` whose event access resolves to the "direct portfolio" tag** — `company_all_events` (`lib/access/event-access-mode.ts:46-49`, `isExhibitorDirectPortfolioEventAccessResolution`). That is the concrete production signal for "a company running its own events."

---

## 1. Verdict

### ▶ `/app/events` is the de facto account page.

There **is** a formal account-level *tier* — a dedicated sidebar "account" mode whose nav is exactly `[Manage → /app/events, Settings → /app/settings, Help]` (`lib/exhibitor/exhibitor-app-nav.ts` `ACCOUNT_NAV`). But there is **no distinct account home or Command Center page**. The account tier's home is the events **"Manage"** list at `/app/events` (`app/app/events/page.tsx`, `ExhibitorEventsIndexPage`), which is both the post-login landing for direct-portfolio users and the primary account-nav destination. `/app` and `/app/dashboard` are pure redirects, not pages. So the "account home" today *is* an events list wearing two hats.

Evidence chain (all production):
- Sign-in → `getRoleHomePath("exhibitor_admin")` returns `EXHIBITOR_WEB_ENTRY_RESOLVER_PATH` = `/api/auth/exhibitor-web-entry` (`lib/auth/session.ts:39-45`).
- That resolver calls `getExhibitorWebEntryPathAfterSignIn` → `resolveExhibitorWebAdminLandingPath` → if resolution is `company_all_events`, returns `EXHIBITOR_EVENTS_ENTRY_HREF` = **`/app/events`** (`lib/server/exhibitor-web-entry-redirect.ts:20-37`).

---

## 2. Current route map

**Login destination (by role/access):**
- `exhibitor_admin` + web-admin + **direct portfolio** (`company_all_events`) → **`/app/events`** (the account "Manage" list).
- `exhibitor_admin` + web-admin but **event-level/assigned** (`company_assigned_only` / `legacy_event_scoped`) → `/exhibitor/dashboard` (event-scoped).
- Exhibitor with only an **app seat** (no web admin) → `/exhibitor/dashboard`; `exhibitor_viewer` → `/exhibitor/leads` (`lib/server/exhibitor-web-entry-redirect.ts:44-72`).
- `platform_admin` → `/admin`; `organizer_admin` → `/app/organizer` (`lib/auth/session.ts:39-45`).
- `/app` and `/app/dashboard` and `/app/settings` each **redirect by role**; `/app` root shows a read-only fallback only for non-exhibitor app users (`app/app/page.tsx`, `app/(app)/dashboard/page.tsx`).

**Account-level routes (sidebar mode = "account"):**
- `/app/events` — "Manage": flat list of the company's accessible events. `app/app/events/page.tsx`.
- `/app/events/new` — self-serve Create Event (gated by `exhibitorAdminMayUseAppEventManagementRoutes`). `EXHIBITOR_EVENTS_CREATE_HREF`.
- `/app/settings` — "Account": company team management + settings snapshot; redirects event-level tenants to `/exhibitor/settings`. `app/app/settings/page.tsx` (`CompanyAccountSettingsPage`).
- `/help` — Help.

**Events-list route:** `/app/events` — same page as the account home (no separate "all events" surface exists).

**Single-event routes (sidebar mode = "event"):**
- `/app/events/{id}` — manage one event; `/app/events/{id}/settings` — event settings.
- Event-scoped operating app under `/exhibitor/*`: `/exhibitor/dashboard?eventId=…` (event dashboard), `/exhibitor/leads`, `/exhibitor/campaigns`, `/exhibitor/signals`, `/exhibitor/documents`, `/exhibitor/email-templates`, `/exhibitor/users`, `/exhibitor/integrations`, (+ `/exhibitor/workflows` when flag on) — the full event-mode nav (`lib/exhibitor/exhibitor-app-nav.ts` `buildEventModeNavForSettingsHref`).

**Navigation relationships:**
- The shell (`AppShell`, rendered by `app/app/layout.tsx`) picks **account vs event** sidebar mode (`resolveExhibitorSidebarMode`): `/app/events`, `/app/events/new`, `/app/settings*` are **account** mode; everything else (`/app/events/{id}/…`, `/exhibitor/*`, `/campaigns/*`) is **event** mode with active-event chrome (`getExhibitorAppShellEventChrome`, `getCachedExhibitorDisplayEventName`).
- Account → event transition happens by opening an event from `/app/events` (→ `/app/events/{id}` or `/exhibitor/dashboard?eventId=`).

---

## 3. Existing account-level capabilities (real, working)

- **Accessible-events portfolio**, company-scoped: `getCachedExhibitorAccessibleEventResolution(userId)` → `{eventIds, resolution, companyId, role}` (via `resolveAccessibleEventIdsForUser`, `lib/server/company-event-access.ts`). `/app/events` hydrates `id, name, start_date, end_date, status, container_kind` (`app/app/events/page.tsx:58-61`).
- **Event lifecycle status is real data:** `events.status` ∈ `ACTIVE | UPCOMING | COMPLETED` (stored column; formatting `formatEventStatus`, date range `formatEventDateRange` in `lib/data/admin-events.ts:47-77`; subtitle `formatEventEntrySubtitle` in `components/app/no-active-event-entry.tsx:96`).
- **Create event** (self-serve, gated) → `/app/events/new`.
- **Account/company settings + team management:** `getCompanySettingsTeamPageData`, `getExhibitorSettingsSnapshot` at `/app/settings` (`lib/server/company-team-management.ts`, `lib/data/settings.ts`).
- **Company-wide roll-up counts already exist** (not yet shown on `/app/events`): `getExhibitorDashboardData()` → `totalLeads`, `hotLeads` (`priority_score ≥ 80`), `followUps` (`follow_up_date ≤ today`), `activeLicenseCount` (`lib/data/dashboard.ts`).
- **Empty/error states** already handled on the account list: empty → `NoActiveEventEntry mode="empty"`; query error → error card (`app/app/events/page.tsx:44-72`).

---

## 4. Gaps (vs a true account-level Command Center)

- **No lifecycle grouping.** `/app/events` is a single flat list titled "Manage"; it does not group by Live / Upcoming / Completed even though `events.status` supplies exactly those values.
- **No account roll-up on the landing.** The company-wide counts (`getExhibitorDashboardData`) exist but are **not rendered** on `/app/events`; the account home shows zero KPIs/attention items.
- **No account-level attention queue.** Nothing surfaces "needs attention across events" (hot/overdue-follow-up counts, pending invites, seat capacity) on the account surface.
- **No per-event card metrics for an exhibitor.** There is no exhibitor-scoped per-event count service (per-event metrics exist only in platform-admin land, `lib/data/admin-events.ts:getEventMetrics`).
- **Account home is a redirect, not a page.** `/app` / `/app/dashboard` redirect; the "home" identity is borrowed by the events list.
- **No account-level operational/intelligence destinations.** Leads, campaigns, intelligence are all event-mode only — correctly out of scope here, but it means the account tier is thin by design.

---

## 5. Recommended first build (one bounded page)

- **Route:** `/app/events` — extend the existing page in place (it is already the landing and the account-nav home; no new route, no redirect/web-entry changes).
- **Purpose:** turn the flat "Manage" list into a genuine account home: see the company's events grouped by lifecycle and enter any of them, with a small real account summary.
- **Sections:**
  1. **Header** — account/company name + gated "Create event" (existing `/app/events/new`).
  2. **Events portfolio grouped by lifecycle** — Live = `ACTIVE`, Upcoming = `UPCOMING`, Completed = `COMPLETED`; `continuous_capture` (null dates) as an "Ongoing" group. Each card: name, date range (`formatEventDateRange`), status badge (`formatEventStatus`), Open / Settings links. (This is the core.)
  3. **Account summary strip (optional, real data only):** Hot leads, Follow-ups due, Active licenses — from `getExhibitorDashboardData` (company-wide, deterministic). Display-first.
- **Existing data sources:** `getCachedExhibitorAccessibleEventResolution` + the existing `events` select (status/dates already fetched); `getExhibitorDashboardData` for the summary; `formatEventStatus` / `formatEventDateRange`.
- **Existing destinations:** Open → `/app/events/{id}` (or `/exhibitor/dashboard?eventId={id}`, preserving `eventId`); Settings → `/app/events/{id}/settings`; Create → `/app/events/new`; empty → `NoActiveEventEntry`.
- **Must be deferred:** per-event card metrics (no exhibitor per-event count service); any Setup/Live/Post or Real-Time/Coaching/Executive intelligence; device/capture health (no data model exists); account-wide activity feed; "uncontacted" as a first-class metric (no `contacted` field — only `status='new'` proxy). No schema changes are required for the bounded page.

---

## 6. Files likely affected (do not edit)

- **Page:** `app/app/events/page.tsx` (`ExhibitorEventsIndexPage`) — extend in place.
- **Nav label (optional):** `lib/exhibitor/exhibitor-app-nav.ts` (`ACCOUNT_NAV` "Manage" label) — only if renaming the account home.
- **Components:** presentational grouping + summary (new, small) reusing `components/app/no-active-event-entry.tsx`, `components/layout/page-header.tsx`, `components/layout/app-shell.tsx`.
- **Server/data (reuse, no change needed):** `lib/server/exhibitor-app-access.ts`, `lib/server/company-event-access.ts`, `lib/data/dashboard.ts`, `lib/data/admin-events.ts` (formatters), `lib/access/event-access-mode.ts`. Optional pure helper: `groupAccessibleEventsByLifecycle` (likely `lib/events/…`).
- **Tests:** extend/adjacent — `tests/exhibitor-event-menu-ia.test.ts`, `tests/exhibitor-sidebar-mode.test.ts`, `tests/exhibitor-app-access-web-entry.test.ts`, `tests/exhibitor-no-event-access.test.ts`, `tests/company-event-access.test.ts`, `tests/route-contracts.test.ts`; new focused test for lifecycle grouping + company scoping + empty/error rendering.

---

## Completion report — verdict & first build

- **Verdict:** `/app/events` is the **de facto account page**; a formal account **sidebar mode** exists (`ACCOUNT_NAV`) but there is **no distinct Command Center page**.
- **Landing:** a direct-portfolio (`company_all_events`) `exhibitor_admin` with web-admin access lands on **`/app/events`** (`lib/server/exhibitor-web-entry-redirect.ts` via `/api/auth/exhibitor-web-entry`).
- **Account tier today = two working destinations:** `/app/events` (Manage list) and `/app/settings` (Account/team), plus `/app/events/new` and `/help`.
- **`/app` and `/app/dashboard` are redirects**, not pages — the events list carries the "home" role.
- **Single-event vs account:** single event is `/app/events/{id}` and the `/exhibitor/*` app (event sidebar mode + active-event chrome); account is `/app/events` + `/app/settings` (account mode).
- **Real data ready now:** company-scoped accessible events with `status` (ACTIVE/UPCOMING/COMPLETED) + dates; company-wide counts (`getExhibitorDashboardData`: hot ≥80, follow-ups due, active licenses); company team/settings.
- **Biggest gap:** no lifecycle grouping and no account roll-up/attention rendered on the landing, despite the data existing.
- **Smallest correct first build:** extend `/app/events` in place into a lifecycle-grouped events portfolio (Live/Upcoming/Completed) using already-loaded `events.status`, keeping existing Create/Open/Settings actions.
- **Optional bounded add:** a real account summary strip from `getExhibitorDashboardData` (display-first).
- **No schema changes required; defer** per-event stats, intelligence, device health, and activity feed. File created: `ACCOUNT_SURFACE_AUDIT.md` (only). No application code modified.
