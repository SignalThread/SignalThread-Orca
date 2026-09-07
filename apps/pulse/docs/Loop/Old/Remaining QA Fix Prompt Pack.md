# Voice Events — Remaining QA Fix Prompt Pack

Use this file with the repo’s generic loop controller. Execute prompts in order and commit each completed implementation prompt separately.

## Loop status

- [x] Prompt 1 — Survey creation false 500
- [x] Prompt 2 — Canonical event metrics
- [x] Prompt 3 — Intelligence integrity and remaining UX defects
- [ ] Prompt 4 — Product-decision audit

---

## Prompt 1 — Fix survey creation returning 500 after a successful write

**Model: Terra**  
**Strength: Medium**

```text
Voice Events

Fix the event survey creation flow that persists successfully but returns HTTP 500 and shows “Failed to create survey.”

QA target:
- Account: events-demo
- Event ID: cmsckubtq0006ve37jzsg1tki
- Route: event Setup → Surveys → New survey

Required work:
1. Reproduce the failure and identify the exact post-write step that throws after the survey, target, questions, and public link are already persisted.
2. Make the create operation deterministic and truthful:
   - success returns one success response
   - a real failure returns an error without leaving an unreported partial success
   - retrying the same user action must not create duplicate surveys
3. Keep the route thin and place orchestration/idempotency in the canonical survey creation service.
4. Preserve existing eventId and token kiosk behavior.
5. Add targeted regression tests for:
   - successful create returns success
   - persisted survey/target/questions/link match the response
   - simulated post-write failure cannot produce a misleading 500 after a complete write
   - retry does not duplicate the survey
   - invalid input still fails cleanly
6. Verify live in Chrome using the canonical QA event and confirm the network response, UI success state, and resulting survey count agree.

Do not refactor unrelated survey editor, kiosk, analytics, or auth code.

Return and record:
- root cause
- files changed
- request/response behavior
- tests and verification results
- commit hash
```

### Prompt 1 completion status

- Root cause: `createEventVoiceSurvey` committed the target, survey, questions, and public link transaction, then the route awaited question-audio generation inside the same `try`. A TTS/storage failure therefore returned HTTP 500 after the complete write.
- Behavior: the canonical service now owns post-commit audio generation and returns `questionAudioStatus: READY | DEFERRED`; a deferred audio cache never changes a committed create into a false failure. Core transaction errors still return a real error.
- Idempotency: the create page generates one UUID per user create attempt and retains it across retries. `Survey.creationRequestId` is nullable and unique within the event; the service returns the already-complete survey package when the same key is retried.
- Persisted contract: success remains HTTP 201 with the canonical target, survey, questions, public link, and token-based kiosk path.
- Files changed: `prisma/schema.prisma`, `prisma/migrations/20260803120000_add_survey_creation_idempotency/migration.sql`, `lib/event-voice-surveys.ts`, `lib/event-voice-surveys.test.ts`, `app/api/app/events/[eventId]/voice-surveys/route.ts`, `app/api/app/events/[eventId]/voice-surveys/route.test.ts`, `app/app/events/[eventId]/surveys/new/page.tsx`, and `app/app/events/[eventId]/surveys/new/page.test.ts`.
- Verification: targeted Vitest service/route/UI suites passed (66 tests); `npm run typecheck` passed; Prisma client generation and schema validation passed. The migration was created but not applied.
- Browser verification still required: on port 3001, record the Surveys count; create one uniquely named draft survey; confirm POST returns 201 and includes matching target/survey/questions/link plus `questionAudioStatus`; confirm navigation shows that survey; retry the captured POST with the same `creationRequestId` and verify the same survey ID and unchanged count; simulate/observe deferred audio without a 500 if the environment permits.
- Live browser verification: not completed because this session has no live Chrome access.
- Commit: Prompt 1 commit created after this status update; see git history and loop completion output for the exact hash.

---

## Prompt 2 — Reconcile all event metrics through canonical definitions

**Model: Sol**  
**Strength: High**

