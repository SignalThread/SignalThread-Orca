# Lead Retrieval Full Test Coverage Audit

Date: 2026-06-30

## Executive Summary

The repo has a large and useful test base, but coverage is not exhausted. The strongest coverage is in pure unit tests, source-contract tests, fake-Supabase integration tests, journey-style node tests, and a handful of Playwright UI flows. The weakest coverage is real authenticated API invocation, real browser journeys for the full product promise, live/provider canaries, documents beyond library UI and send-linkage contracts, real audio upload/provider processing, Google Sheets/import upload UI, and true all-test orchestration.

The biggest false-confidence risk is naming. `npm run test:all` does not run all tests. In the current working tree it expands to 102 explicit node test files. It does not run `tests/journeys/*`, Playwright, typecheck, build, 130 node test files under `tests/`, or 4 test files outside `tests/` and `e2e/`. The current `npm run test:full` is broader, but still omits 116 node test files plus 4 repo-local test files outside `tests/` and `e2e/`.

The second biggest risk is that many "journey" tests are not true E2E. They are valuable, deterministic, and often use real pure/business logic, but many assert route/service behavior through source-contract checks because `server-only` modules cannot be imported in the node:test lane. Provider-backed steps are usually skipped or contract-tested, not proven with real OpenAI, SendGrid, transcription, R2 multipart, Google Sheets, HubSpot, Salesforce, Apollo, PDL, or ZoomInfo environments.

Recommendation: keep the existing fast suites, but add a real `test:node:all` that discovers every node test file including journeys, make `test:full` call it plus Playwright, typecheck, and build, and create a separate opt-in `test:canary` lane for provider/live DB coverage. Do not pretend provider coverage exists unless the test calls the provider or a real sandbox.

## Current Test Inventory By Script

### `npm run test:all`

Current script:

```bash
npm run test:help-docs &&
npm run test:leads-export &&
npm run test:signal-create-payload &&
npm run test:campaign-builder-signals &&
npm run test:invite-auth-membership-activation &&
npm run test:campaign-send &&
npm run test:platform-admin-users-role &&
npm run test:company-scoped-user-actions &&
npm run test:company-scoped-invite &&
npm run test:admin-users-filters &&
npm run test:exhibitor-users &&
npm run test:mobile-events &&
npm run test:access-matrix &&
npm run test:route-contracts &&
npm run test:invite-lifecycle &&
npm run test:schema-contract &&
npm run test:data-integrity &&
npm run test:exhibitor-leads-drilldown &&
npm run test:campaign-audience-order &&
npm run test:exhibitor-lead-delete &&
npm run test:serialize-search-params &&
npm run test:field-mapping &&
npm run test:import-source &&
npm run test:import-batch &&
npm run test:import-batch-rows &&
npm run test:import-validation &&
npm run test:import-briefing &&
npm run test:publish-v1 &&
npm run test:zoominfo &&
npm run test:enrichment-scope &&
npm run test:briefing-rls &&
npm run test:workflow
```

What it actually runs:

- 102 explicit/expanded node test files.
- No `tests/journeys/*`.
- No Playwright.
- No `npm run typecheck`.
- No `npm run build`.
- No repo-local tests under `app/**` or `lib/**/__tests__`.
- It also omits many normal `tests/*.test.ts` files.

Examples of important tests omitted by `test:all`:

- Audio/conversation: `tests/conversation-processing-lifecycle.test.ts`, `tests/conversation-insight-contract.test.ts`, `tests/context-voice-note-complete.test.ts`, `tests/process-upload-voice-notes.test.ts`, `tests/conversations-upload-access.test.ts`.
- RBAC/auth/scope: `tests/company-event-access.test.ts`, `tests/exhibitor-access-model.test.ts`, `tests/exhibitor-mobile-app-authorization.test.ts`, `tests/e2e-auth-bypass-policy.test.ts`, `tests/apple-review-login-policy.test.ts`.
- Campaign/agents: `tests/llm-draft-generator.test.mjs`, `tests/default-campaign-agent-names.test.ts`, `tests/signal-scope-ownership.test.ts`, `tests/signal-delete-authorization.test.ts`.
- Workflows: `tests/workflow-crm-sync-hubspot-handler.test.ts`, `tests/workflow-crm-sync-salesforce-handler.test.ts`, `tests/workflow-template-status.test.ts`, `tests/workflow-detail-display-pure.test.ts`.
- UI/source contracts: `tests/exhibitor-leads-manual-create-contract.test.ts`, `tests/exhibitor-lead-temperature-patch.test.ts`, `tests/import-wizard-layout-contract.test.ts`.

