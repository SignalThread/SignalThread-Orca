# SignalThread product and commercial context

> Source-confidence note — 2026-08-05: Medium confidence. Product positioning is supported by `docs/SALES_ONE_PAGER.md`, `docs/MARKETING_FEATURE_MATRIX.md`, Events buildout/audit documents, and implemented surfaces. Pricing amounts, real customer outcomes, market research, approved public copy, and channel strategy are not verifiable in this repository. Internal/demo facts are labeled.

## Product proposition

SignalThread is positioned as a voice-first operational feedback system: capture a richer spoken account of an experience, automatically transcribe and structure it, and let operators move from aggregate signal to source evidence and action. The strongest differentiated story in code is not “AI surveys”; it is the connected workflow from public capture through evidence-backed operating decisions.

There are two packaging narratives:

- **SMB/retail:** always-on customer listening for location operators, including survey control, operational analytics, and an optional post-survey Google review handoff.
- **Voice Events:** event intelligence for pre-event readiness, live operations, session/speaker listening, issue response, and post-event closeout.

Hospitality appears as an account enum and template placeholder, not a finished go-to-market package.

## Buyers, users, and problems

| Persona | Problem | Product response | Evidence strength |
| --- | --- | --- | --- |
| Operations/CX leader | Feedback arrives late, is laborious to synthesize, and lacks traceability | Voice capture, normalized signals, evidence drilldowns, actions | High, implementation-backed |
| Event operations leader | Attendee issues are discovered after the moment to intervene | Lifecycle views, live intelligence, issue clusters, assignments | High for product surface; outcomes unproven |
| Event content/program lead | Session and speaker feedback is hard to associate with schedule context | Agenda, speaker roster, assignments, scoped listening | High, implementation-backed |
| SMB owner/manager | Needs a simple way to collect richer feedback and see priorities | Survey builder, kiosk/QR, dashboards, location context | High, implementation-backed |
| Account administrator | Multi-site rollout, branding, access, and billing are fragmented | Account settings, locations, invitations, Stripe workflow | High, implementation-backed |
| Respondent | Conventional forms are tedious and suppress nuance | Anonymous voice/text/structured kiosk experience | High, implementation-backed; response lift unverified |

## Positioning and differentiation

### Supportable positioning

“SignalThread helps location and event teams collect voice feedback and turn it into evidence-backed operational signals.” This is conservative and directly supported by the code.

Implementation-backed differentiators:

1. One traceable path from audio capture to transcript, analysis, normalized Events evidence, and action.
2. Public, no-install kiosk with voice, text, rating, and recommendation question types.
3. Multi-tenant operations with both SMB and Events experiences on shared capture infrastructure.
4. Event-specific agenda, speaker, listening-target, intelligence, and workflow context.
5. Direct source-answer evidence behind higher-level analytics.

### Claims to reject or qualify

- Do not claim “real-time” processing without qualification; voice confirmation currently waits on external transcription and analysis synchronously.
- Do not claim enterprise-grade isolation from database RLS; repository enforcement is application-layer and external RLS is unverified.
- Do not claim complete hospitality support; it is a placeholder.
- Do not claim quantified increases in completion, revenue, review volume, or speed without external measurement.
- Do not call all features production-deployed merely because they exist on `main`.
- Do not describe Events as a separate ingestion/AI stack; it reuses the shared kiosk and answer pipeline.
- Do not advertise exports, sponsor ROI, attendee identity, or multilingual behavior as complete without direct current verification.

## Sales narrative

1. **Open with operational latency:** teams hear useful stories but cannot consistently connect them to what happened, where, or what to do next.
2. **Show capture:** a branded public link or QR starts a short voice/text survey without an app.
3. **Show evidence:** the system preserves transcripts and answer-level context beneath aggregate signals.
4. **Show action:** Events users can triage issues and maintain assignments/status history; SMB users can review trends and source feedback.
5. **Show governance:** accounts, locations, users, lifecycle controls, and billing support repeatable rollout.

Avoid leading with model names. Whisper/GPT are implementation details; the customer value is faster, explainable operational listening.

## Discovery questions

