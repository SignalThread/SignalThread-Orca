# OrcaOS Slice 3A — Matrix/session persistence audit

**Status:** paused before implementation because staff-assignment persistence has incompatible authorities.

## Audit gate

- Confirmed branch: `feature-updates-initial-demos`, HEAD `8076fa76`.
- Confirmed the worktree was clean before audit work. No branch, merge, push, schema, migration, seed, relation, index, or persisted-data change was made.
- No current Slice 3 prompt pack exists in the workspace or reachable git history. The dependency map calls the audited Matrix/session work Slice 2; this artifact uses the user-requested Slice 3A label.

## Reconciled source findings

| Concern | Evidence | Result |
|---|---|---|
| Session authority | `prisma/schema.prisma` `MatrixRow`; `web/lib/matrix.ts`; `web/lib/matrix2-session.ts` | `MatrixRow` is the existing event-scoped canonical session record. Core title/time/room/type/status fields use it. |
| Mutation authorization | Matrix and Matrix 2 route handlers resolve the request user, then call `assertEventAccessForUser(eventId, user, "write")` before mutation. | Core mutation routes are guarded. |
| Event isolation | `updateMatrix2Session` scopes MatrixRow, Room, Speaker, and EventPerson lookups by `eventId`. | Foreign room/speaker/person IDs are rejected rather than attached cross-event. |
| Reload parity | `getMatrix2Snapshot` drives Matrix 2 board/list; existing MatrixRow partial-update and Matrix 2 partial-merge tests cover canonical reread semantics. | Safe for existing-model title/time/room/type/status work, subject to the staff blocker below. |
| Status/readiness | `session-status.ts`, `session-readiness.ts`, status template selection, and Matrix 2 PATCH update notes/status through current models. | Existing status/readiness flow has no required schema change. |
| Room Set/Seating | Session route links use existing `matrixRowId` scope; seating service validates MatrixRow event ownership and rejects cross-event plans. | Existing linkage is correctly modelled and can only receive no-schema regression coverage in this paused run. |
| Hidden snapshot write | `getMatrix2Snapshot` ensures session requirement-template records during GET. | Do not change this behavior incidentally; any pure-read contract change requires product/persistence review. |

## Blocking persistence conflict

The checked-in Prisma schema and migration `20260313120000_matrix2_session_operations` define `SessionStaffAssignment(sessionId, personId, role)`. Matrix 2 runtime reads and writes raw SQL against `MatrixRowStaffAssignment(matrixRowId, eventPersonId, assignmentrole)`, which is neither represented by Prisma nor created by that migration. On a migration-conformant database, staff snapshot/edit may fail; on a legacy database, schema-defined staff assignments can be invisible after reload.

This affects Matrix 2 staff assignment edits, session drawer/board/list reload, and staff readiness. It is a persisted-data authority and reconciliation decision, not a safe compatibility refactor. The full alternatives and exact Sarah decision are recorded in `orca-database-review.md` section 8.

## Explicitly deferred

- Matrix import replay and idempotency/history.
- F&B, menu, dietary, allergens, verification, coverage, and session-to-menu architecture.
- Speaker concurrency/uniqueness.
- Durable document outcomes and command-center server persistence.
- Any staff-assignment change, migration, schema, seed, index, relation, or data backfill.

## Read-only regression baseline

Focused suite passed before documentation: Matrix add-session, session-type persistence, status/readiness, event routing, room flow, Matrix row access, and Matrix/Matrix 2 partial-update coverage. The DB-backed session-type test also passed. Production build and `git diff --check` passed. Typecheck remains blocked by the known stale `.next` AI Workspace validator imports; lint reproduces the known 68-error/83-warning backlog. No un-attributed test failure was observed.

## Required decision to resume implementation

Sarah must select the canonical staff-assignment authority: (A) runtime uses `SessionStaffAssignment` with approved legacy-data reconciliation, (B) migrate/reconcile legacy rows into that model before removing compatibility access, or (C) explicitly make `MatrixRowStaffAssignment` canonical in schema/migrations. The decision must state conflict precedence, historical-data disposition, and rollback policy.
