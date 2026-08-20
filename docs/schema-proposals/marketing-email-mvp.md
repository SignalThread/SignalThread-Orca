# Email Marketing MVP Schema Proposal

Proposal only. Do not change Prisma from this document. Do not create migrations or routes. Do not implement.

This document locks the Email Marketing MVP schema plan for schema review before implementation. The MVP is an event-scoped, SendGrid-backed, immediate-send-only email marketing module driven by imported registration-style audience lists, with manual registration/revenue KPI snapshots until a real attendee/registration source of truth exists.

The companion integration plan lives in `docs/marketing-sendgrid-integration.md`. This document covers schema only; that document covers the SendGrid provider, send pipeline, and webhook contract.

## 1. Executive Recommendation

Build the Email Marketing MVP as a dedicated, event-scoped module under `/events/:eventId/marketing` with nine Marketing-owned relational models and six locked enums. Sends go out immediately through a real SendGrid provider that extends the existing `EmailProvider` swap point. Audiences are imported lists, not canonical attendees. Each send freezes its own recipient snapshot. SendGrid webhook events append immutable event rows and update denormalized counters. Registration and revenue are recorded manually through KPI snapshots.

The MVP explicitly excludes automatic scheduled-send execution. `scheduledSendAt` is persisted as planning data only. Automatic dispatch is Phase 1.5 after the immediate-send pipeline is proven.

## 2. Source-Of-Truth Boundary

Marketing owns only marketing-layer state:
- Marketing plan summary and goals per event.
- Email campaigns.
- Email sends and their immediate-send lifecycle.
- Imported audiences and audience recipients.
- Frozen per-send recipient snapshots.
- SendGrid delivery/engagement events and derived counters.
- Email suppression (bounce/unsubscribe/spam) per event.
- Manual registration/revenue KPI snapshots.

Marketing does **not** own and must never become the authority for:
- Canonical attendee/registration records. No real registration source exists yet; the future Attendees/Registration module is out of scope and is not designed here.
- Global `EventIntegrationMetric`. It remains the integration-sync surface for the global command-center dashboard. Marketing KPIs must not be written into it.
- `SpeakerEmailLog`. It remains the speaker-reminder log. Campaign emails must not be written into it.
- In-app `Notification`. It remains the in-app notification surface. Outbound marketing email must not be modeled as notifications.
- Cross-event/global marketing reporting rollups. MVP is single-event scoped.

Hard non-reuse rules:
- Do not reuse `EventIntegrationMetric` for campaign-level marketing KPIs.
- Do not reuse `SpeakerEmailLog` for campaign emails.
- Do not reuse `Notification` for outbound email.
- Do not treat live `MarketingAudienceRecipient` rows as the send record after a send. The frozen `MarketingEmailSendRecipient` snapshot is the authoritative record of who was actually sent to.

## 3. Canonical Schema Issue — Acknowledge Before Implementation

The prior audits found two Prisma schema copies that have diverged:
- `web/prisma/schema.prisma` appears to be the active app schema (driven by `web/prisma.config.ts`, holds the most recent Phase 2A tasking models, and is what the Next.js app generates against).
- Root `prisma/schema.prisma` appears stale (missing the Phase 2A `Task*` models present in the web schema).
- Schema guardrails (`docs/SCHEMA_GUARDRAILS.md`) require both schema copies to stay in sync when a change is intentionally reviewed.

This proposal explicitly states:
- Implementation should use **`web/prisma/schema.prisma`** as the source of truth unless maintainers decide otherwise.
- The migration PR must either update **both** schema copies in the same change, or first perform a separate schema-sync cleanup so the copies match before Marketing models are added.
- **Do not proceed with any Prisma or migration work until this canonical-schema question is acknowledged by maintainers.**

## 4. Proposed Models

All models are event-scoped, use UUID primary keys, reference UUID foreign keys, and avoid JSON blobs for core KPI, recipient, and event data. Implementation should add normal Prisma relations to `Event`, `User`, and the parent Marketing models in the active schema style. Monetary values follow the existing repo convention of integer minor units (cents), consistent with `Budget` line items.

