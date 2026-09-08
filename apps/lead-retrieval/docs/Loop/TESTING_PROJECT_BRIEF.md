# SignalThread LR — Automated Testing Build: Project Brief

> **v3.2 production-testing scope (2026-08-12).** The main 14-prompt program now tests **production-safe product behavior against the deployed production application by default**. Raw Postgres/RLS enforcement drills, destructive direct-database tenant isolation, migration apply/rollback/schema-repair tests, deliberate-break predicate-removal drills, heavy disposable tenant factories, and load/stress abuse are **not part of this program** and will be handled separately. A missing dedicated test Supabase project is therefore **not a blocker** to continuing Prompts 4–14.

> Companion documents: `LR_TEST_PLAN_V3.md` (the plan — what and why) and `TESTING_PROMPTS.md` (the implementation sequence). Read this brief first, then the loop controller, then the plan, then the prompts.
>
> Status date 2026-08-10. Repository state at last audit: web `main` at `9424f11`, mobile `main` at `7ad37f1`.

---

## 1. What this project is

We are building an automated test system for SignalThread Lead Retrieval so that any change to either repository can be validated by one command before it ships.

We are **not** building features. We are **not** refactoring. With one narrowly-scoped exception (Prompt 3), we are not changing product code at all.

The finished system must do three things:

1. run every test with one command and report `147/150 passed`
2. run a single area in isolation when we only touched that area
3. emit machine-readable results that keep a coverage matrix current

---

## 2. The system under test

Two repositories, one Supabase Postgres database, one shared lead record.

| Alias | Path | Owns |
|---|---|---|
| `WEB` | `/Users/ali/Documents/lead retrieval app` | Next.js 16.1 App Router on Vercel (`lr.signalthread.ai`). Canonical cloud schema, authorization, provider credentials, OAuth, all durable business logic, APIs consumed by both surfaces. |
| `MOBILE` | `/Users/ali/Documents/lead-intel-scan` | Expo SDK 54 / React Native 0.81. User-facing name **Lead Retrieval**. Device UX, SQLite cache (schema v5), outbox, retry, offline reconciliation. |

Product flow: capture (QR badge, business card OCR, manual, paste) → conversation recording and additive voice notes → transcription and synthesis → evidence, themes, objections, briefings → action (one-to-one Gmail, Calendar meetings, private follow-up reminders, campaigns, workflows, CRM).

### Facts an agent will get wrong if not told

- **Offline capture is implemented**, not planned. SQLite + outbox + reconciliation ship today.
- **Audio is not local-only.** Durable chunked upload, transcription, and synthesis exist. Older repo docs say otherwise and are stale.
- **`company_text`** is the canonical lead company field, not `company`.
- **Google is the only live Email & Calendar provider.** Contracts are provider-neutral by design; Microsoft/Outlook is **not implemented**. Do not write tests for it.
- **Google connections are user-owned**, encrypted server-side. Mobile never stores provider tokens or calls Google directly.
- **Mobile OAuth browser launch carries no cookie and no bearer.** It is authenticated by a signed, expiring, single-use ticket bound to user/company/provider.
- **Store binaries are built from `9f3a347`**, while mobile `main` is `7ad37f1`. What is shipped and what is on `main` are different things.
- **Migration `0076` does not exist.** This gap is intentional. Do not "repair" it.
- **The database is Supabase/Postgres with SQL migrations** (`WEB/supabase/migrations/0001`–`0096`) plus generated `WEB/types/database.ts`. **There is no Prisma.** The generic loop controller mentions Prisma; ignore those lines.

---

## 3. Schema mode

```txt
Schema mode: LOCKED
```

This project adds tests. It does not change the database.

**[v3.2] LOCKED is now the correct mode and is not negotiable during the run.** Migration apply/rollback/repair testing was removed from this program, so no prompt has a legitimate reason to touch schema. If a test appears to need a schema change, that is a **defect finding or a scope error** — record it per §6 and continue. Never migrate to make a test pass.

The single exception is **Prompt 3 (testability seams)**, which runs as:

```txt
Schema mode: ADDITIVE_ALLOWED
```

and even there, changes are limited to what §77 of the plan names, must be additive and nullable, and must be reported by migration filename in the prompt summary. Any migration outside Prompt 3 is a hard stop.

---

## 4. Allowed scope

