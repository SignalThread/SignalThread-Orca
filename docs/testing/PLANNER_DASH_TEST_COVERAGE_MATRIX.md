# Planner Dash Test Coverage Matrix

Audit date: 2026-06-30

Scope: Planner Dash / Planner OS test coverage audit. This document tracks actual coverage and remaining gaps. It does not claim browser E2E coverage unless real browser tests exist.

Update 2026-06-30: the first deterministic DB-backed core journey pack now exists at `web/lib/test-journeys/planner-core-journeys.test.ts`. It covers service/data-layer journeys for event creation, Run of Show session basics, quick-drawer data, session-scoped Room Set seating, and timeline item/dependency lifecycle.

Update 2026-06-30: the P0 access/tenancy journey pack now exists at `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts`. It covers OWNER, ADMIN, MEMBER with event access, VIEWER with `EVENT_EDITOR`, read-only `EVENT_VIEWER`, unrelated same-org member, unrelated other-org member, and SUPER_ADMIN at the service/data layer. It also adds source-contract coverage for guarded Matrix 2 F&B catalog assignment routes.

Update 2026-06-30: the lifecycle journey pack now exists at `web/lib/test-journeys/planner-lifecycle-journeys.test.ts`. It covers Docs Hub document/version/review approval state, Budget submission/reject/revise/approve activity, Speaker create/assign/comms/onsite/removal, speaker portal token scoping/revocation/expiry, and Docs/Budget/Speaker/Matrix cross-module tenant isolation at the service/data layer. It also adds source-contract coverage for selected Docs review/detail/download/link-options, Budget submission decision, Speaker, Matrix speaker-assignment, and speaker portal token routes.

Update 2026-06-30: the first deterministic browser E2E layer now exists at `web/playwright.config.ts`, `web/e2e/helpers/planner-e2e.ts`, `web/e2e/planner-p0-browser-journey.spec.ts`, `web/e2e/planner-access-browser-journey.spec.ts`, `web/e2e/planner-quick-drawer-browser-journey.spec.ts`, `web/e2e/planner-room-set-seating-browser-journey.spec.ts`, `web/e2e/planner-docs-browser-journey.spec.ts`, and `web/e2e/planner-budget-browser-journey.spec.ts`. The P0 Playwright journeys cover a seeded Events list -> event workspace -> Run of Show List edit -> reload -> persisted DB reread path, an `EVENT_VIEWER` browser access path that receives `EVENT_EDITOR_ROLE_REQUIRED` and proves by DB/reload that Matrix session data did not mutate, a Matrix quick drawer Speakers panel assignment path that adds a speaker through the browser UI and verifies persistence by close/reopen, reload, and DB reread, a Room Set / Seating path that assigns an attendee to Chair 1 through the browser UI and verifies the exact `seatIndex` by reload and DB reread, a Docs Hub path that opens a seeded event document/version and submits it for review through the browser UI with DB/service activity reread, and a Budget path that opens a seeded line item in the Full Budget Grid and submits it for approval through the browser UI with DB/service submission/activity reread. They use the app's existing development auth fallback with real Prisma users plus `activeOrgId` cookie context; they are not full Supabase/OTP browser login coverage.

Update 2026-07-01: the Speakers browser journey now exists at `web/e2e/planner-speakers-browser-journey.spec.ts`. It covers Events -> event workspace -> Event Directory -> Speakers -> seeded speaker detail -> Edit Profile status/title/company -> reload -> Prisma and canonical speaker service reread. This is planner UI browser coverage for a stable speaker profile edit path; broader speaker create/delete, communications, onsite/readiness, portal/token, speaker portal browser, and speaker-specific denied-write workflows remain missing.

Update 2026-07-01: the Timeline browser journey now exists at `web/e2e/planner-timeline-browser-journey.spec.ts`. It covers Events -> event workspace -> Roadmap -> List -> seeded timeline item status edit from Backlog to In Progress -> reload -> Prisma and canonical timeline service reread. This is planner UI browser coverage for a stable Timeline item status update path; dependency editing is not browser-covered because the inspected Roadmap UI does not expose a reliable dependency edit control.

Update 2026-07-01 (final browser/access hardening pass): browser P0 now runs 12/12 (`test:e2e:p0`) spanning Run of Show edit, EVENT_VIEWER denied-write, quick drawer Speakers + F&B + Staffing, Room Set / Seating assign + unassign, Docs Hub submit + approve, Budget submit-for-approval, Speakers profile edit, speaker portal token, and Timeline status. Live HTTP route execution happens through the real Next.js dev server against real routes (development auth fallback with real Prisma users, not Supabase/OTP cookies). Remaining browser gaps — real Supabase/OTP auth, mocked-R2 Docs upload, Docs reject/reopen/pull-back, Budget approve/reject/revise, quick drawer Basics/AV, seating multi-table + auto-assign, portal submission, and universal route-guard execution — are documented in `PLANNER_DASH_TEST_HARDENING_SUMMARY.md` and remain covered at the service/data/API-source layer where applicable. See that doc's "Final Browser / Access Hardening Assessment" for the full assessment.

Update 2026-07-01: the Room Set / Seating advanced browser journey now exists at `web/e2e/planner-room-set-seating-advanced-browser-journey.spec.ts`. It expands seating browser coverage beyond exact-chair assignment to unassign: an attendee is pre-seated at Chair 1, then removed through the real Tables inspector chair "Remove" control, verified by the chair going empty in the UI and a SeatingAssignment count of 0 after reload. Multi-table and auto-assign are not browser-covered: auto-assign is explicitly deferred in the embedded seating V1, and multi-table moves depend on canvas drag/drop that would be brittle; both remain documented gaps.

Update 2026-07-01: the speaker portal browser journey now exists at `web/e2e/speaker-portal-browser-journey.spec.ts`. It covers the public token-scoped speaker portal route with no planner session auth: a valid token minted through the canonical `generateSpeakerPortalToken` service loads the intended speaker's portal (speaker name + readiness content) and survives reload, while an invalid token and a revoked token both render the "Link unavailable" rejection and do not expose the speaker's data. Portal profile submission is not browser-covered (multi-tab portal form flow) and remains covered at the service/lifecycle-journey layer as a documented gap.

Update 2026-07-01: the Docs Hub review-decision browser journey now exists at `web/e2e/planner-docs-review-browser-journey.spec.ts`. It expands Docs Hub browser coverage beyond submit-for-review: Events -> event workspace -> Docs Hub -> open a seeded IN_REVIEW document -> Approve through the real drawer action (canonical approve route) -> reload -> list card shows Approved -> Prisma and canonical `getDocumentDetails` reread confirm APPROVED status and a REVIEW_APPROVED activity entry. Reject, Reopen, and Pull back are not browser-covered because the reject control uses a native window.prompt and chaining multiple review decisions across documents in one drawer session proved unstable; those transitions remain covered at the service/lifecycle-journey layer and a stable browser path for them is a documented gap. The Budget review-decision browser path (approve/reject/revise) is also a documented gap: the approval decision is behind a "View approvals" review surface with submission selection plus a native window.confirm; it remains covered at the service/lifecycle-journey layer.

Update 2026-07-01: the Matrix quick drawer resource panels browser journey now exists at `web/e2e/planner-quick-drawer-resources-browser-journey.spec.ts`. It extends the Speakers quick panel coverage to the F&B and Staffing panels: Events -> event workspace -> Run of Show -> session quick drawer -> F&B panel (assign a seeded catalog item, persisted immediately through the canonical F&B catalog assignment route) and Staffing panel (assign a seeded EventPerson, persisted through the session Save) -> reload -> reopen both panels to confirm the assignments remain visible -> DB reread of `SessionFnbCatalogAssignment` and the canonical staff assignment record. The AV requirement panel is intentionally not browser-covered: saving an AV requirement selection budget-links the requirement and the event resolves a broader default requirement template, so the reloaded AV panel does not re-render a stable, matchable selected row; forcing that assertion would be brittle. AV requirement data remains covered at the service/journey layer, and AV quick-drawer browser coverage is a documented gap.