```prisma
model MarketingPlan {
  id          String   @id @default(uuid()) @db.Uuid
  eventId     String   @db.Uuid
  ownerUserId String?  @db.Uuid
  summary     String?  @db.Text
  goals       String?  @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([eventId])
  @@index([ownerUserId])
}

model MarketingCampaign {
  id              String                  @id @default(uuid()) @db.Uuid
  eventId         String                  @db.Uuid
  marketingPlanId String?                 @db.Uuid
  name            String                  @db.Text
  description     String?                 @db.Text
  ownerUserId     String?                 @db.Uuid
  status          MarketingCampaignStatus @default(DRAFT)
  audienceLabel   String?                 @db.Text
  startDate       DateTime?
  endDate         DateTime?
  createdAt       DateTime                @default(now())
  updatedAt       DateTime                @updatedAt

  @@index([eventId, status])
  @@index([eventId, updatedAt])
  @@index([ownerUserId])
  @@index([marketingPlanId])
}

model MarketingAudience {
  id             String   @id @default(uuid()) @db.Uuid
  eventId        String   @db.Uuid
  name           String   @db.Text
  sourceLabel    String?  @db.Text
  recipientCount Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([eventId])
  @@index([eventId, updatedAt])
}

model MarketingAudienceRecipient {
  id               String   @id @default(uuid()) @db.Uuid
  eventId          String   @db.Uuid
  audienceId       String   @db.Uuid
  email            String   @db.Text
  normalizedEmail  String   @db.Text
  firstName        String?  @db.Text
  lastName         String?  @db.Text
  company          String?  @db.Text
  title            String?  @db.Text
  registrationType String?  @db.Text
  status           String?  @db.Text
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([audienceId, normalizedEmail])
  @@index([eventId])
  @@index([audienceId])
}

model MarketingEmailSend {
  id                String                   @id @default(uuid()) @db.Uuid
  eventId           String                   @db.Uuid
  campaignId        String                   @db.Uuid
  audienceId        String?                  @db.Uuid
  ownerUserId       String?                  @db.Uuid
  subject           String                   @db.Text
  previewText       String?                  @db.Text
  bodyHtml          String?                  @db.Text
  bodyText          String?                  @db.Text
  fromEmail         String                   @db.Text
  replyTo           String?                  @db.Text
  registrationUrl   String?                  @db.Text
  utmUrl            String?                  @db.Text
  status            MarketingEmailSendStatus @default(DRAFT)
  scheduledSendAt   DateTime?
  actualSentAt      DateTime?
  sendgridBatchId   String?                  @db.Text
  recipientCount    Int                      @default(0)
  deliveredCount    Int                      @default(0)
  openCount         Int                      @default(0)
  clickCount        Int                      @default(0)
  bounceCount       Int                      @default(0)
  unsubscribeCount  Int                      @default(0)
  createdAt         DateTime                 @default(now())
  updatedAt         DateTime                 @updatedAt

  @@index([campaignId])
  @@index([eventId, status])
  @@index([eventId, scheduledSendAt])
  @@index([audienceId])
  @@index([ownerUserId])
}

model MarketingEmailSendRecipient {
  id                     String                        @id @default(uuid()) @db.Uuid
  eventId                String                        @db.Uuid
  emailSendId            String                        @db.Uuid
  sourceAudienceRecipientId String?                    @db.Uuid
  email                  String                        @db.Text
  normalizedEmail        String                        @db.Text
  firstName              String?                       @db.Text
  lastName               String?                       @db.Text
  company                String?                       @db.Text
  title                  String?                       @db.Text
  registrationType       String?                       @db.Text
  providerStatus         MarketingEmailRecipientStatus @default(PENDING)
  sendgridMessageId      String?                       @db.Text
  processedAt            DateTime?
  deliveredAt            DateTime?
  openedAt               DateTime?
  clickedAt              DateTime?
  bouncedAt              DateTime?
  unsubscribedAt         DateTime?
  createdAt              DateTime                      @default(now())
  updatedAt              DateTime                      @updatedAt

  @@unique([emailSendId, normalizedEmail])
  @@index([eventId, emailSendId])
  @@index([sendgridMessageId])
  @@index([sourceAudienceRecipientId])
}

model MarketingEmailEvent {
  id                  String                  @id @default(uuid()) @db.Uuid
  eventId             String                  @db.Uuid
  emailSendId         String                  @db.Uuid
  emailSendRecipientId String                 @db.Uuid
  type                MarketingEmailEventType
  sgEventId           String                  @db.Text
  occurredAt          DateTime
  reason              String?                 @db.Text
  url                 String?                 @db.Text
  createdAt           DateTime                @default(now())

  @@unique([sgEventId])
  @@index([emailSendRecipientId, occurredAt])
  @@index([eventId, occurredAt])
  @@index([emailSendId, type])
}

model MarketingSuppression {
  id              String                     @id @default(uuid()) @db.Uuid
  eventId         String                     @db.Uuid
  email           String                     @db.Text
  normalizedEmail String                     @db.Text
  reason          MarketingSuppressionReason
  source          MarketingSuppressionSource
  createdAt       DateTime                   @default(now())

  @@unique([eventId, normalizedEmail])
  @@index([eventId, reason])
}

model MarketingKpiSnapshot {
  id                String   @id @default(uuid()) @db.Uuid
  eventId           String   @db.Uuid
  campaignId        String?  @db.Uuid
  emailSendId       String?  @db.Uuid
  capturedByUserId  String?  @db.Uuid
  capturedAt        DateTime
  registrationCount Int?
  revenueAmountCents Int?
  goalValue         Int?
  note              String?  @db.Text
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([eventId, capturedAt])
  @@index([campaignId, capturedAt])
  @@index([emailSendId, capturedAt])
}
```