- new and modified test files in both repositories
- test fixtures, factories, seed helpers scoped to test tenants
- the test runner, tagging, and reporting infrastructure
- CI configuration for running the suite
- the coverage matrix document
- **Prompt 3 only:** the production-code seams enumerated in plan §77

### Both repositories are in scope

This project covers `WEB` and `MOBILE` together, not the admin backend alone. See the repository scope table at the top of `TESTING_PROMPTS.md` for which repo each prompt touches. Prompts 6 and 7 are mobile-primary; the rest are web-led with a mobile leg only where the contract is genuinely shared.

Do not edit `MOBILE` during a WEB-only prompt, or vice versa. If a prompt appears to need the other repo, that is a finding to report, not a scope expansion to take.

## 5. Out of scope

- product features, UI redesign, copy changes
- refactors of application code
- authorization/RLS/business-rule changes made merely to make tests pass
- migrations outside Prompt 3
- Microsoft/Outlook anything
- claiming iOS/Android execution when no device/simulator was actually used
- **raw Postgres/RLS enforcement testing**
- **direct destructive cross-tenant/cross-event database mutation drills**
- **migration apply/rollback/schema-repair testing**
- **deliberate-break drills that remove or weaken tenant/security predicates**
- **heavy disposable fixture factories that create large temporary tenant trees**
- **load/stress/concurrency-abuse testing against production**
- arbitrary writes to real customer records

The excluded database/security/migration/stress work belongs to a separate engineering/security program and must not block this 14-prompt production product-testing program.

## 6. The one rule that matters most

> **Tests report bugs. Tests do not fix bugs.**

When a new test fails because it found a genuine product defect, the agent must:

1. confirm the test itself is correct
2. record the defect in the prompt's findings report with file, layer, severity, and reproduction
3. mark the test `.skip` with a `KNOWN-DEFECT:` comment linking the finding
4. **continue to the next item**

The agent must **not** modify product code to make the test pass. A loop that "fixes until green" inside authorization, RLS, provider, or migration code is how an unreviewed security change ships. Every defect found becomes a separate reviewed piece of work.

This rule overrides the loop controller's "fix genuine product defects" instinct and its "tests fail → hard stop" rule. A failing test that documents a real defect is a **successful outcome**, not a stop condition.

---

## 7. Canonical services and paths

Tests assert against these. Do not create parallel implementations of anything below.

| Concern | Canonical path |
|---|---|
| Session, normalized roles | `WEB/lib/auth/session.ts` |
| Company/event access | `WEB/lib/server/company-event-access.ts` |
| Exhibitor permissions | `WEB/lib/server/exhibitor-permission-aggregates.ts` |
| Mobile OAuth bridge | `WEB/lib/integrations/mobile-oauth/` |
| Google tokens | `WEB/lib/integrations/google/token-manager.ts` |
| Gmail / MIME | `WEB/lib/integrations/google/gmail-client.ts` |
| Calendar | `WEB/lib/integrations/google/calendar-client.ts` |
| Follow-up | `WEB/lib/follow-ups/lead-follow-up-service.ts` |
| Dashboard event calendar | `WEB/lib/events/event-calendar.ts` + persisted `events.timezone` |
| Dashboard lead aggregates | `WEB/lib/server/dashboard-event-lead-metrics.ts` + `dashboard_event_lead_metrics` RPC |
| Dashboard hot/follow-up predicates | `WEB/lib/leads/lead-business-rules.ts` |
| Event display location | `WEB/lib/events/event-location.ts` (`resolveEventLocation`) |
| Conversation read model | `WEB/lib/conversations/conversation-intelligence-read-model.ts` |
| Workflows | `WEB/lib/workflows/` |
| Mobile local DB | `MOBILE/lib/local-db/` |
| Mobile sync/outbox | `MOBILE/lib/sync/` |
| Mobile session | `MOBILE/lib/auth/mobileSessionCoordinator.ts` |

Normalized roles: `platform_admin`, `organizer_admin`, `exhibitor_admin`, `exhibitor_viewer`, `viewer`. Historical aliases (`organizer`, `event_organizer`, `exhibitor`) normalize at explicit boundaries only. Never write an authorization assertion against a historical literal.