## 1. Current Test Infrastructure

Planner Dash currently relies on the Node.js built-in test runner plus `tsx --test` for TypeScript test execution, and now has a small Playwright browser E2E layer for P0 browser journeys. The `web` package owns the main test scripts.

| Area | Current state | Evidence |
| --- | --- | --- |
| Package layout | npm workspace with main app in `web` | `package.json`, `web/package.json` |
| Primary test runner | Node test runner and `tsx --test` | `web/package.json` |
| Full local suite | `npm --prefix web run test:summary` | `web/package.json` |
| Focused harness validation | `npm --prefix web run test:harness` | `web/package.json`, `web/lib/test-harness/planner-fixtures.test.ts` |
| Focused journey suite | `npm --prefix web run test:journeys` | `web/package.json`, `web/lib/test-journeys/*.test.ts` |
| Core journeys | `npm --prefix web run test:journeys:core` | `web/lib/test-journeys/planner-core-journeys.test.ts` |
| Access/tenancy journeys | `npm --prefix web run test:journeys:access` | `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts` |
| Lifecycle journeys | `npm --prefix web run test:journeys:lifecycle` | `web/lib/test-journeys/planner-lifecycle-journeys.test.ts` |
| Room Set suite | `npm --prefix web run test:room-set` | `web/package.json` |
| Marketing smoke | `npm --prefix web run test:marketing-email-smoke` | `package.json`, `web/package.json` |
| Browser journey tests | First Playwright P0 journeys exist | `web/playwright.config.ts`, `web/e2e/helpers/planner-e2e.ts`, `web/e2e/planner-p0-browser-journey.spec.ts`, `web/e2e/planner-access-browser-journey.spec.ts`, `web/e2e/planner-quick-drawer-browser-journey.spec.ts`, `web/e2e/planner-quick-drawer-resources-browser-journey.spec.ts`, `web/e2e/planner-room-set-seating-browser-journey.spec.ts`, `web/e2e/planner-room-set-seating-advanced-browser-journey.spec.ts`, `web/e2e/planner-docs-browser-journey.spec.ts`, `web/e2e/planner-docs-review-browser-journey.spec.ts`, `web/e2e/planner-budget-browser-journey.spec.ts`, `web/e2e/planner-speakers-browser-journey.spec.ts`, `web/e2e/speaker-portal-browser-journey.spec.ts`, `web/e2e/planner-timeline-browser-journey.spec.ts`, `npm --prefix web run test:e2e:p0` |
| Live HTTP route tests | None clearly found | route coverage is mostly source-contract or service-level assertions |
| Source-contract regression tests | Heavy use | many `*-regression.test.ts` files read source files and assert imports, strings, or patterns |
| CI workflow | None found | `.github/workflows` absent or empty in discovery |

### Command Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm --prefix web run typecheck` | Passed | TypeScript verification. |
| `npm --prefix web run test:harness` | Passed | Deterministic fixture setup/cleanup validation. |
| `npm --prefix web run test:journeys:core` | Passed | Core service/data journey pack. |
| `npm --prefix web run test:journeys:access` | Passed | Access/tenancy service/data journey pack. |
| `npm --prefix web run test:journeys:lifecycle` | Passed | Lifecycle service/data/API-source journey pack. |
| `npm --prefix web run test:journeys` | Passed | All three journey packs. |
| `npm --prefix web run test:e2e:p0` | Passed | Playwright P0 browser journeys. Uses existing dev auth fallback with real Prisma users and isolated fixture data. |
| `npm --prefix web run test:e2e:room-set` | Passed | Focused Room Set / Seating browser journey; assigns an attendee to Chair 1 and rereads DB assignment scope plus `seatIndex`. |
| `npm --prefix web run test:e2e:docs` | Passed | Focused Docs Hub browser journey; opens a seeded event document/version, submits it for review through the UI, reloads, and rereads DB/service activity state. |
| `npm --prefix web run test:e2e:budget` | Passed | Focused Budget browser journey; opens a seeded Full Budget Grid line item, submits it for approval through the UI, reloads, and rereads DB/service submission/activity state. |
| `npm --prefix web run test:e2e:timeline` | Passed | Focused Timeline browser journey; opens Roadmap List, updates a seeded item status to In Progress through the UI, reloads, and rereads DB/service state. |
| `npm --prefix web run test:e2e:quick-drawer-resources` | Passed | Focused Matrix quick drawer F&B + Staffing browser journey; assigns a seeded catalog item and EventPerson through the real drawer panels, reloads, reopens each panel, and rereads DB records. AV panel deferred (documented gap). |
| `npm --prefix web run test:e2e:docs-review` | Passed | Focused Docs Hub review journey; approves a seeded IN_REVIEW document through the real drawer, reloads, and rereads DB/service (APPROVED + REVIEW_APPROVED activity). Reject/reopen/pull-back and Budget approve/reject/revise deferred (documented gaps). |
| `npm --prefix web run test:e2e:speaker-portal` | Passed | Focused public speaker portal journey; valid token loads the intended speaker (no planner auth) and survives reload, invalid and revoked tokens render "Link unavailable". Portal submission deferred (documented gap). |
| `npm --prefix web run test:e2e:room-set-advanced` | Passed | Focused Room Set advanced seating journey; unassigns a pre-seated attendee via the Tables inspector Remove control, reloads, and verifies the chair is empty + SeatingAssignment count 0. Multi-table/auto-assign deferred (documented gaps). |
| `npm --prefix web run test:summary` | Passed | Full suite currently runs 1519/1519 tests. Includes harness and journey packs. |
| `npm --prefix web run test:summary` | Failed in sandbox | `tsx` failed to create/listen on an IPC pipe under `/var/folders/...` with `EPERM`. Likely sandbox restriction. |
| `npm --prefix web run test:summary` with escalated sandbox | Failed | Suite ran: 1500 tests, 1486 pass, 14 fail, 0 skipped. Full log at `/tmp/planner-full-test-run.tap` during audit. |
| `npm --prefix web run test:summary` with escalated sandbox, post-stabilization and core journey pack | Passed | Suite ran: 1506 tests, 1506 pass, 0 fail. |
| `npx tsx --test lib/test-journeys/planner-access-tenancy-journeys.test.ts` | Passed | 7 access/tenancy journey tests passed. |
| `npm --prefix web run test:summary` with escalated sandbox, post-access journey pack | Passed | Suite ran: 1513 tests, 1513 pass, 0 fail. |
| `npx tsx --test lib/test-journeys/planner-lifecycle-journeys.test.ts` | Passed | 6 service/data/source-contract lifecycle tests passed. |
| `npm --prefix web run test:summary` with escalated sandbox, post-lifecycle journey pack | Passed | Suite ran: 1519 tests, 1519 pass, 0 fail. |

The 14 failing tests were concentrated in Matrix 2 and Room Set visual/source regression coverage:

- `Matrix 2 seating status labels explain the source of the count`
- `Matrix 2 Room Set status does not mark setup-only sessions as started`
- `generated layout visual audit assertions pass before manual review`
- `town hall generates distinct speaker and Q&A access geometry`
- `theater graceful fallback rejects severe low-capacity row fallback`
- `networking reception clusters remain distributed`
- `room-set UI source keeps component adder wide and selected object delete enabled`
- `room-set numeric inputs use draft text state and commit only after editing`
- `prototype renderer has distinct lounge chair, 6ft table, and readable hover label rendering`
- `prototype renderer gives self check-in kiosk a recognizable event-tech silhouette`
- `prototype renderer gives queue lane recognizable stanchion and belt rendering`
- `prototype table renderer uses indexed capacity-derived seat markers`
- `prototype theater row renderer uses indexed capacity-derived chair markers`
- `standalone Room Set shell source preserves drawer toggles, mode switching, Generate, Apply, and Save Draft hooks`

