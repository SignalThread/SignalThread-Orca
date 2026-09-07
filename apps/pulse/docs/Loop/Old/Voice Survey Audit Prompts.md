# Voice for Events — Total Redesign Build Prompts

**Document status:** Active controlled build-loop plan  
**Prepared:** July 30, 2026  
**Repository:** `/Users/ali/Documents/Booth Audio`  
**Expected branch:** `feat/voice-events-total-redesign`  
**Production reference:** `https://voice.signalthread.ai/app?account=events-demo`  
**Prompt count:** 19 prompts, numbered 0–18  
**Execution rule:** Complete, review, test, and visually verify each prompt before finalizing or running the next prompt.

---

## 1. How to Use This File

This file controls the implementation sequence for the Voice for Events total redesign.

It contains:

- **Prompt 0 in full** — authorization and event/account scoping
- **Prompt 1 in full** — permanent Events / Setup / Signals / Settings shell
- **Locked prompt briefs for Prompts 2–18** — scope, dependency, architecture decisions, acceptance requirements, and finalization gates

Prompts 2–18 are intentionally not written as final one-shot implementation prompts yet. Their detailed wording must be finalized after reviewing the actual code and behavior produced by the preceding prompt.

Do not:

- skip prompts
- combine prompts without explicit approval
- run a locked prompt brief as though it were a finalized implementation prompt
- allow a later prompt to redefine architecture already locked by the implementation brief
- treat the HTML prototype as proof that backend behavior exists

---

## 2. Required Files for Every Agent

Before editing, the implementation agent must read:

1. `VOICE_EVENTS_TOTAL_REDESIGN_IMPLEMENTATION_BRIEF.md`
2. `Pasted text.txt` — completed current-state audit; recommended future name: `VOICE_EVENTS_CURRENT_STATE_AUDIT.md`
3. `Event Workspace Redesign Voice Events (1).html`
4. `ENGINEERING_STANDARDS.md`
5. this file: `VOICE_EVENTS_BUILD_PROMPTS.md`

The authority order is:

1. implementation brief — finished product and architecture
2. current-state audit — current code reality
3. active implementation prompt — current slice
4. HTML prototype — visual and interaction reference only
5. earlier design handoff — supporting context

The uploaded HTML is mainly a Signals/dashboard reference. It is not the complete agenda importer design and is not authoritative for schema, persistence, authorization, email, or import behavior.

---

## 3. Loop Rules

For every prompt:

1. Start from a clean worktree.
2. Inspect the exact current files before editing.
3. State the exact files intended for modification.
4. Implement only the active slice.
5. Preserve existing working behavior unless the prompt explicitly changes it.
6. Add focused regression coverage in the same pass.
7. Run targeted tests, typecheck, and Prisma checks when applicable.
8. Report:
   - files changed
   - behavior changed
   - data or API contract changes
   - tests added or updated
   - verification results
   - assumptions and risks
9. Stop for review before beginning the next prompt.

Hard stops include:

- destructive migration requirement
- uncertainty about canonical speaker scope
- a proposed second agenda/session model
- repurposing the legacy recording `Session`
- a proposed third action family
- undefined import partial-failure behavior
- action voice updates contaminating attendee evidence
- cross-account access ambiguity
- broad unrelated refactoring
- unresolved failing tests

---

## 4. Prompt Status Board

| Prompt | Name | Status | Model | Strength |
| --- | --- | --- | --- | --- |
| 0 | Authorization and event/account scoping | Ready | Sol | High |
| 1 | Permanent event workspace shell | Ready after Prompt 0 | Terra | Medium |
| 2 | Setup Overview and connected Setup navigation | Locked brief | Terra | Medium |
| 3 | Agenda, speaker, assignment, and import schema | Locked brief | Sol | Extra High |
| 4 | Manual Agenda workspace | Locked brief | Sol | High |
| 5 | Agenda import backend | Locked brief | Sol | Extra High |
| 6 | Agenda import UI | Locked brief | Terra | High |
| 7 | Event Areas and listening-plan connection | Locked brief | Sol | High |
| 8 | Signals Overview in-event redesign | Locked brief | Terra | High |
| 9 | Signals Intelligence tab | Locked brief | Sol | High |
| 10 | Signals Sessions tab | Locked brief | Sol | High |
| 11 | Signals Speakers tab | Locked brief | Sol | High |
| 12 | Canonical action/tasking backend | Locked brief | Sol | Extra High |
| 13 | Desktop Actions tab | Locked brief | Terra | High |
| 14 | Assignment email and delivery tracking | Locked brief | Sol | High |
| 15 | Mobile web My Actions | Locked brief | Terra | High |
| 16 | Pre-event Signals | Locked brief | Terra | Medium |
| 17 | Post-event closing brief | Locked brief | Terra | High |
| 18 | Cross-workspace integration and hardening | Locked brief | Sol | Extra High |

---

# PROMPT 0 — READY TO RUN

## Authorization and Event/Account Scoping

