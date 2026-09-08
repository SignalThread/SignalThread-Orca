# Lead Retrieval Phase 4 — P0 Coverage Prompt Pack

## Purpose

This prompt pack is meant to be used with the loop controller and the Phase 4 plan document.

It contains the seven detailed implementation prompts for Phase 4 P0 coverage depth.

The agent should execute these prompts in order, without skipping, broadening, or inventing extra phases.

---

## Required Inputs For Loop Controller

Use these values when starting the loop.

```text
Loop controller:
GENERIC_PROMPT_LOOP_CONTROLLER.md

Plan document:
lead-retrieval-phase-4-p0-coverage-loop.md

Prompt document:
lead-retrieval-phase-4-p0-prompts.md

Expected branch:
main

Schema mode:
OPEN

Allowed scope:
Lead Retrieval repo only: ~/Documents/lead retrieval app

Out-of-scope areas:
~/Documents/Internal-app
mobile lead posting behavior
mobile recording payload shape
mobile additive recording semantics
mobile recording UX
provider/live integrations unless explicitly configured

Canonical models/services:
Use existing canonical Lead Retrieval services, route handlers, Supabase/Prisma models, RBAC helpers, upload/finalize helpers, campaign services, workflow emitters, and test harness utilities already in the repo. Do not create duplicate canonical state.
```

---

## Global Execution Rules

Run these prompts as a loop.

Do **not** stop after each prompt for manual approval unless a hard stop is hit.

For every prompt:

1. Inspect existing coverage first.
2. Identify what is already tested.
3. Identify the exact missing P0 proof.
4. Add the smallest deterministic coverage that closes the gap.
5. Use owned test data, not arbitrary shared seed rows.
6. Clean up test data in `finally` where practical.
7. Do not fake provider/live coverage.
8. Do not broaden into unrelated product work.
9. Do not touch protected mobile behavior without explicit approval.
10. Run targeted validation.
11. Run broader validation when shared code changed.
12. Leave generated Playwright files uncommitted.
13. Commit only source/test changes for the active block.
14. Continue to the next prompt if no hard stop is hit.

---

## Schema Mode

Schema mode is:

```text
OPEN
```

Schema is **not closed**.

Schema changes are allowed when they are required to complete the active prompt and align with the plan.

Allowed schema work includes:

- new tables/models
- new nullable columns
- safe required columns with defaults/backfills
- new relations and foreign keys
- new indexes and uniqueness constraints
- safe backfills from provable existing data
- generated client updates when required by repo workflow
- route/service/test updates required by the schema change

Do not do unsafe database work:

- do not reset the database
- do not run destructive Prisma/database commands
- do not drop data without explicit approval
- do not invent backfill data when the source relationship is not provable
- do not hide data cleanup in vague migrations
- do not create UI-only state to avoid proper schema work

Hard stop only if:

- the migration would destroy data without explicit approval
- existing data conflicts with the target model and cannot be migrated safely
- the prompt requires a product/schema decision not covered by the plan
- implementation would require live production access, database reset, or manual data alteration

---

## Provider Coverage Rule

Do not fake provider coverage.

If a provider is not actually called, label the coverage honestly.

Examples:

```text
route contract coverage
browser contract coverage
provider-gated canary still needed
live provider coverage not run
```

Providers include:

- OpenAI / LLM provider
- SendGrid
- R2 / object storage
- audio/transcription provider
- Google Sheets
- HubSpot
- Salesforce
- ZoomInfo
- Apollo
- PDL

---

## Commit / Dirty File Rules

Do not commit generated files:

```text
e2e/storage/*.json
test-results/.last-run.json
playwright-report/
```

Do not commit unrelated dirty files or unrelated deletions.

Use non-interactive commits only:

```bash
git commit -m "Add <specific coverage block>"
```

Never run a git command that opens Vim or another interactive editor.

---

# Prompt 1 — Audio Upload / Status Truth Browser Coverage