## 2. Test File Inventory

Inventory includes every `*.test.*` / `*.spec.*` file discovered outside `node_modules` and `.next`. Type meanings:

- `unit`: executable pure or service-level behavior.
- `source`: source-inspection regression assertions.
- `api-source`: route/API source-contract assertions.
- `client-unit`: client helper behavior with mocks.
- `visual-source`: non-browser source or generated-geometry visual assertions.

| Test file | Module | Type | Journey coverage? | Access/tenancy? | Appears to test |
| --- | --- | --- | --- | --- | --- |
| `web/e2e/planner-access-browser-journey.spec.ts` | Event Access / Run of Show | browser-e2e | Yes | Yes | EVENT_VIEWER can read a protected event/session, Matrix List edit is server-rejected with 403, and DB/reload state remains unchanged |
| `web/e2e/planner-budget-browser-journey.spec.ts` | Budget | browser-e2e | Yes | Partial | Events -> event workspace -> Budget -> Full Budget Grid -> seeded line item -> Submit for approval -> reload -> DB/service reread of budget/submission/recipient/activity |
| `web/e2e/planner-docs-browser-journey.spec.ts` | Docs Hub | browser-e2e | Yes | Partial | Events -> event workspace -> Docs Hub -> seeded document/version -> Submit for Review -> reload -> DB reread of document/version/approval and service activity |
| `web/e2e/planner-p0-browser-journey.spec.ts` | Events / Run of Show | browser-e2e | Yes | Partial | seeded Events -> workspace -> Run of Show List edit -> reload -> DB reread |
| `web/e2e/planner-quick-drawer-browser-journey.spec.ts` | Run of Show / Quick Drawer | browser-e2e | Yes | Partial | Matrix board quick actions -> Speakers quick drawer -> Add speaker -> save -> close/reopen -> reload -> DB reread |
| `web/e2e/planner-room-set-seating-browser-journey.spec.ts` | Room Set / Seating | browser-e2e | Yes | Partial | Matrix board quick action -> Room Set Seating -> attendee selected -> table inspector -> assign to Chair 1 -> reload -> DB reread of event, seating plan, table, attendee, and `seatIndex` |
| `web/e2e/planner-speakers-browser-journey.spec.ts` | Speakers | browser-e2e | Yes | Partial | Events -> event workspace -> Event Directory -> Speakers -> seeded speaker detail -> Edit Profile status/title/company -> reload -> DB/service reread |
| `web/e2e/planner-timeline-browser-journey.spec.ts` | Timeline | browser-e2e | Yes | Partial | Events -> event workspace -> Roadmap -> List -> seeded item status Backlog to In Progress -> reload -> DB/service reread |
| `web/e2e/planner-quick-drawer-resources-browser-journey.spec.ts` | Matrix quick drawer (F&B, Staffing) | browser-e2e | Yes | Partial | Run of Show -> session quick drawer -> F&B catalog assign + Staffing EventPerson assign -> reload -> reopen panels -> DB reread; AV panel deferred (documented gap) |
| `web/e2e/planner-docs-review-browser-journey.spec.ts` | Docs Hub (review decision) | browser-e2e | Yes | Partial | Docs Hub -> open IN_REVIEW document -> Approve -> reload -> DB/service reread (APPROVED + REVIEW_APPROVED); reject/reopen/pull-back deferred (documented gap) |
| `web/e2e/speaker-portal-browser-journey.spec.ts` | Speaker Portal (token) | browser-e2e | Yes | Partial | public /speaker-portal/[token] -> valid token loads speaker (no auth) + reload -> invalid + revoked tokens rejected; portal submission deferred (documented gap) |
| `web/e2e/planner-room-set-seating-advanced-browser-journey.spec.ts` | Room Set / Seating (advanced) | browser-e2e | Yes | Partial | seating workspace -> Tables -> chair Remove (unassign) -> reload -> chair empty + SeatingAssignment 0; multi-table/auto-assign deferred (documented gaps) |
| `web/lib/account-docs-surface.test.ts` | Account / Docs | source | No | Partial | account docs surface visibility and wiring |
| `web/lib/budget-access-hardening-regression.test.ts` | Budget | api-source | No | Yes | budget route access hardening |
| `web/lib/budget-bulk-delete-regression.test.ts` | Budget | source | No | Partial | bulk delete UI/API guardrails |
| `web/lib/budget-category-filter.test.ts` | Budget | unit | No | No | category filter logic |
| `web/lib/budget-dashboard-blocks-regression.test.ts` | Budget | source | No | No | dashboard block composition |
| `web/lib/budget-dashboard-regression.test.ts` | Budget | source/unit | No | Partial | dashboard service and rendering contracts |
| `web/lib/budget-dashboard-ui-regression.test.ts` | Budget | source | No | No | dashboard UI source contracts |
| `web/lib/budget-grid-session-group-regression.test.ts` | Budget | source | No | No | budget grid session grouping |
| `web/lib/budget-grid-split-regression.test.ts` | Budget | source | No | No | split-line budget grid behavior |
| `web/lib/budget-import-mapping.test.ts` | Budget Import | unit | No | No | budget import mapping |
| `web/lib/budget-import-session-group.test.ts` | Budget Import | unit | No | No | budget import session-group mapping |
| `web/lib/budget-import-write-regression.test.ts` | Budget Import | api-source | No | Partial | budget import write behavior |
| `web/lib/budget-load-performance-regression.test.ts` | Budget | source | No | No | budget load query/performance guardrails |
| `web/lib/budget-ops-link-fnb-sync-regression.test.ts` | Budget / F&B | source/unit | No | No | ops-link and F&B sync contracts |
| `web/lib/budget-session-group-filter.test.ts` | Budget | unit | No | No | session-group filter logic |
| `web/lib/budget-sessions-groups.test.ts` | Budget | unit | No | Partial | session/group aggregation |
| `web/lib/dashboard-command-center-regression.test.ts` | Dashboard | source | No | No | command center source contracts |
| `web/lib/dashboard-empty-states-regression.test.ts` | Dashboard | source | No | No | empty-state copy and wiring |
| `web/lib/docs-hub-upload-auth-regression.test.ts` | Docs Hub | api-source | No | Yes | document upload route authorization |
| `web/lib/documents-upload-client.test.ts` | Docs Hub | client-unit | Partial upload helper only | No | category loading, draft/presign/PUT/finalize client sequence |
| `web/lib/event-access-regression.test.ts` | Events / Access | source/unit | No | Yes | event access helper contracts |
| `web/lib/event-attendee-detail-regression.test.ts` | Attendees | source | No | Partial | attendee detail source contracts |
| `web/lib/event-attendee-import.test.ts` | Attendees | unit | No | No | attendee import mapping |
| `web/lib/event-attendee-service-regression.test.ts` | Attendees | source/unit | No | Partial | attendee service contracts |
| `web/lib/event-attendee-session-enrollment-api-ui-regression.test.ts` | Attendees / Sessions | api-source/source | No | Partial | enrollment route and UI contracts |
| `web/lib/event-attendee-session-enrollment-regression.test.ts` | Attendees / Sessions | source/unit | No | No | enrollment service behavior |
| `web/lib/event-attendee-ui-regression.test.ts` | Attendees | source | No | No | attendee UI source contracts |
| `web/lib/event-builder-additional-docs-regression.test.ts` | Event Builder / Docs | source | Partial source-only | Partial | Additional Docs source contracts and upload sequencing expectations |
| `web/lib/event-command-center-grid-layout.test.ts` | Event Workspace | source | No | No | command center grid layout |
| `web/lib/event-command-center-layout-regression.test.ts` | Event Workspace | source | No | No | command center layout contracts |
| `web/lib/event-directory-backfill-regression.test.ts` | Event Directory | source/unit | No | No | directory backfill behavior |
| `web/lib/event-directory-import.test.ts` | Event Directory | unit | No | No | directory import mapping |
| `web/lib/event-directory-routes-regression.test.ts` | Event Directory | api-source | No | Partial | directory route contracts |
| `web/lib/event-directory-service-regression.test.ts` | Event Directory | source/unit | No | Partial | directory service contracts |
| `web/lib/event-directory-ui-regression.test.ts` | Event Directory | source | No | No | directory UI contracts |
| `web/lib/event-import-agenda.test.ts` | Event Import | unit | No | No | agenda import mapping |
| `web/lib/event-import-builder-ui-regression.test.ts` | Event Builder | source | No | No | builder UI source contracts |
| `web/lib/event-import-builder.test.ts` | Event Builder | unit/source | No | No | import builder parsing/state behavior |
| `web/lib/event-import-create-regression.test.ts` | Event Import | api-source/unit | Partial service only | Partial | create-import orchestration, validation, writes |
| `web/lib/event-import-templates.test.ts` | Event Import | unit | No | No | import templates |
| `web/lib/event-import-types.test.ts` | Event Import | unit | No | No | import types and validation helpers |
| `web/lib/event-integration-regression.test.ts` | Event Integration | source | No | Partial | event integration source contracts |
| `web/lib/event-module-shell-regression.test.ts` | Event Workspace | source | No | Partial | event module shell/navigation |
| `web/lib/event-settings-hub-regression.test.ts` | Settings | source | No | Partial | settings hub contracts |
| `web/lib/events-page-layout-regression.test.ts` | Events | source | No | No | events page layout |
| `web/lib/events-visibility-regression.test.ts` | Events / Access | source | No | Yes | event visibility and access boundaries |
| `web/lib/import/import-foundation.test.ts` | Import Foundation | unit | No | No | shared import primitives |
| `web/lib/marketing-api-routes-regression.test.ts` | Marketing | api-source | No | Partial | marketing route contracts |
| `web/lib/marketing-provider-regression.test.ts` | Marketing | source/unit | No | No | provider behavior |
| `web/lib/marketing-schema-guardrail-regression.test.ts` | Marketing | source | No | No | schema guardrails |
| `web/lib/marketing-service-regression.test.ts` | Marketing | source/unit | No | Partial | marketing service behavior |
| `web/lib/marketing-ui-helpers.test.ts` | Marketing | unit | No | No | UI helper logic |
| `web/lib/marketing-workspace-ui-regression.test.ts` | Marketing | source | No | No | marketing workspace UI |
| `web/lib/matrix-import.test.ts` | Run of Show / Matrix | unit | No | No | matrix import mapping |
| `web/lib/matrix-rows-auth-regression.test.ts` | Run of Show / Matrix | api-source | No | Yes | matrix row route authorization |
| `web/lib/matrix2-board-layout.test.ts` | Matrix 2 | unit/source | No | No | board layout logic |
| `web/lib/matrix2-event-routing-regression.test.ts` | Matrix 2 | source | No | Partial | event-scoped routing |
| `web/lib/matrix2-quick-launcher-regression.test.ts` | Matrix 2 | source | No | No | quick launcher contracts |
| `web/lib/matrix2-session-room-flow-regression.test.ts` | Matrix 2 / Sessions / Rooms | source | Partial source-only | Partial | session-room flow and unassigned sessions |
| `web/lib/matrix2-status-cards-regression.test.ts` | Matrix 2 | source | No | No | status cards; currently has failures |
| `web/lib/platform-admin-regression.test.ts` | Platform Admin | source/unit | No | Yes | platform admin service contracts |
| `web/lib/platform-admin-ui-regression.test.ts` | Platform Admin | source | No | Partial | platform admin UI |
| `web/lib/room-set/geometry.test.ts` | Room Set | unit | No | No | geometry utilities |
| `web/lib/room-set/layout-simulation-visual-audit.test.ts` | Room Set | visual-source | No | No | generated layout audit; currently has failures |
| `web/lib/room-set/layout-spatial-directives.test.ts` | Room Set | unit | No | No | spatial directive behavior |
| `web/lib/room-set/persistence.test.ts` | Room Set | unit | Partial persistence only | No | persistence serialization/deserialization |
| `web/lib/room-set/planner-component-requests.test.ts` | Room Set | unit/source | No | No | component request handling |
| `web/lib/room-set/planner-layout-simulation.test.ts` | Room Set | unit/visual-source | No | No | generated layout simulation; currently has failures |
| `web/lib/room-set/planner-layout-visual-quality.test.ts` | Room Set | visual-source | No | No | visual quality checks; currently has failures |
| `web/lib/room-set/planner-scene-hit-testing.test.ts` | Room Set | unit | No | No | scene hit testing |
| `web/lib/room-set/planner-scene-io.test.ts` | Room Set | unit | Partial persistence only | No | scene import/export |
| `web/lib/room-set/seating-overlay-mapping.test.ts` | Room Set / Seating | unit | No | No | seating overlay mapping |
| `web/lib/room-set/setup-adapter.test.ts` | Room Set | unit | No | No | setup adapter behavior |
| `web/lib/room-set/source-component-regression.test.ts` | Room Set | source | No | No | component source contracts; currently has failures |
| `web/lib/room-set/toolbar-consolidation-regression.test.ts` | Room Set | source | No | No | toolbar consolidation contracts |
| `web/lib/room-set/workspace-drawer-regression.test.ts` | Room Set | source | No | No | workspace drawer contracts; currently has failures |
| `web/lib/run-of-show-board-card-readability-regression.test.ts` | Run of Show | source | No | No | board card readability |
| `web/lib/run-of-show-room-set-linkage-regression.test.ts` | Run of Show / Room Set | source | No | Partial | room-set linkage from run of show |
| `web/lib/seating-chair-scope-regression.test.ts` | Seating | source | Partial source-only | Partial | matrix-row scoped seating and exact chair contracts |
| `web/lib/seating-plan-scoping-regression.test.ts` | Seating | source | Partial source-only | Partial | seating plan scoping |
| `web/lib/session-command-center-phase1-regression.test.ts` | Sessions | source | No | Partial | session command center phase 1 contracts |
| `web/lib/session-readiness.test.ts` | Sessions | unit | No | No | session readiness logic |
| `web/lib/session-requirement-selection-persistence.test.ts` | Sessions | unit/source | Partial persistence only | No | requirement selection persistence |
| `web/lib/speaker-audit-regression.test.ts` | Speakers | source | No | Partial | speaker audit contracts |
| `web/lib/speaker-bulk-tools-regression.test.ts` | Speakers | source | No | Partial | bulk speaker tools |
| `web/lib/speaker-comms-regression.test.ts` | Speakers | source | No | Partial | speaker communications |
| `web/lib/speaker-conflicts-regression.test.ts` | Speakers | source/unit | No | No | speaker conflict logic |
| `web/lib/speaker-detail-page-shell-regression.test.ts` | Speakers | source | No | Partial | detail page shell |
| `web/lib/speaker-documents-regression.test.ts` | Speakers / Docs | source | No | Partial | speaker documents contracts |
| `web/lib/speaker-files-regression.test.ts` | Speakers / Files | source | No | Partial | speaker file handling |
| `web/lib/speaker-module-hardening-regression.test.ts` | Speakers | source | No | Partial | module hardening |
| `web/lib/speaker-phase1-regression.test.ts` | Speakers | source | No | Partial | phase 1 speaker contracts |
| `web/lib/speaker-portal-preview-regression.test.ts` | Speaker Portal | source | No | Partial | portal preview |
| `web/lib/speaker-portal-regression.test.ts` | Speaker Portal | source | No | Partial | portal contracts |
| `web/lib/speaker-portal-security-regression.test.ts` | Speaker Portal | source | No | Yes | portal security contracts |
| `web/lib/speaker-portal-token-regression.test.ts` | Speaker Portal | source/unit | No | Yes | token behavior and route contracts |
| `web/lib/speaker-readiness-regression.test.ts` | Speakers | source/unit | No | No | readiness behavior |
| `web/lib/speaker-reminders-regression.test.ts` | Speakers | source | No | Partial | reminders |
| `web/lib/speaker-review-regression.test.ts` | Speakers | source/unit | No | Partial | speaker review |
| `web/lib/speaker-review-ui-regression.test.ts` | Speakers | source | No | No | review UI |
| `web/lib/speakers-access-regression.test.ts` | Speakers / Access | api-source | No | Yes | speaker access enforcement |
| `web/lib/tasks-api-routes-regression.test.ts` | Tasks | api-source | No | Partial | task route contracts |
| `web/lib/tasks-service-regression.test.ts` | Tasks | source/unit | No | Partial | task service behavior |
| `web/lib/tasks-ui-regression.test.ts` | Tasks | source | No | No | task UI contracts |
| `web/lib/timeline-add-item-progressive-disclosure-regression.test.ts` | Timeline | source | No | No | add-item progressive disclosure |
| `web/lib/timeline-copy-regression.test.ts` | Timeline | source/unit | No | No | copy behavior |
| `web/lib/timeline-create-edit-regression.test.ts` | Timeline | source | No | Partial | create/edit contracts |
| `web/lib/timeline-dashboard-regression.test.ts` | Timeline | source | No | Partial | dashboard contracts |
| `web/lib/timeline-dashboard-view-regression.test.ts` | Timeline | source | No | No | dashboard view contracts |
| `web/lib/timeline-hierarchy-add-actions-regression.test.ts` | Timeline | source | No | No | hierarchy add actions |
| `web/lib/timeline-hierarchy-views-regression.test.ts` | Timeline | source | No | No | hierarchy views |
| `web/lib/timeline-import.test.ts` | Timeline | unit | No | No | timeline import mapping |
| `web/lib/timeline-inline-edit-regression.test.ts` | Timeline | source | No | No | inline edit contracts |
| `web/lib/timeline-list-date-normalization-regression.test.ts` | Timeline | source/unit | No | No | date normalization |
| `web/lib/timeline-owner-assignment-regression.test.ts` | Timeline | source | No | Partial | owner assignment |
| `web/lib/timeline-taxonomy.test.ts` | Timeline | unit | No | No | timeline taxonomy |
| `web/lib/timezones.test.ts` | Events | unit | No | No | timezone helpers |
| `web/scripts/fnb-catalog-price-display.test.ts` | F&B Catalog | unit/source | No | No | catalog price display |
| `web/scripts/fnb-estimate-summary.test.ts` | F&B | unit/source | No | No | estimate summary |
| `web/scripts/fnb-menu-price-validation.test.ts` | F&B | unit/source | No | No | menu price validation |
| `web/scripts/fnb-parser-feedback.test.ts` | F&B | unit/source | No | No | parser feedback |
| `web/scripts/fnb-source-menus.test.ts` | F&B | unit/source | No | No | source menus |
| `web/scripts/fnb-visual-menu-parser.test.ts` | F&B | unit/source | No | No | visual menu parser |