```text
Model: Sol
Strength: High

Admin / Voice App

Implement the authorization prerequisite for the Voice for Events total redesign.

Read before editing:
- VOICE_EVENTS_TOTAL_REDESIGN_IMPLEMENTATION_BRIEF.md
- Pasted text.txt
- ENGINEERING_STANDARDS.md
- VOICE_EVENTS_BUILD_PROMPTS.md

This is a focused backend security and route-consistency task.
Do not begin the visual redesign in this prompt.
Do not change Prisma schema.
Do not change kiosk, QR, transcription, analysis extraction, survey creation, or SMB product behavior.

Current confirmed state:
- The repository already has a strong Events access helper at `lib/auth/require-events-event-access.ts`.
- Normalized intelligence, evidence, theme-evidence, and cluster-workflow routes already use strong Events account/event access checks.
- Other Events routes use weaker or inconsistent patterns.
- `GET/POST /api/app/events` authenticates a Supabase user but accepts an account slug without consistently proving account membership.
- `GET/PATCH/DELETE /api/app/events/[eventId]` has the same gap.
- event `analysis`, `timeline`, and `signals` routes resolve account/event data but do not consistently enforce authenticated membership.
- Root middleware does not protect `/app` or `/api/app`, so every protected route must enforce access itself.

Product outcome:
Every Events route touched here must enforce authenticated account membership, Events product mode, and correct event/account scope through one canonical server-side access pattern before new Agenda, Speaker, Import, Action, or Notification routes are added.

First inspect and identify the exact current files you will change.
Expected areas include:
- `lib/auth/require-events-event-access.ts`
- a new or existing account-level Events access helper, if required
- `app/api/app/events/route.ts`
- `app/api/app/events/[eventId]/route.ts`
- `app/api/app/events/[eventId]/analysis/route.ts`
- `app/api/app/events/[eventId]/timeline/route.ts`
- `app/api/app/events/[eventId]/signals/route.ts`
- their existing route tests
- existing auth-helper tests

Required implementation:

1. Establish one canonical Events account-access path.
   - Reuse existing auth/session and Prisma user membership conventions.
   - Prefer a reusable `requireEventsAccountAccess`-style helper when a route has an account but no event yet.
   - Keep `requireEventsEventAccess` as the event-scoped authority, or refactor it to build cleanly on the canonical account helper.
   - Do not copy membership logic independently into every route.

2. Enforce authenticated membership on the Events collection route.
   - `GET /api/app/events?account=<slug>` must reject unauthenticated and cross-account access.
   - `POST /api/app/events?account=<slug>` must reject unauthenticated and cross-account creation.
   - Preserve the current legitimate role behavior for event creation. Audit current role conventions before changing them; do not invent a new role policy in this prompt.
   - Preserve the existing successful response shapes used by the Events home and event-creation UI.

3. Enforce event access on event detail and mutation routes.
   - `GET/PATCH/DELETE /api/app/events/[eventId]?account=<slug>` must prove membership and that the event belongs to that account.
   - Preserve current legitimate write-role behavior.
   - Do not weaken existing delete/lifecycle safeguards.
   - Do not reveal another account’s event through differing response detail.

4. Enforce event access on dashboard analytics routes.
   - analysis
   - timeline
   - signals
   - Use the canonical event-access helper.
   - Preserve their existing successful payload contracts so the current Command Center continues to render unchanged.

5. Keep error semantics explicit and consistent.
   - unauthenticated: use the existing project-standard unauthorized response
   - authenticated but not a member or not permitted: use the existing forbidden/not-found convention without leaking cross-tenant data
   - account/event mismatch: reject deterministically
   - wrong product mode: reject through the Events access helper
   - Do not introduce redirect behavior into API routes.

6. Preserve super-admin behavior only if it is intentionally supported by the current canonical auth helpers.
   - Do not create a new bypass.
   - Do not add dev headers, test bypasses, or hidden fallback access.

7. Remove parallel access logic only where it is directly replaced by the canonical helper.
   - Do not broadly refactor unrelated auth code.
   - Do not modify SMB route policy unless a shared helper requires a tested compatibility adjustment.

Required tests:

Add or update focused deterministic coverage for:
- unauthenticated event collection request rejected
- same-account Events member can list events
- cross-account member cannot list another account’s events
- valid event creation still succeeds for the currently allowed role
- disallowed or cross-account event creation rejected
- same-account member can read the event detail
- cross-account member cannot read or mutate the event
- account/event mismatch rejected
- analysis route rejects unauthenticated access
- timeline route rejects cross-account access
- signals route rejects cross-account access
- valid same-account dashboard requests preserve their existing payload shape
- wrong product-mode account rejected where required
- super-admin behavior remains exactly as defined by the existing project policy

Verification:
- run the focused auth-helper tests
- run the focused route tests for every route changed
- run the affected Events page tests if response/error behavior changed
- run `npm run typecheck`
- run the broader Events test command used by this repository when practical
- explain any unrelated pre-existing failure rather than hiding it

Acceptance checks:
- no protected route touched here relies only on account slug or event ID
- all changed routes use the canonical Events access path
- the current Events home still receives the same successful event-list payload
- the current Setup page still receives the same successful event-detail payload
- the current Command Center still receives the same analysis, timeline, and signals payloads
- cross-account access is blocked server-side
- no schema or migration changes
- no kiosk, survey, evidence, or SMB behavior regression
- no auth bypass added

Return:
1. exact files changed
2. canonical helper names and responsibilities
3. route-by-route access behavior after the change
4. any preserved role assumptions
5. tests added or updated
6. verification results
7. any remaining Events routes that still use weaker access patterns and why they were outside this prompt
```

## Prompt 0 Review Gate

Do not begin Prompt 1 until review confirms:

- access is enforced in the service/route layer, not only the UI
- collection, event detail, analysis, timeline, and signals are covered
- valid response payloads remain compatible
- no SMB or kiosk regression
- no hidden bypass
- all targeted tests pass

---

# PROMPT 1 — READY AFTER PROMPT 0

## Permanent Events / Setup / Signals / Settings Shell

