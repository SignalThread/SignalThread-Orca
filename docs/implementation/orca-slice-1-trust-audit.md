# OrcaOS Slice 1A — Trust and Data-Integrity Audit

**Audit date:** 2026-07-29
**Repository:** `/Users/sarahmeister/Developer/planner-os`
**Branch:** `feature-updates-initial-demos`
**Scope:** source audit only. No application, Prisma, migration, seed, auth, RBAC, dependency, configuration, or F&B model changes were made.

## Executive summary

The highest-risk defect is an event-isolation failure in the server-rendered event shell. `web/app/(shell)/events/[eventId]/layout.tsx` and the event detail page load event-scoped data by URL identifier without resolving the request user or calling `assertEventAccessForUser`. The same unauthenticated-by-caller pattern is used by the shared event header loader and is therefore relevant to every event-shell child route, including F&B Catalog, Marketing, Voice, and the command center.

Other confirmed defects:

- event import creation is not safe to retry and can create duplicate event workspaces;
- speaker import duplicate detection is request-local and can race with concurrent imports;
- command-center approval and room metrics can disagree with the detail/readiness metrics they summarize;
- missing optional tables are converted to zero/empty values without an explicit unavailable state;
- speaker detail and F&B catalog clients can treat failed or malformed successful responses as empty, loaded data;
- additional document upload failure after event creation leaves a created workspace with an incomplete post-create workflow and relies on UI retry rather than a server-verifiable import result.

No confirmed high-risk defect was found in the current account/portfolio dashboard access query, timeline service access checks, directory service event scoping, speaker service event scoping, F&B session cross-event checks, destructive-action confirmation modals, or the explicit “AI Workspace / contracts / catering” implementation boundary. Those areas still need regression coverage noted below.

## Working-tree and source-of-truth checks

- Current branch: `feature-updates-initial-demos`.
- HEAD: `49b8470b docs: establish Orca immediate implementation baseline`.
- Recent commits inspected: the Slice 0 baseline, AI Workspace documentation, and the latest mainline command-center/import work.
- Working tree at audit start: clean; no modified or untracked files; no unrelated work was present.
- `docs/DB_SCHEMA_LOCKED.md` and matching variants are absent. The current equivalent is `docs/PROJECT_CONTEXT.md` plus `docs/SCHEMA_GUARDRAILS.md` / JSON.
- `docs/RBAC_MATRIX.json` is an older, medium-confidence audit and was checked against current route/service source rather than treated as authoritative.
- AI Workspace has product discovery documentation but no source page/API/service/model. Contracts and catering have no first-class current route/model; document, budget, and F&B surfaces must not be described as those shipped modules.

## Findings

### TA-01 — Event shell and server-rendered command center bypass event authorization

- **Route/component:** `/events/:eventId` and every child route under the event shell; server-rendered command center page.
- **Exact files and symbols:** `web/app/(shell)/events/[eventId]/layout.tsx` `EventLayout`; `web/lib/event-loaders.ts` `getEventHeaderById`; `web/app/(shell)/events/[eventId]/page.tsx` `EventDetailPage`; `web/src/server/services/event-command-center.ts` `getEventCommandCenter` / `assertCommandCenterAccess`.
- **Observed behavior:** `EventLayout` calls `getEventHeaderById(eventId)` with no request user. `getEventHeaderById` queries `event.findUnique({ where: { id: eventId } })` and returns event header data. `EventDetailPage` calls `getEventCommandCenter(eventId)` without a user. `assertCommandCenterAccess` explicitly returns when `user` is absent. The event API route is guarded, but these server-component paths are not.
- **Expected behavior:** Resolve the current request user and require read access for the event before returning any event header, command-center, or child-shell data. A user outside the active organization or without event membership must receive a denial/not-found response and no event data.
- **Severity:** Critical / P0 trust boundary.
- **Event isolation or authorization:** Yes — both event isolation and authorization.
- **Persisted data involved:** Read exposure of persisted Event, MatrixRow, TimelineItem, BudgetLineItem, Document, Speaker, deadline, activity, and related records.
- **Database change required:** No for the smallest fix.
- **Smallest safe fix:** Make the server layout/page resolve the request user and call `assertEventAccessForUser(eventId, user, "read")`, or make an equivalent authenticated loader mandatory. Remove the optional unauthenticated access path for page-rendered command-center data. Preserve the existing API route guard.
- **Recommended test:** Access journey with two organizations and two events: request `/events/foreignEventId` and assert denial/no foreign event title, then request an authorized event and assert the shell still renders. Add a source regression that rejects calling `getEventHeaderById` from a request path without an access context.

