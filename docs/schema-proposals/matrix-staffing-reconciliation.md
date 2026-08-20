# Matrix Staffing — Rewrite & Schema Reconciliation Proposal

_Proposal only. No schema, migration, or app code is changed by this document.
Requires approval before implementation. Last reviewed: 2026-07-04._

## Ground truth (verified from source)

There are **two** representations of "who is staffed on a session", and they are
out of sync:

1. **`MatrixRowStaffAssignment` — the live table (canonical data today).**
   - Created by migration `web/prisma/migrations/20260313120000_matrix2_session_operations/migration.sql`.
   - Columns: `matrixRowId`, `eventPersonId`, `assignmentrole` (lowercase);
     composite PK `(matrixRowId, eventPersonId)`.
   - Written **only via raw SQL** in `web/lib/matrix2-session.ts` (INSERT … ON
     CONFLICT … DO UPDATE) and read via raw SQL in `web/lib/matrix2.ts`.
   - **Has no Prisma model.**

2. **`SessionStaffAssignment` — a Prisma model with no table.**
   - Defined in `web/prisma/schema.prisma` (≈ line 1298): `sessionId`,
     `personId`, `role`, `createdAt`, `updatedAt`, PK `(sessionId, personId)`.
   - **No migration creates it**, so the table does not exist in the database.
   - Read through Prisma in `web/src/server/services/event-command-center.ts`
     (`prisma.sessionStaffAssignment.count/findMany/groupBy`), each wrapped in
     `readOptionalDataSource`, which swallows the "relation does not exist" error
     and returns the fallback.

### Consequence (the real bug)

Because the command-center reads the non-existent `SessionStaffAssignment` table,
every staffing figure it derives (staffing count, per-role groups, staffing
coverage) **silently falls back to 0/empty**, while the actual staffing lives in
`MatrixRowStaffAssignment`. The two never meet.

## Recommended canonical path

**Adopt the existing `MatrixRowStaffAssignment` table as canonical** and give it a
real Prisma model, rather than creating `SessionStaffAssignment` and migrating
data onto it. Rationale: the live data already sits in `MatrixRowStaffAssignment`,
so this avoids any data move; it is additive and low-risk; and it fixes the
always-zero reads by repointing them at the real table.

(The alternative — make `SessionStaffAssignment` canonical — requires creating the
table, backfilling from `MatrixRowStaffAssignment`, rewriting the raw-SQL writers,
and dropping the old table. More moving parts and a data migration for no benefit,
since the data is already where we want it.)

## Schema / migration proposal (for the approved implementation)

1. Add a Prisma model mapped onto the **existing** table and columns, e.g.:
   ```prisma
   model MatrixRowStaffAssignment {
     matrixRowId    String      @db.Uuid
     eventPersonId  String      @db.Uuid
     assignmentRole String?     @map("assignmentrole") @db.Text
     session        MatrixRow   @relation(fields: [matrixRowId], references: [id], onDelete: Cascade)
     person         EventPerson @relation(fields: [eventPersonId], references: [id], onDelete: Cascade)
     @@id([matrixRowId, eventPersonId])
     @@map("MatrixRowStaffAssignment")
   }
   ```
   Add the reciprocal relation fields on `MatrixRow` and `EventPerson`.
2. **Remove the orphaned `SessionStaffAssignment` model** and its relation fields
   from `schema.prisma`.
3. Generate the migration. It must be a **no-op / introspection-only** change for
   `MatrixRowStaffAssignment` (the table already exists with these columns) and a
   pure schema-model removal for `SessionStaffAssignment` (no DB object exists to
   drop). Verify the generated SQL touches **no data** before applying; if Prisma
   proposes creating/dropping/altering a real table, stop and reconcile the model
   to match the live columns exactly (including the lowercase `assignmentrole`).
4. Regenerate the Prisma client.

## App-code rewrite plan

- Replace the raw-SQL writer in `matrix2-session.ts` with typed
  `prisma.matrixRowStaffAssignment` upserts/deletes (behavior-preserving), keeping
  the existing partial-merge semantics (only rewrite when `staffAssignments` is
  provided).
- Replace the raw-SQL reader in `matrix2.ts` with the typed relation.
- Repoint `event-command-center.ts` staffing reads from
  `prisma.sessionStaffAssignment` to `prisma.matrixRowStaffAssignment` and remove
  the `readOptionalDataSource` guard once the table is real (so failures surface
  instead of silently zeroing).
- Update `web/lib/test-harness/planner-fixtures.ts` to create staffing via the
  canonical model.

## Data / backfill plan

None required — the data already lives in `MatrixRowStaffAssignment`. No rows are
moved, copied, or deleted. (This is the main reason to prefer this direction.)

## Rollback / remediation

- The migration is schema-model-only; rollback is reverting the schema + client
  and redeploying the prior app build. No data rollback is involved.
- Keep the change behind the existing partial-merge behavior so staffing writes
  remain identical in effect.

## Test plan

- Service test: staffing assignments persist and round-trip via the typed model;
  partial-merge still leaves staffing untouched when omitted and clears on an
  explicit empty array.
- Command-center test: staffing counts/groups now reflect real assignments (extend
  the existing `event-command-center-load` test to seed staffing and assert
  non-zero coverage).
- Migration test/manual check: the generated SQL performs no data operations.

## Rollout plan

1. Land the Prisma model + client regen + generated migration (verified no-op on
   data) in one change.
2. Land the app repoint (writers, readers, command-center, fixtures) with tests.
3. Verify staffing renders correctly in the command center against real data.

## Likely files changed (implementation)

- `web/prisma/schema.prisma`, a new `web/prisma/migrations/**` folder, generated
  Prisma client
- `web/lib/matrix2-session.ts`, `web/lib/matrix2.ts`
- `web/src/server/services/event-command-center.ts`
- `web/lib/test-harness/planner-fixtures.ts` + focused tests

## Hard stops for the implementer

- If Prisma's generated migration proposes creating, dropping, or altering the
  live `MatrixRowStaffAssignment` table (rather than a pure model add), **stop** —
  the model does not match the real columns; fix the mapping first.
- Do not move or delete any staffing rows.
- Do not run `prisma migrate` against production; use `migrate deploy` through the
  normal release path after review.
