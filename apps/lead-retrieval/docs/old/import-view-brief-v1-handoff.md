# Import Flow — “View Brief” Foundation Audit (Handoff for Prompt 4)

**Source of truth:** Current repo as of this audit. **No implementation.** **No publish redesign.**

**Important:** There is **no** dedicated wizard step titled “View Brief” today. The import wizard has **six** steps (`lib/import-wizard/steps.ts`, indices `0…5`): Source → Mapping → Enrichment → Validation → **Brief Readiness** → **Import leads**. Single-row briefing detail is loaded and rendered **inside Brief Readiness** (`components/import-wizard/steps/ai-briefing-review-step.tsx`). This audit describes that foundation and what would be reused for a **future** step **between** Brief Readiness and Publish.

---

## Current View Brief Files

### Loading a single row briefing detail

| Kind | Path |
|------|------|
| Route handler | `GET` `app/api/exhibitor/import-wizard/batches/[batchId]/briefing-rows/[rowId]/route.ts` → `loadBatchBriefingDetail` |
| Service | `lib/server/import-wizard/import-batch-briefing-service.ts` — `loadBatchBriefingDetail` |
| View builder | `lib/import-wizard/build-briefing-detail-from-batch-row.ts` — `buildBriefingDetailFromBatchRow` |
| Content typing / parse | `lib/import-wizard/briefing-content-json.ts` — `parseBriefingContent`, `BriefingStoredContent` |
| Deterministic blocks + persist | `lib/import-wizard/briefing-blocks-derive.ts` — `deriveBriefingBlocksFromMappedRow`, `mergeBriefingBlocksIntoContent`, `shouldRefreshBriefingBlocks` |
| Fingerprint | `lib/import-wizard/briefing-source-fingerprint.ts` — `computeBriefingSourceFingerprint` |
| Mapping + cells inputs | `lib/server/import-wizard/field-mapping-state.ts` — `getFieldMappingStateForBatch`; row cells from `import_batch_rows` inside service |
| Batch scope | `lib/server/import-wizard/import-batch-service.ts` — `getBatchByIdForCompany` |

### Rendering the row briefing detail UI

| Kind | Path |
|------|------|
| Client container | `components/import-wizard/briefing-review-container.tsx` — fetches queue + `GET` detail for `selectedRowId` |
| Presentational step | `components/import-wizard/steps/ai-briefing-review-step.tsx` — table, detail blocks, manual context panel |
| Step wrapper | `components/import-wizard/steps/brief-readiness-step.tsx` — mounts `BriefingReviewContainer` |
| View model | `lib/import-wizard/briefing-detail-model.ts` — `BriefingDetailView`, `BriefingQueueItemView` |
| Readiness labels (table) | `lib/import-wizard/briefing-readiness-v1.ts` — `briefingRowReadinessBadgeV1` |

### Approval / review state changes

| Kind | Path |
|------|------|
| Single approve | `PATCH` `app/api/exhibitor/import-wizard/batches/[batchId]/briefing-rows/[rowId]/route.ts` — `action: "approve"` → `approveBatchBriefingRow` |
| Bulk approve | `POST` `app/api/exhibitor/import-wizard/batches/[batchId]/briefing-rows/approve-all/route.ts` → `approveAllBatchBriefingRows` |
| Service writes | `lib/server/import-wizard/import-batch-briefing-service.ts` — `approveBatchBriefingRow`, `approveAllBatchBriefingRows` |

### Next / previous row navigation

| Finding |
|--------|
| **No** dedicated Next/Previous controls in code. Navigation is **row selection** via the queue **table** (`onSelectRow` / `selectedRowId` in `briefing-review-container.tsx`). Order matches `import_batch_rows.row_index` ascending (subject to queue cap in `loadBatchBriefingQueue`). |

### Manual context display / edit

| Kind | Path |
|------|------|
| PATCH | Same `briefing-rows/[rowId]/route.ts` — `action: "save_manual_context"` + `manualContext` body → `saveManualContextForBatchRow` |
| Types | `lib/import-wizard/briefing-content-json.ts` — `ImportBriefingManualContextV1`, `hasManualContextInStored` |
| UI | `ai-briefing-review-step.tsx` — slide-over form; read-back “Saved manual context” section when non-empty |

### Wizard step plumbing that could host “View Brief”

| Kind | Path |
|------|------|
| Step catalog | `lib/import-wizard/steps.ts` — `IMPORT_WIZARD_STEPS` (currently **no** `view_brief` id) |
| URL clamp | `lib/import-wizard/step-url.ts` — `MAX = 5` (steps `0…5` only) |
| Orchestration | `components/import-wizard/import-wizard-flow.tsx` — `displayStep` → step components |
| Footer | `components/import-wizard/wizard-footer-config.tsx` — `importWizardPath(n)` links |
| Page | `app/(app)/exhibitor/import/wizard/page.tsx` — renders `ImportWizardFlow` |