### TA-02 — Command-center approval KPI excludes pending budget submissions

- **Route/component:** `/events/:eventId` command center, Approval Center/KPI widgets.
- **Exact files and symbols:** `web/src/server/services/event-command-center.ts` `getEventCommandCenter`; lines constructing `approvalsPayload` and the returned `event.KPIs.approvals`; `web/app/(shell)/events/[eventId]/_components/event-dashboard-widget-renderer.tsx` `ApprovalCenterWidget`.
- **Observed behavior:** `approvalsPayload` combines `documentsInReview` and `budgetSubmissionsInReview`, and the operational-readiness detail displays their sum. The returned KPI sets `approvals: documentsInReview.length`. The command-center KPI therefore reports fewer approvals than the Approval Center list/detail when submitted budget work exists.
- **Expected behavior:** Every approval count and label should use the same canonical pending-review set as the detail widget, with an explicit distinction if a KPI intentionally counts documents only.
- **Severity:** High / P1 decision-support integrity.
- **Event isolation or authorization:** No direct gap confirmed; all current queries carry `eventId` or `budget.eventId`.
- **Persisted data involved:** Yes — `Document` and `BudgetSubmission` status records.
- **Database change required:** No.
- **Smallest safe fix:** Derive `KPIs.approvals` from the same pending approval collection used by `approvalsPayload`, and add a semantic name if a document-only metric is still needed.
- **Recommended test:** Create one in-review document and one submitted budget submission for an event; assert KPI count, readiness detail, Approval Center total, and detail-view count all equal two.

### TA-03 — Command-center room status uses room count while readiness uses session coverage

- **Route/component:** `/events/:eventId` command center, room status and Session Readiness widgets.
- **Exact files and symbols:** `web/src/server/services/event-command-center.ts` `getEventCommandCenter`; room query at `prisma.room.count({ where: { eventId } })`; returned `operations.roomStatus`; `event.sessionReadiness.roomsAssigned`; `event-dashboard-widget-renderer.tsx` room/readiness renderers.
- **Observed behavior:** `sessionReadiness.roomsAssigned` is the number of sessions with a room. `operations.roomStatus.set` is populated from `roomsCount`, the number of room records. A single event with ten rooms and one scheduled session can display ten “set” rooms while readiness says one of the sessions is assigned. These are different denominators and are presented as adjacent operational health signals.
- **Expected behavior:** “Rooms assigned/set” must state and use one denominator consistently — preferably sessions covered for Run of Show readiness, with a separately labeled room inventory count if needed.
- **Severity:** High / P1.
- **Event isolation or authorization:** No direct gap confirmed.
- **Persisted data involved:** Yes — `Room` and `MatrixRow` records.
- **Database change required:** No.
- **Smallest safe fix:** Replace the room-status `set` value with the session-coverage value or relabel the widget as “Rooms in inventory”; do not combine the two metrics.
- **Recommended test:** Fixture with three rooms and one session, then two sessions with one assigned room; assert the displayed metric and detail denominator match the selected semantic.

### TA-04 — Event import creation is not retry-safe and can duplicate a workspace