Dashboard truth is also a cross-surface contract: event timezone, event-local lifecycle/today windows, explicit-location-first display, `temperature = hot`, canonical follow-up states, authoritative DB-side counts, truthful failure states, and bounded-intelligence coverage must reconcile across event dashboard, account cards, Leads destinations, organizer/campaign consumers, and mobile. Browser timezone and provider row limits are never business authorities.

---

## 8. Severity classification

Every test is tagged with exactly one.

- **P0 — catastrophic.** Cross-tenant leak, cross-event mutation, unauthorized send, destructive data loss, secret/token leakage, corrupt migration.
- **P1 — critical workflow.** Cannot capture a lead, cannot load an event, cannot import, wrong recipient, duplicate email/meeting, wrong user identity.
- **P2 — major.** Filter lies, stale counts, degraded provider behavior, broken recovery.
- **P3 — minor.** Isolated visual or copy defect with no workflow or truth impact.

No P0 or P1 test may be skipped, quarantined, retried until green, or converted to an expected failure — except under the KNOWN-DEFECT rule in §6, which requires a recorded finding.

---

## 9. The runner contract

Built in Prompt 2. Every subsequent prompt registers its tests with it.

```bash
npm run test                          # everything, summary output
npm run test -- --area mobile-capture # one area
npm run test -- --p0                  # severity filter
npm run test -- --layer unit,api      # layer filter
npm run test -- --detailed            # full per-test output
npm run test -- --json                # machine-readable, feeds coverage matrix
```

Default summary output:

```txt
LR Test Suite — 2026-08-10T14:22:11Z
  auth-tenant-isolation      42/42   ✓
  lead-domain                31/33   ✗ 2 failed
  mobile-capture             28/28   ✓
  conversation-pipeline      19/19   ✓
  provider-google            27/28   ✗ 1 known-defect (skipped)
  ─────────────────────────────────────
  147/150 passed · 2 failed · 1 skipped · 4m12s
```

### Test tag dimensions **[v3.2]**

Every test carries **three** tags. Prompt 2 builds the environment guard on `category`, so it must exist before any other prompt writes a test.

| Tag | Values | Purpose |
|---|---|---|
| `area` | declared in the area registry (`auth-session`, `lead-domain`, `mobile-capture`, …) | `--area` filtering |
| `severity` | `P0` `P1` `P2` `P3` | `--p0` filtering, release gating |
| `category` | see below | environment routing — decides what may target production |

`category` values:

- **`prod-safe`** — may run against the deployed production app using the designated production test tenant, events, users, and owned provider accounts. This is the default for this program.
- **`local-only`** — runs against local/replay/seam harnesses. Never targets production.
- **`requires-device`** — needs a real iOS/Android device or simulator. Written, committed, reported as **not-run**, never counted as a pass.
- **`separate-security-db`** — raw Postgres/RLS enforcement and destructive direct-database isolation. **Out of this program.** Tagged so it is visible, hard-blocked from production, and excluded from the pass count.
- **`migration`** — migration apply/rollback/repair. **Out of this program.** Same treatment.
- **`deliberate-break`** — predicate-removal and invariant-destruction drills. **Out of this program.** Same treatment.
- **`load-stress`** — load, soak, concurrency abuse. **Out of this program.** Same treatment.

The last four categories exist so excluded work is *routed and visible* rather than silently missing. The runner must hard-block all four from ever targeting a production target, and must list them separately from passes, failures, and skips.

Requirements:

- every test carries `area`, `severity`, and `category` tags
- areas are declared in one registry file so `--area` can be validated
- the runner shells into both repos and aggregates into one count
- exit code is non-zero if any test fails
- retries are **reported, never hidden** — a test that passes only on retry is reported as a flake, and a suite that passes only after reruns is a failing suite
- known-defect skips are counted and listed separately from passes

Frameworks in play: `WEB` uses `node:test` plus Playwright; `MOBILE` uses Vitest plus Maestro. The runner is a thin orchestrator over all four, not a replacement for any of them.

---

## 10. Loop controller overrides

The generic loop controller applies, with these project-specific changes.

| Controller default | Override for this project |
|---|---|
| Max 14 files per prompt | **Max 40.** Test work is file-dense by nature. |
| "Tests fail → hard stop" | **Does not apply** to new tests failing on genuine product defects. Apply §6 instead. Still a hard stop if the *runner itself* or a *pre-existing* test breaks. |
| "Fix genuine product defects" (loop step 6) | **Removed.** Record and continue. See §6. |
| Prisma schema/client steps | **Ignore.** Supabase SQL migrations only. |
| Schema mode from human | **LOCKED**, except Prompt 3 which is ADDITIVE_ALLOWED. |

