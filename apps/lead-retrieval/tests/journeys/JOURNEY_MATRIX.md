# LR Core Journey Matrix — Phase 1

Canonical product-journey test plan for Lead Retrieval. This document is the source
of truth for **which core customer jobs are proven end to end**, what each journey
must assert, and where current coverage actually lives.

It exists because isolated file/function tests missed the Nick audio incident: every
piece had a test, but no test walked the full lifecycle (upload row → transcription →
synthesis → readiness → workflow resume → terminal state → UI/API truthfulness). The
matrix generalizes that lesson to every core function.

> Scope of this document (Prompt 1): **documentation only.** No product code, no test
> harness code, no fixtures are added by this file. Status values below describe
> *journey-level* coverage, and intentionally distinguish "strong unit/contract
> coverage exists" from "a real end-to-end journey test exists."

---

## Test infrastructure facts (must read before writing journey tests)

These constrain how the Phase 2 harness and Phase 3+ journey tests can be built.

| Concern | Reality in this repo |
|---|---|
| Unit/contract runner | Node's built-in `node:test` via `tsx` — **not** Vitest/Jest. Invoked as `node --import tsx --test tests/<file>.test.ts`. Scripts live in `package.json` (`test:*`, aggregated by `test:all`). |
| Dominant `/tests` pattern | Pure logic + contract tests with **inline fixtures** or an **in-memory Supabase shim** (`tests/helpers/fake-supabase.ts`). No live DB by default. |
| Live-DB integration tests | Exist but are **env-gated** (e.g. `leads-export-supabase.integration.test.ts` requires `LEADS_EXPORT_INTEGRATION=1` + Supabase URL/key + a test company id). `before()/after()` insert and clean up by scope. |
| Browser / true E2E | Playwright under `/e2e`, against a running server with `E2E_AUTH_BYPASS_ENABLED=true`, real Supabase via service key (`e2e/helpers/supabase.ts`). Storage states in `e2e/storage/*.json`. |
| Cleanup / tagging convention | `randomUUID()` test-run id; fixtures tagged via a name/prefix (`e2eWorkflowArtifactNamePrefix(testRunId)`); reverse-dependency cleanup via `cleanupPersistentTestArtifactsForRun()` and `scripts/cleanup-e2e-artifacts.ts` (dry-run unless `--confirm-local`, guarded by `NODE_ENV`/`VERCEL_ENV`). See `e2e-artifact-cleanup-contract.test.ts`, `e2e-auth-bypass-policy.test.ts`. |
| Provider-backed paths | Draft generation calls **OpenAI** (`gpt-4o-mini`). Draft send uses **SendGrid** (`SENDGRID_API_KEY`). Audio transcription/synthesis use external providers. All of these are **environment-gated** and must skip cleanly when keys/sandbox are absent. |

**Implication for status (Phases 1–4 complete).** Every core journey now has a journey test
under `tests/journeys/` that drives the **real canonical logic** (importable pure modules) and
asserts the journey end to end, falling back to **source contracts** for `server-only`
routes/services and to **opt-in live-DB** round-trips where a test DB is configured. Steps that
require real external IO (live company/event/user provisioning, audio/transcription/synthesis
providers, OpenAI, SendGrid) are **conditionally skipped with exact reasons**, never faked — those
belong to the Playwright `/e2e` lane. "implemented" below means the journey is proven at the layers
runnable in the node:test lane; remaining real-IO coverage is called out per journey.

---

## Status legend

- **implemented** — a real journey test exists (or could be written today with no blockers) that drives the supported path and asserts DB/async/API truth.
- **partial** — parts are covered by unit/contract tests, but no single test proves the full journey; or the journey is only provable at one layer.
- **pending** — feature exists but no journey-grade coverage and a harness/env prerequisite is needed first.
- **blocked** — the journey (as written in the plan) is not supported by the current product, or needs a provider/sandbox not available in test env.

---

## Summary

| # | Journey | What it proves | Status | Primary current coverage |
|---|---|---|---|---|
| 1 | Lead create | New lead created via real path, scoped correctly | implemented (contract+live) | `tests/journeys/lead-create.e2e.test.ts` |
| 2 | Lead update | Editable fields persist; derived temperature/score correct | implemented (contract+live) | `tests/journeys/lead-update.e2e.test.ts` |
| 3 | Lead delete | Hard delete is explicit and scoped | implemented (contract+live) | `tests/journeys/lead-delete.e2e.test.ts` |
| 4 | Lead document | Document attach/read/scope to a lead | blocked (attach) / implemented (send linkage) | `tests/journeys/lead-document.e2e.test.ts` |
| 5 | Lead audio lifecycle | Upload → transcript → synthesis → readiness → terminal | implemented (reconciler+display truth) | `tests/journeys/lead-audio-lifecycle.e2e.test.ts` |
| 6 | Agent create/config | Signal ("agent") created and scoped | implemented (real scope builder) | `tests/journeys/agent-create.e2e.test.ts` |
| 7 | Agent draft generation | Draft generated from real lead context | implemented (pure logic) / provider-gated (LLM) | `tests/journeys/agent-draft.e2e.test.ts` |
| 8 | Draft send | Draft sent via supported provider, sent-state truthful | implemented (status+contract) / provider-gated (send) | `tests/journeys/draft-send.e2e.test.ts` |
| 9 | Workflow trigger (new lead) | New lead creates correct workflow run | implemented (real resolver+builder) | `tests/journeys/workflow-trigger.e2e.test.ts` |
| 10 | Workflow trigger (updated lead) | Lead update triggers/does-not-trigger correctly | implemented (qualification gating) | `tests/journeys/workflow-trigger.e2e.test.ts` |
| 11 | Workflow wait/resume | Run waits only when required and resumes on readiness | implemented (real resume engine) | `tests/journeys/workflow-wait-resume.e2e.test.ts` |
| 12 | Cross-surface lead truth | Mobile/Admin/API/DB agree on lead state | implemented (shared fields + derivation) | `tests/journeys/cross-surface-lead-truth.e2e.test.ts` |
| 13 | RBAC / scope | Right users access right records; wrong scope rejected | implemented (real access rules) | `tests/journeys/rbac-scope.e2e.test.ts` |
| 14 | Golden Exhibitor Journey | Capture → follow-up action as one chain | implemented (chained real logic) | `tests/journeys/golden-exhibitor-journey.e2e.test.ts` |

