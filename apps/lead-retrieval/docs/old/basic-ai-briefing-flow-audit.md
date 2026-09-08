# Basic AI Briefing Flow — Implementation Audit (Handoff)

**Scope:** Import → brief readiness → view brief → publish, grounded in **this repository and `types/database.ts` / migrations only**. No UI rebuild; no invented product fields.

**Audit date:** 2026-04-10.

---

## A. Current flow inventory

### A.1 Routes and pages

| Path / surface | Role |
|----------------|------|
| `/exhibitor/import/wizard` | Import wizard shell (`app/(app)/exhibitor/import/wizard/page.tsx` → `ImportWizardFlow`). |
| Steps `?step=0..4` | Source → Mapping → **Enrichment** → Validation → **Import leads** (`lib/import-wizard/steps.ts`, `step-url.ts`). **No dedicated “Brief Readiness” or “View Brief” URL** in the wizard today. |
| `/exhibitor/leads`, `/exhibitor/leads/[leadId]` | Lead list / detail; **no briefing-specific routes** found. |

### A.2 Import wizard components (active in flow)

| File | Notes |
|------|--------|
| `components/import-wizard/import-wizard-flow.tsx` | Orchestrates 5 steps; **does not mount** `BriefingReviewContainer` (confirmed by `tests/publish-step-batch-backed.test.ts`). |
| `components/import-wizard/steps/source-selection-step.tsx` | CSV source. |
| `components/import-wizard/steps/field-mapping-step.tsx` | Mapping + persist to `import_batch_field_mapping_state` + `import_batch_rows`. |
| `components/import-wizard/steps/enrichment-step.tsx` | Calls `POST /api/exhibitor/import-wizard/enrichment/run` — enrichment **during** wizard flow, not a separate product “hub”. |
| `components/import-wizard/steps/validation-step.tsx` | Validation from `GET .../validation`. |
| `components/import-wizard/steps/publish-step.tsx` | Pre-publish summary + post-import success; uses `GET .../publish-readiness` + `POST .../complete`. **No publish of briefs to mobile.** |
| `components/import-wizard/wizard-footer-config.tsx` | Footer labels per step. |

### A.3 Briefing UI (exists but **not wired** into main wizard flow)

| File | Notes |
|------|--------|
| `components/import-wizard/briefing-review-container.tsx` | Fetches `GET .../briefing-queue`, `GET .../briefing-rows/[rowId]`, approve. **Orphaned** from `import-wizard-flow` (not imported there). |
| `components/import-wizard/steps/ai-briefing-review-step.tsx` | Full queue + detail UI; **placeholder** “Brief quality” (`placeholderBriefingIntegrity`), disabled Regenerate/Edit, disabled Quick actions. |

### A.4 API routes (briefing / import)

| Route | Method | Handler |
|-------|--------|---------|
| `app/api/exhibitor/import-wizard/batches/[batchId]/briefing-queue/route.ts` | GET | `loadBatchBriefingQueue` — **draft batch only**. |
| `app/api/exhibitor/import-wizard/batches/[batchId]/briefing-rows/[rowId]/route.ts` | GET, PATCH (`approve`) | `loadBatchBriefingDetail`, `approveBatchBriefingRow` — **draft batch only**. |
| `app/api/exhibitor/import-wizard/batches/[batchId]/briefing-rows/approve-all/route.ts` | POST | `approveAllBatchBriefingRows` — **draft batch only**. |
| `app/api/exhibitor/import-wizard/batches/[batchId]/publish-readiness/route.ts` | GET | Row counts + validation; **no briefing state**. |
| `app/api/exhibitor/import-wizard/batches/[batchId]/complete/route.ts` | POST | `completeImportBatch` → publish/discard; triggers `materializeImportedLeadsFromBatch` (`lib/server/import-wizard/publish-leads-materialization.ts`). |
| `app/api/exhibitor/import-wizard/batches/[batchId]/validation/route.ts` | GET | Validation derive. |
| `app/api/exhibitor/import-wizard/enrichment/run/route.ts` | POST | Batch enrichment (`lib/enrichment/import-wizard-batch.ts`). |

### A.5 Server services and libs

