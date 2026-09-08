# LR Automated Testing — Baseline Audit

> Prompt 1 of `docs/Loop/TESTING_PROMPTS.md`. Plan sections §79 and §28.
> Produced 2026-08-10. Documents only — no test or product code changed.
>
> Repository state at audit:
> - `WEB` branch `test/01-baseline-audit`, `main` at `962a29c`, working tree **clean**
> - `MOBILE` branch `main` at `2ba858c`, working tree **DIRTY — 7 files** (see §7)

---

## 1. Headline

The suite is large, fast, and mostly green. It is also **structurally weaker than its
pass count suggests**, in one specific and correctable way.

| Measure | WEB | MOBILE | Total |
|---|---:|---:|---:|
| Test files | 313 | 101 (+21 Maestro) | 435 |
| Leaf test cases | 2,327 | 540 | 2,867 |
| Cases passing on `main` | 2,315 | 533 | 2,848 |
| Cases **failing** on `main` | **12** | 0 | **12** |
| Cases that assert product **source text**, not behavior | **396 (17.0%)** | 1 (0.2%) | 397 |
| Cases exercising a real database | **0** by default | 0 | **0** |
| Cases driving a real browser | 67 | — | 67 |
| Device flows written but not executable here | — | 21 | 21 |
| Wall clock | ~95 s | 10.6 s | ~106 s |

Three facts define the starting point:

1. **The web suite is red on `main`.** 12 tests fail today, before this project changed
   anything. All 12 are stale source-text assertions, not product defects (§3).
2. **396 web test cases prove nothing about runtime behavior.** They read a `.ts` or
   `.sql` file off disk and regex it. They pass when behavior is broken and fail when
   behavior is correct but a variable was renamed. Both failure directions are present
   in this repo today.
3. **No test in either repo exercises Postgres RLS.** The five files named `*rls*` all
   grep migration SQL text. RLS is a P0 enforcement layer with zero enforcement-layer
   coverage.

The good news is that the remaining 83% is genuinely useful, mobile is clean, and the
gap is concentrated in a list of files short enough to fix deliberately.

---

## 2. Classification method

Classification is **per test case**, not per file. An early file-level pass was
discarded: it flagged `tests/google-token-manager.test.ts` as weak because the file
imports `readFileSync`, when in fact 1 of its 17 cases reads source and the other 16 are
genuine dependency-injection tests against real code. File-level verdicts are misleading
here because mixed files are the norm.

The classifier (`scripts/testing/classify-baseline.mjs`, committed with this prompt)
splits each file into `it(...)` / `test(...)` blocks by brace matching, resolves which
local identifiers are bound to text read off disk, and classifies each block by what its
assertions actually target.

| Verdict | Meaning | WEB | MOBILE |
|---|---|---:|---:|
| `unit-logic` | asserts a real function's return value or thrown error | 1,518 | 514 |
| `source-string` | asserts on product source read off disk | **396** | 1 |
| `unknown` | assertion shape not recognised — manual review needed | 239 | 4 |
| `shallow-ok` | only `assert.ok(...)`, no value comparison | 107 | 0 |
| `real-browser` | Playwright, drives a real page | 67 | — |
| `requires-device` | Maestro flow | — | 21 |
| `real-db` | executes SQL against a live Postgres | **0** | **0** |

`unknown` and `shallow-ok` (346 web cases, 15%) are not necessarily weak — they are
unclassified. They are listed for Prompt 2's retro-tagging pass rather than counted
against the suite here.

---

## 3. The 12 pre-existing failures

`npm run test` exits **1** on `main`. This is the state the project inherits, not a
regression it caused.