---

## Journeys

Each journey lists: purpose · setup · action · expected DB state · expected
async/worker state · expected API/UI-visible state · cleanup · failure/retry behavior ·
current coverage · status · gaps/TODOs.

---

### 1. Lead create

- **Purpose:** A new lead can be created through the real supported path (web manual create and mobile offline capture) and is scoped to the correct company/event/owner.
- **Setup:** Clean test company, event, exhibitor user (with mutate permission). Auth via session (web) or Bearer token (mobile).
- **Action:** `POST /api/exhibitor/leads/create` (legacy `POST /api/exhibitor/leads` delegates here). Mobile path is idempotent on a client-supplied UUID v4.
- **Expected DB state:** Row in `public.leads` with `full_name` set; `company_id` (NOT NULL) correct; `event_id` set for event-scoped/mobile capture, null otherwise; `owner_user_id` = creator; defaults `status='new'`, `priority_score=0`, `temperature` nullable, `rating=0`.
- **Expected async/worker state:** May emit a `lead_captured` workflow trigger (see Journeys 9–10). Create must not depend on the workflow succeeding.
- **Expected API/UI-visible state:** Lead appears in the exhibitor lead list/detail for the owning company/event; not visible to other companies.
- **Cleanup:** Delete created lead(s) by id in a `finally` block; remove the test company/event/user fixtures created for the run.
- **Failure/retry behavior:** Mobile replay with the same UUID must not duplicate the lead (idempotent). Missing `full_name` → rejected. Inaccessible `event_id` → rejected by `assertEventIdAccessibleForUser`.
- **Current coverage:** `tests/journeys/lead-create.e2e.test.ts` (canonical-route source contract: real insert→select path, scope columns, defaults, temperature derivation, workflow emit, idempotent replay + cross-account guard; plus opt-in live persistence/scope round-trip). Supporting: `exhibitor-leads-manual-create-contract.test.ts`, `lead-workflow-qualification.test.ts`.
- **Status:** implemented (contract + opt-in live). The auth-gated `POST` route itself (real session) is exercised by the Playwright `/e2e` lane; the node:test lane cannot invoke it because it pulls in `server-only` and resolves a real session — see constraint below.
- **Gaps/TODOs:** A bearer-token live invocation of the real route in the node:test lane remains optional follow-up.

### 2. Lead update

- **Purpose:** Editable lead fields persist and derived fields (temperature ↔ priority_score) stay correct.
- **Setup:** Created test lead (Journey 1).
- **Action:** `PATCH /api/exhibitor/leads/[leadId]` through `normalizeExhibitorLeadPatch` (`lib/leads/exhibitorLeadPatch.ts`). Editable: `full_name`, `email`, `job_title`, `company_text`, `rating`, `status`, `follow_up_date`, `temperature` (canonical) or legacy `priority_score`, plus enrichment fields.
- **Expected DB state:** Patched columns updated; `updated_at` bumped. If client sends legacy `priority_score`, it is converted to canonical `temperature` (hot≈85, warm≈50, cold≈20 bands per `lib/leads/temperature.ts`). `rating` is independent of temperature.
- **Expected async/worker state:** A qualification change (`leadQualificationChanged`) may emit a `lead_captured` workflow via `attemptLeadCapturedWorkflowEmit` (see Journey 10).
- **Expected API/UI-visible state:** Updated values read back through the same exhibitor API/service the app/admin uses; legacy clients still see a coherent `priority_score`.
- **Cleanup:** Delete the lead in `finally`.
- **Failure/retry behavior:** Invalid temperature/status/date format → normalized rejection without partial write. Re-applying the same patch is safe (no spurious workflow emits beyond qualification-change semantics).
- **Current coverage:** `tests/journeys/lead-update.e2e.test.ts` (route contract + real `normalizeExhibitorLeadPatch`/`leadQualificationChanged` + live seed→patch→read-back). Supporting units: `exhibitor-lead-temperature-patch.test.ts`, `leads-temperature.test.ts`, `lead-detail-schedule-follow-up-action.test.ts`, `lead-qualification-change.test.ts`.
- **Status:** implemented (contract + opt-in live). The normalization is the real product helper; live persistence runs when the journey DB env is configured.
- **Product reality proven:** the patch writes the **canonical `temperature`** field only — it never writes `priority_score` (a legacy presentation-derived bridge, hot 85 / warm 50 / cold 20), and `rating` is independent of temperature. A temperature update therefore does not rewrite the stored `priority_score` column.