### `npm run test:journeys`

Current script runs 14 node journey files:

- `tests/journeys/journey-harness-smoke.test.ts`
- `tests/journeys/lead-create.e2e.test.ts`
- `tests/journeys/lead-update.e2e.test.ts`
- `tests/journeys/lead-delete.e2e.test.ts`
- `tests/journeys/lead-document.e2e.test.ts`
- `tests/journeys/lead-audio-lifecycle.e2e.test.ts`
- `tests/journeys/workflow-trigger.e2e.test.ts`
- `tests/journeys/workflow-wait-resume.e2e.test.ts`
- `tests/journeys/agent-create.e2e.test.ts`
- `tests/journeys/agent-draft.e2e.test.ts`
- `tests/journeys/draft-send.e2e.test.ts`
- `tests/journeys/rbac-scope.e2e.test.ts`
- `tests/journeys/cross-surface-lead-truth.e2e.test.ts`
- `tests/journeys/golden-exhibitor-journey.e2e.test.ts`

These are valuable but mostly node-level journeys. Many are source contracts, pure business logic, fake-Supabase execution, or opt-in live DB skips. They are not a substitute for browser/provider E2E.

### `npm run test:workflow`

Current script runs 25 files:

- `tests/workflow-trigger-resolver.test.ts`
- `tests/workflow-feature-flag.test.ts`
- `tests/workflow-create-workflow-core.test.ts`
- `tests/workflow-template-delete.test.ts`
- `tests/enrichment-provider-capabilities.test.ts`
- `tests/workflow-builder-graph.test.ts`
- `tests/workflow-create-run-rows.test.ts`
- `tests/workflow-create-run-idempotency.test.ts`
- `tests/workflow-lead-reconciler.test.ts`
- `tests/workflow-internal-auth.test.ts`
- `tests/internal-health-conversation-lifecycle.test.ts`
- `tests/workflow-enrich-lead-handler.test.ts`
- `tests/workflow-handler-registry.test.ts`
- `tests/workflow-capture-path-no-inline-enrich.test.ts`
- `tests/workflow-import-materialization-emit.test.ts`
- `tests/lead-qualification-change.test.ts`
- `tests/workflow-run-completes-after-enrich.test.ts`
- `tests/workflow-compose-campaign-draft-pure.test.ts`
- `tests/workflow-compose-campaign-draft-handler.test.ts`
- `tests/workflow-campaign-draft-persistence.test.ts`
- `tests/workflow-execute-runs-to-idle.test.ts`
- `tests/workflow-draft-runner-pause.test.ts`
- `tests/workflow-draft-approval-flow.test.ts`
- `tests/workflow-no-auto-send-source-contract.test.ts`
- `tests/workflow-trigger-rule-ui-config.test.ts`

Coverage is strong for workflow pure logic, runner behavior, waiting/resume, approval gating, draft persistence, idempotency, health, and no-auto-send source contracts. It does not run all workflow-related tests in the repo, such as CRM sync handlers, workflow detail display, template status UI/source contract, workflow lead activity, builder provider/signal tests, or workflow campaign delete UI contract.

### `npm run test:full`

Current script:

```bash
npm run test:all &&
npm run test:journeys &&
npm run test:workflow &&
npx playwright test --reporter=line &&
npx tsc --noEmit &&
npm run build
```

This is closer to a full suite, but not true full coverage:

- It redundantly runs `test:workflow` because `test:all` already includes it.
- It runs all Playwright specs by default.
- It still omits 116 node test files under `tests/`.
- It omits 4 repo-local test files outside `tests/` and `e2e/`:
  - `app/auth/reset/password-form-state.test.ts`
  - `lib/campaigns/__tests__/signal-prompt-composer.integration.test.ts`
  - `lib/campaigns/__tests__/signal-prompt-composer.test.ts`
  - `lib/campaigns/__tests__/signal-source-of-truth.test.ts`

## Playwright Inventory

Playwright specs present under `e2e/`:

- `e2e/admin-smoke.spec.ts`: critical exhibitor UI smoke, selected-lead brief workspaces, review edits/approval, import wizard copy, exhibitor access.
- `e2e/admin-users.spec.ts`: platform admin users filters, selected event behavior, delete control affordance.
- `e2e/auth.spec.ts`: role routing and access boundaries for exhibitor, platform admin, organizer.
- `e2e/documents.spec.ts`: documents page loads, list/search behavior, add document/link modal copy. Does not prove upload persistence or send delivery.
- `e2e/exhibitor-leads-command-surface.spec.ts`: lead selection, selected export, campaign creation from selected leads, briefing workspace creation, bulk/row delete, inline rating/temperature workflow evaluation, non-qualification edits.
- `e2e/exhibitor-leads-redirect-and-dashboard.spec.ts`: app route redirects, dashboard drilldowns, lead filters.
- `e2e/exhibitor-leads-ux.spec.ts`: leads list filter chips, selection, bulk bar behavior.
- `e2e/leads-auth-scope.spec.ts`: auth-only user blocked from leads without public profile.
- `e2e/leads.spec.ts`: basic lead search/filter.
- `e2e/licenses.spec.ts`: admin license management, exhibitor user seats, invites, seat exhaustion, forged inputs, event/company scope.
- `e2e/login-otp-smoke.spec.ts`: OTP login UI smoke.
- `e2e/signals.spec.ts`: campaign agents/signals list, default system signal behavior, filters, create/edit/duplicate/remove.
- `e2e/smoke.spec.ts`: platform/exhibitor page loads, open lead detail, trigger enrich lead.
- `e2e/example.spec.ts`: Playwright starter example; likely should be removed from product full suite.

Playwright gaps:

- No browser test for real campaign builder -> generated draft -> approval -> campaign message detail.
- No browser test for campaign send with sandboxed SendGrid.
- No browser test for audio upload/chunked upload -> processing status -> transcript/synthesis/readiness truth.
- No browser test for real document upload, preview, send, click tracking, and wrong-tenant denial.
- No browser test for Google Sheets import connection/path beyond copy.
- No browser test for full import wizard CSV upload -> mapping -> validation -> enrichment -> briefing -> publish.
- No browser test for workflow builder create/edit/status/delete plus activity/detail page as one journey.
- No browser test for CRM sync flows with sandbox HubSpot/Salesforce.
- No browser test for mobile backend contracts beyond API/source tests.

## Current Coverage By Product Area

### Workflows

Current coverage:

- Unit: trigger resolver, feature flag, create workflow core, builder graph, run row builder, trigger rule UI config, handler registry.
- Integration/fake DB: create-run idempotency, lead reconciler, execute-runs-to-idle, draft pause, draft approval, enrich handler, wait/resume, import materialization emit.
- Source contract: no auto-send, capture path does not inline enrich, internal auth/middleware.
- Journey: trigger and wait/resume node journeys, plus Golden journey chain with fake-Supabase.
- Playwright: lead inline rating/temperature triggers workflow run in `e2e/exhibitor-leads-command-surface.spec.ts`; signal UI coverage in `e2e/signals.spec.ts`.

Assessment:

- Workflows are tested at unit and integration level.
- Workflows are partially tested at journey level.
- Workflows are thin at Playwright level for builder/detail/activity/approval status surfaces.

Missing:

- `tests/workflow-crm-sync-live-canary.test.ts` or `tests/canaries/workflow-crm-sync-live-canary.test.ts` for sandbox HubSpot/Salesforce.
- `e2e/workflow-builder-lifecycle.spec.ts` for create/edit/activate/deactivate/delete and event/company scope.
- `e2e/workflow-approval-journey.spec.ts` for draft approval/rejection from UI.
- `e2e/workflow-activity-detail.spec.ts` for activity filters, pending approvals, terminal failed/completed display.

### Campaigns, Drafts, And Sends

Current coverage:

- Unit: selected audience order, campaign send status, campaign builder signal availability, LLM prompt generation, compose params/context/error classification.
- Integration/fake DB: workflow campaign draft persistence, compose handler, draft pause/approval, official campaign artifact promotion.
- Source contract: no workflow auto-send, send service locks/dedupes/provider id.
- Journey: agent draft and draft send node journeys.
- Playwright: selected leads create campaign from UI; no deep send journey.

