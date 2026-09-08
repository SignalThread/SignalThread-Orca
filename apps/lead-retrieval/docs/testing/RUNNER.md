# LR Test Runner

> Built in Prompt 2. Every prompt from 3 onward registers its tests with it.
> Contract: `TESTING_PROJECT_BRIEF.md` §9. Suite-integrity rules: plan §65.

## What it is

`scripts/testing/lr-test.mjs` is a **thin orchestrator**, not a framework. Four
frameworks stay in charge of running tests:

| Lane | Framework | Repo | Runs here? |
|---|---|---|---|
| `web-node` | `node:test` + `tsx` | WEB | yes |
| `web-playwright` | Playwright | WEB | only with `LR_RUN_PLAYWRIGHT=1` (needs a server) |
| `mobile-vitest` | Vitest | MOBILE | yes |
| `mobile-maestro` | Maestro | MOBILE | **never here** — no simulator; reported not-run |

The runner selects files, resolves their tags, delegates to the right framework,
and aggregates everything into one count and one exit code.

## Commands

```bash
npm run test                            # everything
npm run test -- --area mobile-capture   # one area
npm run test -- --area rls,security     # several
npm run test -- --p0                    # severity filter (--p0 … --p3)
npm run test -- --severity P0,P1        # explicit list
npm run test -- --layer unit,api        # layer filter
npm run test -- --lane web-node         # one lane
npm run test -- --detailed              # per-test output
npm run test -- --json                  # machine-readable, feeds the coverage matrix
npm run test -- --strict-tags           # fail if any file is untagged
npm run test -- --list-areas            # print the registry
```

Every run also writes `.lr-test/results.json` regardless of `--json`.

### Exit codes

| Code | Meaning |
|---:|---|
| 0 | everything passed; known-defect skips and not-run device flows are permitted |
| 1 | a test failed, **or a test passed only on retry**, or a P0/P1 test is skipped without a `KNOWN-DEFECT:` marker |
| 2 | user error — unknown area, severity or layer; a filter matching nothing; untagged files under `--strict-tags` |
| 78 | the environment guard aborted the run before any test executed |

A filter that matches nothing exits 2 rather than reporting `0/0 ✓`. Reporting a
green zero for a mistyped area is exactly the false-green this project exists to
eliminate.

## Tagging

Every test file carries `area`, `severity` and `layer`.

**New tests declare their own tags** with a directive in the first 60 lines:

```ts
// @lr area=rls severity=P0 layer=db
```

A directive naming an area that does not exist in `scripts/testing/areas.mjs` throws.
There is no silent fallback — a typo would otherwise create a phantom area that no
`--area` invocation ever selects.

**Pre-existing tests are tagged by registry.** `scripts/testing/tag-registry.json`
maps all 435 files inherited from Prompt 1. It is generated, not hand-edited:

```bash
npm run test:tags          # regenerate
npm run test:tags:check    # CI gate — fails if stale
```

To retag a group of files, edit the ordered `RULES` in
`scripts/testing/build-tag-registry.mjs` and regenerate. A directive always beats the
registry, so a single file can be corrected in place.

Severity follows Brief §8: P0 catastrophic (isolation, unauthorized send, secret
leakage, data loss), P1 critical workflow, P2 major, P3 minor.

## Counting rules

These are the rules that make the number trustworthy, and each exists because the
opposite behavior lies:

- **Known-defect skips are counted separately.** A skip marked `KNOWN-DEFECT:` is
  reported in its own column, never folded into passes. Brief §6.
- **`not-run` is never a pass.** The 21 Maestro flows and 17 Playwright specs that
  cannot execute here are reported as not-run. Claiming a device result nobody
  observed is the failure mode the prompts document calls out by name.
- **Retries are reported, never hidden.** A test that passes only on retry is a flake,
  is listed as one, and **fails the suite**. Plan §65: "a suite that passes only after
  reruns is failing".
- **P0/P1 may not be quarantined.** A P0 or P1 skip without a `KNOWN-DEFECT:` marker
  fails the run. Brief §8.