```text
Model: Terra
Strength: Medium

Admin / Voice App

Build the permanent event-scoped workspace shell for Voice for Events.

Read before editing:
- VOICE_EVENTS_TOTAL_REDESIGN_IMPLEMENTATION_BRIEF.md
- Pasted text.txt
- Event Workspace Redesign Voice Events (1).html
- ENGINEERING_STANDARDS.md
- VOICE_EVENTS_BUILD_PROMPTS.md

This is a focused Events UI and routing task.
Prompt 0 authorization hardening must already be complete.

The HTML prototype is the visual reference for the dark left navigation and overall event-workspace composition. It is not authoritative for backend behavior, route contracts, or data persistence.

Current confirmed state:
- Events home is `/app?account=<slug>`.
- Setup is `/app/events/[eventId]?account=<slug>`.
- the current Signals equivalent is `/app/events/[eventId]/dashboard?account=<slug>`.
- Settings currently lives under the existing app settings route.
- Setup and Command Center both use generic admin chrome and construct their own event-level headers/navigation.
- There is no permanent event-level Events / Setup / Signals / Settings shell.
- The current Setup and Command Center contain working behavior that must remain intact in this prompt.

Product outcome:
Create one connected event workspace with a permanent dark left rail containing:
- Events
- Setup
- Signals
- Settings at the bottom

The shell must preserve the selected account and event while moving between Setup and Signals, establish one shared event identity area, work responsively, and keep the current Setup and Command Center content functional without redesigning those pages yet.

First inspect and identify the exact current files/components you will change.
Likely areas include:
- `app/app/events/[eventId]/layout.tsx`, if a nested layout is the safest fit
- an Events-only shared component such as `components/app/events/EventWorkspaceShell.tsx`
- `app/app/events/[eventId]/page.tsx`
- `app/app/events/[eventId]/dashboard/page.tsx`
- `components/admin/AdminLayout.tsx` only if a narrow compatibility change is required
- `components/app/events/EventStatusPill.tsx`
- `components/app/events/index.ts`
- focused shell/component/page tests
- `e2e/events-voice-journeys.spec.ts`

Do not force a nested layout if the current Next.js route/search-param architecture makes a shared wrapper component safer. Choose the smallest coherent Events-only architecture and explain it.

Required implementation:

1. Add one Events-only workspace shell.
   - Do not globally replace the generic admin shell used by SMB or unrelated pages.
   - The shell owns the permanent dark left navigation and shared event identity.
   - It must support loading, error, and unavailable-event states without flashing unrelated account content.

2. Add the permanent left navigation.
   - Events → `/app?account=<accountSlug>`
   - Setup → `/app/events/<eventId>?account=<accountSlug>`
   - Signals → `/app/events/<eventId>/dashboard?account=<accountSlug>`
   - Settings → the existing settings route with the account context preserved
   - Use the actual current settings path discovered in code; do not invent a duplicate settings page.
   - Show a clear selected state for Setup or Signals.
   - Events and Settings should still be usable from within an event.

3. Preserve account and event context.
   - Every event-scoped shell link must preserve the real `eventId` and `account` context.
   - Refreshing Setup or Signals must keep the user in the same account/event.
   - Browser back/forward navigation must remain coherent.
   - Do not move the account slug into a new persistence mechanism in this prompt.

4. Establish one shared event identity area.
   - Show the real event name and real lifecycle/status from current event data.
   - Keep the event identity compact.
   - Avoid the oversized top whitespace and duplicate event headers identified during prior design review.
   - Remove or demote duplicated event-name/status presentation inside Setup and Command Center only where the new shared header replaces it.
   - Preserve page-specific actions such as Event Settings, refresh, or Command Center controls in an appropriate page-level action area.

5. Preserve current page behavior.
   - Setup’s existing Overview, Survey Focus, Surveys, and Operations content must continue to work in this prompt.
   - The current Command Center data loading, filters, Needs Attention, Selected Issue Detail, evidence, ownership, notes, status changes, sponsor section, and intelligence section must continue to work.
   - Do not implement the final Agenda tab, Signals tabs, action center, lifecycle redesign, or importer yet.
   - Do not rename all current tabs yet; Prompt 2 owns final Setup navigation.

6. Make the shell responsive.
   - Desktop: persistent dark rail consistent with the HTML reference.
   - Narrow widths: use a deliberate collapsible/drawer pattern; do not squeeze the full rail beside mobile content.
   - Maintain accessible keyboard/focus behavior.
   - Prevent horizontal overflow and clipped controls.
   - Preserve enough event identity in the collapsed/mobile header to orient the user.

7. Keep navigation visually and structurally distinct from page tabs.
   - Left rail = product/workspace navigation.
   - Existing Setup tabs remain page-level navigation.
   - Do not add the future Signals Overview/Intelligence/Sessions/Speakers/Actions tabs in this prompt.

8. Avoid duplicate data fetching where practical.
   - Prefer one event-context payload for the shell.
   - Do not create a new backend endpoint solely for decorative shell data unless the current APIs cannot safely provide it.
   - Do not let a shell failure make otherwise valid page data appear as another account’s event.

9. Preserve accessibility.
   - semantic navigation landmark
   - clear link labels
   - visible selected state beyond color alone
   - mobile menu button with expanded state
   - keyboard-operable drawer/menu
   - focus return when closing mobile navigation

Required tests:

Add or update focused coverage for:
- Events link contains the correct account slug
- Setup link contains the correct event ID and account slug
- Signals link contains the correct event ID and account slug
- Settings link preserves account context
- Setup selected state renders on the Setup route
- Signals selected state renders on the dashboard route
- real event name/status appears once in the shared identity area
- Setup content still renders inside the shell
- Command Center content still renders inside the shell
- mobile navigation opens, exposes all links, and closes accessibly
- no event shell appears on SMB-only surfaces
- loading and access-error states do not render stale event identity

Update the affected Events Playwright journey to verify:
- navigate Events → Setup
- navigate Setup → Signals
- navigate Signals → Setup
- account and event context persist
- mobile shell navigation is usable
- current Setup and Command Center primary content still appears

Visual acceptance:
- compare the left rail and event-workspace hierarchy with `Event Workspace Redesign Voice Events (1).html`
- use the prototype as direction, not a requirement to copy hard-coded data or simulated interactions
- no duplicate event header
- no oversized empty top band
- no disconnected “Open Command Center” experience once Signals is available in the permanent rail; preserve any necessary action only if it still adds unique value
- current page content should not be broadly restyled yet

Verification:
- run focused shell/component tests
- run affected Setup and dashboard page tests
- run affected Events Playwright tests
- run `npm run typecheck`
- run the broader Events test command when practical
- run SMB regression coverage if `AdminLayout` or another shared component is touched

Acceptance checks:
- one permanent Events-only workspace shell exists
- Events, Setup, Signals, and Settings are real navigable destinations
- account/event context never disappears during shell navigation
- current Setup behavior remains functional
- current Command Center behavior remains functional
- shared event identity is compact and not duplicated
- desktop and mobile navigation both work
- no schema/API changes unless a pre-existing event-detail contract requires a narrowly justified compatibility fix
- no SMB, kiosk, QR, evidence, or survey regression

Return:
1. exact files changed
2. shell architecture chosen and why
3. final route/link behavior
4. event data source used by the shell
5. duplicated headers/actions removed or retained, with rationale
6. responsive behavior implemented
7. tests added or updated
8. verification results
9. visual differences from the HTML reference that were necessary because of real product behavior
```