Assessment:

- Campaign draft creation is well tested below browser level.
- Send is mostly source-contract and status logic. Real provider send is not proven.
- Draft approval exists below browser level, not as a full UI journey.

Missing:

- `tests/campaign-route-handlers.test.ts` for direct route handler/source contracts on create/update/delete/recipients/messages/generate-draft/send.
- `e2e/campaign-builder-to-draft.spec.ts` for selected leads -> campaign builder -> draft generation UI.
- `e2e/campaign-draft-approval.spec.ts` for generated draft approval/rejection UI.
- `tests/canaries/sendgrid-campaign-send-canary.test.ts` for sandbox SendGrid send with provider id and `sent_at`.

### Agents And Signals

Current coverage:

- Unit: signal create payload, prompt composer tests, source of truth tests, default campaign agent names, signal scope ownership/delete authorization.
- Integration: signal prompt composer integration tests exist, but some live under `lib/campaigns/__tests__` and are not included in current scripts.
- Journey: agent create and agent draft node journeys.
- Playwright: `e2e/signals.spec.ts` covers campaign agents UI create/duplicate/remove and system/default signal behavior.

Assessment:

- Good unit and UI coverage for signal CRUD basics.
- Signal RBAC has tests, but `lib/data/signals.ts` still contains TODOs to reintroduce RBAC validation for create/update/delete business rules. Treat this as a risk even if route-level tests pass.
- Live LLM draft generation is not proven.

Missing:

- Include `lib/campaigns/__tests__/signal-source-of-truth.test.ts` and prompt composer tests in full suite.
- `tests/signals-rbac-mutation-service.test.ts` for create/update/delete business rules once RBAC TODOs are addressed.
- `tests/canaries/openai-agent-draft-canary.test.ts` for a sandbox OpenAI generation with content safety assertions.
- `e2e/agent-draft-generation.spec.ts` for campaign agent selection -> generated draft displayed.

### Documents

Current coverage:

- Unit/source contract: account-scoped documents library, document send route/account isolation, no direct `lead_id` on documents, supported linkage through `document_sends`.
- Journey: lead document node journey documents the direct attach gap and proves send-to-lead linkage via contract/opt-in live path.
- Playwright: documents list/search/add modal copy.

Assessment:

- Documents are under-tested compared with importance.
- Upload, preview, delete, R2 object cleanup, send delivery, click tracking, and wrong-scope route behavior are not fully journey-tested.
- Direct lead document attachment is not a supported feature. Current tests correctly mark it blocked rather than faking it.

Missing:

- `tests/documents-upload-route.test.ts` for upload/link create, R2 metadata, `rep_sendable`, event/account scope.
- `tests/documents-preview-scope.test.ts` for preview route authorization and wrong-account denial.
- `tests/documents-send-route.test.ts` for send route behavior without real delivery and `document_sends` persistence.
- `tests/documents-click-tracking.test.ts` for click route idempotency and scope.
- `e2e/documents-upload-preview-send.spec.ts` for UI upload/link create, preview, send modal, delete.
- `tests/canaries/document-sendgrid-canary.test.ts` if document send uses SendGrid in production.

### Audio, Conversations, Readiness, And Recovery

Current coverage:

- Unit/fake DB: upload access, processing lifecycle, process-upload voice notes, context voice note completion, conversation insight contract, needs-processing, health lifecycle, readiness reconciliation, no-speech/empty transcript handling.
- Journey: lead audio lifecycle node journey proves display truth, stale-processing recovery, no-storage failure, side-effect failure tolerance.
- Workflow: wait/resume and health tests cover readiness and stale drift.
- Playwright: none for upload/status/transcript/synthesis UI.

Assessment:

- Backend recovery and health coverage is strong after the readiness work.
- Real upload/chunked upload/R2/transcription/synthesis provider path is not proven in automated tests.
- UI truth for live upload processing is not proven by browser tests.

Missing:

- `tests/conversation-chunked-upload-route.test.ts` for session/chunk-urls/complete/abort/finalize contracts and idempotency.
- `tests/conversation-readiness-reconciler.test.ts` if readiness reconciliation grows beyond current health test coverage.
- `tests/conversation-upload-finalize-route.test.ts` for finalize access, storage path, status initialization, and no content leakage.
- `e2e/audio-upload-processing.spec.ts` for upload/recording UI -> processing -> transcript/synthesis/readiness visible truth.
- `tests/canaries/conversation-audio-provider-canary.test.ts` or use existing `conversation:canary` as an opt-in CI canary with clear env gates.