## 3. Module Coverage Matrix

| Module / feature | Evidence tests | Current coverage | Journey coverage | Risk |
| --- | --- | --- | --- | --- |
| Event creation/import | `event-import-create-regression`, `event-import-builder`, `event-import-builder-ui-regression`, `event-import-*`, `web/lib/test-journeys/planner-core-journeys.test.ts` | Good import mapping/source-contract coverage plus DB-backed event creation reread | Service/data create-event journey covered; no browser create-event journey | Medium-high |
| Event workspace shell/navigation | `event-module-shell-regression`, `event-command-center-*`, `events-page-layout-regression`, `web/lib/test-journeys/planner-core-journeys.test.ts`, `web/e2e/planner-p0-browser-journey.spec.ts` | Source-contract coverage plus workspace-ready Matrix 2 snapshot reread and one browser navigation/reload path | Service/data workspace-ready reread covered; browser coverage exists for seeded Events -> workspace -> Run of Show reload, but not browser event creation | Medium-high |
| Event access/tenancy | `event-access-regression`, `events-visibility-regression`, many module `*-auth-*` tests, `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts`, `web/e2e/planner-access-browser-journey.spec.ts` | Broad source/service assertions plus DB-backed role matrix/read-write denial journeys and one browser EVENT_VIEWER Matrix denied-write journey | Service/data role journey covered for OWNER/ADMIN/MEMBER/VIEWER/EVENT_VIEWER/unrelated/super admin; browser coverage exists for EVENT_VIEWER read + Matrix List write denial, but not every role/module | Medium |
| Run of Show / Matrix 2 | `matrix-import`, `matrix2-*`, `run-of-show-*`, `web/lib/test-journeys/planner-core-journeys.test.ts`, `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts`, `web/e2e/planner-p0-browser-journey.spec.ts`, `web/e2e/planner-access-browser-journey.spec.ts`, `web/e2e/planner-quick-drawer-browser-journey.spec.ts`, `web/e2e/planner-room-set-seating-browser-journey.spec.ts` | Good source/logic coverage plus DB-backed MatrixRow mutation, Matrix 2 snapshot reread, role-gated session write coverage, browser List-view edit/reload, browser EVENT_VIEWER List-edit denial, browser quick drawer speaker assignment, and browser Matrix -> Seating quick action coverage | Service/data Board/List/workspace-compatible and access journey covered; browser coverage exists for seeded List edit/reload, EVENT_VIEWER denied Matrix List edit, quick drawer speaker assignment, and Matrix quick action into Seating, but not Board/full workspace consistency or quick drawer AV/F&B/staffing assignment | Medium |
| Matrix session quick drawer | `matrix2-session-room-flow-regression`, `session-command-center-phase1-regression`, `web/lib/test-journeys/planner-core-journeys.test.ts`, `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts`, `web/e2e/planner-quick-drawer-browser-journey.spec.ts` | Source-contract plus DB-backed quick-drawer data path/access coverage and one browser quick drawer Speakers assignment path | Service/data journey covers Basics, Speakers, AV, F&B catalog, Staffing, removal, and denied writes; browser journey covers adding a speaker through the Speakers quick panel with close/reopen, reload, and DB reread; browser AV/F&B/staffing quick panels still missing | Medium |
| Session Basics/readiness | `session-readiness`, `session-requirement-selection-persistence`, `web/lib/test-journeys/planner-core-journeys.test.ts` | Unit/persistence plus service/data session basics persistence | Service/data session basics reread covered; no UI journey with reload | Medium |
| Speakers | `speaker-*`, `speakers-access-regression`, `web/lib/test-journeys/planner-lifecycle-journeys.test.ts`, `web/e2e/planner-quick-drawer-browser-journey.spec.ts`, `web/e2e/planner-speakers-browser-journey.spec.ts` | Broad source/security coverage plus DB-backed create/assign/comms/onsite/removal lifecycle, browser quick drawer speaker assignment, and browser speaker profile edit | Service/data create -> assign -> reread -> remove journey covered; browser coverage exists for assigning an existing speaker to a session through Matrix quick drawer and editing a seeded speaker's status/title/company from Speakers detail with reload plus DB/service reread, but not speaker create/delete, communications, onsite/readiness, portal/token, or speaker portal browser workflows | Medium-high |
| Speaker portal/token | `speaker-portal-*`, `speaker-portal-token-regression`, `speaker-portal-security-regression`, `web/lib/test-journeys/planner-lifecycle-journeys.test.ts` | Good source/security contracts plus DB-backed token scope/revoke/expiry/submission checks | Service/data portal-token journey covered; no browser portal journey | Medium |
| AV requirements | Matrix/session tests, `web/lib/test-journeys/planner-core-journeys.test.ts` | Service/data AV persistence through Matrix 2 snapshot | Quick-drawer service/data AV journey covered; no browser journey | Medium-high |
| F&B requirements | `fnb-*`, `budget-ops-link-fnb-sync-regression`, `web/lib/test-journeys/planner-core-journeys.test.ts` | Parser/service/source plus session F&B summary/catalog assignment coverage | Service/data F&B journey covered; no browser journey | Medium-high |
| F&B Catalog | `web/scripts/fnb-*` | Script/unit coverage | No catalog UI/API journey | Medium-high |
| F&B Catalog session assignment | `budget-ops-link-fnb-sync-regression`, `fnb-estimate-summary`, `web/lib/test-journeys/planner-core-journeys.test.ts`, `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts` | Partial service/source plus DB-backed session catalog assignment and route guard source coverage | Assign-to-session and access service/data journeys covered; browser assignment/assertion and budget sync journey still missing | Medium |
| Staffing/EventPerson assignments | session/source tests, `web/lib/test-journeys/planner-core-journeys.test.ts` | DB-backed EventPerson/staff assignment coverage through Matrix 2 snapshot | Service/data staffing journey covered; no browser journey | Medium-high |
| Room Set | `web/lib/room-set/*`, `web/lib/test-journeys/planner-core-journeys.test.ts`, `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts`, `web/e2e/planner-room-set-seating-browser-journey.spec.ts` | Broad unit/source/visual plus session-scoped seating data/access journeys and one browser Seating exact-chair assignment path | Service/data Room Set -> Seating chair assignment/access covered; browser covers Matrix quick action -> Seating -> attendee/table inspector -> Chair 1 assignment -> reload -> DB reread, but layout editing, canvas placement, and broader Room Set modes are not browser-covered | Medium |
| Seating | `seating-chair-scope-regression`, `seating-plan-scoping-regression`, `room-set/seating-overlay-mapping`, `web/lib/test-journeys/planner-core-journeys.test.ts`, `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts`, `web/e2e/planner-room-set-seating-browser-journey.spec.ts` | Source/service scoping plus exact chair assignment/reread, denied-write checks, and one browser exact-chair assignment path | Service/data exact chair assignment/access journey covered; browser covers one editor-capable attendee -> table -> Chair 1 path with DB reread of `seatIndex`; browser unassign, drag/drop, auto-assign, multi-table, and access-denial seating paths remain missing | Medium |
| Budget | `budget-*`, `web/lib/test-journeys/planner-lifecycle-journeys.test.ts`, `web/e2e/planner-budget-browser-journey.spec.ts` | Strong unit/source/API-contract coverage plus DB-backed budget line submission and transition rereads plus one browser submit-for-approval path | Service/data budget line -> approval lifecycle covered; browser covers seeded line item visibility, Submit for approval, reload, DB submission/recipient/activity reread, and service snapshot reread; browser approve/reject/revise and Budget denied-write paths remain missing | Medium |
| Budget approvals/activity | budget dashboard/access tests, `web/lib/test-journeys/planner-lifecycle-journeys.test.ts`, `web/e2e/planner-budget-browser-journey.spec.ts` | Service/data coverage for SUBMITTED/REJECTED/REVISED/APPROVED activity and denied write non-mutation plus one browser submit-for-approval route execution | Submit -> reject -> revise -> approve -> activity journey covered at service/data layer; browser submit-for-approval covered for one seeded line item, while browser approve/reject/revise and access-denial paths remain missing | Medium |
| Docs Hub | `docs-hub-upload-auth-regression`, `documents-upload-client`, `account-docs-surface`, `speaker-documents-regression`, `web/lib/test-journeys/planner-lifecycle-journeys.test.ts`, `web/e2e/planner-docs-browser-journey.spec.ts` | Client upload unit, route auth source coverage, DB-backed document/version/review lifecycle, and one browser seeded document review submission path | Service/data Docs lifecycle covered; browser covers seeded document/version visibility, Submit for Review, reload, DB approval reread, and service activity reread; browser upload/presign/finalize with mocked R2 and approve/reject/reopen flows still missing | Medium |
| Document upload/presign/finalize | `documents-upload-client`, `docs-hub-upload-auth-regression` | Good helper sequence and access-source assertions | No live mocked-R2 or browser file upload journey | High |
| Document review/approval/activity | docs and speaker-documents source tests, `web/lib/test-journeys/planner-lifecycle-journeys.test.ts`, `web/e2e/planner-docs-browser-journey.spec.ts` | DB-backed submit/pull-back/approve/reopen approval state coverage plus selected route guard source contracts and one browser submit-for-review route execution | Service/data lifecycle covered; browser submit-for-review covered for one seeded document/version; browser approve/reject/reopen/pull-back and access-denial paths remain missing | Medium |
| Timeline | `timeline-*`, `web/lib/test-journeys/planner-core-journeys.test.ts`, `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts`, `web/e2e/planner-timeline-browser-journey.spec.ts` | Broad source/unit plus service lifecycle/access coverage and one browser Roadmap List status-edit path | Service/data item status/update/dependency/access journey covered; browser covers seeded item status Backlog -> In Progress with reload plus DB/service reread; dependency browser coverage remains missing | Medium |
| Timeline dependencies | `event-import-create-regression`, timeline source tests, `web/lib/test-journeys/planner-core-journeys.test.ts`, `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts` | Partial plus DB-backed dependency creation/reread/access and cross-event rejection | Service/data create dependency and cross-event access journey covered; browser journey still missing | Medium |
| Settings | `event-settings-hub-regression` | Source-contract coverage | No settings journey | Medium |
| Platform Admin/account switching | `platform-admin-*` | Source/service access coverage | No account-switching journey | Medium-high |
| Authentication/session handling | request-user imports asserted by many route tests, `web/playwright.config.ts`, `web/e2e/helpers/planner-e2e.ts` | Partial source-level coverage plus P0 browser coverage through existing development fallback user resolution | No real Supabase/OTP login browser journey or saved-auth-state coverage | High |

