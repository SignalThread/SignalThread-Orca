# Dead-Code Inventory — Production Readiness Pass

_Last reviewed: 2026-07-04 (branch `chore/production-readiness-audit`)._

This inventory records the confirmed-dead / orphaned code found during the
production-readiness sweep, the caller analysis behind each verdict, and the
recommended disposition. **Only one item was auto-removed this pass** (see
"Removed"); everything else is retained deliberately because it is either a
documented-disabled stub, self-annotated as intentionally kept, covered by a
route-guard regression test that reads its source (so removal is a multi-file
change), or a Matrix route that the loop rules protect from deletion.

## Removed this pass

| Path | Reason |
|------|--------|
| `web/src/hooks/use-autosave.ts` | Repo-wide search for `use-autosave` / `useAutosave` returned only the definition — zero imports, zero usages, no tests, no barrel re-export. Pure orphaned client hook. |

## Retained — keep as-is

| Path | Classification | Why kept |
|------|----------------|----------|
| `web/app/api/events/[eventId]/documents/upload-local/route.ts` | Documented-disabled stub | Deliberately returns HTTP 410 with a message pointing callers to the R2 presign route. Intentional "gone" marker, not dead code. |
| `web/app/api/events/[eventId]/budget/{submit,approve,reject,revise}/route.ts` | Legacy, self-annotated "retained for now" | Each file's header comment declares itself UI-orphaned and points to the canonical submission routes (`budget/submissions[/:submissionId]/{approve,reject,pullback}`). No client `fetch` callers. Covered by `budget-access-hardening-regression.test.ts`. Removal is a deliberate product/cleanup decision, not an auto-delete. |

## Orphaned but retained — candidate for a later, deliberate cleanup

These are **functional** routes/pages with **no runtime caller** (no client
`fetch`, `<Link>`, router push, cron, or e2e). They were NOT removed this pass
because each is covered by a route-guard regression test that `readFileSync`s
the route source (deleting the route would break the test), and/or is
Matrix-related. Removing any of them is a follow-up that must also update the
corresponding test.

| Path | No-caller evidence | Blocking follow-up |
|------|--------------------|--------------------|
| `web/app/api/room-set/interpret-intent/route.ts` | Room-set workspace only calls the sibling `/api/room-set/plan-layout`; no `fetch` to `interpret-intent`. | Confirm no Copilot/AI dynamic invocation before removing; also remove its service. |
| `web/app/api/events/[eventId]/matrix-rows/[rowId]/duplicate/route.ts` (+ `duplicateMatrixRow` in `web/lib/matrix.ts`) | Standalone matrix page duplicates rows **client-side**; no `fetch` to the duplicate endpoint. | Route-guard test `wave2-route-auth-hardening-regression.test.ts:111` reads the source. Matrix route — loop rules require explicit confirmation. |
| `web/app/api/events/[eventId]/fnb-catalog/parser-feedback/route.ts` | No client `fetch`/UI component references parser-feedback. | Route-guard test `wave2-route-auth-hardening-regression.test.ts:50`. |
| `web/app/api/events/[eventId]/directory/people/[personId]/merge/route.ts` (+ `mergeEventDirectoryPeople`) | No client `fetch` to the merge endpoint. | `event-directory-routes-regression.test.ts` reads the source. Directory merge may be a planned feature. |
| `web/app/api/events/[eventId]/tasks/[taskId]/links/route.ts` (+ `linkTaskToObject`) | Task links are sent inline in the create payload; the only `/links` client `fetch` targets the **budget** line-item links route. | `tasks-api-routes-regression.test.ts` reads the source. |
| `web/app/api/events/[eventId]/speaker-submissions/route.ts` (base GET → `listPendingSpeakerSubmissions`) | UI fetches the per-speaker submission and the `[submissionId]/{approve,reject}` actions, never the event-level list GET. | Likely intended for a planner review-list surface not yet wired. Sibling action routes ARE live — do not touch those. |
| `web/app/(shell)/matrix/page.tsx` (standalone Matrix board) | Nav "matrix" tab resolves via `tabHref` to the event-scoped `/events/[eventId]/matrix`; nothing links to top-level `/matrix`. | Legacy Matrix surface — loop rules forbid deleting legacy Matrix routes without explicit confirmation; also owns a client component subtree. |

## Recommended next step

Batch the "orphaned but retained" removals into a single dedicated cleanup PR
that (a) deletes each route + its now-unused service function, and (b) updates
the route-guard regression tests that currently assert those files exist. Get
explicit product sign-off for the legacy budget-level routes and the two
Matrix-related items before deletion.