### Hard stops for this project

Stop and ask for review only if:

- the runner or an existing passing test breaks and the cause is not obvious
- a prompt would require a migration outside Prompt 3
- a production-safe journey needs credentials that genuinely are not available
- a requested mutation could touch arbitrary customer data rather than the designated production test tenant/account
- a test would send email or create calendar events to non-test recipients/accounts
- authorization or tenancy semantics are genuinely ambiguous in both the plan and the code
- a P0 defect is discovered that appears to be actively exploitable in production
- the work would exceed 40 files or expand outside the allowed scope

**Do not stop because a dedicated non-production Supabase project does not exist.** Raw RLS/database/migration/destructive testing is outside this program.

Everything else: record it, continue, report at the end. Bulldoze.

---

## 11. Test data safety

Production-safe tests are allowed and expected.

- use a dedicated production test company/event/user set for controlled writes
- every created record carries a unique run ID / unmistakable test namespace
- mutate only records owned by the designated test tenant/account
- child rows delete before parents when cleanup is appropriate
- never delete shared demo, seed, or customer records
- never use broad cleanup predicates
- controlled email/calendar canaries go only to owned test accounts
- failed cleanup is a test failure/incident
- no production customer data may be copied into fixtures, artifacts, screenshots, or logs
- raw RLS, destructive database-isolation, migration/rollback, deliberate-break, and stress tests are excluded from this program and handled separately

The safety rule is **scope the production test**, not **avoid production entirely**.

## 12. Reporting

Use the loop controller's stop format after every prompt, extended with:

```txt
Tests added (count, by area and severity):
Tests skipped as KNOWN-DEFECT:
Product defects found (file, layer, severity, repro):
Coverage matrix rows updated:
Runner areas registered:
First-attempt failures / flakes observed:
Cases explicitly excluded and why:
```

The defect list is the most valuable output of this project. A prompt that finds twelve real bugs and fixes none of them has done its job perfectly.

---

## 13. Starting message

```txt
Read the loop controller first, then the brief, plan, and prompt docs below.
All paths are relative to the WEB repo root.

Loop controller:  docs/Loop/GENERIC_PROMPT_LOOP_CONTROLLER.md
Brief:            docs/Loop/TESTING_PROJECT_BRIEF.md
Plan document:    docs/Loop/LR_TEST_PLAN_V3.md
Prompt document:  docs/Loop/TESTING_PROMPTS.md

Repos:
  WEB    = this repo (/Users/ali/Documents/lead retrieval app)
  MOBILE = /Users/ali/Documents/lead-intel-scan

Current branch:   test/01-baseline-audit
Schema mode:      LOCKED (Prompt 3 only: ADDITIVE_ALLOWED)
Allowed scope:    Brief §4
Out of scope:     Brief §5
Max files:        40 per prompt

Execute prompts 1 through 14 in order, in one continuous run.

Overrides to the loop controller, per Brief §10:
- Do NOT fix product defects. When a test fails on a genuine bug: confirm the
  test is correct, record the defect in the findings report, mark the test
  .skip with a KNOWN-DEFECT: comment, and continue. Recording defects is the
  goal, not a failure.
- "Tests fail -> hard stop" does not apply to new tests. It still applies if
  the runner or a pre-existing passing test breaks.
- Ignore all Prisma references in the loop controller. This stack is Supabase
  SQL migrations plus generated types/database.ts.
- Max files is 40, not 14.
- Schema is LOCKED. A test that appears to need a schema change is a defect
  finding or a scope error, not a migration task. Prompt 3 is the only
  exception and is additive-nullable only.

Production rule: prod-safe tests run against the deployed production app using
the designated test tenant/accounts. Categories separate-security-db,
migration, deliberate-break, and load-stress are OUT of this program - tag
them, never run them against production, and do not treat their absence as a
blocker.

Create a new branch per prompt: test/<NN>-<area>, cut from main. Commit at the
end of each prompt. Do not push, merge, or deploy.

Stop only on the hard stops in Brief §10. Everything else: record it, continue,
report at the end.

Start with Prompt 1.
```
