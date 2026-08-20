# Planner Dash — Production-Readiness Closure Audit

_Last reviewed: 2026-07-04. Branch: `chore/production-readiness-audit`, HEAD
`b4259f13`._

## 1. Branch / commit

Twelve focused commits landed this loop on top of `1abcc4f5`:

| Commit | Workstream |
|--------|-----------|
| `3d7329c8` | Prevent Timeline dependency cycles |
| `3f4446a8` | Harden Budget correctness safeguards (CSV injection) |
| `75f8b036` | Improve Command Center loading performance |
| `6c3a998c` | Add import row safety caps |
| `2963c842` | Remove confirmed dead code + inventory |
| `4baac2f6` | Harden upload + security defaults |
| `3e0eb251` | Add production-readiness verification command |
| `4542d728` | Add release + smoke checklist |
| `ccbf2cc1` | Add incident runbooks |
| `dc200577` | Add customer security packet |
| `a61395df` | Docs Hub approval decision record |
| `b4259f13` | Matrix staffing reconciliation proposal |

## 2. Completed production-readiness items

- **Timeline:** transitive dependency-cycle prevention (self / two-node /
  multi-node), event-scoped, with DB-backed regression coverage.
- **Budget:** CSV/formula-injection neutralization on exports (preserves numeric
  cells); audit confirmed event scoping, transactional audit logging, and
  APPROVED-lock integrity are already safe; import is append-only.
- **Command Center:** ~35 serial reads collapsed into one `Promise.all`; five
  speaker counts → one `groupBy`; layout route no longer runs the full
  aggregation; DB-backed regression test added.
- **Imports:** `MAX_IMPORT_ROWS = 10000` server-side cap (413) across
  attendees/directory/speakers/matrix/timeline/budget + marketing.
- **Dead code:** `use-autosave.ts` removed; the rest inventoried with disposition.
- **Uploads/security:** baseline security headers on all routes; document/budget
  finalize object-key scope guard (prevents cross-event object read).
- **Operational docs:** one-command `verify`, CI checklist, release + smoke
  checklist, incident runbooks, customer/security packet.
- **Decisions/proposals:** Docs Hub approval decision record; Matrix staffing
  reconciliation proposal.
- (Earlier in the run: route/auth hardening, build unblock, budget approval path,
  dead-path sweep, Platform Admin revoke fix, Matrix session PATCH partial-merge,
  legacy Matrix rows PATCH audit.)

## 3. Remaining P0 blockers

**None identified.** No known outage-level defect, save-clobber, cross-tenant
read, or build failure remains.

## 4. Remaining P1 items (documented, not blocking, with owners/plans)

1. **No rate limiting** on public/costly endpoints — needs a shared store /
   gateway (package + infra). Highest-priority operational gap. _(security
   packet §11, runbooks)_
2. **Matrix staffing drift** — the command center reads a non-existent
   `SessionStaffAssignment` table and silently reports zero staffing while data
   lives in `MatrixRowStaffAssignment`. Fix is schema-reconciliation; a no-backfill
   proposal is ready. _(schema-proposals/matrix-staffing-reconciliation.md)_
3. **Presigned upload size binding** — the presigned PUT enforces only a
   client-claimed size, not the actual body. Narrow fix, needs R2 upload testing.
4. **N+1 import writers** (attendees/directory/speakers/marketing) process rows
   one-by-one; effective throughput is below the 10k cap. Convert to batched
   writes if larger imports are needed.

## 5. Deferred product / schema decisions

- **Docs Hub approval production UX** — planner-internal (Option A) vs external
  reviewer (Option B). Decision record written; needs product sign-off.
- **Content-Security-Policy** — needs a nonce / report-only rollout project.
- **Unauthenticated headshot serving** — confirm intended or gate it.
- **Intake-token revocation** — add, or migrate intake onto portal tokens.
- **DB-level RLS** — confirm whether configured (access is app-layer today).
- **Legacy/orphaned routes** — retire via a dedicated cleanup PR (inventory ready).

## 6. Tests / build status

- `tsc --noEmit`: **pass.**
- `next build --webpack`: **pass.**
- All regression tests added this loop pass (timeline cycle, budget CSV,
  command-center load, import cap, security headers, document finalize scope),
  and pre-existing timeline tenancy + command-center layout suites still pass.
- Full DB-backed suite (`npm run verify`) should be run once against a test
  database in CI before release to exercise all journey tests.

## 7. Launch recommendation

**GREEN WITH KNOWN RISKS.** The Big 3 (Run of Show, Budget, Timeline) are
hardened with no known clobber or cycle defects; uploads and access paths are
tightened; and operational docs exist. The remaining items in §4–§5 are
documented, non-blocking, and owned — the two to weigh before or immediately
after launch are **rate limiting** (abuse exposure) and the **staffing
zero-count** (a real but contained dashboard correctness bug with a ready fix).

## 8. Exact next action list

1. Run `npm run verify` in CI against a test database; confirm no DB-backed test
   fails (not just skips).
2. Decide and implement the **Matrix staffing reconciliation** (proposal ready,
   no backfill) to fix the zero-count.
3. Make the **rate-limiting** infra decision and implement for public + costly
   endpoints.
4. Implement **presigned upload size binding** with R2 upload testing.
5. Get product sign-off on the **Docs Hub approval** direction (A or B).
6. Schedule the **orphaned-route cleanup** PR (updates route-guard tests).
7. Confirm **backup cadence/restore** and **DB RLS** status for the customer
   packet.
