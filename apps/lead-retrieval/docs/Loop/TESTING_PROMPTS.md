# SignalThread LR — Automated Testing Build: Prompt Sequence

> Read `TESTING_PROJECT_BRIEF.md` and `LR_TEST_PLAN_V3.md` before starting. Execute prompts 1 → 14 in order. Do not combine, skip, reorder, or invent prompts.
>
> **Standing rule for every prompt:** tests report defects, they do not fix them. See Brief §6. A failing test that documents a real product bug is a success. Record it, `.skip` it with `KNOWN-DEFECT:`, continue.
>
> **Standing rule for every prompt:** schema mode is LOCKED except Prompt 3, and that is not negotiable — a test that appears to need a schema change is a defect finding or a scope error, never a migration task. Max 40 files. Every test carries `area`, `severity`, and `category` (Brief §9). Register every new area with the runner. Update the coverage matrix before reporting.
>
> **Standing production rule:** production-safe product journeys run against the deployed production application using designated test accounts/data. Raw RLS/database isolation, migration/rollback, deliberate-break, heavy fixture-factory, and load/stress-abuse tests are outside this 14-prompt program and must not block progress.

---

## Repository scope at a glance

Read this before starting any prompt. Every prompt states which repository it touches. Do not edit `MOBILE` during a WEB-only prompt, or vice versa.

| # | Prompt | WEB | MOBILE | Requires device |
|---|---|:---:|:---:|:---:|
| 1 | Baseline audit | ✓ | ✓ | — |
| 2 | Runner and tagging | ✓ | ✓ | — |
| 3 | Testability seams | ✓ | ✓ | — |
| 4 | Auth, tenancy, event isolation | ✓ | partial — mobile bearer and session lifecycle only | — |
| 5 | Lead domain, imports, autosave, navigation | ✓ | — | — |
| 6 | Mobile capture, offline, local DB, handover | contract artifact only | ✓ **primary** | ✓ Maestro |
| 7 | Conversation and voice pipeline | ✓ server pipeline | ✓ device recording | ✓ Maestro |
| 8 | Intelligence read model, dashboards | ✓ | — | — |
| 9 | Workflows, campaigns, signals | ✓ | — | — |
| 10 | Google provider contract | ✓ | partial — OAuth return and client DTOs | ✓ OAuth return |
| 11 | AI output and drift | ✓ | — | — |
| 12 | API, async, client compatibility | ✓ | consumes contract artifact | — |
| 13 | Security, bypass paths, config | ✓ | partial — Apple review gate | — |
| 14 | Perf, resilience, observability, governance | ✓ | partial — perf and visual | ✓ device perf |

**Mobile-primary prompts: 6 and 7.** Everything else is web-led with a mobile leg where the contract is genuinely shared.

### The `requires-device` rule

The build environment has no iOS or Android simulator and no Xcode. Any test needing a real device or simulator must be:

- written and committed
- tagged `requires-device`
- reported by the runner as **not-run**, never counted as a pass
- listed in the completion report so a human can execute them

Never claim a device result that was not observed.

---

## Prompt 1 — Baseline audit and coverage matrix

**Branch:** `test/01-baseline-audit`
**Plan sections:** §79, §28
**Changes product code:** no
**Changes test code:** no — this prompt writes documents only

### Do

1. Inventory every existing test file in both repositories: path, framework, what it asserts, which plan section it relates to.
2. Classify each as one of:
   - **covers the invariant** — exercises real behavior against a real database or real code path
   - **covers a weaker claim** — asserts source strings, uses a fake database, or stubs the thing under test
   - **does not cover it**
3. Produce `docs/testing/COVERAGE_MATRIX.md` using the plan's Coverage Matrix Template. One row per feature/action. Fill every cell or mark it "not applicable — reason".
4. Produce `docs/testing/BASELINE_AUDIT.md` listing:
   - total test count by repo, framework, and plan section
   - the "weaker claim" list, which is the most important output — these read as green while proving little
   - plan sections with zero existing coverage
   - existing tests that are redundant or obsolete
   - a revised effort estimate per remaining prompt based on what was found