## Goal

Add P0 coverage proving that the audio/recording upload lifecycle is truthful through browser/API behavior.

This is not asking for a mobile recording rewrite. This is coverage depth for the Lead Retrieval web/API product truth around uploaded/attached audio state.

Existing node/journey coverage may already cover audio lifecycle contracts. This prompt should inspect that first and then close the remaining browser/API truth gap.

## Scope

Repo only:

```bash
cd ~/Documents/lead\ retrieval\ app
```

Allowed:

- web/API tests
- Playwright tests
- node route/service tests
- small route/service fixes if a real product bug is found
- additive schema changes if required and safe
- deterministic fixture/helper improvements

Not allowed without explicit approval:

- changing mobile lead posting behavior
- changing mobile recording upload payload shape
- changing additive recording semantics
- changing mobile recording UX
- faking live audio/transcription provider coverage

## First Inspection

Before editing, inspect current coverage and implementation around:

- audio upload routes
- recording routes
- lead audio/recording status fields
- lead detail audio rendering
- journey audio lifecycle tests
- any existing file/upload helper utilities
- provider/storage boundary code

Look for existing files such as:

```text
tests/journeys/lead-audio-lifecycle.e2e.test.ts
app/api/**/audio/**
app/api/**/recording/**
app/api/**/conversation/**
app/api/**/upload/**
components/**/audio**
components/**/recording**
lib/**/audio**
lib/**/recording**
lib/**/upload**
```

Use actual repo discovery rather than assuming exact paths.

## Coverage To Add

Add the smallest deterministic coverage that proves:

1. A test-owned lead can have an audio/recording upload or upload-like state created through the canonical API path.
2. The status is truthful after creation.
3. Pending/processing/completed/failed states are not misrepresented.
4. Lead detail or the relevant UI/API read path reflects the same canonical state.
5. Invalid lead/scope/state requests return stable errors.
6. Wrong-tenant or wrong-role access is rejected if the route is tenant-scoped.
7. Cleanup removes test-owned data.
8. Provider/storage boundaries are labeled honestly if the provider is not live.

If the product does not currently expose browser upload UI, use route/API coverage plus a browser read/assertion where practical.

## Product Fix Rules

If a real bug is found:

- fix the canonical server-side route/service path
- keep route handlers thin
- avoid duplicated business logic
- do not patch only the UI
- add regression coverage for the bug

## Schema Rule

Schema mode is OPEN.

If the route/status truth cannot be represented correctly without schema support, add the smallest safe additive schema change and migration.

Do not create duplicate canonical state.

## Validation

Run targeted validation first, for example:

```bash
npm run test:node:all -- --match audio
npx playwright test <new-or-existing-audio-spec> --project=chromium --reporter=line
```

Use the actual commands that match the repo.

If shared routes/services changed, also run:

```bash
npm run test:node:all
npm run test:playwright
npx tsc --noEmit
```

## Commit

Commit only relevant files:

```bash
git commit -m "Add audio upload status truth coverage"
```

## Required Report

Report:

```text
Prompt completed: Audio Upload / Status Truth Browser Coverage
Files changed:
Migration files created:
Schema/client generation:
Existing coverage found:
Gap closed:
Provider/live boundary:
Tests run:
Test results:
Typecheck/build result:
Behavior changed:
Plan alignment review:
Corrections made after plan review:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

Then continue to Prompt 2 unless a hard stop was hit.

---

# Prompt 2 — Import CSV → Publish Browser Coverage

## Goal

Add P0 browser/API coverage proving that CSV lead import can publish real usable leads into the product.

This should prove the production path, not just parser internals.

## Scope

Allowed:

- Playwright import flow tests
- API route tests for import/publish
- deterministic CSV fixtures
- fixture cleanup helpers
- small route/service fixes if real bugs are found
- additive schema changes if required and safe

Not allowed:

- relying on arbitrary shared seed leads
- skipping failures to get green
- fake provider coverage
- broad import refactors outside the active path

## First Inspection

Inspect existing implementation and tests for:

```text
CSV import
lead import
batch import
preview
publish
briefing import
lead publishing
uploaded lead drafts
```

Search likely areas:

```text
app/api/**/import**
app/api/**/csv**
app/api/**/publish**
components/**/import**
components/**/csv**
lib/**/import**
lib/**/csv**
tests/**/import**
e2e/**/import**
```

Determine:

- whether browser UI exists
- whether import is route/API-only
- whether preview/publish is two-step or one-step
- what canonical tables hold imported vs published lead state
- what cleanup is required

## Coverage To Add

Add deterministic coverage that proves:

1. A test-owned CSV can be uploaded/imported.
2. The CSV contract is accepted.
3. Preview/review state is shown or returned if the product supports it.
4. Publish creates real leads.
5. Published leads appear in the relevant lead surface or API read path.
6. Lead fields are correct after publish.
7. Leads are scoped to the correct company/event.
8. Invalid CSV is rejected with stable errors.
9. Wrong-role or wrong-tenant publish is rejected where applicable.
10. Test-created imported/published data is cleaned up.

If browser UI exists, prefer browser coverage.

If no browser UI exists, add route/API coverage and document why browser coverage is not applicable yet.

## Product Fix Rules

If the test reveals a real bug:

- fix the canonical import/publish service path
- preserve server-side authorization/scope checks
- avoid UI-only truth
- do not introduce duplicate import state
- add regression coverage

## Schema Rule

Schema mode is OPEN.

If import/publish truth requires a safe additive model/field/index, add it with migration and tests.

## Validation

Run targeted import/publish tests.

Then run broader validation if routes/services changed:

```bash
npm run test:node:all
npm run test:playwright
npx tsc --noEmit
```

## Commit

```bash
git commit -m "Add CSV import publish coverage"
```

## Required Report

Report:

```text
Prompt completed: Import CSV → Publish Browser Coverage
Files changed:
Migration files created:
Schema/client generation:
Existing coverage found:
Gap closed:
Tests run:
Test results:
Typecheck/build result:
Behavior changed:
Plan alignment review:
Corrections made after plan review:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

Then continue to Prompt 3 unless a hard stop was hit.

---

# Prompt 3 — Campaign Builder → Generated Draft Browser Coverage

## Goal

Add P0 coverage proving the campaign builder can generate a draft from selected context, signals, and/or leads through realistic browser/API behavior.

This should prove campaign builder product flow, not just isolated draft helper output.

## Scope

Allowed:

- Playwright browser coverage for campaign builder
- route/API tests for draft generation
- deterministic campaign/lead/signal fixtures
- small canonical service fixes if real bugs are found
- additive schema changes if required and safe

Not allowed:

- fake live LLM/provider coverage
- broad campaign redesign
- changing unrelated campaign UX
- relying on arbitrary shared seed campaigns/signals/leads

## First Inspection

Inspect current coverage and implementation for:

```text
campaign builder
campaign creation
campaign draft generation
signal selection
lead/recipient selection
LLM draft generator
draft state
```

Likely paths:

```text
app/**/campaigns/**
app/api/campaigns/**
components/**/campaign**
lib/**/campaign**
lib/**/draft**
lib/**/signals**
tests/**/campaign**
tests/**/draft**
e2e/**/campaign**
```

Determine:

- current campaign builder route
- whether signal/context selection is UI-backed
- whether draft generation calls a provider, mock, or internal composer
- how generated draft state is persisted
- what provider boundary should be labeled

## Coverage To Add

Add deterministic coverage that proves:

1. Campaign builder route loads for the right role.
2. A test-owned campaign can be created or opened.
3. Required setup fields work.
4. Test-owned leads/recipients can be selected if applicable.
5. Test-owned signals/context can be selected if applicable.
6. Draft generation route is invoked.
7. Generated draft content appears in UI or canonical API read path.
8. Draft state is persisted or reflected correctly.
9. Empty/invalid generation states fail safely.
10. Wrong role/scope is rejected where applicable.
11. Provider/live LLM boundary is labeled honestly.

