# Voice Events — Phase 2 QA Fix Prompts

## Loop Inputs

- Loop controller: `docs/PROMPT_LOOP_CONTROLLER.md`
- Plan document: `docs/voice-events/VOICE_EVENTS_PHASE_2_QA_FIXES_BRIEF.md`
- Prompt document: `docs/voice-events/VOICE_EVENTS_PHASE_2_QA_FIX_PROMPTS.md`
- Expected branch: `fix/voice-events-phase-2-qa`
- Schema mode: `ADDITIVE_ALLOWED`
- Maximum files per prompt: 14

Execute the prompts below in order. Do not combine them.

## Loop Status

| Prompt | Status | Verified |
| --- | --- | --- |
| 1 — Workspace reliability / remove full reloads | ✅ Complete (2026-08-03) | typecheck ✓ · targeted tests 63/63 ✓ · live Chrome 12/12 checks ✓ |
| 2 — Dates, venue, lifecycle status | ✅ Complete (2026-08-03) | typecheck ✓ · targeted tests 92/92 ✓ · live Chrome 15/15 checks ✓ |
| 3 — Validation + speaker directory | ✅ Complete (2026-08-03) | typecheck ✓ · targeted tests 44/44 ✓ · live Chrome 10/10 checks ✓ |
| 4 — SMB tour removal + confirm modals | ✅ Complete (2026-08-03) | typecheck ✓ · targeted tests 32/32 ✓ · live Chrome 12/12 checks ✓ |

### Prompt 1 results (2026-08-03)

**Confirmed root cause (from live server/network evidence, not guesswork):**
two `next-server` dev processes were listening on port 3001 simultaneously — a stale
one (up ~11.7h, IPv4) and a newer one (up ~4.3h, IPv6). They served **different code
versions** (verified: same request returned `{"error":"Unauthorized"}` on 127.0.0.1 vs
`{"success":false,...}` on ::1). Browser `localhost` connections landed on either stack
non-deterministically, so account-context loads intermittently hit stale code or failed,
Retry could hit the *other* server, and each process held its own Prisma pool against
the remote pgbouncer URL (`connection_limit=5`), doubling pressure on a tiny pool. The
mid-QA "restart" left the old process alive, which is why symptoms persisted.
Remediation: killed both, restarted one clean server. Client-side hardening below makes
the workspace survive any recurrence of transient backend failure.

**Code changes:**
- `lib/account-context-client.ts` — 60s success cache; bounded auto-retry (2 attempts
  × 10s timeout, transient failures only); `forceRefresh` option so Retry issues a real
  new request instead of joining a stale in-flight one.
- `app/app/events/[eventId]/page.tsx` — full `loadEvent()` reloads after settings /
  area create / edit / archive replaced with targeted slice revalidation
  (`refreshWorkspaceData`); refresh failure after a successful save now shows an amber
  "Your change was saved… Refresh view" notice instead of wiping the workspace into an
  error; initial-load failure no longer clears loaded data; workspace Retry forces a
  fresh account-context request.
- `components/events/EventAgendaWorkspace.tsx` — bounded 15s timeout on agenda loads;
  post-mutation refresh keeps data visible and reports failure as a stale-view notice
  (never a red error after a saved write); duplicate-submit guards on all session /
  speaker / assignment / listening mutations.
- Tests updated/added in `lib/account-context-client.test.ts`,
  `app/app/events/[eventId]/page.test.ts`, `components/events/EventAgendaWorkspace.test.ts`
  (timeout-cannot-hang, retry-recovers, forceRefresh-bypasses-stale-pending,
  save-survives-refresh-failure, targeted-slices-not-full-reload, duplicate-submit guards).

**Verification:**
- `npm run typecheck` ✓; targeted vitest 63/63 ✓.
- Full suite: 20 failures remain, **all pre-existing at HEAD** (22 before this prompt —
  this prompt fixed 2 stale dashboard assertions and added 9 passing tests; failures are
  in analysis route / theme evidence / events-access auth / voice recorder tests,
  untouched by this work). Flagged for a later prompt or follow-up.
