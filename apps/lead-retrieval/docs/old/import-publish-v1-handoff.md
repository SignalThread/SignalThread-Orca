# Import Flow — Publish Step Audit (Handoff for Prompt 6)

**Source of truth:** Current repo as of this audit. **No implementation.** **No new architecture.**

**Context:** The wizard ends with **Import leads** at **step index 6** (`displayStep === 6` → `PublishStep`), after **Brief Readiness** (4) and **View Brief** (5).

---

## Current Publish Files

### Loading the final publish / import screen

| Kind | Path |
|------|------|
| Page shell | `app/(app)/exhibitor/import/wizard/page.tsx` → `components/import-wizard/import-wizard-flow.tsx` |
| Publish UI | `components/import-wizard/steps/publish-step.tsx` |
| Readiness API | `GET` `app/api/exhibitor/import-wizard/batches/[batchId]/publish-readiness/route.ts` |
| Batch lookup | `lib/server/import-wizard/import-batch-service.ts` — `getBatchByIdForCompany` |
| Row matrix | `lib/server/import-wizard/import-batch-rows-service.ts` — `getCellsMatrixForBatch` |
| Mapping | `lib/server/import-wizard/field-mapping-state.ts` — `getFieldMappingStateForBatch` |
| Validation derive | `lib/import-wizard/import-batch-validation-derive.ts` — `deriveImportBatchValidation` |

### Computing publish readiness / validation (for this screen)

| Kind | Path |
|------|------|
| Server | `publish-readiness/route.ts` — counts `import_batch_rows`, runs `deriveImportBatchValidation` on staged matrix + mapping |
| Client gate | `publish-step.tsx` — `blocked = data.totalRows === 0 \|\| data.rowsWithMustFix > 0` → `onImportGateChange` for footer |

### Executing publish

| Kind | Path |
|------|------|
| Client | `import-wizard-flow.tsx` — `handleImportLeads` → `POST` `/api/exhibitor/import-wizard/batches/{batchId}/complete` with `{ action: "publish" }` |
| Route | `app/api/exhibitor/import-wizard/batches/[batchId]/complete/route.ts` |
| Service | `lib/server/import-wizard/import-batch-service.ts` — `completeImportBatch` |

### Materializing `public.leads`

| Kind | Path |
|------|------|
| Service | `lib/server/import-wizard/publish-leads-materialization.ts` — `materializeImportedLeadsFromBatch` |
| Called from | `completeImportBatch` **after** `import_batches` is updated to `published` |

### Final-step navigation and footer

| Kind | Path |
|------|------|
| Footer | `components/import-wizard/wizard-footer-config.tsx` — `displayStep === 6`: back `importWizardPath(5)` (View Brief), continue triggers `onImport` → publish, or disabled when `importBlocked` |
| Flow state | `import-wizard-flow.tsx` — `publishPhase`, `importBlocked`, `importedLeadCount`, `handleImportLeads` |

**Hooks / server actions:** No dedicated hooks; **no** server actions — **Route Handlers** only.

---

## Current Publish Data Model Actually Used

### `import_batches`

| Field | Read | Write | Role in publish |
|-------|------|-------|-----------------|
| `id`, `company_id` | `getBatchByIdForCompany`, materialization check | — | Scope |
| `status` | Readiness + `completeImportBatch` pre-check | **`draft` → `published`** (publish) or **`discarded`** (discard) | Gate + terminal state |
| `published_at` | — | Set on publish | Timestamp |
| `discarded_at` | — | Set on discard | Timestamp |
| `data_revision` | Returned in publish-readiness JSON | — | Display only on publish screen (`PublishReadinessData.dataRevision`) |

### `import_batch_rows`

| Field | Read | Write | Role |
|-------|------|-------|------|
| (count) | `publish-readiness` — `count` on `batch_id` | — | `totalRows` |
| `cells` (via matrix) | `getCellsMatrixForBatch` | — | Validation derive + materialization |

### `import_batch_field_mapping_state`

| Field | Read | Write | Role |
|-------|------|-------|------|
| `csv_headers`, `selections` | publish-readiness + materialization | — | Validation + column mapping |

### `import_batch_row_briefings`

| | |
|--|--|
| **Not read or written** by `completeImportBatch`, `publish-readiness`, or `materializeImportedLeadsFromBatch`. |

### `public.leads`

| Field | Read | Write | Role |
|-------|------|-------|------|
| Core + mapped-derived columns | — | **Insert** per eligible staged row in `materializeImportedLeadsFromBatch` | Materialized leads |
| `owner_user_id` | — | Set to session user on publish | From `completeImportBatch` opts |

**`lead_briefings`:** Present in `types/database.ts`; **no** `from('lead_briefings')` usage in application TS/TSX (types/comments only).

---

## Current Publish Source of Truth

| Question | Answer |
|----------|--------|
| **Parent table for publish** | **`import_batches`** — must be **`draft`** to call `completeImportBatch`; then becomes **`published`** or **`discarded`**. |
| **What changes on publish** | **`import_batches`:** `status`, `published_at` (publish) or `discarded_at` (discard). **`public.leads`:** one insert per staged row that passes **`rowHasUsableIdentityPath`** in materialization (skipped rows are not inserted). **`import_batch_row_briefings`:** unchanged by publish path. |
| **Does publish write only to `leads`?** | **No** — it also **updates `import_batches`**. It does **not** write to `import_batch_row_briefings` or `lead_briefings`. |
| **Does briefing content survive in an operationally usable way?** | **Not in this path.** Draft briefs live on **`import_batch_row_briefings`** while the batch is **`draft`**. After publish, batch is **`published`**; existing briefing **GET** loaders require **`draft`** (`batch_not_draft` / 404). **No** copy of `content` into **`lead_briefings`** or link from **`leads`** to batch rows in materialization code. |

