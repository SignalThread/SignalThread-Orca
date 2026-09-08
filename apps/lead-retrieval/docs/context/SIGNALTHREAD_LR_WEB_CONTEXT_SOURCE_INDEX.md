# SignalThread Lead Retrieval — Context Source Index

> **Status date: 2026-08-05 (America/New_York).**
>
> **Source-confidence note:** High confidence that the indexed local sources existed and were inspected during this task. Confidence in each source's claims varies by category below. Production deployment metadata was inspected read-only; production database contents and applied migration history were not comprehensively audited.

## How to use this index

Use sources in this order when they disagree:

1. current executable code and current migrations;
2. current automated tests that exercise behavior;
3. deployment metadata and read-only runtime evidence;
4. recent incident commits and their tests;
5. maintained architecture/product documentation;
6. older summaries, prototypes, seeds, and audit reports.

A source can accurately describe history while being obsolete as a statement of current behavior.

## Repository aliases

| Alias | Absolute path | Authority |
|---|---|---|
| `WEB` | `/Users/ali/Documents/lead retrieval app` | Web UI, server routes, canonical cloud services, cloud schema/migrations, shared mobile-facing APIs |
| `MOBILE` | `/Users/ali/Documents/lead-intel-scan` | Expo application, device UX, local SQLite schema, outbox/sync, mobile tests |
| `CTX` | `/Users/ali/Documents/lead retrieval app/docs/context` | This portable context package |

## High-confidence current code sources

### Web/backend

| Topic | Source path | Why it matters |
|---|---|---|
| Runtime/package scripts | `WEB/package.json` | Framework versions and supported validation commands |
| Global request policy | `WEB/middleware.ts` | Public paths, bearer/session interception, OAuth launch behavior |
| Session and normalized roles | `WEB/lib/auth/session.ts` | Canonical role normalization and session model |
| Company/event access | `WEB/lib/server/company-event-access.ts` | Canonical scoped authorization |
| Exhibitor permissions | `WEB/lib/server/exhibitor-permission-aggregates.ts` | License, membership, access-mode aggregation |
| Mobile OAuth bridge | `WEB/lib/integrations/mobile-oauth/bridge-core.ts` and `WEB/lib/integrations/mobile-oauth/launch-ticket-service.ts` | Ticket issuance, validation, binding, consumption |
| Mobile OAuth create route | `WEB/app/api/mobile/integrations/connections/[provider]/oauth/route.ts` | Authenticated ticket/launch URL contract |
| Browser launch route | `WEB/app/api/mobile/integrations/oauth/launch/route.ts` | Cookie-free ticket handoff to provider OAuth |
| Mobile OAuth callback handoff | Google OAuth callback plus `WEB/lib/integrations/mobile-oauth/` status/launch code | Safe Expo result contract and ticket state |
| Google token management | `WEB/lib/integrations/google/token-manager.ts` | Encrypted user-owned credential acquisition and reconnect semantics |
| Google Calendar client | `WEB/lib/integrations/google/calendar-client.ts` | Calendar API payloads and provider calls |
| Gmail/MIME path | `WEB/lib/integrations/google/gmail-client.ts` and neighboring email service/builder code | Canonical send serialization and provider request path |
| Follow-up domain service | `WEB/lib/follow-ups/lead-follow-up-service.ts` | Create/update/complete/clear and optional reminder sync |
| Conversation read model | `WEB/lib/conversations/conversation-intelligence-read-model.ts` | Canonical rich conversation/intelligence assembly |
| Conversation processing | `WEB/lib/conversations/` | Transcript, summary, status, reconciliation, failure handling |
| Workflow runtime | `WEB/lib/workflows/` | Triggers, steps, waits, approvals, execution |
| Import/publish services | `WEB/lib/imports/` and relevant `app/api/imports/` routes | Ingestion, enrichment, approval, publish |
| Generated cloud types | `WEB/types/database.ts` | Generated view of expected Supabase schema; not deployment proof |

### Mobile

| Topic | Source path | Why it matters |
|---|---|---|
| Runtime/package scripts | `MOBILE/package.json` | Expo/RN versions and tests |
| Router/screens | `MOBILE/app/` | Mobile navigation and user-visible flows |
| Local data layer | `MOBILE/lib/local-db/` | SQLite schema, queries, ownership, cache |
| Sync/outbox | `MOBILE/lib/sync/` | Offline mutations, retry, reconciliation |
| Auth/context | `MOBILE/lib/auth/`, `MOBILE/lib/contexts/` | Session, active company/event, sign-out boundaries |
| Integration contracts | `MOBILE/lib/integrations/` | Provider-neutral Email & Calendar API clients and capabilities |
| Tests | `MOBILE/__tests__/`, `MOBILE/e2e/` | Device/unit and Maestro behavior evidence |

## Schema and migration sources

### Cloud

- `WEB/supabase/migrations/0001_*.sql` through `WEB/supabase/migrations/0096_lead_follow_up_idempotency.sql`.
- Highest-relevance recent migrations:
  - `0091_google_workspace_integrations.sql`
  - `0092_mobile_integration_oauth_tickets.sql`
  - `0093_lead_follow_up_fields.sql`
  - `0094_google_connection_lifecycle.sql`
  - `0095_mobile_oauth_ticket_hardening.sql`
  - `0096_lead_follow_up_idempotency.sql`