- Live Chrome against `cmsckubtq0006ve37jzsg1tki` (12/12): initial load 4.0s; 3 repeated
  settings saves in place 1.3–2.6s with no full-reload skeleton; simulated refresh
  failure after save shows saved-banner + stale-view notice + workspace intact, Refresh
  view recovers; area create/edit/archive in place; blocked account-context load shows
  recoverable error and Retry recovers once the backend responds; agenda loads.
  Verification created one temporary area ("QA Reliability Check"), archived through the
  product UI (non-destructive; same flow the original QA run exercised). Seeded records
  otherwise untouched.

**Timings before/after:** settings save previously re-ran account context + 4 workspace
fetches with a full skeleton; now a save issues 1 targeted fetch (`event` slice) and the
UI never unmounts. Structure create/edit revalidates 2 slices instead of 5 requests.

**Next prompt review:** Prompt 2 unchanged and safe to run. Note for Prompt 2: Event
Settings start/end use native `datetime-local` inputs (seen live) — in scope there, not
here. No stop gates hit.

### Prompt 2 results (2026-08-03)

**Canonical date rule:** event start/end are calendar dates. Date-only input
(`YYYY-MM-DD`) is stored at **12:00 UTC** (`lib/event-dates.ts` —
`parseEventDateInput`), so the entered date renders identically in every display
timezone from UTC-11 to UTC+11; UTC-midnight storage was the drift cause. Both the
create route and the settings route parse through this one helper. Edit forms
round-trip via `eventDateToDateInputValue` (UTC date part), which also recovers the
intended date from legacy midnight-UTC rows.

**Canonical status rule:** `getEventDisplayStatus` / `getEventsHomeTimeBucket` in
`lib/events-home-groups.ts` now both derive from the existing date-aware
`getEventLifecyclePhase`. Displayed status is one of live / upcoming / completed —
raw DRAFT/ACTIVE storage status no longer leaks to badges, and a future ACTIVE
event no longer buckets as "Live" on Events Home. Applied to Events Home rows and
the Setup workspace header pill.

**Picker:** no product date picker existed anywhere (prompt assumed one), so
`components/app/events/EventDatePicker.tsx` is the new canonical Events-only
product-styled control: popover calendar over plain `YYYY-MM-DD` strings (no Date
conversions in the UI layer), Escape/outside-click dismissal with focus return,
arrow-key/Enter grid navigation, min-bound support, Clear/Today, 280px popover that
fits a 375px viewport. Used by the create form and Event Settings; native
`type="date"`/`datetime-local` removed from both. Event Settings intentionally moved
from datetime-local (date+time) to calendar dates to match the create contract.

**Venue:** added to Event Settings (existing `Event.venue` column, canonical
settings PATCH). Validation copy humanized (`End date cannot be before the start
date`; zod messages mapped to human labels — raw keys like `endDate` no longer
surface).

**Files (14):** lib/event-dates.ts(+test, new), EventDatePicker.tsx(+test, new),
components/app/events/index.ts, app/app/events/new/page.tsx,
app/api/app/events/route.ts, settings/route.ts(+test),
app/app/events/[eventId]/page.tsx(+test), lib/events-home-groups.ts(+test),
app/app/page.tsx.

**Verification:** typecheck ✓; targeted vitest 92/92 ✓; full suite 931 passed with
the same 20 pre-existing failures (none new). Live Chrome (15/15): create form has
zero native date controls; picker Escape/outside-click/focus-return/min-bound/375px
checks pass; created event persisted `2027-09-17T12:00Z`–`2027-09-18T12:00Z` and
renders Sep 17–18 in America/New_York; venue persisted from create, visible and
editable in Event Settings, edit survives reload; workspace badge and Events Home
show Upcoming for both future events (QA event previously showed raw ACTIVE).

**Residue note:** live verification created one clearly labeled event
`QA Date Check (temp) b` (id `cmsctuhcb0003xelg8221a42l`) in events-demo — there is
no event-delete flow in the product. Safe to ignore or remove manually. The seeded
QA event was read, never written.

**Deferred (file cap):** Signals dashboard header still passes raw
`analysisData.eventStatus` to its pill (one line in dashboard/page.tsx) and
EventStatusPill has no dedicated `upcoming` token (fallback renders it muted-gray,
uppercased). Recommend folding both into Prompt 3 or a follow-up.

**Next prompt review:** Prompt 3 unchanged and safe to run. No stop gates hit; no
schema changes were needed (venue column already existed).

### Prompt 3 results (2026-08-03)

