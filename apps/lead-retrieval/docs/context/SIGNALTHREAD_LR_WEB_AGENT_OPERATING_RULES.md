# SignalThread Lead Retrieval — Agent Operating Rules

> **Status date: 2026-08-05 (America/New_York).**
>
> **Source-confidence note:** High confidence for rules derived from the current repositories, tests, migration patterns, and durable user instructions. Medium confidence for team process conventions not encoded in repository automation. Where a rule is prudential rather than enforced, it is labeled accordingly.

## Mission

Change SignalThread Lead Retrieval without breaking tenant isolation, offline capture, canonical server contracts, provider credentials, or production data. Prefer the smallest canonical fix that preserves established behavior.

## Before changing anything

1. Read the relevant repository instructions and nearby tests.
2. Run `git status --short` and preserve all user-owned changes.
3. Identify the canonical service, data model, and route before editing a UI caller.
4. Trace authorization as user → company → event → resource; never infer access from an ID alone.
5. Search history for the subsystem and any prior incident fix.
6. Distinguish repository schema from actually applied production migrations.
7. State when live/provider behavior cannot be verified safely.

## Architecture rules

- Web/backend is the authority for cloud schema, authorization, OAuth, provider access, cross-client contracts, and durable business logic.
- Mobile owns device UX, SQLite cache, outbox, retry presentation, and offline reconciliation—not a parallel cloud business-logic implementation.
- Route handlers should authenticate, validate, invoke a canonical service, and map safe responses. Do not duplicate domain logic in routes or screens.
- Preserve provider-neutral contracts where they already exist; Google is the only active Email & Calendar provider. Do not imply Microsoft support.
- Reuse canonical token managers and provider clients. Never create a second OAuth, credential, MIME, Calendar, or follow-up path.
- Service-role database access must retain explicit company/event/user predicates because it bypasses RLS.
- Treat generated database types as outputs. Change migrations first, regenerate types through the repository workflow, and do not hand-edit generated files.

## Data and migration rules

- Never reseed, reprocess, reconcile, delete, backfill, or overwrite production data merely to make a UI appear correct.
- Diagnose read-path failures by comparing database rows → service/read model → route/server component → rendered UI.
- Migration files are evidence of intended schema, not proof of deployment.
- New migrations must be additive and ordered. Avoid rewriting an applied migration.
- Keep legacy compatibility fields only when a current client contract requires them; document the derivation and removal condition.
- Preserve idempotency keys and operation records around external side effects.
- A provider-side failure must not roll back an already successful canonical LR mutation when the product contract promises partial success.

## Authentication and authorization

- Never place bearer tokens, refresh tokens, access tokens, authorization codes, or raw provider errors in URLs, logs, client payloads, fixtures, screenshots, or documentation.
- Mobile browser OAuth launch is authenticated by a signed, expiring, single-use ticket. The launch route must not require a browser cookie or bearer token, but possession alone is insufficient unless signature, expiry, binding, and one-time consumption all validate.
- OAuth tickets must bind user, company, provider, and intended callback state.
- Preserve encrypted-at-rest credential handling and user ownership of Google connections.
- Use normalized role helpers and canonical access services. Do not authorize with historical role strings ad hoc.
- App entitlement, company membership, event membership, event access mode, license eligibility, and admin privileges are separate checks.
- Return audit-safe error codes. Map invalid or revoked refresh credentials to `reconnect_required`; do not expose provider internals.

## Offline and synchronization rules

- Offline-first behavior is implemented, not aspirational. A change to capture or lead detail must be evaluated offline.
- Local rows and outbox operations must remain scoped to the active user/company/event.
- Preserve stable client IDs and idempotent server mutations across retries.
- Do not clear local pending work during ordinary refresh or transient authentication/provider failure.
- Sign-out and user switching must prevent one account from seeing another account's cached data.
- Test kill/relaunch, reconnect, duplicate retry, and partial secondary-upload failure for capture changes.

## Google Email & Calendar rules

- Google connections belong to the acting user, not the lead or company globally.
- Disconnect local state even when remote revocation is unconfirmed; report the revocation as pending without claiming the local connection remains usable.
- Do not call Gmail or Calendar after credential acquisition has established `reconnect_required`.
- One-to-one Gmail must use the canonical MIME builder, preserve plain text and line breaks, and use only minimal email-safe HTML through that path.
- Meeting scheduling may invite the selected lead and create Meet only when explicitly requested by that workflow.
- Follow-up reminders are private acting-user events: no lead attendee and no conferencing link.
- Follow-up edit updates the existing provider event; complete/clear deletes it when possible. Do not create duplicates on retry.

## Conversation and intelligence rules

