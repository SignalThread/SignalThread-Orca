# Voice Events — Remaining QA Fixes Brief

## Goal

Close the remaining front-end QA issues found after the Phase 2 fix loop, without reopening work already completed.

## Current branch

`feat/voice-events-total-redesign`

## Canonical QA target

- Account: `events-demo`
- Event: `QA — Northeast Events Summit 2026`
- Event ID: `cmsckubtq0006ve37jzsg1tki`
- URL: `http://localhost:3001/app/events/cmsckubtq0006ve37jzsg1tki?account=events-demo`

## Already fixed — do not reopen

- Workspace/account-context recovery and mutation reload behavior
- Event date off-by-one and native date controls
- Venue editing and date-aware lifecycle labels
- Duplicate event-area validation
- Speaker-directory clarity
- SMB Product Tour leakage into Events
- Native schedule confirmation dialogs

## Remaining work

### 1. Survey creation false failure

Creating a survey can persist the survey, target, questions, and kiosk link, then return HTTP 500 and show “Failed to create survey.” The write must return one truthful, deterministic result and must not invite duplicate retries.

### 2. Canonical event metrics

The same event currently shows conflicting response, coverage, sentiment, survey, and session totals across Setup, Pre-event, In-event, Post-event, and survey-level views. One canonical definition and aggregation path is required for each metric.

Known examples:

- 283 vs 282 responses
- 107/107 vs 107/112 coverage
- Positive vs Mixed sentiment
- Survey badges totaling 91 while the event shows 283
- “5 of 3 sessions”
- Session response counts not reconciling with event totals

### 3. Intelligence integrity and remaining UX defects

Resolve the remaining issues that undermine trust or create confusing behavior:

- Positive evidence shown under a negative signal
- Transient “No intelligence yet” during normal loading
- Completed survey shown as unpublished
- Empty required resolution save fails silently
- Survey Open action requires two clicks
- “Responses today” labels seeded/historical data incorrectly
- Remaining grammar/taxonomy/status-pill edge cases
- Verify speaker/session attribution and apparent foreign or templated evidence are seed artifacts, not cross-event leakage

### 4. Product decisions

Prepare a concise recommendation before implementation for:

- Whether Events needs an explicit Close/Wrap Event action
- Whether the kiosk should show event and survey context/branding

This prompt is audit/decision-only. Stop for product approval before implementing either decision.

## Engineering constraints

- Preserve the existing Event → SurveyTarget → Survey → Response/Answer pipeline.
- Use one canonical server-side definition for business-critical metrics.
- Keep route handlers thin and reuse existing services.
- Do not create parallel analytics, survey, kiosk, or lifecycle systems.
- Keep account/event/survey scoping explicit.
- Do not modify retail/SMB behavior unless directly required.
- Add targeted regression coverage for every corrected bug.
- Visually verify affected live UI against the seeded QA event.

## Completion standard

Each implementation prompt must:

1. Identify the root cause before changing code.
2. Add or update targeted tests.
3. Run relevant tests and typecheck.
4. Verify the affected live UI and network behavior.
5. Commit separately.
6. Record findings and verification in the prompt-pack status section.