| File | Purpose |
|------|---------|
| `lib/server/import-wizard/import-batch-briefing-service.ts` | Queue + detail + approve; **requires `batch.status === 'draft'`** for queue/detail/approve. |
| `lib/server/import-wizard/import-batch-service.ts` | Draft batch lifecycle + `completeImportBatch`. |
| `lib/server/import-wizard/import-batch-rows-service.ts` | Staged rows. |
| `lib/server/import-wizard/field-mapping-state.ts` | Mapping state. |
| `lib/server/import-wizard/publish-leads-materialization.ts` | Inserts `public.leads` on publish; **does not** touch `import_batch_row_briefings` or `lead_briefings`. |
| `lib/enrichment/import-wizard-batch.ts` | Provider enrichment; writes **`import_wizard_enrichment_runs`**; **does not** insert `lead_enrichments` for batch rows (comment in code: `lead_id` is for published leads only). |
| `lib/import-wizard/build-briefing-detail-from-batch-row.ts` | View model from `import_batch_row_briefings.content` + mapped cells. |
| `lib/import-wizard/briefing-blocks-derive.ts` | **Deterministic** blocks from CSV mapping — **not LLM**, not provider enrichment. |
| `lib/import-wizard/briefing-content-json.ts` | `BriefingStoredContent` JSON shape. |
| `lib/import-wizard/briefing-quality-placeholders.ts` | **Fake** integrity percentages (deterministic from id). |
| `lib/import-wizard/batch-briefing-gate.ts` | `isImportBatchBriefingStepComplete` — **legacy**, not used by streamlined flow. |
| `lib/import-wizard/ai-briefing-mock.ts` | **Mock** names/queues (demo; not used by publish flow). |
| `lib/import-wizard/publish-mock.ts` | **Mock** publish readiness (not imported by `publish-step.tsx` per tests). |

### A.6 Obsolete / legacy relative to “tightened” flow

- **`BriefingReviewContainer` + `AiBriefingReviewStep`**: Built for in-wizard review; **disconnected** from `ImportWizardFlow`.
- **`batch-briefing-gate.ts`**: “All approved” gate for legacy step flow.
- **`ai-briefing-mock.ts` / `publish-mock.ts`**: Demo/placeholder data; not authoritative.
- **Separate “Enrichment” wizard step (index 2)** vs product ask “enrichment during import”: Code still has a **dedicated Enrichment step** with its own UI; enrichment also runs via API; **not** folded into upload-only in code.

---

## B. Real data model inventory

### B.1 `public.import_batches`

| | |
|--|--|
| **Purpose** | One import job per company; at most one `draft` (partial unique index). |
| **Key fields** | `status` (`draft` \| `published` \| `discarded`), `published_at`, `data_revision`, `source_last_filename`, `company_id`. |
| **Read** | `import-batch-service.ts`, publish-readiness, wizard loaders. |
| **Write** | Create draft, bump revision, `completeImportBatch` sets terminal status. |
| **Authoritative** | Yes for batch lifecycle. |

### B.2 `public.import_batch_rows`

| | |
|--|--|
| **Purpose** | Staged CSV rows (`cells` jsonb). |
| **Read** | Validation, enrichment, briefing derive, materialization. |
| **Write** | Field mapping persist replaces rows. |
| **Authoritative** | Yes for pre-publish staging. **No row after publish** required for leads (leads are copied separately). |

### B.3 `public.import_batch_field_mapping_state`

| | |
|--|--|
| **Purpose** | `csv_headers`, `selections`, `preview_rows`, `custom_field_definitions`. |
| **Read** | Every derive path. |
| **Authoritative** | Yes for mapping. |

### B.4 `public.import_batch_row_briefings`

| | |
|--|--|
| **Purpose** | Per staged row: **review state** + **JSON `content`** for draft brief. |
| **Fields** | `approval_status` (check: `pending`, `approved`, `needs_review`, `failed`), `content` jsonb default `{}`, `reviewed_at`, `reviewed_by`. |
| **Read** | `import-batch-briefing-service.ts` (queue, detail). |
| **Write** | Insert stubs on demand; `content` updated when `shouldRefreshBriefingBlocks`; PATCH approve updates status + reviewer. |
| **RLS** | Exhibitor **update only when batch is `draft`** (`0035`). After publish, batch is not draft → **exhibitor cannot update** these rows via existing policies. |
| **Authoritative** | Yes for **draft-batch** briefing review. **Not** a “published to mobile” record. |

### B.5 `public.leads`

| | |
|--|--|
| **Purpose** | CRM-style lead after materialization. |
| **Enrichment fields** | `enriched_*` columns on row (from `types/database.ts`). |
| **Import link** | **No `import_batch_id` or `import_batch_row_id` on `leads`** in schema — **cannot** join lead ↔ batch row without new columns or side table. |
| **Write on publish** | `publish-leads-materialization.ts` inserts from staged rows + mapping. |

