# Combinatorial reduction and executable scope

> Plan §78, Prompt 14 item 10. **Published so a blank matrix cell reads "excluded by
> pairwise, covered nightly" rather than "forgotten".**

## Why a reduction is mandatory

The plan says journeys *"should be parameterized by the relevant role, scope, lifecycle,
data-completeness, network, and retry states"*. Taken literally:

```
9 roles × 4 scopes × 8 lifecycle states × 13 data states × 12 network states × 9 retry states
= 4,043,520 cases per journey
```

At 10ms per case that is 11 hours **for one journey**. Without a stated reduction the team
improvises the cut silently, and the gap between "tested" and "excluded" becomes accidental.

## The strategy

### 1. Pairwise (all-pairs) is the default

Cover every *pair* of parameter values rather than every combination. For the parameter set
above, all-pairs needs roughly **160 cases** instead of 4,043,520 — four orders of
magnitude — and empirically catches the large majority of interaction defects, because most
real bugs involve one or two interacting factors, not six.

### 2. Full cross-product for P0 invariants only

No reduction is applied to:

| Invariant | Why |
|---|---|
| Tenant isolation | A single uncovered pair is a cross-customer data leak |
| Event isolation | Same, within a company |
| Authorization denial | An uncovered role/action pair is an unauthorized mutation |
| Duplicate side effects | An uncovered retry/network pair is a duplicate send or charge |

### 3. Historical escaped defects are pinned, and exempt

Every defect that reached production gets its exact parameter combination pinned, forever,
regardless of whether pairwise would have selected it. A bug that escaped once has proven
the reduction did not cover it.

Pinned combinations in this program:

| Pinned case | Origin | Test |
|---|---|---|
| Edit Product Focus with all four strategy fields populated | note B | `lead-domain/briefing-strategy-autosave` |
| `Sarah Meister` mapped as Full Name | note D | `lead-import-name-mapping` |
| Surname-only + company marked ready | note E | `lead-domain/import-readiness-parity` |
| Recording on Lead A, navigate to Lead B, stop | §69 | `.maestro/…/recording_binds_to_originating_lead` |
| Rich conversation data served by the legacy fallback | incident `e4f422c` | `dashboards/fallback-provenance` |
| Mobile OAuth launch intercepted by middleware | production outage | `api/route-inventory-and-middleware` |
| 2:30 PM availability request | §47 | `provider/calendar-availability` |
| Draft signed with a seeded identity | note H | `campaigns/draft-identity-and-scope` |

### 4. Stated wall-clock target per cadence

| Cadence | Scope | Target | Actual |
|---|---|---|---|
| every commit | `local-only`, P0+P1 | < 60s | **~20s** |
| every PR | `local-only`, all severities + typecheck | < 5 min | ~25s + typecheck |
| nightly | full suite incl. `prod-safe` reads and Playwright | < 30 min | not yet measured |
| pre-promotion | nightly + visual baselines | < 45 min | not yet measured |

The commit-cadence figure is real and measured by the runner. The nightly and
pre-promotion figures are unmeasured because Playwright and the sandbox lanes have not run
in this environment — recorded as unknown rather than estimated.

## What is excluded, and where it is covered instead

| Excluded from per-commit | Reason | Covered by |
|---|---|---|
| Full role × scope × lifecycle cross-product on non-P0 journeys | pairwise reduction | nightly pairwise set |
| Provider states requiring real consent or revocation | needs a sandbox domain | Tier 2, blocked — LR-INF-003 |
| Real mailbox receipt and bounce classification | needs a real mailbox | Tier 2, blocked |
| Device flows | no simulator | 22 Maestro flows, `requires-device`, not-run |
| Raw RLS enforcement | out of program | `separate-security-db`, excluded |
| Migration apply/rollback | out of program | `migration`, excluded |
| Predicate-removal drills | out of program | `deliberate-break`, excluded |
| Load, soak, concurrency abuse | out of program | `load-stress`, excluded |
| Production writes and canaries | live customer event | deferred — LR-DEFER-001 |

Every row above is **routed and visible** through the runner's category system rather than
silently missing: the runner prints excluded work in its own bucket, and reports not-run
separately from passes.

## How a cell gets filled

A coverage-matrix cell may only move to real coverage (`E2E` / `API` / `U` / `DEV`) when a
named test exists in the Test IDs column *and that test ran*. Moving a cell without naming
the test is the failure mode the matrix exists to prevent.

A cell that stays blank must read as one of:

- **excluded by pairwise** — with the nightly set that covers it
- **excluded by category** — with the category and the reason
- **deferred** — with the blocking condition (LR-INF-001, LR-INF-003, LR-DEFER-001)
- **a gap with an owner** — the only acceptable form of "not done"
