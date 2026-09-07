# SignalThread master project context

> Source-confidence note — 2026-08-05: High confidence for repository-backed architecture and behavior at `main` commit `c513932`; medium confidence for product intent drawn from current product documents; low or explicitly unverified for production deployment, customers, pricing amounts, and adoption claims. The working tree is dirty, so uncommitted behavior is identified separately.

## Executive definition

SignalThread is a multi-tenant, voice-first feedback and intelligence product. It collects spoken or structured answers through a public kiosk, processes voice through transcription and analysis, and gives authenticated operators evidence-backed insights and actions.

The repository supports two materially different product experiences on shared infrastructure:

- **SMB/retail:** ongoing location-based feedback, survey operations, review conversion, and account analytics.
- **Voice Events:** event setup, agenda and speaker structure, targeted listening points, live intelligence, issue triage, actions, and closeout views.

The codebase/package name `booth-audio` is historical (`package.json`); the current user-facing name is SignalThread (`README.md`, `app/layout.tsx`). No legal company name is established in the repository.

## Thesis and product boundary

The durable product thesis is: collect richer voice feedback at the point of experience, turn it into explainable operational signals, and reduce the delay between hearing a problem and acting on it. For Events, the internal positioning is “live attendee voice → event signals → action while the event is still happening” (`docs/event-mode/EVENT_MODE_BUILDOUT_SUMMARY_FOR_FABEL.md`).

The canonical product boundary is `Account.accountType`. `getAccountProductMode` in `lib/account-product-mode.ts` returns `events` only for `EVENTS`; every other, absent, or unknown value falls back to `retail`. Do not infer product mode from a pathname, account slug, `Event` model usage, kiosk URL, or the legacy template registry. Retail, hospitality, and Events share `Event`, `Response`, `Answer`, kiosk, upload, transcription, and much of the analysis infrastructure.

## Audiences and jobs to be done

| Audience | Primary job | Current evidence |
| --- | --- | --- |
| Event operator | Configure an event, its agenda, speakers, listening points, and deployment | `app/app/events/[eventId]/page.tsx`, `components/events/EventAgendaWorkspace.tsx`, `components/events/EventDeploymentWorkspace.tsx` |
| Event operations/insights lead | Monitor live signals, inspect evidence, triage issues, assign and track actions | `app/app/events/[eventId]/dashboard/page.tsx`, `components/events/EventInEventIntelligence.tsx`, `lib/event-actions/service.ts` |
| SMB owner/manager | Create surveys, launch a kiosk/QR link, review trends and feedback | `app/app/page.tsx`, `app/app/surveys/create/CreateSurveyClient.tsx`, `components/admin/Dashboard2.tsx` |
| Respondent/attendee | Consent, answer by voice/text/rating, and complete anonymously | `app/kiosk/page.tsx`, `components/kiosk/*`, `app/api/response/create/route.ts` |
| Account admin | Manage settings, branding, billing, locations, and users | `components/admin/SettingsMenu.tsx`, `app/api/app/account/*`, `app/api/app/locations/*` |
| Platform operator | Provision and manage accounts | `app/admin/*`, `app/api/admin/*` |

## End-to-end workflows

### Shared capture and processing

1. A public event ID or `PublicSurveyLink.token` resolves kiosk context.
2. The respondent accepts consent and a `Response` is created.
3. Each answer is captured as voice, text, rating, or recommendation according to the question contract.
4. Voice uses presign → direct object-store upload → server verification → confirmation.
5. Confirmation transcribes via OpenAI Whisper and analyzes via OpenAI chat; normalized Events intelligence is additionally written for Events accounts.
6. The response completes and authenticated dashboards read aggregates and supporting evidence.

Canonical sources: `app/api/kiosk/event-details/route.ts`, `app/api/response/create/route.ts`, `app/api/answer/{presign,complete,confirm,structured,text}/route.ts`, `lib/transcription.ts`, `lib/analysis.ts`, and `lib/event-intelligence/dual-write.ts`.

### SMB/retail operator workflow

Account home → create/edit survey → configure questions/voice/response mode → publish/launch via URL or QR → collect kiosk responses → review dashboard signals and evidence. A Google review helper is available only when a location has a configured review URL. Product Tour and system-aware theming belong to this experience.

### Voice Events operator workflow

Events home → create an Event container → configure dates, venue, agenda/areas/speakers → create targeted surveys/listening plan → publish and distribute public links/QR/signage → monitor lifecycle-specific Signals/Intelligence → review session/speaker evidence → move findings into action workflows → review post-event closeout.