### B.6 `public.lead_enrichments`

| | |
|--|--|
| **Purpose** | Provider raw responses keyed by **`lead_id`**. |
| **Batch wizard** | Enrichment run **does not** insert here for batch rows (code comment). |

### B.7 `public.import_wizard_enrichment_runs` (migration `0029`, `0039`)

| | |
|--|--|
| **Purpose** | Audit trail for enrichment runs (includes `batch_id` per `0039`). |
| **Authoritative** | Run history; not per-row “needs enrichment” UI state in a single column. |

### B.8 `public.lead_briefings` (migration `0030`)

| | |
|--|--|
| **Purpose** | One row per **`lead_id`**: `content` jsonb, `approval_status` check (`pending` \| `approved`) only. |
| **App usage** | **No** `from('lead_briefings')` queries found in repo. |

### B.9 Manual / batch / event context

| | |
|--|--|
| **Batch/event context fields** | **No** dedicated table for “user-added batch context” or “event notes for briefing” found in migrations audited. |
| **Lead-level manual context** | **Not** modeled as a dedicated column beyond what can be stored in `lead_briefings.content` JSON (if ever used). |

### B.10 Brief generation (what actually runs)

- **Deterministic** `deriveBriefingBlocksFromMappedRow` → merged into `import_batch_row_briefings.content` with `meta.sourceFingerprint` (`briefing-blocks-derive.ts`, `briefing-source-fingerprint.ts`).
- **Not** a separate “Generate AI Briefs” LLM call in the briefing loader path reviewed.
- **LLM** may exist elsewhere (e.g. campaigns); **not** wired as “generate brief” in `loadBatchBriefingDetail`.

---

## C. Status / source-of-truth audit

### C.1 `import_batches.status`

| Value | Meaning | Used? |
|-------|---------|--------|
| `draft` | Editable batch | Yes |
| `published` | Import complete | Yes |
| `discarded` | Terminal | Yes |

**Survives:** Yes — lifecycle.

### C.2 `import_batch_row_briefings.approval_status`

| Value | DB check | Used? |
|-------|----------|--------|
| `pending` | ✓ | Yes (default) |
| `approved` | ✓ | Yes (approve actions) |
| `needs_review` | ✓ | In UI badges; **no separate workflow** that sets it except DB |
| `failed` | ✓ | In UI badges; **no separate workflow** that sets it in code reviewed |

**“Ready” for brief row:** Operationally **`approved`** is what gates `allApproved` in `loadBatchBriefingQueue` (non-approved count ≠ `approved`).

**Survives:** Yes for draft review; **needs product alignment** for post-publish story.

### C.3 `lead_briefings.approval_status`

| Value | DB check |
|-------|----------|
| `pending` | ✓ |
| `approved` | ✓ |

**Used in app:** **No** queries found.

### C.4 Product concepts: “Needs Enrichment” vs “Needs Context”

| Concept | In DB? | In code? |
|---------|--------|----------|
| **Needs Enrichment** | **No** enum column on batch rows. | Enrichment step shows run **summary** (success/partial/failed); **not** persisted per row as a briefing gate. |
| **Needs Context** | **No** | No field. |

**Derived only if defined:** e.g. “needs enrichment” could be derived from enrichment run result or heuristics on `leads.enriched_*` — **not** centralized today.

### C.5 “Published” / “mobile”

| | |
|--|--|
| **Batch publish** | `import_batches.published_at` + status `published`. |
| **Brief published to mobile** | **No** column; **no** API in repo that marks brief “published for mobile”. |

---

## D. Page contract mapping (target pages → real data only)

### D.1 Brief Readiness (target product hub)

**Today:** No page with this name. Closest **API** is `GET briefing-queue` (draft only).

**Lead row fields** (from real queue API + mapping):

- `personName`, `title`, `company` — from **CSV + mapping** (`queueLabelsForRow` in `import-batch-briefing-service.ts`).
- `approvalStatus` — from `import_batch_row_briefings.approval_status`.
- `briefingRecordId`, `batchRowId` — IDs.

**Readiness logic (today):**

- `allApproved` = every row in batch has `approval_status === 'approved'` (count of non-approved = 0).

**“Needs Enrichment” logic:** **Not defined** in DB. Possible **derived** signals (not implemented as a single rule):

- Wizard enrichment run summary (`WizardBatchEnrichmentOutcome`) per last run.
- **Not** joined to briefing queue in `loadBatchBriefingQueue`.

**“Needs Context” logic:** **Undefined** — no schema.

