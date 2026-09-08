# LR Core Journey E2E Prompt Pack — Phases 1–4

Use these prompts one at a time. Do not paste the whole file into Codex/Cursor at once.

Before starting each prompt, make sure you are in the Admin repo root and check the working tree:

```bash
cd <admin repo root>
git status --short
```

If there are unrelated dirty files, stop and decide whether to stash/commit before continuing.

---

## Prompt 1 — Create the journey matrix only

```text
Create the Phase 1 core product journey matrix only. Do not add test harness code yet. Do not add product code.

Context:
We are moving Lead Retrieval testing from isolated file/function confidence to product journey confidence. The Nick audio incident showed that isolated tests missed failures across upload row creation, transcription start, synthesis, readiness, workflow resume, terminal state, and UI/API truthfulness. That lesson now applies to all core product functions, not just audio.

Create a canonical test plan document at the repo-conventional location, preferably:

/tests/journeys/JOURNEY_MATRIX.md

If that path conflicts with existing structure, choose the closest existing test/docs convention and explain why.

The matrix must cover these journeys:
1. Lead create
2. Lead update
3. Lead delete, if supported
4. Lead document attach/send/read
5. Lead audio lifecycle
6. Agent create/config
7. Agent draft generation
8. Draft send
9. Workflow trigger on new lead
10. Workflow trigger on updated lead, if supported
11. Workflow wait/resume
12. Cross-surface lead truth
13. RBAC/scope enforcement
14. Golden Exhibitor Journey

For each journey, include:
- purpose
- setup
- action
- expected DB state
- expected async/worker state
- expected API/UI-visible state
- cleanup
- failure/retry behavior
- current coverage file, if any
- status: implemented / partial / pending / blocked
- gaps/TODOs

Rules:
- Inspect existing tests and code enough to avoid inventing feature names/routes that do not exist.
- If a product area is not implemented, mark it pending/blocked with a clear reason.
- Do not create fake coverage claims.
- Do not change product code.
- Do not change mobile lead posting or mobile recording upload behavior.

Validation:
- No test run is required unless docs linting exists.
- Run the smallest relevant validation if the repo has markdown/docs checks.

Deliver a final summary with:
- files added/changed
- journeys listed
- major current coverage gaps
- recommended next prompt
```

---

## Prompt 2 — Build the fixture harness skeleton and cleanup safety

```text
Implement the Phase 2 shared deterministic journey test harness skeleton. Do not add the full feature E2E suite yet.

Start by reading /tests/journeys/JOURNEY_MATRIX.md and existing test helper conventions.

Add repo-conventional helper files, likely under:

/tests/helpers/journey-fixtures.ts
/tests/helpers/journey-cleanup.ts
/tests/helpers/journey-assertions.ts

If the repo uses a different helper structure, follow that instead and explain why.

Implement helpers for the currently supported setup primitives only. Prefer real existing test conventions over inventing new abstractions.

Required helper goals:
- createTestRunId()
- deterministic test prefix/tagging
- cleanup registry that can clean up in reverse dependency order
- safe cleanup after partial setup failure
- helpers for company/event/user/lead creation if existing tests already support or require them
- assertion helpers for scoping and “record belongs to test run” where practical

Rules:
- Every created record must be traceable to test_run_id or a deterministic test prefix.
- Cleanup must never delete non-test data.
- Cleanup must be safe if a setup step failed halfway.
- Prefer API/service paths where existing tests use them.
- Direct DB insert is allowed only for setup fixtures if that is the project’s existing test convention.
- Do not log secrets or provider payloads.
- Do not add provider/audio/document logic yet unless trivial fixtures already exist.
- Do not change product behavior.
- Do not change mobile lead posting or mobile recording upload payloads.

Add one tiny smoke test if appropriate to prove the harness can create and cleanup a minimal fixture without leaking data. If this is not possible yet because env/test DB setup is missing, add a skipped/pending test with a precise reason and update the matrix.

Update JOURNEY_MATRIX.md with harness status and any discovered constraints.

Validation:
Run the narrowest relevant test command for the new harness/smoke test, then run typecheck if required by repo convention.

Deliver a final summary with:
- files added/changed
- helpers added
- cleanup guarantees
- skipped/pending items and why
- validation commands run
- recommended next prompt
```

---

## Prompt 3 — Lead create/update/delete journey tests