### Imports, CSV, Google Sheets, Enrichment, And Briefings

Current coverage:

- Imports: source selection, batch draft, batch rows service, validation derive, field mapping, custom fields, publish v1, publish materialization/linkage, enrichment handoff/staleness.
- Briefings: extensive pure/source tests for briefing gates, source fingerprint, blocks derive, enrich-from-context, AI polish prompt, queue/review/approval/sync, selected-lead workspaces, UI copy, RLS.
- Playwright: admin smoke covers selected-lead brief workspace and some import wizard copy only.

Assessment:

- Briefing logic is heavily tested, but much is source-contract or pure logic.
- The import wizard is not covered as a full browser journey with real file upload, mapping, validation, enrichment, briefing queue, review, approval, publish, and lead linkage.
- Google Sheets appears in route/docs/copy, but real Google Sheets read/auth/error behavior is not covered.

Missing:

- `e2e/import-wizard-csv-to-publish.spec.ts` for CSV upload -> mapping -> validation -> publish -> lead rows.
- `e2e/import-wizard-briefing-review.spec.ts` for import -> briefing queue -> review/edit/approve -> lead_briefings sync.
- `tests/import-google-sheets-route.test.ts` for URL parsing, auth errors, sheet read failures, empty sheet handling.
- `tests/import-csv-parser-edge-cases.test.ts` for encodings, duplicate headers, empty rows, large file limits.
- `tests/canaries/google-sheets-import-canary.test.ts` if a sandbox sheet is available.
- `tests/canaries/zoominfo-enrichment-canary.test.ts`, `tests/canaries/apollo-enrichment-canary.test.ts`, `tests/canaries/pdl-enrichment-canary.test.ts` for provider-gated enrichment.

### RBAC, Tenancy, Company Scope, Event Scope

Current coverage:

- Very broad pure/source coverage: access matrix, event access modes, company/event/license scoping, invites, seats, mobile events, route contracts, RLS migration/source checks, viewer restrictions.
- Playwright: auth role routing, licenses/seat flows, admin users, leads auth scope.

Assessment:

- This is one of the better-covered areas.
- Gaps remain where source contracts stand in for real route calls and DB RLS.
- Cross-tenant browser tests exist but are not uniform across every major resource.

Missing:

- `e2e/rbac-cross-tenant-matrix.spec.ts` for leads, documents, campaigns, workflows, signals, imports, briefings across two companies and event scopes.
- `tests/rls-policies-contract.test.ts` to scan migrations/policies for critical tables consistently.
- `tests/api-route-authz-matrix.test.ts` for a table-driven contract of API route auth/session/scope checks.
- `tests/mobile-backend-contracts.test.ts` for bearer auth contracts beyond mobile events.

### Mobile And Shared Backend Contracts

Current coverage:

- Mobile events access, app web entry, mobile authorization, viewer bootstrap RLS, Apple review login policy, help docs for offline/voice notes.
- Lead create route source contracts mention bearer/mobile idempotency.

Assessment:

- Mobile backend contracts are partially covered.
- Mobile recording/upload payload and offline sync behavior are not comprehensively covered in this repo.
- No mobile UI/Maestro coverage is included in `test:full`.

Missing:

- `tests/mobile-lead-create-bearer-contract.test.ts` for bearer path, client UUID idempotency, replay, event access, no inline enrichment.
- `tests/mobile-audio-upload-contract.test.ts` for mobile upload payload shape and additive recording semantics.
- `tests/mobile-offline-sync-contract.test.ts` for offline replay/idempotency/conflict handling if implemented.
- Add a documented mobile/Maestro full-suite lane if mobile app tests live outside this repo.

### API Routes

Current coverage:

- Some routes are directly or source-contract tested: lead create/update/delete/list/export, import wizard routes, briefing routes, generated draft approve/reject, workflow tick/internal health, invite routes, documents send/source, integrations partially.
- Many route handlers are not directly invoked because of `server-only` constraints.

Assessment:

- API route coverage is uneven.
- UI tests are too brittle for every API edge; direct route/API tests should be added where possible, and source-contract tests should be treated as lower confidence.