Field notes:
- `normalizedEmail` is a lowercased/trimmed canonical form used for dedupe and suppression matching; `email` preserves the imported display form.
- `bodyHtml`/`bodyText` are explicit columns rather than a JSON content blob. The MVP uses inline `bodyHtml`/`bodyText` for send content. If maintainers later prefer a SendGrid dynamic-template reference, that is a future change and must still avoid storing core content as a JSON blob.
- Counters on `MarketingEmailSend` are denormalized for fast list/detail rendering and must be derived from and reconcilable against `MarketingEmailEvent` and `MarketingEmailSendRecipient`.
- `revenueAmountCents` follows the repo's integer-minor-unit money convention for revenue KPI values.

## 5. Proposed Enums

Define and lock the following. `SCHEDULED` is a planning state only in MVP and never triggers automatic execution.

```prisma
enum MarketingCampaignStatus {
  DRAFT
  ACTIVE
  PAUSED
  COMPLETED
  ARCHIVED
}

enum MarketingEmailSendStatus {
  DRAFT
  READY
  SCHEDULED
  SENDING
  SENT
  PARTIALLY_SENT
  FAILED
  CANCELED
}

enum MarketingEmailRecipientStatus {
  PENDING
  SENT
  DELIVERED
  OPENED
  CLICKED
  BOUNCED
  DROPPED
  SPAM_REPORTED
  UNSUBSCRIBED
  FAILED
  SUPPRESSED
}

enum MarketingEmailEventType {
  PROCESSED
  DELIVERED
  OPEN
  CLICK
  BOUNCE
  DROPPED
  SPAMREPORT
  UNSUBSCRIBE
  GROUP_UNSUBSCRIBE
  DEFERRED
}

enum MarketingSuppressionReason {
  BOUNCE
  DROPPED
  SPAM_REPORT
  UNSUBSCRIBE
  GROUP_UNSUBSCRIBE
  MANUAL
}

enum MarketingSuppressionSource {
  SENDGRID_WEBHOOK
  MANUAL
  IMPORT
}
```

Locked decisions:
- `MarketingEmailSendStatus.SCHEDULED` is planning state only in MVP. No worker, cron, or dispatch job acts on it. Automatic execution is deferred to Phase 1.5.
- `MarketingEmailEventType` maps directly to SendGrid event names so webhook ingestion is a deterministic mapping with no interpretation.
- `MarketingEmailRecipientStatus` is the per-recipient lifecycle state derived from the latest meaningful event; it is denormalized for UI and must remain reconcilable with `MarketingEmailEvent`.

## 6. Send Flow Schema Behavior