```text
Voice Events

Reconcile the conflicting response, coverage, sentiment, survey, and session metrics across the Events product.

QA target:
- Account: events-demo
- Event ID: cmsckubtq0006ve37jzsg1tki

Known contradictions:
- 283 vs 282 responses
- 107/107 vs 107/112 coverage
- Positive vs Mixed sentiment for the same event state
- Survey badges totaling 91 while the event shows 283
- “5 of 3 sessions”
- Session response counts that do not reconcile with event totals

Required work:
1. Audit every affected surface and API before editing:
   - Setup overview/readiness
   - Pre-event Signals
   - In-event overview/intelligence
   - Post-event closing brief
   - Surveys list/editor badges
   - Sessions intelligence
2. Define one canonical meaning for each displayed metric:
   - responses
   - completed responses
   - answers
   - survey coverage
   - session coverage
   - sentiment/pulse
3. Put each definition in one canonical server-side aggregation path and reuse it across surfaces.
4. Correct denominator and scope errors, including the “5 of 3 sessions” state.
5. Label metrics clearly when two legitimate scopes differ; do not force unlike numbers to match by hiding the distinction.
6. Keep reads performance-aware and avoid restoring reconciliation writes or broad query fan-out during GET requests.
7. Add targeted contract tests proving all affected routes/surfaces agree for the seeded QA event.
8. Verify live in Chrome across Setup, Pre, In, Post, Surveys, and Sessions. Record the final values and why they agree.

Do not create a second aggregation system or patch individual cards with hard-coded calculations.

Return and record:
- canonical metric definitions
- root causes of each mismatch
- files changed
- query/performance impact
- tests and live verification
- commit hash
```

### Prompt 2 completion status

- Canonical definitions:
  - A displayed Event `response` is a `Response` whose status is `COMPLETED`; incomplete attempts are not added to business totals. `completed responses` is the explicit UI label for that same count.
  - `captured answers` are `Answer` rows attached to completed responses. `analyzed answers` are normalized `AnswerEventIntelligence` rows attached to those completed responses.
  - Setup survey counts and badges are planner-scoped: each badge is the completed-response count for that one planner survey. They are a labeled subset of the all-event total and are not summed as an event total.
  - Intelligence coverage is distinct represented active `SurveyTarget` records over all active configured targets in the current unfiltered target scope; zero-evidence targets remain in the denominator even when the normal dashboard time window is present.
  - Session coverage is distinct active agenda session IDs with a non-archived planner survey over distinct active agenda session IDs. Session response counts are completed responses attributed to that session and are explicitly labeled as a scoped subset of the event total.
  - Sentiment/pulse uses the existing product-approved inferred-satisfaction classifier (favorable analyzed sentiment share), with `POSITIVE` at 60%+, `MIXED` at 40–59%, and `NEGATIVE` below 40%. The closing brief consumes that classification rather than reclassifying the raw average.
- Root causes: Setup and normalized intelligence counted one `IN_PROGRESS` response while readiness counted only completed responses; target breakdowns were created only for targets that already had analyzed rows; the closing brief applied independent average-score thresholds; planner survey badges both included the incomplete response and represented only a legitimate subset of all event surveys; and the bounded listening-plan summary counted target rows rather than distinct agenda session IDs, allowing duplicate session targets to produce `5 of 3`.
- QA-event service verification (read-only, against `events-demo` / `cmsckubtq0006ve37jzsg1tki`): 282 completed responses, 560 captured answers, 560 analyzed answers, average normalized sentiment 0.328, canonical sentiment `POSITIVE`, and 107 represented of 112 active feedback targets. Planner Setup has 14 surveys and 90 completed planner-survey responses; the difference from 282 is now labeled as scope, not hidden. Session coverage resolves to 3 of 3 sessions with surveys, 2 represented sessions, and 2 session surveys with responses.
- Files changed: `lib/event-intelligence/aggregation.ts`, `lib/event-intelligence/aggregation.test.ts`, `lib/event-closing-brief.ts`, `lib/event-closing-brief.test.ts`, `lib/event-listening-plan.ts`, `lib/event-listening-plan.test.ts`, `app/api/app/events/[eventId]/analysis/route.ts`, `app/api/app/events/[eventId]/analysis/route.test.ts`, `app/api/app/events/[eventId]/route.ts`, `app/api/app/events/[eventId]/voice-surveys/route.ts`, `app/app/events/[eventId]/page.tsx`, `app/app/events/[eventId]/page.test.ts`, and `components/events/EventSessionsIntelligence.tsx`.
- Query/performance impact: no reconciliation writes or GET-time mutations were added. The canonical intelligence read adds one bounded SQL `COUNT` for captured answers and retains parallel reads; the old Events `analysis` route's separate response/AnswerAnalysis scan is bypassed in favor of that aggregate. Profiling the seeded event produced 13 logical SELECTs, 129,242 response bytes, and no pagination regression; adding the five zero-evidence target rows only changes the target-breakdown payload.
- Verification: 150 targeted service/route/component tests passed across Setup, Pre-event, In-event, Post-event, Surveys, and Sessions; `npm run typecheck` passed. Direct canonical-service calls against the QA event produced the values above. No data was written.
- Browser verification still required on port 3001: (1) Setup Overview must show 282 completed responses and 560 captured answers; (2) Pre-event Signals must label its response value as completed and agree when the lifecycle override is selected; (3) In-event Overview/Intelligence must show 282 completed responses, 560 analyzed answers, Positive sentiment, and 107/112 feedback-source coverage; (4) Post-event Closing Brief must show 282 completed responses, 560 analyzed answers, and Mostly positive; (5) Surveys must explain that badges are planner/survey-scoped and their completed counts must total 90 without being presented as the event total; (6) Sessions must show 3 of 3, 2 represented, and explain that per-session completed counts are a scoped subset. Confirm network payloads from `/analysis`, `/intelligence`, `/voice-surveys`, `/agenda?scope=summary`, and `/sessions/intelligence` match those labels.
- Live browser verification: not completed because this session has no live Chrome access, as explicitly allowed for this loop.
- Commit: Prompt 2 commit created after this status update; see git history and loop completion output for the exact hash.

