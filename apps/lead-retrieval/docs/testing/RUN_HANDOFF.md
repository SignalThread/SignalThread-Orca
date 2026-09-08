# LR Testing Build — Run Handoff

> Where this run stopped, what is done, and exactly how to resume.
> Prompts 1–4 of 14 complete. Written 2026-08-10.

## Branch chain

Branches are **chained**, not each cut from `main`. Cutting from `main` made Prompt 3
unable to satisfy the standing rules — the runner and coverage matrix did not exist on the
branch, and `npm run test` silently resolved to the old script. Names are as specified;
only the base changed.

```
main
 └─ test/01-baseline-audit     30b060e  docs only
     └─ test/02-runner         83abd18  runner, tagging, CI
         └─ test/03-seams      dbe4ff2  8 seams + inertness proofs
             └─ test/04-auth-isolation  2d150f7  ← HEAD
```

`MOBILE`: `test/03-seams` (3 new files). Its `main` still has 7 dirty files belonging to
another author — untouched. See finding LR-INF-002.

Nothing has been pushed, merged, or deployed.

## State of the suite

```
3133/3145 passed · 12 failed · 1 skipped · 39 not-run · 19s
```

- **12 failures are pre-existing on `main`** and were present before this project began.
  All are stale source-text assertions; none is a product defect. Finding LR-TEST-001.
- **39 not-run**: 21 Maestro flows (no simulator), 17 Playwright specs (no server),
  1 RLS file (no test database).
- Typecheck clean in both repos.

## Done

| Prompt | Status | Key output |
|---|---|---|
| 1 — Baseline audit | ✅ complete | `BASELINE_AUDIT.md`, `COVERAGE_MATRIX.md`; §44/§33/§51 answered from code |
| 2 — Runner | ✅ complete | `npm run test` with all flags; env guard proven to abort (exit 78); 435 files retro-tagged |
| 3 — Seams | ✅ complete | All 8 of plan §77; 77 tests; inert-when-off proven per seam; **no migrations needed** |
| 4 — Auth/isolation | ⚠️ **partial** | Scope-enforcing double + 12 behavioral isolation tests + RLS suite written-not-run |

### Prompt 4, precisely

**Done:** the scope-enforcing Supabase double (`tests/helpers/scoped-supabase.ts`),
behavioral cross-company isolation for email templates via real route-handler invocation,
`requires-testdb` runner support, retagging of the five fake "rls" files to `static`.

**Not done, blocked by LR-INF-001 (no test database):** items 1, 3, 4, 6, 7 and 8 of the
Prompt 4 brief — the session lifecycle state machine, tenant isolation for *every*
account-owned entity, the full event-isolation matrix including the import regression, RLS
per role per table, seat/licence concurrency, and destructive-operation end states.

**Not done, not blocked:** item 2 (every action across all roles) and item 5 (the direct
API security matrix) are largely doable with the double. They are the natural next step.

## Resume here

### 1. Unblock the database work — highest value

Everything downstream is gated on this.

```bash
# Create a separate Supabase project, apply migrations 0001–0097, then:
export LR_TEST_SUPABASE_URL=https://<testref>.supabase.co
export LR_TEST_SUPABASE_SERVICE_ROLE_KEY=<key>
export LR_TEST_ALLOWED_SUPABASE_REFS=<testref>
export LR_REQUIRE_TEST_ENV=1
```

Then implement `buildFixture()` in `tests/db/rls-enforcement.test.ts`. The assertions are
already written; only fixture construction and teardown are missing.

### 2. Commit or stash the mobile tree

Prompts 6 and 7 are mobile-primary and cannot start safely until `MOBILE` `main` is clean.

### 3. Set five CI secrets

`.github/workflows/lr-tests.yml` is committed but will fail on first run without
`LR_PROD_SUPABASE_REF`, `LR_PROD_GOOGLE_CLIENT_ID`, `LR_TEST_ALLOWED_SUPABASE_REFS`,
`TEST_SUPABASE_*`, `MOBILE_REPO_TOKEN`.

### 4. Continue Prompts 5–14

Order is unchanged. Two revisions to the original estimate, from what Prompt 1 found:

- **Prompt 9 (workflows) is smaller than planned.** 373 cases, only 27 source-string —
  the healthiest large area. Topology is now known, so §44 shrinks to single-tick
  guarantees plus the cron/kick CAS race.
- **Prompt 8 (intelligence) is larger.** 88 source-string cases, the highest of any area.
  It is unblocked: the Prompt 3 provenance seam is built and tested.

## Practices this run established — keep them

1. **Run the deliberate-break drill on every new denial test.** It caught that my own
   isolation tests were passing for the wrong reason: a partial PATCH body was rejected at
   validation with 400 and never reached the database, so "not 200 and B unchanged" was
   true regardless of scoping. Only 1 of 12 tests went red against a genuinely broken
   route; after the fix, 3 of 12 do. Finding LR-TEST-004.

2. **Never let an unavailable test count as a pass.** `not-run` is a first-class status
   for device flows, browser specs and database tests alike.

3. **Prefer replacing a source-string test over repairing it.** Repairing the regex
   restores a green that never meant anything.

4. **Verify numbers before publishing them.** The coverage-matrix roll-up is counted
   mechanically from the table's own cells, and the Prompt 3 improvement is explicitly
   labelled as dilution from new rows rather than as replaced weak coverage — because it
   was.

## The one number that matters

**33 coverage-matrix rows carry severity P0. 26 still have no real coverage at their
canonical enforcement point.** That is the backlog. Prompts 1–4 moved it by one.