Missing:

- `tests/api-campaigns-route-contracts.test.ts`
- `tests/api-documents-route-contracts.test.ts`
- `tests/api-conversations-route-contracts.test.ts`
- `tests/api-integrations-route-contracts.test.ts`
- `tests/api-signals-route-contracts.test.ts`
- `tests/api-workflows-route-contracts.test.ts`
- `tests/api-auth-session-route-contracts.test.ts`

### Help Docs

Current coverage:

- `tests/help-docs-content.test.ts` exists and `test:help-docs` runs it.
- Docs exist for leads, voice notes, recording/AI, campaigns/follow-up, integrations, permissions, settings/account, admin backend backlog.

Missing:

- `tests/help-docs-route-coverage.test.ts` to ensure every `docs/help/**.md` is reachable through `lib/help/help-content.ts` and app help routes.
- `tests/help-docs-product-truth.test.ts` for dangerous drift: direct document attach, provider availability, no-auto-send, audio status labels, and RBAC phrasing.

## Missing Unit Tests

P0:

- `tests/conversation-chunked-upload-state-machine.test.ts`
- `tests/mobile-lead-create-bearer-contract.test.ts`
- `tests/documents-upload-model.test.ts`
- `tests/api-route-authz-matrix.test.ts`
- `tests/test-script-inventory.test.ts` to fail when a test file is not included in full suite discovery.

P1:

- `tests/import-csv-parser-edge-cases.test.ts`
- `tests/import-google-sheets-normalize.test.ts`
- `tests/signals-rbac-mutation-service.test.ts`
- `tests/workflow-crm-effective-config.test.ts` should be included in workflow script or full discovery.
- `tests/campaign-route-input-validation.test.ts`
- `tests/help-docs-route-coverage.test.ts`

P2:

- `tests/admin-route-surface-contracts.test.ts`
- `tests/exhibitor-settings-route-contracts.test.ts`
- `tests/integration-settings-redaction.test.ts`
- `tests/load-test-route-access.test.ts`

## Missing Integration/API Tests

P0:

- `tests/conversation-upload-finalize-route.test.ts`
- `tests/conversation-chunked-upload-route.test.ts`
- `tests/documents-upload-route.test.ts`
- `tests/documents-preview-scope.test.ts`
- `tests/documents-send-route.test.ts`
- `tests/api-campaigns-route-contracts.test.ts`
- `tests/api-workflows-route-contracts.test.ts`

P1:

- `tests/import-google-sheets-route.test.ts`
- `tests/import-wizard-file-upload-route.test.ts`
- `tests/briefing-knowledge-upload-route.test.ts`
- `tests/signals-route-authz.test.ts`
- `tests/integrations-route-redaction.test.ts`

P2:

- `tests/account-delete-route-contract.test.ts`
- `tests/admin-integration-test-routes-authz.test.ts`
- `tests/v1-public-api-auth-contract.test.ts`

## Missing Journey Tests

P0:

- `tests/journeys/real-api-lead-create-update-delete.e2e.test.ts` for real authenticated route invocation when a test auth/session harness exists.
- `tests/journeys/audio-upload-to-readiness-live.e2e.test.ts` with provider gates, not fake final state.
- `tests/journeys/import-csv-to-briefing-publish.e2e.test.ts`.
- `tests/journeys/campaign-draft-approval-to-send.e2e.test.ts`.

P1:

- `tests/journeys/document-upload-preview-send.e2e.test.ts`.
- `tests/journeys/workflow-builder-activity-approval.e2e.test.ts`.
- `tests/journeys/provider-enrichment-to-workflow-draft.e2e.test.ts`.
- `tests/journeys/rbac-two-company-live.e2e.test.ts`.

P2:

- `tests/journeys/help-docs-critical-path.e2e.test.ts`.
- `tests/journeys/settings-active-event-cross-surface.e2e.test.ts`.

## Missing Playwright Tests

P0:

- `e2e/audio-upload-processing.spec.ts`
- `e2e/import-wizard-csv-to-publish.spec.ts`
- `e2e/campaign-builder-to-draft.spec.ts`
- `e2e/workflow-builder-lifecycle.spec.ts`
- `e2e/rbac-cross-tenant-matrix.spec.ts`

P1:

- `e2e/documents-upload-preview-send.spec.ts`
- `e2e/import-wizard-briefing-review.spec.ts`
- `e2e/workflow-approval-journey.spec.ts`
- `e2e/agent-draft-generation.spec.ts`
- `e2e/integrations-settings.spec.ts`

P2:

- `e2e/help-critical-docs.spec.ts`
- `e2e/settings-active-event.spec.ts`
- `e2e/organizer-leads-dashboard.spec.ts`

Remove or exclude from product full suite:

- `e2e/example.spec.ts`

## Missing Live/Provider Canaries

These should be opt-in, tagged, and skipped unless explicit sandbox credentials are present. They should never run against uncontrolled production data.

P0:

- `tests/canaries/conversation-audio-provider-canary.test.ts`: small safe audio -> transcription -> synthesis -> readiness -> health clean.
- `tests/canaries/sendgrid-campaign-send-canary.test.ts`: campaign send to sandbox recipient -> provider id -> sent state.
- `tests/canaries/openai-agent-draft-canary.test.ts`: lead context + signal -> draft JSON shape, no placeholders.

P1:

- `tests/canaries/document-sendgrid-canary.test.ts`
- `tests/canaries/google-sheets-import-canary.test.ts`
- `tests/canaries/zoominfo-enrichment-canary.test.ts`
- `tests/canaries/hubspot-crm-sync-canary.test.ts`
- `tests/canaries/salesforce-crm-sync-canary.test.ts`

P2:

- `tests/canaries/apollo-enrichment-canary.test.ts`
- `tests/canaries/pdl-enrichment-canary.test.ts`
- `tests/canaries/r2-multipart-upload-canary.test.ts`

## Edge Cases Still Missing Or Under-Proven

- Stale states: audio has good stale-processing coverage; documents/campaigns/imports need stale/partial failure cleanup tests.
- Failures: provider failures are often classified but not canaried against real provider error shapes.
- Retries: workflows and audio have retry/idempotency coverage; imports, Google Sheets, document sends, and campaign sends need more retry/dedup tests.
- Duplicates: lead create/mobile replay and workflow idempotency are covered; document sends, campaign recipients, import rows, and briefing publish duplicates need more direct coverage.
- Cleanup: E2E cleanup helpers exist, but every new Playwright/provider canary must tag and clean all rows/storage objects.
- Scope: broad tests exist, but not every route/resource has a two-tenant live/browser denial test.
- UI truth: audio readiness, workflow approval state, generated drafts, provider failures, document sends, and import publish state need more browser-level truth tests.

## Risky Areas Where Current Tests Give False Confidence

- `test:all` and current `test:full` sound comprehensive but omit many test files.
- Journey tests use `.e2e.test.ts` names, but many are not browser or full-stack E2E.
- Source-contract tests can pass while runtime behavior breaks due to refactors, auth/session behavior, or query semantics.
- Fake Supabase tests can miss PostgREST/RLS/query-builder behavior.
- Provider-gated tests are usually skipped; skipped provider tests are useful documentation, not proof.
- Playwright tests rely on seeded/live-ish data and sometimes skip when data is absent, so they do not always prove setup-independent behavior.
- `e2e/example.spec.ts` is not product coverage but is currently included by a blanket Playwright run.
- Signal mutation RBAC has explicit TODOs in `lib/data/signals.ts`; treat current signal scope coverage as incomplete until service-layer authorization is restored or intentionally documented.
- Documents coverage may imply "lead document attach"; the product only supports company/account library documents and send-to-lead linkage.
- Mobile coverage is mostly backend contract/source-level; actual mobile UI/offline/audio behavior is not covered here.

## Recommended Test Scripts

Add a discovery-based node suite so new tests cannot be silently omitted:

```json
{
  "test:node:all": "node --import tsx --test tests app lib",
  "test:playwright": "npx playwright test --reporter=line",
  "test:verify": "npm run typecheck && npm run build",
  "test:full": "npm run test:node:all && npm run test:playwright && npm run test:verify",
  "test:canary": "node --import tsx --test tests/canaries"
}
```

Before implementing this exact command, validate Node's directory discovery against this repo. If `node --test tests app lib` picks up non-test files or misses `.mjs`, add `scripts/run-node-tests.mjs` to discover files matching:

- `tests/**/*.test.ts`
- `tests/**/*.spec.ts`
- `tests/**/*.test.mjs`
- `app/**/*.test.ts`
- `lib/**/*.test.ts`
- `lib/**/*.test.mjs`

Recommended CI lanes:

- Fast PR: `npm run test:node:all && npm run typecheck`
- Browser PR or nightly: `npm run test:playwright`
- Release gate: `npm run test:full`
- Opt-in provider/nightly: `npm run test:canary`

## Priority Order

### P0

1. Fix full-suite orchestration: add discovered `test:node:all`; update `test:full`; exclude `e2e/example.spec.ts`.
2. Add test inventory guard: `tests/test-script-inventory.test.ts`.
3. Add browser coverage for audio upload/status truth: `e2e/audio-upload-processing.spec.ts`.
4. Add browser coverage for import CSV -> publish: `e2e/import-wizard-csv-to-publish.spec.ts`.
5. Add campaign draft/send route and UI coverage: `tests/api-campaigns-route-contracts.test.ts`, `e2e/campaign-builder-to-draft.spec.ts`.
6. Add document upload/preview/send route coverage: `tests/documents-upload-route.test.ts`, `tests/documents-preview-scope.test.ts`, `tests/documents-send-route.test.ts`.
7. Add two-tenant browser RBAC matrix: `e2e/rbac-cross-tenant-matrix.spec.ts`.

### P1

1. Add provider canaries for OpenAI, SendGrid, audio provider, Google Sheets, ZoomInfo.
2. Add workflow builder lifecycle and approval UI Playwright tests.
3. Add Google Sheets route tests.
4. Add import briefing review browser journey.
5. Add signal mutation service RBAC tests.
6. Add mobile lead/audio/offline backend contract tests.

### P2

1. Add help docs route/product-truth coverage.
2. Add organizer/admin less-used surface Playwright tests.
3. Add integration settings UI and redaction tests for every provider.
4. Add load-test route access tests and public v1 API auth contracts.

## Direct Answers To Audit Questions

1. We currently have 250 repo test files: 232 under `tests/` including 14 journeys, 14 Playwright specs under `e2e/`, and 4 test files under `app/` or `lib/`.
2. `npm run test:all` runs 102 explicit node test files through named scripts. It is not all tests.
3. `npm run test:journeys` runs 14 node journey files under `tests/journeys/`.
4. `npm run test:workflow` runs 25 workflow-adjacent node tests.
5. Playwright has 14 specs covering auth, admin/users/licenses, documents list UI, leads command/list/dashboard UX, signals UI, smoke, and some briefing/import UI. It does not cover audio, full import publish, full campaign draft/send, full workflow builder/approval, or provider canaries.
6. Workflows are tested at unit and integration level, partially at journey level, and lightly at Playwright level.
7. Campaigns are tested at unit/integration and partial journey level; Playwright and live send coverage are missing.
8. Agents/signals are tested at unit, journey, and Playwright CRUD level; live LLM generation and service-layer mutation RBAC remain gaps.
9. Drafts/no-auto-send are well source/integration tested; actual sends are not live-provider tested.
10. Documents are under-tested. Library UI and send-linkage contracts exist; upload/send/read/scope need deeper route, browser, and canary coverage.
11. Audio backend lifecycle/recovery/readiness is strong in node tests; real upload/provider and browser UI truth are missing.
12. Imports are well covered in pure/source tests; CSV/Google Sheets/import wizard full browser journeys and provider canaries are missing.
13. Briefing flows are heavily tested below browser level and partially in Playwright; full import-to-briefing-to-publish browser coverage is missing.
14. RBAC/scope is broadly tested, but not uniformly through live/browser two-tenant matrices across every resource.
15. Mobile/shared backend contracts are partially tested; mobile lead create/audio/offline sync need explicit tests or a separate mobile lane.
16. Some API routes are tested directly or by source contract; many important routes need route/API tests because UI tests would be brittle.
17. Major UI journeys are only partially covered by Playwright.
18. Provider-gated paths are generally skipped or source-contracted; true provider canaries are missing.
19. There are remaining edge-case gaps around provider failures, retries, duplicates, storage cleanup, import/document/campaign stale states, and scope across every resource.
20. The desired single command should become `npm run test:full`, but only after it is changed to run discovered node tests, Playwright, typecheck, and build. Today it is not a true full suite.