## Prompt 1 Review Gate

Do not finalize Prompt 2 until review confirms:

- the shell is Events-only
- all four destinations work
- account/event context persists
- event identity is not duplicated
- current Setup and Command Center remain operational
- mobile navigation is usable
- no SMB regression
- the shell is visually aligned with the prototype without copying fake data

---

# LOCKED PROMPT BRIEFS — DO NOT RUN YET

The following sections lock the scope and acceptance criteria for Prompts 2–18. Convert each section into a final copyable implementation prompt only after reviewing the preceding implementation result.

---

## Prompt 2 — Setup Overview and Connected Setup Navigation

**Model:** Terra  
**Strength:** Medium  
**Dependency:** Prompt 1 accepted

### Product outcome

Replace the transitional Setup navigation with the final connected Setup information architecture:

- Overview
- Event Areas
- Agenda
- Surveys
- Operations

Add a real readiness hub that routes the planner to the correct setup work instead of displaying static summary cards.

### Locked scope

- URL-backed Setup tab state
- final Setup tab labels
- current `Survey Focus` functionality preserved and moved/renamed into Event Areas
- Agenda placeholder/entry surface before full CRUD exists
- dynamic readiness model
- Agenda & sessions readiness row
- existing Surveys and Operations integration
- compact shared event header from Prompt 1
- no schema change expected

### Required behavior

- Setup tab state survives refresh and browser navigation.
- `?tab=` or a route-based equivalent remains canonical; local React state alone is not enough.
- Current EventStructureItem management remains accessible under Event Areas.
- Agenda shows a truthful not-started/empty state until Prompt 4.
- Readiness rows open the relevant tab/workspace.
- Agenda readiness supports `Not started`, `Import in progress`, `Needs review`, and `Ready` once later data exists.
- Readiness totals are derived and cannot remain hard-coded.
- Existing Surveys and Operations actions continue to use current survey, QR, signage, and availability systems.

### Expected files to inspect

- `app/app/events/[eventId]/page.tsx`
- `components/app/events/EventTabs.tsx`
- current setup-summary/readiness helpers
- event structure and voice-survey APIs
- Setup page tests
- Events Playwright journey

### Acceptance requirements

- all five final Setup tabs are clickable
- URL updates on tab change
- refresh preserves selected tab
- Event Areas uses current EventStructureItem data
- Agenda empty state is connected to future manual/import paths without pretending they exist
- no `5 / 5 ready` hard-code
- readiness row actions route correctly
- no QR, signage, survey, or Operations regression

### Finalization questions after Prompt 1

- Did Prompt 1 use a nested layout or shared wrapper?
- Which component now owns page-level title/actions?
- Can Setup tab state remain query-based without duplicating shell state?
- Which current summary cards should become readiness rows versus remain metrics?

---

## Prompt 3 — Canonical Agenda, Speaker, Assignment, and Import Schema

**Model:** Sol  
**Strength:** Extra High  
**Dependency:** Prompt 2 accepted  
**Schema mode:** OPEN, additive and production-safe only

### Product outcome

Add the missing canonical domain foundation required for manual Agenda management and durable imports while preserving `EventStructureItem` as the agenda/session authority.

### Locked architecture

- Agenda sessions remain `EventStructureItem(kind=SESSION)`.
- The legacy recording `Session` model is never repurposed.
- Speaker identity is represented by one canonical speaker profile model.
- Session-speaker assignment is represented by one canonical join model.
- Import state is durable and server-owned.
- Final speaker data cannot live only in metadata JSON.

### Required schema decisions