- **Route/component:** `POST /api/events/import/create`; event builder Create event workspace action.
- **Exact files and symbols:** `web/app/api/events/import/create/route.ts` `postHandler`; `web/src/server/services/event-import-builder.ts` `createEventFromImportPlan`; `web/app/(shell)/events/_components/new-event-builder.tsx` `handleCreate`.
- **Observed behavior:** The route accepts the reviewed plan and creates a new Event and all selected module rows in one transaction. The route has no idempotency key or replay check. The UI disables its own in-flight state, but a double submission from another client, browser retry, network retry, or repeated request creates another event workspace with another membership, sessions, budget, and timeline records.
- **Expected behavior:** A retry of one approved import intent must return the original result, or the product must explicitly warn that retrying can create a new workspace and require a deliberate new import.
- **Severity:** High / P1 data duplication.
- **Event isolation or authorization:** Authorization is checked for the creating user/org; duplicate records remain inside the correct organization but can corrupt portfolio truth and downstream routing.
- **Persisted data involved:** Yes — Event, EventMember, MatrixRow, Room, Speaker, Budget, BudgetLineItem, TimelineItem, and dependency records.
- **Database change required:** Likely, if server-side idempotency must survive process/browser retries. See `orca-database-review.md`.
- **Smallest safe fix:** No safe complete fix was implemented. Short-term no-schema mitigation is a single-submit UI guard plus explicit “workspace created; do not retry” handling. Durable correctness requires Sarah’s decision on an idempotency record/key.
- **Recommended test:** Send the identical create request twice with the same idempotency intent and assert one event and one result. Until the durable design exists, add a regression documenting that duplicate requests are currently unsafe and a browser test that rapid double-click emits one request.

### TA-05 — Speaker import duplicate detection races across concurrent requests

- **Route/component:** `POST /events/:eventId/speakers/import` and Speaker Directory CSV import.
- **Exact files and symbols:** `web/app/api/events/[eventId]/speakers/import/route.ts` `postHandler`; `web/src/server/services/speakers.ts` `importSpeakersFromMappedRows`.
- **Observed behavior:** The service reads existing speakers into `seenEmails` and `seenNames`, then loops and calls `speaker.create`. The sets prevent duplicates within one request, but two concurrent imports can both read the same pre-import state and both create the same speaker. The normal create/update path also performs a check before create without a database uniqueness guarantee shown in the current service.
- **Expected behavior:** The same event-level speaker business key must not produce duplicate active speaker records under concurrent imports/retries.
- **Severity:** High / P1 people-data integrity.
- **Event isolation or authorization:** Event access is enforced; the defect is within-event duplication, not a confirmed cross-event leak.
- **Persisted data involved:** Yes — Speaker and downstream assignments/readiness/directory records.
- **Database change required:** Likely for a complete concurrency guarantee (normalized unique key/index or an approved equivalent). See `orca-database-review.md`.
- **Smallest safe fix:** No schema change made. Application-level transaction/recheck can reduce the race, but Sarah must review the canonical duplicate key and historical duplicates before a uniqueness constraint or cleanup is introduced.
- **Recommended test:** Run two concurrent imports with the same normalized email/name and assert one speaker plus one duplicate/skipped result, then reload the directory and verify assignments/readiness reference the single record.

### TA-06 — Speaker detail secondary failures are converted into “loaded” empty state

- **Route/component:** `/events/:eventId/speakers/:speakerId`, overview panel.
- **Exact file and symbols:** `web/app/(shell)/events/[eventId]/speakers/_components/speaker-detail-page.tsx` `loadPrimaryOverview` and `loadSecondaryOverview`.
- **Observed behavior:** The primary and secondary overview calls use `Promise.allSettled` and parse JSON without checking `response.ok`. A 401/403/404/500 JSON error is a fulfilled promise; the code then casts the payload and updates the overview, often producing empty flags/files/messages/activity and setting the summary status to `loaded`. The user can see a healthy-looking empty overview instead of a failed or permission-denied state.
- **Expected behavior:** Each subresource must distinguish loaded-empty, denied, unavailable, and retryable failure. A failed response must not erase known data or be reported as loaded.
- **Severity:** High / P1 trust and workflow state.
- **Event isolation or authorization:** Yes — authorization failures can be hidden as empty data; no direct server leak confirmed in this component.
- **Persisted data involved:** Reads persisted Speaker, submission, portal, file, message, activity, and MatrixRow data; no write is performed.
- **Database change required:** No.
- **Smallest safe fix:** Wrap each fetch in a response-aware helper that rejects non-2xx responses and validates the minimal response shape; retain prior data and render per-panel error/retry state.
- **Recommended test:** Mock each secondary endpoint with 403 and 500 responses; assert the panel shows an error/retry state, does not set `loaded`, and does not replace existing data with an empty array.