5. Confirm the deployed topology questions the plan flags: does workflow execution use a single cron tick or multiple workers (§44), and which entities actually ship soft delete, hard delete, and archive (§33). Record the answers in the audit.
6. Confirm whether Prisma exists anywhere in either repo (§51). Record yes/no.

### Exit criteria

Both documents exist, every existing test file is classified, and the §44/§33/§51 questions are answered from code.

---

## Prompt 2 — Test runner, tagging, and reporting

**Branch:** `test/02-runner`
**Plan sections:** Brief §9, plan §65
**Changes product code:** no

### Do

1. Build the runner described in Brief §9. It orchestrates `node:test`, Playwright, Vitest, and Maestro across both repos and aggregates one result.
2. Areas live in one registry file so `--area` values can be validated and typos fail loudly.
3. Implement all flags: `--area`, `--p0`, `--layer`, `--detailed`, `--json`.
4. Summary output format is fixed in Brief §9. Match it exactly.
5. Flake handling: retries are counted and reported, never used to convert a failure into a pass. A suite that only passes on rerun exits non-zero.
6. Known-defect skips are counted and listed separately from passes and from ordinary skips.
7. Implement the **three-dimension tagging scheme defined in Brief §9**: `area`, `severity`, and `category`. `category` must exist before any later prompt writes a test, because the environment guard routes on it.
8. Implement the **environment safety guard** on `category`:
   - allow `prod-safe` to target production and the designated production test tenant/accounts
   - allow `local-only` against local/replay/seam harnesses, never production
   - report `requires-device` as **not-run**, never as a pass
   - hard-block `separate-security-db`, `migration`, `deliberate-break`, and `load-stress` from ever resolving to a production target, and list them separately from passes, failures, and skips
   - validate controlled provider canaries use owned test recipients/accounts only
   - a test with a missing or unknown `category` fails loudly rather than defaulting.
9. Retro-tag the existing test suite with area, severity, and category based on Prompt 1's classification, so the baseline number is real from day one.
10. Wire CI: P0/P1 on every PR, full suite nightly, full suite plus visual before production promotion.

### Exit criteria

`npm run test` runs the existing suite end to end and prints a real pass count. Every flag works. The environment guard allows `prod-safe` production runs and aborts excluded destructive/security-db/migration/stress categories against production.

---

## Prompt 3 — Testability seams

**Branch:** `test/03-seams`
**Plan sections:** §77, §71
**Changes product code:** YES — this is the only prompt that does
**Schema mode:** `ADDITIVE_ALLOWED`

### Do

Add only the seams listed in plan §77. Each must be additive, off by default in production, and invisible to normal runtime behavior.

1. **Injectable clock** — a single time source that application code reads, overridable in test.
2. **Deterministic ID and idempotency-key generation** under test.
3. **Source provenance on canonical read payloads** (§71) — responses indicate whether they were served by the canonical read model or a legacy/compatibility fallback. Additive field or test-only header.
4. **Fault-injection seams** at each dependency boundary: database, object storage, provider HTTP, job queue.
5. **A forced "unknown provider outcome"** path, since this state cannot be produced reliably against a real provider.
6. **Request correlation ID** threaded UI → API → DB → provider → job, if not already present.
7. **A test-only hook to drain the mobile outbox and the job queue** deterministically rather than by sleeping.
8. **A controllable AI response layer** so prompt assembly can be asserted and refusals simulated.

Each seam gets a test proving it is inert when the test flag is absent.

### Constraints

- no behavior change when seams are not activated
- no new authentication or authorization surface
- any new flag is narrowly gated and added to the Prompt 13 bypass-assertion list
- if a seam requires a migration, it must be additive and nullable

### Exit criteria

All eight seams exist, each has an inertness test, and the full existing suite still passes.

---

## Prompt 4 — Identity, roles, tenancy, event isolation