---

## Prompt 3 — Fix intelligence integrity and remaining UX defects

**Model: Terra**  
**Strength: Medium**

```text
Voice Events

Fix the remaining intelligence-integrity and focused UX defects from the final QA report.

QA target:
- Account: events-demo
- Event ID: cmsckubtq0006ve37jzsg1tki

Required work:
1. Evidence/sentiment integrity:
   - prevent positive evidence from appearing under a negative signal unless the UI explicitly explains the contrast
   - verify speaker/session attribution remains event-scoped
   - inspect apparent foreign or templated evidence and prove whether it is seed data or cross-event leakage
   - fix any real scoping leak; do not rewrite evidence merely to make the demo look cleaner
2. Loading and lifecycle truth:
   - replace the transient “No intelligence yet” flash with a proper loading state
   - ensure COMPLETED surveys are not labeled unpublished
   - finish any remaining raw status-pill path so future events cannot display as live solely because a survey is active
3. Workflow/UI defects:
   - block empty required resolution saves with clear inline feedback
   - make the survey Open action work in one click
   - replace “Responses today” where the value is not truly today-scoped
   - fix remaining obvious grammar/taxonomy issues found in the same affected components
4. Add focused regression tests for every corrected behavior.
5. Verify each item live in Chrome and capture evidence for any issue determined to be seed-only rather than a product defect.

Keep this focused. Do not redesign the Signals workspace or modify unrelated action-management behavior.

Return and record:
- root cause/disposition for each listed item
- files changed
- tests and live verification
- any seed-only findings
- commit hash
```

### Prompt 3 completion status