- account-scoped versus event-scoped speaker identity
- recommended default: account-scoped profile with event/session assignment joins
- speaker archive/delete semantics
- role enum or validated role values: Speaker, Moderator, Host, Panelist
- assignment order and uniqueness
- event/session ownership constraints
- EventStructureItem session metadata runtime contract
- import job lifecycle
- import row lifecycle
- source file/worksheet identity
- stable source-row key
- mapping snapshot
- normalized row snapshot
- validation issues
- duplicate/conflict classification
- user resolution decision
- confirmation/result fields
- idempotency key and uniqueness

### Expected outputs

- Prisma schema additions
- production-safe migration
- runtime validation/types
- canonical services or repositories
- no UI beyond what is needed to compile
- focused schema/service tests
- documentation of authoritative versus derived fields

### Acceptance requirements

- no second session table for agenda records
- no data reset or destructive migration
- foreign keys enforce account/event/session ownership where practical
- assignment duplicates are constrained
- import confirmation can be made idempotent later
- speaker matching fields are indexed appropriately
- historical current EventStructureItem/SurveyTarget data remains valid
- `npx prisma validate` and `npx prisma generate` pass

### Finalization gate

The final prompt must explicitly state the chosen speaker scope and import failure model before implementation begins.

---

## Prompt 4 — Manual Agenda Workspace: Sessions and Speakers

**Model:** Sol  
**Strength:** High  
**Dependency:** Prompt 3 accepted

### Product outcome

Build the first production Agenda workspace using canonical session structure and speaker records before introducing file import.

### Locked scope

- Agenda landing summary
- Sessions subtab
- Speakers subtab
- manual session create/edit/detail
- manual speaker create/edit/detail
- session-speaker role assignment
- filters/search/sort
- validation and review states
- safe archive/delete behavior
- active-event correction confirmation
- responsive UI
- thin routes and canonical services

### Session requirements

- title
- description
- start/end date and time
- room
- track
- format
- external/source ID
- capacity
- tags
- speakers/roles
- completeness state

Validation:

- required data
- end before start
- invalid date/time
- room overlap warning
- duplicate external ID
- possible duplicate session

### Speaker requirements

- name
- title
- organization
- email
- phone
- biography
- headshot state
- session count
- profile completeness
- possible duplicate state
- assigned sessions and roles

### Acceptance requirements

- session CRUD writes EventStructureItem
- speaker CRUD writes canonical profile records
- assignment join works
- deleting/archive speaker does not delete sessions
- deleting/archive session handles linked targets/history safely
- live-event edits are allowed with confirmation
- loading/error/empty states are complete
- Agenda totals derive from data
- existing Event Areas and Surveys remain unaffected

### Finalization questions

- What exact service names were created in Prompt 3?
- What delete/archive semantics were chosen?
- Does the shell use tabs or nested routes for Agenda subnavigation?

---

## Prompt 5 — Agenda Import Backend

**Model:** Sol  
**Strength:** Extra High  
**Dependency:** Prompts 3 and 4 accepted

### Product outcome

Build a durable, staged, idempotent CSV/XLSX import service over the canonical session and speaker services.

### Locked scope

- file acceptance and validation
- CSV parser
- XLSX workbook/worksheet inspection
- column discovery
- mapping contract
- row normalization
- date/time interpretation
- session validation
- duplicate/existing-match detection
- room overlap warnings
- speaker candidate matching
- durable import job and rows
- per-row decisions
- confirmation service
- completion result
- account/event authorization
- service and route tests

### Required flow

1. create/upload import job
2. inspect file
3. list worksheets
4. save worksheet choice
5. save mapping
6. normalize/validate rows
7. classify conflicts
8. save decisions
9. confirm once
10. write sessions/speakers/assignments through canonical services
11. store result

### Idempotency requirements

- repeated confirmation does not duplicate records
- import job has stable idempotency identity
- source row identity is preserved
- external ID is used when supplied but is not the only protection
- failed confirmation has explicit resumable or atomic behavior
- no browser-only state authority

### Acceptance requirements

- CSV and XLSX both supported
- worksheet selection supported
- unsupported files rejected
- mapping and normalized rows durable
- invalid rows remain reviewable
- no silent overwrite
- partial failure behavior explicit
- cross-account access rejected
- confirmation result counts are reliable
- parser is not coupled directly to route handlers

### Finalization gate

The final prompt must use the exact schema/service contracts produced by Prompt 3 and the exact manual CRUD services proven by Prompt 4.

---

## Prompt 6 — Agenda Import UI

**Model:** Terra  
**Strength:** High  
**Dependency:** Prompt 5 accepted

### Product outcome

Deliver the complete planner-facing import workflow in Setup → Agenda.

### Locked steps

- upload or manual choice
- drag/drop and file picker
- worksheet selection
- column mapping
- normalized preview
- row status filters
- conflict/detail review
- duplicate decisions
- speaker reconciliation
- confirmation summary
- import progress
- completion results
- unresolved-row return path
- open imported Sessions
- Setup readiness integration

### Required UX states

- Ready
- Needs review
- Duplicate
- Missing required information
- Invalid date/time
- End time before start
- Possible overlap
- Existing-session match

### Required decisions

- Skip uploaded row
- Replace existing session
- Keep both
- Review details
- Link existing speaker
- Create new speaker
- Keep separate
- Merge duplicate profile
- Ignore imported speaker value

### Acceptance requirements

- browser refresh can resume a durable in-progress import
- no data writes before explicit confirmation
- mapping preview is clear
- errors identify row and field
- totals update as decisions change
- completion result matches backend result
- unresolved rows remain accessible
- Agenda readiness reflects import state
- no fake progress or hard-coded rows

