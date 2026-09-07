# Event Mode Product Buildout — Fabel Prompt Queue

## How To Use This File

Use this prompt queue with `EVENT_MODE_BUILDOUT_SUMMARY_FOR_FABEL.md`.

Do not free-run the whole event product.

Execute one prompt at a time.

After each prompt:

1. run verification
2. summarize changed files and behavior
3. commit only the files for that prompt
4. review whether the next prompt still makes sense
5. stop if a stop gate is hit

## Global Rules For Every Prompt

### Critical boundary

Leave retail the fuck alone.

Retail is already a working product surface.

Retail surveys are internally backed by `Event` records, so Event, eventId, `/app/events`, and `/api/app/events` do not automatically mean EVENTS product mode.

The only valid EVENTS product boundary is:

```ts
Account.accountType === "EVENTS"
```

Everything else must default retail-safe:

- `RETAIL`
- `HOSPITALITY`
- missing account type
- unknown account type
- `null`
- `undefined`

### Shared baseline to preserve

The existing app already has a working anonymous kiosk voice flow:

```text
QR/link -> /kiosk?eventId=... -> response create -> answer upload -> transcription -> analysis -> dashboard insights
```

Preserve:

- retail dashboard
- retail survey create/edit
- retail kiosk links
- retail QR codes
- consent/branding
- question voice/TTS
- response capture
- answer upload
- transcription
- analysis
- retail-safe insights

### Controlled-change gates

These are control points, not all hard bans.

Stop before implementation if a prompt unexpectedly touches:

- response/answer pipeline
- transcription/analysis pipeline
- auth/account/product boundary
- retail dashboard
- retail survey create/edit
- shared analytics used by retail
- breaking public API contract changes
- legacy `/api/events/*` behavior
- `/admin/events/*` behavior

### Prisma / schema rule

Prisma schema and migrations are allowed when the current prompt explicitly says schema work is in scope.

If schema work is in scope, Fabel may proceed, but must:

- explain the schema change before editing
- keep the migration production-safe
- avoid destructive changes unless explicitly approved
- preserve existing retail behavior
- run `npx prisma validate`
- run `npx prisma generate`
- run relevant migration/test checks
- summarize migration risk clearly

Stop before implementation if Prisma changes are unexpected, destructive, require backfill/data cleanup, change kiosk/runtime behavior, or alter shared retail data contracts.

### Kiosk / runtime rule

The kiosk is shared infrastructure, but EVENTS work may need to touch kiosk launch/runtime behavior.

Kiosk changes are allowed only when the current prompt explicitly includes kiosk launch/runtime work, such as token launch, QR/link launch behavior, event survey link resolution, or kiosk regression fixes.

Do not touch recording, upload, response finalization, answer processing, transcription, or analysis unless the prompt explicitly includes that pipeline work.

Stop before implementation if kiosk work would fork the kiosk, create a second kiosk flow, change retail `/kiosk?eventId=...`, or alter the response/answer/transcription/analysis pipeline unexpectedly.

### File-count rule

If a task appears to require more than 8 files, pause and summarize why before continuing unless the current prompt already approved a broader multi-file change.

### Verification

After every implementation prompt, run:

```bash
npm run typecheck
```

Run targeted tests for changed files.

Run full tests when practical:

```bash
npm test
```

If Prisma is touched because the current prompt explicitly approved schema/migration work, run:

```bash
npx prisma validate
npx prisma generate
```

If Prisma is touched unexpectedly, stop and return a decision memo before implementation.

---

# Prompt 00 — Preflight / Current State Check

Model: Luna
Strength: Low

Admin / Voice App

Preflight only. Do not change files.

Task:
Confirm the current branch/worktree state before continuing the EVENTS product buildout.

Run:

```bash
git status --short
git branch --show-current
git diff --stat
```

Then inspect whether the product-boundary regression test commit is already present.

Expected prior work:

- `lib/account-product-mode.test.ts`
- `app/app/page.test.ts`
- `app/app/events/[eventId]/page.test.ts`
- route tests for `/structure`, `/voice-surveys`, `/analysis`, `/signals`, `/timeline`, `/evidence`, `/themes/*/evidence`, and `/clusters/*/status`

Return:

1. current branch
2. whether worktree is clean
3. whether Prompt 01 appears already completed
4. any pre-existing changes that should not be staged with future prompts
5. recommended next prompt number

