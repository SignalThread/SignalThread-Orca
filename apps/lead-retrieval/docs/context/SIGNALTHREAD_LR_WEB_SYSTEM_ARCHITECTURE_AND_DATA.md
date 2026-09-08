# SignalThread Lead Retrieval — System Architecture and Data

> **Status date: 2026-08-05 (America/New_York).**
>
> **Source-confidence note:** High confidence for current local code, package manifests, migrations, routes, and tests. Production deployment revision is verified, but applied database migrations, live environment values, RLS parity, and tenant data/provider health remain unverified.

## System shape

```text
Expo mobile ── bearer/API ─┐
                          ├── Next.js web/backend ── Supabase Postgres/Auth/Storage
Web browser ─ session ────┘           │
                                      ├── Google OAuth/Gmail/Calendar
                                      ├── AI, email, object-storage services
                                      └── CRM/enrichment/automation adapters

Expo mobile ── SQLite + outbox ── retry/reconcile ── canonical server mutations
```

## Frameworks and runtime

### Web/backend

- Next.js 16.1.6 App Router, React, TypeScript, Tailwind-based product UI.
- Supabase authentication and Postgres persistence with RLS plus narrowly scoped service-role work.
- Deployed on Vercel at `lr.signalthread.ai`.
- Integrations include Google Workspace and code/surfaces for additional CRM, enrichment, email, storage, AI, and automation concerns.

### Mobile

- Expo SDK 54, React Native 0.81, Expo Router, TypeScript.
- SQLite local persistence and durable outbox/reconciliation.
- Supabase auth plus mobile-facing Next.js API contracts.
- Vitest/unit coverage and Maestro device-flow material.

## Repository responsibility

### Web/backend authority

- Cloud tables, migrations, generated database types, and RLS intent.
- Authentication/session and canonical company/event authorization.
- Lead, conversation, intelligence, import, campaign, workflow, provider, and follow-up services.
- OAuth callbacks, token encryption/acquisition, provider API calls, idempotency, safe errors.
- Server components and APIs consumed by web and mobile.

### Mobile authority

- Device navigation and interaction.
- Local SQLite schema, cached records, outbox, pending/error presentation.
- Offline capture and synchronization orchestration.
- Secure mobile OAuth launch consumption and Expo deep-link return UX.
- Client validation and provider capability presentation.

Business logic that governs durable cloud state belongs on the server, not duplicated in route handlers or mobile screens.

## Authentication and access control

### Web

Browser flows resolve Supabase session/cookies. Global middleware controls public versus protected request behavior. Sensitive server actions re-resolve identity and scope.

### Mobile

Mobile presents a Supabase bearer to protected mobile APIs. The server resolves the user and applies the same company/event/resource rules.

### Normalized roles

- `platform_admin`
- `organizer_admin`
- `exhibitor_admin`
- `exhibitor_viewer`
- `viewer`

Historical literals such as `organizer` and `event_organizer` may normalize to current roles. Do not add authorization comparisons outside canonical helpers.

### Scope composition

Authorization can depend on:

- authenticated user;
- company membership and membership status;
- normalized role;
- app/license eligibility and seats;
- event membership or assignment;
- event access mode;
- ownership/acting-user constraints;
- lead/event/company relationship.

Service-role database access bypasses RLS and therefore requires explicit predicates at every query/mutation.

## Core cloud data domains

Exact names vary; use migrations/generated types before implementation.

| Domain | Principal concepts |
|---|---|
| Identity/tenancy | users/profiles, companies, memberships, invites, roles |
| Entitlements | licenses, apps, seats, membership/app eligibility |
| Events/access | events, event users/assignments, access modes |
| Leads | identity, contact/company attributes, ownership, rating/temperature, lifecycle, follow-up fields |
| Capture/import | staged rows, mapping, enrichment, approval/publish state, source identity |
| Conversations | source/voice note/transcript, processing stage/status/error, summaries |
| Intelligence | evidence, needs, themes, objections, competitors, messaging, briefings |
| Activity/action | emails, meetings, follow-ups, activity persistence |
| Campaign/workflow | templates, documents, campaigns/agents, triggers, steps, executions, waits/approvals |
| Integrations | connection metadata, encrypted credential material, provider references, OAuth tickets |
| Reliability | idempotency/operation records, processing health, reconciliation state |

## Lead follow-up model

Current intent extends a lead with nullable:

- `follow_up_at` (`timestamptz`)
- `follow_up_note` (`text`)
- `follow_up_completed_at` (`timestamptz`)
- `follow_up_calendar_event_id` (`text`)
- compatibility `follow_up_date`, derived from the intended local timezone

Idempotency support is introduced by the latest migration series. The canonical service creates/updates/completes/clears LR state and optionally synchronizes a private user-owned Calendar reminder.

## Mobile local data and sync

The local database caches user/event-scoped lead and voice/context state plus durable outbox operations. A typical mutation is:

1. validate active user/company/event;
2. create/update local record with stable identifier;
3. enqueue an idempotent operation;
4. optimistically render local state;
5. retry when connectivity/session permits;
6. reconcile the canonical response;
7. retain actionable error state for partial or terminal failure.

User switching and sign-out must prevent cache leakage. Secondary uploads must not duplicate the primary lead on retry.

## Google Workspace architecture

### Connection ownership

Credentials belong to the acting user and are encrypted at rest. Connection status must not report “connected” when refresh credentials are unusable.