If LLM provider is not actually called, mark coverage as browser/API contract coverage and identify provider-gated canary remaining.

## Product Fix Rules

If a real bug is found:

- fix canonical campaign/draft service logic
- keep route handlers thin
- preserve RBAC and tenant scope
- do not duplicate draft state
- avoid brittle UI selectors

## Schema Rule

Schema mode is OPEN.

If draft generation state requires a safe additive schema change, add it with migration/tests.

## Validation

Run targeted campaign builder/draft tests.

Then, if campaign routes/services changed:

```bash
npm run test:node:all
npm run test:playwright
npx tsc --noEmit
```

## Commit

```bash
git commit -m "Add campaign builder draft coverage"
```

## Required Report

Report:

```text
Prompt completed: Campaign Builder → Generated Draft Browser Coverage
Files changed:
Migration files created:
Schema/client generation:
Existing coverage found:
Gap closed:
Provider/live boundary:
Tests run:
Test results:
Typecheck/build result:
Behavior changed:
Plan alignment review:
Corrections made after plan review:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

Then continue to Prompt 4 unless a hard stop was hit.

---

# Prompt 4 — Campaign Draft / Send Route Coverage

## Goal

Add P0 route/API coverage proving campaign draft/send behavior is safe, scoped, and correctly gated.

This can be API-level if browser UI is not the right validation layer.

## Scope

Allowed:

- route/API tests for campaign send
- campaign message/draft state tests
- RBAC/scope tests
- deterministic campaign/recipient fixtures
- small canonical service fixes if real bugs are found
- additive schema changes if required and safe

Not allowed:

- fake SendGrid live delivery
- changing unrelated campaign builder UX
- broad email delivery redesign
- skipping send failures to make tests pass

## First Inspection

Inspect existing implementation and tests for:

```text
campaign send
campaign messages
campaign recipients
draft state
ready state
sent state
SendGrid
provider message id
email webhook
```

Likely paths:

```text
app/api/campaigns/**
lib/**/campaign**
lib/**/sendgrid**
lib/**/email**
tests/**/campaign**
tests/**/send**
```

Determine:

- canonical send route
- canonical send service/helper
- valid state transitions
- recipient/content requirements
- role/scope enforcement
- provider behavior in local/test environment

## Coverage To Add

Add deterministic coverage that proves:

1. Send rejects missing campaign.
2. Send rejects wrong tenant/scope.
3. Send rejects viewer or wrong-role user.
4. Send rejects missing recipients.
5. Send rejects missing content/body.
6. Send rejects invalid draft state.
7. Send handles already-sent campaign safely.
8. Valid send path updates canonical state correctly in contract mode.
9. Provider message IDs/events are handled honestly if available.
10. SendGrid live delivery is not claimed unless actually called.

Prefer route/API tests for this block because send safety is server-side truth.

## Product Fix Rules

If a real bug is found:

- fix canonical send service
- enforce server-side role/scope/state checks
- keep route handler thin
- avoid UI-only safety
- add regression coverage

## Schema Rule

Schema mode is OPEN.

If sent/draft state needs safe additive schema support, add migration/tests.

## Validation

Run targeted campaign send tests.

Then, if campaign services/routes changed:

```bash
npm run test:node:all
npx tsc --noEmit
npm run build
```

If browser surfaces changed:

```bash
npm run test:playwright
```

## Commit

```bash
git commit -m "Add campaign send route coverage"
```

## Required Report

Report:

```text
Prompt completed: Campaign Draft / Send Route Coverage
Files changed:
Migration files created:
Schema/client generation:
Existing coverage found:
Gap closed:
Provider/live boundary:
Tests run:
Test results:
Typecheck/build result:
Behavior changed:
Plan alignment review:
Corrections made after plan review:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

