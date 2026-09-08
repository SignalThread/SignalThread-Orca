# Briefing → Separate Route: Rollback & Refactor Handoff

_Audit only — no implementation._

---

## 1. Wizard Insertion Files

These are the exact files where briefing was wired into the import wizard stepper:

| File | What was inserted |
|---|---|
| `lib/import-wizard/steps.ts` | `brief_readiness` (index 4) and `view_brief` (index 5) added to `IMPORT_WIZARD_STEPS`; `IMPORT_WIZARD_STEP_COUNT` raised from 5 → 7; `ImportWizardStepId` union expanded. |
| `lib/import-wizard/step-url.ts` | `MAX` raised from 4 → 6 to allow `?step=5` and `?step=6`. |
| `components/import-wizard/import-wizard-flow.tsx` | Imports `BriefReadinessStep` and `ViewBriefStep`; renders them at `displayStep === 4` and `displayStep === 5`; `PublishStep` moved from `displayStep === 4` to the else branch (index 6); `STEP_SUBTITLES` expanded with entries 4, 5, 6 (was 0–4). |
| `components/import-wizard/wizard-footer-config.tsx` | `displayStep === 4` (brief readiness footer), `displayStep === 5` (view brief footer) added; publish footer moved from `displayStep === 4` to `displayStep === 6`; all back-links in publish footer point to `importWizardPath(5)`. |
| `components/import-wizard/import-wizard-shell.tsx` | No direct briefing code, but renders `IMPORT_WIZARD_STEPS` — affected indirectly (stepper shows 7 dots). |

### Tests that assert briefing step indexes

| Test file | Assertions that will break on rollback |
|---|---|
| `tests/publish-step-batch-backed.test.ts` | Lines 118–135: asserts `BriefReadinessStep` and `ViewBriefStep` in flow, `displayStep === 5`, `importWizardPath(5)` in footer. |
| `tests/view-brief-v1-wizard.test.ts` | Lines 13–28: asserts `IMPORT_WIZARD_STEPS.length === 7`, `[4].id === "brief_readiness"`, `[5].id === "view_brief"`, `displayStep === 5`. |

---

## 2. Minimum Rollback Surface

Restore the wizard to a **5-step** import flow: Source → Mapping → Enrichment → Validation → Import.

| # | File | Change |
|---|---|---|
| 1 | `lib/import-wizard/steps.ts` | Remove `brief_readiness` and `view_brief` from `IMPORT_WIZARD_STEPS`; set `IMPORT_WIZARD_STEP_COUNT = 5`; remove those two members from `ImportWizardStepId`. Steps become: 0 Source, 1 Mapping, 2 Enrichment, 3 Validation, 4 Import. |
| 2 | `lib/import-wizard/step-url.ts` | `MAX = 4` (was 6). |
| 3 | `components/import-wizard/import-wizard-flow.tsx` | Remove `BriefReadinessStep` and `ViewBriefStep` imports; remove `displayStep === 4` (brief readiness) and `displayStep === 5` (view brief) branches; make PublishStep the `displayStep === 4` branch (was else/6); update `STEP_SUBTITLES` to 0–4 (drop entries 4, 5 → move old entry 6 to new entry 4). |
| 4 | `components/import-wizard/wizard-footer-config.tsx` | Remove `displayStep === 4` (brief readiness) and `displayStep === 5` (view brief) blocks; renumber publish to `displayStep === 4`; publish back-link → `importWizardPath(3)` (Validation); Validation continue → `importWizardPath(4)` (Import). |
| 5 | `tests/publish-step-batch-backed.test.ts` | Remove/update the `BriefReadinessStep`/`ViewBriefStep` assertions (lines 24–26, 117–135); update `importWizardPath(5)` assertions to `importWizardPath(3)`. |
| 6 | `tests/view-brief-v1-wizard.test.ts` | **Move** step-index assertions or **delete** them (they test wizard integration, not briefing logic). Keep the `BriefingDetailView.approvalStatus` unit test — it doesn't depend on wizard indexes. |

**Total: 6 files.** No API routes. No server logic. No schema. No lib data files.

---

## 3. Reusable Briefing Assets (keep as-is)