| Failing test | File |
|---|---|
| Company A cannot patch or delete Company B template IDs | `tests/documents-email-account-isolation.test.ts` |
| Company A cannot duplicate Company B template IDs | `tests/documents-email-account-isolation.test.ts` |
| viewer/read-only role cannot create, edit, delete, or duplicate templates | `tests/documents-email-account-isolation.test.ts` |
| server enrichment reads displayName from batch row cells (not mock data) | `tests/enrichment-results-stale-rows.test.ts` |
| uses requireExhibitorScope (viewer-inclusive) and web-admin gating | `tests/event-workspace-page.test.ts` |
| exhibitorAdminMayUseAppEventManagementRoutes: exhibitor_admin + company_all_events only | `tests/exhibitor-event-command-center.test.ts` |
| lead list requires eventId for bearer exhibitor_viewer | `tests/exhibitor-mobile-app-authorization.test.ts` |
| Manage events link: hidden for non-exhibitor roles | `tests/exhibitor-viewer-role-pr2.test.ts` |
| `lib/auth/session.ts` normalizes 'exhibitor_viewer' and routes home via the exhibitor web entry resolver | `tests/exhibitor-app-access-web-entry.test.ts` |
| dashboard/leads/leads-detail pages use requireExhibitorScope() (not requireRole) | `tests/exhibitor-app-access-web-entry.test.ts` |
| HubSpot disconnect route enforces auth and never returns token values | `tests/hubspot-disconnect.test.ts` |
| team/users and settings routes are server-enforced | `tests/route-contracts.test.ts` |

**Every one is a source-text assertion, and none indicates a product defect.**

Worked example — the most alarming title in the list:

```js
// tests/documents-email-account-isolation.test.ts:129
it("Company A cannot patch or delete Company B template IDs", () => {
  const route = read("app/api/exhibitor/email-templates/[templateId]/route.ts");
  assert.match(route, /role === "exhibitor_admin"/);   // ← fails here
  ...
});
```

The route was refactored to call `isCompanyAccountAdminSession(sessionUser)` instead of
comparing the role literal inline. The literal is gone; the test fails. The invariant is
intact — verified directly in `app/api/exhibitor/email-templates/[templateId]/route.ts`,
which gates on `isCompanyAccountAdminSession` at lines 28 and 129 and scopes every read,
update and delete with `.eq("account_id", accountId)` at lines 70–71, 148–150 and
174–175.

So a test named for a P0 cross-tenant invariant:

- never sends a request, and would pass if `.eq("account_id", …)` were deleted, provided
  the string `role === "exhibitor_admin"` remained somewhere in the file; **and**
- currently fails for a reason that has nothing to do with tenancy.

It is a false green and a false red in the same seven lines. This is the single clearest
justification for the §79 reclassification, and the pattern repeats across the other 11.

**Disposition:** not fixed here. Prompt 1 changes no test code. These are handed to
Prompt 4 (`tenant-isolation`, `auth-rbac`), which will replace them with API-level and
RLS-level assertions rather than repair the regexes. Until then the suite's true state is
"12 red, cause known, no product impact."

---

## 4. The weaker-claim list

This is the most important output of this prompt. Ordered by source-string case count.

### 4a. Files where **100% of cases** are source-text assertions (46 files, 218 cases)

These read as green while proving only that certain characters exist in certain files.

| Cases | File | Invariant it claims |
|---:|---|---|
| 26 | `tests/publish-step-batch-backed.test.ts` | import publish is batch-backed |
| 19 | `tests/exhibitor-events-command-center-page.test.ts` | account command centre rendering |
| 16 | `tests/enrichment-results-stale-rows.test.ts` | enrichment staleness |
| 9 | `tests/publish-leads-materialization-scope.test.ts` | **publish writes stay in event scope (P0)** |
| 8 | `tests/campaign-generate-draft-route.test.ts` | draft generation route contract |
| 7 | `tests/briefing-rls-exhibitor-admin.test.ts` | **`import_batch_row_briefings` RLS (P0)** |
| 7 | `tests/google-calendar-contract.test.ts` | calendar provider contract |
| 7 | `tests/post-approval-lead-briefing-sync.test.ts` | briefing → lead sync |
| 7 | `tests/publish-v1.test.ts` | publish pipeline |
| 5 | `tests/publish-wizard-enrichment-handoff.test.ts` | enrichment handoff |
| 4 | `tests/imported-lead-event-scope-contract.test.ts` | **imported leads stay in one event (P0, note A)** |
| 4 | `tests/briefings-batch-discard.test.ts` | batch discard |
| 4 | `tests/documents-preview-route.test.ts` | document preview auth |
| 4 | `tests/exhibitor-leads-filter-ui-contract.test.ts` | lead filter UI |
| 4 | `tests/organizer-admin-shell-page.test.ts` | organizer shell |
| 4 | `tests/publish-materialization-briefing-linkage.test.ts` | briefing linkage |
| 3 | `tests/briefing-approval-sync.test.ts` | approval sync |
| 3 | `tests/briefing-lead-linkage-sync.test.ts` | lead linkage |
| 3 | `tests/briefing-queue-batch-status-contract.test.ts` | queue status |
| … | 27 further files at 1–3 cases each | — |

