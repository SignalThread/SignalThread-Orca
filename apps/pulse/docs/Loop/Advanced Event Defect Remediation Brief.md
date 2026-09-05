# Advanced Event Defect Remediation Brief

## Purpose

This brief turns the Advanced Event end-to-end audit into a controlled remediation plan.

The audit found 22 defects. D2, the assignment lifecycle blocker, was handled separately because it was the highest-risk defect and should not be rerun inside the remaining remediation pack.

The remaining implementation work is grouped by **shared root cause or tightly coupled code path**, not mechanically one prompt per audit number.

The execution model is:

- one prompt per root cause or tightly coupled change
- one focused implementation at a time
- targeted regression coverage for that prompt
- one commit per prompt
- no “fix everything” mega-prompt
- no broad refactor across unrelated surfaces
- final full Advanced Event E2E validation after all implementation prompts are complete

This keeps regressions attributable and makes each change easy to review or revert.

## What the audit established

The strongest positive finding is that response isolation is clean. Four responses across three surveys stayed correctly scoped. Per-survey counts did not bleed, event-level aggregates were not mistaken for survey-level counts, and one survey’s response history did not block another survey from publishing.

The failures are concentrated in lifecycle UI, assignment consistency, analytics/reporting, builder hydration, kiosk context, Deploy polish, and copy/layout.

## Schema mode

**ADDITIVE_ALLOWED**

Schema changes are permitted only when genuinely required to correctly solve the active defect.

- Do not add schema merely because it is convenient.
- Do not run destructive migrations or database resets.
- Any required schema change must be production-safe and tested.
- None of the planned prompts are expected to require schema changes by default.

## Already handled separately

### D2 — Assignment lifecycle blocker
D2 was handled separately and is intentionally omitted from the remaining prompt pack.

Root issue:
The Surveys-list Assign path bypassed the response-history guard used by the Advanced builder. That could create duplicate targets, deactivate an already-distributed public link, show duplicate Deploy rows, and leave the survey in contradictory state.

Do not rerun D2 from the remaining prompt pack.

## Remaining defects

### Builder / lifecycle
- D1 — Published survey still presents as publishable
- D5 — Builder can overwrite text typed during hydration
- D6 — Existing survey briefly renders as a fake blank draft
- D9 — Validation names the question but not the missing field
- D10 — Generate with AI is offered on published surveys

### Analytics / reporting
- D3 — Speaker analytics ignores persisted `Answer.speakerId`
- D4 — Structured answers are invisible to organizers
- D8 — Sessions panel contradicts itself
- D20 — Sessions panel text overlaps/clips

### Respondent / kiosk
- D12 — Area surveys show no area context
- D13 — Survey intro is never shown to attendees
- D19 — AI paraphrase is displayed like a verbatim attendee quote

### Deploy / signage
- D7 — Get QR pack dropdown will not dismiss
- D14 — Deploy truncates survey names too aggressively
- D15 — Assets popover duplicates actions and Copy has no feedback
- D21 — Signage Apply lacks confirmation; first click failed once after reload
- D22 — Signage Designer froze once under a heavy print-layout state

### Workspace consistency / copy
- D11 — Upcoming event incorrectly warns “This event is live”
- D16 — Assign drawer exposes fewer assignment kinds than the builder
- D17 — Singular counts are grammatically wrong
- D18 — “Missing details” speaker badge does not say what is missing

## Execution order

The prompt pack contains **16 implementation prompts**, grouped by shared root cause or tightly coupled code path:

1. D1 + D10 — Published Survey State
2. D5 + D6 — Builder Loading and Hydration
3. D9 — Question Validation
4. D3 — Speaker Rating Attribution
5. D4 — Structured Answer Reporting
6. D8 + D20 — Sessions Intelligence Correctness
7. D12 + D13 — Kiosk Survey Context
8. D19 — AI Summary Honesty
9. D7 — QR Pack Dropdown
10. D14 + D15 — Deploy Roster and Assets Presentation
11. D21 — Signage Apply and Entry Interaction
12. D22 — Signage Performance Investigation
13. D11 — Event Lifecycle Warning Copy
14. D16 — Assignment UI Parity
15. D17 — Survey Count Pluralization
16. D18 — Speaker Missing-Details Messaging

Then run one final full Advanced Event E2E validation pass.

D16 depends on the completed D2 fix and must reuse the canonical assignment path established there.

D22 is diagnose-first. If it cannot be reproduced and no concrete hot path is found, make no speculative change.

Finish, test, review, and commit each implementation prompt before moving to the next one.

## Guardrails for every prompt

- Preserve existing response isolation.
- Preserve the existing Survey → SurveyTarget → PublicSurveyLink model.
- Preserve existing QR/link generation.
- Preserve the kiosk capture pipeline.
- Preserve existing signage templates and rendering logic unless a prompt explicitly targets rendering performance.
- Schema mode is `ADDITIVE_ALLOWED`; use schema/migrations only if genuinely required by the active defect.
- Fix the canonical control point, not just the visible symptom.
- Add a regression test for each defect.
- Run targeted tests and typecheck.
- Do not broaden a prompt into adjacent cleanup.
- Commit each completed prompt separately before starting the next prompt.

## Completion criteria

The remediation is finished only when:

- all 21 remaining defects are fixed or explicitly closed as not reproducible / not a defect
- D2 remains green
- automated tests pass
- the full Advanced Event organizer journey passes
- the full respondent journey passes
- structured answers are visible and correctly attributed
- speaker analytics sees per-speaker ratings
- response isolation remains clean
- Deploy and Signage retain existing QR, print, export, and template behavior


## Environment safety during remediation

The later `.env.local` recovery incident is separate from these product defects.

The remediation loop must not rename, reconstruct, copy, rotate, or otherwise modify `.env` or `.env.local`.

If live-service verification is blocked by the current local environment:

- report that verification as BLOCKED
- do not fabricate credentials
- do not claim the live verification passed
- continue only where the loop controller permits safe code-level validation

The final E2E sign-off is only valid when the DEV environment is healthy enough to exercise the real application.