Constraints:

- Do not edit files.
- Do not stage files.
- Do not commit.

---

# Prompt 01 — Product-Boundary Regression Tests

Model: Sol
Strength: Medium

Admin / Voice App

Add product-boundary regression tests for EVENTS mode without changing runtime behavior.

Skip this prompt if these tests already exist and are passing.

Current product baseline:
Retail is a working product surface and must remain untouched.

Retail surveys are internally backed by Event records, so Event, eventId, `/app/events`, or `/api/app/events` does not automatically mean EVENTS product mode.

The only valid EVENTS product boundary is:

```ts
Account.accountType === "EVENTS"
```

Everything else — RETAIL, HOSPITALITY, missing, unknown, null, undefined — must default retail-safe.

Task:
Add regression coverage only. Do not change runtime behavior unless a test reveals an actual bug and the narrowest safe fix is required.

Scope:

- Tests only if possible.
- First identify the exact test files you intend to add or update.
- Do not refactor app code.
- Do not touch Prisma schema or migrations in this test-only prompt.
- Do not touch kiosk runtime in this test-only prompt unless only adding regression tests.
- Do not touch response/answer processing.
- Do not touch shared analytics logic unless only adding tests around existing behavior.

Required test coverage:

1. Non-EVENTS accounts must not render EVENTS command-center/dashboard UI.
2. RETAIL must show the polished retail-safe dashboard.
3. HOSPITALITY, null, undefined, missing, or unknown accountType must default retail-safe.
4. Non-EVENTS accounts must not call or depend on EVENTS-only APIs:
   - `/voice-surveys`
   - `/structure`
   - `/intelligence`
   - `/themes/*/evidence`
   - `/evidence/*`
   - `/clusters/*/status`
5. EVENTS-only copy must not appear for non-EVENTS accounts.
6. Shared retail-safe Event-backed routes must remain valid for retail:
   - `/api/app/events`
   - `/api/app/events/[eventId]`
   - `/analysis`
   - `/signals`
   - `/timeline`
   - `/copy`
   - `/question-audio`

Acceptance checks:

- Tests fail if non-EVENTS accounts render EVENTS dashboard/copy.
- Tests fail if non-EVENTS accounts call EVENTS-only APIs.
- Tests pass for retail-safe shared Event-backed survey behavior.
- Unknown/null/missing accountType defaults retail-safe.
- Existing EVENTS account behavior remains covered.
- `npm run typecheck` passes.
- Run targeted tests.
- Run `npm test` if practical.

Return:

- files changed
- tests added/updated
- whether any runtime code changed
- verification commands run
- test results
- remaining risks

---

# Prompt 02 — Multi-Survey Management Audit

Model: Sol
Strength: Medium

Admin / Voice App

Audit only. Do not change files.

Task:
Audit how EVENTS event voice surveys are currently listed, edited, archived, linked, and launched from the admin UI.

Product question:
The audit found event voice survey management is partially built because only the first survey has edit/manage support. We need to confirm the exact current behavior and the narrowest safe implementation path.

Inspect likely areas:

- `app/app/events/[eventId]/page.tsx`
- `app/app/events/[eventId]/edit/page.tsx`
- `app/app/events/[eventId]/dashboard/page.tsx`
- `app/api/app/events/[eventId]/voice-surveys/route.ts`
- `lib/event-voice-surveys.ts`
- related tests

Return:

1. Current behavior for listing multiple surveys under one Event.
2. Current behavior for editing one selected survey.
3. Current behavior for archiving/deactivating a survey.
4. Current behavior for public link/QR visibility.
5. Exact files involved.
6. Whether implementation needs new API behavior or can use existing API shape.
7. Whether any public kiosk contract would change.
8. Whether any Prisma/schema change would be needed.
9. Recommended implementation plan.
10. Tests that should be added or updated.

Constraints:

- Audit only.
- Do not edit files.
- Do not refactor.
- Do not stage or commit.
- Preserve retail.
- Preserve existing kiosk behavior.

---

# Prompt 03 — Multi-Survey Management Implementation

Model: Terra
Strength: High

Admin / Voice App

Complete multi-survey management for EVENTS accounts, based on the result of Prompt 02.

Current behavior:

- EVENTS accounts can create event voice surveys.
- SurveyTarget / Survey / PublicSurveyLink exists.
- Event detail has Event Structure and survey creation support.
- Kiosk token launch already resolves PublicSurveyLink -> Survey -> SurveyTarget -> Event.
- Response/Answer linkage already supports surveyId, surveyTargetId, publicSurveyLinkId.
- Current management appears to support only the first survey or an incomplete version of edit/manage.

Needed behavior:

1. EVENTS event detail shows all surveys attached to the event.
2. Each survey shows admin context:
   - survey name
   - target / structure item association
   - status
   - public link/token state if available
   - question count
3. Admin can edit a selected survey, not only the first survey.
4. Admin can archive/deactivate a selected survey safely.
5. Archived/inactive surveys are not shown as active launch options.
6. Active token links and kiosk behavior keep working.

Scope:

- EVENTS product mode only.
- First identify the exact files/components/routes to change.
- Do not touch retail dashboard.
- Do not touch retail survey create/edit behavior.
- Do not touch kiosk recording/upload/processing.
- Kiosk launch/link behavior may be touched only if Prompt 02 proves it is required for selected-survey management.
- Do not touch response/answer/transcription/analysis pipeline.
- Prisma schema/migrations are allowed only if Prompt 02 explicitly proves they are required; otherwise avoid schema work in this prompt.
- Pause before continuing if this requires more than 8 files or a breaking public kiosk/API contract change.

Implementation rules:

- Use existing Survey, SurveyTarget, PublicSurveyLink, EventStructureItem, Response, and Answer models.
- Reuse existing event voice survey service logic where possible.
- Keep route handlers thin.
- Put reusable business logic in the existing service/helper layer.
- Maintain EVENTS-only account guardrails.
- Do not create a second event system.
- Do not create a second kiosk flow.
- Do not alter shared retail Event-backed routes unless only adding tests.

Acceptance checks:

- EVENTS account can see multiple surveys under one Event.
- EVENTS account can edit a selected survey.
- EVENTS account can archive/deactivate a selected survey.
- Non-EVENTS accounts cannot access EVENTS-only survey management.
- Retail dashboard and retail survey edit remain unchanged.
- Existing `/kiosk?eventId=...` behavior remains unchanged.
- Existing token kiosk launch for active survey links remains unchanged.
- `npm run typecheck` passes.
- Run targeted tests.
- Run `npm test` if practical.

Return:

- files changed
- behavior changed
- API request/response shape changes, if any
- tests added/updated
- verification commands run
- test results
- assumptions or risks

---

# Prompt 04 — Public Link / QR Lifecycle Audit

Model: Sol
Strength: Medium

Admin / Voice App

Audit only. Do not change files.

Task:
Audit the current lifecycle for `PublicSurveyLink` and QR/link admin UX for EVENTS surveys.

Question to answer:
Can admins view, copy, download QR, deactivate/reactivate, and safely manage public survey links per survey using the current model and APIs?

Inspect likely areas:

- `lib/event-voice-surveys.ts`
- `app/api/app/events/[eventId]/voice-surveys/route.ts`
- event detail/edit components
- QR modal/component utilities if present
- kiosk token resolver paths
- tests around QR/link generation

Return:

1. Current public link creation behavior.
2. Current public link read/list behavior.
3. Current QR generation behavior for retail surveys and event surveys.
4. Whether QR can be reused for token links safely.
5. Whether deactivation/reactivation exists in schema/service.
6. Whether regeneration is safe or would break active deployed QR codes.
7. Exact files involved.
8. Recommended implementation path, preferring no schema if safe.
9. Whether schema/API contract changes are needed and what explicit follow-up prompt would be required.
10. Tests needed.

Constraints:

- Audit only.
- Do not change files.
- Preserve retail QR behavior.
- Preserve kiosk token behavior.

---

# Prompt 05 — Public Link / QR Lifecycle Implementation

Model: Terra
Strength: High

Admin / Voice App

Add EVENTS survey public link and QR management, based on Prompt 04.

Needed behavior:

1. Each active EVENTS survey shows its public launch URL.
2. Admin can copy the link.
3. Admin can view QR for that specific survey link.
4. Admin can download QR PNG if existing QR utility supports it.
5. Admin can see whether the link is active/launchable.
6. Admin can deactivate/reactivate only if current model/service already supports it safely.
7. Existing retail QR behavior remains unchanged.
8. Existing kiosk token launch remains unchanged.

