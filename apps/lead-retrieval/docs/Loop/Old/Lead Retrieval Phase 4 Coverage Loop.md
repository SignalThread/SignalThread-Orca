# Lead Retrieval Phase 4 — P0 Coverage Depth Loop

## Repo / Scope

All work is for the Lead Retrieval repo only:

```bash
cd ~/Documents/lead\ retrieval\ app
```

Do **not** use or touch:

```bash
~/Documents/Internal-app
```

This loop is for the Lead Retrieval repo and the Lead Retrieval repo only.

---

## Current State

The core test infrastructure is now in good shape.

Completed:

- Core journey node test foundation exists.
- Playwright browser suite is green.
- Full test runner orchestration is fixed.
- `npm run test:full` now actually runs:
  - all discovered node tests
  - Playwright browser tests
  - typecheck
  - build

Last known validation from the completed infrastructure block:

```text
npm run test:node:all      -> 1,937 passed, 1 skipped, 0 failed
npm run test:journeys      -> 84 passed, 1 skipped
npm run test:workflow      -> 374 passed
npm run test:playwright    -> 215 passed, 37 skipped
npx tsc --noEmit           -> passed
npm run build              -> passed
npm run test:full          -> passed end to end
```

Important: this phase is **not** about fixing broken infrastructure anymore.

This phase is about adding missing high-value P0 coverage depth for real product-critical paths.

---

## What Phase 4 Is

Phase 4 fills the remaining P0 product coverage gaps discovered by the full coverage audit.

These are not necessarily missing features. Many of these features already exist, and some already have node-level, contract-level, or journey-level coverage.

The gap is stronger proof through browser/API/product-truth coverage.

The goal is to prove the most important production paths through realistic surfaces and route behavior, not only isolated helper contracts.

In plain terms:

```text
Not “is there any test?”
But “do we actually trust this production path?”
```

---

## Execution Mode

Run this as a loop.

Do **not** stop after one block unless there is a true hard stop.

For each P0 coverage block:

1. Inspect current code and current tests first.
2. Determine what coverage already exists.
3. Identify the actual missing proof.
4. Add the smallest useful coverage that closes the gap.
5. Do not duplicate existing coverage unnecessarily.
6. Do not fake provider/live coverage.
7. Keep tests deterministic and isolated.
8. Own test data instead of relying on arbitrary shared seed data.
9. Clean up test data in `finally` where needed.
10. Run targeted validation for the new/changed coverage.
11. Run broader validation when the block changes shared behavior.
12. Commit only source/test changes.
13. Continue to the next P0 coverage block.

---

## Hard Stops

Stop only if:

- A product decision is required.
- A provider/live integration cannot be honestly tested without secrets or external setup.
- A required behavior is ambiguous and changing it would alter production semantics.
- The test requires touching protected mobile behavior.
- A real production bug is found and the correct fix would require changing user-facing behavior beyond test coverage.

Protected mobile behavior:

Do **not** change mobile lead posting, mobile recording payloads, additive recording semantics, mobile recording upload payloads, or mobile recording UX without explicit approval.

---

## Do Not Do

Do not:

- Touch `~/Documents/Internal-app`.
- Add broad refactors.
- Skip failing tests just to make the loop green.
- Fake OpenAI, SendGrid, R2, audio provider, Google Sheets, HubSpot, Salesforce, ZoomInfo, Apollo, or PDL coverage and call it live/provider coverage.
- Create brittle tests that depend on arbitrary shared seed data.
- Commit generated Playwright auth/session files.
- Commit `e2e/storage/*.json`.
- Commit `test-results/.last-run.json`.
- Commit unrelated dirty files.
- Commit unrelated doc deletions.
- Change protected mobile recording/lead-posting behavior without approval.

---

## Commit Hygiene

Before each commit:

```bash
git status --short
```

Only commit real source/test changes for the current block.

Do not commit generated files:

```text
e2e/storage/*.json
test-results/.last-run.json
playwright-report/
```

Use non-interactive commits only:

```bash
git commit -m "Add <specific coverage block>"
```

Do not run commands that open Vim or another interactive editor.

---

# Phase 4 P0 Coverage Blocks

## 1. Audio Upload / Status Truth Browser Test

### Goal

Prove the audio/recording upload lifecycle is truthful through browser/API behavior.

Existing journey coverage may already cover audio lifecycle contracts, but this block should close the browser/API truth gap.

### Coverage should verify

- Audio upload or upload-like route behavior.
- Status transitions are truthful.
- Lead detail or the relevant UI reflects the correct audio state.
- Failed, pending, processing, and completed states are not misrepresented.
- Invalid state transitions return stable errors.
- Storage/provider boundaries are honestly gated if not live.
- Test data is isolated and cleaned up.

### Important guardrail

Do not change mobile recording behavior without approval.

Specifically do not change:

- mobile lead posting payloads
- mobile recording upload payload shape
- additive recording semantics
- mobile recording UX

### Validation

Run targeted tests first, then broader validation if shared routes changed.

Expected report:

```text
Files changed
Current coverage found
Gap closed
Validation commands/results
Any provider/live limitation called out honestly
```

---

## 2. Import CSV → Publish Browser Test

### Goal

Prove that CSV lead import can publish real usable leads into the product.

### Coverage should verify

- Upload/import entry point works.
- CSV contract is accepted.
- Preview/review state works if present.
- Publish action creates usable leads.
- Published leads appear in the relevant lead surface.
- Imported lead data is scoped correctly to company/event.
- Invalid CSV or missing required fields returns stable errors.
- Cleanup removes created test data.

### Avoid

- Arbitrary shared data assumptions.
- Depending on whatever lead happens to appear first.
- Over-testing parser internals if those are already covered elsewhere.

### Validation

Run the specific import spec or create one if no suitable spec exists.

Then run:

```bash
npm run test:playwright
```

if browser surfaces changed.

---

## 3. Campaign Builder → Generated Draft Browser Test

### Goal

Prove that the campaign builder flow can create or generate a campaign draft from selected context, signals, and/or leads.

### Coverage should verify

- Campaign builder route loads.
- Required campaign setup fields work.
- Signal/context selection works if applicable.
- Lead/recipient selection works if applicable.
- Draft generation route is called.
- Generated draft appears in the UI.
- Draft state is persisted or reflected correctly.
- Empty/invalid draft generation states fail safely.
- Provider/live LLM behavior is honestly labeled.

### Provider boundary

If the LLM is not actually called, do not call this live provider coverage.

Mark it as:

```text
browser contract coverage
```

or:

```text
provider-gated canary needed
```

depending on what is actually tested.

### Validation

Run targeted campaign builder Playwright coverage and related node contract tests.

---

## 4. Campaign Draft / Send Route Coverage

### Goal

Prove campaign draft/send route behavior is safe, scoped, and correctly gated.

This can be API-level if browser UI is not the right validation layer.

### Coverage should verify

- Draft state transitions.
- Send route rejects invalid states.
- Send route requires correct role/scope.
- Send route does not send without valid recipients.
- Send route does not send without valid content.
- Send route handles already-sent campaigns safely.
- Provider SendGrid behavior is contract/gated unless actually live.
- Sent state and provider IDs/events are handled honestly.
- Viewer/wrong-tenant users cannot send.

### Provider boundary

If SendGrid is not actually called, do not claim live email delivery coverage.

Acceptable labels:

```text
send route contract coverage
SendGrid provider-gated canary still needed
```

### Validation

Run route/API tests plus any existing campaign workflow tests.

---

## 5. Document Upload / Preview / Send Route Coverage

### Goal

Prove document upload, preview, and send/attach behavior through route/API/product truth.

### Coverage should verify

- Upload or presign route behavior.
- Preview route behavior.
- Invalid/missing document handling.
- Send/attach behavior if available.
- Scope/authorization checks.
- Tenant isolation.
- Storage provider boundary is gated honestly if R2 is not actually called.
- Cleanup removes created test records/files where possible.