## 4. Journey Coverage Assessment

Blunt answer: Planner Dash does not currently have LR-style journey coverage. It has a large and useful regression net, but most of that net is source-contract, parser/unit, or service-level testing. It is not proving that real planners can complete core workflows in a browser and see persisted state after reload.

| Journey | Current status | Evidence | Gap |
| --- | --- | --- | --- |
| Create event -> enter workspace -> reload | Partial service/data + seeded browser navigation | `event-import-create-regression`, `event-import-builder-ui-regression`, `event-module-shell-regression`, `web/lib/test-journeys/planner-core-journeys.test.ts`, `web/e2e/planner-p0-browser-journey.spec.ts` | DB-backed event creation/workspace-ready reread covered; browser navigation/reload exists for a seeded event, but browser event creation remains missing |
| Create/edit Run of Show session -> Board/List/full workspace consistency | Partial service/data + browser List edit + browser quick drawer speaker assignment | `matrix2-*`, `matrix-import`, `run-of-show-*`, `web/lib/test-journeys/planner-core-journeys.test.ts`, `web/e2e/planner-p0-browser-journey.spec.ts`, `web/e2e/planner-quick-drawer-browser-journey.spec.ts` | MatrixRow update and Matrix 2 snapshot reread covered; browser List-view session edit/reload and quick drawer speaker assignment covered, but browser Board/full-workspace consistency is still missing |
| Session quick drawer full edit: Basics, Speakers, AV, F&B, Staffing | Partial service/data + browser Speakers assignment | `matrix2-session-room-flow-regression`, `session-command-center-phase1-regression`, speaker tests, `web/lib/test-journeys/planner-core-journeys.test.ts`, `web/e2e/planner-quick-drawer-browser-journey.spec.ts` | Service/data path covered including assignment removal; browser journey covers Speakers panel add/save/reopen/reload/DB reread; browser Basics, AV, F&B, and Staffing quick drawer paths still missing |
| Room Set -> Seating mode -> assign attendee to exact chair -> reload | Service/data + one browser path | `room-set/*`, `seating-*`, `web/lib/test-journeys/planner-core-journeys.test.ts`, `web/e2e/planner-room-set-seating-browser-journey.spec.ts` | Session-scoped exact chair assignment/reread covered at service/data layer and browser layer for one attendee/table/Chair 1 path; drag/drop, unassign, multi-table, auto-assign, and access-denial seating browser paths remain missing |
| F&B Catalog item -> assign to session -> budget sync/check | Partial | `budget-ops-link-fnb-sync-regression`, `web/scripts/fnb-*` | No catalog/session/budget E2E |
| Docs upload/presign/finalize -> submit review -> approve/reject/reopen -> activity | Partial service/data + one browser review action | `documents-upload-client`, `docs-hub-upload-auth-regression`, `web/lib/test-journeys/planner-lifecycle-journeys.test.ts`, `web/e2e/planner-docs-browser-journey.spec.ts` | Draft/finalize/submit/pull-back/approve/reopen state covered at service/data layer; browser covers seeded document/version -> submit for review -> reload -> DB/service activity reread. Browser upload/presign/finalize with mocked R2 and browser approve/reject/reopen remain missing |
| Budget line item -> submit -> approve/reject/revise -> activity | Partial service/data + one browser submit action | `budget-*`, `web/lib/test-journeys/planner-lifecycle-journeys.test.ts`, `web/e2e/planner-budget-browser-journey.spec.ts` | Service/data submit/reject/revise/resubmit/approve and activity reread covered; browser covers seeded line item -> submit for approval -> reload -> DB/service submission/activity reread. Browser approve/reject/revise and denied-write Budget paths remain missing |
| Speaker create -> assign to session -> portal/token-safe behavior | Partial service/data + seeded planner profile-edit browser path | `speaker-*`, `speakers-access-regression`, `web/lib/test-journeys/planner-lifecycle-journeys.test.ts`, `web/e2e/planner-speakers-browser-journey.spec.ts` | Service/data create/assign/remove, comms/onsite, token scope/revoke/expiry covered; browser planner UI covers seeded speaker detail profile edit for status/title/company with reload and DB/service reread, but browser create/delete, comms/onsite/readiness, portal/token, and speaker portal journeys remain missing |
| Timeline item/dependency lifecycle | Partial service/data + item browser status edit | `timeline-*`, `web/lib/test-journeys/planner-core-journeys.test.ts`, `web/e2e/planner-timeline-browser-journey.spec.ts` | Service lifecycle covered; browser covers one Roadmap List status update and persisted reread. Dependency browser lifecycle remains missing |
| Permission journey OWNER/ADMIN/MEMBER/VIEWER/EVENT_VIEWER | Partial service/data + EVENT_VIEWER browser denial | `event-access-regression`, `events-visibility-regression`, module auth tests, `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts`, `web/e2e/planner-access-browser-journey.spec.ts` | DB-backed role matrix and read/write denial journeys covered; browser EVENT_VIEWER can read a protected Matrix session and cannot persist a List edit; broader role/browser module coverage still missing |
| Cross-org/cross-event isolation | Partial service/data | access/source tests, `web/lib/test-journeys/planner-access-tenancy-journeys.test.ts`, `web/lib/test-journeys/planner-lifecycle-journeys.test.ts` | DB-backed cross-org and cross-event negative assertions covered for Matrix, Seating, F&B, Timeline, Docs, Budget, and Speakers; not universal across every route/module |