Scope:

- EVENTS survey management UI/API only.
- Reuse existing QR modal/export behavior if available.
- Do not change retail survey QR behavior.
- Do not change kiosk route behavior.
- Do not change `PublicSurveyLink` schema unless Prompt 04 explicitly recommends a schema-backed lifecycle change and the current prompt is updated to approve it.
- Pause before continuing if regeneration or link lifecycle requires schema/migration or a breaking public contract change.

Implementation rules:

- Do not create a second QR system if a reusable QR component/helper exists.
- Do not create new kiosk routes.
- Token URLs should continue to resolve through existing token launch flow.
- Keep inactive/archived survey links from being presented as active launch links.
- Keep route handlers thin.

Acceptance checks:

- EVENTS admin can copy link for each active survey.
- EVENTS admin can view QR for each active survey.
- QR points to the correct token survey link.
- Archived/inactive survey is not presented as launchable.
- Retail QR modal/download/link behavior remains unchanged.
- Existing `/kiosk?eventId=...` behavior remains unchanged.
- Existing token launch remains unchanged.
- `npm run typecheck` passes.
- Run targeted tests.
- Run `npm test` if practical.

Return:

- files changed
- behavior changed
- whether QR code utilities were reused
- API shape changes, if any
- tests added/updated
- verification results
- assumptions or risks

---

# Prompt 06 — Event Settings Audit

Model: Sol
Strength: Medium

Admin / Voice App

Audit only. Do not change files.

Task:
Audit current event metadata/settings support for EVENTS accounts.

Question to answer:
What fields can an EVENTS admin safely manage today without changing schema or breaking retail survey edit flows?

Inspect likely areas:

- `app/app/events/[eventId]/edit/page.tsx`
- `app/app/events/[eventId]/page.tsx`
- `app/api/app/events/[eventId]/route.ts`
- `app/api/app/events/route.ts`
- event service/helpers
- tests for retail event/survey edit

Potential settings to evaluate:

- event name
- description
- status/lifecycle
- start date
- end date
- timezone
- default question voice
- response mode
- branding/consent relationship

Return:

1. Current editable Event fields.
2. Which fields are shared retail survey fields and must not change behavior.
3. Which fields are safe EVENTS-only settings.
4. Whether current API supports these updates.
5. Whether new API shape is needed.
6. Whether any schema change would be required.
7. Recommended implementation plan, preferring existing schema if safe.
8. Whether schema work is actually needed and what explicit follow-up prompt would be required.
9. Tests needed.

Constraints:

- Audit only.
- Do not change files.
- Preserve retail survey edit.
- Do not change shared app event routes without careful boundary checks.

---

# Prompt 07 — Event Settings Implementation

Model: Terra
Strength: Medium

Admin / Voice App

Add an EVENTS-only Event Settings section, based on Prompt 06.

Needed behavior:

1. EVENTS admins can view/edit safe event metadata.
2. Supported fields should be limited to what current schema/API safely supports.
3. Event settings must be clearly EVENTS-only in UI.
4. Retail survey edit behavior must remain unchanged.
5. Unknown/non-EVENTS account types must not see EVENTS settings.

Potential fields if supported:

- event name
- description
- status/lifecycle
- start/end date
- timezone
- default question voice if current model supports it

Scope:

- EVENTS-only settings UI and route/service logic.
- Prisma schema/migrations are allowed only if Prompt 06 explicitly proves they are required and the current prompt is updated to approve them.
- Do not change retail survey edit semantics.
- Pause before continuing if a setting requires schema change or a shared API contract change not already approved by this prompt.

Implementation rules:

- Reuse existing `/api/app/events/[eventId]` only if product boundary stays safe.
- Keep shared routes retail-safe.
- Add tests for non-EVENTS fallback behavior.
- Avoid event-only copy leaking into retail.

Acceptance checks:

- EVENTS admin can update supported event settings.
- Retail survey edit still works as before.
- Non-EVENTS accounts do not see or call event settings behavior.
- Unknown/null accountType defaults retail-safe.
- `npm run typecheck` passes.
- Run targeted tests.
- Run `npm test` if practical.

Return:

- files changed
- supported settings fields
- behavior changed
- API request/response changes, if any
- tests added/updated
- verification results
- assumptions or risks

---