`EventStructureItem` is the agenda/area authority; the legacy recording `Session` model is not an event agenda session. `EventSpeakerProfile` is account-scoped identity and `EventSessionSpeakerAssignment` represents event participation.

## Capability map

| Capability | State on this checkout | Notes |
| --- | --- | --- |
| Supabase OTP authentication and Prisma identity linking | Implemented | `app/login`, `app/auth/callback`, `lib/auth/*` |
| Account/location/event multi-tenancy | Implemented | Enforcement is primarily application-layer |
| Voice/text/structured kiosk answers | Implemented | Shared across products |
| S3-compatible direct upload and verification | Implemented | R2/S3/MinIO-compatible configuration |
| Whisper transcription and AI analysis | Implemented, synchronous | Long request path remains a scalability risk |
| SMB survey lifecycle/dashboard/QR | Implemented | Some older docs describe obsolete flows |
| Events setup, surveys, agenda, speaker roster | Implemented and actively QA-hardened | Flexible import landed at `c513932` |
| Events normalized intelligence, evidence, alerts, actions | Implemented | Semantics have had repeated reconciliation fixes |
| Events automatic/manual deployment scheduling | Implemented | Depends on survey/session availability rules |
| Billing and provisioning | Implemented | Stripe checkout/webhooks plus assisted provisioning |
| Hospitality product | Placeholder only | `lib/templates/registry.ts` maps it to Events template; not a canonical product mode |
| Background processing queue | Not implemented | Answer confirmation processes external AI calls inline |
| Database RLS policy layer | Not present in repository migrations | External DB configuration is unverified |
| Fully productized exports/sponsor reporting | Partial or planned | Do not market as complete without direct UI verification |

## Implemented versus planned

“Implemented” means code, route, and usually a test exist; it does not prove production deployment or operational reliability. Current implementation is most strongly represented by `prisma/schema.prisma`, `app/api`, `lib`, current component tests, and commits from July–August 2026.

Likely next/product-decision areas are an explicit event close/wrap semantic, richer kiosk event/survey context, async answer processing, legacy route retirement, hospitality definition, export/report maturity, and remaining browser QA documented in `docs/Loop/Remaining QA Fix Prompt Pack.md`. See `CURRENT_STATE_AND_NEXT_WORK.md` for the dated queue.

## Glossary

- **Account:** tenant and canonical product-mode owner.
- **Location:** account-owned workspace/site; in Events it is not necessarily the physical venue.
- **Event:** top-level feedback campaign or Events container, shared by products.
- **Event structure item:** canonical Events area/session/sponsor/custom touchpoint.
- **Survey target:** scope to which a survey/listening point is attached.
- **Survey:** question set and collection lifecycle beneath an Event.
- **Public survey link:** tokenized public launch path for a survey/target.
- **Response:** one respondent journey.
- **Answer:** one response to one question; may carry audio or structured values.
- **Evidence:** answer/transcript/analysis support for an Events signal or issue.
- **Issue cluster/action:** normalized Events operational finding and workflow.
- **SMB:** repository shorthand for the retail-safe, non-Events product experience.
- **Session:** ambiguous. In current Events work it means `EventStructureItem(kind=SESSION)`; `Session` is also a legacy recording model.

## Durable operating principles

1. Preserve shared kiosk and SMB behavior when changing Events.
2. Resolve Events versus SMB from canonical account context only.
3. Treat protected `/api/app/events/*` services as current Events surfaces; legacy `/api/events/*` is not a foundation for new work.
4. Preserve tenant predicates from Account through Location/Event and reject cross-account IDs.
5. Use normalized models and services as authority; JSON compatibility fields are secondary.
6. Make writes deterministic and retry-safe where a request can be repeated.
7. Do not claim browser, deployment, migration, or customer proof that was not directly verified.
8. Root-cause incidents before editing and protect behavior with targeted tests.

## Package navigation

- `PRODUCT_AND_COMMERCIAL_CONTEXT.md` — positioning, buyers, claims, and commercial unknowns.
- `SYSTEM_ARCHITECTURE_AND_DATA.md` — runtime, data, security, integrations, and tests.
- `DECISION_AND_INCIDENT_HISTORY.md` — meaningful architectural decisions and failures.
- `CURRENT_STATE_AND_NEXT_WORK.md` — dated checkout state, risks, and QA queue.
- `AGENT_OPERATING_RULES.md` — engineering and collaboration guardrails.
- `CONTEXT_SOURCE_INDEX.md` — evidence map.
- `CONTEXT_GAPS_AND_VERIFICATION.md` — contradictions and human decisions.