## 5. Risk Findings

1. The first Playwright browser E2E framework and P0 journeys now exist, but coverage is intentionally narrow.
2. Source-inspection regression tests are valuable but can pass while runtime behavior, hydration, event handling, file upload, auth cookies, or browser-only UI behavior is broken.
3. During the original audit run, 14 tests failed, concentrated in Matrix 2 and Room Set. After stabilization plus the core, access/tenancy, and lifecycle journey passes, the current full suite is green at 1519/1519.
4. In this sandbox, `tsx` commands may need escalation because the runner can fail to create/listen on an IPC pipe under `/var/folders/...` with `EPERM`.
5. Persist-after-reload behavior is not systematically covered. The P0 browser journeys cover one Run of Show List-view edit/reload path, one EVENT_VIEWER denied-write non-mutation reload path, one quick drawer speaker assignment reload path, one Room Set / Seating exact-chair reload path, one Docs Hub submit-for-review reload path, one Budget submit-for-approval reload path, one Speakers profile edit reload path, and one Timeline Roadmap List status-edit reload path; most modules still lack browser reload journeys.
6. Access checks are often asserted by source patterns. The new browser access test covers EVENT_VIEWER Matrix List edit denial with DB reread, but broader unauthorized live API requests and role-based browser journeys are still needed.
7. Docs upload has promising client-unit, auth-source, service/data lifecycle coverage, and one browser seeded-document review submission path, but no end-to-end upload using mocked R2/presign/finalize.
8. Room Set and Seating are product-critical and complex. Service/data exact-chair coverage exists, and one browser exact-chair assignment path now exists, but layout editing, drag/drop seating, unassign, multi-table, auto-assign, and access-denial seating browser paths are still missing.
9. Budget, Timeline, Speakers, and Matrix have many focused tests, but the highest-value planner journeys across modules are still only partially proven.
10. No CI workflow was found, so even the existing suite may not be enforced consistently on pull requests.

