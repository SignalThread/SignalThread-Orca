# Import-Based AI Briefing Flow — Concise Audit (Handoff for Prompt 2)

**Source of truth:** Current repo + `types/database.ts` + `supabase/migrations` as of audit. **No implementation, no new architecture.**

---

## Current Flow Files

### Import completion

| Kind | Path |
|------|------|
| Page | `app/(app)/exhibitor/import/wizard/page.tsx` → `components/import-wizard/import-wizard-flow.tsx` |
| Final step UI | `components/import-wizard/steps/publish-step.tsx` |
| Footer | `components/import-wizard/wizard-footer-config.tsx` |
| Complete API | `app/api/exhibitor/import-wizard/batches/[batchId]/complete/route.ts` |
| Batch service | `lib/server/import-wizard/import-batch-service.ts` (`completeImportBatch`) |
| Materialization | `lib/server/import-wizard/publish-leads-materialization.ts` |

### Landing into briefing / review / readiness

| Kind | Path |
|------|------|
| **There is no dedicated “Brief Readiness” route or page.** The main wizard ends at **Import leads** (`publish-step.tsx`). `components/import-wizard/import-wizard-flow.tsx` **does not import** `BriefingReviewContainer` or `AiBriefingReviewStep`. |
| Orphan briefing UI (reusable if wired) | `components/import-wizard/briefing-review-container.tsx` → `components/import-wizard/steps/ai-briefing-review-step.tsx` |
| Pre-import “readiness” (validation counts only, **not** briefing) | `GET` `app/api/exhibitor/import-wizard/batches/[batchId]/publish-readiness/route.ts` — used by `publish-step.tsx` |
| Briefing queue API | `GET` `app/api/exhibitor/import-wizard/batches/[batchId]/briefing-queue/route.ts` → `loadBatchBriefingQueue` |
| Briefing row detail API | `GET` `app/api/exhibitor/import-wizard/batches/[batchId]/briefing-rows/[rowId]/route.ts` → `loadBatchBriefingDetail` |
| Approve one / all | `PATCH` same `briefing-rows/[rowId]`; `POST` `.../briefing-rows/approve-all/route.ts` |
| Server service | `lib/server/import-wizard/import-batch-briefing-service.ts` |

### Loading row briefing data

| Kind | Path |
|------|------|
| Service | `loadBatchBriefingDetail`, `loadBatchBriefingQueue` in `lib/server/import-wizard/import-batch-briefing-service.ts` |
| View builder | `lib/import-wizard/build-briefing-detail-from-batch-row.ts` |
| Content parse | `lib/import-wizard/briefing-content-json.ts` (`parseBriefingContent`) |
| Block derive / merge | `lib/import-wizard/briefing-blocks-derive.ts`, `lib/import-wizard/briefing-source-fingerprint.ts` |

### Generate behavior (briefing)

| Kind | Path |
|------|------|
| **No separate “Generate AI Briefs” API or server action** for batch briefs. | |
| Deterministic generation | `deriveBriefingBlocksFromMappedRow` in `lib/import-wizard/briefing-blocks-derive.ts` — invoked inside **`loadBatchBriefingDetail`** when `shouldRefreshBriefingBlocks` → merged into `import_batch_row_briefings.content` via `mergeBriefingBlocksIntoContent` in `import-batch-briefing-service.ts`. |
| UI | `ai-briefing-review-step.tsx`: **“Regenerate”** button is **disabled** (`title="Coming soon"`). |

### Publish / materialization

| Kind | Path |
|------|------|
| Complete + publish | `completeImportBatch` in `import-batch-service.ts`; materialize in `publish-leads-materialization.ts` |
| Client | `import-wizard-flow.tsx` → `POST .../complete` with `{ action: "publish" }` |

### Staging / mapping (upstream of briefs)

| Kind | Path |
|------|------|
| Rows + mapping | `lib/server/import-wizard/import-batch-rows-service.ts`, `lib/server/import-wizard/field-mapping-state.ts` |
| Enrichment (separate wizard step) | `app/api/exhibitor/import-wizard/enrichment/run/route.ts`, `lib/enrichment/import-wizard-batch.ts` |

### Hooks / server actions

- **No React hooks** dedicated to briefing in `hooks/` found; briefing uses **client fetch** inside `briefing-review-container.tsx`.
- **No Next.js server actions** for briefing; **Route Handlers** only.

---

## Current Data Model Actually Used

### `import_batches`