### 3. Lead delete

- **Purpose:** Delete is explicit, hard, and company-scoped — not silently converted to archive/soft-delete.
- **Setup:** Created test lead(s).
- **Action:** Single `DELETE /api/exhibitor/leads/[leadId]` (`deleteExhibitorLeadForCompany`); bulk `POST /api/exhibitor/leads/bulk-delete` (`deleteExhibitorLeadsBulkForCompany`, max 200).
- **Expected DB state:** **Hard delete** — row removed via Supabase `.delete()` scoped by `company_id`. No `deleted_at`/`archived_at`/`is_deleted` column exists. Bulk returns a partition `{ deleted[], missing[], forbidden[] }`.
- **Expected async/worker state:** None required. (Downstream rows referencing the lead follow existing FK behavior; verify no orphan/stuck workflow waits for a deleted lead during Journey 11.)
- **Expected API/UI-visible state:** Lead no longer returned by list/detail; UI confirms "cannot be undone".
- **Cleanup:** Deletion is itself the cleanup for the lead; still remove company/event/user fixtures. Cleanup must tolerate an already-deleted lead.
- **Failure/retry behavior:** Deleting another company's lead → `forbidden`. Deleting a missing id → `missing`, not an error. Bulk over 200 → rejected. Bulk denies `exhibitor_viewer` (`denyExhibitorViewer: true`).
- **Current coverage:** `tests/journeys/lead-delete.e2e.test.ts` (service/route source contract: hard `.delete()` scoped by company_id, verify-exactly-one, no archive/soft-delete substitution, bulk guards; real `partitionLeadIdsForExhibitorDelete`; plus opt-in live hard-delete end-state + idempotent re-delete). Supporting: `exhibitor-lead-detail-delete-action.test.ts`, `exhibitor-lead-delete-partition.test.ts`.
- **Status:** implemented (contract + opt-in live). Delete **is** supported and is a hard delete — not substituted by archive.
- **Gaps/TODOs:** Cross-company live rejection needs a second test company id (`JOURNEY_TEST_COMPANY_ID_B`); currently proven via the pure partition helper.

### 4. Lead document

- **Purpose:** A document can be attached/read in the correct lead/company/event scope.
- **Setup:** Test company/event/user/lead; a tiny safe dummy document fixture.
- **Action / reality:** Documents are created at **company/account scope** via `POST /api/exhibitor/documents` (file or link; `asset_kind`), optionally event-scoped. They are **not** attachable to a specific lead. The only lead linkage is `document_sends.lead_id`, created when a rep **sends** a document to a lead via `POST /api/exhibitor/documents/send`.
- **Expected DB state:** `documents` row keyed by `account_id` (company), optional `event_id`, `storage_path`/`file_url` in **R2** (`lib/r2.ts`). A `document_sends` row carries `document_id`, `lead_id` (nullable), `recipient_email`, `provider_message_id`, `clicked_at`.
- **Expected async/worker state:** Send path issues an email (provider-gated) and may record click/preview tracking; no transcription/synthesis equivalent.
- **Expected API/UI-visible state:** Document appears in the company "Documents & Links" library (`/exhibitor/documents`); a send is reflected against the lead via its send record.
- **Cleanup:** Delete created `document_sends` then `documents` rows and the R2 object; remove fixtures. Never touch non-test documents.
- **Failure/retry behavior:** Cross-account read denied by RLS/account isolation. Send to a lead the user cannot access → rejected. Provider-less env → send must skip cleanly.
- **Current coverage:** `tests/journeys/lead-document.e2e.test.ts` — source contract (account-scoped create/list with no `lead_id`; send route scopes doc/template by account, gates `rep_sendable`, writes a `document_sends` row linking document+lead+recipient+sender; SendGrid delivery is provider-gated), an explicit **pending** test for the direct-attach gap, and an opt-in live linkage + account-isolation test (link-kind doc, no R2). Supporting: `documents-library-link-contract.test.ts`, `documents-email-account-isolation.test.ts`.
- **Status:** **blocked** for "attach document directly to a lead" (not a product capability — recorded as a pending test); **implemented** for the supported "send document to a lead" linkage (contract + opt-in live).
- **Gaps/TODOs:** Live linkage needs `JOURNEY_TEST_USER_ID` (FK for `uploaded_by`/`sent_by`); SendGrid email delivery stays out of scope here (provider-gated, covered conceptually by journey 8).

### 5. Lead audio lifecycle