**Hooks / server actions:** No React hooks package for briefing; **no** server actions — only **Route Handlers** above.

---

## Current Single-Brief Data Model Actually Used

### `import_batches`

| Field | Read | Write | Role in detail flow |
|-------|------|-------|---------------------|
| `status` | `getBatchByIdForCompany` in `loadBatchBriefingDetail` / `loadBatchBriefingQueue` | — | Must be **`draft`** or loaders return null / throw `batch_not_draft` |
| `id`, `company_id` | Scoped fetch | — | Tenant + batch key |

### `import_batch_rows`

| Field | Read | Write | Role |
|-------|------|-------|------|
| `id` | Detail + queue | — | `batchRowId` |
| `batch_id` | Filter | — | FK |
| `row_index` | Queue ordering | — | Order + display fallbacks |
| `cells` | Parsed to `string[]` for derive + labels | — | Source for fingerprint + `deriveBriefingBlocksFromMappedRow` |

### `import_batch_field_mapping_state` (via `getFieldMappingStateForBatch`)

| Field | Read | Write | Role |
|-------|------|-------|------|
| `csv_headers`, `selections`, `custom_field_definitions` | Detail + queue | — | Mapping for `canonicalValueForRow` + fingerprint |

### `import_batch_row_briefings`

| Field | Read | Write | Role |
|-------|------|-------|------|
| `id` | Detail view `briefingRecordId` | Insert stub in `ensureBriefingRowsForBatch` | Record id |
| `batch_id`, `batch_row_id` | Filters | Insert | FKs |
| `content` | Parsed as `BriefingStoredContent`; merged/updated when fingerprint changes; manual context merged | **Update** on derive refresh; **update** on `saveManualContextForBatchRow` | JSONB: derived blocks + `meta` + optional manual fields + optional legacy keys |
| `approval_status` | Selected in `loadBatchBriefingQueue` (not in `BriefingDetailView`); selected in `loadBatchBriefingDetail` from DB but **not passed** into `buildBriefingDetailFromBatchRow` | **Update** on approve (to `approved`) | `pending` \| `approved` \| `needs_review` \| `failed` (DB check) |
| `reviewed_at`, `reviewed_by` | — | Set on approve | Audit |

---

## Current Single-Brief Source of Truth

| Question | Answer |
|----------|--------|
| **Persisted brief store per row** | **`import_batch_row_briefings`**, keyed by `batch_row_id` (one row per staged CSV row). |
| **Where rendered sections come from** | **`content` jsonb** after optional **derive-on-load** merge, then **`buildBriefingDetailFromBatchRow`** maps to `BriefingDetailView`. **Headline / company snapshot / whyHere / talking points** ultimately trace to **mapped `import_batch_rows.cells`** + **`import_batch_field_mapping_state`**; **manualContext** from `content.manualContext`. |
| **Persisted vs derived on load** | **Persisted:** `content` (including `manualContext`, optional `headline`, `questionsToAsk`, `competitorContext`, `signalsToWatch` if ever set). **Derived on GET detail** when `meta.sourceFingerprint` ≠ current fingerprint: `companySnapshot`, `whyHere`, `talkingPoints` replaced via `mergeBriefingBlocksIntoContent` and **written back** to `content`. |
| **Approval status in detail API** | Loaded from DB inside `loadBatchBriefingDetail` but **not** included in the returned `BriefingDetailView`. UI uses **`briefing-queue`** for per-row `approvalStatus`. |
| **New schema for View Brief v1?** | **Not required** for read-only or approve/manual-context parity: same tables and `content` shape suffice. Adding **`approval_status` (and optionally `reviewed_at`) to the detail JSON** would be a **response-shape** change only, not a DB migration. |

---

## View Brief Sections: Real vs Missing

Product names mapped to **current** data (honest mapping).

| Section | v1 honest? | Source | Persisted / derived / missing | Notes |
|---------|--------------|--------|------------------------------|--------|
| **Who They Are** | **Yes** | `BriefingDetailView.headline` + `companySnapshot` + implied person/title from mapping (`buildBriefingDetailFromBatchRow` uses canonical fields + stored snapshot) | Mixed: strings are **derived** from cells + stored snapshot; **persisted** after merge in `content` | Copy can rename UI labels to “Who they are”; no new logic required. |
| **Why They May Matter Here** | **Yes** | `whyHere` string array | **Derived** into `content` on refresh; **persisted** after merge | Current UI title: “Why they might be here”. Same data. |
| **Top Talking Points** | **Yes** | `talkingPoints` | **Derived**; **persisted** | — |
| **Questions to Ask** | **Weak / usually empty** | `questionsToAsk` | **Persisted** in `content` if present; **`deriveBriefingBlocksFromMappedRow` does not populate** | Default load: typically **empty** unless later tooling writes `questionsToAsk`. Section can show honest empty state or be omitted until populated. |
| **What We Still Don’t Know** | **No dedicated field** | — | **Missing** as a first-class block | There is no `gaps` / `unknowns` array in derive or `BriefingStoredContent`. **Optional v1:** honest composite: empty canonical optional columns, or **copy-only** framing of “limited to import data” — **not** a separate persisted section unless added to `content` or derive. |