| Field | Read | Write | Role in flow |
|-------|------|-------|--------------|
| `id` | Everywhere | Insert (draft) | Batch key |
| `company_id` | Scope checks | Insert | Tenant |
| `status` | `getBatchByIdForCompany`, briefing loaders (`draft` required) | `completeImportBatch` → `published` / `discarded` | **Blocks briefing APIs when not `draft`** |
| `data_revision` | Client freshness | Bumped on mapping/source change | Revision |
| `published_at` | — | Set on publish | Terminal timestamp |
| `source_last_filename` | Display | Update | Filename |

### `import_batch_rows`

| Field | Read | Write | Role |
|-------|------|-------|------|
| `id` | Queue, detail, materialization | Replace on mapping persist | Row key |
| `batch_id` | Filters | Insert | FK |
| `row_index` | Ordering | Insert | Order |
| `cells` | Validation, enrichment, briefing derive, materialization | Insert | Staged CSV |

### `import_batch_field_mapping_state`

| Field | Read | Write | Role |
|-------|------|-------|------|
| `batch_id` | FK | Upsert | |
| `csv_headers`, `selections`, `preview_rows`, `custom_field_definitions` | Field mapping + `canonicalValueForRow` | Upsert | **Required for briefing derive** |

### `import_batch_row_briefings`

| Field | Read | Write | Role |
|-------|------|-------|------|
| `id` | Queue, detail | Insert (stub rows) | Briefing record id |
| `batch_id`, `batch_row_id` | Filters | Insert | FKs |
| `approval_status` | Queue, `allApproved` | Update on approve | `pending` \| `approved` \| `needs_review` \| `failed` (DB check) |
| `content` | Detail load; merge | Insert default `{}`; **update** when blocks refresh | JSON: `BriefingStoredContent` + `meta` fingerprint |
| `reviewed_at`, `reviewed_by` | — | Approve actions | Audit |

### `public.leads` (materialization only)

| Field | Read | Write | Role |
|-------|------|-------|------|
| Core + `enriched_*` etc. | — | **Insert** on publish in `publish-leads-materialization.ts` | **No `import_batch_*` FK on lead in schema** — briefs are **not** linked to leads in DB today |

### `lead_briefings`

| | |
|--|--|
| **Not referenced** in application code (no `.from('lead_briefings')` in repo). Exists in migrations + types only. |

### `import_wizard_enrichment_runs` / provider enrichment

| | |
|--|--|
| Written by `lib/enrichment/import-wizard-batch.ts` for **audit**; **not** the same as `import_batch_row_briefings.content`. |

---

## Current Source of Truth

| Question | Answer |
|----------|--------|
| **Parent table for this flow** | **`import_batches`** — one row per import job; lifecycle `draft` → `published` \| `discarded`. |
| **Per-row brief store (draft)** | **`import_batch_row_briefings`** — one row per `import_batch_rows.id` (`unique (batch_row_id)`). |
| **What “publish” does today** | `POST .../complete` with `action: "publish"`: updates **`import_batches`** to `published`, then **`materializeImportedLeadsFromBatch`** inserts **`public.leads`** from staged rows + mapping. **Does not** read/write `import_batch_row_briefings` or `lead_briefings` in that path. |
| **Briefs operational / mobile-usable after publish?** | **No.** Draft briefs live only on **`import_batch_row_briefings`** while batch is **`draft`**. After publish, existing briefing **loaders require `draft`** (`batch_not_draft`). **`lead_briefings` is unused** in app code. **No** mobile sync path in this repo. |

---

## Readiness Page: Real vs Fake

**There is no standalone “Brief Readiness” page in the app router.** Relevant UIs:

### A) **Publish step — pre-import panel** (`publish-step.tsx` → `PreImport`)

| Element | Real / fake |
|---------|-------------|
| `rowsWithIdentity`, `rowsWithMustFix`, `totalRows`, `batchStatus`, `dataRevision` | **Real** — from `GET .../publish-readiness` (derived validation + counts). |
| “Ready to import” / blocked banner | **Real** logic (`blocked` = no rows or `rowsWithMustFix > 0`). |
| **Not** briefing readiness — copy explicitly says AI briefings are **not** this step. |

### B) **Orphan briefing review** (`ai-briefing-review-step.tsx`) — only if `BriefingReviewContainer` is mounted elsewhere