```text
Implement feature-level journey tests for lead create, lead update, and lead delete if delete is supported.

Start by reading:
- /tests/journeys/JOURNEY_MATRIX.md
- existing lead tests
- existing API/service routes for lead create/update/delete
- the journey fixture helpers from Prompt 2

Add or update repo-conventional tests, likely:

/tests/journeys/lead-create.e2e.test.ts
/tests/journeys/lead-update.e2e.test.ts
/tests/journeys/lead-delete.e2e.test.ts

Combining files is okay if existing conventions favor that.

Lead create test must prove:
- clean test company/event/exhibitor setup exists or is created
- lead is created through the real supported path, not by faking final state
- lead row exists
- company_id/event_id/owner_user_id are correct where applicable
- default status/priority/rating/follow-up behavior matches current product behavior
- created lead is traceable to test_run_id
- cleanup removes only created test data

Lead update test must prove:
- create a lead
- update supported editable fields such as full_name, job_title, company_text, rating, follow_up_date, status, temperature where supported
- DB reflects the update
- derived priority_score updates correctly if rating maps to priority_score
- the updated state can be read through the same API/service path the app/admin uses
- cleanup works

Lead delete test, only if delete exists:
- create a lead
- delete through the real delete API/service
- assert the exact intended end state
- do not silently convert delete to archive/soft-delete
- if delete is not implemented, add a skipped/pending test and document the gap in JOURNEY_MATRIX.md

Rules:
- Do not change product behavior except small testability fixes if absolutely required.
- Do not introduce Archive as a substitute for Delete.
- Do not touch mobile lead posting payloads.
- Tests must clean up in finally blocks.
- No hidden reliance on pre-existing mutable rows.

Update JOURNEY_MATRIX.md with coverage status.

Validation:
Run the new lead journey tests and typecheck/build if repo convention requires.

Deliver a final summary with:
- files added/changed
- tests added
- delete support status
- validation commands run
- failures/product bugs exposed
- recommended next prompt
```

---

## Prompt 4 — Lead document journey test

```text
Implement the lead document attach/read/scope journey test for currently supported product paths.

Start by reading:
- /tests/journeys/JOURNEY_MATRIX.md
- existing document/upload/storage tests
- existing lead detail/context/document code
- existing R2/Supabase storage helpers
- journey fixture helpers

Add or update a repo-conventional test, likely:

/tests/journeys/lead-document.e2e.test.ts

The test should prove, where supported:
- create clean test company/event/user/lead
- attach or upload a small safe document fixture to the lead through the real supported path
- document/storage/object row is linked to the correct lead/company/event
- authorized user can read/access it through the supported path
- wrong company/event scope cannot read/access it if feasible with current helpers
- agent/workflow context can see the document if that feature exists
- cleanup removes only test-created document/storage/db records

If lead documents are not implemented yet:
- add a skipped/pending test with exact reason
- update JOURNEY_MATRIX.md with the blocked/pending status
- do not fake document coverage by inserting unrelated rows

Rules:
- Do not log document contents.
- Do not use customer files.
- Use a tiny fixture with safe dummy content.
- Do not add product features in this prompt unless a tiny non-user-facing test helper is required.
- Do not broaden into audio, workflows, or agent tests yet.

Update JOURNEY_MATRIX.md with coverage status.

Validation:
Run the document journey test and any narrow storage/document tests affected.

Deliver a final summary with:
- files added/changed
- test behavior
- unsupported gaps
- validation commands run
- failures/product bugs exposed
- recommended next prompt
```

---

## Prompt 5 — Lead audio lifecycle journey test

```text
Implement the lead audio lifecycle journey test. This is the Nick-incident regression lane, but it must use the shared journey harness and fit the broader product journey suite.

Start by reading:
- /tests/journeys/JOURNEY_MATRIX.md
- existing audio/conversation lifecycle tests
- upload route/service code
- transcription/synthesis/readiness/reconciler code
- workflow wait/resume tests if they exist
- journey fixture helpers

Add or update a repo-conventional test, likely:

/tests/journeys/lead-audio-lifecycle.e2e.test.ts

The test should prove, where supported:
- create clean test company/event/user/lead
- upload a known short safe audio fixture through the real supported server path
- conversation row is created
- transcription starts or is queued
- transcript reaches a terminal state
- synthesis reaches a terminal state
- readiness updates if readiness exists
- workflow waits clear if applicable
- no stale pending/processing/completed-pending state remains after the supported tick/reconciler path
- API/display-state no longer reports indefinite “processing” when terminal
- cleanup removes only test-created rows/storage objects

Also add targeted cases where feasible:
- completed transcript + pending synthesis is recoverable without overwriting transcript
- empty/no-speech recording reaches safe terminal display state if fixture/support exists
- non-critical readiness/workflow side-effect failure does not prevent transcription from starting, if this can be tested without heavy mocking of the core rule

Rules:
- Do not change mobile recording upload payload shape or mobile recording behavior.
- Do not use customer audio.
- Do not log audio contents or transcript contents.
- Do not fake the processing chain by directly inserting final completed states.
- If real provider calls are unavailable in test env, use existing test/sandbox provider behavior. If none exists, add skipped/pending coverage with exact reason and update the matrix.

Update JOURNEY_MATRIX.md with coverage status.

Validation:
Run the audio journey test plus existing conversation/reconciler/workflow lifecycle tests impacted.

Deliver a final summary with:
- files added/changed
- lifecycle states covered
- skipped/pending cases and why
- validation commands run
- failures/product bugs exposed
- recommended next prompt
```