**Branch:** `test/04-auth-isolation`
**Plan sections:** §§1–4, 22, 31–33
**Severity:** predominantly P0
**Areas:** `auth-session`, `auth-rbac`, `tenant-isolation`, `event-isolation`

### Production execution rule

Run applicable product-level auth/tenancy/isolation journeys against production using the designated test company/events/users. Do **not** run raw Postgres/RLS enforcement, destructive direct-database isolation, migration/schema mutation, or deliberate-break drills in this prompt.

### Do

1. Session lifecycle state machine on web and mobile (§31), including invite states, expiry, revocation, multi-device, and the "no protected content flashes before redirect" assertion.
2. Every meaningful action tested across normalized roles plus unauthenticated, unauthorized, invited-not-activated, and platform-admin-in-switched-context (§1).
3. Tenant isolation for account-owned entities (§2) through real UI/routes/APIs, including direct URL and authenticated direct API bypass attempts.
4. Event isolation for event-owned entities (§3). Pinned regression: import/create in Event A leaves Event B unchanged. Test company-level data such as AI Briefing Strategy separately.
5. Direct application-API security tests (§22): cross-company IDs, cross-event IDs, forged/stale account context, malformed IDs, illegal field updates, and mass-assignment attempts.
6. User/invite/membership/role/license/seat lifecycles (§32) through shipped product operations, including seat reconciliation and role-vocabulary normalization.
7. Shipped entity delete/archive operations (§33) only inside the designated test tenant/account.
8. Platform-admin company context: enter company → navigate dashboard/events/leads → hard refresh → verify scoped APIs/server rendering → exit → verify platform scope and platform-admin identity restored.

### Explicitly excluded

- raw Postgres/Supabase RLS policy enforcement
- raw cross-tenant DB read/write/delete attempts
- service-role bypass drills against production
- deliberate removal of tenant/event predicates
- migration/schema mutation
- large disposable tenant factories

Track these separately. Their absence does not block Prompt 4.

### Exit criteria

Every P0 **product-level** isolation invariant has a named behavioral test. Cross-tenant and cross-event denial are proven through real routes/APIs, and production-safe journeys have actually run against production where credentials exist.

## Prompt 5 — Lead domain, imports, autosave, navigation

**Branch:** `test/05-lead-domain`
**Plan sections:** §§5, 8–14, 19–21, 39, 40, 52
**Areas:** `lead-domain`, `import`, `autosave`, `navigation`, `filters`, `collections`

### Do

1. Data completeness fixtures across every important flow (§5), proving missing optional data degrades capability without killing unrelated workflows.
2. **Autosave and partial-update safety as a generic pattern** (§8) applied to every multi-field form. Include the AI Briefing Strategy regression: editing Product Focus must never wipe Event Goal, Target Audience, or Tone/Voice. Cover out-of-order save responses, server failure mid-save, and "all changes saved" appearing only after confirmed persistence.
3. Import and uploader matrix (§9) across CSV, XLSX, and Google Sheets with one canonical set of expectations. Include the `Sarah Meister` full-name regression.
4. Import readiness validation parity (§10) — the UI readiness count and the final server validation must use the same rules.
5. Navigation and route continuity (§11), including the event-switcher-on-Create-Event regression.
6. Empty and zero states (§12), including the new exhibitor_admin with zero events.
7. Event creation field parity (§13), including Location available at create time.
8. Filter behavior asserting **rendered rows and counts** (§14), not helper state.
9. Persistence and reload (§19), stale-state protection (§20), failure and recovery UX (§21).
10. Lead lifecycle and canonical semantics (§39): identity normalization, empty vs unknown vs cleared, rating bounds, exact rating → priority mapping, deterministic tie-breaking, allowed status transitions, enrichment never overwriting user-authored data, and the duplicate-definition matrix.
11. Collections (§40) at 0/1/100/1k/5k, with 10k as a spot check. **25k and 50k are descoped.**
12. File import, export, and download product-security checks (§52), including CSV formula injection handling and unauthorized export IDs through the app/API.
13. **Cross-surface lead integrity — mandatory P0 regression:** create/import a lead in Event A and verify Leads, lead detail, account dashboard totals, Event A totals, Event B unchanged, another company unchanged, reload persistence, and applicable hot/priority/follow-up state.
14. Repeat for Event B and prove event counts remain independently scoped.
15. Every important mutation in this prompt must be verified downstream, not only at the screen where the write occurred.