### Finalization questions

- What exact import-job status names exist?
- Are uploads direct-to-storage or request-body uploads?
- Is confirmation atomic or resumable?
- Which UI component library patterns already exist for tables/drawers?

---

## Prompt 7 — Event Areas and Listening-Plan Connection

**Model:** Sol  
**Strength:** High  
**Dependency:** Prompts 4 and 6 accepted

### Product outcome

Connect Agenda sessions to explicit Voice listening points and reusable surveys without automatically converting the agenda into collection targets.

### Locked rules

- Agenda session and listening point remain distinct.
- `EventStructureItem` remains canonical structure.
- `SurveyTarget` remains explicit listening target.
- one survey may serve multiple targets
- unselected sessions are not coverage failures
- removing a target does not erase history

### Locked scope

- compact listening state on session rows/details
- add/remove session as listening point
- attach existing survey
- create survey from selected sessions
- bulk listening setup
- availability configuration
- links among Agenda, Event Areas, Surveys, and Signals
- listening-plan coverage
- evidence coverage
- readiness integration
- service/route/UI tests

### Required listening states

- Not selected for listening
- Needs survey
- Survey attached
- Ready to collect
- Collecting
- Low response
- Represented
- Closed

### Acceptance requirements

- 48 imported sessions do not produce 48 targets
- one reusable survey can attach to multiple selected sessions
- each response retains target provenance
- removing from plan preserves survey/response/evidence history
- `4 of 48 selected` and `3 of 4 represented` use separate denominators
- Agenda and Event Areas counts agree
- existing QR/kiosk/survey lifecycle remains canonical

### Finalization questions

- Does the current Survey schema support multi-target reuse directly, or is a safe join/compatibility change required?
- What exact response provenance exists after current migrations?
- Which current Event Areas UI should be preserved versus reorganized?

---

## Prompt 8 — Signals Overview In-Event Redesign

**Model:** Terra  
**Strength:** High  
**Dependency:** Prompt 1 accepted; Prompt 7 data may be integrated when available

### Product outcome

Transform the current Command Center into the final in-event Overview while preserving its working evidence and issue workflow.

### Locked hierarchy

- Event overview
- What needs review
- What is working
- Coverage and confidence
- Open follow-up
- Keep
- Improve during this event
- Revisit next event

### Locked scope

- use current analysis, normalized intelligence, signals, clusters, evidence, notes, and owner data
- simplify top header
- remove redundant filter stacks
- establish one filter model
- preserve selected issue detail
- preserve sponsor value
- preserve evidence interaction
- preserve status/owner/notes workflow until canonical Actions replaces it later
- responsive behavior

### Acceptance requirements

- no fake real-time telemetry
- every card is clickable when it visually implies interaction
- Review Evidence opens correct evidence
- selected item clears when filtered out
- counts come from one consistent payload
- no stale repeated `39`-style values
- filters are clearable and do not reset unrelated filters
- current issue workflow remains functional
- no disconnected return to old dashboard

### Finalization questions

- What structure did Prompt 1 leave inside the dashboard route?
- Which current filters are server-backed versus client-only?
- Can current issue detail be reused directly or should it become a shared component first?

---

## Prompt 9 — Signals Intelligence Tab

**Model:** Sol  
**Strength:** High  
**Dependency:** Prompt 8 accepted

### Product outcome

Create a separate Intelligence tab for evidence-backed themes, signals, opportunities, positive intelligence, and learning without duplicating operational Needs Attention.

### Locked scope

- URL-backed Signals tabs begin here if not established earlier
- themes
- emerging signals
- cross-response opportunities
- positive intelligence
- friction/risk findings
- evidence strength
- source/mention counts
- classification into informational/current-event/after-event/next-event
- inline evidence and evidence detail
- filters

### Locked rules

- weak evidence is visibly weak
- no unsupported conclusion
- informational findings remain informational
- positive intelligence does not automatically create actions
- Intelligence does not repeat the Needs Attention queue
- existing evidence system is reused

### Acceptance requirements

- each finding traces to canonical evidence
- evidence drawer/detail works from every card type
- no duplicate evidence implementation
- filter state persists
- no hard-coded findings
- no action is created simply by viewing or classifying a finding

### Finalization questions

- Which existing normalized intelligence payloads can be reused?
- Do classifications need a new persisted field or can they initially be deterministic derived state?
- How will later action creation link back to a finding?

---

## Prompt 10 — Signals Sessions Tab

**Model:** Sol  
**Strength:** High  
**Dependency:** Prompt 7 accepted and session provenance confirmed

### Product outcome

Create agenda-backed session intelligence with truthful evidence states and direct links between Signals and Setup.

### Locked states

- All agenda sessions
- Selected for listening
- Represented
- Underrepresented
- Needs review
- Not selected

### Locked scope

- session list/filter/search
- response/evidence volume
- confidence/evidence state
- session intelligence detail
- agenda context
- related speakers
- listening setup
- attached survey
- evidence
- actions/learning links
- Setup and survey deep links

### Locked rules

- no title-string matching as authority
- no sentiment/finding for insufficient evidence
- unselected session explicitly says not selected
- coverage denominator uses selected listening points
- data matches Agenda exactly

### Acceptance requirements

- session title/time/room/track match Setup
- response counts derive through SurveyTarget/Response provenance
- weak evidence state is honest
- evidence drill-down opens correct answers
- links to Setup preserve account/event/session context
- related speaker display uses canonical assignment joins

### Finalization questions

- Which canonical foreign-key path now connects response evidence to EventStructureItem?
- Does normalized intelligence need an additive session structure ID field or safe resolver?
- What is the minimum evidence threshold contract?