### Provider boundary

If R2 is not actually called, label the test as route/contract coverage.

Do not fake R2 and call it live storage coverage.

### Validation

Run targeted document route tests and relevant browser tests if UI is touched.

---

## 6. Two-Tenant RBAC Browser Matrix

### Goal

Prove tenant isolation through real browser/API surfaces.

This is one of the most important P0 blocks because RBAC mistakes are high-risk.

### Coverage should verify

- Tenant A cannot see Tenant B leads.
- Tenant A cannot see Tenant B campaigns.
- Tenant A cannot see Tenant B documents/signals where applicable.
- Wrong-role user cannot mutate protected resources.
- Viewer cannot perform exhibitor-admin writes.
- Organizer/platform/exhibitor role boundaries behave as expected.
- API rejects cross-tenant resource access even if route params are guessed.
- UI does not expose obvious forbidden actions to the wrong role.
- Tests own their data and do not rely on arbitrary shared seed state.

### Important

Server-side enforcement is the source of truth.

UI hiding is not enough.

If this block finds a real authorization bug, fix the canonical server-side enforcement path first, then update UI/tests.

### Validation

Run targeted RBAC browser/API tests, then:

```bash
npm run test:playwright
npm run test:node:all
```

if shared auth or scoping helpers changed.

---

## 7. Conversation Upload / Finalize / Chunked Route Coverage

### Goal

Prove conversation/audio upload route behavior for finalize/chunked flows.

This may overlap with audio, but it should specifically cover route-level upload/finalize/chunked behavior.

### Coverage should verify

- Upload initialization route behavior.
- Chunk upload behavior if implemented.
- Finalize route behavior.
- Missing chunks fail safely.
- Duplicate finalize is safe or returns a stable error.
- Wrong lead/company/event scope is rejected.
- Invalid file/session IDs fail safely.
- State is not marked complete unless the route truly finalized.
- Storage/provider boundary is honestly gated if not live.

### Validation

Run targeted route tests first.

If UI or lead detail state changed, run Playwright coverage too.

---

# Final Phase 4 Validation / Audit Prompt

After all seven blocks are complete, run a final validation/audit pass.

## Goal

Confirm Phase 4 coverage depth is actually complete and the suite remains green.

## Commands

```bash
npm run test:node:all
npm run test:journeys
npm run test:workflow
npm run test:playwright
npx tsc --noEmit
npm run build
npm run test:full
```

## Final audit should report

- All files changed across Phase 4.
- All new tests added.
- Which P0 gaps were closed.
- Which provider/live gaps remain intentionally gated.
- Whether any test is contract-only vs live/provider-backed.
- Final pass/fail counts.
- Any remaining product decisions.
- Any remaining skipped tests and whether they are expected.

## Success Criteria

Phase 4 is complete when:

```text
npm run test:full passes
All seven P0 coverage blocks have explicit coverage or documented provider-gated canaries
No generated Playwright files are staged
No unrelated files are committed
No protected mobile behavior was changed without approval
```

---

# Suggested Loop Prompt

Use this prompt to run the Phase 4 loop:

```text
Repo only:
cd ~/Documents/lead\ retrieval\ app

Run Phase 4 P0 Coverage Depth Loop from this document.

Start with Block 1: Audio Upload / Status Truth Browser Test, then continue block-by-block through all seven P0 coverage blocks unless there is a true hard stop.

For each block:
- inspect existing coverage first
- identify the missing proof
- add the smallest deterministic coverage that closes the gap
- avoid duplicate coverage
- do not fake provider/live coverage
- do not touch protected mobile lead posting or recording behavior without approval
- clean up generated Playwright files
- commit only relevant source/test changes
- continue to the next block

Hard stops:
- product decision required
- provider/live test cannot be honestly run without secrets/setup
- required behavior is ambiguous
- protected mobile behavior would need to change

Final target:
npm run test:full passes.

Report after each block:
- files changed
- what coverage already existed
- what gap was closed
- validation commands/results
- whether anything remains provider-gated
```