- The selected `MarketingAudience` is snapshotted into `MarketingEmailSendRecipient` rows at send time. The snapshot copies email, normalizedEmail, and the basic profile fields so later audience edits cannot rewrite what was sent.
- Suppressed recipients (matching `MarketingSuppression` for the event by `normalizedEmail`) are excluded **before** the snapshot is created, so suppressed addresses never enter the send set.
- Audience edits, re-imports, or deletions after a send do not change that send's recipients. `sourceAudienceRecipientId` is a soft provenance pointer, not a live dependency.
- SendGrid webhook events append immutable `MarketingEmailEvent` rows (idempotent on `sgEventId`) and update the matching `MarketingEmailSendRecipient` status/timestamps and the parent `MarketingEmailSend` denormalized counters.
- Registration count and revenue remain manual via `MarketingKpiSnapshot`. No automatic registration attribution exists in MVP because there is no canonical registration source.

## 7. Access Control

All Marketing services must:
- Accept authenticated `user` context plus `eventId`.
- Call `assertEventAccessForUser(eventId, user, accessType)` from `lib/event-access.ts` before any DB work.
- Use `"read"` access for reads and `"write"` access for mutations.
- Keep `EVENT_VIEWER` read-only — viewers can list/read marketing data but cannot create, import, mutate, send, or capture KPIs.
- Filter every query by `eventId` and never trust client-supplied scope.
- Resolve child objects (campaign, audience, send, recipient) through the parent and confirm event ownership before mutation.

The SendGrid webhook route is the one exception to event-scoped session auth: it has no user session and is authenticated by SendGrid signature verification instead (see `docs/marketing-sendgrid-integration.md`). It still resolves `eventId` from event payload `customArgs` and writes only within that resolved scope.

## 8. Route/Service Expectations