# Prompt 08 — Event Operations Workflow Cleanup

Model: Terra
Strength: High

Admin / Voice App

Improve the EVENTS event detail workflow so admins can understand setup and launch status without changing backend contracts.

Current issue:
EVENTS event detail has pieces of structure, surveys, dashboard links, and setup, but the workflow needs to feel like a coherent event operations setup surface.

Needed behavior:

1. Show a clear event setup progression:
   - event details
   - structure
   - surveys
   - links/QR
   - dashboard/monitoring
2. Make it obvious which surveys are launchable.
3. Make it obvious which structure targets do not yet have a survey.
4. Make dashboard entry obvious for EVENTS accounts.
5. Avoid retail copy and retail dashboard changes.

Scope:

- UI-only if possible.
- EVENTS-only event detail page/components.
- No schema.
- No kiosk.
- No response/answer pipeline.
- No public API contract changes.
- Stop if more than 8 files are needed.

Implementation rules:

- Reuse data already loaded by event detail page where possible.
- Do not introduce broad new data fetching if existing APIs already provide the data.
- Keep copy event-intelligence oriented:
  - attendee sentiment
  - live feedback
  - event operations
  - sessions
  - areas
  - sponsor activations
- Do not use retail/Google review/storefront language.

Acceptance checks:

- EVENTS event detail workflow is clearer.
- Retail dashboard/event pages remain unchanged.
- Non-EVENTS account types do not see EVENTS setup workflow.
- No runtime behavior changes outside EVENTS UI.
- `npm run typecheck` passes.
- Run targeted tests.
- Run `npm test` if practical.

Return:

- files changed
- UI behavior changed
- tests added/updated
- verification results
- assumptions or risks

---

# Prompt 09 — Dashboard Live Refresh Audit

Model: Sol
Strength: Medium

Admin / Voice App

Audit only. Do not change files.

Task:
Audit current EVENTS command center/dashboard data fetching and identify the safest way to add live refresh controls.

Question to answer:
Can we add manual refresh and lightweight polling for EVENTS dashboard only without changing shared analytics behavior or retail dashboard behavior?

Inspect likely areas:

- `app/app/events/[eventId]/dashboard/page.tsx`
- `components/admin/Dashboard2.tsx`
- `/api/app/events/[eventId]/analysis`
- `/api/app/events/[eventId]/signals`
- `/api/app/events/[eventId]/timeline`
- intelligence/evidence APIs used by Dashboard2
- existing dashboard tests

Return:

1. Current data fetching pattern.
2. Which APIs are called by EVENTS dashboard.
3. Which APIs are shared retail-safe.
4. Whether polling should live in page or component.
5. Recommended polling interval or manual refresh-only fallback.
6. How to show last-updated state.
7. Risks to retail.
8. Tests needed.

Constraints:

- Audit only.
- Do not change files.
- Do not alter shared analytics.
- Do not alter retail dashboard.

---

# Prompt 10 — Dashboard Live Refresh Implementation

Model: Terra
Strength: Medium

Admin / Voice App

Add lightweight live refresh controls for EVENTS command center, based on Prompt 09.

Needed behavior:

1. EVENTS dashboard has a manual refresh control.
2. EVENTS dashboard can poll on a safe interval if implementation is low-risk.
3. Show last updated time/state.
4. Avoid duplicate requests when component unmounts or account type is not EVENTS.
5. Retail dashboard must remain unchanged.
6. Shared analytics response shape must remain unchanged.

Scope:

- EVENTS dashboard/page/component only.
- No schema.
- No kiosk.
- No response/answer pipeline.
- No shared analytics semantic changes.
- Stop if API contract changes are required.

Implementation rules:

- Keep polling behind EVENTS rendering only.
- Reuse existing fetch functions where possible.
- Avoid aggressive polling.
- Clean up intervals correctly.
- Preserve existing filters/drilldowns.

Acceptance checks:

- EVENTS dashboard can refresh without full page reload.
- Last updated state is visible.
- Polling/manual refresh does not run for retail dashboard.
- Retail dashboard remains unchanged.
- Existing structure/source filters still work.
- `npm run typecheck` passes.
- Run targeted tests.
- Run `npm test` if practical.

Return:

- files changed
- refresh behavior added
- polling interval if any
- tests added/updated
- verification results
- assumptions or risks

---

# Prompt 11 — Action Briefs Audit