### TA-07 — F&B catalog loader treats malformed 2xx data as an empty catalog

- **Route/component:** Session workspace F&B tab under `/events/:eventId/matrix/sessions/:sessionId`.
- **Exact file and symbols:** `web/app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx` `loadFnbCatalogItems`.
- **Observed behavior:** After checking `response.ok`, the client accepts either an array or `payload.items`; any other successful JSON shape becomes `nextItems = []` and `nextSourceMenus = []`. It then replaces the current catalog/source-menu state with empty arrays. A proxy/API contract regression or malformed server response can therefore make approved F&B items disappear from the working UI without an error or retry state.
- **Expected behavior:** A successful response must satisfy the catalog contract. Malformed data must be treated as an error, preserve the last known state, and expose retry.
- **Severity:** High / P1 operational data trust.
- **Event isolation or authorization:** The request is event-scoped and guarded server-side; malformed response handling can still make the wrong empty state appear for the current event.
- **Persisted data involved:** Yes — read state for `EventFnbCatalogItem` and source menus; no deletion occurs in this path.
- **Database change required:** No.
- **Smallest safe fix:** Add runtime shape validation for `items`, `sourceMenus`, and required IDs/event scope; reject malformed payloads, retain prior state, and render a retryable error.
- **Recommended test:** Return `{}` and `{ items: [malformed] }` with HTTP 200; assert existing catalog state remains and the UI shows an error/retry affordance.

### TA-08 — Optional-source fallback masks unavailable data as zero/empty health

- **Route/component:** `/events/:eventId` command center and operations/readiness widgets.
- **Exact file and symbols:** `web/src/server/services/event-command-center.ts` `readOptionalDataSource`, `isMissingOptionalDataSource`, and the `readOptionalDataSource(..., 0/[]/null)` calls for activity, integration metrics, F&B, AV, speaker deliverables, and staffing.
- **Observed behavior:** Missing-table/schema errors are converted to zero, empty arrays, or null. The response still has a normal success shape; capabilities and `hasData` flags can report “no data” or “on track” when the underlying source is unavailable because of deployment/schema drift. This is especially risky for F&B/AV/staffing readiness and registration/housing signals.
- **Expected behavior:** A missing source must be distinguishable from a genuine zero/empty business state. The dashboard should show unavailable/degraded state and provide retry/diagnostic context without inventing a healthy result.
- **Severity:** High / P1.
- **Event isolation or authorization:** No direct gap; scoped queries are generally event-scoped. The defect can hide an authorization/schema/deployment failure.
- **Persisted data involved:** Yes, as reads; no new writes.
- **Database change required:** No for explicit response/UI availability semantics.
- **Smallest safe fix:** Return per-source availability metadata or a degraded response status, and make widgets render “Unavailable” rather than zero/empty when the source lookup failed. Do not silently broaden a source query.
- **Recommended test:** Force a representative optional query to throw a missing-table error and assert the response marks that source unavailable; assert a real empty table still renders as an honest empty state.

### TA-09 — Post-create document upload failure leaves an incomplete workflow without a durable server state

