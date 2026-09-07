# Voice Events — Phase 2 QA Fixes Brief

## Goal

Fix the Phase 2 event-setup issues found during end-to-end QA without redesigning the product or disturbing the seeded QA event.

## QA Target

- Account: `events-demo`
- Event: `QA — Northeast Events Summit 2026`
- Event ID: `cmsckubtq0006ve37jzsg1tki`
- Local app: `http://localhost:3001`

Use this event only for manual verification. Do not alter or reseed it as part of this loop.

## Current Working Baseline

The following setup flows work and must remain working:

- Create and edit an event
- Create, edit, archive, and restore event areas
- Create speakers
- Create sessions
- Assign one speaker to multiple sessions
- Remove one assignment without affecting another
- Session sorting and persistence
- Speaker duplicate detection

## Problems To Fix

### 1. Workspace reliability and mutation performance

The event workspace intermittently fails while loading account context, hangs indefinitely, or shows an unrecoverable error. During the QA run, this degraded until the local dev server had to be restarted.

Most event setup mutations trigger a full workspace reload. This makes saves slow and turns a transient account-context failure into an apparent lost-save or hung-save experience. Speaker/session assignment already updates in place and proves the faster pattern exists.

Required outcome:

- Root-cause the account-context failure using server/network evidence.
- A transient failure must never leave the workspace hanging indefinitely.
- Retry must actually recover when the backend is available.
- A successful write must not appear lost because a later refresh failed.
- Event setup mutations should update/revalidate only the affected state instead of reloading the full workspace.

### 2. Event date, status, and venue correctness

The create-event date-only controls save dates one day early because UTC midnight is later rendered in Eastern Time. Venue can be entered during creation but cannot be reviewed or edited afterward. Comparable future events also show inconsistent `ACTIVE` and `DRAFT` status behavior.

Required outcome:

- Dates entered by the user persist as the same intended calendar date.
- Do not use native browser date/time controls; use the existing product-styled date/time components.
- Venue is visible and editable in Event Settings.
- Event status is derived and displayed through one canonical lifecycle rule.

### 3. Validation and product clarity

The setup UI allows duplicate area names within the same event, exposes raw field names in validation messages, and presents the account-wide speaker directory as if all speakers already belong to a blank event.

Required outcome:

- Duplicate area names are handled consistently and server-side within the correct event scope.
- Validation copy uses human labels.
- Speaker-directory labels clearly distinguish reusable account speakers from speakers assigned to the current event.

### 4. Events-only UI cleanup

The SMB Product Tour appears in Events even though it is not part of the Events product. Active-event schedule changes also use a native `window.confirm()` dialog.

Required outcome:

- Events accounts cannot see or launch the SMB Product Tour.
- SMB tour behavior remains unchanged.
- Native confirm dialogs in the touched Events setup flows are replaced with the canonical SignalThread modal and clear action copy.

## Implementation Boundaries

- Preserve the existing Event, event-structure, speaker, assignment, and account-context models/services.
- Fix canonical loaders and mutation paths rather than patching individual screens.
- Keep route handlers thin and enforce validation server-side.
- Do not create duplicate state or a second event/setup system.
- Do not change kiosk, response capture, transcription, analysis, seeded data, or post-event analytics.
- Do not reset or manually modify any database.
- Schema mode is `ADDITIVE_ALLOWED`, but schema work is allowed only if a safe additive constraint is genuinely required.
- Maximum files per prompt: 14.

## Completion Standard

Each prompt must include targeted regression tests and live browser verification of the changed flow. A render-only check is not completion. Verify loading, success, failure, retry, dismissal, keyboard/focus behavior, alignment, wrapping, and responsive widths for touched UI.