### Exit criteria

Every regression named in the plan's carried-forward notes A–J that falls in this scope has a deterministic test. Raw RLS, migration, deliberate-break, and heavy disposable-tenant testing are not required for completion.

---

## Prompt 6 — Mobile capture, offline, local database, device handover

**Branch:** `test/06-mobile-capture`
**Plan sections:** §§34, 35, 37, 38, 72
**Areas:** `mobile-capture`, `mobile-offline`, `mobile-localdb`, `cross-surface`

### Do

1. Install, upgrade, and device lifecycle (§34).
2. Camera, QR, and capture matrix (§35) including permission states, payload variants, and capture behavior. Prove the inserted lead has correct `company_id`, `event_id`, `owner_user_id`, canonical identity fields, and exactly one row under retry.
3. **Badge template learning isolation** (§35, v3 addition): templates are account/event scoped, a template learned in Event A is not applied in Event B, and badge templates never affect card, manual, or paste parsing.
4. Offline and intermittent network (§37). Every action must resolve to one of: blocked before mutation, queued and safely replayed, optimistically applied with reconciliation, or discarded with explicit warning. Undefined behavior is a defect finding.
5. **Local schema migration** (§72): upgrade from each supported prior SQLite version with pending outbox rows present. Queued work must survive.
6. **Outbox correctness** (§72): dependency ordering (lead create drains before its audio upload), drain mutex under rapid foreground/background cycling, stale-running reset, backoff schedule, revoked-access operations failing safely, and post-event-switch operations landing in the originally captured event.
7. **Device handover** (§72) — P0. User A signs out, User B signs in: none of A's local leads, notes, drafts, outbox rows, or cached context are reachable. Pending-work-on-signout behavior is defined and never syncs under B's identity.
8. Cross-surface web ↔ mobile contract (§38) including the schema drift guards: `company_text` vs `company`, `rating` → `priority_score`, `follow_up_date` type and null semantics, and no active dependence on `is_hot`, `quick_tags`, `qr_value`, or `raw_payload`.
9. Publish the **versioned shared contract artifact** from web and consume it in mobile CI (§38, v3 addition), so a breaking backend change fails mobile's build.

### Note on execution

There is no iOS or Android simulator in the build environment. Write the Maestro flows and mark them `requires-device`. The runner must report them as not-run rather than counting them as passes. Do not claim a device result.

### Exit criteria

Local DB migration and device handover have full coverage. The shared contract artifact is published and consumed.

---

## Prompt 7 — Conversation and voice-note pipeline

**Branch:** `test/07-conversation-pipeline`
**Plan sections:** §36 (device mechanics), §69 (pipeline)
**Areas:** `audio-recording`, `conversation-pipeline`

### Do

1. Device recording mechanics (§36): permission states, start/stop/pause, duration boundaries, interruptions, route changes, lock screen, background, unmount, double-stop protection, and the keep-awake invariant released exactly once.
2. **Recording-to-lead binding** (§69) — recording started on Lead A, user navigates to Lead B, audio saves to **Lead A**. This is a prior production defect.
3. Additive semantics (§69): a new voice note never replaces a prior one; creator attribution correct across users; client-local idempotency survives restart mid-upload; cumulative regeneration includes all notes.
4. Upload and storage (§69): chunked resume, abort, out-of-order chunk, missing final part, signed URL expiry mid-upload, cross-company object access denial, orphan objects when the lead insert fails, device temp cleanup.
5. Processing state machine (§69): every legal transition allowed, every illegal one rejected; readiness versioning; worker restart and lease expiry; **failure classification before retry** — a bulk reprocess must be impossible without classification; poison record among valid batch; reconciliation repairing a lost callback.
6. Scale profile (§55, v3 addition): concurrent upload and transcription queue depth for an event's worth of recordings.

