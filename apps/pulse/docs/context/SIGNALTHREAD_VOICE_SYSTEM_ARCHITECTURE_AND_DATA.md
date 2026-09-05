# SignalThread system architecture and data

> Source-confidence note — 2026-08-05: High confidence for the checked-out repository at `c513932`, except deployment topology, production database state, external RLS/firewall configuration, and runtime scale, which were not inspected. Environment variables are listed by name only.

## Repository and runtime map

This is one Next.js 14 App Router repository with a separate static help-docs project.

| Path | Ownership |
| --- | --- |
| `app/` | Pages, layouts, public kiosk, authenticated app/admin surfaces, API route handlers |
| `components/` | Product UI grouped by admin, Events, kiosk, onboarding, theme, and shared primitives |
| `lib/` | Domain contracts/services, auth policies, analytics, AI/storage clients, templates |
| `prisma/schema.prisma` | Relational model and enums |
| `prisma/migrations/` | 36 timestamped SQL migrations on this checkout |
| `scripts/` | Seeds, backfills, profiling, help-doc build |
| `e2e/` | Playwright SMB and Events journeys |
| `docs/` | Architecture, help, audits, product loops, and historical handoffs |
| `docs-site/` | Astro source compiled into static help content during the root build |

Core stack: TypeScript, React 18, Next.js 14, Tailwind, Prisma 5/PostgreSQL, Supabase Auth, AWS SDK S3 protocol, OpenAI, Stripe, Resend, Google TTS, Vitest, and Playwright (`package.json`). Routes run in the Node.js runtime where explicitly declared.

## Surfaces and service boundaries

- `/kiosk` and public response/answer APIs: anonymous respondent runtime.
- `/app`: authenticated account experience. Product mode is resolved from account context.
- `/app/events/[eventId]`: Events workspace; `/dashboard` hosts lifecycle intelligence.
- `/admin`: platform operator UI guarded as `SUPER_ADMIN`.
- `/api/app/*`: current authenticated account-scoped APIs.
- `/api/admin/*`: platform administration.
- `/api/events/*` and `/admin/events/*`: legacy/public/admin review surfaces. They are not the canonical foundation for new Events work (`docs/event-mode/LEGACY_EVENT_ROUTES.md`).
- `/help`: built static help content via `scripts/build-help-docs.mjs` and `next.config.js` rewrites.

Routes are generally thin adapters around `lib` services in newer Events work. Older routes still contain direct Prisma and ad-hoc validation, so there is no single uniform API framework.

## Authentication, RBAC, and tenant scope

Supabase supplies authenticated identity and session cookies (`lib/supabase/*`). Prisma `User.id` is linked to the Supabase user ID (`lib/auth/link-user-identity.ts`). OTP completion and callback routes establish/link identity.

Canonical policies:

- `lib/auth/require-account-membership.ts` loads the account by slug, authenticates via Supabase, checks active Prisma membership, denies cross-account membership, and optionally permits a super-admin.
- `lib/auth/require-events-event-access.ts` builds on membership and verifies Events product mode plus event ownership.
- `lib/auth/require-account-admin.ts` and `lib/auth/account-admin-policy.ts` govern administrative mutations.
- `lib/auth/require-super-admin.ts` gates platform pages/APIs using `User.role === SUPER_ADMIN`; `SUPER_ADMIN_EMAILS` is a secondary allowlist in some account-scoped policies.

`UserRole` is the current identity role enum (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `VIEWER`). `Admin`/`AdminRole` remain legacy. Product mode is not a role: only `Account.accountType === EVENTS` enables Events-specific behavior; all other values are retail-safe (`lib/account-product-mode.ts`).

Tenant isolation is application-layer: Account → Location → Event ownership predicates and composite relations. No RLS policies appear in repository migrations. Production-side RLS, if any, is unverified.

## Canonical data model

### Shared hierarchy

`Account` → `Location` → `Event` → `Survey` → `Question`; each reusable `Survey`
may have many target assignments represented by target-scoped
`PublicSurveyLink` rows to `SurveyTarget`. A launch resolves
`PublicSurveyLink` → `Survey` + `SurveyTarget` → `Response` → `Answer` →
`AnswerTranscript`/`AnswerAnalysis`/`AnswerProcessingLog`.

Important compatibility details:

- `Event.questionsJson` remains, but normalized `Question` is current for surveys; helpers such as `lib/question-read.ts` reconcile sources.
- `Survey.surveyTargetId` remains a nullable legacy/primary authoring pointer. It is not assignment ownership and must never be used to limit a Survey to one target. Assignment truth is the target-scoped link; `Response.surveyId`, `Response.surveyTargetId`, and `Response.publicSurveyLinkId` preserve the exact launch context.
- One Survey and its Questions may be reused by many sessions, speakers, event areas, and other compatible targets. Replacing or removing one target assignment must not affect any other target assignment. Session names and session-speaker rosters are resolved dynamically from the current agenda through the launch target.
- `Account.settingsJson`, `Location.settingsJson`, and several metadata columns are JSON contracts validated in application code.
- The old `Session` → `Transcript`/`Analysis`/`ProcessingLog` stack still exists. Current capture uses `Response`/`Answer`; do not conflate the two.

### Events-specific structure

- `EventStructureItem`: event, session, area, sponsor activation, or custom touchpoint. `kind=SESSION` is the agenda authority.
- `EventSpeakerProfile`: account-scoped speaker identity.
- `EventSessionSpeakerAssignment`: composite account/event/session/speaker participation boundary.
- `EventAgendaImportJob` and `EventAgendaImportRow`: durable, reviewable import drafts/results; confirmation is designed as an all-or-nothing transaction.
- `AnswerEventIntelligence`, themes, entities, and actions: normalized per-answer Events output.
- `EventIntelligenceAggregate`, `EventIssueCluster`, evidence, notes, history, updates, deliveries, and attempts: read models and operator workflow.

### Lifecycle distinction

Stored `Event.status`, date-derived lifecycle phase, `Survey` lifecycle, availability window, public-link state, and action status are distinct concepts. Repeated bugs came from treating one as the other. Use helpers such as `lib/events-home-groups.ts`, `lib/event-workspace-lifecycle.ts`, `lib/event-voice-surveys.ts`, and `lib/survey-availability.ts`.

## Migrations

Migrations begin with the January 2026 initial/correction series and then add SaaS hierarchy, users, billing/trials, insight drilldown, questions/audio, mixed responses, Events surveys/intelligence/actions, structure/agenda/speakers/imports, availability, and idempotency/listening windows. The latest checked-in migration is `prisma/migrations/20260803193000_add_event_listening_window/migration.sql`.

The existence of SQL files does not prove they are applied in any environment. No live migration-status command was run for this documentation task. Some code contains compatibility selects for missing columns, evidence that migration skew has occurred (`app/api/admin/accounts/route.ts`).

## External integrations

| Integration | Use | Main code |
| --- | --- | --- |
| PostgreSQL/Prisma | Canonical application data | `lib/prisma.ts`, `prisma/schema.prisma` |
| Supabase | OTP auth/session and admin invitation operations | `lib/supabase/*`, `lib/provisioning.ts`, `lib/account-users.ts` |
| S3-compatible storage | Audio, question audio, logos, import sources | `lib/objectStorage.ts`, `lib/s3.ts` |
| OpenAI | Whisper transcription and chat analysis; some Events intelligence/review synthesis | `lib/transcription.ts`, `lib/analysis.ts`, `lib/event-intelligence/*` |
| Google TTS | Server-generated question audio | `lib/tts.ts`, `lib/question-audio.ts` |
| Stripe | Checkout, portal, subscription webhooks | `app/api/billing`, `app/api/app/account/billing`, `app/api/webhooks/stripe` |
| Resend | Invitations and Events action assignment email | `lib/provisioning.ts`, `lib/event-actions/assignment-email.ts` |
| Google Analytics | Optional client analytics | `app/components/GoogleAnalytics.tsx` |

## State, caching, and offline behavior

Client state is local React state/context plus URL query parameters. Theme and tour preference use browser storage; account context is loaded through `lib/account-context-client.ts`. New Events dashboard loading uses coalesced requests and selective polling/helpers, but there is no general data-cache framework.

Next routes are frequently `force-dynamic`; no durable application cache or service worker/offline mode is evident. The kiosk depends on network, object storage, database, and external AI for full completion. Browser recording can retain transient local component state, not an offline submission queue.

## Idempotency and transactions

- Presign/answer processing uses stable object keys, unique constraints, and transcript/analysis upserts.
- Response/structured answer code has unique indexes and retry guards from July 2026 migrations.
- Survey creation uses `creationRequestId`/idempotency constraints (`lib/event-voice-surveys.ts`, `20260803120000_add_survey_creation_idempotency`).
- Agenda imports have event-scoped idempotency keys, stable row keys, unique constraints, and atomic confirmation (`lib/event-agenda-import-service.ts`).
- Events action transitions and deliveries maintain history/attempt records.
- Stripe webhook handlers update by customer/subscription identity, but no explicit stored webhook-event deduplication model is evident.
- Provisioning includes external side effects; atomicity across database, email, Supabase, and Stripe cannot be assumed.

