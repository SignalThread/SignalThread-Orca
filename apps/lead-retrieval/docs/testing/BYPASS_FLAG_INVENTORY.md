# Bypass-shaped flag inventory

> Started in Prompt 3, consumed by Prompt 13. Plan §75.
>
> Every flag here must have a **positive production rejection assertion** — a test that
> asserts the path *rejects* in production, not merely that it is unset. Plan §75 also
> requires CI to fail when a new bypass-shaped flag is added without one.

## Why this file exists rather than the plan's list

Plan §75 names seven flags. Prompt 1 checked all seven against the code:

- **three do not exist**: `ALLOW_DEMO_LEAD_INTELLIGENCE_SEED`, `ALLOW_DEV_LEAD_BRIEFING_SEED`,
  `ALLOW_PROD_WORKFLOW_SEED`
- **five `*_DEBUG` flags the plan does not name do exist**

Prompt 13 must build from this inventory, not from the plan's list. Writing assertions
for three flags that do not exist would produce three tests that pass forever while
proving nothing, which is the exact failure mode this project is here to remove.

## Inventory

| Flag | Exists | Gate module | Production rejection asserted | Owner |
|---|:---:|---|:---:|---|
| `E2E_AUTH_BYPASS_ENABLED` | ✓ | `lib/e2e/e2e-auth-bypass-policy.ts` | ✗ | P13 |
| `APPLE_REVIEW_LOGIN_ENABLED` | ✓ | apple review login policy | ✗ | P13 |
| `DEMO_SEED_ALLOWED_COMPANY_IDS` | ✓ | demo seed guard | ✗ | P13 |
| `ALLOW_LEAD_INSIGHTS_PLAYGROUND` | ✓ | insights playground guard | ✗ | P13 |
| `LR_TEST_SEAMS_ENABLED` | ✓ **new in P3** | `lib/testing/seam-policy.ts` | ✗ | P13 |
| `EXPO_PUBLIC_LR_TEST_SEAMS_ENABLED` | ✓ **new in P3** | `MOBILE/lib/testing/seam-policy.ts` | ✗ | P13 |
| `ADMIN_ROUTE_DEBUG` | ✓ | inline | ✗ | P13 |
| `APOLLO_ENRICHMENT_DEBUG` | ✓ | inline | ✗ | P13 |
| `LOADTEST_DEBUG` | ✓ | inline | ✗ | P13 |
| `WORKFLOW_DEBUG` | ✓ | inline | ✗ | P13 |
| `WORKFLOW_EMIT_DEBUG` | ✓ | inline | ✗ | P13 |
| `LEAD_ROUTE_DEBUG` | ✓ **found in P13** | inline | ✗ | P13 |
| `LEAD_BRIEFING_RLS_DEBUG` | ✓ **found in P13** | inline | ✗ | P13 |
| `x-dev-bypass` (request **header**, not an env var) | ✓ **found in P12** | `middleware.ts` | n/a — gated on `NODE_ENV=development`, asserted | P13 |
| `LR_ALLOW_NODE_ENV_PRODUCTION` | ✓ **new in P2** | `scripts/testing/env-guard.mjs` | n/a — test-runner only, never read by the app | P13 |
| `ALLOW_DEMO_LEAD_INTELLIGENCE_SEED` | ✗ absent | — | n/a | — |
| `ALLOW_DEV_LEAD_BRIEFING_SEED` | ✗ absent | — | n/a | — |
| `ALLOW_PROD_WORKFLOW_SEED` | ✗ absent | — | n/a | — |

**Thirteen live bypass-shaped env flags in application code, plus one header-based bypass.
Zero production rejection assertions today.**

`LEAD_ROUTE_DEBUG` and `LEAD_BRIEFING_RLS_DEBUG` were found by the automated scanner in
Prompt 13, not by the manual sweep in Prompt 1 — which is the argument for the scanner
existing. `tests/security/bypass-gates.test.ts` now fails when a bypass-shaped flag appears
in `app/` or `lib/` without a row here.

## The two flags Prompt 3 added

Both route through a single policy module per repo, which is the point: a twelfth seam
cannot be added later without inheriting the gate, and Prompt 13 asserts one rule per
repo rather than one per seam.

### `LR_TEST_SEAMS_ENABLED` (web)

Gate: `lib/testing/seam-policy.ts`. Denies when:

- `NODE_ENV === "production"`
- `VERCEL_ENV === "production"` **or `"preview"`** — preview deploys carry real provider
  credentials and customer-shaped data, so they are treated as production
- the value is anything other than the exact string `"true"`

Controls all eight seams: clock, ids, provenance exposure, fault injection, unknown
provider outcome, correlation pinning, queue drain, AI stubbing.

### `EXPO_PUBLIC_LR_TEST_SEAMS_ENABLED` (mobile)

Gate: `MOBILE/lib/testing/seam-policy.ts`. Denies in a production build
(`NODE_ENV === "production"` and `__DEV__ !== true`) or when the value is not exactly
`"true"`. The `EXPO_PUBLIC_` prefix means the Expo bundler inlines it at build time, so
a release binary cannot have seams switched on at runtime.

Controls the mobile outbox drain seam.

## What Prompt 13 must assert

For each flag above:

1. the path **rejects** when `NODE_ENV=production`, regardless of the flag's value
2. the path **rejects** when the flag is unset
3. the path rejects for near-miss values (`"1"`, `"TRUE"`, `" true "`)
4. no elevated scope is granted even when the flag is legitimately on

Items 1–3 are already covered for the two seam flags by
`tests/seams/seam-inertness.test.ts` and `MOBILE/lib/testing/seam-inertness.test.ts`.
Prompt 13 extends this to the other nine and adds the CI check that fails when a new
flag appears without a row here.
