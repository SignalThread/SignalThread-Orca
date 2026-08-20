# OrcaOS Slice 4 — Persistence-design audit

**Status:** decisions implemented; the live development database parity repair was deployed through the active Prisma workflow. Staff and AV use their existing session-level models as canonical authorities; requirement-template GET is pure read with explicit write initialization.

## Audit gate and method

- **Branch/worktree:** `feature-updates-initial-demos`, clean at `2824d0e2` (the Slice 3 QA checkpoint). No Slice 4 commit existed at audit start.
- **Inputs reviewed:** engineering standards, project context, architecture and RBAC records, schema guardrails, test harness/regression policy and coverage records, and the Slice 1–3 audit/QA documentation.
- **Independent review reconciliation:** persistence and authorization/regression reviews reached the same conclusion: current route guards and event scoping do not cure the persistence-authority conflicts below. No reviewer changed files.
- **Scope:** staff-assignment authority, AV source of truth, and GET-time requirement-template persistence only. Attendance, check-in, no-show, `checkedInAt`, and attendance history are out of scope; any existing attendance behavior is legacy functionality for a future removal decision.

## Classification key

1. No database change required.
2. Existing model safely supports the fix.
3. Additive schema change may be required.
4. Product or database decision required.

## Reconciled findings

| Topic | Current implementation and authority | Authorization/isolation | Persistence and workflow consequence | Classification / required decision |
|---|---|---|---|---|
| Staff assignments | `SessionStaffAssignment(sessionId, personId, role)` is canonical. | Reads/mutations remain event-scoped through `MatrixRow.eventId`; PATCH remains event-write guarded. | A migration copies valid legacy rows without overwriting canonical rows; legacy raw table is no longer read or written. | **2 + additive data migration.** Canonical rows win conflicts; legacy table remains physically intact for rollback. |
| AV requirements | `SessionAVRequirement` is canonical. | Reads/mutations scope through the session event; Command Center now reads only structured AV rows. | A migration parses legacy Matrix AV text only for sessions with no structured rows. Legacy fields remain rollback-only projections. | **2 + additive data migration.** Structured rows win conflicts. |
| Requirement-template GET behavior | GET returns only the existing event template. POST explicitly initializes/repairs defaults under event-write authorization. | GET is event-read; initialization is event-write. | No read creates templates, sections/items, or event pointers. Event creation remains the normal lifecycle initializer. | **2.** Existing models/unique keys support idempotent lifecycle provisioning. |

## Evidence and regression posture

- Route and service guards are server-side: `web/app/api/events/[eventId]/matrix-2/route.ts` performs request-user resolution and event-read access before snapshot; `web/app/api/events/[eventId]/matrix-2/sessions/[sessionId]/route.ts` requires event-write access before body validation and mutation.
- Existing focused coverage checks routing/authorization and normal Matrix behavior: `matrix2-event-routing-regression`, `matrix2-session-room-flow-regression`, `matrix2-session-retry-and-input-regression`, `wave2-route-auth-hardening-regression`, Matrix snapshot/partial-merge journeys, and requirement-selection tests.
- Those tests do not establish a durable authority or reconciliation rule. The harness can create schema-backed staff rows while Matrix runtime reads the legacy table; AV tests exercise the legacy text contract; no test establishes the permitted side effects of a first GET or concurrent GETs when a template is absent.
- The live development database was found to mark `20260313120000_matrix2_session_operations` applied while the physical `SessionStaffAssignment` table was absent. The new `20260729140000_restore_session_staff_assignment` migration restores only that schema-defined table, key, index, and foreign keys, then `20260729150000_slice4_session_authorities` reconciles valid legacy data. Both were applied with `prisma migrate deploy` through `web/prisma.config.ts`.
- Matrix snapshot now treats a missing canonical staff table as an explicit 503, never a legacy fallback. The UI withholds zero counts and empty-event rendering while a snapshot is unavailable, presents Retry, disables Add Session until a snapshot exists, and gates room/session success on a confirmed reload. The retry controls and stacked modal actions retain usable narrow/mobile layouts.

## Explicitly paused

- Any persistence redesign beyond the approved staff/AV authority cutover and explicit requirement-template initialization; durable assignment identity, a new AV model, or durable template storage.
- F&B, dietary, menus, allergens, verification, coverage, and session-to-menu architecture.
- Import replay, durable import identity/history, speaker concurrency, durable document outcomes, and server-backed command-center persistence.
- No-show, check-in, attendance tracking, `checkedInAt`, `processNoShows`, and attendance history. Legacy attendance functionality is not evaluated or preserved by this Slice 4 audit and needs a separate removal decision.

## Decision record

The authority decisions in `docs/implementation/orca-database-review.md` sections 8–10 have been implemented. The live parity repair is recorded in section 11; it restores an existing model and does not introduce a new product or data-model decision.