### Mobile OAuth bridge

1. Authenticated mobile POST requests a provider connection.
2. Server creates a signed, expiring, single-use launch ticket bound to user/company/provider.
3. Response returns a launch URL containing the ticket—not the mobile bearer.
4. Browser GET has no cookie/Authorization requirement; middleware permits the route.
5. Launch validates and consumes the ticket, then redirects to Google OAuth.
6. Provider callback completes connection state and returns only a safe Expo status.

Missing, malformed, expired, consumed, or mismatched tickets fail safely.

### Credential semantics

- Remote revocation is best effort; successful local disconnect remains successful.
- Unconfirmed revocation can return `revocationPending=true`.
- Invalid/revoked refresh credentials map to `reconnect_required` (canonical HTTP contract uses conflict semantics) rather than generic provider unavailable.
- Gmail/Calendar are not called when reconnect is already required.

### Gmail

Editable default content uses only available lead/event/sender/conversation data. Canonical MIME serialization preserves complete plain text and line breaks, with minimal email-safe HTML through the existing architecture. Idempotency/retry protection prevents duplicate sends.

### Meetings

Availability generation respects selected start date/time, timezone, allowed scheduling window, FreeBusy results, duration, and stale-result invalidation. Meeting creation may invite the selected lead and optionally create Google Meet. After success, controls yield to confirmation state.

### Follow-up reminders

Private acting-user event titled `Follow up with [Lead Name]`; no attendee and no conferencing. Update reuses the provider event ID. Complete/clear attempts deletion. Provider failure returns explicit partial success without undoing LR persistence.

## Conversation intelligence path

```text
capture/upload
  → transcript/source artifact
  → processing status/stage
  → summary and evidence
  → briefing/themes/needs/objections/messaging/competitors
  → canonical scoped read model
  → API/server component
  → lead and dashboard UI
```

When data appears empty, compare each boundary. Do not jump directly to reprocessing: rich data may still exist but be filtered, mis-scoped, mismatched, aggregated incorrectly, hidden by response regression, or replaced by a fallback.

## Import, campaigns, and workflows

- Import uses staged parsing/mapping/enrichment/approval/publish concepts; published canonical records must retain ownership and source identity.
- One-to-one Gmail is not campaign sending.
- Campaign agents/signals, templates, and documents support broader engagement.
- Workflows include triggers/actions and more complex waits/approvals/provider steps. Retries must respect idempotency and authorization at execution time.

## External services and environment configuration

Configuration is environment-driven. Document names and required/optional status, never values. Relevant categories include:

- Supabase URL/anon/service-role and database connectivity;
- application/public origin and Expo deep-link/callback configuration;
- Google OAuth client/secret/callback and credential-encryption keys;
- AI provider credentials/models;
- object storage/R2/AWS configuration;
- transactional email/SendGrid configuration;
- CRM/enrichment/automation provider credentials;
- Vercel/deployment and feature-flag configuration.

Never put access/refresh tokens, authorization codes, cookies, secrets, DSNs containing credentials, or raw provider errors in docs/logs/client payloads.

## Reliability and idempotency

- Stable client mutation IDs protect mobile retries.
- Provider operations use operation/idempotency state so response loss does not create duplicate external actions.
- Partial-success contracts distinguish canonical persistence from optional provider synchronization.
- Processing states distinguish pending/in-progress/succeeded/failed/stale and support controlled reconciliation.
- Error responses expose safe categories and retry/reconnect guidance, not credential/provider internals.

## Caching and asynchronous work

Next.js/server caching and deployment state can make read-path diagnosis non-obvious. Conversation processing, enrichment, uploads, workflow waits, and provider calls can be asynchronous. Always identify whether a value is source data, derived data, cached aggregation, or a pending side effect.

## Testing architecture

- Web tests cover domain/core services, routes/contracts, authorization, UI behavior, migrations/RLS, provider payloads, and incident regressions.
- Mobile tests cover auth/context, local DB/outbox/sync, integration clients, screens, and device flows.
- Some suites use fake DB/provider implementations or source inspection. These are not substitutes for live RLS, browser middleware, provider APIs, or device deep links.
- Validation should be non-watch: targeted tests, related suites, typecheck, required production build, `git diff --check`, status.

## Deployment and migration safety

- Vercel build metadata confirms the production web revision, not database parity or live provider correctness.
- Migration files through `0096` exist locally; applied production state is unknown.
- Read remote migration status before schema-dependent work.
- Do not alter applied migrations, hand-edit generated types, or mutate production to test a theory.
- Next.js currently warns that `middleware.ts` convention is deprecated; any proxy migration requires exact public/protected route parity tests.

## High-risk change zones

1. middleware/OAuth callbacks and browser handoff;
2. service-role tenant scoping and RLS;
3. historical/current role normalization;
4. mobile cache ownership and retry identity;
5. provider sends/meetings/follow-ups under response loss;
6. conversation state transitions and fallback reads;
7. import approval/publish synchronization;
8. workflow waits, approvals, and provider actions;
9. license/seat/event-access aggregation;
10. dashboard aggregation and caching.

## Related context

- [Master project context](./MASTER_PROJECT_CONTEXT.md)
- [Decision and incident history](./DECISION_AND_INCIDENT_HISTORY.md)
- [Agent operating rules](./AGENT_OPERATING_RULES.md)
- [Context source index](./CONTEXT_SOURCE_INDEX.md)