- **Route/component:** Event creation with Additional Docs; `/events/new` post-create panel.
- **Exact file and symbols:** `web/app/(shell)/events/_components/new-event-builder.tsx` `handleCreate`, `uploadAdditionalDocs`, and `retryFailedAdditionalDocs`; `web/app/api/events/import/create/route.ts`.
- **Observed behavior:** Event creation commits first. Additional document uploads then run separately. If document creation, presign, object upload, finalization, or review submission fails, the event remains created and the client shows a retry panel. The server has no import/job result tying the event creation and document outcomes together, so a closed tab or a retry from another client cannot reliably distinguish pending, failed, finalized, or partially submitted documents.
- **Expected behavior:** The user must receive a complete, durable result: event created, each document finalized, or each document explicitly failed and safely retryable. Success copy must not imply the entire requested setup completed when only the event transaction succeeded.
- **Severity:** Medium-high / P1 for operational setup; P2 if Additional Docs are optional.
- **Event isolation or authorization:** Event ID is carried through the upload calls and must remain guarded; no cross-event leak confirmed.
- **Persisted data involved:** Yes — Event, Document, document version/upload metadata, object storage, links, and optional review records.
- **Database change required:** Possibly. An explicit upload/import state or result ledger would be a persisted-shape change; a compensating cleanup using existing records may be possible but needs careful review. See `orca-database-review.md`.
- **Smallest safe fix:** No change made. Without schema work, make the post-create panel copy explicitly “Event created; documents not all uploaded,” validate every upload/finalize response, and preserve retryable per-file errors. Sarah should decide whether durable cross-session status is required.
- **Recommended test:** Fail each post-create stage, reload the page, open the event Docs Hub, and verify the UI does not claim the document succeeded and does not create duplicate documents on retry.

### TA-10 — F&B destructive operations are confirmed in the UI, but source-menu mutation responses are not runtime-validated before success copy

- **Route/component:** F&B source-menu cleanup in the session workspace.
- **Exact file and symbols:** `web/app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx` `archiveFnbSourceMenu` and `deleteFnbSourceMenu`; `web/app/api/events/[eventId]/fnb-catalog/source-menus/[sourceMenuId]/route.ts`.
- **Observed behavior:** The UI correctly presents a confirmation modal before archive/delete. After a 2xx response, archive displays `${menu.menuName} archived.` without validating the returned record or re-reading the specific source menu. Delete defaults a missing/non-numeric `deletedCatalogItemCount` to zero and still displays a successful deletion message. A contract regression can therefore produce an incomplete or misleading success state after a destructive operation.
- **Expected behavior:** Destructive success must be based on a validated response and, where the operation has cascading catalog effects, a post-mutation reread or authoritative result contract.
- **Severity:** Medium-high / P1 because the action is destructive.
- **Event isolation or authorization:** Server route is event-scoped/guarded; client must not trust an unrelated or malformed 2xx payload.
- **Persisted data involved:** Yes — source menu and catalog item records, plus downstream assignments/budget sync as applicable.
- **Database change required:** No for response validation and reread.
- **Smallest safe fix:** Validate the returned `sourceMenuId`, status/action result, and deletion count; on malformed success, show an error and reload instead of success copy. Keep the existing confirmation modal.
- **Recommended test:** Return 200 with missing `deletedCatalogItemCount` and with a mismatched source-menu ID; assert no success notice is shown until a validated reread confirms the final state.

## Coverage by requested risk area

| Risk area | Audit result |
|---|---|
| Event isolation | TA-01 critical bypass; most API services inspected use event-scoped predicates and `assertEventAccessForUser`. |
| Authorization checks | TA-01; speaker secondary UI also hides denied subresources as empty (TA-06). Route-level coverage remains uneven in historical Matrix/requirements/F&B paths and needs a full route matrix test. |
| Event/portfolio routing | Event-shell header and command-center page trust URL event IDs without access (TA-01). Account dashboard service uses `resolveActiveEventVisibilityWhere` and was not found to leak a foreign event in source review. |
| Edits surviving reload | Event-command-center server layout PUT returns a sanitized layout without persisting it, while the live component uses per-browser local storage. The API is therefore a false persistence contract; cross-device/server persistence needs Sarah’s review. |
| Stale/optimistic UI | TA-06, TA-07, TA-08, TA-10. Existing F&B autosave coordinator serializes writes and rejects stale results; no new defect was asserted there. |
| Duplicate submissions | TA-04 and TA-05. Budget/F&B autosave paths have some in-flight guards, but import/server retry safety is incomplete. |
| Loading/error/retry/empty states | TA-06, TA-07, TA-08, TA-09, TA-10. |
| Destructive confirmation | Directory, speaker, budget, event, and F&B source-menu flows have explicit confirmation UI in the inspected components. No confirmed missing-confirmation finding was recorded. Server authorization remains mandatory. |
| Wrong event/org records | TA-01 is confirmed. Directory, speakers, F&B session assignment, timeline, and budget services were checked for event predicates; cross-event rejection patterns exist and should receive broader regression coverage. |
| Unvalidated server responses | TA-06, TA-07, TA-09, TA-10. |
| Dashboard/detail disagreement | TA-02 and TA-03. Account/portfolio risk-count parity has dedicated DB-backed tests, but those tests skip without `DATABASE_URL`. |
| Misleading success | TA-08, TA-09, TA-10; TA-06 can produce misleading loaded-empty state. |
| AI Workspace | Not implemented in source; no runtime defect to audit. Do not infer Copilot routes are AI Workspace. |
| Partners, contracts, catering | No first-class current routes/models confirmed. Existing labels/links must not imply shipped lifecycle behavior. |