## 6. Recommended Implementation Sequence

### Phase 1: Deterministic Test Harness And Fixtures

Continue expanding the Playwright browser E2E harness with:

- deterministic seed/reset for attendees and documents in addition to the current org/user/event/session/room/speaker/F&B fixture;
- auth-state fixtures or authenticated contexts for OWNER, ADMIN, MEMBER, VIEWER, and EVENT_VIEWER;
- per-run cleanup strategy;
- mocked or local R2-compatible document storage for upload/presign/finalize journeys;
- stable selectors for core Planner Dash surfaces.

The current P0 browser harness is in `web/playwright.config.ts`, `web/e2e/helpers/planner-e2e.ts`, `web/e2e/planner-p0-browser-journey.spec.ts`, `web/e2e/planner-access-browser-journey.spec.ts`, `web/e2e/planner-quick-drawer-browser-journey.spec.ts`, `web/e2e/planner-room-set-seating-browser-journey.spec.ts`, `web/e2e/planner-docs-browser-journey.spec.ts`, and `web/e2e/planner-budget-browser-journey.spec.ts`. It uses the existing development fallback in `web/lib/request-user.ts` through `DEV_USER_EMAIL`, creates real Prisma users, sets `activeOrgId`, and cleans isolated DB fixture data after each test.

### Phase 2: Core Planner Journey E2E Pack

Start with the smallest journeys that catch the largest regressions:

- create event -> enter workspace -> reload;
- create/edit Run of Show session and verify Board/List/workspace consistency;
- session quick drawer edit across Basics, Speakers, AV, F&B, and Staffing;
- create a budget line item and verify persistence;
- upload a document through Docs Hub using mocked storage and verify it appears after reload.

Suggested prompt:

> Add Playwright journeys for event creation, Run of Show session editing, session quick drawer fields, budget line persistence, and Docs Hub upload persistence. Use existing services and APIs; do not rewrite the app.

### Phase 3: Access / Tenancy Journeys And API Contracts

Add live role and isolation checks:

- OWNER/ADMIN/MEMBER/VIEWER/EVENT_VIEWER can and cannot perform expected actions;
- cross-org users cannot read/write another org's event;
- users cannot mutate another event's documents, budget, matrix rows, speakers, seating, or timeline items.

Suggested prompt:

> Add role and tenancy Playwright/API tests covering OWNER, ADMIN, MEMBER, VIEWER, EVENT_VIEWER, cross-org isolation, and cross-event isolation for event, docs, matrix, budget, speakers, timeline, room set, and seating writes.

### Phase 4: Module API / Service Regression

Backfill executable route-handler or service tests for high-risk areas that are currently source-inspection only:

- Docs upload create/presign/finalize;
- Matrix row/session writes;
- Budget approval/activity writes;
- Speaker portal/token access;
- Timeline dependency writes;
- Seating exact chair assignment writes.