### Exit criteria

The full path from device recording to a completed processing record is covered, and no retry path exists that can run without classification.

---

## Prompt 8 — Intelligence read model, dashboards, fallback provenance

**Branch:** `test/08-intelligence-dashboards`
**Plan sections:** §41, §69 (read model), §71
**Areas:** `intelligence-readmodel`, `dashboards`, `fallback-provenance`

### Do

1. **Silent fallback detection (§71)** — the highest-value work in this prompt. Using the provenance seam from Prompt 3, assert for every canonical read path **which source served the response**. A fallback that fires in a fixture containing rich data is a failing test. Apply to the conversation read model, `follow_up_date` compatibility derivation, role alias normalization, and `company`/`company_text`.
2. Intelligence read model (§69): transcript, summary, evidence, themes, needs, objections, competitors, messaging, and briefing asserted as distinct artifacts with distinct scope predicates. Every aggregation preserves event/company/lead ownership. User-authored corrections survive regeneration.
3. Dashboard reconciliation (§41): every displayed number recomputed from authoritative fixtures and compared — never asserted by snapshot text. Cover zero/one/many, cross-event and cross-company, records qualifying for multiple categories, stale cache, concurrent insert/delete, archived inclusion rules, timezone boundaries, and filter-scoped vs global counts.
4. Event and cross-event trend surfaces built from voice synthesis: prove the numbers trace back to real conversation records in the correct scope.
5. Add fallback firing rate as a production metric with an alert threshold (§57 dependency; wire in Prompt 14).
6. **Pinned timezone regression:** event-level "today" metrics use the persisted canonical event timezone, never Vercel/server UTC and never a browser timezone cookie as authority.
7. First request is correct with no bootstrap cookie/refresh.
8. Two viewers in different browser timezones see identical event metrics for the same event.
9. Lead Metadata pinned case: `2026-08-11T15:49:17Z` in `America/New_York` renders as `11:49 AM EDT`.
10. Verify DST boundaries and Event A/Event B count isolation through the same canonical day-window logic.
11. Location producer/consumer contract: `events.location = Toronto`, null `city/state`, renders Toronto on event dashboard, account card, readiness, and other event identity surfaces.
12. Follow-up matrix reconciliation: none, future, due today, overdue, completed, cleared, hot+due, cold+due, and closed-after-scheduling produce identical exact IDs in event/account counts and linked Leads destinations.
13. Hot semantic matrix: `temperature=hot` with low priority and `temperature=cold` with high priority classify identically across event/account dashboards, organizer, campaigns, Leads, detail, and mobile.
14. Account-card truncation guard: >1,000 scoped leads still return exact DB-side aggregates without loading all rows.
15. Required metric query failure renders unavailable/degraded and never an all-clear or reassuring zero.
16. Every bounded intelligence/read-model path either pairs bounded details with an authoritative total or visibly reports analyzed/total sample coverage; exercise >300 conversations and >1,000 relevant records.
17. Cross-surface mutation: create controlled leads in Event A then Event B and reconcile Leads, detail, both event dashboards/cards, company/event isolation, hot/follow-up state, and hard reload.

### Exit criteria

No canonical read path can serve a fallback in a rich-data fixture without a test going red. Every dashboard number and linked destination reconciles against authoritative rows and exact IDs. Production-safe dashboard reconciliation runs against the deployed production app. Raw DB/RLS testing is not required here.

---

## Prompt 9 — Workflows, campaigns, signals

**Branch:** `test/09-workflows-campaigns`
**Plan sections:** §§6, 17, 42, 43, 44
**Areas:** `workflows`, `campaigns`, `signals`

### Do