**Normalization/scoping rule:** `normalizeStructureName` (trim, collapse internal
whitespace, case-insensitive) in `lib/event-structure.ts`; uniqueness enforced in the
canonical service for both create and rename, scoped to `(eventId, kind)` over active
items only — the same name in a different event stays allowed. **SESSION is exempt**:
schedules legitimately repeat titles (recurring breaks), and agenda review already
warns on session duplication. Conflict returns 409 with human copy
(`A location named "Registration" already exists in this event. Use a different
name.`) which the setup form shows inline while preserving entered values.

**Migration:** none — deliberately. A functional unique index over normalized names
can't be expressed in Prisma schema, existing seeded duplicates would make it fail or
require destructive cleanup, and admin-UI write concurrency doesn't justify it. The
storage slug already uniquifies rows; the service is the single write path.

**Validation copy:** raw keys removed from structure-service messages
(`name is required` → `Name is required`, `startsAt must be an ISO timestamp` →
`Start time must be a valid date and time`, `sortOrder must be an integer` →
`Order must be a whole number`, `kind is invalid` → `Type is invalid`).

**Speaker directory:** agenda summary now exposes `assignedSpeakerCount`; the
workspace relabels metrics to `Account speaker directory` / `Assigned to this event`,
adds "Reusable speakers from across this account. N assigned · M not assigned to this
event.", renames chips to `All account speakers` / `Not in this event`, and each card
reads `Not assigned to this event` instead of implying membership. Duplicate
detection and assignment behavior untouched.

**Files (6):** lib/event-structure.ts, structure/route.test.ts,
lib/event-agenda-service.ts(+test), components/events/EventAgendaWorkspace.tsx(+test).

**Verification:** typecheck ✓; targeted vitest 44/44 ✓; full suite 938 passed, same
20 pre-existing failures (none new). Live Chrome on the QA event (10/10): creating
`  registration ` (case/whitespace variant) rejected inline with the human message
and preserved input; rename of a temp area to `EXPO HALL` rejected; a unique name
still creates (temp area archived afterwards through the product UI, so the seeded
active areas are unchanged); speaker view shows account-vs-event framing everywhere;
no horizontal overflow at 375px.

**Next prompt review:** Prompt 4 unchanged and safe to run. Note: EventAgendaWorkspace
still uses several `window.confirm()` calls (discard-changes, archive session/speaker,
live-edit confirmation) — Prompt 4's session-schedule confirm work will land there.

### Prompt 4 results (2026-08-03)

**How Events vs SMB is determined:** the canonical account context
(`loadAccountContext` → `Account.accountType`) with **positive confirmation**
semantics. The leak QA hit: pages without an `?account=` param (and failed context
loads) previously *defaulted to SMB*, so an Events user could see and auto-launch the
tour. Now `SettingsMenu.canStartProductTour` requires a confirmed non-Events context,
and ProductTour's auto-start, `?startTour=1` route (param stripped), and render gate
all require the same. Persisted localStorage tour state can no longer launch anything
without that confirmation. SMB behavior verified unchanged (`test-co` still renders
and launches the tour).

**Native dialog call sites replaced** (session schedule workflow):
- `EventAgendaWorkspace` live-edit save confirm → modal `Confirm schedule change?` /
  "This event is live. Saving updates the published schedule for attendees
  immediately." / Cancel + `Add session`/`Update session` (context-specific).
- Session review-warnings confirm → modal `Save session with warnings?` / `Save anyway`.
- Archive session (both chained confirms collapsed into one) → modal
  `Archive this session?` with live-schedule note, destructive `Archive session`.
- `EventAgendaImportWorkspace` live agenda-import confirm → modal `Import agenda`.

New `components/events/EventConfirmDialog.tsx` composes the canonical SignalThread
`Modal` (it lives in components/events because the isolated `components/app/events`
primitives layer must not import `components/ui`). Canonical `Modal` gained additive
focus management: initial focus (honoring `data-autofocus`, set to Cancel), Tab trap,
focus return to trigger, and Escape handled in capture phase with `stopPropagation` —
live verification caught Escape previously also reaching the underlying session
drawer's handler (which fired its native discard confirm). Also added an optional
`overlayZIndexClassName` (default `z-50` unchanged) because the confirm must layer
above the `z-[70]` session drawer. Retail Modal callers keep identical API/visuals.

**Left native, deliberately (different workflows):** drawer discard-unsaved-changes
confirm, archive-speaker confirm, speaker-duplicate confirm. Candidates for a
follow-up sweep, not a schedule-correction workflow.