---

## Prompt 6 — Workflow trigger and wait/resume journey tests

```text
Implement workflow trigger and workflow wait/resume journey tests for new/updated leads.

Start by reading:
- /tests/journeys/JOURNEY_MATRIX.md
- existing workflow execution tests
- workflow trigger code
- workflow wait/reason/readiness code
- lead update/create tests from prior prompts
- audio/document journey tests if present

Add or update repo-conventional tests, likely:

/tests/journeys/workflow-trigger.e2e.test.ts
/tests/journeys/workflow-wait-resume.e2e.test.ts

The trigger test should prove, where supported:
- create clean company/event/exhibitor user
- create workflow/agent/rule that should run on a new lead
- create a new lead through the real supported path
- workflow run is created
- run references correct lead/company/event
- run state is correct
- cleanup works

If updated-lead triggers are supported, add coverage:
- create lead
- update lead through supported path
- assert workflow trigger behavior is correct
- if updates are not supposed to trigger, assert that explicitly and document it

The wait/resume test should prove, where supported:
- workflow waits for audio transcript/insights/doc only when required
- upload/attach required context through supported path
- run tick/reconciler if required
- wait clears
- workflow resumes
- no stuck waits remain for the created test lead/workflow

Rules:
- Do not fake workflow completion by directly setting final status unless using an existing low-level unit test pattern. Journey tests should use real trigger/tick paths.
- Do not broaden into agent draft/send yet unless workflow requires an existing minimal action.
- Tests must clean up created runs/configs/leads.
- Do not change product behavior unless a real product bug is found; report bugs clearly.

Update JOURNEY_MATRIX.md with coverage status.

Validation:
Run new workflow journey tests plus existing workflow tests.

Deliver a final summary with:
- files added/changed
- trigger behavior proven
- wait/resume behavior proven
- any workflow behavior clarified
- validation commands run
- failures/product bugs exposed
- recommended next prompt
```

---

## Prompt 7 — Agent create, draft generation, and draft send journey tests

```text
Implement journey tests for agent create/config, agent draft generation, and draft send where supported.

Start by reading:
- /tests/journeys/JOURNEY_MATRIX.md
- existing agent/signal/campaign tests
- campaign draft generation route/service
- message send route/service/provider integration
- RBAC matrix/tests
- journey fixture helpers

Add or update repo-conventional tests, likely:

/tests/journeys/agent-create.e2e.test.ts
/tests/journeys/agent-draft.e2e.test.ts
/tests/journeys/draft-send.e2e.test.ts

Agent create/config test should prove, where supported:
- create clean company/event/user
- create agent/config through real supported path
- scope is correct
- allowed role can read/use it
- unauthorized scope cannot read/use it if feasible
- cleanup works

Agent draft test should prove, where supported:
- create lead with meaningful test fields
- attach doc/audio/context if supported, or seed minimal context through existing test-safe helpers
- create required campaign/workflow/agent config
- run draft generation through real path
- draft exists
- draft links to correct lead/campaign/message
- draft uses correct lead context
- draft does not leak raw provider error/internal enum/storage path
- cleanup works

Draft send test should prove, where supported:
- create/generate draft
- send through sandbox/test provider path if available
- state moves to sent
- sent_at/provider_message_id/equivalent is stored if applicable
- duplicate send is blocked or idempotent
- cleanup works

If send provider is not implemented or not configured:
- mark test skipped/pending with exact reason
- do not fake sent state
- update JOURNEY_MATRIX.md

Rules:
- Do not send real customer emails.
- Use sandbox/test provider behavior only.
- Do not log provider payloads or secrets.
- Do not create generic visible “Task” buttons/surfaces.
- Do not change assignment/tasking APIs unless required by existing product behavior.

Update JOURNEY_MATRIX.md with coverage status.

Validation:
Run new agent/campaign/draft/send journey tests plus existing campaign workflow tests.

Deliver a final summary with:
- files added/changed
- tests added
- send path status
- validation commands run
- failures/product bugs exposed
- recommended next prompt
```

---

## Prompt 8 — RBAC/scope and cross-surface truth journey tests