---

## View Brief Actions: Real vs Fake

| Action | Wired? | Backend write | Reuse for View Brief v1? | Notes |
|--------|--------|---------------|---------------------------|--------|
| **Approve** | **Yes** | `import_batch_row_briefings`: `approval_status`, `reviewed_at`, `reviewed_by` | **Yes** | `PATCH` `action: "approve"`. |
| **Approve all** | **Yes** | Same table, all rows in batch | **Yes** | `POST` `approve-all`. |
| **Reject / set needs_review** | **No** | — | **No API** | DB allows `needs_review`; **no** route sets it. Would need new `PATCH` action + service or remove from UX. |
| **Save manual context** | **Yes** | `content` jsonb merge | **Yes** | `PATCH` `save_manual_context`. |
| **Save notes** (generic) | **Same as manual context** | `content.manualContext` fields (e.g. `internalNotes`) | **Yes** | No separate “notes” table. |
| **Edit briefing sections** (structured) | **No** | — | **No** | No PATCH to edit `talkingPoints` / `whyHere` without going through derive or custom merge. |
| **Regenerate** | **Removed in v1 Readiness** | — | **N/A** | Deterministic refresh happens on **GET detail** when fingerprint changes — not a user “Regenerate” button. |
| **Next / previous row** | **No dedicated control** | — | **Reuse pattern** | Use **queue order** + `selectedRowId` state; add buttons that increment index in client (no new API if queue already loaded). |
| **Mark as ready** | **Not distinct** | — | Treat as **approve** or **pending** only | No separate flag. |

---

## Can View Brief v1 Be Built Now?

**Yes**, as a **dedicated step** that reuses the **same** `BriefingDetailView` pipeline and APIs, with these facts explicit:

| Aspect | Assessment |
|--------|----------------|
| **Reuse as-is** | `GET`/`PATCH` `briefing-rows/[rowId]`, `GET` `briefing-queue`, `loadBatchBriefingDetail`, `buildBriefingDetailFromBatchRow`, `BriefingReviewContainer` data-loading pattern, `AiBriefingReviewStep` section rendering (or extract presentational parts). |
| **Small refactor** | Split **“list + table + bulk”** from **“single-row focus”** UI: extract a **view-brief** presentational component that takes `detail`, `queue`, `selectedRowId`, callbacks — or duplicate thin wrapper to avoid breaking Brief Readiness. |
| **Wizard** | Insert step requires **`IMPORT_WIZARD_STEPS` + 1**, **`step-url` MAX**, **`import-wizard-flow`**, **`wizard-footer-config`**, **`STEP_SUBTITLES`** updates — mechanical, not architectural. |
| **Blocked** | **Reject/needs_review** write path **missing**. **Questions to Ask** usually empty without new derive or editorial input. **“What we still don’t know”** has **no** dedicated data unless you derive heuristics or extend `content`. |

---

## Smallest Possible Prompt 4 Plan

1. **Add one wizard step** between current Brief Readiness (`4`) and Import (`5`): e.g. `view_brief` at index `5`, shift **Import** to index `6`; update `lib/import-wizard/steps.ts`, `step-url.ts`, `import-wizard-flow.tsx`, `wizard-footer-config.tsx`, subtitles.
2. **Reuse without rewriting services:** Keep `briefing-queue` + `briefing-rows` GET/PATCH as the only data layer for draft batches.
3. **UI:** New thin page component (e.g. `view-brief-step.tsx`) that **reuses** `BriefingReviewContainer` **or** factors shared **single-row detail** from `ai-briefing-review-step.tsx` into a shared module — **smallest path:** mount a variant prop on the existing step component (`mode: "readiness" | "view_brief"`) to hide table/bulk and show **prev/next** using in-memory queue order.
4. **Client next/prev:** Implement with existing `queue` array from `briefing-queue` — **no new API**.
5. **Optional minimal API tweak (no migration):** Extend `GET` detail JSON to include **`approval_status`** (and maybe `reviewed_at`) so a View Brief screen does not depend on merging queue + detail — **small refactor** in `loadBatchBriefingDetail` + `BriefingDetailView`.
6. **Fake / misleading:** Do not add Regenerate/LLM; keep approve + manual context only unless **needs_review** PATCH is implemented.
7. **Schema:** **None** required for v1 if product accepts current `content` + approval fields as-is.

---

*End of audit.*