- Where do customer or attendee observations arrive today, and how quickly can someone act?
- Which moments/locations/sessions matter enough to warrant a dedicated listening point?
- Who owns triage, and what evidence do they need before taking action?
- Is the priority live intervention, longitudinal location trends, post-event reporting, or reputation growth?
- What response modes and accessibility requirements are needed?
- How many accounts, locations, events, surveys, and administrators are in scope?
- What retention, consent, privacy, residency, and deletion policies apply to audio/transcripts?
- Which systems must receive actions or reports? No outbound operations integration is currently proven.
- How will success be measured: coverage, completion, time-to-triage, time-to-resolution, or operator adoption?

## Objections and accurate responses

| Objection | Accurate response |
| --- | --- |
| “Is this just another survey builder?” | It includes survey operations, but the distinguishing implementation is voice capture plus evidence-linked analytics and Events action workflows. |
| “Does AI make unsupported conclusions?” | Analyses retain source transcripts/evidence and deterministic aggregation layers, but model accuracy still needs customer-specific QA and governance. |
| “Is processing instant?” | It occurs in the submission flow today; external API latency and request timeouts are real constraints. |
| “Can it isolate multiple customers?” | Account/location/event predicates and route guards exist. Database RLS and production infrastructure controls must be verified separately. |
| “Can we import our event schedule?” | Current code supports CSV/XLSX agenda and roster mapping/review/confirmation. Browser QA remains important for the latest flexible import behavior. |
| “Does it replace our event platform/CRM?” | No such integration or replacement scope is proven. It is a listening and intelligence layer. |

## Pricing and commercial evidence

Confirmed only:

- `Account.tier` defaults to `starter`; route code normalizes historical `pro` to `growth` and recognizes `starter`, `growth`, and `enterprise` (`prisma/schema.prisma`, `app/api/admin/accounts/route.ts`).
- Starter creation code assigns a 30-day `trialEndsAt` (`app/api/admin/accounts/route.ts`).
- Stripe checkout, billing portal, and webhook lifecycle code exist (`app/api/billing/checkout/route.ts`, `app/api/app/account/billing/route.ts`, `app/api/webhooks/stripe/route.ts`).
- Price identifiers are configured by `STRIPE_PRICE_STARTER` and `STRIPE_PRICE_GROWTH`.

Not verified: price amounts, entitlements by tier, enterprise contracting, discounts, quotas, metering, current checkout deployment, taxes, refunds, or SLA. Never infer price from variable names.

## Customers, pilots, and confidentiality

No real customer or signed pilot history is verifiable. Names such as Acme Coffee, TechConf, SignalThread Live Venue, `events-demo`, and seeded summit events are demo/QA artifacts, not customer proof.

**Confidential/internal:** account slugs, event IDs, QA emails, seeded response details, database row counts, and screenshots from internal loop/audit packages should not be used publicly without approval. The repository contains no formal classification policy; default these operational examples to internal.

## Channels, partners, and integrations

No channel or partner strategy is documented. Stripe, Supabase, OpenAI, object storage, Resend, and Google TTS/Analytics are technical vendors, not evidence of commercial partnerships. QR/public-link distribution is a product channel, not a sales channel.

## Content voice

Current product language is direct, operational, and evidence-oriented: “listening points,” “signals,” “needs action,” “evidence,” and “publish.” Favor clear verbs and concrete status over generic AI superlatives. Keep Events copy event-specific and SMB copy location/customer-specific; prior QA repeatedly found cross-product copy leakage.

## Proof metrics

The app computes internal operational metrics such as completed responses, captured/analyzed answers, satisfaction/sentiment, listening coverage, survey-scoped counts, open attention items, session representation, and action state. These demonstrate product behavior, not customer ROI.

Missing proof program:

- respondent completion and abandonment baselines;
- transcription/analysis quality sampling;
- time from signal creation to operator review/action;
- action resolution rates;
- uptime/error/latency percentiles;
- pilot retention and expansion;
- attributable review conversion.

## Roadmap hypotheses, not commitments

- Async answer processing and explicit progress/retry semantics.
- Explicit event close/wrap behavior after a product decision.
- Richer public kiosk event/survey context using existing branding and metadata.
- Mature export/share and sponsor/exhibitor value reporting.
- Integrations for action delivery beyond email.
- Formal hospitality packaging only after defining its product boundary and workflows.
- Stronger data governance, rate limiting, observability, and potentially database-layer tenant controls.

Treat all of these as hypotheses until product approval and repository evidence exist.