### 4b. Mixed files with the largest source-string blocks

| Source-string / total | File |
|---:|---|
| 33/39 | `tests/event-workspace-page.test.ts` |
| 24/38 | `tests/briefing-flow-2step.test.ts` |
| 12/13 | `tests/briefings-entry-point.test.ts` |
| 11/13 | `tests/workflow-capture-path-no-inline-enrich.test.ts` |
| 8/10 | `tests/enrichment-staleness-e2e.test.ts` |
| 7/10 | `tests/conversation-chunked-upload-route.test.ts` |
| 6/10 | `tests/view-brief-v1-wizard.test.ts` |
| **5/6** | **`tests/cross-tenant-resource-isolation.test.ts`** |
| 4/16 | `tests/conversation-processing-lifecycle.test.ts` |
| 4/8 | `tests/import-wizard-enrichment-batch-scope.test.ts` |
| 4/8 | `tests/journeys/draft-send.e2e.test.ts` |

`tests/cross-tenant-resource-isolation.test.ts` deserves its own line: the file whose
name most directly claims the plan's §2 P0 invariant proves it by regex in 5 of 6 cases.

### 4c. The `journeys/` lane is not what its filenames say

`tests/journeys/*.e2e.test.ts` (14 files) are named `.e2e` and described in
`package.json` as `test:journeys`. They are honest in their own header comments, but the
naming will mislead anyone reading a CI summary.

`tests/helpers/journey-fixtures.ts:60` gates every live-database leg behind
`JOURNEY_LIVE_DB=1` **plus** `SUPABASE_SERVICE_ROLE_KEY` **plus** a pre-existing
`JOURNEY_TEST_COMPANY_ID`. None is set in CI or locally. With the flag off the live leg
skips with a reason string and the file falls back to source-text contract assertions —
for example `tests/journeys/lead-create.e2e.test.ts` asserts
`assert.match(createRoute, /let status: LeadStatus = "new"/)`.

