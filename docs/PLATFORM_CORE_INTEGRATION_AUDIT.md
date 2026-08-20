# Platform Core Integration Audit

- **Product:** Planner OS (repo `planner-os`, branded **OrcaOS** in the UI shell)
- **Audit result:** **READY WITH CHANGES**
- **Central-auth difficulty:** **LOW**
- **Global-ID difficulty:** **MEDIUM**
- **RLS difficulty:** **LOW** (no RLS exists — nothing to redesign)
- **Estimated implementation effort for this repo:** ~2–3 engineer-weeks (dominated by `event_id`/`organization_id` reseed + storage key rewrite, not by auth)
- **Biggest risk:** Identity is joined to Supabase Auth **by email address**, not by `auth.users.id`. That is what makes central auth easy, but it also means tenant isolation rests entirely on application code with **zero database-level enforcement** (no RLS anywhere).

---

## Product

Planner OS — event planning/operations product covering event setup, timeline, budget, F&B, documents, speakers, sessions/matrix, room-set & seating, attendee directory, and marketing email.

- Repo: `github.com/akamyab12/planner-os`
- App root: [web/](web/) (Next.js app), schema at [prisma/schema.prisma](prisma/schema.prisma)
- Shared design system already consumed from `@signalthread/ui` ([packages/signalthread-ui/](packages/signalthread-ui/))