```text
Implement RBAC/scope and cross-surface truth journey coverage.

Start by reading:
- /tests/journeys/JOURNEY_MATRIX.md
- existing RBAC tests
- existing lead/campaign/signal API auth checks
- app/admin shared schema contracts
- journey fixture helpers

Add or update repo-conventional tests, likely:

/tests/journeys/rbac-scope.e2e.test.ts
/tests/journeys/cross-surface-lead-truth.e2e.test.ts

RBAC/scope test should prove, where feasible:
- create company A and company B
- create users/roles needed for allowed and disallowed access
- create lead/doc/workflow/draft under company A
- company A user can access allowed resources
- company B user cannot access company A resources
- viewer/exhibitor_admin/platform_admin permissions match current RBAC behavior
- write operations are rejected for unauthorized roles
- cleanup works

Cross-surface truth test should prove, where supported by current test access:
- create/update lead through one supported path
- read through the path used by another surface/API/service
- assert core shared fields agree: full_name, job_title, company_text, rating, priority_score, status, follow_up_date, temperature, event/company scope
- assert no stale derived state causes false display/action behavior
- cleanup works

Rules:
- Server-side enforcement matters more than hidden/disabled UI controls.
- Do not rely on UI hiding as proof of authorization.
- Do not add broad RBAC refactors.
- If a mismatch is found, report it as a product bug rather than patching broadly.

Update JOURNEY_MATRIX.md with coverage status.

Validation:
Run new RBAC/cross-surface tests plus existing auth/RBAC tests.

Deliver a final summary with:
- files added/changed
- scope rules proven
- cross-surface fields proven
- validation commands run
- failures/product bugs exposed
- recommended next prompt
```

---

## Prompt 9 — Golden Exhibitor Journey chained test

```text
Implement the Phase 4 Golden Exhibitor Journey chained test using the journey harness and previously added feature tests.

Start by reading:
- /tests/journeys/JOURNEY_MATRIX.md
- all existing /tests/journeys/* tests
- journey fixture helpers
- known skipped/pending gaps

Add one repo-conventional chained test, likely:

/tests/journeys/golden-exhibitor-journey.e2e.test.ts

The Golden journey should chain the real supported product sequence:

1. Create clean test company/event/exhibitor user.
2. Create workflow/agent for new leads if supported.
3. Add a new lead.
4. Update that lead.
5. Attach/upload/send a small test document to that lead if supported.
6. Upload known short audio fixture for that lead if supported.
7. Verify transcript and synthesis complete if audio is supported.
8. Verify readiness state if readiness exists.
9. Verify workflow sees the new lead.
10. Verify workflow waits for audio/doc/insights only when expected.
11. Verify workflow resumes once readiness/context exists.
12. Verify agent drafts an email using the actual lead context if supported.
13. Send draft through sandbox/test send path if supported.
14. Verify sent state/provider id/timestamp if sending is supported.
15. Verify no stuck workflow waits remain for this test run.
16. Verify final API/display state is truthful and terminal.
17. Cleanup every created record.

Important:
- Do not fake the chain by directly inserting final states.
- Run implemented steps for real.
- Conditionally skip unsupported steps with explicit reasons.
- The test should make product gaps visible, not hide them.
- Cleanup must run even if the chain fails halfway.
- Do not use customer data, real customer emails, customer audio, or customer docs.
- Do not change mobile lead posting/recording upload payloads.

Update JOURNEY_MATRIX.md so the Golden journey row accurately lists:
- covered steps
- skipped steps and why
- remaining blockers

Validation:
Run the Golden journey test and the full /tests/journeys suite. Also run typecheck/build if repo convention requires.

Deliver a final summary with:
- files added/changed
- Golden chain steps covered
- skipped steps and why
- validation commands run
- product bugs exposed
- whether Phases 1–4 are now complete
- recommended next phase/prompt
```

---

## Prompt 10 — Final cleanup, matrix reconciliation, and validation pass

```text
Do a final Phase 1–4 reconciliation pass. Do not add new product functionality.

Review:
- /tests/journeys/JOURNEY_MATRIX.md
- journey helper files
- all /tests/journeys/* tests
- package scripts/test commands

Tasks:
1. Ensure JOURNEY_MATRIX.md accurately reflects the implemented tests.
2. Remove duplicate/stale TODOs that are no longer true.
3. Ensure skipped/pending tests include exact reasons.
4. Ensure cleanup helpers are used consistently.
5. Ensure test_run_id/prefix tagging is consistent.
6. Ensure no tests depend on dirty historical data.
7. Ensure no tests log secrets, transcripts, audio contents, document contents, or provider payloads.
8. Ensure validation commands are documented in the final summary.
9. Do not broaden scope into Product Health Center, monitoring UI, production canaries, or alerting.

Validation:
Run:
- typecheck
- build
- full journey test suite
- any existing affected workflow/audio/campaign/lead tests

Use the repo’s actual package scripts. If a command fails, report whether it is a product bug, test setup issue, or expected skipped provider/env limitation.

Deliver a final summary with:
- final files changed
- journey coverage table
- skipped/pending coverage table
- validation commands and results
- known product bugs exposed
- recommendation for next work: deploy gates/canaries/Product Health Center
```