## Error semantics and observability

Newer domains define typed errors carrying HTTP status and sometimes code: `EventAgendaServiceError`, `EventActionError`, `EventStructureError`, `AccountProductModeError`, `EventVoiceSurveyLifecycleError`, `EventDashboardFilterError`, and others. Routes map these to structured 4xx responses. Older routes often return raw `error.message` in a `{success,error,message}` variant. There is no repository-wide error envelope.

Observability is primarily `console.log/warn/error`, optional `PRISMA_QUERY_LOG`, and development route timing. Google Analytics is optional. No centralized tracing, metrics backend, error reporter, queue dashboard, or formal audit-log platform is configured in this repository. Events action history is domain history, not general system telemetry.

## Deployment and configuration

`npm run build` builds help docs, generates Prisma, and runs `next build`; `npm start` runs Next. `docker-compose.yml` supplies local PostgreSQL and MinIO. `next.config.js` configures server-action size and help rewrites. No tracked Vercel project configuration, CI workflow, infrastructure-as-code, or production release manifest was found. Production host/version is therefore unverified.

Environment names observed in code/examples, grouped without values:

- Database: `DATABASE_URL`, `DIRECT_URL`, `PRISMA_QUERY_LOG`.
- Auth: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPER_ADMIN_EMAILS`, `AUTH_CALLBACK_DEBUG`.
- Storage/upload: `S3_ENDPOINT`, `S3_BUCKET_NAME`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_UPLOAD_EXPIRES_IN`, `MAX_FILE_SIZE_BYTES`, `ALLOWED_MIME_TYPES`.
- AI/voice: `OPENAI_API_KEY`, `TRANSCRIPTION_PROVIDER`, `TRANSCRIPTION_MODEL`, `ANALYSIS_PROVIDER`, `ANALYSIS_MODEL`, `ANALYSIS_PROMPT_VERSION`, `EVENT_INTELLIGENCE_MODEL`, `REVIEW_SYNOPSIS_MODEL`, `GOOGLE_TTS_API_KEY`, `TTS_DEFAULT_VOICE`, `TTS_DEFAULT_LOCALE`.
- Billing/email: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `BILLING_PORTAL_RETURN_URL_BASE`, `RESEND_API_KEY`, `EVENT_ACTION_EMAIL_FROM`.
- URLs/analytics/flags: `NEXT_PUBLIC_APP_URL`, `APP_BASE_URL`, `MARKETING_SITE_URL`, `NEXT_PUBLIC_MARKETING_SITE_URL`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_ENABLE_TEMPLATE_DEMO`, `RUN_INSIGHTS_RUNTIME_TESTS`, `VOICE_EVENTS_DEMO_ALLOW_REMOTE_DEV`, `NODE_ENV`.

## Security boundaries and current risks

The March audit (`docs/SECURITY_CODE_AUDIT.md`) is incident evidence, not fully current truth. Shared membership/super-admin guards now remediate several cited gaps. Still observable concerns include:

- legacy `/api/events/*` data routes remain intentionally documented as legacy/public/admin surfaces;
- no repository RLS or rate limiting is evident;
- expensive public AI/upload endpoints require abuse-control review;
- synchronous AI calls can exhaust request/runtime capacity;
- JSON settings and inconsistent validation/error envelopes expand attack surface;
- logs may contain operational identifiers/errors and lack central redaction policy;
- application-layer tenant checks must be preserved on every relation and ID.

## Performance constraints

Known pressure points are synchronous OpenAI processing, Prisma connection/query concurrency in large Events dashboards, import parsing/persistence, and repeated account-context loads. July–August history includes pool-exhaustion, loading waterfall, and metric-query corrections. Prefer coalesced/selected queries, bounded filters, no full-page reload after mutations, and no high-frequency polling without a measured contract.

## Test architecture

On this checkout there are 155 `*.test.ts` files and two Playwright specs. Vitest runs in Node, excludes E2E/docs-site, and uses `@` path alias (`vitest.config.ts`). Route tests use helpers/mocks under `tests/`. Playwright runs serial Chromium journeys on an isolated server, default port 3100; loop-specific manual QA has used port 3001.

Expected validation by risk: targeted Vitest tests, `npm run typecheck`, `git diff --check`; add `npx prisma validate`/generate when schema changes; run Playwright or documented live browser QA for user-visible flows. A passing source-string test is a guardrail, not proof of runtime behavior.