**Files (12):** Modal.tsx, EventConfirmDialog.tsx(+test, new),
EventAgendaWorkspace.tsx(+test), EventAgendaImportWorkspace.tsx(+test),
ProductTour.tsx(+test), SettingsMenu.tsx(+test), e2e/events-voice-journeys.spec.ts.

**Verification:** typecheck ✓; targeted vitest 32/32 ✓; full suite 946 passed, same 20
pre-existing failures (none new). Live Chrome (12/12): Events account shows no tour
entry, no auto-launch with fresh storage, `startTour=1` stripped without launching;
SMB (`test-co`) tour still launches; on an ACTIVE event, save-session shows the modal —
Escape (focus returns to trigger), Cancel, and outside-click all dismiss without
mutating; confirming creates exactly one session; modal fits 375px; **zero native
browser dialogs** appeared across the entire tested flow.

**QA residue:** the Prompt 2 temp event (`QA Date Check (temp) b`,
`cmsctuhcb0003xelg8221a42l`) now also holds two QA sessions ("QA Modal Check
Session…") from this verification. The seeded QA event remains untouched.

## Loop complete

All four prompts are done, each committed separately on
`feat/voice-events-total-redesign`. Outstanding follow-ups noted above: 20
pre-existing test failures (analysis route / theme evidence / events-access auth /
voice recorder — predate this loop), dashboard header pill still shows raw
`eventStatus`, EventStatusPill `upcoming` token, remaining native confirms in
non-schedule speaker/discard workflows, and the temp QA event that can be removed
manually if desired.

---

## Prompt 1 — Fix workspace reliability and remove full reloads

```text
Model: Sol
Strength: High

Voice Events

Root-cause and fix the Phase 2 event-workspace reliability failure and mutation reload pattern.

Observed behavior:
- `/api/app/account?...&scope=context` intermittently failed or hung.
- The workspace could remain on loading indefinitely or show an error whose Retry did not recover.
- During the QA run the local app eventually required a dev-server restart.
- Event settings, area, speaker, and session mutations trigger a full workspace reload.
- A successful write can therefore look hung or lost when the post-write reload fails.
- Speaker/session assignment already updates in place and is the working reference pattern.

Required work:
1. Audit the exact account-context loader, event-workspace loader, mutation handlers, and client refresh path before editing.
2. Use the server terminal/network evidence to identify the root cause. Do not guess or hide it behind retries.
3. Fix the canonical account-context failure path.
4. Add bounded timeout/retry behavior and a recoverable error state. Retry must issue a real new request and clear stale failure state.
5. Remove full workspace reloads after event settings, area, speaker, and session mutations. Update or revalidate only the affected workspace data using the existing in-place pattern where practical.
6. Separate mutation success from refresh failure. Never show a failed/lost save when the server already persisted the write.
7. Prevent duplicate submits while a mutation is pending and show explicit success/failure states.

Preserve:
- Existing account and event authorization/scoping.
- Speaker/session assignment behavior.
- Current event setup data and seeded QA data.
- Existing public API contracts unless a small explicit correction is required.

Tests and verification:
- Regression test for transient account-context failure followed by successful retry.
- Regression test proving loading cannot hang indefinitely.
- Regression test proving a successful mutation remains successful even if a follow-up read fails.
- Tests for affected create/edit/archive flows without a full-page reload.
- Run targeted tests and `npm run typecheck`.
- Verify live in Chrome against `cmsckubtq0006ve37jzsg1tki`, including repeated saves and one simulated/reproducible failure path.

Return the confirmed root cause, files changed, behavior changed, tests, timings before/after where measurable, and verification results.
```

---

## Prompt 2 — Fix event dates, venue editing, and lifecycle status

```text
Model: Terra
Strength: Medium

Voice Events

Fix create-event date correctness, restore venue editing, and make event lifecycle status consistent.

Observed behavior:
- Entering Sep 17–18 on the create form persisted/rendered as Sep 16–17 in Eastern Time.
- The issue is specific to create-event date-only handling.
- Venue exists on create but is absent from Event Settings.
- Comparable future events can display inconsistent ACTIVE and DRAFT states.

Required work:
1. Trace the create form, request contract, persistence, read serialization, and display formatting for event dates.
2. Preserve the user’s intended calendar date without UTC-midnight drift.
3. Do not use native browser `date`, `time`, `datetime-local`, or other browser-default date/time controls. Reuse the canonical product-styled date and time components.
4. Add Venue to Event Settings using the existing persisted event field and canonical update path.
5. Identify the canonical lifecycle/status resolver and make create, edit, list, and workspace badges use that same rule. Do not add a second client-only status calculation.
6. Use user-facing validation labels and messages for the touched fields.

Tests and verification:
- Create-event regression test in an Eastern timezone proving Sep 17 remains Sep 17.
- Include a timezone on the opposite side of UTC if the existing test setup supports it.
- Venue create/edit/persist regression coverage.
- Status consistency tests for draft, future, live, and completed events.
- Verify product-styled picker alignment, dismissal by outside click and Escape, keyboard/focus behavior, and responsive width.
- Run targeted tests and `npm run typecheck`.

Do not redesign Event Settings or change unrelated event lifecycle behavior.

Return files changed, the canonical date/status rules used, tests, and live verification results.
```

---

## Prompt 3 — Fix setup validation and speaker-directory clarity

```text
Model: Terra
Strength: Medium

Voice Events

Fix duplicate event-area handling, humanize validation messages, and clarify the account-wide speaker directory.

Observed behavior:
- Two event areas named exactly `Registration` can be created in the same event with no warning.
- Validation exposes raw names such as `endDate cannot be before startDate`.
- A blank event shows account-wide speakers as `Speakers 13 / Unassigned 13`, which reads as event membership.

Required work:
1. Define one canonical normalized area-name rule scoped to the current event and relevant structure kind.
2. Enforce the rule server-side for create and rename. The UI should surface a clear inline conflict message and preserve entered values.
3. Do not block the same area name in a different event.
4. If a database constraint is genuinely required, use a production-safe additive migration and account for existing duplicates. Do not delete or silently rename data.
5. Replace raw field-key validation messages in the touched setup flows with human labels.
6. Preserve the reusable account-wide speaker directory, but relabel its summary so users can distinguish:
   - speakers available across the account
   - speakers assigned to the current event
   - speakers still unassigned within the current event
7. Keep existing speaker duplicate detection and assignment behavior unchanged.

Tests and verification:
- Duplicate create and duplicate rename tests.
- Same name in separate events remains allowed.
- Normalization coverage for whitespace and case.
- User-facing validation-copy tests.
- Blank-event and populated-event speaker summary tests.
- Run targeted tests and `npm run typecheck`.
- Verify live in Chrome without modifying the canonical QA event’s seeded records unnecessarily.

Return files changed, normalization/scoping rule, migration details if any, tests, and verification results.
```

---

## Prompt 4 — Remove the SMB tour from Events and replace native confirms

```text
Model: Terra
Strength: Medium

Voice Events

Remove SMB-only Product Tour behavior from Events and replace native browser confirmation dialogs in the touched event-setup flows.

Required work:
1. Use the canonical account/product-type context to hide the Product Tour entry for Events accounts.
2. Prevent the SMB tour from auto-launching or being reached through route, persisted tour state, or direct Events-side trigger.
3. Preserve existing Product Tour behavior for SMB accounts.
4. Find the native `window.confirm()` used for active-event schedule corrections in session setup.
5. Replace it with the canonical SignalThread confirmation modal.
6. Use clear copy:
   - Title: `Confirm schedule change?`
   - Body: explain that the event is live and the schedule will update immediately.
   - Actions: `Cancel` and a specific primary action such as `Add session` or `Update session`.
7. Audit only the touched Events setup surface for related `alert()`, `confirm()`, or `prompt()` usage and replace instances that serve the same workflow. Do not start a broad app-wide redesign.
8. Modal behavior must support focus management, Escape, outside-click behavior appropriate to a confirmation, and return focus to the trigger.

Tests and verification:
- Events account does not render or launch Product Tour.
- SMB account still renders and launches Product Tour.
- Confirming performs the intended mutation once.
- Cancel, Escape, and dismissal behavior do not mutate data.
- No native browser confirmation appears in the tested session schedule flow.
- Run targeted tests and `npm run typecheck`.
- Verify visually in Chrome on desktop and a narrow responsive width.

Return files changed, how Events vs SMB was determined, native-dialog call sites replaced, tests, and verification results.
```