- These files prove repository intent only. Applied production state remains unverified.

### Mobile/local and historical Supabase material

- `MOBILE/lib/local-db/` is the authority for current on-device SQLite.
- `MOBILE/supabase/migrations/` contains mobile-era cloud migration history through `0014_lead_voice_notes_lifecycle.sql`; it is not a second independent authority for the current web backend.

## Tests used as behavioral evidence

The investigation sampled tests around:

- OAuth bridge ticket issuance, launch, callback, malformed/expired/consumed/mismatched tickets, and middleware exclusion;
- Google credential lifecycle, disconnect best effort, reconnect-required mapping, and provider-call suppression;
- Gmail MIME preservation and retry/idempotency;
- meeting availability, date/time controls, and success state;
- follow-up create/update/complete/clear, reminder sync, partial provider failure, authorization, timezone date derivation, and idempotency;
- company/event/role/license authorization;
- conversation read model, readiness, processing health, lifecycle intelligence, and dashboard aggregation;
- mobile authentication, SQLite/outbox/offline capture, provider settings, email/meeting/follow-up clients, and Maestro flows.

Test confidence caveat: some suites assert source contracts or use fake database/provider implementations. See [Context gaps and verification](./CONTEXT_GAPS_AND_VERIFICATION.md).

## Documentation sources

| Source | Confidence/use |
|---|---|
| `WEB/README.md` | Useful setup overview; role examples are stale |
| `WEB/docs/PROJECT_SUMMARY_APP.md` | Broad product/workflow history; offline assertions are stale |
| `WEB/docs/Admin_Project_Summary.md` | Historical admin/product narrative; verify against code |
| `WEB/docs/APP_SCHEMA.md` | Helpful conceptual model; not current deployment proof |
| `WEB/docs/` architecture, security, workflow, integration, and audit documents | Valuable intent/history; dates and implementation status vary |
| `MOBILE/README.md` | Current entry point, but validate detailed architecture in code |
| `MOBILE/docs/APP_ARCHITECTURE.md` | Strong historical map last verified 2026-03-07; now incomplete |
| `MOBILE/docs/` auth, test, sync, and workflow notes | Useful subsystem history; current code wins |

## Git history sources

### Web/backend milestones

| Commit | Meaning |
|---|---|
| `0a64fe2` | Lifecycle workspace/event navigation replacement |
| `e19db84` | Google Workspace foundation |
| `026c235` | Provider-neutral secure mobile OAuth bridge |
| `0718e71` | Canonical follow-up and private Calendar reminder service |
| `304bf2e` | Gmail retry reliability and MIME/body preservation work |
| `a934450` | Disconnect/reconnect-required production credential semantics |
| `e4f422c` | Restored canonical rich conversation intelligence read path |
| `9424f11` | Fixed mobile OAuth browser handoff/public launch route |

### Mobile milestones

| Commit | Meaning |
|---|---|
| `fa40c6a` | Mobile lead/capture era baseline referenced in history |
| `4f6460c` | Mobile Email & Calendar integration work |
| `abf3ad3` | Mobile OAuth bridge integration |
| `7ad37f1` | Browser-handoff regression coverage/current mobile HEAD |

Use `git show --stat <commit>` and `git log -- <path>` for exact scope; summaries above are navigation aids, not substitutes for diffs.

## Deployment and runtime evidence

Read-only inspection on 2026-08-05 established:

- public production host `https://lr.signalthread.ai`;
- Vercel project source `akamyab12/LR_Admin`;
- production branch `main`;
- deployed commit `9424f11`;
- successful build producing 208 routes/pages.

This does not prove:

- every migration is applied;
- every authenticated page is healthy;
- every provider credential is usable;
- every mobile binary contains the matching client commit.

## Commercial evidence sources

The repositories contain product narratives, license/seat models, demos, seeded examples, dashboard/audit documents, and implementation plans. They do **not** contain an approved price book, signed customer evidence, independently verified ROI outcomes, or a definitive go-to-market plan. The commercial context file therefore separates defensible positioning from hypotheses and unknowns.

## User-provided durable decisions

The recent task history provided direct constraints that are more current than older docs:

- preserve OAuth/scopes/token/credential/provider architecture unless explicitly in scope;
- canonical-path fixes only;
- no duplicate composer/send/follow-up/task systems;
- private follow-up reminders never invite leads or create Meet;
- follow-up persistence survives Calendar failure with explicit partial success;
- no native date/time/datetime/select controls in meeting/follow-up UI;
- mobile OAuth launch uses a signed single-use ticket and no browser bearer;
- invalid Google credentials map to `reconnect_required` and suppress provider calls;
- diagnose production data before reprocessing;
- use non-watch validation; no commit/push unless requested.

## Package file map

- [Master project context](./MASTER_PROJECT_CONTEXT.md)
- [Product and commercial context](./PRODUCT_AND_COMMERCIAL_CONTEXT.md)
- [System architecture and data](./SYSTEM_ARCHITECTURE_AND_DATA.md)
- [Decision and incident history](./DECISION_AND_INCIDENT_HISTORY.md)
- [Current state and next work](./CURRENT_STATE_AND_NEXT_WORK.md)
- [Agent operating rules](./AGENT_OPERATING_RULES.md)
- [Context gaps and verification](./CONTEXT_GAPS_AND_VERIFICATION.md)