1. Workflow execution state matrix (§6), including the regression: Conversation Brief Agent selected with no conversation summary → the campaign draft still executes when conversation context is optional.
2. Authenticated-user identity in generated content (§17): drafts sign as the initiating logged-in user, never `Ali`, seed data, the company owner, or an old fixture. Async workflows retain the initiating user. Platform account-context switching does not change identity into the customer.
3. Campaign end-to-end state machine (§42): every state and allowed transition, content correctness (no cross-recipient bleed, no unresolved template variables, manual edits not overwritten by regeneration), and send correctness (exact recipient set at execution time, no cross-event recipient, no viewer send permission, one provider message per intended recipient, resumable partial success).
4. Signal Library contract (§43), including permission parity between API and UI, and behavior when a signal is deleted while draft generation runs.
5. Workflow scheduler (§44) — **only states the deployed topology can reach**, per Prompt 1's finding. If execution is a single cron tick, assert single-tick guarantees rather than simulating a worker pool.

### Exit criteria

Identity in generated content is proven correct across users and async paths. No campaign send path can produce a duplicate or cross-scope recipient.

---

## Prompt 10 — Google provider contract and test tiering

**Branch:** `test/10-provider-google`
**Plan sections:** §§15, 16, 45, 46, 47, 76
**Areas:** `provider-oauth`, `provider-gmail`, `provider-calendar`, `provider-followup`

### Do

1. **Establish the three tiers first (§76).** Assign every case in §§45–47 to Tier 1 recorded replay, Tier 2 live sandbox, or Tier 3 production canary, and record the assignment. Build the Tier 1 fixture harness before writing cases.
2. Integration state matrix (§15) for Google, including encryption key ID missing or rotated out, and decryption failing for a subset of credentials.
3. OAuth and connection security lifecycle (§45): the full ticket contract — expired, reused, malformed, mismatched, state tampering, PKCE and nonce mismatch, callback replay, open redirect, account-context switch during OAuth. Prove no bearer appears in any browser URL, log, or client payload.
4. Email provider contract (§46): correct From and Reply-To, initiating user signature, MIME body and line-break preservation through the canonical builder, provider message ID persistence, timeout before and after acceptance, duplicate send request, and the distinction between accepted-by-LR, accepted-by-provider, delivered, and failed/unknown.
5. Calendar and availability (§47): availability boundary inclusivity, the two-week horizon, the afternoon-start regression (a 2:30 PM request returns no earlier slots), timezone and DST, busy/private/all-day/recurring, meeting create/edit/cancel, duplicate create after timeout, and external deletion reconciliation. Assert product date/time controls — **no native browser date, time, or datetime-local controls**.
6. Follow-up (§16, §47): create, update, complete, clear; private acting-user event with **no lead attendee and no conferencing**; update reuses the provider event ID; partial success preserves LR state when Calendar fails; idempotent retries.
7. Reconnect-required semantics: invalid or revoked credentials map to `reconnect_required` and suppress the provider call entirely.

**Do not write Outlook or Microsoft tests.** Not implemented.

### Exit criteria

Every §§45–47 case has a declared tier. Tier 1 runs on every commit. Tier 2 runs nightly against the sandbox domain. No secret appears in any assertion, fixture, or log.

---

## Prompt 11 — AI output, prompt scope, and drift

**Branch:** `test/11-ai-output`
**Plan sections:** §70
**Areas:** `ai-prompt-scope`, `ai-quality`, `ai-drift`

### Do

1. **Prompt assembly as a scope-leak vector** — the highest-severity work here. Snapshot the assembled prompt for every generated artifact and assert it contains only the target lead, its event, and its company. No cross-event content, no cross-company content, no other recipient's personalization, no tokens, no internal secrets.
2. Determinism: identical inputs produce an identical assembled prompt.
3. Truncation: a transcript exceeding the context window is deliberately summarized or explicitly fails. Silent truncation is a defect.
4. Failure handling: model timeout, rate limit, 5xx, malformed or non-JSON response, refusal. Retry does not double-charge or double-generate. Degraded mode states intelligence is unavailable rather than presenting a placeholder as real.
5. Cost ceiling per event, with alerting.
6. Model pinning: a change to the configured model identifier is a release-gated event, asserted in CI.
7. **Golden-set eval harness** — scheduled, not per-commit. Fixed transcripts and lead fixtures scored against a rubric for grounding, required-field presence, absence of fabrication, tone, and length. Baseline the scores and alert on regression.