Model: Sol
Strength: Medium

Admin / Voice App

Audit only. Do not change files.

Task:
Audit existing event intelligence, attention queue, clusters, status, evidence, and theme APIs to determine how to build an action brief MVP without schema changes.

Question to answer:
Can we create operator-ready action briefs from existing normalized intelligence/evidence data without adding new tables?

Inspect likely areas:

- `lib/event-intelligence/**`
- `components/admin/Dashboard2.tsx`
- `/api/app/events/[eventId]/intelligence`
- `/api/app/events/[eventId]/themes/[themeKey]/evidence`
- `/api/app/events/[eventId]/evidence/[evidenceId]`
- `/api/app/events/[eventId]/clusters/[clusterId]/status`
- tests around intelligence gates/evidence/status

Return:

1. Current intelligence data available.
2. Current attention queue/cluster model behavior.
3. Whether cluster/status can support action workflow now.
4. Whether a brief can be derived at read time.
5. Whether persistence is needed.
6. Recommended MVP, preferring no schema if safe.
7. API/UI files likely involved.
8. Tests needed.
9. Whether persistence/schema/API contract changes are needed and what explicit follow-up prompt would be required.

Constraints:

- Audit only.
- Do not change files.
- Prefer no-schema first pass.
- If schema is required, return a schema decision memo instead of implementing.
- Preserve retail.

---

# Prompt 12 — Action Briefs MVP Implementation

Model: Terra
Strength: High

Admin / Voice App

Build an EVENTS-only action briefs MVP from existing intelligence/evidence data, based on Prompt 11.

Needed behavior:

1. EVENTS command center shows an action brief view/section.
2. Briefs are generated from existing intelligence, attention queue, cluster, theme, evidence, and structure data.
3. Each brief should include:
   - issue/opportunity title
   - short summary
   - affected area/session/target if available
   - evidence count
   - sentiment or severity signal if available
   - recommended operator action
   - link/drilldown to evidence
4. Prefer no persistence/schema first pass; if persistence is required, pause and return a schema decision memo.
5. Retail remains unchanged.

Scope:

- EVENTS dashboard/intelligence UI/service only.
- Prefer no Prisma schema/migrations for this MVP; if persistence/schema is required, pause and return a schema decision memo.
- No kiosk runtime changes.
- No response/answer pipeline.
- No retail dashboard changes.
- Stop if persistence or new public API contract is required.

Implementation rules:

- Derive briefs from existing data.
- Keep business logic in service/helper layer if transformation is non-trivial.
- Keep route handlers thin if any API is touched.
- Do not create duplicate intelligence systems.
- Preserve existing evidence drilldowns.

Acceptance checks:

- EVENTS dashboard shows action briefs from existing data.
- Briefs include evidence-backed context.
- Evidence drilldown still works.
- Empty state is clear when no intelligence exists.
- Non-EVENTS accounts cannot see action briefs.
- Retail dashboard unchanged.
- `npm run typecheck` passes.
- Run targeted tests.
- Run `npm test` if practical.

Return:

- files changed
- action brief data source
- behavior changed
- tests added/updated
- verification results
- assumptions or risks

---

# Prompt 13 — Action Brief Status Workflow

Model: Terra
Strength: Medium

Admin / Voice App

Add action brief status workflow only if the existing cluster/status model supports it safely.

Precondition:
Prompt 11 or 12 must confirm existing status APIs can support this without schema changes.

Needed behavior:

1. EVENTS admin can mark a brief/cluster as:
   - new/open if current model supports it
   - investigating
   - resolved
   - dismissed
2. Status updates use existing EVENTS-only cluster/status API if available.
3. UI reflects updated status.
4. Retail remains unchanged.

Scope:

- EVENTS dashboard/status UI only.
- Existing status API only.
- No schema.
- No new persistence model.
- Stop if current model cannot support it cleanly.

Acceptance checks:

- Status can be changed for EVENTS action brief/cluster.
- Status change persists using existing model/API.
- Evidence and drilldowns still work.
- Non-EVENTS cannot access status API/UI.
- Retail unchanged.
- `npm run typecheck` passes.
- Run targeted tests.
- Run `npm test` if practical.

Return:

- files changed
- status values supported
- API used
- tests added/updated
- verification results
- assumptions or risks

---

# Prompt 14 — Export / Share Action Brief MVP