| Element | Real / fake |
|---------|-------------|
| Queue names / company / title | **Real** — from CSV + mapping (`queueLabelsForRow`). |
| `approvalStatus` per row | **Real** — `import_batch_row_briefings.approval_status`. |
| Approved count / progress | **Real** — from queue data. |
| Headline, company snapshot, why here, talking points (when derived) | **Real** — from `content` + mapped cells (`build-briefing-detail-from-batch-row` + derive). |
| **Brief quality** (profile % / CRM history %) | **Fake** — `placeholderBriefingIntegrity` (`lib/import-wizard/briefing-quality-placeholders.ts`). |
| **Regenerate / Edit briefing** | **Not wired** — disabled. |
| **Quick actions** (schedule, draft outreach) | **Disabled** — not wired. |
| Validation badge in briefing step | **`openValidationIssues` is always `null`** from API (`BatchBriefingQueueResponse`) — **no real count** in briefing queue response. |

**v1 keep:** Row list, approval status, derived briefing sections from real mapping/content.  
**v1 remove or hide:** Integrity placeholder bars; disabled buttons unless implemented; any copy implying mobile publish.

---

## Manual Context: Current State

| Question | Answer |
|----------|--------|
| **Per-lead manual context persistence in this flow?** | **No dedicated field.** `import_batch_row_briefings.content` is **jsonb** (`BriefingStoredContent`) — could hold arbitrary keys, but **no** migration or code path persists **manual context** today. |
| **Minimum gap** | To persist manual notes per staged row without new tables: **use a key inside `content`** (e.g. `manualNotes`) and **read/write** in `loadBatchBriefingDetail` / a new PATCH — **requires product + API**, not present now. |

---

## Generate: Current State

| Question | Answer |
|----------|--------|
| **What “generate” does** | **Deterministic:** `deriveBriefingBlocksFromMappedRow` + `mergeBriefingBlocksIntoContent` when fingerprint says refresh; **persisted** in `import_batch_row_briefings.content` on **GET detail** (`loadBatchBriefingDetail`). |
| **Wired?** | **Yes** server-side on detail load. **No** user-triggered generate endpoint. |
| **LLM / queue?** | **No** LLM in this path. Not async queued. |
| **Reuse for v1** | **Safe:** fingerprinting, derive, merge, `parseBriefingContent`. **Do not** present placeholder integrity as real. |

---

## Publish: Current State

| Question | Answer |
|----------|--------|
| **What publish does** | Sets batch **published**, **inserts `public.leads`** (materialization). |
| **Only creates leads?** | **Yes** for persisted post-publish data in this path — **plus** terminal batch state. |
| **Briefing content durable post-publish?** | **No** — materialization **does not** copy `import_batch_row_briefings` to `lead_briefings` or attach to leads. |
| **Blocker for “operational” brief after import** | **(1)** Batch is **no longer `draft`** → existing briefing APIs **reject**. **(2)** **No** FK from `leads` to batch row. **(3)** **`lead_briefings` unused.** |

---

## Smallest Possible Prompt 2 Plan

**Goal:** “Brief Readiness v1” for **import flow only**, **minimum change**, **maximum reuse**.

1. **Reuse as-is**  
   - `import-batch-briefing-service.ts` (queue, detail, approve) while batch is **`draft`**.  
   - `briefing-queue`, `briefing-rows/[rowId]`, `approve-all` routes.  
   - `deriveBriefingBlocksFromMappedRow` + content merge + `build-briefing-detail-from-batch-row`.  
   - `publish-readiness` for **import validation** metrics (rename/labelling in UI only if needed — still not “brief readiness” data).

2. **Fake UI to remove or gate**  
   - **Remove or hide** “Brief quality” placeholder metrics (`placeholderBriefingIntegrity` / `ai-briefing-review-step` integrity panel) for v1 unless replaced with real fields.  
   - Do **not** ship disabled **Regenerate / Edit** as if they work — keep disabled or omit.

3. **Minimal logic to tighten**  
   - **Wire** `BriefingReviewContainer` (or equivalent) to a **real route or step** the user can reach **before** `completeImportBatch` publish — **only if product wants review before import**; otherwise define “readiness” as **post-draft pre-publish** screen using same APIs.  
   - Align copy: **publish** today = **leads only**, not briefs to mobile.

4. **Minimal schema change — only if v1 requires briefs after import**  
   - If briefs must survive publish: **either** link `leads` to `import_batch_rows` **or** copy `import_batch_row_briefings.content` into **`lead_briefings`** on materialize — **one** of these is required for post-publish brief; **cannot** be done with zero schema/API work if `lead_briefings` stays unused.

5. **Out of smallest scope**  
   - New workspace model, lead-selection architecture, mobile API — **not** in this handoff.

---

*End of concise handoff.*