Future implementation (not in this proposal) should use:
- A canonical service module `web/src/server/services/marketing.ts` that owns all business logic, validation, and access checks.
- Thin routes under `web/app/api/events/[eventId]/marketing/*` that parse input, call the service, and map typed `MarketingServiceError` to HTTP — mirroring the tasks/speakers route pattern (`requireRouteUser`/`resolveRequestUser`, `withApiRequestLogging`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`).
- An app-level SendGrid webhook route (not event-scoped) because SendGrid posts events globally; it resolves `eventId` from `customArgs`.

Expected route families:
- Plan: read, update.
- Campaigns: list, create, read, update, delete.
- Audiences: list, create, import, read, delete.
- Email sends: list, create, read, update, delete.
- Immediate send: send action.
- KPI snapshots: list, create.
- SendGrid webhook: ingestion (app-level).

No business logic in routes. Audience import mirrors the existing speaker import (client parses CSV/XLSX with the already-present `xlsx` dependency and POSTs mapped JSON `rows`; the service validates, normalizes, dedupes by `normalizedEmail`, and reports a summary).

## 9. Migration Plan

Additive-only migration, consistent with the enforced additive-migration guardrail:
- Create the six enums.
- Create the nine tables.
- Add foreign keys to `Event`, `User`, and parent Marketing models.
- Add the indexes and unique constraints defined above.
- Update **both** Prisma schema copies (or perform the schema-sync cleanup first — see Section 3).
- Create the migration under `web/prisma/migrations` using the `YYYYMMDDHHMMSS_add_marketing_email_mvp` convention.
- Run `prisma generate` and commit the generated client.
- Test the migration against an existing database that has no marketing data.

Backfill:
- None required. All tables are new and start empty.

Rollback / remediation:
- Drop the new tables in reverse dependency order (events → send-recipients → sends → audience-recipients → audiences → suppression → KPI snapshots → campaigns → plan), then drop the new enums.
- No existing data is mutated, so rollback is a clean drop with no remediation of pre-existing rows.

## 10. Test Plan

Access:
- Read access required and enforced for all reads.
- Write access required for all mutations.
- `EVENT_VIEWER` cannot create/import/mutate/send/capture; viewer writes are rejected.
- Cross-event reads and writes are rejected.

Audience import:
- Invalid email rows rejected; valid rows imported.
- Dedupe by `normalizedEmail` within an audience (case/whitespace-insensitive).
- Import summary reports imported/skipped/invalid counts.

Suppression:
- Suppressed emails are filtered out before snapshot/send.
- Newly suppressed addresses are honored on the next snapshot/send.

Recipient snapshot:
- Snapshot freezes recipient fields at send time.
- Editing or deleting audience recipients after send does not change the frozen send recipients.

CRUD:
- Campaign create/read/update/delete with status transitions.
- Email send create/read/update/delete with status transitions.

Immediate send (provider mocked):
- Send creates the frozen snapshot, calls `getEmailProvider()`, and sets status/counters correctly.
- Partial provider success yields `PARTIALLY_SENT`; full failure yields `FAILED`; no fake success.

Webhook:
- Bad/missing signature is rejected.
- Duplicate `sgEventId` is idempotent (no double counting).
- Webhook events update recipient status/timestamps and send counters.

KPI:
- KPI snapshot create and list.

Source-of-truth guardrails:
- No write path touches `EventIntegrationMetric`.
- No write path touches `SpeakerEmailLog`.
- No outbound email is modeled through `Notification`.

Schema/migration guardrails:
- Migration applies cleanly from an existing DB with no marketing data.
- Prisma client generation succeeds.
- Migration is additive only (no `DROP/RENAME/DELETE/TRUNCATE`).
- No JSON blobs for core KPI, recipient, or event data.
- Both schema copies are synced (or sync-cleanup precondition is satisfied).

## 11. MVP Boundary

In MVP:
- Imported registration-style audience list.
- Audience recipients with the basic fields (firstName, lastName, email, company, title, registrationType, status).
- Frozen recipient snapshot per email send.
- Immediate SendGrid send.
- SendGrid webhook delivered/open/click/bounce/unsubscribe metrics.
- Suppression handling (bounce/dropped/spam/unsubscribe/group-unsubscribe).
- Manual registration/revenue KPI snapshots.
- Event-scoped list view and a lightweight calendar view derived from email send dates.

Out of MVP:
- Automatic scheduled-send execution (planning data only in MVP; Phase 1.5).
- Attendees/Registration module and canonical attendee records.
- Automatic registration/revenue attribution.
- Preference center / consent management UI.
- A/B testing.
- Template builder.
- Social, paid, web, partner, sponsor, and PR channels.
- Global/cross-event reporting rollups.

## 12. Risk Review

Biggest product risk: planners assume "scheduled" sends will fire automatically. Mitigate by keeping `SCHEDULED` as explicit planning state with UI copy that says execution is manual in MVP, and by having no job act on `scheduledSendAt`.

Biggest data-integrity risk: sending off live audience rows instead of the frozen snapshot, causing attribution drift. Mitigate with the `MarketingEmailSendRecipient` snapshot as the authoritative send record and tests proving audience edits after send do not change recipients.

Biggest compliance risk: continuing to email bounced/unsubscribed addresses from imported lists. Mitigate with `MarketingSuppression`, pre-snapshot exclusion, and webhook-driven suppression writes.

Biggest migration risk: editing the stale root schema, or shipping the migration without syncing both copies. Mitigate with the Section 3 acknowledgement gate.

Biggest source-of-truth risk: leaking marketing KPIs into `EventIntegrationMetric` or campaign emails into `SpeakerEmailLog`. Mitigate with explicit non-write guardrail tests.

## 13. Schema Review Checklist Before Implementation

Reviewers should approve these before any Prisma or migration work:
- Confirm `web/prisma/schema.prisma` is the implementation target and decide whether root `prisma/schema.prisma` needs parity or a prior sync-cleanup.
- Confirm the nine Marketing models and six enums as listed.
- Confirm `SCHEDULED` is planning-only in MVP with no execution job.
- Confirm inline `bodyHtml`/`bodyText` for MVP send content (no JSON blob).
- Confirm `revenueAmountCents` integer-minor-unit money convention.
- Confirm `MarketingEmailSendRecipient` is the authoritative post-send record, not live audience rows.
- Confirm suppression matching is by `normalizedEmail` and enforced before snapshot/send.
- Confirm webhook idempotency via unique `sgEventId`.
- Confirm access uses `assertEventAccessForUser` with `EVENT_VIEWER` read-only.
- Confirm tests will prove no writes to `EventIntegrationMetric`, `SpeakerEmailLog`, or `Notification`.

## 14. Documentation-Only Compliance

This schema plan is documentation only. This pass changed no Prisma schema, migration, API route, service, or UI file.