**“Ready” logic:** For **draft** batch review, **ready** = row `approved` (or product may redefine “ready” to include enrichment + context).

**Data quality summary:** **No** real “quality score” — only **placeholder** integrity in `BriefingDetailView.integrity` (`briefing-quality-placeholders.ts`).

**Batch context:** **Not** in DB as dedicated fields. **Minimal addition** (if product requires): e.g. `import_batches` optional `notes` / `context_json` or separate `import_batch_context` table — **not present**.

**Lead-level manual context:** **Not** in DB for batch rows. **Minimal addition:** `import_batch_row_briefings.content` could hold `manualContext` key **or** new column — **not** in schema today.

**“Generate AI Briefs” CTA:** **No** such server action in briefing service. Current behavior is **derive blocks** on detail load when fingerprint mismatch; **not** LLM.

---

### D.2 View Brief

**Persisted:** Yes for **draft** — `import_batch_row_briefings.content` + derived merge.

**Where:** `import_batch_row_briefings` (batch scope) **only**; `lead_briefings` **unused**.

**Structured vs freeform:** `BriefingStoredContent` — **structured** keys (`companySnapshot`, `whyHere`, `talkingPoints`, etc.) + optional freeform strings.

**Regenerate:** UI button **disabled**; **no** API.

**Mark-as-ready:** **Approve** = `approval_status: 'approved'` + `reviewed_at` / `reviewed_by`.

**Sections vs real data:**

| Section | Source |
|---------|--------|
| Who / Company snapshot | Mapped CSV + optional stored snapshot in `content`; empty fields show **"—"** (`build-briefing-detail-from-batch-row.ts`). |
| Why they may matter | `whyHere` lines from **derive** (`briefing-blocks-derive.ts`) — **from mapped cells**, not enrichment. |
| Top talking points | Same derive. |
| Questions to ask | **Usually empty** unless stored in `content` (derive does not fill in sample). |
| What we still don’t know | **Not** a named section; closest **competitorContext** / empty arrays. |

**After publish:** `loadBatchBriefingDetail` returns **null** (batch not draft) — **View Brief cannot be served by current API** for published batches.

---

### D.3 Publish

**Meaning in code today:** **`completeImportBatch`** with `publish` → set batch `published` + **`materializeImportedLeadsFromBatch`** inserts `leads`.

**Per lead vs per batch:** **Batch** operation; **per-lead** publish for briefs **does not exist**.

**Mobile:** **No** API in repo for “mobile-readable brief state” after publish. **No** sync of `import_batch_row_briefings` → `lead_briefings` in code.

**Missing for honest “publish brief”:**

- Copy or link **draft** `content` to **`lead_briefings`** (or extend `leads`) with **lead_id** after materialization.
- **Stable link** `lead_id` ↔ `batch_row_id` (new FK or column).
- **Published** / **mobile-visible** flag if product needs distinct from `lead_briefings.approval_status`.

---

## E. Gap analysis

| Gap | Detail |
|-----|--------|
| **No Brief Readiness route** | APIs exist for draft; no dedicated hub page. |
| **Post-publish briefing** | Services **reject** non-draft batches; **no** handoff to `lead_briefings`. |
| **No `lead_briefings` usage** | Table exists; **unused** in application code. |
| **No import batch id on `leads`** | Cannot trace published lead back to batch briefing row. |
| **Needs Enrichment / Needs Context** | **Not** first-class in DB; enrichment is **separate step** + run audit. |
| **Placeholder UI** | `integrity` profile/CRM **fake** percentages; `ai-briefing-mock` demo names. |
| **Duplicate concepts** | `lead_briefings.approval_status` only `pending|approved` vs batch `pending|approved|needs_review|failed`. |
| **“Generate AI Briefs”** | No LLM brief job in briefing pipeline; **derive-from-CSV only**. |

---

## F. Proposed canonical architecture (low-breakage)

1. **Single source of truth**
   - **Pre-publish staging:** `import_batch_row_briefings` + `content` JSON + `approval_status`.
   - **Post-publish:** **`lead_briefings`** (or `leads` + json) keyed by `lead_id` — **must be populated**; today **empty**.
2. **Server-owned rules**
   - Readiness = server-computed from **facts**: enrichment coverage, required context fields, approval — **not** client-only.
3. **Canonical status model** — see **Section H**.
4. **Canonical readiness computation**
   - **Server** (e.g. route handler or `lib/server/.../briefing-readiness.ts`): inputs = `lead` + optional `import_batch_row_briefings` snapshot + enrichment run data.