### Exit criteria

No generated artifact can be produced from out-of-scope data without a test going red. The golden-set harness runs and has a recorded baseline.

---

## Prompt 12 — API contract, async, shipped-client compatibility

**Branch:** `test/12-api-async-client-compat`
**Plan sections:** §§48, 49, 73, 74
**Areas:** `api-contract`, `async-jobs`, `webhooks`, `client-compat`

### Do

1. API contract and validation for every route (§49): methods, auth, authorization, scope, schema, unknown fields/mass assignment, null vs omitted, malformed JSON, body size, pagination, sort/filter allow-lists, deterministic errors, and no stack/secret leakage.
2. Route inventory test: a new mutation route cannot ship without auth, scope, validation, and direct-API coverage.
3. Middleware policy parity harness (§49): `(path, method, auth state) → expected outcome`.
4. Background jobs/webhooks/async reconciliation (§48), including forged signature, replay, out-of-order delivery, unknown object, and wrong-tenant object through safe test fixtures/endpoints.
5. Outbound webhook/CRM behavior (§74) only where operational and safe: payload scope, no secrets/tokens, non-blocking failures, retry state, signing behavior.
6. **Schema/client compatibility without migration execution:** generated types and supported client contracts must agree with the deployed schema contract. Record migration/drift concerns separately; do not apply, rollback, repair, or rehearse migrations here.
7. Shipped-client compatibility (§73): freeze an API contract snapshot per released store binary and replay against backend deploys. Include the `9f3a347` store build.

### Explicitly excluded

- migration apply/rollback
- schema repair/reset
- destructive historical-schema upgrade drills
- RLS policy migration tests

### Exit criteria

Every route is inventoried and covered. The middleware parity table exists. At least one frozen shipped-client contract replays green. Migration testing is tracked separately and does not block completion.

## Prompt 13 — Security, bypass paths, configuration

**Branch:** `test/13-security-bypass`
**Plan sections:** §§53, 58, 64, 75
**Areas:** `security`, `bypass-assertions`, `config`, `feature-flags`

### Do

1. Production-safe product/API security testing (§53) against designated test objects: IDOR/BOLA, role escalation, account-context forgery, mass assignment, injection handling, XSS handling, HTML/email injection, CSV formula injection, CSRF/open redirect/SSRF where safely testable, OAuth state/PKCE/replay, webhook forgery using test endpoints, secret/token/PII leakage, and privilege removal after role change/logout. Do not perform destructive raw DB/RLS attacks or broad abuse against production.
2. **Move to tooling, not hand-written tests:** dependency vulnerabilities (Dependabot or equivalent), CSP and security headers (a header scanner in CI), source-map exposure (build-time check), insecure cookie flags (one global assertion). Wire these; do not hand-write them.
3. **Bypass-path production assertions (§75)** — cheap and critical. A post-deploy suite that positively asserts each bypass **rejects** in production: `E2E_AUTH_BYPASS_ENABLED`, seed routes (`ALLOW_DEMO_LEAD_INTELLIGENCE_SEED`, `ALLOW_DEV_LEAD_BRIEFING_SEED`, `ALLOW_PROD_WORKFLOW_SEED`), `ALLOW_LEAD_INSIGHTS_PLAYGROUND`, and every `*_DEBUG` flag.
4. **Apple review login** as its own security row: only the exact allowlisted email, only when the gate is on, never issuing elevated scope, synchronized across Supabase Auth, server allowlist, and EAS production config.
5. CI fails if a new bypass-shaped flag is added without a corresponding production assertion. Include every seam flag added in Prompt 3.
6. Deployment, configuration, secrets, and rollback (§58): required variables present, malformed variable fails fast, encryption key set and active key ID valid, old and new key coexisting during rotation, preview cannot use production secrets, production cannot use test OAuth credentials.
7. Feature flags and kill switches (§64), including hidden UI still blocked server-side and old mobile version behavior.