- Evidence/sentiment root cause and fix: the shared evidence panel used the first evidence row's sentiment before the selected finding's aggregate sentiment. A positive row could therefore relabel a negative finding. The panel now keeps the aggregate signal authoritative, explains when a theme contains mixed attendee perspectives, and labels opposite-polarity rows `Contrasting evidence`.
- Attribution/scoping disposition: the evidence service authorizes the EVENTS account/event once, validates survey and structure filters within that event, requires a requested speaker to have an assignment in the event, and constrains both `AnswerEventTheme.eventId` and its normalized intelligence relation by account/event. The route regression was updated to exercise that canonical access context. Read-only QA SQL found zero response/event, target/event, structure/event, assignment/event, session/event, or speaker/account mismatches across normalized intelligence and issue evidence. No product scoping leak was found and no evidence data was rewritten.
- Seed-only finding: the QA event has 283 response rows, of which 282 are deterministic demo responses; all 560 transcripts are `provider=seed`, `model=events-demo-script`, and use `seed-voice-events-demo-v1`. Samples that appear foreign or templated are therefore seeded. Existing-event mode preserves the target event's sessions and speaker assignments, then maps the demo definition set onto those existing records by slug/name/type/order fallback. That can create visibly mismatched demo labels inside this one event (for example a `Day Two Reflection` demo result associated with the preserved `Opening Keynote`, or demo transcript copy naming a different seeded speaker), but the rows remain scoped to this event/account. This is seed association quality, not cross-event leakage, and was left unchanged per the prompt.
- Loading/lifecycle root causes and fixes: the Intelligence view could render with null data while the effect had not yet set `intelligenceLoading`, causing the empty-state flash; the page now derives a pending state until either data or an error exists. Survey lifecycle helpers treated every non-ACTIVE survey as Draft and launch readiness called every non-ACTIVE survey unpublished; COMPLETED now has its own badge/filter/editor copy and the readiness issue is `Survey collection is complete`. The Signals shell used raw event storage status; it now uses the canonical date-derived lifecycle phase, so a future ACTIVE event displays Upcoming rather than Live.
- Workflow fixes: required blocked/terminal action context was enforced only by a disabled Save button, with no reason shown. Save now validates on click, exposes an accessible inline error, clears it on correction/navigation, and retains the canonical server validation. Survey `Open` now uses a direct survey-specific link, so one activation navigates to the selected survey rather than relying on an imperative click handler.
- `Responses today` disposition: no change was made. The only remaining Events Home value is genuinely today-scoped by `Response.status=COMPLETED` and `completedAt >= startOfUtcDay(now) && < next UTC day`; `lib/events-home-metrics.test.ts` retains the regression for that exact window. Replacing the label would make the existing metric less precise.
- Files changed: `app/api/app/events/[eventId]/themes/[themeKey]/evidence/route.test.ts`, `app/app/events/[eventId]/dashboard/page.tsx`, `app/app/events/[eventId]/dashboard/page.test.ts`, `app/app/events/[eventId]/page.tsx`, `app/app/events/[eventId]/page.test.ts`, `app/app/events/[eventId]/edit/page.tsx`, `app/app/events/[eventId]/edit/page.test.ts`, `components/events/EventThemeEvidencePanel.tsx`, `components/admin/Dashboard2.test.ts`, `components/events/EventActionsWorkspace.tsx`, `components/events/EventActionsWorkspace.test.ts`, `lib/survey-availability.ts`, `lib/event-voice-surveys.test.ts`, and this prompt pack.
- Verification: 194 targeted tests passed across the changed UI, lifecycle/service rules, theme-evidence access and scoping, session/speaker intelligence, Home day-window metrics, and canonical action transitions. `npm run typecheck` and `git diff --check` passed. Read-only QA database checks produced the scoping/provenance evidence above. No QA data was written.
- Browser verification still required on port 3001: (1) open Intelligence from a cold navigation and confirm a loading skeleton appears with no `No intelligence yet` flash; (2) open a negative signal containing positive evidence and confirm the negative aggregate remains in the header while the positive row is labeled/explained as contrasting; (3) inspect session and speaker evidence and confirm its displayed source context matches the network evidence payload, while noting the documented seed-only label mismatches; (4) view a COMPLETED survey in the Surveys list and editor and confirm `Completed`, never `Draft` or `unpublished`, with no Publish action; (5) open a future event's Signals view and confirm the shell badge says Upcoming; (6) attempt a blocked or completed action transition with an empty reason/resolution and confirm inline feedback appears and no mutation request is sent, then enter context and confirm save succeeds; (7) click one survey-row `Open` link once and confirm the selected survey editor loads; (8) confirm Events Home `Responses today` agrees with the account metrics response for the current UTC-day window.
- Live browser verification: not completed because this session has no live Chrome access, as explicitly allowed for this loop.
- Commit: Prompt 3 commit created after this status update; see git history and loop completion output for the exact hash.

---

## Prompt 4 — Product-decision audit: event closeout and kiosk context

**Model: Terra**  
**Strength: Medium**

```text
Voice Events

Audit only. Do not change files.

Prepare a concise product decision for the two unresolved Voice Events questions below.

1. Explicit Close/Wrap Event action
- Audit the current date-derived lifecycle, survey lifecycle, action state, Post-event mode, and any event status mutation paths.
- Explain what an explicit close action would actually change or freeze.
- Compare:
  A. no explicit close action
  B. explicit close that changes lifecycle/status only
  C. explicit close that also freezes collection or edits
- Recommend the smallest coherent option for MVP.

2. Kiosk event/survey context and branding
- Audit the current kiosk header, consent screen, account branding, event/survey metadata, and public-link resolver.
- Compare:
  A. generic SignalThread kiosk
  B. account-branded kiosk with event/survey context
  C. fully event-specific branding
- Recommend the smallest coherent option for MVP and identify exactly which existing data can support it.

Return:
- current behavior and exact files involved
- options with user impact and implementation scope
- recommended choice for each decision
- smallest safe implementation prompt for each recommendation
- tests required

Stop after the decision report. Do not implement until Ali approves the choices.
```
