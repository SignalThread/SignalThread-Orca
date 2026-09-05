# SignalThread decision and incident history

> Source-confidence note — 2026-08-05: High confidence in dates/affected files supported by migrations and commits; medium confidence in reconstructed triggers/root causes where commit messages and tests provide evidence; low confidence in deployment impact because production releases were not inspected. This is a curated history, not a commit dump.

## 2026-01 — Move from a single recording demo to SaaS hierarchy

- **Trigger/symptoms:** The initial recording pipeline could not safely organize multiple customers, sites, campaigns, or multi-question respondent journeys.
- **Decision:** Introduce Account → Location → Event → Response → Answer while retaining the old `Session` stack for compatibility.
- **Systems:** `prisma/migrations/20260114163539_add_saas_data_model`, `20260124211951_add_account_location_multi_tenancy`, `prisma/schema.prisma`.
- **Impact:** Additive migrations; dual models remain today.
- **Current relevance/lesson:** `Event` is shared infrastructure, not proof of Events product mode. Never use legacy `Session` as the Events agenda model.

## 2026-01 to 2026-02 — Authentication evolved from mock/query routing to Supabase OTP

- **Trigger/symptoms:** Early docs and code used mock cookies/query account selection and then magic links; account identity and redirect flows were brittle.
- **Decision/fix:** Adopt Supabase identity, add Prisma `User`/pending provisioning, later replace magic links/password experiments with email OTP and identity linking.
- **Systems:** `prisma/migrations/20260127012625_add_user_model`, `lib/supabase/*`, `lib/auth/complete-email-otp.ts`, `lib/auth/link-user-identity.ts`, commits `82044f7`, `1f30340`.
- **Tests:** Auth callback, identity linking, OTP, membership, and provisioning route tests.
- **Current relevance/lesson:** README/quick-start text about mock auth is historical. Resolve the authenticated actor server-side and bind it to Prisma account membership.

## 2026-03-07 — Security audit exposed route and tenant-boundary gaps

- **Trigger/symptoms:** A repository audit found unauthenticated platform/account endpoints, public legacy analytics, inconsistent tenant binding, no abuse limits, and raw error/log exposure.
- **Root cause:** Authorization had evolved route-by-route while middleware was assumed to provide protections it did not uniformly provide.
- **Decision/fix:** Add explicit reusable policies and route tests; current code uses `requireAccountMembership`, `requireSuperAdminForApi/Page`, account-admin policies, and Events event-access checks.
- **Systems:** `docs/SECURITY_CODE_AUDIT.md`, `docs/SECURITY_FIX_PLAN.md`, `lib/auth/*`, `app/api/admin/*`, `app/api/app/*`; merge `a746f15`.
- **Impact:** No RLS migration is visible. Public legacy routes and rate-limiting questions remain.
- **Lesson:** Treat the March audit as a baseline incident, re-check each finding against current code, and enforce authorization in route handlers rather than relying only on middleware.

## 2026-03 — Billing, provisioning, and asynchronous-looking kiosk completion

- **Trigger/symptoms:** Product needed self-serve checkout/account activation and the kiosk final screen was blocked by synopsis generation.
- **Decision:** Add Stripe checkout/webhooks and provisioning; make summary loading non-blocking at the UI level.
- **Systems:** `app/api/billing`, `app/api/webhooks/stripe`, `lib/provisioning.ts`, `components/kiosk/SummaryLoader.tsx`; commits `8a1d707`, `289f6d2`.
- **Current relevance:** Core answer transcription/analysis still runs synchronously in `POST /api/answer/confirm`; UI non-blocking behavior is not a background worker.

## 2026-05 — Normalize questions and expand response modes/TTS

- **Trigger/symptoms:** `Event.questionsJson` was insufficient for survey ownership, question audio, typed responses, and stable relational attribution.
- **Decision:** Add `Question`, `QuestionAudioAsset`, mixed question types, response modes, and survey-level TTS while preserving legacy JSON reads.
- **Systems:** migrations `20260504193000`, `20260504234500`, `20260511120000`, `20260720120000`; `lib/question-read.ts`, `lib/mixed-survey-contract.ts`, `lib/question-audio.ts`.
- **Lesson:** Normalized `Question` is canonical where available; compatibility JSON must not become a second independently edited truth.

## 2026-05 to 2026-06 — Establish Voice Events on shared infrastructure

- **Trigger/symptoms:** Event teams needed multiple targeted listening points and live operational intelligence, while retail already depended on the same Event/kiosk/analysis models.
- **Decision:** Use `Account.accountType === EVENTS` as the only product boundary; add `SurveyTarget`, `Survey`, token links, normalized Events intelligence, structure, issue clusters, and actions without forking capture/transcription.
- **Systems:** migrations from `20260527120000_add_event_voice_survey_foundation` through `20260624120000_add_event_template_and_venue`; `lib/account-product-mode.ts`, `lib/event-intelligence/*`, protected `/api/app/events/*`.
- **Tests:** Product-mode, event-access, dual-write, aggregation, structure, surveys, and kiosk contract tests.
- **Lesson:** Unknown/non-Events values must stay retail-safe. `/api/events/*` is legacy and cannot become the new Events backend.

## 2026-07-20 to 2026-07-23 — Mixed kiosk and live action workflow

- **Trigger/symptoms:** Voice-only questions and aggregate dashboards did not cover ratings/recommendations or an operator’s need to triage live issues.
- **Decision:** Add mixed-response foundation, structured-answer idempotency, live intelligence/alerts, survey availability, and action state.
- **Systems:** migrations `20260720120000`, `20260720160000`, `20260720200000`, `20260721120000`; commits `bd8f452`, `39e2372`, `0aa4761`.
- **Lesson:** Question type, response mode, collection availability, survey status, and action status are separate contracts.

