# LR Automated Testing Build — Completion Report

> Produced after Prompt 14, **reconciled after integration** on
> `test/integration-prompts-05-14` (both repos). Covers PATCH 2b and Prompts 1–14.
> Live customer event in progress throughout: no production writes were performed.
>
> Every number below is measured from a single run of the integrated branch, not summed
> across branches.

---

## Overall implementation summary

A three-dimension test system (`area`, `severity`, `category`) over both repositories, with
a runner that aggregates four frameworks into one count and routes tests by where they are
allowed to run. **The primary deliverable is the defect list**, per Brief §12.

The starting point was not a thin suite — it was a thick, partly hollow one. Prompt 1 found
396 web test cases (17%) asserting product *source text* rather than behaviour, 46 files
that were 100% of that shape, and zero tests exercising Postgres RLS. The work since has
been less about adding coverage and more about replacing green tests that proved nothing.

## All files changed

By prompt, on its own branch cut from `test/02b-category-tagging`:

| Prompt | Branch | Files | Tests added |
|---|---|---:|---:|
| PATCH 2b | `test/02b-category-tagging` | 12 | 41 |
| 5 | `test/05-lead-domain` | 7 | 137 |
| 6 | `test/06-mobile-capture` (both repos) | 4 | 26 |
| 7 | `test/07-conversation-pipeline` (both repos) | 5 | 40 |
| 8 | `test/08-intelligence-dashboards` | 6 | 88 |
| 9 | `test/09-workflows-campaigns` | 5 | 48 |
| 10 | `test/10-provider-google` | 6 | 58 |
| 11 | `test/11-ai-output` | 5 | 46 |
| 12 | `test/12-api-async-client-compat` | 4 | 28 |
| 13 | `test/13-security-bypass` | 5 | 58 |
| 14 | `test/14-perf-observability-governance` | 6 | 55 |

Nothing pushed, merged or deployed. No product code changed in any prompt.

## Migration files created

**None.** Schema was LOCKED throughout. Two findings (LR-PROD-012, LR-PROD-010) would need
schema changes to fix; both are recorded as findings rather than actioned, which is the
correct outcome under a locked schema.

## Tests run / passing status

Measured on the integrated branch:

```
3710/3721 passed · 11 failed · 24 known-defect · 1 skipped · 39 not-run · 8 excluded · 26s
```

Mobile, measured separately (`npx vitest run`): **575 passed, 4 skipped, 105 files**.

- **11 failures are pre-existing on `main`** and were present before this program began.
  All are stale source-text assertions broken by refactors that preserved behaviour.
  Documented in `BASELINE_AUDIT.md` §3. None was introduced by this work.
- **39 not-run**: 22 Maestro device flows (`requires-device`) and 17 Playwright specs
  (need a running server). Never counted as passes.
- **8 excluded**: 7 `load-stress`, 1 `separate-security-db` — tagged, routed, never run.

Category distribution across all discovered tests: `local-only` 3,740 · `prod-safe` 23 ·
`requires-device` 22 · `load-stress` 7 · `separate-security-db` 1.

## Typecheck / build status

Typecheck clean in **both** repositories after every prompt.

## Total tests by area and severity

| Severity | Tests added |
|---|---:|
| P0 | 232 |
| P1 | 341 |
| P2 | 52 |
| **Total** | **625** |

Areas registered: 47. New suites landed in `test-infra`, `autosave`, `import`,
`lead-domain`, `mobile-localdb`, `conversation-pipeline`, `dashboards`,
`fallback-provenance`, `campaigns`, `workflows`, `provider-gmail`, `provider-calendar`,
`ai-drift`, `ai-quality`, `api-contract`, `security`, `bypass-assertions`, `governance`,
`resilience`.

## Baseline (Prompt 1) vs final count

Both columns are measured, the right-hand one from the integrated branch.

| | Prompt 1 baseline | Integrated (measured) |
|---|---:|---:|
| Executable tests | 3,014 | **3,746** |
| Passing | 3,001 | **3,710** |
| Failing | 12 | **11** |
| Known-defect skips | 0 | **24** |
| Ordinary skips | 0 | 1 *(pre-existing)* |
| Not-run | 38 | 39 |
| Excluded (routed, never run) | — | 8 |

**Net tests added: +732 executable** (3,746 − 3,014), against the 625 written during the
prompts. The difference is the mobile Prompt 3 seam suite and the Prompt 6 handover suites,
which were absent from the branch each prompt measured on and only appear once integrated.

Executable tests by severity on the integrated branch: **P0 1,043 · P1 2,207 · P2 486 ·
P3 10**.