- Treat transcripts, summaries, briefings, evidence, themes, objections, messaging, and processing records as distinct artifacts.
- Prefer the canonical conversation read model; do not silently substitute a thin legacy summary when rich scoped data exists.
- Preserve event/company/lead ownership predicates across every aggregation.
- Classify failed processing records before retrying them. A failed state is not authorization to reprocess.
- Keep user-authored corrections and approved briefing content separate from regenerated model output.
- Do not fabricate transcript facts, evidence, customer outcomes, or conversation context.

## UI rules

- Reuse the product component system and established modal/popover patterns.
- No native browser date, time, datetime-local, or select controls in the meeting/follow-up workflows.
- Popovers must toggle, dismiss on outside click and Escape, remain collision-aware, and return focus to their trigger.
- Async success must replace stale controls when the action is complete; preserve clear loading, empty, partial-success, and error states.
- Accessibility is functional behavior: labels, roles, expanded state, focus order, keyboard navigation, and visible selection require tests.
- Do not patch presentation to hide a canonical data or serialization bug.

## Testing and validation

Choose validation proportional to the change, then report exact commands and outcomes.

Minimum for a focused code change:

1. targeted regression tests for the changed contract;
2. relevant neighboring suite;
3. non-watch typecheck;
4. production build when repository convention or routing/build behavior requires it;
5. `git diff --check`;
6. final `git status --short`.

Additional expectations:

- Provider code: prove provider calls are skipped in invalid/retry states and payloads contain no secrets.
- Authorization: test same-tenant success and cross-tenant/user denial.
- Mobile: run unit tests and relevant Maestro flow when feasible; never treat a persistent dev server as validation.
- UI: use a real browser at desktop and narrow widths when visual behavior is required.
- Production: read-only checks first; never use customer data for destructive canaries.
- Tests that inspect source strings or fake databases are useful but do not substitute for runtime, browser, RLS, or provider verification.

## Git and deployment

- Do not commit, push, merge, deploy, migrate, or seed unless the user explicitly authorizes that action.
- Do not reset, restore, or overwrite changes that may belong to another actor.
- Do not infer that an old feature branch contains unmerged work; compare it with `main` first.
- Report the exact branch, HEAD, dirty files, and deployed commit when deployment parity matters.
- Build success proves compilation at a revision, not authenticated or provider-flow correctness.

## Product and commercial truth

- Describe implemented behavior precisely; distinguish shipped, feature-flagged, prototype, seeded demo, planned, and hypothetical.
- Do not invent pricing, customer names, renewal outcomes, ROI, accuracy rates, or provider maturity.
- License/seat tables encode entitlement mechanics, not an approved price book.
- “Direct customer” is an account/use-case shape, not a distinct normalized application role.
- Avoid claims that SignalThread replaces CRM, marketing automation, or a general task-management platform.

## Prohibited shortcuts

- UI-only fixes for canonical service defects.
- New OAuth/token storage paths.
- New send/composer/MIME services for an existing Gmail flow.
- New follow-up/task tables for the current lead follow-up model.
- Service-role reads without tenant predicates.
- Blind production reprocessing.
- Broad refactors inside an incident fix.
- Logging raw provider responses or credentials.
- Treating a route name, migration file, fixture, prototype, or branch as proof a capability is live.
- Ending validation with a watch-mode test or persistent development server.

## Agent handoff format

Every meaningful handoff should state:

- objective and user-visible outcome;
- repositories, branch, HEAD, and working-tree state;
- canonical files/services/contracts touched;
- schema/migration assumptions;
- authorization and security invariants;
- tests run with exact results;
- live/manual verification completed versus still required;
- unresolved risks and the next safe action.

## Durable prompt preferences

Across recent work, the user consistently requires:

- canonical-path fixes rather than duplicate services or UI patches;
- preservation of OAuth, token management, scopes, provider architecture, and production data unless explicitly in scope;
- focused regression tests and real-flow verification;
- no native date/time/select controls in the relevant product workflows;
- non-watch automated validation;
- no commit or push unless explicitly requested;
- exact root-cause and changed-contract reporting.

## Related package files

- [Master project context](./MASTER_PROJECT_CONTEXT.md)
- [System architecture and data](./SYSTEM_ARCHITECTURE_AND_DATA.md)
- [Decision and incident history](./DECISION_AND_INCIDENT_HISTORY.md)
- [Current state and next work](./CURRENT_STATE_AND_NEXT_WORK.md)
- [Context gaps and verification](./CONTEXT_GAPS_AND_VERIFICATION.md)


## Prompt model selection

`docs/ENGINEERING_STANDARDS.md` is the canonical engineering standard for this repository. When recommending or writing prompts for another model/agent, follow its **Prompt Model Selection** policy and the current model guide at `docs/MODEL_SELECTION.md`.

- Use the header format `Model:` / `Strength:`.
- Best model for the job, at the lowest Strength that is still fully capable.
- A challenge to a recommendation ("is that overkill?") is a request to re-verify it, not to downgrade it.