So the "journey E2E suite" currently runs as a lint over route source. It should be
either wired to a real test database (Prompt 2's environment guard makes this safe) or
renamed so no one mistakes it for end-to-end evidence.

### 4d. Fake-database and fake-provider usage

`tests/helpers/fake-supabase.ts` is the shared in-memory shim. It is the right tool for
testing business logic that happens to take a client, and the wrong tool for testing
scope predicates — a fake that ignores `.eq("company_id", …)` will happily return
cross-tenant rows to a passing test. Which of the two it is being used for needs a
case-by-case call during Prompt 4; it is not machine-decidable and is not counted in the
396 above.

---

## 5. Plan sections with zero or near-zero coverage

Mapped by path and content keyword; a file may map to several sections.

### Zero automated coverage

| Plan § | Subject | Note |
|---|---|---|
| §50 | **RLS as an enforcement layer** | 5 files named `*rls*`, all grepping SQL text. No test authenticates as a role and queries Postgres. |
| §56 | Resilience / fault injection | Requires the Prompt 3 seams; none exist. |
| §57 | Observability, correlation IDs, alerts | No correlation ID threading found. |
| §60 | Accessibility | Deferred by plan v3.1. |
| §61 | Visual regression | No baselines in either repo. |
| §62 | Time / timezone / DST matrix | Blocked on the injectable clock (§77). |
| §66 | Production smoke / synthetic canary | `scripts/canaries/` exists but is manual, not asserted. |
| §70 | AI prompt assembly scope leak | `OPENAI_MODEL` unpinned (`lib/campaigns/llm-draft-generator.ts:38`, default `gpt-4o-mini`); no prompt snapshot. |
| §71 | Silent fallback provenance | No source provenance in any read payload. |
| §72 | Local DB migration + device handover | See §6 below. |
| §73 | Shipped-client contract snapshots | No frozen contracts; no artifact per store binary. |
| §74 | Outbound webhooks / CRM | HubSpot and ZoomInfo files exist but cover connect/disconnect only. |
| §75 | Bypass-path production assertions | See §6 below. |
| §76 | Provider test tiering | No tier declared for any provider case; no replay fixtures. |
| §77 | Testability seams | None of the 8 exist. |
| §78 | Combinatorial reduction | No stated strategy. |
| §80 | Mutation testing / deliberate-break drill | Never run. |

### Thin coverage (present but weak)

| Plan § | Subject | State |
|---|---|---|
| §2 / §3 | Tenant + event isolation | 12 files / 71 cases, of which 16 are source-string; 0 at API or RLS layer. |
| §8 | Autosave partial-update | 3 files, 8 cases. The AI Briefing Strategy regression (note B) has **no** dedicated test. |
| §33 | Destructive operations | Delete routes exist; no test asserts DB end state after a delete. |
| §51 | Migration / drift | 3 files, 12 cases. No test asserts the `0076` gap is legitimate. |
| §53 | Security / abuse | 2 files, 19 cases. No IDOR, XSS, CSRF, SSRF, or formula-injection case. |
| §55 | Performance | 8 files under `load-tests/`, no budgets defined, not in `npm run test`. |

---

## 6. Topology questions the plan required answering from code

### §51 — Is Prisma in the stack? **No.**

- No `schema.prisma` anywhere in either repo.
- `@prisma/client` is not in `dependencies` or `devDependencies` of either repo.
- `WEB/prisma-query-logger.js` exists but is **dead and broken**: nothing imports it
  (only `types/prisma-query-logger.d.ts` declares the module), and its body is not valid
  JavaScript — it calls `prisma.('query', …)` at lines 11, 15 and 19, missing the `$on`
  method name entirely. It would throw at parse time if it were ever loaded.
- `docs/SYSTEM_ARCHITECTURE.json:115` already states: *"No Prisma. Contract is
  types/database.ts + supabase/migrations/*.sql."*

The drift axis is therefore **migrations → `types/database.ts` → web consumers → mobile
consumers**, exactly as plan §51 anticipated. The Prisma parity line in §51 and the
Prisma steps in the loop controller are dead weight and should be struck.

*Recommendation (out of scope to act on here):* delete `prisma-query-logger.js` and its
`.d.ts`. Flagged, not done — Prompt 1 changes no code.

### §44 — Single cron tick or multiple workers? **Single cron tick, one step per tick.**

`vercel.json` declares exactly one cron:

```json
{ "crons": [ { "path": "/api/internal/workflow-tick", "schedule": "* * * * *" } ] }
```

`app/api/internal/workflow-tick/route.ts` claims **at most one** queued step per
invocation. `lib/workflows/runner/claim-next-step.ts` documents why: PostgREST cannot
express `FOR UPDATE SKIP LOCKED`, so the claim is a two-step
select-then-compare-and-set guarded by `.eq("status", "queued")`.

**One important nuance for Prompt 9.** The endpoint accepts `GET` from Vercel Cron *and*
`POST` from an in-process kick fired by `emitLeadCaptured`. Two invocations can therefore
overlap in real operation. The plan's "two workers claim same job" case is consequently
**reachable** — not via a worker pool, but via cron/kick overlap — and the compare-and-set
is the only thing preventing a double claim. That specific race is worth a real test.

What is **not** reachable, and should not be simulated: a worker pool, job leases, lease
expiry, and dedicated dead-letter machinery. None exists. Assert the single-tick
guarantees instead:

- at most one step claimed per tick
- a lost CAS race yields `null` and retries next tick, without side effects
- `attempt_count` / `attempt_id` accounting is correct across retries
- there is **no** lease-expiry reset for a step stuck in `running` — this is a genuine
  gap to record, not a state to test

### §33 — Which entities actually ship soft delete, hard delete, and archive?

17 `DELETE` route handlers exist. Semantics by entity:

| Entity | Hard delete | Soft delete | Archive | Evidence |
|---|:---:|:---:|:---:|---|
| `leads` | ✓ | — | — | `lib/server/exhibitorLeadDelete.ts:63,131` — `.delete()` |
| `campaigns` | ✓ | — | — | `app/api/campaigns/[campaignId]/route.ts:250–284`, cascades to children |
| `events` | ✓ | — | — | `app/api/v1/events/[eventId]/route.ts:51` |
| `users` (company team) | ✓ | — | — | deletes `event_users`, `invite_codes`, then `users` |
| `documents` | ✓ | — | column only | `is_archived` exists (`0021_documents_hub.sql:14`) but the DELETE route hard-deletes |
| `signals` | ✓ | — | — | `app/api/signals/[signalId]/route.ts` |
| `email_templates` | ✓ | — | — | `app/api/exhibitor/email-templates/[templateId]/route.ts` |
| `licenses` | ✓ | — | — | `app/api/admin/licenses/[licenseId]/route.ts` |
| `workflows` | ✓ | — | — | `app/api/exhibitor/workflows/[workflowId]/route.ts` |
| `workflow_templates` | — | — | ✓ | `0081_workflow_templates_archive.sql` — `archived_at` |
| `lead_voice_notes` | — | ✓ | — | `0072_lead_voice_notes.sql:24` — `deleted_at` + trigger |

**Conclusion for Prompt 4 item 8:** build destructive-operation tests for **hard delete
only**, on the nine entities above, plus soft delete on `lead_voice_notes` and archive on
`workflow_templates`. Do **not** build a soft-delete matrix for leads, campaigns or
events — they do not ship it. `documents.is_archived` is a column with no reachable
archive operation; record that as a finding rather than testing it.

### §75 — Bypass flags: three named in the plan do not exist

| Flag | In code | Has a production-rejection assertion |
|---|:---:|:---:|
| `E2E_AUTH_BYPASS_ENABLED` | ✓ | ✗ (2 policy tests, source-string) |
| `APPLE_REVIEW_LOGIN_ENABLED` | ✓ | ✗ |
| `DEMO_SEED_ALLOWED_COMPANY_IDS` | ✓ | ✗ |
| `ALLOW_LEAD_INSIGHTS_PLAYGROUND` | ✓ | ✗ |
| `ALLOW_DEMO_LEAD_INTELLIGENCE_SEED` | **absent** | n/a |
| `ALLOW_DEV_LEAD_BRIEFING_SEED` | **absent** | n/a |
| `ALLOW_PROD_WORKFLOW_SEED` | **absent** | n/a |

Plus five `*_DEBUG` flags the plan does not name: `ADMIN_ROUTE_DEBUG`,
`APOLLO_ENRICHMENT_DEBUG`, `LOADTEST_DEBUG`, `WORKFLOW_DEBUG`, `WORKFLOW_EMIT_DEBUG`.
**Nine live bypass-shaped flags, zero production rejection assertions.** Prompt 13's
list must be rebuilt from the code, not copied from the plan.

### §72 — Mobile local schema

`MOBILE/lib/local-db/schema.ts` sets `SCHEMA_VERSION = 5`. `initLocalDb.ts:74–101` reads
`PRAGMA user_version` and runs one conditional migration to v5, then bumps. There is a
path for v4 → v5 and a path for a fresh install; **there is no distinct migration path
from v1, v2 or v3**. Whether those versions were ever shipped is a question Prompt 6 must
answer before writing the "upgrade from each supported prior version" tests — the plan
assumes more history than the code contains.

---

## 7. `MOBILE` has uncommitted work — flagged, not touched

`MOBILE` `main` is dirty with 7 files, none of them mine:

```
 M app/oauth/callback.tsx
 M lib/integrations/integrationApi.test.ts
 M lib/integrations/integrationApi.ts
 M tests/oauth/callback.test.tsx
?? docs/PLATFORM_CORE_INTEGRATION_AUDIT.md
?? lib/integrations/oauthCallbackCompletion.ts
?? lib/integrations/oauthCallbackCompletion.test.ts
```

This is in-flight mobile OAuth callback work. Nothing in this prompt modified it, and the
mobile suite was run read-only. **Prompts 6, 7 and 10 touch mobile and must not start
until this is committed or stashed by its author** — otherwise the loop controller's
"unrelated dirty work could be overwritten" hard stop applies. Raising it now so it can
be resolved before Prompt 6.

Also noted: the brief records mobile `main` at `7ad37f1`; it is actually at `2ba858c`,
three commits ahead. The brief's `9f3a347` store-binary reference should be re-verified
before Prompt 12 freezes a contract against it.

---

## 8. Redundant and obsolete tests

| Item | Recommendation |
|---|---|
| `e2e/example.spec.ts` (2 cases) | Playwright scaffold. Delete. |
| `prisma-query-logger.js` + `types/prisma-query-logger.d.ts` | Dead, syntactically invalid. Delete. |
| 46 files at 100% source-string | Replace, don't repair. Prompts 4, 5, 8, 9. |
| 14 `tests/journeys/*.e2e.test.ts` | Rename or wire to a real DB. Misleading as-is. |
| `tests/auth-load.spec.ts` | `.spec.ts` in `tests/`, picked up by the node lane, not Playwright. Naming collision — rename. |
| Root-level result dumps (`build-results.txt`, `load-results.txt`, `journey-test-results.txt`, `typecheck-results.txt`, `workflow-test-results.txt`, `full-validation-results.txt`, `server.log`) | Committed build output. Should be gitignored. |

---

## 9. Revised effort estimate

Original sequencing assumed a thin baseline. It is not thin — it is thick and partly
hollow, which changes the shape of the work: **less writing from scratch, more replacing
green tests with real ones.** Replacement is slower than addition because each one needs
the invariant re-derived from product code first.

| Prompt | Original expectation | Revised | Why |
|---|---|---|---|
| 2 — runner | Moderate | **Larger** | Must aggregate 4 frameworks, and retro-tag 435 files. The area registry is the easy half. |
| 3 — seams | Moderate | **As expected** | 8 seams, all greenfield, no existing pattern to fight. |
| 4 — auth/isolation | Large | **Largest in the project** | Needs a real test database *and* an RLS harness that authenticates per role — neither exists. Also replaces 12 failing + ~30 source-string isolation cases. |
| 5 — lead domain | Large | **Larger** | Import area is 70 source-string cases; autosave has 8 cases total and no Briefing Strategy regression. |
| 6 — mobile | Large | **Blocked** | Dirty tree (§7); §72 prior-version question unresolved. |
| 7 — conversation | Large | **As expected** | Mobile side is genuinely well covered (17 audio files, 50 clean cases). Web pipeline is the gap. |
| 8 — intelligence | Moderate | **Larger** | 88 source-string cases in this area, the highest of any. Blocked on the Prompt 3 provenance seam. |
| 9 — workflows | Large | **Smaller** | 373 cases, only 27 source-string — the healthiest large area. Topology now known, so §44 shrinks to single-tick guarantees. |
| 10 — provider | Large | **As expected** | Tiering is new; existing 87 cases are a reasonable Tier 1 seed. |
| 11 — AI | Moderate | **As expected** | Greenfield. Model pinning is a one-liner; the eval harness is the cost. |
| 12 — API/migration | Large | **Larger** | 41 of 79 api-contract cases are source-string. Route inventory must be built from scratch. |
| 13 — security | Moderate | **Larger** | Flag list must be rebuilt from code (9 flags, not the plan's 7). Security area has 19 cases today. |
| 14 — perf/governance | Very large | **Very large** | Unchanged. Depends on almost everything above. |

Two sequencing recommendations:

1. **Prompt 4 needs a test database before it can start.** Everything it must prove —
   RLS, cross-tenant denial, service-role scope re-application — is unprovable without
   one. Prompt 2's environment safety guard is the prerequisite, not a nice-to-have.
2. **Prompt 6 is blocked on a human**, not on engineering (§7).

---

## 10. Exit criteria

| Requirement | Status |
|---|---|
| Every existing test file inventoried and classified | ✓ 435 files, per-case |
| `docs/testing/COVERAGE_MATRIX.md` produced | ✓ |
| `docs/testing/BASELINE_AUDIT.md` produced | ✓ |
| §44 topology answered from code | ✓ single cron tick; cron/kick overlap reachable |
| §33 delete/archive paths answered from code | ✓ 9 hard, 1 soft, 1 archive |
| §51 Prisma answered from code | ✓ not in the stack |
| Product code changed | none |
| Test code changed | none |