The failure count *fell by one* between the Prompt 1 baseline and now — a pre-existing
failure was fixed by the repository owner mid-programme, not by this work.

## Product defects found, by severity

**19 findings** (4 P0, 5 P1, 7 P2, 3 P3), plus 3 infrastructure blockers. None fixed — Brief §6.

### P0 — 4

| ID | Defect | Surface |
|---|---|---|
| **LR-PROD-015** | `/api/admin/integrations/hubspot/test-sync` is **unauthenticated**, takes an attacker-supplied `leadId`, and pushes that lead to an external CRM. Unauthenticated + IDOR + data egress. | API |
| **LR-PROD-009** | Sign-out purges **no** local device data. On a shared booth device, User B inherits User A's leads, outbox rows and voice notes. | Mobile |
| **LR-PROD-010** | The outbox drain has **no owner scope**, and `sync_outbox` has no owner column. A's queued captures drain under B's identity. | Mobile |
| **LR-PROD-011** | Account deletion leaves `local_voice_notes` on the device. | Mobile |

The three mobile P0s **compound**: fixing any one alone does not close the handover hole.

### P1 — 5

| ID | Defect |
|---|---|
| **LR-PROD-014** | Campaign drafts ship a **duplicated signature** whenever the model produces its own sign-off — which the prompt instructs it to do, so this is the common path, and it reaches customers. |
| **LR-PROD-006** | CSV export does not neutralize formula injection. `=HYPERLINK(...)` as a lead name exfiltrates the adjacent row when the exhibitor opens their own export. |
| **LR-PROD-007** | Two incompatible definitions of "hot" (score ≥67 vs ≥80). Thirteen scores classify differently depending on which helper a surface calls. |
| **LR-PROD-012** | No failure classification before retry. A permanently-failed conversation is eligible for retry forever; bulk reprocess cannot terminate. |
| **LR-PROD-001** | No lease expiry for a workflow step stranded in `running` — never reclaimed, not after a week. |

### P2 — 7

`LR-PROD-013` (fixed-offset timezones book meetings an hour late in summer),
`LR-PROD-003` (`documents.is_archived` has no reachable operation),
`LR-RISK-001` (outbox ordering implicit), `LR-RISK-002` (recording binds to current screen
on ref-miss), `LR-RISK-003` (day-window lexical comparison, latent),
`LR-RISK-004` (unknown template placeholders silently deleted),
`LR-RISK-006` (Apple review login falls back to a hardcoded personal email).

### P3 — 3

`LR-PROD-005` (TS/SQL guardrail merge divergence), `LR-PROD-008` (lying type guard),
`LR-RISK-005` (`x-dev-bypass` header outside the flag inventory).

### Infrastructure — 3

`LR-INF-001` (no test database — all three env files point at production),
`LR-INF-002` (mobile repo has uncommitted third-party work),
`LR-INF-003` (no Google sandbox Workspace domain).

## Tests skipped as KNOWN-DEFECT

**24 on the integrated branch** — the pre-integration estimate of 18 was low, because it
was summed from per-branch runs where the mobile handover skips were not visible. Counted
mechanically from `.lr-test/results.json`:

| Finding | Skips |
|---|---:|
| LR-PROD-006 (CSV formula injection) | 8 |
| LR-PROD-012 (no failure classification) | 4 |
| LR-PROD-009/010/011 (device handover, mobile suite) | 4 |
| LR-PROD-007 (two "hot" definitions) | 2 |
| LR-PROD-001, LR-PROD-008, LR-PROD-013, LR-PROD-014, LR-PROD-015, LR-RISK-003 | 1 each |
| **Total** | **24** |

Each is linked to a finding and paired with a *running* test that documents current
behaviour, so a fix turns the documentation test red rather than leaving a stale finding.

**One ordinary skip remains**, pre-existing and unrelated to this programme:
`tests/journeys/lead-document.e2e.test.ts` — a P1 skipped without a KNOWN-DEFECT marker,
which the runner correctly flags as a Brief §8 violation.

## Plan sections with remaining gaps

| Section | Gap | Reason |
|---|---|---|
| §50 | RLS enforcement | `separate-security-db`, out of program |
| §51 | Migration apply/rollback | `migration`, out of program |
| §55 | Load, soak, pool exhaustion | `load-stress`, out of program |
| §59 | Browser matrix | Playwright not runnable here |
| §61 | Visual baselines | Requires a running app |
| §66 | Production canaries | Deferred — live event |
| §73 | Frozen client contracts | Store-binary commit needs re-verification |
| §80 | Deliberate-break drill | `deliberate-break`, out of program |