Suggested prompt:

> Convert the highest-risk source-contract route tests into executable route/service tests with fixtures, starting with Docs upload, Matrix writes, Budget approvals, Speaker portal tokens, Timeline dependencies, and Seating chair assignment.

### Phase 5: CI Gates And Regression Policy

Add CI gates after the suite is green and stable:

- unit/source tests on every PR;
- focused E2E smoke on every PR;
- fuller journey pack on merge/nightly;
- documented handling for flaky or intentionally quarantined tests;
- fail PRs on new journey regressions.

Suggested prompt:

> Add CI workflows for Planner Dash tests: unit/source on PR, focused Playwright smoke on PR, full journey suite nightly or on main, with clear artifacts and failure output.

## 7. Canonical Commands

Full local verification:

```bash
npm --prefix web run typecheck
npm --prefix web run test:summary
```

Focused harness and journey validation:

```bash
npm --prefix web run test:harness
npm --prefix web run test:journeys
npm --prefix web run test:journeys:core
npm --prefix web run test:journeys:access
npm --prefix web run test:journeys:lifecycle
```

Existing focused commands:

```bash
npm --prefix web run test:room-set
npm --prefix web run test:marketing-email-smoke
```

Browser/E2E commands:

```bash
npm --prefix web run test:e2e:p0
npm --prefix web run test:e2e:access
npm --prefix web run test:e2e:quick-drawer
npm --prefix web run test:e2e:room-set
npm --prefix web run test:e2e:docs
npm --prefix web run test:e2e:budget
npm --prefix web run test:e2e:speakers
npm --prefix web run test:e2e:timeline
npm --prefix web run test:e2e
```

`test:e2e:p0` runs the current P0 Playwright journeys. `test:e2e:access` runs the focused EVENT_VIEWER Matrix denied-write browser journey. `test:e2e:quick-drawer` runs the focused Matrix quick drawer speaker assignment browser journey. `test:e2e:room-set` runs the focused Room Set / Seating exact-chair browser journey. `test:e2e:docs` runs the focused Docs Hub submit-for-review browser journey. `test:e2e:budget` runs the focused Budget submit-for-approval browser journey. `test:e2e:speakers` runs the focused Speakers profile edit browser journey. `test:e2e:timeline` runs the focused Timeline Roadmap List status-edit browser journey. `test:e2e` runs the full Playwright suite as it grows.

## 8. Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `npm --prefix web run test:harness` | Passed | Final focused harness validation: 1/1. |
| `npm --prefix web run test:journeys:core` | Passed | Final focused core journey validation: 5/5. |
| `npm --prefix web run test:journeys:access` | Passed | Final focused access/tenancy journey validation: 7/7. |
| `npm --prefix web run test:journeys:lifecycle` | Passed | Final focused lifecycle journey validation: 6/6. |
| `npm --prefix web run test:journeys` | Passed | Final aggregate journey validation: 18/18. |
| `npm --prefix web run test:e2e:access` | Passed | Final focused Playwright EVENT_VIEWER Matrix denied-write browser validation: 1/1. |
| `npm --prefix web run test:e2e:quick-drawer` | Passed | Final focused Playwright Matrix quick drawer speaker assignment browser validation: 1/1. |
| `npm --prefix web run test:e2e:room-set` | Passed | Final focused Playwright Room Set / Seating exact-chair validation: 1/1. |
| `npm --prefix web run test:e2e:docs` | Passed | Final focused Playwright Docs Hub submit-for-review browser validation: 1/1. |
| `npm --prefix web run test:e2e:budget` | Passed | Final focused Playwright Budget submit-for-approval browser validation: 1/1. |
| `npm --prefix web run test:e2e:speakers` | Passed | Final focused Playwright Speakers profile edit browser validation: 1/1. |
| `npm --prefix web run test:e2e:timeline` | Passed | Final focused Playwright Timeline Roadmap List status-edit browser validation: 1/1. |
| `npm --prefix web run test:e2e:p0` | Passed | Final Playwright P0 browser journey validation: 8/8. |
| `npm --prefix web run typecheck` | Passed | Final TypeScript verification. |
| `npm --prefix web run test:summary` | Passed | Final full suite: 1519 tests, 1519 pass, 0 fail. |
| `sed -n '1,260p' /Users/ali/.codex/attachments/57012710-d850-4520-b102-4d7d18e527df/pasted-text.txt` | Passed | Read Budget browser journey request. |
| `git status --short --untracked-files=all` | Passed | Showed the scoped Budget/browser/docs working-tree changes. |
| `git status --short prisma web/prisma` | Passed | Confirmed no Prisma schema or migration changes. |
| `git diff --check` | Passed | Confirmed no whitespace errors. |
| `pwd` | Passed | Confirmed repo root. |
| `sed -n '1,220p' package.json` | Passed | Inspected root scripts and workspace shape. |
| `sed -n '1,260p' web/package.json` | Passed | Inspected app test scripts. |
| `rg --files ... | rg ...` | Passed | Discovered test and config candidates. |
| `find . ... -name '*.test.*' -o -name '*.spec.*'` | Passed | Found 123 test files. |
| `find docs web/docs ... -iname '*test*' ...` | Passed | No existing testing docs found. |
| `find .github -maxdepth 3 -type f` | Passed | No CI workflow files found. |
| `find . ... -iname 'playwright.config.*' ...` | Passed | Original audit found no browser test config before this Playwright pass. |
| `sed` reads of representative tests | Passed | Sampled docs, Event Builder, import, matrix, seating, and upload tests. |
| `npm --prefix web run test:summary` | Failed | Sandbox `EPERM` on `tsx` IPC pipe. |
| `npm --prefix web run test:summary` with escalated sandbox | Failed | Suite ran: 1500 tests, 1486 pass, 14 fail. |
| `rg -n '^not ok' /tmp/planner-full-test-run.tap` | Passed | Identified failing tests listed above. |
| Node classification script over discovered tests | Passed | Used for audit classification; terminal output was truncated due volume. |

## 9. Final Summary

Planner Dash has a broad regression suite with many useful source-contract, parser, unit, service, and client-helper checks. That suite is valuable and should not be discarded.

The blunt LR-style answer from the original audit was: no, the coverage did not prove the core Planner Dash journeys in a browser. Planner Dash now has service/data/API-source journey coverage through the harness and three journey packs, plus deterministic Playwright P0 browser journeys for seeded Events -> workspace -> Run of Show List edit -> reload -> persisted DB reread, EVENT_VIEWER read access -> Matrix List edit denial -> DB/reload non-mutation, Matrix quick drawer Speakers panel assignment -> close/reopen -> reload -> DB reread, Room Set / Seating attendee -> table inspector -> Chair 1 assignment -> reload -> DB reread with `seatIndex`, Docs Hub seeded document/version -> submit for review -> reload -> DB/service activity reread, Budget seeded line item -> submit for approval -> reload -> DB/service submission/activity reread, Speakers seeded profile -> Edit Profile status/title/company -> reload -> DB/service reread, and Timeline Roadmap seeded item -> status edit -> reload -> DB/service reread. The repo still lacks browser E2E coverage for real Supabase/OTP login, full role matrix coverage, quick drawer Basics/AV/F&B/staffing paths, F&B catalog UI assignment, broader Room Set/Seating UI paths, Docs upload/presign/finalize with mocked R2, Docs approve/reject/reopen, Budget approve/reject/revise and denied-write flows, broader Speakers workflows beyond profile edit, Timeline dependencies, and speaker portal workflows.

Current implementation confidence is strongest for isolated import/parsing/helper behavior and weakest for end-to-end user flows, especially broader Room Set + Seating paths beyond the new exact-chair assignment, Docs lifecycle, Budget approvals, Matrix quick drawer paths beyond speaker assignment, access/tenancy beyond the P0 EVENT_VIEWER Matrix denial, and cross-module persistence.