- **Purpose:** Audio upload reaches transcription, synthesis, readiness, and a truthful terminal display state — the Nick-incident regression lane.
- **Setup:** Test company/event/user/lead; a known short, safe audio fixture.
- **Action:** Upload via `POST /api/conversations/upload` (or chunked `…/chunked/{session,chunk-urls,complete}` + `…/finalize`). Access gated by `assertLeadUploadAccess` (`lib/conversations/upload-access.ts`). V2 context notes also flow through `adopt_voice_note_from_upload`.
- **Expected DB state:** `lead_conversations` row with `storage_path`, `transcription_status` and `synthesis_status` progressing `pending → processing → completed|failed`, plus `transcript`/`summary` and insight columns; `lead_voice_notes` for the cumulative timeline; `lead_conversation_readiness` per-lead transcript/insights status+version.
- **Expected async/worker state:** `process-upload.ts` starts transcription, then `processConversationSynthesisForCompletedTranscript`; readiness marked via `conversation-readiness.ts`; `reconcileStaleConversationProcessing` (`reconcile-stale-processing.ts`, invoked by `/api/internal/workflow-tick`) requeues items stuck >10min (batch 10) and fails items with no storage path using sanitized errors. Terminal = both statuses `completed` or `failed` (empty/no-speech transcript → synthesis `failed` with the empty-transcript error).
- **Expected API/UI-visible state:** After the supported tick/reconciler, no row reports indefinite "processing"; display state is terminal and truthful. A completed transcript with pending synthesis is recoverable **without overwriting the transcript**.
- **Cleanup:** Delete created `lead_conversations`, `lead_voice_notes`, `lead_conversation_readiness` rows and storage objects; remove fixtures. Never log audio/transcript contents.
- **Failure/retry behavior:** Stale processing requeued at the 10-min threshold; missing storage path → safe terminal failure; provider/readiness side-effect failure must not block transcription from starting; reconciler sanitizes errors to avoid secret leakage.
- **Current coverage:** `tests/journeys/lead-audio-lifecycle.e2e.test.ts` — journey-framed: drives the REAL reconciler (`reconcileStaleConversationProcessing`) over `fake-supabase` to prove completed-transcript+pending-synthesis recovers **without overwriting the transcript**, stale-pending requeue, and missing-storage safe-fail; asserts display-state truth via the REAL `deriveConversationDisplayStatus` (processing only while pending/processing; no_speech / failed / insights_ready are terminal, never stuck "processing"); proves a failing readiness side effect does not abort the lifecycle. Real upload+provider path is an explicit skip (no sandbox provider; route is server-only). Granular coverage remains in `conversation-processing-lifecycle.test.ts`, `conversations-upload-access.test.ts`, `context-voice-note-complete.test.ts`, `process-upload-voice-notes.test.ts`, `lead-conversation-needs-processing.test.ts`, `conversation-insight-contract.test.ts`.
- **Status:** implemented — the Nick-incident lane is proven via the real reconciler + real display derivation. A real-provider upload E2E remains an opt-in `/e2e` follow-up.
- **Gaps/TODOs:** add a real-provider upload→terminal run in the Playwright `/e2e` lane if/when a sandbox transcription provider exists.

### 6. Agent create / config

- **Purpose:** An "agent" can be created and scoped correctly.
- **Setup:** Test company/event/user.
- **Action / reality:** In this product an **"agent" is a Signal** (not a separate config entity). Signals have categories `AI_POWERED | CONTEXTUAL | CALL_TO_ACTION | CUSTOM`, scopes default/company/event/private, and prompts (`default_prompt`, `admin_override_prompt`). Default named agents seeded by migration (e.g. "Conversation Brief Agent", "Follow-Up Agent"). Created/edited through the signal create/config routes.
- **Expected DB state:** Signal row with `name`, `category`, scope columns (`signal_scope`, `company_id`, `event_id`, `owner_user_id`), `is_active`, tone/visibility fields.
- **Expected async/worker state:** None on create; the signal is later consumed during draft generation (Journey 7).
- **Expected API/UI-visible state:** Signal visible to the campaign/workflow builder for the allowed role/scope; private/company/event scoping respected.
- **Cleanup:** Delete created signals in reverse dependency order; never delete default/global signals.
- **Failure/retry behavior:** Out-of-scope or unauthorized create/read/delete rejected (`signal-delete-authorization`, `signal-scope-ownership`).
- **Current coverage:** `tests/journeys/agent-create.e2e.test.ts` — drives the real `buildSignalInsertPatch` proving company/event/default scope resolution (`signal_scope`, `company_id`, `event_id`, `owner_user_id` default + override, role visibility), plus an opt-in live signal insert (scope persisted + cleanup; needs `JOURNEY_TEST_USER_ID`). Authorization by scope: `signal-scope-ownership.test.ts`, `signal-delete-authorization.test.ts`. Supporting: `signal-create-payload.test.ts`, `default-campaign-agent-names.test.ts`.
- **Status:** implemented — canonical scope resolution proven with the real builder; authz covered by existing scope/ownership tests.
- **Gaps/TODOs:** unauthorized cross-scope read/use against live rows is a `/e2e` follow-up.

### 7. Agent draft generation