- **Suites are not counted as tests.** `node:test` emits suite completions through the
  same event as test completions. The NDJSON reporter filters them, which is why the
  runner reports 2,481 web tests where a naive `grep -c ✔` over spec output reports
  2,730.

## Environment safety guard

Brief §11. Runs before any test, in every lane, in every job.

It aborts (exit 78) when:

- `VERCEL_ENV=production`, or `NODE_ENV=production` without `LR_ALLOW_NODE_ENV_PRODUCTION=1`
- the configured Supabase project ref matches the production project
- the configured Google OAuth client matches the production client
- `LR_REQUIRE_TEST_ENV=1` and the target project is unidentified or not allowlisted

Production identifiers are **never committed**. They resolve at runtime from
`LR_PROD_SUPABASE_REF` / `LR_PROD_GOOGLE_CLIENT_ID`, or from `.env.production.local`,
which is gitignored. Committing a denylist would put the production project ref in the
repo for the sake of keeping it out.

The guard is fail-closed on match and fail-open on absence: with no Supabase URL
configured there is nothing to leak into, so the run proceeds. That is the current
state of this suite. **CI sets `LR_REQUIRE_TEST_ENV=1`**, which inverts it and demands a
positively identified test project — the posture to keep once Prompt 4 introduces real
database tests.

Proven to abort:

```console
$ LR_PROD_SUPABASE_REF=dangerprod NEXT_PUBLIC_SUPABASE_URL=https://dangerprod.supabase.co npm run test
  ╔══════════════════════════════════════════════════════════════════╗
  ║  LR TEST SUITE ABORTED — PRODUCTION ENVIRONMENT DETECTED         ║
  ╚══════════════════════════════════════════════════════════════════╝
   ✖ Configured Supabase project ref "dangerprod" is the PRODUCTION project.
   No test was executed.
$ echo $?
78
```

## Baseline, established by this runner

Prompt 1 counted test cases statically, by regex over `it(` and `test(`. The runner
counts them at runtime. **The runtime number is the correct one** — the static count
misses parameterized tests generated in a loop, which run many times but appear once
in source.

| | Static (Prompt 1) | Runtime (this runner) |
|---|---:|---:|
| WEB `node:test` | 2,327 | **2,481** |
| MOBILE Vitest | 540 | **533** |
| Total executable | 2,867 | **3,014** |

Verified against each framework's own totals: `node:test` self-reports
`tests 2481 / suites 314 / pass 2468 / fail 12 / skipped 1`, and Vitest self-reports
`533 passed`. Both match the runner exactly.

Current state:

```txt
3001/3013 passed · 12 failed · 1 skipped · 38 not-run · 23s
```

The 12 failures are the pre-existing stale source-string assertions documented in
`BASELINE_AUDIT.md` §3. The 38 not-run are 17 Playwright specs (need a server) and 21
Maestro flows (need a device).

## CI cadence

`.github/workflows/lr-tests.yml`, per plan §30:

| Trigger | Job | Scope |
|---|---|---|
| every PR | `pr` | P0 + P1, `--strict-tags`, plus typecheck |
| push to `main`, nightly 06:00 UTC | `nightly` | full suite |
| manual `pre-promotion` | `pre-promotion` | full suite + Playwright + build |

Every job depends on the `tags` gate, so an untagged test file blocks the run before
any test executes.

**Mobile checkout:** the mobile repo is checked out as a sibling. Without it the runner
still works and simply finds no mobile lane — set `LR_MOBILE_ROOT` to point elsewhere.

## Adding an area

1. Add it to `AREAS` in `scripts/testing/areas.mjs` with a description, repo, owning
   prompt, and the plan sections it proves.
2. Tag the tests, by directive or by adding a rule to `build-tag-registry.mjs`.
3. Add the row to `COVERAGE_MATRIX.md`.

`tests/testing-infra/lr-runner-contract.test.ts` asserts that every area the prompts
document names exists in the registry, so a missing area fails rather than surfacing
later as a mysterious empty filter.