Note: the UI is branded "OrcaOS" ([web/app/(shell)/_components/shell-scaffold.tsx:221](web/app/(shell)/_components/shell-scaffold.tsx#L221)) while the repo/product is Planner OS. Naming should be reconciled before these audits are merged, so this repo is not confused with a separate Orca product.

---

## Executive Summary

This repository is unusually well-positioned for Platform Core, for one structural reason: **Supabase is used only for authentication.** There is no Supabase data access, no Supabase Storage, no Realtime, and no RLS. All application data flows through Prisma over a direct Postgres connection.

Consequences:

1. **Central auth is a small, contained change.** Only ~8 files touch Supabase. The product already treats the Supabase user as an *external* identity and resolves it to a local `User` row. Swapping the issuer changes the token source, not the data model.
2. **No RLS work is required.** There are zero `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY` statements in the repo. Authorization is 100% application-layer and funnels through two helpers. Central Platform Auth cannot conflict with an RLS model that does not exist.
3. **The identity bridge is email.** `resolveAppUserFromSupabaseIdentity` looks up `prisma.user.findUnique({ where: { email } })`. `supabaseUserId` is captured, logged, and returned — but **never persisted and never used as a key**. There is no `auth.users.id` foreign key anywhere in the schema. Adopting a Platform Core `user_id` is therefore additive, not a migration of existing FKs.
4. **The real work is global IDs, not auth.** 54 of 90 models carry `eventId`; 11 carry `orgId`; 41 carry a user reference. All are locally generated UUIDs (`@default(uuid())`). Adopting canonical Platform Core IDs is best handled by **reseed, not migration** — which the brief already permits.
5. **Platform Core will not be in the hot path** if scoped correctly. Every request today resolves auth + org context via `ensureProvisionedUserAndContext`, which issues 3–5 Prisma queries against the *local* database. As long as Platform Core claims arrive in the session token and are cached locally, no product request needs to call Platform Core.

The genuine concerns are: no database-level tenant isolation, `User.orgId` being mutated as a side effect of request handling, and speaker-portal tokens signed with the Supabase service-role key.

---

## Current Architecture

| Concern | Implementation | Evidence |
|---|---|---|
| Framework | Next.js **16.1.6**, React **19.2.3**, App Router, TypeScript | [web/package.json](web/package.json) |
| Runtime | Node.js (`export const runtime = "nodejs"` on auth/storage routes); no Edge runtime | [web/app/auth/callback/route.ts:11](web/app/auth/callback/route.ts#L11) |
| Deployment | Vercel (`.vercel/` present). **No `vercel.json`, no cron jobs defined** | repo root |
| Supabase usage | **Auth only.** No data, storage, or realtime calls | see below |
| DB access | **Prisma 7.4.2 + `@prisma/adapter-pg`** — direct Postgres over `DATABASE_URL` | [web/src/server/db/prisma.ts](web/src/server/db/prisma.ts) |
| Connection pooling | `PrismaPg({ max: 1 })` — intentionally 1 connection per warm Vercel instance | [web/src/server/db/prisma.ts:70-77](web/src/server/db/prisma.ts#L70-L77) |
| ORM/query layer | Prisma Client, wrapped in a `$extends` query interceptor for observability | [web/src/server/db/prisma.ts:41-68](web/src/server/db/prisma.ts#L41-L68) |
| Client vs server | **All DB access is server-side.** Browser never touches Postgres or Supabase data | verified — no `supabase.from(` anywhere |
| API routes | **198** route handlers; **162** under `app/api/events/[eventId]/` | [web/app/api/](web/app/api/) |
| Background jobs | **None.** All work is synchronous in the request. One pull-based runner endpoint exists | see High-Volume Paths |
| Storage | **Cloudflare R2** via AWS S3 SDK — *not* Supabase Storage | [web/lib/r2.ts](web/lib/r2.ts) |
| Realtime | **Not used** | verified |
| AI | OpenAI (room-set layout planning, F&B menu parsing, copilot) | [web/lib/room-set/openai-model-config.ts](web/lib/room-set/openai-model-config.ts) |
| Email | SendGrid (marketing + speaker comms) | [web/src/server/email/sendgrid-provider.ts](web/src/server/email/sendgrid-provider.ts) |
| Security headers | HSTS/X-Frame-Options/nosniff set globally; CSP deliberately deferred | [web/next.config.ts](web/next.config.ts) |

**Environment structure** ([.env.local](.env.local)): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`, `R2_*`. The Postgres instance is the Supabase project's database, but is reached **directly via Prisma**, bypassing PostgREST and therefore bypassing RLS entirely.

---

## Authentication

### How it works today

| Step | Implementation |
|---|---|
| Auth init (browser) | `createBrowserClient` from `@supabase/ssr` — [web/src/lib/supabase/browser.ts](web/src/lib/supabase/browser.ts) |
| Auth init (server) | `createServerClient` + Next cookie store — [web/src/lib/supabase/server.ts](web/src/lib/supabase/server.ts) |
| Auth init (admin) | Service-role client — [web/src/lib/supabase/admin.ts](web/src/lib/supabase/admin.ts) |
| Login | **Email OTP only** (6-digit code). `signInWithOtp({ shouldCreateUser: true })` → `verifyOtp({ type: "email" })` — [web/app/(public)/login/page.tsx](web/app/(public)/login/page.tsx) |
| Signup | Implicit — `shouldCreateUser: true` on the login form. No separate signup route |
| Invite | `supabaseAdmin.auth.admin.inviteUserByEmail()` + local `User`/`Membership`/`EventMember` upsert — [web/app/api/admin/invite-user/route.ts:128](web/app/api/admin/invite-user/route.ts#L128) |
| Callback | Handles `code` (PKCE) and `token_hash` (invite/recovery/magiclink) — [web/app/auth/callback/route.ts](web/app/auth/callback/route.ts) |
| Session creation | Supabase cookie session via `@supabase/ssr`; org-context cookies cleared on callback |
| Session refresh | Handled by `@supabase/ssr` client. **No middleware refresh** — see gap below |
| Logout | `DELETE /api/me` (clears org cookies) then `supabase.auth.signOut()` — [web/app/(shell)/_components/logout-button.tsx:16-22](web/app/(shell)/_components/logout-button.tsx#L16-L22) |
| Password reset | **N/A** — no passwords. OTP `recovery` type is accepted at the callback but unused |
| OAuth/social | **None** |
| Middleware/guards | **No `middleware.ts` exists anywhere in the repo.** Guarding is per-layout / per-route |
| Server-side verification | `supabase.auth.getUser()` inside `ensureProvisionedUserAndContext` — [web/lib/request-user.ts](web/lib/request-user.ts) |
| Client-side verification | Only the login form; no client-side gating of data |
| JWT usage | Never decoded or inspected manually. Only `getUser()` / `getSession()` |
| Cookies | Supabase session cookies + three product cookies: `activeOrgId`, `activeOrgSelectionId` ([web/lib/request-user.ts:80-82](web/lib/request-user.ts#L80-L82)), `platformActiveOrgId` ([web/src/server/services/platform-admin.ts:208](web/src/server/services/platform-admin.ts#L208)). All `httpOnly`, `sameSite=lax`, `secure` in prod |

### The critical detail

```ts
// web/lib/request-user.ts — resolveAppUserFromSupabaseIdentity
const existingUser = await getPrisma().user.findUnique({
  where: { email },                    // ← identity is joined by EMAIL
  select: { id: true, email: true, orgId: true, role: true },
});
```

`supabaseUserId` is threaded through the context object and exposed by `GET /api/me`, but it is **never written to the database and never used for lookup**. There is no column anywhere in the 90-model schema that stores a Supabase auth UID.

**This is the single most important finding.** It means:
- ✅ The product does **not** assume `auth.users.id` is its permanent user identity — the stated migration concern does not apply here.
- ✅ Repointing to Platform Core Auth requires no FK migration.
- ⚠️ But email is a mutable, user-controlled key. Two Supabase identities with the same email collapse to one product user; an email change orphans the account.

### Auto-provisioning side effects

`ensureProvisionedUserAndContext` is not a read-only auth check. On every request it may:
- **create** a `User` + `Membership` if the email is unknown (`createAppUserWithMembership`, using `DEFAULT_ORG_ID`),
- **mutate `User.orgId`** to a fallback org (`ensureMembershipForUser`, [web/lib/request-user.ts:236-260](web/lib/request-user.ts#L236-L260)).

Anyone who can obtain a Supabase OTP for any email address gets an auto-provisioned account in `DEFAULT_ORG_ID`. This is acceptable pre-customer, but must not survive into Platform Core.

### Dev fallback

`resolveFromDevFallback` bypasses Supabase entirely when `NODE_ENV === "development"`, resolving a user from `DEV_USER_ID`/`DEV_USER_EMAIL`. `DEV_ALLOW_NO_MEMBERSHIP=true` additionally bypasses the membership requirement. Both are correctly gated to development and are used by the Playwright E2E suite.

### Files affected when this product stops owning identity

| File | Change |
|---|---|
| [web/lib/request-user.ts](web/lib/request-user.ts) | **Primary.** Replace email lookup with `platformUserId` lookup; remove auto-provisioning |
| [web/src/lib/supabase/server.ts](web/src/lib/supabase/server.ts) | Point at Platform Core project |
| [web/src/lib/supabase/browser.ts](web/src/lib/supabase/browser.ts) | Point at Platform Core project |
| [web/src/lib/supabase/client.ts](web/src/lib/supabase/client.ts) | Unused singleton — delete |
| [web/src/lib/supabase/admin.ts](web/src/lib/supabase/admin.ts) | Service-role client must move to Platform Core or be removed |
| [web/app/auth/callback/route.ts](web/app/auth/callback/route.ts) | Likely deleted — Platform Core owns the callback |
| [web/app/(public)/login/page.tsx](web/app/(public)/login/page.tsx) | Likely deleted — redirect to Platform Core |
| [web/app/(app)/layout.tsx](web/app/(app)/layout.tsx) | Session guard against Platform Core |
| [web/app/api/admin/invite-user/route.ts](web/app/api/admin/invite-user/route.ts) | Invites become a Platform Core responsibility |
| [web/app/api/me/route.ts](web/app/api/me/route.ts) | Org selection must read Platform Core memberships |
| [web/app/(shell)/_components/logout-button.tsx](web/app/(shell)/_components/logout-button.tsx) | Central logout |
| [web/src/server/services/platform-admin.ts](web/src/server/services/platform-admin.ts) | Largely superseded by Platform Core |

---

## User Model

### Representation

```prisma
model User {
  id        String   @id @default(uuid()) @db.Uuid   // locally generated — NOT auth.users.id
  orgId     String   @db.Uuid                        // required "home" org, mutable at runtime
  email     String   @unique @db.Text                // ← the de-facto identity key
  name      String?
  role      UserRole                                 // GLOBAL role, not per-org
  ...
}
```

| Question | Answer |
|---|---|
| Profile tables? | **No.** `User` is the only user table. No separate profile model |
| Email as identifier? | **Yes — it is the identity join key.** `@unique`, and the sole lookup path from Supabase |
| `auth.users.id` used as FK? | **No. Nowhere in the schema.** |
| Tables referencing user IDs | **41 models** — see Tables Most Likely to Change |
| Multi-org? | **Yes, but inconsistently.** `Membership(orgId, userId)` supports many-to-many, and org switching works via `activeOrgId` cookie. But `User.orgId` is a required scalar, and `ensureMembershipForUser` **overwrites** it |
| Role scope | **Three separate systems**, none organization-scoped: `UserRole` (global, on `User`), `EventMemberRole` (event-scoped, on `EventMember`), plus module-level checks in [web/lib/copilot/permissions.ts](web/lib/copilot/permissions.ts) |
| Invitations create user records? | **Yes.** `invite-user` upserts `User` + `Membership` + `EventMember` for every event in the org, *before* the invitee accepts |

### Conflicts with a global SignalThread `user_id`

1. **`UserRole` is global, not per-organization.** A user who is `OWNER` is `OWNER` in *every* org they can access. `canListOrganizationEvents(role)` ([web/lib/events.ts:78](web/lib/events.ts#L78)) grants blanket access to **all events in the active org** on the strength of this global role. With Platform Core issuing per-org roles, this is a genuine mismatch that must be resolved.
2. **`User.orgId` duplicates `Membership`.** Two sources of truth for the same fact, and the scalar is mutated as a side effect of authentication.
3. **`SUPER_ADMIN` bypasses membership entirely** — sees every organization ([web/lib/request-user.ts:143-150](web/lib/request-user.ts#L143-L150)). This is a platform-level concept that belongs in Platform Core.
4. **Email uniqueness** will collide with Platform Core if Platform Core permits an email change or multiple identities.

---

## Organization Model

**Canonical table: `Organization`** — PK `id` (uuid), plus a `slug @unique`.

There is a second, distinct concept: **`Client`** (`orgId`, `name`, `slug`, unique per `(orgId, slug)`) — the customer an event is delivered *for*. `Event.clientId` is optional. This is agency-style operational data and is **not** a tenant boundary. It should stay product-owned.

| Question | Answer |
|---|---|
| Users attached via | `Membership(orgId, userId)` **and** the redundant `User.orgId` scalar |
| Permissions attached via | Global `User.role`; **no per-organization role exists** |
| Events attached via | `Event.orgId` (required) |
| Multi-org per user | Yes — via `Membership` + `activeOrgId` cookie + `/select-account` |
| Org IDs in URLs | Only in platform-admin pages: `web/app/platform/accounts/[orgId]/`. **Product routes are event-scoped, not org-scoped** — a significant simplification |
| Org IDs in JWTs | **No** — org context lives in the `activeOrgId` cookie, not the token |
| Org IDs in storage paths | **No** — R2 keys are `events/{eventId}/...` |
| Org IDs in integrations | **No** — all integration records are event-scoped |

**Duplicated concepts Platform Core should replace:** `Organization`, `Membership`, `User.orgId`, the `SUPER_ADMIN` role, and most of [web/src/server/services/platform-admin.ts](web/src/server/services/platform-admin.ts) (account CRUD, user-to-account linking, cross-account discovery, account deletion).

**Recommendation:**
- **Becomes a Platform Core reference:** `Organization.id` → `organization_id`; `Membership` → Platform Core org membership; `User.id` → `user_id`; global `UserRole`.
- **Stays product-owned:** `Client`, `EventMember` (product-specific event roles), and every operational table.

---

## Event Model

**Canonical table: `Event`** — PK `id` (uuid, locally generated).

```prisma
model Event {
  id              String      @id @default(uuid()) @db.Uuid
  orgId           String      @db.Uuid
  clientId        String?     @db.Uuid
  name            String
  startDate       DateTime    @db.Date
  endDate         DateTime?   @db.Date
  timezone        String      @default("America/New_York")
  status          EventStatus // DRAFT | ACTIVE | COMPLETED | CANCELED
  createdByUserId String      @db.Uuid
  // ... ~55 relation fields
}
```

| Concern | Detail |
|---|---|
| Creation | `createEventWithinTransaction` ([web/lib/events.ts:134](web/lib/events.ts#L134)) — atomically creates `Event` + creator `EventMember(EVENT_ADMIN)` + root `TimelineItem` + session-requirement template + `EventActivity` audit row |
| Deletion | Hard delete via `deleteEvent` ([web/app/api/events/[eventId]/route.ts:185](web/app/api/events/[eventId]/route.ts#L185)). No archive; `COMPLETED`/`CANCELED` statuses serve that role |
| Ownership | `Event.orgId` (tenant) + `Event.createdByUserId` (creator) |
| Membership | `EventMember(eventId, userId, eventRole)` — `EVENT_ADMIN` / `EVENT_EDITOR` / `EVENT_VIEWER` |
| Org relationship | Strict one-org-per-event |
| Dates/timezone | `@db.Date` for start/end (date-only, no TZ), plus an IANA `timezone` string per event |
| Routes with event IDs | **162 API routes** under `app/api/events/[eventId]/`, plus 3 page route groups |
| Storage paths | `events/{eventId}/documents/{documentId}/{filename}`, `events/{eventId}/speakers/{speakerId}/headshot/...`, `.../files/{kind}/...` — [web/src/server/storage/documents.ts:50](web/src/server/storage/documents.ts#L50), [web/src/server/storage/speakers.ts:34](web/src/server/storage/speakers.ts#L34) |
| Integrations with event IDs | `EventIntegrationConnection`, `EventExternalIdentity`, `EventIntegrationMetric` — all keyed by `eventId` |
| Background jobs with event IDs | `POST /api/events/{eventId}/marketing/run-due-scheduled-sends` |
| Signed tokens with event IDs | Speaker intake/portal HMAC tokens embed `eventId` in the payload — [web/src/server/services/speaker-intake.ts:41-46](web/src/server/services/speaker-intake.ts#L41-L46) |

**Where the local event ID is assumed authoritative:** effectively everywhere — 54 of 90 models carry `eventId`, and it appears in URLs, R2 object keys, signed portal tokens, and integration records.

### Safest way to adopt a canonical Platform Core `event_id`

Given no real customers, **reseed rather than migrate**:

1. Have Platform Core mint the canonical `event_id`, and make `Event.id` **equal to** that UUID (adopt-as-PK, not add-a-column). Every one of the 54 `eventId` FKs, all 162 routes, all R2 keys, and all token payloads then remain correct with zero code change.
2. Change `Event.id` from `@default(uuid())` to a required, caller-supplied value, and have the product's event-creation path call Platform Core to mint the ID first.
3. Wipe and reseed test data. Do **not** attempt a dual-ID (`localId` + `platformEventId`) scheme — it would double the surface area of every one of those 162 routes for no benefit at this stage.

The same reasoning applies to `Organization.id` and `User.id`.

---

## Product-Owned Data

### Should remain owned by this product

All operational domain data (~85 of 90 models):

- **Events & structure:** `Event`, `EventMember`, `Client`, `Room`, `MatrixRow`, `SessionRequirement*`, `SessionSpeaker*`, `SessionAVRequirement`, `SessionFoodService`, `SessionStaffAssignment`, `SessionFnbCatalogAssignment*`
- **Timeline & tasks:** `TimelineItem`, `TimelineDependency`, `Deadline`, `Task`, `TaskAssignment`, `TaskLink`, `TaskComment`, `TaskActivity`, `TaskWatcher`
- **Budget:** `Budget`, `BudgetGroup`, `BudgetCategoryTarget`, `BudgetLineItem`, `BudgetSubmission*`, `BudgetActivity`, `BudgetVersion`, `BudgetApproval`, `BudgetItem`
- **Documents:** `Document`, `DocumentVersion`, `DocumentApproval*`, `DocumentTag*`, `DocumentCategory`, `DocumentLink`
- **Speakers:** `Speaker`, `SpeakerIntakeToken`, `SpeakerProfileSubmission`, `SpeakerReadinessItem`, `SpeakerFile`, `SpeakerMessage`, `SpeakerInternalNote`, `SpeakerOnsiteInfo`, `SpeakerEmailLog`, `SpeakerDocumentRequest`
- **F&B:** `EventFnbCatalogItem`, `EventFnbSourceMenu`, `FnbParserFeedback`
- **Seating:** `SeatingPlan`, `SeatingTable`, `SeatingAttendee`, `SeatingAssignment`
- **Marketing:** `MarketingPlan`, `MarketingCampaign`, `MarketingAudience*`, `MarketingEmailSend*`, `MarketingEmailEvent`, `MarketingSuppression`, `MarketingKpiSnapshot`
- **Directory & attendees:** `EventDirectoryPerson`, `EventDirectoryRole`, `EventDirectorySource`, `EventDirectoryExternalIdentity`, `EventDirectoryImportBatch/Row`, `EventDirectoryModuleLink`, `EventAttendee`, `EventRegistrationRecord`, `EventAttendeeSessionEnrollment`
- **Integrations:** `EventIntegrationConnection`, `EventExternalIdentity`, `EventIntegrationMetric`
- **Audit:** `EventActivity`, `CopilotAuditLog`

### Should move to / become owned by Platform Core

| Concept | Today | After |
|---|---|---|
| Global identity | `User` (id, email, name) | Platform Core; product keeps a thin local projection keyed by `user_id` |
| Organizations | `Organization` | Platform Core; product stores `organization_id` only |
| Org memberships | `Membership` | Platform Core |
| Global roles | `User.role` (`UserRole`) | Platform Core (`SUPER_ADMIN` especially) |
| Canonical events | `Event` **identity** (the `id` and org linkage) | Platform Core mints `event_id`; **the Event row itself stays here** |
| Platform access / entitlements | Nothing exists today | Platform Core (new) |
| Platform account admin | [web/src/server/services/platform-admin.ts](web/src/server/services/platform-admin.ts), `web/app/platform/*` | Platform Core |

### Needs discussion

| Item | Question |
|---|---|
| `EventMember` / `EventMemberRole` | Is event *access* a Platform Core concept (per the brief's "event memberships/access") or a product role? Recommendation: Platform Core grants event **access**; Planner keeps `EventMemberRole` as its own **capability** layer. Both are needed. |
| `EventDirectoryPerson` | Person identity scoped to an event — attendees, speakers, staff. These are **not** platform users. Overlaps conceptually with Platform Core identity but must **not** move; Lead Retrieval and Voice likely have the same construct, so a shared *person* concept may deserve its own discussion separate from `user_id`. |
| `Client` | Agency-style customer record. Could be confused with Platform Core "Customer". Recommendation: keep product-owned, rename to avoid collision. |
| `Notification` | User-scoped, cross-module. Product-level today; may belong to a platform notification service later. |
| `EventIntegrationConnection` | Currently event-scoped. If an org-level Google/CRM connection is ever needed, ownership becomes ambiguous. |
| `UserRole` reconciliation | Global roles must become org-scoped. Who owns the mapping? |

---

## RLS & Authorization

### Finding: there is no RLS in this repository

```
CREATE POLICY statements found:            0
ENABLE ROW LEVEL SECURITY statements:      0
auth.uid() references:                     0
middleware.ts files:                       0
```

Searched across all 58 migrations in [prisma/migrations/](prisma/migrations/) and every `.sql` file in the repo. **Authorization is entirely application-layer.**

This is architecturally coherent, because the browser never talks to the database: Prisma connects as a privileged Postgres role over `DATABASE_URL`, so RLS would not be enforced even if policies existed.

### Authorization model

Two funnels carry nearly all enforcement:

**1. `resolveRequestUser` / `ensureProvisionedUserAndContext`** — [web/lib/request-user.ts](web/lib/request-user.ts)
Resolves the Supabase session → local `User` → active org. Returns `{ id, orgId, role }` where `orgId` is the **cookie-selected active org**, validated against `listAccessibleOrganizationsForUser`.

**2. `assertEventAccessForUser`** — [web/lib/event-access.ts](web/lib/event-access.ts)
```
INVALID_EVENT_ID          → 400
EVENT_NOT_FOUND           → 404
EVENT_OUTSIDE_ACTIVE_ORG  → 403   ← the tenant isolation boundary
EVENT_MEMBERSHIP_REQUIRED → 403
EVENT_EDITOR_ROLE_REQUIRED→ 403 (writes)
```
Reached by the 162 event routes via `requireEventRouteAccess` ([web/app/api/events/[eventId]/_lib/event-route-auth.ts](web/app/api/events/[eventId]/_lib/event-route-auth.ts)).

Tenant isolation reduces to exactly one line:
```ts
if (!user.orgId || user.orgId !== event.orgId) { /* deny */ }
```

Additional layers: `canListOrganizationEvents(role)` (global-role blanket access), [web/lib/copilot/permissions.ts](web/lib/copilot/permissions.ts) (module-level copilot gating), [web/app/api/events/[eventId]/budget/_lib/route-auth.ts](web/app/api/events/[eventId]/budget/_lib/route-auth.ts) (budget-specific), and [docs/RBAC_MATRIX.json](docs/RBAC_MATRIX.json).

### Classification

| Item | Classification | Note |
|---|---|---|
| RLS policies | **Can remain unchanged** | None exist. Platform Auth cannot conflict with them |
| `assertEventAccessForUser` org check | **Needs adaptation** | Must compare against Platform Core `organization_id` |
| `canListOrganizationEvents(role)` | **Needs complete redesign** | Global role granting org-wide event access is incompatible with per-org Platform Core roles |
| `SUPER_ADMIN` bypass | **Needs complete redesign** | Platform-level concept; move to Platform Core |
| Auto-provisioning in the auth path | **Security concern** | Any email with a valid OTP self-provisions into `DEFAULT_ORG_ID` |
| No DB-level tenant isolation | **Security concern** | A single missing `requireEventRouteAccess` call = cross-tenant data exposure, with no backstop |
| Service-role usage (2 sites) | **Needs adaptation** | See below |
| Public token routes (11) | **Can remain unchanged** | Independent HMAC auth, deliberately outside user identity |
| `DEV_ALLOW_NO_MEMBERSHIP`, `DEV_USER_*` | **Can remain unchanged** | Correctly dev-gated |

### Service-role usage

| Site | Use | Impact |
|---|---|---|
| [web/app/api/admin/invite-user/route.ts:128](web/app/api/admin/invite-user/route.ts#L128) | `auth.admin.inviteUserByEmail` | Moves to Platform Core |
| [web/src/server/services/speaker-intake.ts:26](web/src/server/services/speaker-intake.ts#L26) | **`SUPABASE_SERVICE_ROLE_KEY` used as HMAC signing secret fallback** | ⚠️ Changing Supabase projects **silently invalidates every outstanding speaker intake/portal token** unless `SPEAKER_INTAKE_TOKEN_SECRET` is set explicitly first |

The service-role key is server-only and never reaches the browser (no `NEXT_PUBLIC_` prefix) — that part is correct.

### Can central Platform Auth coexist with this RLS model?

**Yes, trivially — because there is no RLS model to coexist with.** Prisma connects with a privileged Postgres role; the identity of the JWT issuer is irrelevant to database access. Repointing to Platform Core changes only *who validates the session*, not *how data is reached*.

The corollary is the real risk: **there is no database-level safety net.** If Platform Core introduces any path where the browser queries Postgres directly, RLS would have to be designed from scratch across 90 tables.

---

## Storage

**Supabase Storage is not used.** Storage is **Cloudflare R2** via the AWS S3 SDK.

| Concern | Detail |
|---|---|
| Client | [web/lib/r2.ts](web/lib/r2.ts) — `S3Client`, `region: "auto"`, `forcePathStyle: true` |
| Buckets | One, from `R2_BUCKET` (`plannerdash…`) |
| Public/private | **Private.** All access is via presigned URLs |
| Storage policies | None (R2 has no RLS equivalent). Access control is entirely in the route handlers |
| Path structure | `events/{eventId}/documents/{documentId}/{filename}`<br>`events/{eventId}/speakers/{speakerId}/headshot/{filename}`<br>`events/{eventId}/speakers/{speakerId}/files/{kind}/{ts}-{filename}` |
| User/org IDs in paths | **None.** Event-scoped only |
| Signed URLs | `@aws-sdk/s3-request-presigner` for both upload and download |
| Upload flow | Client requests presign → route calls `requireEventRouteAccess` → returns presigned PUT → browser uploads directly to R2 |
| Download flow | Presigned GET, plus a proxy route `/api/speaker-headshots/{objectKey}` |
| Service-role ops | R2 credentials are server-only; the browser only ever sees short-lived presigned URLs |

**Presign routes** (7 authenticated + 3 public-token):
`documents/presign`, `documents/upload-local`, `budget/files/presign`, `speakers/{speakerId}/headshot/presign`, `speakers/{speakerId}/files/presign`, `fnb-catalog/parse-menu/presign`, plus `public/speaker-intake/…` and `public/speaker-portal/…`.

**What must change under Platform Core:** essentially nothing about the auth mechanism — presign routes already gate on `requireEventRouteAccess`, which will simply resolve identity from Platform Core instead. **But** because object keys embed `eventId`, adopting a canonical Platform Core `event_id` **changes every future object key**. Since test data is disposable, wipe the bucket and reseed rather than writing a key-rewrite job.

---

## Realtime

**Supabase Realtime is not used in this repository.**

Verified: no `.channel(`, no `postgres_changes`, no `.subscribe()`, no realtime imports. The UI is server-rendered with client-side fetch/refresh. There are therefore no subscription authorization concerns, and central auth has **no impact** on realtime behavior.

---

## Cross-Product Dependencies

Coupling is minimal — this product is effectively standalone today.

| Coupling | Detail | Concern |
|---|---|---|
| `@signalthread/ui` | Shared design system, consumed as a local workspace package `file:../packages/signalthread-ui` | **None** — healthy shared code. Note it is *not* published; other repos cannot consume it as-is |
| **Voice** | [web/lib/event-voice-demo.ts](web/lib/event-voice-demo.ts) hard-codes `VOICE_DEMO_EVENT_ID = "717ca942-5701-4bfb-82e7-afddf41f19a7"` to gate a static demo page at `/events/[eventId]/voice` | **LOW.** No API calls, no shared data — a UI placeholder. But a hard-coded event UUID will break on reseed |
| **OrcaOS branding** | Logo and copy throughout the shell | Naming, not architecture |
| Direct DB-to-DB | **None found** | ✅ |
| Cross-product API calls | **None found** | ✅ |
| Shared tables | **None** | ✅ |
| Duplicated events/users | **None with other products** | ✅ |
| Inbound webhooks | SendGrid only ([web/app/api/marketing/sendgrid/webhook/route.ts](web/app/api/marketing/sendgrid/webhook/route.ts)) | Not cross-product |

**No direct database-to-database dependency exists.** The `EventIntegrationConnection` model is provider-agnostic and built for *external* systems (registration platforms), not for other SignalThread products — though it is the natural place to model cross-product links later.

---

## Integrations

| Integration | Scope today | Notes | Risk under central identity |
|---|---|---|---|
| **SendGrid** (marketing + speaker email) | **Product-level** | Single API key in env; `MarketingEmailSend` is event-scoped. Webhook verified via Twilio EdDSA signature or bearer secret | **None** — no user-level OAuth |
| **OpenAI** (room-set layout, F&B menu parsing, copilot) | **Product-level** | Single API key. `CopilotAuditLog` records `userId` + `orgId` for attribution only | **None** |
| **Cloudflare R2** | **Product-level** | Single bucket + credentials | **None** |
| **Supabase Auth** | **Product-level** | To be replaced by Platform Core | This *is* the migration |
| **`EventIntegrationConnection`** (registration providers) | **Event-level** | `provider`, `externalEventId`, granular capability flags, `createdByUserId` | ⚠️ `createdByUserId` is a Planner `User.id`. Under Platform Core it must map to a global `user_id` — otherwise attribution silently breaks |
| **`EventExternalIdentity`** | **Event-level** | Maps `EventDirectoryPerson` ↔ external provider objects | **None** — attendee identity, not platform identity |

**No user-level OAuth exists.** There is no Google, Microsoft, CRM, calendar, or payment integration with per-user tokens. This eliminates the most dangerous class of central-identity migration bug — there are no stored refresh tokens bound to a local user ID that would need re-consent.

The only integration ownership to watch is `EventIntegrationConnection.createdByUserId` and `EventDirectorySource.createdByUserId`.

---

## High-Volume Paths

| Path | Tables | Sync/Bg | Notes |
|---|---|---|---|
| **Directory bulk import** | `EventDirectoryImportBatch`, `EventDirectoryImportRow`, `EventDirectoryPerson`, `EventDirectoryRole`, `EventExternalIdentity` | **Synchronous** | `POST /events/{id}/directory/imports`. Row-per-record; largest write path |
| **Attendee import** | `EventAttendee`, `EventRegistrationRecord`, `EventAttendeeSessionEnrollment` | **Synchronous** | `POST /events/{id}/attendees/imports` |
| **Marketing send** | `MarketingEmailSend`, `MarketingEmailSendRecipient`, `MarketingAudienceRecipient`, `MarketingSuppression` | **Synchronous** | Fan-out per recipient via SendGrid |
| **SendGrid event webhook** | `MarketingEmailEvent`, `MarketingEmailSendRecipient` | Synchronous, **external-rate** | Highest inbound request rate; batched delivery/open/click events |
| **Scheduled send runner** | as above | Pull-based | `POST /events/{id}/marketing/run-due-scheduled-sends`, guarded by `MARKETING_SEND_RUNNER_SECRET`. **No cron is configured in the repo** — driven externally |
| **File uploads** | `Document`, `DocumentVersion`, `SpeakerFile` | Presign sync, transfer direct-to-R2 | Large payloads bypass the app server ✅ |
| **F&B menu parsing** | `EventFnbSourceMenu`, `EventFnbCatalogItem` | **Synchronous + OpenAI** | PDF parse + LLM call inside the request. Slowest path |
| **Room-set layout planning** | `SeatingPlan`, `SeatingTable`, `SeatingAssignment` | **Synchronous + OpenAI** | `/api/room-set/plan-layout` |
| **Other bulk imports** | `MatrixRow`, `TimelineItem`, `BudgetLineItem`, `Speaker` | **Synchronous** | `*/import` routes |
| **Event dashboard** | ~15 tables aggregated | Synchronous | Read-heavy; highest query-count-per-request |

**Connection pressure is the key constraint.** `PrismaPg({ max: 1 })` per warm Vercel instance ([web/src/server/db/prisma.ts:70-77](web/src/server/db/prisma.ts#L70-L77)) means concurrency scales by instance count, not pool size. Bulk imports hold that single connection for the duration of the request.

### Where Platform Core must NOT be in the hot path

1. **Per-request auth resolution.** `ensureProvisionedUserAndContext` runs on essentially every request. Today it costs 3–5 queries against the *local* database. If it becomes a network call to Platform Core, every one of the 198 routes takes an extra round trip. **Platform Core claims must arrive in the session token and be cached locally.**
2. **`assertEventAccessForUser`.** Called on all 162 event routes. Event access must be resolvable from local data plus token claims.
3. **Bulk import loops.** Must never resolve identity per row.
4. **Webhook ingestion.** SendGrid events arrive at external rates and must not depend on Platform Core availability.
5. **Presign routes.** Upload latency is user-visible.

The stated goal — normal product operation continuing without querying Platform Core per request — is achievable here, because the product already resolves everything from its own database. The design rule is: **Platform Core writes claims into the token at login; the product reads claims, never calls back.**

---

## Required Platform Core Changes

### A. Central authentication changes

1. Repoint `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` at Platform Core in [web/src/lib/supabase/server.ts](web/src/lib/supabase/server.ts) and [web/src/lib/supabase/browser.ts](web/src/lib/supabase/browser.ts).
2. Delete the local login UI ([web/app/(public)/login/page.tsx](web/app/(public)/login/page.tsx)) and callback ([web/app/auth/callback/route.ts](web/app/auth/callback/route.ts)); redirect unauthenticated users to Platform Core.
3. **Rewrite `resolveAppUserFromSupabaseIdentity`** ([web/lib/request-user.ts](web/lib/request-user.ts)) to look up by `platformUserId`, not `email`.
4. **Remove auto-provisioning** (`createAppUserWithMembership`, `ensureMembershipForUser`, `DEFAULT_ORG_ID`). Access must come from Platform Core entitlements. Replace with a just-in-time *projection* of the Platform Core user into the local `User` table — never a creator of access.
5. Move invites ([web/app/api/admin/invite-user/route.ts](web/app/api/admin/invite-user/route.ts)) to Platform Core; keep a local hook that provisions `EventMember` rows on first entry.
6. Delete the unused singleton [web/src/lib/supabase/client.ts](web/src/lib/supabase/client.ts).
7. Central logout in [web/app/(shell)/_components/logout-button.tsx](web/app/(shell)/_components/logout-button.tsx).
8. **Set `SPEAKER_INTAKE_TOKEN_SECRET` explicitly before switching projects** ([web/src/server/services/speaker-intake.ts:26](web/src/server/services/speaker-intake.ts#L26)) so portal tokens do not silently break.
9. Retain the dev fallback (`DEV_USER_EMAIL`/`DEV_USER_ID`) — the E2E suite depends on it.

### B. Global ID changes

Adopt-as-primary-key, with a reseed:

| ID | Change |
|---|---|
| `user_id` | `User.id` becomes the Platform Core user UUID (supplied, not defaulted). All 41 user-referencing models follow automatically |
| `organization_id` | `Organization.id` becomes the Platform Core org UUID. Consider reducing `Organization` to a local cache of `{id, name, slug}` |
| `event_id` | `Event.id` becomes the Platform Core event UUID. Event creation calls Platform Core to mint the ID first, inside the existing `createEventWithinTransaction` |

Also: drop `User.orgId` in favour of `Membership`/Platform Core memberships (it is currently mutated at request time); replace the hard-coded `VOICE_DEMO_EVENT_ID`; remove `@default(uuid())` from the three adopted PKs.

### C. RLS/security changes

1. **No RLS migration is required** — none exists. Do not introduce RLS unless the browser starts querying Postgres directly.
2. Redesign `canListOrganizationEvents(role)` ([web/lib/events.ts:78](web/lib/events.ts#L78)) for per-org Platform Core roles.
3. Replace `SUPER_ADMIN` with a Platform Core platform-admin claim.
4. Add a **route-coverage test** asserting every route under `app/api/events/[eventId]/` calls `requireEventRouteAccess` — with no RLS backstop, this is the only defence against a missed check. (Regression tests such as `web/lib/wave2-route-auth-hardening-regression.test.ts` already establish the pattern.)
5. Keep the 11 public token routes as-is; they are deliberately identity-independent.

### D. Routing/context changes

- **Signed-in user:** from the Platform Core session cookie, via the existing `ensureProvisionedUserAndContext`.
- **Selected organization:** currently the `activeOrgId` cookie, validated against local `Membership`. Change to validate against **Platform Core memberships in the token**. Preserve the cookie as the carrier so `/select-account` and the 3-cookie model keep working.
- **Selected event:** already URL-path-based (`/events/{eventId}/...`). **No change needed** — the strongest part of the current design.
- Accept an inbound `?organization_id=` / `?event_id=` handoff from Platform Core routing, validate against token claims, then set the existing cookies and redirect.
- Retire `PLATFORM_CONTEXT_COOKIE_NAME` (`platformActiveOrgId`) along with the local platform-admin area.

### E. Platform integration (what this product exposes back)

Minimal, read-only, and asynchronous:

1. **Event summary read-model** — `GET /api/platform/events/{event_id}/summary`: name, dates, timezone, status, venue, counts (speakers, sessions, attendees, documents), budget totals, completion signals. Sources already exist in the dashboard aggregation.
2. **Module activity signal** — Planner already has a canonical audit stream (`EventActivity`, with `EventActivityModule`/`EventActivityAction` enums). Emit a filtered feed for platform-level "what's happening" views.
3. **Entitlement check hook** — a single cached helper reading module entitlements from token claims, so Planner can hide/disable modules.
4. **Health/readiness endpoint** for product routing.

Explicitly **not** exposed: operational data (budget line items, documents, directory records, marketing sends). Platform Core should never read Planner's operational tables.

### F. Test-data/reset work

Reseeding is strongly preferred and already well-supported:

1. Reseed via [prisma/seed.ts](prisma/seed.ts) with Platform-Core-minted IDs for org/user/event.
2. **Wipe the R2 bucket** — object keys embed `eventId` and become stale.
3. Purge Supabase `auth.users` in the old project; recreate identities in Platform Core.
4. Update `DEV_USER_EMAIL`/`DEV_USER_ID` and the Playwright fixtures (`web/e2e/`, `web/lib/test-harness/planner-fixtures.test.ts`).
5. Replace `VOICE_DEMO_EVENT_ID` with a seeded constant.
6. Re-run `npm --prefix web run verify` plus `test:journeys` and `test:e2e:p0`.
7. Reset `DEFAULT_ORG_ID` handling — it should not exist post-migration.

---

## Risks

### BLOCKER

*None.* No finding prevents connecting this product to Platform Core.

### HIGH

| Risk | Evidence | Mitigation |
|---|---|---|
| **No database-level tenant isolation.** All isolation is one application-layer comparison. A single route missing `requireEventRouteAccess` leaks cross-tenant data with no backstop | 0 RLS policies; [web/lib/event-access.ts:104](web/lib/event-access.ts#L104) | Add route-coverage test asserting all 162 event routes are guarded |
| **Auth path auto-provisions users and mutates `User.orgId`.** Any email with a valid OTP self-provisions into `DEFAULT_ORG_ID`; `ensureMembershipForUser` rewrites the user's home org as a side effect of a GET | [web/lib/request-user.ts:236-260](web/lib/request-user.ts#L236-L260) | Remove entirely under Platform Core (§A.4) |
| **Global `UserRole` grants org-wide event access.** `canListOrganizationEvents` gives OWNER/ADMIN/SUPER_ADMIN blanket access to every event in the active org, bypassing `EventMember` — incompatible with per-org Platform Core roles | [web/lib/events.ts:78](web/lib/events.ts#L78) | Redesign as per-org roles (§C.2) |

### MEDIUM

| Risk | Evidence | Mitigation |
|---|---|---|
| **Email as identity join key.** Mutable and user-controlled; an email change orphans the account, and duplicate emails collapse identities | [web/lib/request-user.ts](web/lib/request-user.ts) | Switch to `platformUserId` (§A.3) |
| **Speaker tokens signed with the service-role key.** Changing Supabase projects silently invalidates every outstanding intake/portal token | [web/src/server/services/speaker-intake.ts:26](web/src/server/services/speaker-intake.ts#L26) | Set `SPEAKER_INTAKE_TOKEN_SECRET` **before** the switch |
| **`event_id` is embedded in R2 keys and signed tokens.** Adopting canonical IDs invalidates both | [web/src/server/storage/documents.ts:50](web/src/server/storage/documents.ts#L50) | Reseed + wipe bucket (§F) |
| **Platform Core could become a hot-path dependency.** Auth resolution runs on all 198 routes | [web/lib/request-user.ts](web/lib/request-user.ts) | Token claims + local cache; never call back per request |
| **Duplicated org membership** (`User.orgId` vs `Membership`) will diverge from Platform Core | [prisma/schema.prisma:36](prisma/schema.prisma#L36) | Drop `User.orgId` |
| **`max: 1` connection pool** under bulk imports; Platform Core adds no pressure but leaves no headroom | [web/src/server/db/prisma.ts:75](web/src/server/db/prisma.ts#L75) | Monitor; consider moving bulk imports to background work |

### LOW

| Risk | Evidence |
|---|---|
| Hard-coded `VOICE_DEMO_EVENT_ID` breaks on reseed | [web/lib/event-voice-demo.ts:2](web/lib/event-voice-demo.ts#L2) |
| No `middleware.ts` — no central session refresh; relies on per-layout guards | repo-wide |
| `@signalthread/ui` is a local file dependency, not published — blocks reuse across product repos | [web/package.json](web/package.json) |
| OrcaOS/Planner OS naming ambiguity across audits | [web/app/(shell)/_components/shell-scaffold.tsx:221](web/app/(shell)/_components/shell-scaffold.tsx#L221) |
| Local platform-admin area duplicates Platform Core | [web/src/server/services/platform-admin.ts](web/src/server/services/platform-admin.ts) |
| No cross-product writes, no browser-direct DB access, no Storage/Realtime auth issues | ✅ verified absent |

---

## Implementation Status

**Phase 1 is implemented** on branch `platform-core-phase-1`. It delivers step 1 below in full, plus the additive half of step 4 (canonical `user_id`), and prepares — but does not perform — the auth repoint. See [PLATFORM_CORE_MIGRATION_PHASE_1.md](PLATFORM_CORE_MIGRATION_PHASE_1.md) for what changed, what transitional behaviour remains, and the deviations from the order below.

Two corrections to this audit surfaced during implementation:

- **§C.4** assumes every event route calls `requireEventRouteAccess`. In practice six helpers reach identity, all funnelling into `resolveRequestUser`; the coverage test was generalised accordingly.
- The repository has **two mirrored Prisma trees** (`prisma/` and `web/prisma/`). Schema changes must be applied to both.

---

## Recommended Implementation Order

1. **Pre-work (no behaviour change).** Set `SPEAKER_INTAKE_TOKEN_SECRET` explicitly. Add the route-coverage test for `requireEventRouteAccess`. Delete the unused `supabase/client.ts`.
2. **Decide the role model.** Resolve global-vs-org roles and whether `EventMember` remains product-owned. Everything downstream depends on this.
3. **Adopt global IDs in the schema.** Make `User.id`, `Organization.id`, `Event.id` caller-supplied. Drop `User.orgId`.
4. **Repoint auth.** Swap Supabase env to Platform Core; rewrite the identity resolver to key on `platformUserId`; remove auto-provisioning; delete the local login/callback.
5. **Rework org context.** Validate `activeOrgId` against token claims instead of local `Membership`. Accept the Platform Core routing handoff.
6. **Redesign role checks.** `canListOrganizationEvents`, `SUPER_ADMIN`, copilot permissions.
7. **Reseed.** Wipe DB + R2, reseed with Platform-Core-minted IDs, update E2E fixtures.
8. **Expose the read-model.** Event summary + activity feed endpoints for Platform Core.
9. **Retire duplicates.** Remove the local platform-admin area and `platformActiveOrgId` cookie.
10. **Verify.** `npm --prefix web run verify:strict`, `test:journeys`, `test:e2e:p0`.

---

## Estimated Complexity

| Workstream | Complexity | Effort |
|---|---|---|
| Central auth swap | **LOW** | 3–5 days |
| Global ID adoption | **MEDIUM** | 4–6 days (schema + reseed + storage/token invalidation) |
| RLS/security | **LOW** | 1–2 days (no RLS; mainly the coverage test) |
| Role model redesign | **MEDIUM–HIGH** | 4–6 days — the largest real unknown |
| Routing/context | **LOW** | 2–3 days (event context already URL-based) |
| Platform read-model API | **LOW** | 2–3 days (aggregations exist) |
| Reseed + test fixtures | **MEDIUM** | 3–4 days (large E2E suite) |
| **Total** | **MEDIUM** | **~2–3 engineer-weeks** |

Lower than a typical Supabase-native product, because there is no RLS to redesign, no Supabase Storage policies, no Realtime authorization, and no `auth.users.id` foreign keys. Effort is concentrated in the role model and the reseed — not in authentication.

---

## Files Most Likely to Change

**Critical (rewrite):**
- [web/lib/request-user.ts](web/lib/request-user.ts) — the identity resolver; largest single change
- [web/lib/event-access.ts](web/lib/event-access.ts) — tenant boundary
- [web/lib/events.ts](web/lib/events.ts) — `canListOrganizationEvents`, `createEventWithinTransaction`

**High (repoint or delete):**
- [web/src/lib/supabase/server.ts](web/src/lib/supabase/server.ts), [browser.ts](web/src/lib/supabase/browser.ts), [admin.ts](web/src/lib/supabase/admin.ts), [client.ts](web/src/lib/supabase/client.ts)
- [web/app/auth/callback/route.ts](web/app/auth/callback/route.ts) — likely deleted
- [web/app/(public)/login/page.tsx](web/app/(public)/login/page.tsx) — likely deleted
- [web/app/(app)/layout.tsx](web/app/(app)/layout.tsx)
- [web/app/api/me/route.ts](web/app/api/me/route.ts)
- [web/app/api/admin/invite-user/route.ts](web/app/api/admin/invite-user/route.ts)
- [web/src/server/services/platform-admin.ts](web/src/server/services/platform-admin.ts) + `web/app/platform/**`
- [prisma/schema.prisma](prisma/schema.prisma)

**Medium:**
- [web/lib/organization-selection.ts](web/lib/organization-selection.ts)
- [web/app/(shell)/select-account/](web/app/(shell)/select-account/)
- [web/app/(shell)/_components/logout-button.tsx](web/app/(shell)/_components/logout-button.tsx)
- [web/src/server/services/speaker-intake.ts](web/src/server/services/speaker-intake.ts)
- [web/lib/copilot/permissions.ts](web/lib/copilot/permissions.ts)
- [web/lib/event-voice-demo.ts](web/lib/event-voice-demo.ts)
- [prisma/seed.ts](prisma/seed.ts)
- [web/src/server/storage/documents.ts](web/src/server/storage/documents.ts), [speakers.ts](web/src/server/storage/speakers.ts)

**Low (verify only):** the 162 routes under `web/app/api/events/[eventId]/` — they inherit correctness from `requireEventRouteAccess` and should not need individual edits.

---

## Tables Most Likely to Change

**Replaced by / reduced to a Platform Core reference (4):**

| Table | Change |
|---|---|
| `User` | `id` becomes global `user_id`; drop `orgId`; drop or rescope `role`; keep as a thin local projection |
| `Organization` | `id` becomes global `organization_id`; reduce to a local cache |
| `Membership` | Superseded by Platform Core org membership |
| `Event` | `id` becomes global `event_id`; `orgId` becomes a Platform Core reference. **The row stays product-owned** |

**Identity-column changes only (41 models with user references):**
`EventMember`, `Notification`, `Task`, `TaskAssignment`, `TaskComment`, `TaskActivity`, `TaskWatcher`, `Deadline`, `TimelineItem`, `Budget`, `BudgetGroup`, `BudgetCategoryTarget`, `BudgetSubmission`, `BudgetSubmissionRecipient`, `BudgetActivity`, `BudgetVersion`, `BudgetApproval`, `Document*`, `DocumentVersion`, `DocumentApproval`, `DocumentApprovalRecipient`, `Speaker*` (7 models), `EventActivity`, `CopilotAuditLog`, `Marketing*` (4 models), `EventDirectoryPerson`, `EventDirectoryRole`, `EventDirectorySource`, `EventDirectoryImportBatch`, `EventAttendee`, `EventAttendeeSessionEnrollment`, `EventIntegrationConnection`.

**Org-scoped tables needing the new `organization_id` (11):**
`User`, `Membership`, `Notification`, `Client`, `Event`, `Task`, `Document`, `DocumentTag`, `FnbParserFeedback`, `CopilotAuditLog`, `EventDirectoryPerson`.

**Event-scoped tables (54):** no structural change if `Event.id` **is** the canonical `event_id` — the strongest argument for adopt-as-PK over a parallel column.

**Unchanged (~35):** pure operational/child tables with no direct identity reference (`SeatingTable`, `SessionRequirementItem`, `BudgetLineItem`, `TimelineDependency`, `MatrixRow`, `Room`, etc.).

---

## Open Decisions

1. **Does Platform Core own event *access*, or only event *identity*?** The brief lists "event memberships/access" as Platform Core-owned, but Planner's `EventMemberRole` (`EVENT_ADMIN`/`EVENT_EDITOR`/`EVENT_VIEWER`) is product-specific capability. **Recommendation:** Platform Core grants access; Planner keeps roles. Needs cross-product agreement.
2. **How do global roles become org-scoped?** `UserRole` is global today. Does Platform Core issue per-org roles, and does Planner map them to its own or consume them directly?
3. **`SUPER_ADMIN`** — a Platform Core claim, or does Planner keep a local break-glass role?
4. **Who mints `event_id`?** Platform Core on create, or Planner generating and registering it? Affects `createEventWithinTransaction` and whether event creation can proceed if Platform Core is unavailable.
5. **`EventDirectoryPerson` vs global identity.** Attendees/speakers are people but not platform users. Voice and Lead Retrieval almost certainly have the same construct. Is there a shared *person* concept distinct from `user_id`? **This is the most important cross-product question in this audit.**
6. **`Client` vs Platform Core "Customer".** Keep product-owned and rename, or reconcile?
7. **How do entitlements reach the product?** Token claims (fast, stale) or an API call (fresh, slow)? Given §12, **token claims with a short TTL**.
8. **Is `@signalthread/ui` published?** Currently `file:../packages/signalthread-ui` — must be published for other product repos to share it.
9. **Does Platform Core mint the session, or does each product?** Determines whether cookie domains must be shared and whether `@supabase/ssr` remains the session mechanism.
10. **Product naming** — is this "Planner OS" or "OrcaOS"? Must be settled before merging with the Orca audit.
11. **Should this product adopt RLS at all?** Currently none, and Prisma bypasses it. Adding it would be defence-in-depth across 90 tables — real cost, real benefit. Out of scope for the migration, but worth an explicit decision.