---

## Prompt 11 — Signals Speakers Tab

**Model:** Sol  
**Strength:** High  
**Dependency:** Prompts 4, 7, and 10 accepted

### Product outcome

Create speaker intelligence that uses canonical profiles and only explicitly speaker-scoped evidence.

### Locked scope

- speaker list
- assigned sessions
- speaker-specific response volume
- confidence/evidence state
- supported findings
- evidence detail
- no-feedback state
- Setup speaker deep links

### Locked rules

- no speaker leaderboard
- no rank ordering
- no generic session logistics attribution
- no finding unless the question/context explicitly concerns that speaker
- non-comparable response sets are not compared

### Acceptance requirements

- real speaker assignments match Agenda
- speaker-specific evidence path is explicit and tested
- `Speaker-specific feedback was not collected` appears when appropriate
- generic session comments do not affect speaker findings
- evidence quotes link to correct question/response/session/speaker
- no hard-coded speaker sentiment

### Finalization questions

- How is speaker specificity represented in Question or target context?
- Is a speaker-target relation needed, or can existing question/target provenance safely represent it?
- What normalization/backfill is required for existing demo evidence?

---

## Prompt 12 — Canonical Action/Tasking Backend

**Model:** Sol  
**Strength:** Extra High  
**Dependency:** Intelligence foundation accepted

### Product outcome

Establish one canonical operational task record with assignment, status, due dates, updates, immutable history, and linked evidence.

### Required architecture decision

Choose one and document it before editing:

1. extend/promote `EventIssueCluster` into the canonical actionable record, or
2. add one canonical `EventAction` model linked cleanly to findings/clusters

Do not create a third uncoordinated action family beside `EventIssueCluster` and `AnswerEventAction`.

### Locked capabilities

- event/account scope
- source finding/cluster
- linked evidence
- title/summary
- classification
- priority
- owner
- due date
- status
- blocked reason
- resolution
- immutable history
- written updates
- voice-update storage/transcription architecture
- canonical mutations
- valid transitions
- idempotency

### Locked classifications

- During this event
- After-event follow-up
- Next-event learning
- Informational, no action required

Informational items are not action records unless explicitly converted.

### Locked status direction

- Unassigned
- Open
- Working
- Blocked
- Complete
- Dismissed/Cancelled when required

### Acceptance requirements

- one canonical action authority
- current issue ownership/status can migrate or map safely
- every mutation writes immutable history once
- retries do not duplicate history
- cross-account owner rejected
- linked evidence remains canonical
- internal voice updates cannot enter attendee evidence
- thin routes and tested services

### Finalization gate

The final prompt must include a written action-architecture decision and migration strategy before implementation begins.

---

## Prompt 13 — Desktop Actions Tab

**Model:** Terra  
**Strength:** High  
**Dependency:** Prompt 12 accepted

### Product outcome

Deliver the full desktop tasking workspace under Signals → Actions.

### Locked views

- My actions
- All actions
- Unassigned
- Working
- Blocked
- Complete
- After-event follow-up
- Next-event learning

### Locked scope

- search/filter/sort
- action rows/cards
- owner
- priority
- due date
- status
- source finding
- action detail
- assignment/reassignment
- status transitions
- written update
- update/history timeline
- linked evidence
- responsive desktop/tablet behavior

### Acceptance requirements

- all data is persisted
- every filter is real
- action detail deep link works
- history reflects assignment/status/update events
- desktop uses canonical backend only
- evidence opens correctly
- no email is sent yet unless Prompt 14 is complete
- mobile-specific UI is deferred to Prompt 15 without creating a second model

### Finalization questions

- What exact action routes/services were created?
- Which URL pattern will become the email/mobile deep link?
- Does action detail use a route, drawer, or responsive hybrid?

---

## Prompt 14 — Assignment Email and Delivery Tracking

**Model:** Sol  
**Strength:** High  
**Dependency:** Prompts 12 and 13 accepted

### Product outcome

Make action assignment a reliable, observable handoff with idempotent email delivery and retry.

### Locked scope

- durable notification delivery model
- provider adapter
- assignment mutation integration
- reassignment behavior
- idempotency key
- failure state
- retry mutation
- delivery history
- email content
- responsive action deep link
- tests with provider mock/fake

### Required behavior

- first assignment sends one email
- reassignment sends one email to the new owner
- saving same owner sends none
- request retry sends none twice
- email failure does not roll back assignment
- UI can display `Email not sent`
- Retry is explicit and idempotent
- cross-account/inactive recipient rejected according to policy

### Acceptance requirements

- notification record is authoritative
- provider message ID/status stored when available
- attempt count and failure reason visible
- deep link opens canonical action detail
- no email side effect hidden in UI code
- assignment and notification tests are deterministic

### Finalization questions

- Which email provider/infrastructure already exists?
- What base URL and auth-return behavior should the deep link use?
- Is outbox/background delivery available, or must the service support safe synchronous attempt plus durable retry?

---

## Prompt 15 — Mobile Web My Actions

**Model:** Terra  
**Strength:** High  
**Dependency:** Prompts 12–14 accepted

### Product outcome

Deliver the assignee-facing mobile web action workflow using the same canonical records and mutations as desktop.

### Locked scope

- My Actions mobile list
- due/overdue state
- working/blocked/complete filters
- email deep-link landing
- mobile action detail
- complete/block/working/reopen
- written update
- voice update
- evidence
- history
- return navigation
- auth return behavior

### Locked rules

