# LR Core Journey E2E Plan — Phases 1–4

## Purpose

Turn Lead Retrieval testing from file/function confidence into product-journey confidence.

The goal is not to add one giant brittle E2E suite. The goal is to build a loopable, deterministic test foundation that proves the main jobs users actually do:

- create a lead
- update that lead
- attach/send a document to that lead
- upload/record audio for that lead and get transcript + synthesis
- trigger workflows from that lead
- configure/use an agent
- draft an email from real lead context
- send the drafted email through the supported send path
- prove final product state is terminal, scoped, and truthful

This is **not** the Product Health Center / monitoring dashboard. Monitoring comes after tests and gates exist.

## Why this exists

The Nick recording incident exposed a testing philosophy gap: the system had tests for pieces, but not for the full customer-facing lifecycle. The bug lived between upload row creation, transcription start, synthesis, readiness, workflow resume, terminal state, and UI/API truthfulness.

This plan generalizes that lesson across every core function.

## Operating rules

1. Small prompts only. Do not attempt all phases in one pass.
2. Every prompt must produce a reviewable diff.
3. Every test must own its data or explicitly explain why it cannot.
4. Every created fixture must be tagged with a deterministic `test_run_id` or obvious test prefix.
5. Cleanup must run in `finally` blocks and be safe after partial failure.
6. Do not use customer data.
7. Do not depend on old dirty prod/test users.
8. Do not log transcript contents, audio contents, document contents, provider payloads, or secrets.
9. Prefer API/service integration tests over brittle browser tests unless the repo already has stable UI E2E patterns.
10. Unsupported product areas should be captured as skipped/pending tests or documented gaps, not fake passing tests.
11. Do not change mobile lead posting behavior or mobile recording upload payload shape without explicit approval.
12. This pass is testing infrastructure and regression coverage only, not product redesign.

## Phase breakdown

### Phase 1 — Journey matrix

Create the canonical product journey matrix.

Deliverable:

```text
/tests/journeys/JOURNEY_MATRIX.md
```

The matrix should define:

| Journey | What it proves |
|---|---|
| Lead create | A new lead can be created through the real supported path and scoped correctly. |
| Lead update | Lead editable fields persist and derived fields remain correct. |
| Lead delete | If delete exists, delete behavior is explicit and verified. |
| Lead document | A document can be attached/read in the correct lead/company/event scope. |
| Lead audio lifecycle | Audio upload reaches transcription, synthesis, readiness, terminal display state. |
| Agent create/config | Agent/config can be created and scoped correctly. |
| Agent draft | Agent drafts from real lead/context inputs. |
| Draft send | Draft can be sent or is explicitly skipped if send path is unavailable. |
| Workflow trigger | New/updated lead triggers the correct workflow. |
| Workflow wait/resume | Workflow waits only when required and resumes after context/readiness exists. |
| Cross-surface truth | Mobile/Admin/API/DB agree on lead state. |
| RBAC/scope | Correct users can access correct records; wrong scope is rejected. |
| Golden Exhibitor Journey | Lead capture to completed follow-up action works as one chain. |

Each journey row should include:

- purpose
- setup
- action
- expected DB state
- expected async/worker state
- expected API/UI-visible state
- cleanup
- failure/retry behavior
- current coverage file
- gaps/TODOs

Exit criteria:

- Matrix exists.
- Every major user job has a row.
- Each row identifies whether it is implemented now, partial, pending, or blocked.
- No product code changed unless needed to document existing tests.

---

### Phase 2 — Shared deterministic fixture harness

Build the reusable test helpers before adding lots of tests.

Likely deliverables:

```text
/tests/helpers/journey-fixtures.ts
/tests/helpers/journey-cleanup.ts
/tests/helpers/journey-assertions.ts
/tests/fixtures/audio/
/tests/fixtures/documents/
```

Exact paths should follow existing repo conventions.

Fixture helper capabilities should include, where supported by the current codebase:

```text
createTestRunId()
createTestCompany()
createTestEvent()
createTestExhibitorUser()
createTestViewerUserIfNeeded()
createTestLead()
updateTestLead()
deleteTestLeadIfSupported()
createTestDocumentFixture()
attachDocumentToLeadIfSupported()
createTestAudioFixture()
uploadAudioToLeadIfSupported()
createTestAgentIfSupported()
createTestWorkflowIfSupported()
triggerWorkflowTickIfSupported()
generateDraftIfSupported()
sendDraftIfSupported()
cleanupJourneyFixtures()
```

Harness requirements:

- All helpers are scoped by company/event/user where applicable.
- All records are traceable to `test_run_id`.
- Cleanup does not delete non-test data.
- Cleanup works even if setup failed halfway.
- Helpers use real API/service paths when possible.
- Direct DB inserts are allowed only for setup fixtures when that matches existing test conventions.
- Provider-backed paths skip clearly if env/provider support is missing.

Exit criteria:

- Harness compiles.
- At least one smoke test proves fixture create/cleanup works.
- Matrix updated with harness status.

---

### Phase 3 — Feature-level journey tests

Add feature journey tests one group at a time.

Recommended order:

1. Lead create/update/delete/scope
2. Lead document attach/read/scope
3. Lead audio lifecycle and terminal-state verification
4. Workflow trigger and wait/resume
5. Agent create/draft
6. Draft send
7. Cross-surface truth and RBAC hardening

Likely test files:

```text
/tests/journeys/lead-create.e2e.test.ts
/tests/journeys/lead-update.e2e.test.ts
/tests/journeys/lead-delete.e2e.test.ts
/tests/journeys/lead-document.e2e.test.ts
/tests/journeys/lead-audio-lifecycle.e2e.test.ts
/tests/journeys/workflow-trigger.e2e.test.ts
/tests/journeys/workflow-wait-resume.e2e.test.ts
/tests/journeys/agent-create.e2e.test.ts
/tests/journeys/agent-draft.e2e.test.ts
/tests/journeys/draft-send.e2e.test.ts
/tests/journeys/rbac-scope.e2e.test.ts
```

These files can be combined if the repo’s test conventions favor fewer files.

Each test should assert:

- API/service result
- DB result
- async/worker result where applicable
- user-visible/API display state where applicable
- cleanup result

Exit criteria:

- Implemented product areas have real tests.
- Unsupported areas have skipped/pending tests with exact reasons.
- No fake tests that only assert mocks.
- Matrix updated after every prompt.

---

### Phase 4 — Golden Exhibitor Journey

Add one chained test proving the product promise from lead capture to follow-up action.

Likely deliverable:

```text
/tests/journeys/golden-exhibitor-journey.e2e.test.ts
```

Golden chain:

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
12. Verify agent drafts an email using actual lead context if supported.
13. Send draft through sandbox/test send path if supported.
14. Verify sent state/provider id/timestamp if sending is supported.
15. Verify no stuck workflow waits remain.
16. Verify final API/display state is truthful and terminal.
17. Cleanup every created record.

Exit criteria:

- Golden journey exists.
- Implemented chain steps run for real.
- Unsupported steps are clearly skipped and recorded in the matrix.
- Final state proves no stuck waits/stale processing for created records.

## Loop protocol

After each prompt, Codex/Cursor should report:

```text
Files changed
What was implemented
What was skipped/pending and why
Validation commands run
Test results
New product bugs exposed
Recommended next prompt
```

Then review the diff and only continue once the result is clean.

## Suggested validation commands

Use existing repo scripts, but default target shape is:

```bash
npm run typecheck
npm run build
npm test -- tests/journeys
```

If the repo uses Vitest/Jest/Playwright-specific scripts, follow existing package scripts and document the exact command used.

## Not in scope yet

- Product Health Center UI
- monitoring dashboard
- production canary scheduling
- alerting
- changing mobile capture payloads
- changing mobile recording upload payloads
- replacing workflow behavior
- adding generic Task buttons/surfaces

## Definition of done for Phases 1–4

Phases 1–4 are done when:

1. The journey matrix exists and is accurate.
2. A deterministic fixture harness exists.
3. Feature-level journey tests exist for implemented core functions.
4. Unsupported functions are represented as explicit gaps/skips.
5. The Golden Exhibitor Journey exists and chains the implemented product path.
6. All new tests clean up after themselves.
7. Typecheck/build/relevant tests pass or failures are documented as real product bugs.