---

## Publish Screen: Real vs Fake

### Pre-import (`PreImport`)

| Element | Real / misleading |
|---------|-------------------|
| `totalRows`, `rowsWithMustFix`, `rowsWithIdentity`, `batchStatus`, `dataRevision` | **Real** — from `publish-readiness` + `deriveImportBatchValidation`. |
| **Blocked** when `totalRows === 0` or `rowsWithMustFix > 0` | **Real** — matches client `blocked` and footer `importBlocked`. |
| **“Leads ready to import”** (`rowsWithIdentity`) | **Real** as **count of rows not in the must-fix bucket** (see `publish-readiness` math: `totalRows - rowsWithMustFix`). |
| Copy: draft briefings reviewed on “previous step” | **Marketing** — not enforced by server. |
| **No** briefing approval counts, **no** “all rows approved” gate | **Honest gap** — server does not check approvals. |

### Publishing phase

| Element | Real |
|---------|------|
| “Importing leads…” | **Real** state while `POST /complete` in flight. |

### Post-success (`ImportSuccess`)

| Element | Real / misleading |
|---------|-------------------|
| Headline count | **`importedLeadCount`** from publish API when present; else falls back to **`data.rowsWithIdentity`** — can **differ** from actual inserts if materialization skips/fails rows (`importedCount` = successful inserts only). |
| **Preview table** (`GET /api/exhibitor/leads`, first **8**) | **Not guaranteed “this import only”** — list is **workspace leads**, not filtered by `batchId`. Subcopy “what just landed” can be **misleading** if other leads exist. |
| Links with `importSuccess`, `importBatchId`, `imported` query params | **Real** URLs via `exhibitorLeadsAfterImportHref` — behavior on leads page is **out of scope** for this audit. |
| **“Prepare Lead Briefings”** | **Navigation only** — does not assert brief pipeline is wired post-publish. |

### For Publish v1

| Keep | Revisit |
|------|---------|
| Readiness banner + two metric tiles driven by **publish-readiness** | Success **preview** copy/behavior if “this batch” is required |
| `blocked` logic aligned with validation | Copy that implies **mandatory** brief review if not enforced |
| `importedCount` from API when shown | Fallback `rowsWithIdentity` vs true **`importedCount`** — document or always prefer API count |

---

## Approval vs Publish: Current State

| Question | Answer |
|----------|--------|
| **Does publish care about `import_batch_row_briefings.approval_status`?** | **No.** `completeImportBatch` and `materializeImportedLeadsFromBatch` do **not** query briefing rows. |
| **Disconnect** | Approvals are **only** enforced in **UX** (Brief Readiness / View Brief). **Publish** only cares about **validation** (`rowsWithMustFix`, etc.), not approvals. |
| **Publish v1: surface approved vs not without blocking?** | **Possible** with a **read-only** aggregate (e.g. count non-`approved` in `import_batch_row_briefings` for the batch) — **new small query or extend publish-readiness** — without blocking import, if product wants **honest disclosure**. |
| **Smallest truthful v1** | **Either** state in copy that import does not require all briefs approved **or** add **optional** non-blocking summary counts from DB — **no** change to `completeImportBatch` required for honesty. |

---

## Brief Survival After Publish: Current State

| Question | Answer |
|----------|--------|
| **Where can the app get a brief after publish?** | **Not** from `import_batch_row_briefings` via current briefing **GET** routes while batch is non-draft. **Not** from `lead_briefings` in app code (unused). **Lead rows** in `public.leads` **do not** store briefing JSON in materialization. |
| **`lead_briefings` used?** | **No** in application queries (schema/types only). |
| **Blocker for operational post-publish briefs** | **(1)** Batch **not** `draft` → briefing APIs **reject**. **(2)** **No** migration of `import_batch_row_briefings.content` to **`lead_briefings`** or attachment to **`leads`**. **(3)** **No** `import_batch_row_id` (or similar) on **`leads`** in materialization. |

---

## Smallest Possible Prompt 6 Plan

**Goal:** **Publish v1** — honest final step, minimal change, reuse existing APIs.

1. **Reuse as-is**  
   - `publish-step.tsx` structure, `publish-readiness` API, `POST .../complete`, `completeImportBatch`, `materializeImportedLeadsFromBatch`.  
   - Footer wiring in `wizard-footer-config.tsx` + `import-wizard-flow.tsx`.

2. **Copy / UI honesty (likely no schema)**  
   - Align pre-import copy with server: **import does not check brief approvals**; clarify what “materializes” ( **`leads`** only).  
   - Post-success: label preview as **recent workspace leads** or **remove** table if batch-specific preview is required but not available without API work.

3. **Optional small API extension (only if needed for v1)**  
   - Extend **`publish-readiness`** JSON with **non-blocking** briefing stats (e.g. `rowsNotApproved`, `rowsWithBriefRecord`) from `import_batch_row_briefings` — **read-only**, **no** change to `completeImportBatch`.  
   - **Or** add **`importedCount` always** in client display path and avoid fallback confusion.

4. **Do not do in smallest scope**  
   - **No** `lead_briefings` activation unless explicitly in scope later.  
   - **No** blocking publish on approvals unless product mandates **and** server is updated together.

5. **Schema**  
   - **None** required for an honest Publish v1 that only improves **copy**, **counts disclosure**, and **success preview labeling**.  
   - **Only** if product requires **durable** post-publish briefs: separate prompt (copy to `lead_briefings` or FK) — **out of smallest Publish v1**.

---

*End of audit.*
