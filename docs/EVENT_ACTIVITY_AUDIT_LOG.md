# Event Activity Audit Log

`EventActivity` is the **canonical, event-scoped audit feed** for Planner OS. Every
important mutation inside an event writes one entry through a single server-only
service. The schema is **controlled, not locked**: intentional, migration-safe,
reviewed, tested schema changes are allowed.

## Canonical service

`web/src/server/services/event-activity.ts` is the only supported way to write
activity.

- `recordEventActivity(db, input)` — accepts a Prisma **transaction client** so the
  business mutation and the audit entry commit or roll back together. It never
  swallows failures. Audit data is built on the server; client-supplied event IDs,
  actor IDs, messages, and diffs are never trusted.
- `listEventActivity({ eventId, user, filters })` — event-scoped, newest-first
  (`createdAt DESC, id DESC`), keyset pagination via an opaque `createdAt|id` cursor.
- `listEventActivityActors({ eventId, user })` — user-filter options derived only
  from actors present in the current event.

### Actor kinds

`actorKind` is one of `USER`, `SYSTEM`, `INTEGRATION`, `PORTAL`. Only `USER` actors
carry an `actorUserId`. `actorLabel` is a historical snapshot so entries stay
readable after a user is renamed or deleted. The same snapshot rule applies to
`entityLabel`.

### Taxonomy

- `module` — `ROADMAP`, `BUDGET`, `RUN_OF_SHOW`, `DOCUMENTS`, `EVENT_DIRECTORY`,
  `MARKETING`, `EVENT_SETTINGS`, `SPEAKERS`, `INTEGRATIONS`, `REPORTS`. Seating is
  recorded under `RUN_OF_SHOW`.
- `actionType` — a reusable verb (`CREATED`, `UPDATED`, `DELETED`, `ASSIGNED`,
  `UNASSIGNED`, `IMPORTED`, `SUBMITTED`, `APPROVED`, `REJECTED`, `REOPENED`,
  `STATUS_CHANGED`, `LINKED`, `UNLINKED`, `MERGED`, `UPLOADED`, `SENT`, `SCHEDULED`,
  `RESCHEDULED`, `CANCELED`, `RETRIED`, `SYNCED`, `GENERATED`).

### Change diffs

`changes` is a nullable JSON array of whitelisted, primitive-valued field diffs
(`{ field, label?, from, to }`). The service drops non-primitive values and a
sensitive-field denylist (token, password, secret, storage/signed keys, body,
payload, note, credential). It never stores full record dumps, email bodies,
storage keys, tokens, or provider payloads.

### Deduplication

Optional `sourceRecordType` + `sourceRecordId` provide **event-scoped idempotent
dedup** via `@@unique([eventId, sourceRecordType, sourceRecordId])`. Rows without
source identity (NULLs) never collide. Lifecycle transitions on one domain record
use action-specific source keys (e.g. `BudgetSubmission:submitted` vs
`:decision`) so distinct events stay distinct.

## Read API

`GET /api/events/[eventId]/activity` — authenticated, `assertEventAccessForUser`
read-gated, event-scoped. Returns `{ entries, nextCursor, actors }`. Supported
query params: `from`, `to` (UTC boundaries), `user`, `module`, `action`, `search`
(message/entityLabel/actorLabel), `limit` (default 20, max 100), `cursor`.

There is **no** Activity POST/PATCH/PUT/DELETE endpoint. The feed is read-only.

## UI

`web/app/(shell)/events/[eventId]/activity/` renders a responsive audit log with
date/user/module/action/text filters, previous/next cursor pagination (20/page),
expandable old→new change details, actor-kind badges, machine-readable timestamps,
and empty/filtered-empty/loading/error/unauthorized states. No edit or delete
controls exist.

## Domain history models (NOT competing feeds)

These remain their own workflow sources of truth and are **never unioned into the
Activity page** at read time:

`BudgetActivity`, `BudgetVersion`, `BudgetApproval`, `BudgetSubmission`,
`DocumentVersion`, `DocumentApproval`, `DocumentApprovalRecipient`, `TaskActivity`,
`SpeakerEmailLog`/speaker history tables, `MarketingEmailEvent` (recipient-level
telemetry), `CopilotAuditLog`, `FnbParserFeedback`, and directory
import/provenance records.

Recipient-level Marketing telemetry (opens, clicks, webhooks, per-recipient
bounces) is deliberately excluded from the event feed.

## Transaction expectations

Instrumented mutations write the audit entry inside the same transaction as the
business mutation wherever technically possible (all single-write paths do). A few
multi-service flows (Marketing send lifecycle, Run of Show session edits that touch
several services) record a non-swallowed audit entry immediately after the mutation
because a single transaction is not feasible across those service boundaries.

## Room Set limitation

Room Set layout data lives in browser `localStorage`, so layout changes cannot
produce trustworthy server-side audit records and are **not** logged. Server-backed
**Seating** (plans, tables, assignments) is audited under `RUN_OF_SHOW`.

## Event deletion retention (V1)

Individual activity entries are never editable or deletable. Full event deletion may
remove that event's `EventActivity` rows along with the event (existing cascade
behavior). Long-term compliance retention beyond event deletion is a separate,
future architecture decision.

## Backfill

`web/scripts/backfill-event-activity.ts` idempotently backfills reliable historical
activity — legacy `EventActivity` rows (enriched in place), `BudgetActivity`,
`DocumentVersion`, `DocumentApproval`, and Event Directory import batches — with
preserved timestamps and source keys. It never invents actors or diffs.

```
npx tsx scripts/backfill-event-activity.ts            # dry run (counts only)
npx tsx scripts/backfill-event-activity.ts --commit   # write entries
npx tsx scripts/backfill-event-activity.ts --commit --before=<cutover ISO>
```

Pass `--before` (cutover timestamp) so the backfill never double-logs records the
live writers already recorded.

## Schema note

`module` and `actionType` remain **nullable**. Final non-null contract constraints
are intentionally deferred: legacy pre-cutover rows may not be backfilled in every
deployment, and the plan prefers leaving compatibility fields in place over an
unnecessary destructive migration. The legacy `type` column is retained.