Model: Terra
Strength: Medium

Admin / Voice App

Add a no-schema export/share MVP for EVENTS action briefs and event summaries.

Needed behavior:

1. Admin can copy an action brief summary.
2. Admin can copy an event-level operations summary.
3. Export text should be useful for Slack/email/internal notes.
4. Include evidence-backed details, not generic filler.
5. Prefer no schema/persistence first pass; if persistence is required, pause and return a schema decision memo.
6. Retail remains unchanged.

Scope:

- EVENTS dashboard/action brief UI only.
- Prefer no Prisma schema/migrations for this MVP; if persistence/schema is required, pause and return a schema decision memo.
- No server-side PDF/doc generation.
- No public API contract changes unless existing data is insufficient and approved.
- Stop if persistence or document generation is required.

Implementation rules:

- Generate plain text or markdown client-side/service-side from existing data.
- Do not add external dependencies unless already present and justified.
- Keep copy event-operations oriented.

Acceptance checks:

- Admin can copy brief text.
- Admin can copy event summary text.
- Empty state is clear.
- Retail unchanged.
- `npm run typecheck` passes.
- Run targeted tests.
- Run `npm test` if practical.

Return:

- files changed
- export/share behavior added
- text format used
- tests added/updated
- verification results
- assumptions or risks

---

# Prompt 15 — Sponsor Activation Value Audit

Model: Sol
Strength: Medium

Admin / Voice App

Audit only. Do not change files.

Task:
Audit whether existing EventStructureItem, sponsor activation structure, intelligence entities/themes, and evidence can support a sponsor activation value MVP without schema changes.

Question to answer:
Can we show sponsor activation insight/value reporting using existing structure and intelligence data?

Inspect likely areas:

- event structure service/types
- dashboard structure filters
- intelligence entity/theme extraction/read services
- Dashboard2 UI
- evidence APIs
- tests for structure filters and intelligence gates

Return:

1. How sponsor activations are represented today.
2. Whether sponsor activations can be filtered in dashboard today.
3. Whether intelligence/evidence can be attributed to sponsor activation structure items.
4. What value metrics can be shown with existing data.
5. What cannot be shown without schema.
6. Recommended MVP, preferring no schema if safe.
7. Tests needed.
8. Whether schema/migration is needed and what explicit follow-up prompt would be required.

Constraints:

- Audit only.
- Do not change files.
- Prefer no-schema first pass.
- If schema is required, return a schema decision memo instead of implementing.
- Preserve retail.

---

# Prompt 16 — Sponsor Activation Value MVP

Model: Terra
Strength: High

Admin / Voice App

Build a sponsor activation value MVP based on Prompt 15, preferring existing data first.

If Prompt 15 shows that useful sponsor value requires schema changes, do not force a fake no-schema version. Return a schema decision memo instead.

Needed behavior:

1. EVENTS dashboard can show sponsor activation insights when sponsor activation structure items exist.
2. Sponsor activation view should include available evidence-backed signals such as:
   - mentions
   - sentiment
   - themes
   - attendee quotes/evidence snippets
   - issues/opportunities
3. Use existing structure and intelligence data.
4. Retail remains unchanged.

Scope:

- EVENTS dashboard/service/UI only.
- Prefer no Prisma schema/migrations for this MVP; if a sponsor/exhibitor model is required, pause and return a schema decision memo.
- Do not create a new sponsor/exhibitor model unless a schema prompt explicitly approves it.
- Pause before continuing if attribution cannot be done with existing data.

Implementation rules:

- Do not invent metrics not supported by data.
- Clearly label derived summaries.
- Reuse existing filters/evidence drilldowns.
- Do not create a separate sponsor reporting system.

Acceptance checks:

- Sponsor activation section appears only for EVENTS when relevant data exists.
- Empty state is clear when no sponsor activation data exists.
- Evidence drilldown works.
- Retail unchanged.
- `npm run typecheck` passes.
- Run targeted tests.
- Run `npm test` if practical.

Return:

- files changed
- sponsor signals shown
- data source used
- tests added/updated
- verification results
- assumptions or risks

---

# Prompt 17 — Kiosk Regression Suite For Token + Retail

Model: Sol
Strength: High

Admin / Voice App

Add kiosk/runtime regression tests for EVENTS token launch and retail eventId launch without changing runtime behavior.