- **Purpose:** A draft email is generated from real lead context using configured signals.
- **Setup:** Test lead with meaningful fields; required campaign/workflow/agent (signal) config; optional enrichment/conversation context.
- **Action:** Compose-campaign-draft step (`lib/workflows/step-handlers/compose-campaign-draft*.ts`) → `lib/campaigns/llm-draft-generator.ts` (`buildLlmDraftPrompts`) → **OpenAI** `gpt-4o-mini` (temp 0.35), JSON subject+body. Persistence via `persistWorkflowCampaignDraft` (`lib/campaigns/workflow-campaign-draft-persistence.ts`).
- **Expected DB state:** If `requires_approval=true`, a `generated_drafts` row (`approval_status='pending'`) and **no** campaign yet. If false, upserted `campaigns` (status `draft`), `campaign_recipients` (`lead_id`), `campaign_messages` (subject/body, status `draft`), deduped `selected_signal_ids`.
- **Expected async/worker state:** Runs as a workflow step; may pause `awaiting_approval`. Must not auto-send (Journey 8).
- **Expected API/UI-visible state:** Draft links to the correct lead/campaign/message; uses the lead's actual context; must not leak raw provider errors, internal enums, or storage paths.
- **Cleanup:** Delete `campaign_messages` → `campaign_recipients` → `campaigns` and `generated_drafts`; remove lead/signal fixtures.
- **Failure/retry behavior:** Placeholder-leak and lead-specific-greeting validation enforced. OpenAI unavailable/keyless → must skip cleanly; do not assert generated text content when provider is absent.
- **Current coverage:** `tests/journeys/agent-draft.e2e.test.ts` — real pure logic: `parseComposeCampaignDraftParams`, `orderSignalsByIds` (configured-order + missing), `resolveRecipientContextForLead` (grounds the draft in the lead's actual full_name/job_title/company, enrichment overrides), and provider-error classification (`classifyComposeDraftError` → config/transient/validation; `composeDraftErrorToResult` → stable internal codes, not leaked draft content). Source contract: persistence writes campaigns/campaign_recipients/campaign_messages; the runner routes `requires_approval` → generated_drafts. Live OpenAI generation is an explicit skip. Supporting: `workflow-compose-campaign-draft-pure.test.ts`, `workflow-campaign-draft-persistence.test.ts`, `llm-draft-generator.test.mjs`.
- **Status:** implemented for the deterministic logic (params/selection/context/error-mapping/persistence linkage); live LLM generation is provider-gated (skipped with exact reason).
- **Gaps/TODOs:** a real OpenAI draft generation run belongs to the `/e2e` lane when a provider/sandbox is configured.

### 8. Draft send

- **Purpose:** A draft can be sent through the supported path, with sent-state and provider id truthfully recorded — or explicitly skipped when the send path is unavailable.
- **Setup:** A created/generated draft (Journey 7) for a lead with an email.
- **Action:** `executeCampaignSend` (`lib/campaigns/executeCampaignSend.ts`) → `sendCampaignMailViaSendGrid` (`lib/server/email/sendCampaignMail.ts`, `@sendgrid/mail`). Workflows **never** auto-send — send happens only through explicit campaign send routes (enforced by source contract).
- **Expected DB state:** Campaign status CAS `draft|scheduled|failed → sending → sent|failed`; per-recipient result with `provider_message_id` or error; `sent`/`sent_at` set on success.
- **Expected async/worker state:** None beyond the send execution; workflow runtime must not import send/SendGrid modules.
- **Expected API/UI-visible state:** Status reflects real outcome (no fake "sent" before provider confirms); duplicate send blocked/idempotent.
- **Cleanup:** Delete campaign/recipient/message rows; remove fixtures. Never send to real customer addresses.
- **Failure/retry behavior:** Any recipient failure/no-email → campaign `failed`; re-send guarded by the `sending` lock.
- **Current coverage:** `tests/journeys/draft-send.e2e.test.ts` — real `resolveFinalCampaignStatus` (sent only when all recipients succeed; failed otherwise); source contract on `executeCampaignSend` (draft|scheduled|failed → sending CAS lock, double-send guard on `sent`/`sending`, `provider_message_id` persisted, canonical final-status resolution); SendGrid requires real credentials (no fake delivery); the compose runner imports neither the send service nor SendGrid. Live send is an explicit skip. Supporting: `campaign-send-status.test.ts`, `workflow-no-auto-send-source-contract.test.ts`.
- **Status:** implemented for status truthfulness + send/no-auto-send contract; the live send itself is provider-gated (skipped with exact reason — no sandbox SendGrid transport).
- **Gaps/TODOs:** a real/sandbox SendGrid send + sent_at/provider-id assertion belongs to the `/e2e` lane.

### 9. Workflow trigger (new lead)

- **Purpose:** Creating a new lead produces the correct workflow run.
- **Setup:** Clean company/event/exhibitor user; a workflow template/rule eligible for new leads.
- **Action:** Create a lead (Journey 1) → `lead_captured` emit → `trigger-resolver` matches templates by scope (`any`/`event`/`continuous_capture`) and optional `event_id` pin → `createWorkflowRunsForCapture`.
- **Expected DB state:** `workflow_runs` row referencing correct `lead_id`/`company_id`/`event_id`, with `trigger_event='lead_captured'`, a `trigger_fingerprint`, and initial `status` (`queued`/`running`/`awaiting_approval` per template). `workflow_step_runs` materialized for steps.
- **Expected async/worker state:** Run advances via the tick/runner toward idle; idempotency on `trigger_fingerprint` prevents duplicate runs on replay.
- **Expected API/UI-visible state:** Run visible in workflow activity/inspector for the owning scope.
- **Cleanup:** Delete `workflow_step_runs` → `workflow_runs` → lead/template; reverse-dependency order.
- **Failure/retry behavior:** Duplicate capture/replay does not create duplicate runs (`workflow-create-run-idempotency`). Non-matching scope creates no run.
- **Current coverage:** `tests/journeys/workflow-trigger.e2e.test.ts` — real `isTemplateEligibleForLead`/`filterEligibleTemplatesForLead` (scope + event pin) and the real `buildWorkflowRunInsertRows` proving the run row references the captured lead/company/event with `trigger_event`, a stable `trigger_fingerprint`, and correct initial status (queued vs immediately-completed for zero steps). Supporting: `workflow-trigger-resolver.test.ts`, `workflow-create-run-rows.test.ts`, `workflow-create-run-idempotency.test.ts`.
- **Status:** implemented — the trigger eligibility + run-row construction are proven with the real pure builders.
- **Gaps/TODOs:** a live lead-create → real run row insertion remains a `/e2e` follow-up (create-run is `server-only`).

### 10. Workflow trigger (updated lead)

- **Purpose:** Updating a lead triggers (or correctly does not trigger) a workflow.
- **Setup:** Created lead + eligible template.
- **Action:** `PATCH` the lead (Journey 2); qualification change detection (`leadQualificationChanged`) and the lead reconciler (`workflow-lead-reconciler`) decide whether to emit. Reconciler modes: dry-run (no changes), normal (create runnable runs), safe-create (held `awaiting_approval`).
- **Expected DB state:** A new `workflow_runs` row only when the update constitutes a qualifying capture (e.g. rating/temperature/source thresholds). If updates are not meant to trigger, **no** run is created and that is asserted explicitly.
- **Expected async/worker state:** Reconciler is idempotent per fingerprint; safe-create produces held runs awaiting approval.
- **Expected API/UI-visible state:** Run (if any) reflects the updated lead context.
- **Cleanup:** Same as Journey 9.
- **Failure/retry behavior:** Re-running the reconciler does not duplicate runs; dry-run never writes.
- **Current coverage:** `tests/journeys/workflow-trigger.e2e.test.ts` (qualification gating: a raw new lead does not qualify — matching the create route deferring emit — while an update crossing rating/temperature/status qualifies). Canonical updated-lead reconciler path covered by `workflow-lead-reconciler.test.ts`; supporting `lead-qualification-change.test.ts`, `lead-workflow-qualification.test.ts`.
- **Status:** implemented — the trigger/no-trigger decision for updates is proven via the real `leadHasWorkflowQualificationSignal`.
- **Gaps/TODOs:** end-to-end reconciler run-creation on a live updated lead remains a `/e2e` follow-up.

### 11. Workflow wait/resume

- **Purpose:** A run waits only when required (audio transcript / conversation insights / approval) and resumes once readiness/context exists — with no stuck waits remaining.
- **Setup:** A run whose step needs conversation context or approval.
- **Action:** Step handler returns `kind:"wait"` → step/run status `waiting_for_audio_transcript` / `waiting_for_conversation_insights`, storing `workflowDataRequirements`, `required_conversation_version`, `wait_expires_at`. Resume via `resumeWaitingWorkflowStepsForLead` (`lib/workflows/runner/resume-waiting.ts`) checking `lead_conversation_readiness` versions; approval resume via the draft approval routes.
- **Expected DB state:** While waiting, run/step in a `waiting_*` (or `awaiting_approval`) status, not `completed`. After readiness/approval, step re-`queued` and run advances to `completed`.
- **Expected async/worker state:** Stale audio version updates `required_conversation_version` and keeps waiting; timeout → `failed` with `timed_out_waiting_for_audio_transcript`. Requires the audio lifecycle (Journey 5) to provide readiness.
- **Expected API/UI-visible state:** No indefinite/stuck wait remains for the test lead/workflow once context exists.
- **Cleanup:** Delete runs/step-runs/readiness rows; remove lead/conversation fixtures.
- **Failure/retry behavior:** Resume is idempotent; approval gates the next step; timeouts terminate cleanly rather than hang.
- **Current coverage:** `tests/journeys/workflow-wait-resume.e2e.test.ts` — drives the REAL `resumeWaitingWorkflowStepsForLead` over `fake-supabase`: resumes once insight readiness reaches the required version (run/step → queued, no waiting run remains); stays waiting and refreshes the required version for stale audio; times out cleanly with `timed_out_waiting_for_audio_transcript` past the deadline. Supporting: `workflow-draft-runner-pause.test.ts`, `workflow-execute-runs-to-idle.test.ts`, `workflow-run-completes-after-enrich.test.ts`, `workflow-draft-approval-flow.test.ts`.
- **Status:** implemented — wait/resume/timeout + "no stuck waits remain" proven with the real resume engine.
- **Gaps/TODOs:** the full audio→readiness→resume chain across surfaces is exercised by the Golden journey (journey 14).

### 12. Cross-surface lead truth

- **Purpose:** Mobile, Admin, API, and DB agree on a lead's core fields and derived state.
- **Setup:** A created/updated lead readable through more than one surface/service path.
- **Action:** Write via one supported path; read via the path another surface uses.
- **Expected DB state:** Single canonical `leads` row; no surface-specific duplicate state.
- **Expected async/worker state:** N/A (consistency check, not async).
- **Expected API/UI-visible state:** Shared fields agree across surfaces: `full_name`, `job_title`, `company_text`, `rating`, `priority_score`, `status`, `follow_up_date`, `temperature`, and event/company scope. No stale derived state causes false display/action.
- **Cleanup:** Delete the lead; remove fixtures.
- **Failure/retry behavior:** A mismatch is reported as a **product bug**, not patched broadly.
- **Current coverage:** `tests/journeys/cross-surface-lead-truth.e2e.test.ts` — asserts the shared core lead fields (full_name, job_title, company_text, rating, status, follow_up_date, event_id, company_id) are read by the create, detail GET/PATCH, and export surfaces, and proves the one representational divergence stays coherent: app/admin carry canonical `temperature` while export carries legacy `priority_score`, and the real `resolveLeadTemperature`/`leadTemperatureToLegacyPriorityScore` make both resolve to the same heat. Supporting: `schema-contract.test.ts`, `route-contracts.test.ts`, `access-matrix-surfaces.test.ts`.
- **Status:** implemented — shared-field consistency + temperature/priority_score coherence proven across surfaces.
- **Product reality:** the export/API surface presents legacy `priority_score`; the app/admin surface presents canonical `temperature`. They agree only through the derivation — keep them coherent.
- **Gaps/TODOs:** a live write-here/read-there round-trip across surfaces is a `/e2e` follow-up.

### 13. RBAC / scope enforcement

- **Purpose:** Correct users/roles access correct records; wrong company/event scope and unauthorized writes are rejected server-side.
- **Setup:** Company A and Company B; users for roles `exhibitor_admin`, `exhibitor_viewer`, `organizer_admin`, `platform_admin`; lead/doc/workflow/draft under Company A.
- **Action:** Attempt allowed and disallowed reads/writes across companies, events, and roles.
- **Expected DB state:** Enforcement is at the DB layer via Supabase **RLS** plus route guards; legacy roles (`exhibitor`, `viewer`, `organizer`, `app_user`) must never be written.
- **Expected async/worker state:** N/A.
- **Expected API/UI-visible state:** Company A user sees Company A resources; Company B user is denied (403). `exhibitor_viewer` is read-only (e.g. denied bulk delete). App vs admin permissions (`event_users.permissions.app/admin`) gate independently; mobile events endpoint gates by app permission without blocking admins.
- **Cleanup:** Delete cross-company fixtures in both tenants.
- **Failure/retry behavior:** Authorization failures must come from server/RLS, not hidden UI — UI hiding is not proof.
- **Current coverage:** `tests/journeys/rbac-scope.e2e.test.ts` — drives the real `computeCompanyEventAccessSet` (assigned_events_only must not widen to all-company; all_company_events requires license; no-license → legacy), the real `pickValidatedEventIdForAccess` (server never trusts a client-supplied out-of-scope event id), and the real cross-company delete partition (another company's lead → forbidden); source contract that lead routes authenticate, scope by company_id, return 403, and deny viewer bulk delete. Supporting: `access-matrix-surfaces.test.ts`, `exhibitor-access-model.test.ts`, `briefing-rls-exhibitor-admin.test.ts`, `lead-briefings-rls-exhibitor-admin.test.ts`, `route-contracts.test.ts`, `exhibitor-leads-bulk-scope.test.ts`.
- **Status:** implemented — canonical access-mode + event-validation + cross-company rejection rules proven with real logic; server-side RLS enforcement covered by the RLS tests.
- **Gaps/TODOs:** a two-tenant live allowed/denied matrix on real rows is a `/e2e` follow-up.

### 14. Golden Exhibitor Journey

- **Purpose:** Prove the product promise as one chain: lead capture → enrichment/context → workflow → draft → follow-up action, with terminal, truthful final state.
- **Setup:** Clean company/event/exhibitor user; optional workflow/agent for new leads.
- **Action (chain):** create lead → update lead → (optional) attach/send document → (optional) upload audio → verify transcript+synthesis → verify readiness → verify workflow sees the lead → verify it waits only when expected → verify it resumes on readiness → (optional) generate draft from real context → (optional) send via sandbox/test path → verify sent state → verify no stuck waits → verify final API/display state is terminal → cleanup all.
- **Expected DB state:** Each step's canonical rows present and consistent; no duplicate canonical state.
- **Expected async/worker state:** Reconciler/readiness/resume leave no stale processing or stuck waits for the test run.
- **Expected API/UI-visible state:** Final state truthful and terminal across the chain.
- **Cleanup:** Reverse-dependency cleanup of every created record, running even if the chain fails midway.
- **Failure/retry behavior:** Unsupported/provider-gated steps (document send, audio providers, OpenAI, SendGrid) are conditionally skipped with explicit reasons; the test must make gaps visible, not hide them.
- **Current coverage:** `tests/journeys/golden-exhibitor-journey.e2e.test.ts` — one chained test threading a single lead identity through the real canonical logic: qualify (`leadHasWorkflowQualificationSignal`) → qualifying update (`normalizeExhibitorLeadPatch` + `leadQualificationChanged`) → eligible template + run-row build referencing the lead → audio terminal via the REAL reconciler (synthesis recovered without overwriting transcript) → truthful `insights_ready` display → workflow wait→resume via the REAL resume engine with **no stuck waits remaining** → draft grounded in the lead's real context (`resolveRecipientContextForLead`) → send-status truth (`resolveFinalCampaignStatus`) → terminal/truthful final state. Cleanup registered up-front and run in `after` even on mid-chain failure.
- **Covered steps:** capture, qualify, update, trigger eligibility + run creation, audio transcript/synthesis terminal, readiness, workflow sees lead, waits-only-when-required, resume, no-stuck-waits, draft-from-context, send-status truth, terminal final state.
- **Skipped steps (explicit, gaps visible):** live company/event/user provisioning, document send (SendGrid + user FK), real audio upload providers (transcription/synthesis), OpenAI draft generation, SendGrid send — all `/e2e`-lane IO. Listed in the test's skipped companion block.
- **Status:** implemented for the chain of implemented steps; real-IO steps are conditionally skipped with explicit reasons (not faked).
- **Gaps/TODOs:** a real-IO Golden run belongs to the Playwright `/e2e` lane once providers/sandboxes are configured.

---

## Harness status (Phase 2)

The shared deterministic fixture harness now exists:

| File | Provides |
|---|---|
| `tests/helpers/journey-fixtures.ts` | `createTestRunId()`, `journeyNamePrefix()`/`taggedName()` deterministic tagging (`LRJ <runId>` prefix), `resolveJourneyEnv()` (env gate with precise skip reason), `getJourneySupabase()` (lazy service client), and live-DB lead setup primitives `createTestLead()` / `updateTestLead()` / `deleteTestLead()`. |
| `tests/helpers/journey-cleanup.ts` | `JourneyCleanupRegistry` — reverse-dependency cleanup that never throws, attempts every task after a partial failure, collects sanitized errors, and clears tasks so re-run is a no-op. |
| `tests/helpers/journey-assertions.ts` | `assertBelongsToTestRun()`, `assertScopedToCompany()`, `assertScopedToEvent()`, `isJourneyTaggedName()`. |
| `tests/journeys/journey-harness-smoke.test.ts` | 7 pure tests (always run, no DB) proving tagging + registry + partial-failure safety + assertions, plus an opt-in live-DB create/cleanup smoke test. |

Run with `npm run test:journeys`.

**Cleanup guarantees:** every created record is tagged with the run id in a name field;
deletes are scoped by id **and** company_id; `cleanup()` runs in `finally`/`after`, never
throws, and is safe after partial setup failure.

**Discovered constraints (shape later prompts):**
- The node:test lane can safely create only **leads**, under a *pre-existing* test company
  (`JOURNEY_TEST_COMPANY_ID`) and optional event (`JOURNEY_TEST_EVENT_ID`). Creating a
  company/event/user requires auth users + memberships and currently exists only in the
  Playwright `/e2e` lane (`e2e/helpers/supabase.ts`); `createTestCompany/Event/User` are
  intentionally **not** implemented here yet. Journey tests should consume a pre-provisioned
  test company/event or run in the `/e2e` lane.
- Live-DB fixtures are **opt-in**: `JOURNEY_LIVE_DB=1` + `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL`
  + `SUPABASE_SERVICE_ROLE_KEY` + `JOURNEY_TEST_COMPANY_ID`. Without them the live smoke
  test skips with the exact missing prerequisite.
- The `createTestLead` direct insert is a **setup** primitive only; the create-journey test
  proves the real route via source contract + live persistence round-trip.
- **`server-only` constraint:** route handlers and `lib/server/*` services import `server-only`,
  which throws when imported into the node:test lane. So route/service proof uses source
  contracts (`readFileSync`) + the importable canonical pure helpers (`normalizeExhibitorLeadPatch`,
  `leadQualificationChanged`, `partitionLeadIdsForExhibitorDelete`, `lib/leads/temperature`).
  Full auth'd route invocation lives in the Playwright `/e2e` lane.

## Cross-cutting gaps & constraints

- **No journey harness yet.** Phase 2 must add reusable fixture/cleanup/assertion helpers (`createTestRunId`, company/event/user/lead setup, reverse-order cleanup registry) before Phase 3 journey tests. The harness should follow the existing `randomUUID` + name-prefix + `cleanupPersistentTestArtifactsForRun` conventions and reuse `e2e/helpers/supabase.ts` for live-DB paths.
- **Provider-gated steps must skip cleanly:** audio transcription/synthesis, OpenAI draft generation, SendGrid send. Tests must detect missing env/sandbox and skip with an exact reason — never fake final states.
- **Document-to-lead attach is not a product capability** (only send-to-lead). Do not invent attach coverage.
- **Two layers of truth:** journey tests prove the real canonical logic in the node:test lane (pure logic + source contracts + opt-in live-DB); full auth'd-route and real-provider runs are the remaining `/e2e`-lane layer, called out per journey rather than left implicit.
- **Do not change** mobile lead posting behavior, mobile recording upload payload shape, or additive recording semantics while building this coverage.

## Maintenance

Update this matrix after every prompt in the prompt pack: move statuses
(`pending → partial → implemented`), fill in the real journey test filename under
"current coverage", and keep the summary table in sync with the per-journey detail.