### Components — ready for standalone route

| File | What it does | Wizard coupling |
|---|---|---|
| `components/import-wizard/steps/brief-readiness-step.tsx` | Thin wrapper → `BriefingReviewContainer` | Props: `batchId`, `batchDataRevision` — **no wizard dependency** |
| `components/import-wizard/briefing-review-container.tsx` | Queue + detail + approve/bulk-approve/save-manual orchestration via batch APIs | **No wizard dependency** — needs `batchId`, `batchDataRevision`, `onAllApprovedChange` |
| `components/import-wizard/steps/ai-briefing-review-step.tsx` | Presentational grid: queue list + detail panel | **No wizard dependency** — pure render props |
| `components/import-wizard/steps/view-brief-step.tsx` | Single-row brief viewer + manual context panel | One hardcoded `importWizardPath(4)` "← Back to Brief Readiness" link — **trivial to swap** |
| `components/import-wizard/import-briefing-view-sections.tsx` | Renders `BriefingDetailView` sections | **No wizard dependency** |

### Lib — fully reusable

| File | Purpose |
|---|---|
| `lib/import-wizard/briefing-detail-model.ts` | `BriefingDetailView`, `BriefingQueueItemView`, `BriefingApprovalStatus` types |
| `lib/import-wizard/briefing-content-json.ts` | `BriefingStoredContent`, `ImportBriefingManualContextV1`, parse/serialize |
| `lib/import-wizard/briefing-blocks-derive.ts` | Deterministic block derivation from mapped row |
| `lib/import-wizard/briefing-quality-placeholders.ts` | Quality score placeholders |
| `lib/import-wizard/briefing-readiness-v1.ts` | Row readiness label from identity + approval |
| `lib/import-wizard/briefing-source-fingerprint.ts` | Content fingerprint for stale detection |
| `lib/import-wizard/build-briefing-detail.ts` | Build `BriefingDetailView` from raw data |
| `lib/import-wizard/build-briefing-detail-from-batch-row.ts` | Same, from batch row + mapping |
| `lib/import-wizard/batch-briefing-gate.ts` | `allBriefingsApproved` gate (used by readiness step, not by publish) |
| `lib/server/import-wizard/import-batch-briefing-service.ts` | `loadBatchBriefingQueue`, `saveManualContext`, `approveBriefingRow`, etc. |

### API Routes — keep, they are batch-scoped, not wizard-scoped

| Route | Verb | Purpose |
|---|---|---|
| `.../batches/[batchId]/briefing-queue/route.ts` | GET | Queue for a batch |
| `.../batches/[batchId]/briefing-rows/[rowId]/route.ts` | GET, PATCH | Detail + approve/save |
| `.../batches/[batchId]/briefing-rows/approve-all/route.ts` | POST | Bulk approve |

### Tests — keep (unit tests on lib, not wizard-index tests)

| File | Keep? | Note |
|---|---|---|
| `tests/import-batch-briefing-gate.test.ts` | Yes | Tests gate logic |
| `tests/build-briefing-detail-from-batch-row.test.ts` | Yes | Tests detail builder |
| `tests/briefing-source-fingerprint.test.ts` | Yes | Tests fingerprint |
| `tests/briefing-blocks-derive.test.ts` | Yes | Tests block derivation |
| `tests/brief-readiness-v1.test.ts` | Yes | Tests row readiness labels |
| `tests/briefing-rls-exhibitor-admin.test.ts` | Yes | RLS integration |
| `tests/view-brief-v1-wizard.test.ts` | **Edit** | Drop step-index assertions; keep `BriefingDetailView.approvalStatus` unit test |

---

## 4. Recommended Separate Route Shape

Smallest pattern using current architecture:

```
/exhibitor/import/[batchId]/briefings          → Brief Readiness (queue + approve)
/exhibitor/import/[batchId]/briefings/view      → View Brief (single-row walk-through)
```