## Defects safe to fix without database changes

These are isolated and can be implemented without changing Prisma shape:

1. TA-01 request-user/access enforcement in server-rendered event layout/page.
2. TA-02 shared approval count derivation.
3. TA-03 room metric denominator/label correction.
4. TA-06 response-aware per-panel error/retry handling.
5. TA-07 runtime response validation and last-known-state preservation.
6. TA-08 explicit unavailable/degraded source state.
7. TA-10 runtime validation and post-mutation reread for F&B source-menu responses.
8. TA-09 honest copy and per-file retry/error handling, provided no new persisted upload state is introduced.

Each fix needs a focused regression test and should not touch the F&B data model or session-to-menu relationships.

## Database decisions requiring Sarah’s review

See `docs/implementation/orca-database-review.md` for the required proposal details. In summary:

- **Import idempotency:** TA-04 needs a durable request key/result ledger or equivalent uniqueness strategy to make retries safe across processes and clients.
- **Speaker duplicate prevention:** TA-05 may require a normalized event-scoped business key/index and historical duplicate cleanup before enforcement.
- **Post-create document outcome:** TA-09 may need a durable upload/import status or result ledger if outcomes must survive a closed tab and support cross-session retry.
- **Command-center layout persistence:** the current live component uses browser storage and the server PUT route intentionally does not persist. A cross-device/server-backed layout needs a user/event/phase persistence shape; do not add it in Slice 1A.

No Prisma model, field, relation, index, migration, seed, or persisted-data-shape change was made.

## Validation performed

Read-only validation was run after the audit document was created:

- Focused source/regression tests: 48 passed, 0 failed, 0 skipped.
- Full `npm --prefix web run test:summary`: 2,120 passed, 55 failed, 7 skipped out of 2,182 tests; failures are pre-existing source/fixture expectations across budget, dashboard, Matrix, platform, command center, and journey coverage.
- `npm --prefix web run typecheck` — failed on the pre-existing generated `.next` AI Workspace validator references to missing source paths; no application fix made.
- `npm --prefix web run lint` — failed on the pre-existing lint backlog: 68 errors and 83 warnings; no application fix made.
- `npm --prefix web run build` — passed; Next.js compiled, typechecked, and generated 108 static pages.
- `git diff --check` — passed.

The focused and full tests used the configured `DATABASE_URL` and performed read-only service/journey checks; no database writes were introduced by this audit. Responsive source review found three existing mobile layout risks, while browser rendering was unavailable. Browser E2E remains required for implementation slices that change UI behavior.

## Recommended next prompt

`Implement Slice 1B from docs/implementation/orca-slice-1-trust-audit.md: fix TA-01, TA-02, TA-03, TA-06, TA-07, TA-08, and TA-10 with focused regression tests only. Do not implement TA-04, TA-05, TA-09 durable persistence, or command-center server-backed layout persistence until Sarah approves docs/implementation/orca-database-review.md. Do not modify Prisma, migrations, seeds, auth/RBAC architecture, dependencies, configuration, F&B models, dietary/menu models, or session-to-menu relationships.`