## 2026-07-30 — Agenda, speakers, and import domain introduced

- **Trigger/symptoms:** Generic event structure could not reliably represent schedule sessions, account-scoped speakers, assignments, or large external agendas.
- **Decision:** Make `EventStructureItem(kind=SESSION)` authoritative, add `EventSpeakerProfile` and assignment joins, then durable import jobs/rows with mapping, review, conflict resolution, atomic confirmation, and idempotency.
- **Systems:** migration `20260730130000_add_event_agenda_foundation`; commits `bf3f66d`, `efd5c57`, `28055d8`, `b1358af`, `544f90f`, `e11238e`, `9d5709c`; `lib/event-agenda-*`.
- **Current relevance:** Flexible agenda/roster import was expanded in `c513932`; browser QA and draft lifecycle behavior remain high-risk areas.
- **Lesson:** No domain sessions/speakers/assignments may be written before final import confirmation.

## 2026-07-31 — Events data truth and performance incidents

- **Symptoms:** Dashboard queries exhausted pools or waterfall-loaded; home survey metrics and session/speaker intelligence mixed scopes; setup surveys were confused with result-bearing surveys.
- **Root cause:** Multiple routes independently aggregated shared and Events-normalized data, sometimes with broad query shapes or inconsistent inclusion rules.
- **Fix:** Coalesce workspace loads, narrow/select queries, define canonical event metrics and listening-plan scopes, and harden account/event boundaries.
- **Systems/commits:** `14ff9ee`, `ef0a49d`, `b3b3d73`, `4cd93d1`, `1772311`, `571a06c`; `lib/events-home-metrics.ts`, `lib/event-listening-plan.ts`, Events analysis/intelligence routes.
- **Lesson:** Every displayed metric must state its unit and scope: completed responses, captured/analyzed answers, survey subset, feedback-source coverage, or represented sessions.

## 2026-08-01 — Theme mutation loop and workspace loading incidents

- **Symptoms:** The Events workspace attempted to force light styling by mutating the root `dark` class; an observer/DOM interaction could loop, flash, or destabilize rendering.
- **Root cause:** A child workspace owned global theme DOM state instead of the canonical provider.
- **Fix:** Commit `5fb155e` removed the recursive observer pattern and added regression coverage. The current uncommitted work goes further by moving account-aware defaulting into `components/theme/ThemeProvider.tsx` and removing the workspace’s requestAnimationFrame override.
- **Impact:** No schema change. Live Events/SMB and hydration verification is still required for the uncommitted version.
- **Lesson:** Global theme is provider-owned; never fight it with mutation observers, repeated class removal, or pathname inference.

## 2026-08-03 — Retry safety, lifecycle truth, and UX hardening

- **Survey creation incident:** A write could succeed before deferred question-audio work failed, returning 500 and inviting duplicate retry. `b6686b2` added creation idempotency and separated deferred audio outcome from the successful creation response.
- **Date/lifecycle incident:** Local calendar dates drifted through UTC conversion and stored status was used as live/upcoming truth. `a102098` introduced date parsing helpers and date-derived lifecycle handling.
- **Tour/product leakage:** SMB Product Tour could appear or start in Events through menu, stored state, or query state. `a478fb8` and related tests gated it with canonical account type.
- **Metric/intelligence incident:** Counts and evidence semantics differed across home, setup, live, and post-event views. `a6b9af2` and `8e66f2a` reconciled definitions and UI labeling.
- **Lesson:** A successful domain write must not be reported as failed because optional side work failed; lifecycle and metric contracts need named shared helpers.

## 2026-08-04 — Flexible imports and listening windows

- **Trigger:** Real agenda/roster files varied in headers/shape and event listening needed explicit pre/post boundaries.
- **Decision:** Expand parser/mapping/service/template support and add optional event listening window fields while preserving canonical no-override behavior.
- **Systems:** `c513932`, `lib/event-agenda-import-*`, `lib/event-speaker-roster-import*`, `lib/event-listening-window.ts`, latest migration.
- **Current relevance:** This is HEAD. Subsequent requested QA for import SAVE_MAPPING/draft lifecycle is not evidenced as committed on current `main` and must be re-verified before claiming complete.

## 2026-08-05 working tree — Events theme and SMB tour gate, not yet committed

- **Trigger:** Events could default/flash dark and unresolved/stale account context could expose or start the SMB tour.
- **Root cause evidenced by diff:** `ThemeProvider` defaulted to `system`; a child workspace separately removed/restored the root class. Tour/menu state stored only account type/loading, allowing stale account context during slug transitions.
- **Proposed working fix:** Account-aware provider fallback, slug-bound settled context, fail-closed tour/menu callbacks, and removal of child global-theme mutation.
- **Files/tests:** See `CURRENT_STATE_AND_NEXT_WORK.md`.
- **Impact/current relevance:** Uncommitted and not production evidence. Do not overwrite or stage as part of unrelated work.

## Standing incident lessons

1. Shared infrastructure makes cross-product regressions more likely than isolated failures.
2. Route ownership and tenant predicates must be explicit at every entry point.
3. “Write succeeded but response failed” requires idempotency, not client-side recreation.
4. Aggregate numbers are unsafe without unit, status, date window, and scope.
5. DOM theme hacks and imperative reload/click chains hide state ownership defects.
6. Historical docs are valuable for intent/incidents but must be checked against current code.