- no native app
- no mobile-only action model
- no separate business logic
- internal voice update must not become attendee feedback
- desktop reflects mobile updates immediately after refresh/revalidation

### Acceptance requirements

- email link opens correct action after authentication
- same record appears desktop and mobile
- status mutation is shared
- written and voice updates share canonical history
- blocked reason preserved
- responsive layout has no clipped controls
- keyboard, screen-reader, and touch behavior are usable

### Finalization questions

- What route/deep-link pattern did Prompt 13 establish?
- What audio upload/transcription helpers can be safely reused without using attendee Answer records?
- How does current auth callback preserve return URL?

---

## Prompt 16 — Pre-Event Signals

**Model:** Terra  
**Strength:** Medium  
**Dependency:** Prompts 2 and 7 accepted; canonical lifecycle helper available

### Product outcome

Deliver a truthful readiness-focused Signals experience before evidence exists.

### Locked scope

- canonical lifecycle derivation
- agenda completeness
- listening-plan coverage
- selected sessions missing survey
- survey readiness
- availability
- public link/QR/signage readiness
- speaker-specific collection readiness
- no-response empty states
- direct Setup links

### Locked rules

- no findings before evidence
- no fake zero-valued live dashboard
- no current-event alert framing
- all readiness counts derive from Setup data

### Acceptance requirements

- correct pre-event lifecycle selected
- each readiness problem links to correct Setup tab/record
- no response data produces a deliberate empty state
- Agenda and Event Areas counts agree
- shell and Signals tabs remain consistent

### Finalization questions

- What event timezone/lifecycle helper exists by this stage?
- Which readiness payload can be shared between Setup Overview and pre-event Signals?

---

## Prompt 17 — Post-Event Closing Brief

**Model:** Terra  
**Strength:** High  
**Dependency:** Prompts 9–15 accepted

### Product outcome

Deliver a leadership-ready closing brief that is materially different from the live operational dashboard.

### Locked structure

1. Closing summary
2. Event verdict
3. Key findings
4. Decisions and follow-through
5. Supporting evidence
6. Generate/share closing brief

### Locked content

- overall outcome
- sentiment
- response volume
- listening-point coverage
- what worked
- friction
- what should change next time
- evidence strength
- sessions
- speakers
- unresolved actions
- owners/status/due dates
- after-event follow-up
- next-event learning

### Locked rules

- not a renamed live dashboard
- unresolved tasks cannot disappear
- confidence remains visible
- evidence links remain functional
- after-event follow-up and next-event learning remain distinct

### Acceptance requirements

- post-event lifecycle derives canonically
- page hierarchy matches closing-brief direction in HTML/handoff
- all summary values derive from one consistent payload
- action status is current
- share/generate behavior uses real page data
- no disconnected promotional card

### Finalization questions

- What export/share infrastructure currently exists?
- Is the brief generated on demand or rendered as a shareable route?
- Which lifecycle status/date combination marks post-event?

---

## Prompt 18 — Cross-Workspace Integration and Hardening

**Model:** Sol  
**Strength:** Extra High  
**Dependency:** Prompts 0–17 accepted

### Product outcome

Make the complete Voice for Events redesign coherent, secure, responsive, performant, and production-ready.

### Locked audit areas

- Events → Setup → Signals → Settings navigation
- every Setup tab
- Agenda import and manual management
- Event Areas/listening setup
- Surveys/Operations/QR/signage
- Signals Overview/Intelligence/Sessions/Speakers/Actions
- email assignment
- mobile My Actions
- pre/in/post lifecycle
- evidence traceability
- cross-account permissions
- demo data consistency
- responsive behavior
- old routes/dead links
- performance/query behavior
- test quality

### Required consistency journey

Prove one connected dataset through:

```text
imported session
→ Agenda session
→ selected listening point
→ attached survey
→ public link/QR
→ response provenance
→ session evidence
→ speaker evidence when explicitly scoped
→ finding
→ action
→ assignment email
→ mobile update
→ desktop history
→ post-event closing brief
```

### Locked hardening requirements

- no disconnected controls
- no old-dashboard loops
- no duplicated event header
- no stacked duplicate filters
- no stale repeated counts
- no hard-coded demo state in product components
- no cross-account access
- no duplicate assignment email
- no title-matching evidence authority
- no unselected-session coverage penalty
- no generic feedback attributed to speakers
- no hidden import partial success
- no mobile-only action logic
- no attendee evidence contamination from staff updates
- kiosk/QR/transcription remain working
- SMB remains working

### Testing requirements

- focused unit/service/route/component coverage
- full Events Playwright journey
- responsive desktop/tablet/mobile journeys
- auth/tenant regression
- real persistence integration where available
- SMB regression
- typecheck
- Prisma validate/generate
- production build

### Finalization gate

Prompt 18 must be written from a fresh final audit of the actual branch after Prompt 17. It should name exact remaining defects and must not become a vague “polish everything” request.

---

## 5. Completion Record Template

After each prompt, append or maintain a build record using this format:

```text
Prompt completed:
Branch/commit:
Files changed:
Schema/migration:
Behavior delivered:
Tests added/updated:
Verification results:
Visual review:
Known limitations:
Decision needed before next prompt:
Next prompt status: ready / blocked / needs rewrite
```

---

## 6. Initial Run Order

Start with:

1. Prompt 0
2. Review Prompt 0 output and tests
3. Prompt 1
4. Review Prompt 1 in desktop and mobile widths
5. Finalize Prompt 2 using the real shell architecture

Do not begin schema or importer work until the permanent shell and connected Setup navigation are stable.