Then continue to Prompt 5 unless a hard stop was hit.

---

# Prompt 5 — Document Upload / Preview / Send Route Coverage

## Goal

Add P0 coverage proving document upload, preview, and send/attach behavior through route/API/product truth.

This block should close the route/storage/scope truth gap for document workflows.

## Scope

Allowed:

- route/API tests for document upload/presign/finalize/preview/send
- Playwright tests if browser document UI exists
- deterministic document fixtures
- authorization/scope regression tests
- small canonical route/service fixes if real bugs are found
- additive schema changes if required and safe

Not allowed:

- fake R2 live storage coverage
- broad document feature redesign
- committing generated binary artifacts unnecessarily
- relying on arbitrary existing documents

## First Inspection

Inspect existing implementation/tests for:

```text
document upload
document preview
document send
attachments
presign
R2
storage
campaign document
lead document
```

Likely paths:

```text
app/api/**/documents/**
app/api/**/upload**
app/api/**/presign**
app/api/**/preview**
components/**/document**
lib/**/document**
lib/**/storage**
lib/**/r2**
tests/**/document**
e2e/**/document**
```

Determine:

- whether documents are lead-level, campaign-level, or both
- whether upload is direct, presigned, or local/test-only
- what canonical metadata table/state exists
- preview behavior
- send/attach behavior if implemented
- storage provider boundary

## Coverage To Add

Add deterministic coverage that proves:

1. Upload/presign route validates auth and scope.
2. Upload/presign route rejects invalid payloads.
3. Document metadata is created only for valid scope.
4. Preview route returns expected state or stable errors.
5. Missing/invalid document IDs fail safely.
6. Wrong-tenant or wrong-role users cannot access documents.
7. Send/attach behavior works if product supports it.
8. Cleanup removes test-owned document metadata.
9. R2/storage live behavior is not claimed unless actually called.

If browser UI exists, add a browser assertion for the product-visible preview/send state.

If no browser UI exists, document why route/API coverage is the right P0 proof for now.

## Product Fix Rules

If a real bug is found:

- fix canonical document/storage service
- keep route handlers thin
- enforce server-side auth/scope
- do not create duplicate document state
- add regression coverage

## Schema Rule

Schema mode is OPEN.

If document truth requires safe additive schema support, add migration/tests.

## Validation

Run targeted document tests.

Then, if shared storage/routes changed:

```bash
npm run test:node:all
npx tsc --noEmit
npm run build
```

If browser surfaces changed:

```bash
npm run test:playwright
```

## Commit

```bash
git commit -m "Add document upload route coverage"
```

## Required Report

Report:

```text
Prompt completed: Document Upload / Preview / Send Route Coverage
Files changed:
Migration files created:
Schema/client generation:
Existing coverage found:
Gap closed:
Provider/live boundary:
Tests run:
Test results:
Typecheck/build result:
Behavior changed:
Plan alignment review:
Corrections made after plan review:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

Then continue to Prompt 6 unless a hard stop was hit.

---

# Prompt 6 — Two-Tenant RBAC Browser Matrix

## Goal

Add P0 browser/API coverage proving tenant isolation and role boundaries through real product surfaces.

This is a high-risk block. Server-side enforcement is the source of truth. UI hiding is not enough.

## Scope

Allowed:

- Playwright browser RBAC tests
- route/API RBAC tests
- deterministic two-tenant fixtures
- role/scope helper improvements
- small canonical auth/scope fixes if real bugs are found
- additive schema changes if required and safe

Not allowed:

- UI-only permission fixes
- broad auth refactors
- weakening RBAC to make tests pass
- relying on arbitrary shared tenants/users/data
- changing unrelated role behavior without product reason

## First Inspection

Inspect existing RBAC coverage and implementation for:

```text
tenant isolation
event scope
company scope
platform admin
organizer admin
exhibitor admin
viewer
leads RBAC
campaigns RBAC
signals RBAC
documents RBAC
licenses RBAC
```

Likely paths:

```text
middleware.ts
app/api/**/*
lib/**/auth**
lib/**/rbac**
lib/**/scope**
tests/**/rbac**
tests/**/scope**
e2e/**/rbac**
e2e/**/licenses**
e2e/**/signals**
e2e/**/leads**
```

Determine:

- existing two-tenant test helpers
- available seeded users/roles
- canonical scope enforcement helpers
- surfaces most worth proving through browser
- routes that need direct API assertions

## Coverage To Add

Add deterministic coverage that proves:

1. Tenant A cannot see Tenant B leads.
2. Tenant A cannot mutate Tenant B leads.
3. Tenant A cannot see/mutate Tenant B campaigns.
4. Tenant A cannot see/mutate Tenant B documents where applicable.
5. Tenant A cannot see/mutate Tenant B signals where applicable.
6. Viewer cannot perform exhibitor-admin writes.
7. Wrong-role users cannot access protected admin/organizer/exhibitor actions.
8. Organizer/platform/exhibitor route boundaries behave as expected.
9. API rejects guessed cross-tenant IDs.
10. UI does not expose obvious forbidden actions to wrong-role users.
11. Tests own all data and clean it up.

Use browser coverage where the product surface matters.

Use API coverage where the server-side rejection is the true proof.

## Product Fix Rules

If a real authorization bug is found:

- fix the canonical server-side enforcement path first
- update UI only after server truth is correct
- do not create route-specific copies of RBAC logic
- add regression tests
- preserve platform admin override behavior if currently intended

## Schema Rule

Schema mode is OPEN.

If RBAC truth requires safe additive schema support, add migration/tests.

## Validation

Run targeted RBAC tests.

Then run broader validation because auth/scope changes are risky:

```bash
npm run test:node:all
npm run test:playwright
npx tsc --noEmit
npm run build
```

## Commit

```bash
git commit -m "Add two tenant RBAC coverage"
```

## Required Report

Report:

```text
Prompt completed: Two-Tenant RBAC Browser Matrix
Files changed:
Migration files created:
Schema/client generation:
Existing coverage found:
Gap closed:
Tests run:
Test results:
Typecheck/build result:
Behavior changed:
Plan alignment review:
Corrections made after plan review:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

Then continue to Prompt 7 unless a hard stop was hit.

---

# Prompt 7 — Conversation Upload / Finalize / Chunked Route Coverage

## Goal

Add P0 route/API coverage proving conversation upload, finalize, and chunked route behavior.

This may overlap with Prompt 1, but Prompt 1 focuses on audio/status truth through browser/API behavior. This prompt focuses specifically on route-level upload/finalize/chunked correctness.

## Scope

Allowed:

- route/API tests for upload initialization
- chunk upload tests if implemented
- finalize tests
- invalid/missing chunk tests
- duplicate finalize tests
- wrong-scope tests
- small canonical route/service fixes if real bugs are found
- additive schema changes if required and safe

Not allowed:

- changing mobile recording payload shape without approval
- changing additive recording semantics without approval
- fake storage/provider live coverage
- broad recording/conversation redesign

## First Inspection

Inspect existing implementation/tests for:

```text
conversation upload
recording upload
chunk upload
finalize upload
audio session
upload session
recording status
transcript
conversation chunks
```

Likely paths:

```text
app/api/**/conversation/**
app/api/**/recording/**
app/api/**/audio/**
app/api/**/finalize**
app/api/**/chunk**
lib/**/conversation**
lib/**/recording**
lib/**/upload**
lib/**/storage**
tests/**/conversation**
tests/**/recording**
tests/**/chunk**
```

Determine:

- whether chunked upload is implemented
- whether finalize is idempotent
- what canonical state marks upload complete
- what table/model owns upload session state
- what cleanup is required
- where provider/storage boundary exists