### Exit criteria

Every bypass path has a positive production rejection assertion. No new flag can merge without one.

---

## Prompt 14 — Performance, resilience, observability, visual, governance, release gates

**Branch:** `test/14-perf-observability-governance`
**Plan sections:** §§18, 23, 55, 56, 57, 59, 61, 65, 66, 67, 68, 78, 80, 81
**Areas:** `performance`, `resilience`, `observability`, `visual`, `production-smoke`, `governance`

### Do

1. Concurrency (§18): two tabs, two admins, admin plus mobile, state change between load and submit, two approval attempts, concurrent autosaves, lead edited while a workflow runs, event switched mid-request. Outcomes must be deterministic.
2. Responsive and interaction testing (§23) at desktop and narrow widths, including overflow, dropdown positioning, modal bounds, keyboard navigation, focus, Escape, outside click.
3. Performance budgets (§55): measure production-safe response/query/render/import timing and regressions using controlled datasets. Do not run load/stress/soak or pool-exhaustion against production in this program.
4. Resilience behavior (§56) through deterministic local/replay seams only where safe: provider errors/timeouts, unknown outcomes, stale state, retries/idempotency, degraded UI, and reconciliation. Do not intentionally break/exhaust production infrastructure.
5. Observability (§57): structured logs, correlation IDs end to end, stable error categories, metrics for success/failure/latency/retries/duplicates/queue depth/token refresh/webhook lag, alerts for P0 and P1 symptoms, user-visible error reference IDs. Wire the fallback firing rate metric from Prompt 8. Run the operational test: cause a controlled failure, verify the alert fires, locate the exact request, follow the runbook, confirm recovery.
6. Browser matrix (§59): **Chrome and Safari only.** Firefox only if traffic warrants. Zoom 100–150%.
7. Visual regression (§61): **four to five screens only** — importer mapping/preview/errors, lead detail, email/calendar composer and scheduler, event dashboard, mobile Capture. Include the assertion that no native browser date/time controls exist.
8. Production smoke and synthetic canaries (§66) against a dedicated synthetic tenant, including the mobile compatibility probe run against the frozen shipped-binary contract from Prompt 12.
9. Architecture and code-quality gates (§67): import-boundary rules, route inventory, forbidden-pattern checks, no service-role in client bundles, no new deprecated schema field usage, no unscoped database helper.
10. Test-suite integrity and flake governance (§65) and **combinatorial reduction (§78)**: implement pairwise generation as the default, full cross-product for P0 isolation invariants only, historical escaped defects pinned and exempt. Publish the reduction so excluded cells are explicit.
11. **Test effectiveness (§80)**: keep regression coverage and safe local mutation testing. The deliberate tenant-predicate removal drill is moved to the separate engineering/security suite.
12. Documentation and runbooks (§68), and the cold-handoff test.
13. Wire the **release gates** from the plan's CTO Release Gates section into CI as a blocking check.

### Exit criteria

`npm run test` reports the full suite. Release gates block promotion. Production-safe product verification is complete. Excluded destructive/security-db/migration/stress work is recorded separately and did not block the run.

---

# Final report

After Prompt 14, produce `docs/testing/BUILD_COMPLETION_REPORT.md` using the loop controller's Final Stop Format, plus:

```txt
Total tests by area and severity:
Baseline count (Prompt 1) vs final count:
Product defects found, by severity, with file and repro:
Tests skipped as KNOWN-DEFECT, with linked findings:
Plan sections with remaining gaps and why:
Cases excluded by pairwise reduction:
requires-device tests written but not executed:
Suite wall-clock by cadence (PR / nightly / pre-promotion):
Flake rate observed:
Separate security/DB/migration/stress cases deferred:
```

The defect list is the primary deliverable. Every entry becomes a separate reviewed piece of work.