5. **Canonical brief record**
   - **Draft:** `import_batch_row_briefings`.
   - **Post-import:** **`lead_briefings`** (or merged content on `leads`) — **to be implemented**.
6. **Canonical publish**
   - **Import publish** = batch `published` + leads inserted (already).
   - **Brief publish** (if product requires) = **distinct** mutation on `lead_briefings` or `lead` flags — **not** implemented.

**Derived only:** Readiness badges, “needs enrichment” from `enriched_*` null checks, **not** placeholder percentages.

---

## G. Implementation plan (phased)

### Phase 1: Backend — Brief Readiness contract

| | |
|--|--|
| **Files** | New `lib/server/.../briefing-readiness.ts` (or extend `import-batch-briefing-service.ts`); `types` for readiness DTO; `app/api/.../briefing-readiness/route.ts` (or extend queue). |
| **Schema** | Optional: `import_batches.context_json` or row-level `content.manualContext`; **additive**. |
| **API** | `GET` returns readiness per row + batch summary; **no fake metrics**. |
| **UI** | None (contract only). |
| **Tests** | Unit tests for readiness rules from **fixtures**; no demo names as proof. |
| **Risks** | Defining “needs enrichment” without product thresholds. |

### Phase 2: Readiness UI

| | |
|--|--|
| **Files** | New page under `app/(app)/exhibitor/...`; list/table from Phase 1 API. |
| **Risks** | Must not show placeholder integrity until real metrics exist. |

### Phase 3: Backend — View Brief (post-import)

| | |
|--|--|
| **Schema** | `leads.import_batch_row_id` nullable FK **or** `lead_briefings` populated on materialize. |
| **API** | `GET` brief by `lead_id` from `lead_briefings`. |
| **Tests** | RLS + company scope. |

### Phase 4: View Brief UI

| | |
|--|--|
| **Files** | Lead drawer/modal; reuse `BriefingStoredContent` shape. |

### Phase 5: Backend — Publish (brief)

| | |
|--|--|
| **Schema** | `lead_briefings` approval or `mobile_visible_at` — **product decision**. |
| **API** | `POST` publish brief (per lead or batch). |

### Phase 6: Publish UI

| | |
|--|--|
| **Files** | Honest copy; no mobile sync unless API exists. |

### Phase 7: Cleanup + regression

| | |
|--|--|
| **Remove** | `briefing-quality-placeholders` from product UI if not replaced; **or** gate behind `NODE_ENV`. |
| **Remove** | `briefing-review-container` from dead code path OR rewire. |
| **Tests** | E2E for draft → publish → lead brief. |

---

## Appendix: Product clarifications needed

1. **After import publish**, should brief review **move** to **leads** only (batch tables read-only)?  
2. **“Needs Enrichment”** — threshold on which columns / provider run?  
3. **“Needs Context”** — required fields for batch vs lead?  
4. **Mobile** — does **Lead Intel Scan** read **`lead_briefings`** today (out of repo)? If yes, contract must match mobile app.  
5. **LLM** — will “Generate AI Briefs” call a **new** job, or is **CSV-only derive** sufficient for v1?

---

## Recommended final status model

**Draft (batch) row:**

- `import_batch_row_briefings.approval_status`: `pending` | `needs_review` | `failed` | `approved`  
- **Operational readiness:** computed: **needs_enrichment** (derived), **needs_context** (derived), **ready_to_generate** (when product adds LLM), **ready_to_publish** (when approved + gates pass).

**Published lead:**

- `lead_briefings.approval_status`: extend to match product or add **`mobile_published_at`** / **`published`** boolean — **requires migration** (current check only `pending|approved`).

---

## Recommended minimum schema additions

1. **`leads.import_batch_row_id`** (nullable FK) **or** `lead_import_provenance(lead_id, batch_id, batch_row_id)` — **one** linking path.  
2. **Materialization step:** copy `import_batch_row_briefings.content` → **`lead_briefings`** (or merge) when lead is created.  
3. **Optional:** `import_batches.briefing_context` jsonb (batch/event light context).  
4. **Optional:** `import_batch_row_briefings.content` key `manualContext` or `context_notes` — **no new table** if acceptable.

---

## Recommended first implementation phase

**Phase 1 only:** Define **readiness DTO + server** rules using **real** fields (`enriched_*`, enrichment run, mapping completeness, `approval_status`), **add** `lead_id` ↔ batch linkage **design**, and **document** the migration to copy brief content to `lead_briefings` on publish — **without** building the polished Readiness UI yet.

---

*End of audit.*