## Cases excluded by pairwise reduction

Published in `docs/testing/COMBINATORIAL_REDUCTION.md`. Full cross-product retained for
tenant isolation, event isolation, authorization denial and duplicate side effects. Eight
historical escaped defects pinned and exempt from reduction.

## requires-device tests written but not executed

**22 Maestro flows**, including the one written in Prompt 7 for the §69 recording-to-lead
binding defect. All reported `not-run` by the runner, never counted as passes. No device
result is claimed anywhere in this programme.

## Suite wall-clock by cadence

| Cadence | Measured |
|---|---|
| every commit (`local-only`) | **~20s** |
| PR (+ typecheck) | ~25s + typecheck |
| nightly | **not measured** — Playwright and sandbox lanes never ran here |
| pre-promotion | **not measured** |

Recorded as unknown rather than estimated.

## Flake rate observed

**Zero.** No test passed only on retry across any run. The runner treats a retried pass as a
flake and fails the suite, so this is enforced rather than merely observed.

## Separate security/DB/migration/stress cases deferred

| Category | Files | Status |
|---|---:|---|
| `separate-security-db` | 1 | tagged, hard-blocked from production, excluded from the pass count |
| `load-stress` | 7 | same |
| `migration` | 0 | no tests written; out of program |
| `deliberate-break` | 0 | same |

All four are hard-blocked from ever resolving to a production target — the runner **aborts
the whole run (exit 78)** rather than skipping quietly, because pointing a destructive drill
at production is a configuration error, not a test outcome.

## Deferred — live customer event

`LR-DEFER-001`. Production write and canary coverage deferred and routed to `not-run` by the
runner's live-event guard (`LR_LIVE_EVENT=1`). Read-only production checks were unaffected.
Re-run with the flag unset once the event finishes.

## Known risks

1. **Three compounding P0s on shared booth devices**, open during a live event. Mitigation
   until fixed: do not hand a signed-in device between users.
2. **One unauthenticated CRM egress route** (LR-PROD-015) reachable without any credential.
3. **The 11 pre-existing failures remain red.** They are stale source-string assertions;
   their behavioural replacements exist, but the old files were left in place per Brief §6.
4. **No test database** means the RLS enforcement layer remains unproven by any test.

## Manual QA checklist

```txt
[ ] Sign out on a shared device, sign in as another user, confirm no prior-user data (LR-PROD-009)
[ ] Delete an account, confirm voice notes are gone from the device (LR-PROD-011)
[ ] Export leads containing a name beginning with `=`, open in Excel (LR-PROD-006)
[ ] Generate a campaign draft, check for a duplicated signature (LR-PROD-014)
[ ] Book a meeting with an event timezone of "EST" in summer, verify the hour (LR-PROD-013)
[ ] Confirm hot counts agree between event dashboard and Leads for a score of 70 (LR-PROD-007)
[ ] Verify /api/admin/integrations/hubspot/test-sync rejects an unauthenticated POST (LR-PROD-015)
[ ] Record on Lead A, navigate to Lead B mid-recording, stop, confirm binding (LR-RISK-002)
```

## Branch ready for human review

**Yes.** `test/integration-prompts-05-14` in **both** repositories carries the complete
programme, verified by a single run. The eleven per-prompt branches remain intact for
per-prompt review. Nothing pushed, merged or deployed.

Review order by finding severity rather than prompt number: **LR-PROD-015**
(`tests/api/route-inventory-and-middleware.test.ts`), then **LR-PROD-009/010/011**
(`MOBILE/lib/local-db/deviceHandover.test.ts`), then **LR-PROD-014**
(`tests/ai/model-pinning-and-failure.test.ts`).

### Integration notes

- WEB: 11 commits cherry-picked from the ten prompt branches onto
  `test/02b-category-tagging`.
- MOBILE: `test/07-conversation-pipeline` had been cut from `main` rather than from
  `test/06-mobile-capture`, so it was missing both the Prompt 3 seams and the Prompt 6
  handover suites. The integration branch rebuilds the chain
  `test/03-seams → prompt 6 → prompt 7`, recovering 35 tests that no single earlier branch
  contained.
- Conflicts were confined to two additive files — `scripts/testing/build-tag-registry.mjs`
  (ordered tag rules) and `docs/testing/FINDINGS.md` (appended sections) — plus the
  generated `tag-registry.json`. Additive conflicts were resolved by **union**, never by
  choosing a side; the registry was regenerated from the merged rule set. No test coverage
  was dropped.