Task:
Protect the shared kiosk pipeline now that EVENTS token survey launch exists.

Required coverage:

1. Existing `/kiosk?eventId=...` behavior still works.
2. Token launch resolves `PublicSurveyLink -> Survey -> SurveyTarget -> Event`.
3. Token launch creates/uses response context correctly.
4. Retail eventId launch still loads event-level questions.
5. EVENTS token launch loads survey-specific questions.
6. Invalid/inactive/expired token fails cleanly if supported by current logic.
7. Retail Google review helper still only appears via configured URL.
8. No normalized EVENTS intelligence is written for non-EVENTS accounts.

Scope:

- Tests first.
- Runtime changes are allowed only if a true kiosk launch/runtime regression is found and the fix is narrow.
- Do not refactor kiosk.
- Do not fork kiosk or create a second kiosk flow.
- Do not change recording/upload/response finalization/answer processing unless a test proves existing behavior is wrong and approval is given.

Acceptance checks:

- Targeted kiosk/response tests pass.
- Retail eventId behavior passes.
- EVENTS token behavior passes.
- `npm run typecheck` passes.
- Run targeted tests.
- Run `npm test` if practical.

Return:

- files changed
- tests added/updated
- whether runtime changed
- verification results
- assumptions or risks

---

# Prompt 18 — Legacy Public/Admin Route Audit

Model: Sol
Strength: Medium

Admin / Voice App

Audit only. Do not change files.

Task:
Audit legacy `/api/events/[eventId]/*` and `/admin/events/*` routes and document their current usage, risk, and future handling.

Context:
These routes are eventId-based and may be public/legacy/admin/demo surfaces. They should not become the new EVENTS product source of truth without explicit approval.

Inspect:

- `/api/events/[eventId]/*`
- `/admin/events/*`
- any client callers
- tests
- comments/docs that imply current ownership

Return:

1. List of legacy routes.
2. Current callers.
3. Auth/account/product boundary behavior.
4. Whether each route is still used.
5. Which routes are safe to leave alone.
6. Which routes need tests/docs.
7. Which routes may need hardening later.
8. Risk of changing each route.
9. Recommended plan that preserves kiosk/runtime/admin behavior.

Constraints:

- Audit only.
- Do not change files.
- Do not harden behavior yet.
- Do not break public/runtime/admin flows.

---

# Prompt 19 — Legacy Route Documentation / Source Guards

Model: Terra
Strength: Medium

Admin / Voice App

Add documentation and source-level guardrails for legacy public/admin event routes, based on Prompt 18.

Needed behavior:

1. Future contributors understand `Event` does not mean EVENTS product mode.
2. Legacy `/api/events/*` routes are documented as legacy/shared/public/admin depending on audit result.
3. New EVENTS features should not be built on these routes without approval.
4. Add tests/source guards only where safe.
5. No runtime behavior change unless explicitly approved.

Scope:

- Docs/comments/tests only if possible.
- No auth behavior changes.
- No kiosk behavior changes unless the current prompt explicitly scopes a kiosk launch/runtime guard.
- No public API contract changes.
- Stop before hardening behavior.

Acceptance checks:

- Docs/comments clearly explain route ownership.
- Source/tests reduce chance of accidental new EVENTS usage.
- Runtime behavior unchanged.
- `npm run typecheck` passes.
- Run targeted tests.
- Run `npm test` if practical.

Return:

- files changed
- docs/tests added
- whether runtime changed
- verification results
- assumptions or risks

---

# Prompt 20 — Event Help Docs Audit / Draft

Model: Terra
Strength: Medium

Admin / Voice App

Audit and draft customer-facing EVENTS help docs only after the event setup and dashboard workflows are real.

Task:
Create draft help documentation for EVENTS mode based on implemented UI behavior.

Topics:

- creating an event
- defining event structure
- creating surveys for sessions/areas/sponsor activations
- sharing QR/token links
- running live attendee voice capture
- using event command center
- reading action briefs
- exporting/sharing summaries

Scope:

- Docs only.
- Do not change product code.
- Do not describe unbuilt features as available.
- Mark uncertain workflows as needs product review.

Acceptance checks:

- Docs match current UI.
- Retail help docs remain accurate.
- No product code changed.

Return:

- files changed
- docs added/updated
- unbuilt or uncertain features marked clearly