## Coverage To Add

Add deterministic coverage that proves:

1. Upload initialization validates auth/scope.
2. Upload initialization creates canonical upload/session state if applicable.
3. Chunk upload rejects invalid session IDs.
4. Chunk upload rejects wrong lead/company/event scope.
5. Finalize rejects missing session/chunks.
6. Finalize rejects wrong tenant/role.
7. Finalize is idempotent or returns a stable duplicate-finalize error.
8. State is not marked complete unless finalize truly succeeds.
9. Failed upload/finalize state is truthful.
10. Cleanup removes test-owned upload/session records.
11. Storage/provider live behavior is not claimed unless actually called.

If chunked upload is not implemented, do not invent it just for the test.

Instead:

- cover the implemented upload/finalize route behavior
- document that chunked route coverage is not applicable until route exists
- add a provider-gated/canary note if needed

## Product Fix Rules

If a real bug is found:

- fix canonical upload/finalize service
- preserve protected mobile behavior unless explicit approval is given
- keep route handlers thin
- enforce server-side scope
- add regression coverage

## Schema Rule

Schema mode is OPEN.

If upload/finalize truth requires safe additive schema support, add migration/tests.

## Validation

Run targeted conversation/upload tests.

Then, if shared recording/upload services changed:

```bash
npm run test:node:all
npm run test:playwright
npx tsc --noEmit
npm run build
```

## Commit

```bash
git commit -m "Add conversation upload route coverage"
```

## Required Report

Report:

```text
Prompt completed: Conversation Upload / Finalize / Chunked Route Coverage
Files changed:
Migration files created:
Schema/client generation:
Existing coverage found:
Gap closed:
Provider/live boundary:
Tests run:
Test results:
Typecheck/build result:
Behavior changed:
Plan alignment review:
Corrections made after plan review:
Risks / follow-up needed:
Next prompt started or reason for stopping:
```

Then run the final Phase 4 validation/audit below unless a hard stop was hit.

---

# Final Phase 4 Validation / Audit

## Goal

Confirm Phase 4 coverage depth is complete and the full suite remains trustworthy.

## Required Commands

Run:

```bash
npm run test:node:all
npm run test:journeys
npm run test:workflow
npm run test:playwright
npx tsc --noEmit
npm run build
npm run test:full
```

## Final Audit

Produce a final report:

```text
Overall implementation summary:
All files changed:
All migration files created:
Schema/client generation:
P0 coverage blocks closed:
Provider/live gaps still gated:
Tests run:
Passing/failing status:
Typecheck/build status:
Manual migration steps required:
Manual QA checklist:
Known risks:
Out-of-scope items not touched:
Generated files left uncommitted:
Branch ready for human review: yes/no
```

## Success Criteria

Phase 4 is complete when:

```text
All seven prompts completed or honestly documented as not applicable/provider-gated
npm run test:full passes
No generated Playwright files are staged
No unrelated files are committed
No protected mobile behavior changed without approval
Schema changes, if any, are safe/additive and documented
```

---

# Starting Message For Codex

Use this exact starting message:

```text
Read the loop controller first, then read the plan and prompt docs listed below.

Loop controller:
GENERIC_PROMPT_LOOP_CONTROLLER.md

Plan document:
lead-retrieval-phase-4-p0-coverage-loop.md

Prompt document:
lead-retrieval-phase-4-p0-prompts.md

Expected branch:
main

Schema mode:
OPEN

Allowed scope:
Lead Retrieval repo only: ~/Documents/lead retrieval app

Out of scope:
~/Documents/Internal-app
mobile lead posting behavior
mobile recording payload shape
mobile additive recording semantics
mobile recording UX
provider/live integrations unless explicitly configured

Execute the prompts in order. This is a loop. Do not stop after each prompt for manual approval. Stop only on the hard stops in the loop controller or prompt pack.

Final target:
npm run test:full passes.
```