**Why this works:**
- `batchId` is the only context both pages need. Today they receive it as a prop from the wizard; in a standalone page it comes from the URL param.
- `batchDataRevision` can be loaded from `GET .../active-draft` or a new lightweight `GET .../batches/[batchId]/summary` endpoint (one Supabase select).
- Both components (`BriefReadinessStep`, `ViewBriefStep`) accept `batchId` + `batchDataRevision` as their only required props — no wizard state.
- Navigation between the two pages and back to the wizard/leads list uses normal `<Link>` instead of step indexes.
- The API routes stay at their current paths (batch-scoped, not wizard-scoped).

**What the page files look like:** Two thin `page.tsx` server components that resolve session → load batch summary → render the existing client component with `batchId` + `batchDataRevision` props. The `ViewBriefStep` link from `importWizardPath(4)` changes to the new briefings route.

---

## 5. Risks / Dependencies

| Risk | Detail | Mitigation |
|---|---|---|
| **Hardcoded step indexes in tests** | `tests/publish-step-batch-backed.test.ts` and `tests/view-brief-v1-wizard.test.ts` assert specific step numbers. | Update assertions in same PR. |
| **Publish-step briefing stats** | `publish-readiness/route.ts` returns `briefingRowsApproved`/`briefingRowsNotApproved`; `publish-step.tsx` renders them. | Keep — informational only, does not assume briefing is a wizard step. No change needed. |
| **`view-brief-step.tsx` hardcoded back-link** | `importWizardPath(4)` → "← Back to Brief Readiness". | Swap to new standalone route href when creating the separate page. |
| **Leads page `prepareBriefings` query param** | `exhibitorLeadsAfterImportHref` sets `prepareBriefings=1`; leads page shows a hint. | Keep — it's a soft hint on the leads page, not a wizard step dependency. Optionally update the hint text or href to point to the new standalone briefing route. |
| **`STEP_SUBTITLES` in flow** | Keyed by numeric index — must be re-keyed to 0–4. | Covered by rollback item 3. |
| **`isImportWizardStepIndex` type guard** | Currently typed `0 | 1 | 2 | 3 | 4 | 5 | 6` — must become `0 | 1 | 2 | 3 | 4`. | Covered by rollback item 1 (steps.ts). |

---

## 6. Smallest Possible Refactor Prompt

> **Prompt 2: Move briefing out of the import wizard stepper**
>
> Goal: Restore the import wizard to a 5-step flow (Source → Mapping → Enrichment → Validation → Import) and host briefing as a separate batch-scoped route. Preserve all working briefing code.
>
> **Part A — Wizard rollback (6 files):**
> 1. `lib/import-wizard/steps.ts` — remove `brief_readiness` and `view_brief`; `STEP_COUNT = 5`; `MAX` step index = 4.
> 2. `lib/import-wizard/step-url.ts` — `MAX = 4`.
> 3. `components/import-wizard/import-wizard-flow.tsx` — remove `BriefReadinessStep` / `ViewBriefStep` imports and render branches; PublishStep at `displayStep === 4`; update `STEP_SUBTITLES` (entries 0–4).
> 4. `components/import-wizard/wizard-footer-config.tsx` — remove steps 4/5 briefing blocks; publish at `displayStep === 4`; publish back → `importWizardPath(3)`.
> 5. `tests/publish-step-batch-backed.test.ts` — remove BriefReadinessStep/ViewBriefStep assertions; update step-index checks.
> 6. `tests/view-brief-v1-wizard.test.ts` — remove step-index assertions; keep approval-status unit test.
>
> **Part B — Standalone briefing route (2 new page files, 1 edit):**
> 1. `app/(app)/exhibitor/import/[batchId]/briefings/page.tsx` — server component: resolve session, load batch, render `<BriefReadinessStep batchId={…} batchDataRevision={…} />`.
> 2. `app/(app)/exhibitor/import/[batchId]/briefings/view/page.tsx` — same pattern, render `<ViewBriefStep … />`.
> 3. `components/import-wizard/steps/view-brief-step.tsx` — change `importWizardPath(4)` back-link to `/exhibitor/import/${batchId}/briefings`.
>
> **Do not touch:** API routes, lib/server services, publish-step briefing stats, materialization, publish contract.
>
> **Tests:** Run `npm run typecheck && npm run test:publish-v1 && npm run test:import-briefing`. All must pass.
