# PROJECT_SUMMARY

Last verified from code: 2026-03-07  
Basis: direct inspection of `app/**`, `lib/**`, and `prisma/schema.prisma`.

## 1) What the Product Does

Booth Audio / Voice Survey lets organizations collect voice responses in kiosk mode and convert them into usable insights.

Confirmed capabilities:
- multi-question kiosk recording flow
- direct audio upload to S3-compatible storage
- automatic transcription (OpenAI Whisper)
- automatic analysis (sentiment, themes, actions)
- account/location/event management
- account-level analytics surfaces and signals
- branding + consent customization per account settings

## System Pipeline Overview

1. Kiosk records audio in the browser (`MediaRecorder`).
2. Client uploads audio to object storage via presigned URL.
3. Confirm endpoint (`POST /api/answer/confirm`) starts answer processing.
4. Transcription runs via OpenAI Whisper.
5. Analysis runs via OpenAI Chat (GPT model).
6. Insights are stored in `AnswerAnalysis` (with transcript in `AnswerTranscript`).
7. Dashboards read aggregated analysis/signals from persisted answer data.

## 2) Current Implementation Status

## Appears complete (confirmed)
- End-to-end kiosk capture pipeline (`response/create` -> presign/upload -> confirm -> complete response)
- Answer-level processing persistence (`AnswerTranscript`, `AnswerAnalysis`, `AnswerProcessingLog`)
- TTS question playback with cached audio generation
- Multi-tenant schema (Account -> Location -> Event)
- Basic platform provisioning flows (`/start`, `/api/provision/start`, `/api/admin/provision-retail`)
- Customer app surfaces for dashboard, survey creation/editing, and profile settings

## Appears in progress / mixed maturity
- Authorization hardening across all routes (currently inconsistent)
- Migration cleanup from legacy `Session/*` pipeline to `Response/Answer/*`
- Template system maturity (hospitality currently placeholder; several section renderers are stubs)
- Consistency between legacy `/api/events/*` and newer `/api/app/*` surfaces

## 3) Known Issues / Technical Debt

Confirmed from code:
- Root middleware does not enforce auth or roles.
- Some APIs check Supabase session; some do not (including several `/api/app/*` routes).
- User/account membership is not uniformly enforced with `User.accountId`.
- `/api/admin/accounts` comments claim middleware enforcement, but handler itself has no explicit auth/role check.
- Domain duplication remains (`Session` + `Response` model families).
- JSON-heavy config (`questionsJson`, `settingsJson`) trades flexibility for weaker schema guarantees.
- Inline/synchronous processing in `/api/answer/confirm` can increase request latency and failure coupling.
- Debug-style logs still present in production paths (example: Google review helper logs).

## 4) Recommended Next Priorities

1. Implement uniform auth + role checks on all protected APIs and wire real middleware.
2. Enforce tenant membership (`User.accountId`) on account-scoped routes, not just slug-based filtering.
3. Decide and execute migration plan to retire legacy `Session/*` tables/routes.
4. Split long-running transcription/analysis from request-response path (queue/worker pattern).
5. Add schema-level or runtime validation contracts around `settingsJson` and `questionsJson`.
6. Remove stale comments and outdated assumptions (`getOrCreate*`, auto-seed language, middleware assumptions).

## 5) Important Assumptions for New Engineers

Confirmed assumptions in current code:
- Supabase is auth/session only; Prisma/Postgres is the business data source.
- Account slug in URL query params is foundational for navigation and data fetching.
- Kiosk requires `eventId` query parameter and does not require attendee login.
- Branding and consent are stored in `Account.settingsJson`.
- Analytics reads from processed answer data (`AnswerAnalysis`), not from raw transcripts alone.

Uncertain or inferred areas to verify before major changes:
- Intended long-term ownership of legacy `/api/events/*` routes vs `/api/app/*` routes.
- Whether all admin surfaces are intended to be public-with-session-check or strictly server-enforced by middleware.
- Final contract for template/vertical configuration persistence (currently mostly code-defined).
