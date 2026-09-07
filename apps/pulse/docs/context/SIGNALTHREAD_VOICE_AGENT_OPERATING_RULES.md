# SignalThread agent operating rules

> Source-confidence note — 2026-08-05: High confidence for rules backed by current code, `docs/ENGINEERING_STANDARDS.md`, and loop controllers. “Chat-derived” rules came from durable user instructions in prior QA tasks and are not application behavior.

## Source-of-truth order

When sources conflict, use this order:

1. Current schema, migrations, canonical services/policies, and route code.
2. Current tests that assert the contract.
3. Recent relevant Git history explaining why the contract exists.
4. Current loop briefs/audits with explicit verification evidence.
5. General architecture/product docs.
6. Old loop packs, root quick-starts, screenshots, and historical summaries.

Do not “average” contradictory sources. Record the conflict and follow executable current behavior.

## Mandatory architecture rules

1. `Account.accountType` is the only canonical Events/SMB product boundary. Use `lib/account-product-mode.ts`; do not inspect URL, slug, event ID, or template selection.
2. Every non-`EVENTS`, missing, or unknown type is retail-safe.
3. Preserve the shared kiosk, response/answer, upload, transcription, and analysis pipeline. Do not fork an Events pipeline.
4. Build current Events work on protected `/api/app/events/*` and canonical `lib` services, not legacy `/api/events/*`.
5. `EventStructureItem(kind=SESSION)` is the Events agenda session. Legacy `Session` is not.
6. `EventSpeakerProfile` is account-scoped identity; participation belongs to `EventSessionSpeakerAssignment`.
7. Normalized `Question` and Events intelligence models are authoritative where present; JSON compatibility fields are not independent systems.
8. Preserve Account → Location → Event ownership checks and composite account/event boundaries on every ID accepted from a client.
9. Keep stored event status, date-derived lifecycle, survey lifecycle, availability/public-link state, and action status distinct.
10. Optional post-write work must not turn a successful canonical write into a client-visible failure that encourages duplicates.

## Investigation and implementation discipline

- Check branch and dirty state before editing. Existing changes belong to the user.
- Reproduce and identify the root cause before modifying behavior.
- State the scope and likely files for loop work; do not combine prompts unless authorized.
- Prefer the smallest canonical fix over component-level patches or duplicate state.
- Search with `rg`; inspect callers, tests, schema, and migrations before changing a contract.
- Use existing domain error types and structured 4xx errors for recoverable validation.
- Preserve user input/state after recoverable failures; never silently recreate durable drafts.
- Make retryable operations idempotent and protect with unique constraints/transactions where appropriate.
- No domain records before final confirmation in review-based import flows.
- Avoid full-page reloads, imperative click chains, repeated DOM mutation loops, and hidden side effects.

## UI quality gates

- Use shared product components (`components/ui/*`) and established Events primitives.
- Do not use native `alert()`, `confirm()`, or browser-native date/time controls for product workflows.
- Give disabled/blocked actions a visible reason and a clear next action.
- Do not label Save as Publish or mix session wording into speaker workflows.
- Preserve focus, escape, overlay, and retry/recovery behavior for modals/drawers.
- Product-mode-dependent UI must fail closed while account context loads; it must not flash the wrong product.
- Global theme state belongs to `ThemeProvider`; do not force classes with observers/animation-frame loops from a child.
- Events and SMB must each receive copy, templates, navigation, and tour behavior appropriate to their product.
- Browser verification must check console/hydration errors, unexpected 4xx/5xx responses, duplicate requests, and responsive state—not only visual appearance.

## Testing requirements

Minimum for a code change:

1. Targeted unit/contract/route/UI tests for the changed behavior and adjacent regression boundary.
2. `npm run typecheck`.
3. `git diff --check`.
4. Live browser or Playwright verification for material UI/runtime flows, or an exact list of checks still required.

Additional gates:

- Schema/migration changes: `npx prisma validate`, `npx prisma generate`, migration review, additive/production-safe SQL, and explicit backfill risk.
- Shared kiosk/answer changes: both `e2e/events-voice-journeys.spec.ts` and `e2e/smb-voice-journeys.spec.ts` or equivalent targeted coverage.
- Account/product gates: Events denial/hiding, SMB preservation, unresolved-context behavior, and cross-account tests.
- Idempotency: repeat the exact request and prove stable identity/count.
- Imports: parser, service, route, contract, UI, account/event scope, pre-confirmation no-write, and repeated confirmation tests.

Source-string tests are useful guardrails but cannot replace behavioral route/component/browser tests.

## Git and loop rules

- Never discard, reset, overwrite, or stage unrelated working-tree changes.
- Stage only the active task’s files. Inspect staged diff before committing.
- Use non-interactive Git commands.
- A loop prompt requires one focused commit per completed prompt and a status/verification update in its prompt pack.
- Do not commit, push, merge, migrate, seed, or deploy unless the user’s task authorizes it.
- Documentation/investigation tasks do not authorize product code changes.
- Do not claim a branch is active or mergeable from its name; inspect unique commits and merge base.

## Security and privacy rules

- Never print or document secret values; environment variable names only.
- Never expose transcripts, emails, event/account IDs, object keys, or QA datasets in public-facing content without approval.
- Authenticate server-side and bind the actor to Prisma membership/role.
- Treat account/event query parameters and client-provided IDs as untrusted selectors.
- Use scoped object keys and verify ownership/content constraints.
- Sanitize client-facing failures and avoid logging raw sensitive payloads.
- Preserve anonymous-response assumptions unless a product/legal decision introduces identity.
- No direct production data mutation for cleanup when the task requires normal product flow.
- Do not assume RLS, WAF, rate limits, backups, encryption, retention, or compliance controls not represented or directly verified.

## Deployment and migration safety

- Source migrations are not evidence they are applied. Check the target database explicitly when authorized.
- Prefer additive migrations; destructive/backfill operations require explicit approval, backups/rollback, and impact analysis.
- External side effects (email, Stripe, Supabase admin, AI, object storage) are not automatically covered by Prisma transactions.
- Verify build/runtime configuration in the target environment before production claims.
- Never seed or run cleanup scripts against an unresolved target. Existing-event seed modes must validate account ownership and preserve existing setup.

## Chat-derived collaboration preferences

These are durable workflow preferences expressed in prior Voice Events work:

- Root cause before edit; preserve working Events and SMB behavior.
- For sequential QA loops: execute prompts in order, update the prompt pack, and commit separately.
- Use one dev server on port 3001 during that manual loop unless the active instruction changes it.
- If live Chrome is unavailable, continue code/API/log/test work when browser verification is not a hard stop, but document the exact remaining checks and never claim they ran.
- Stop for a genuine implementation blocker or an explicit product-decision stop, not merely because browser access is absent.
- Return files changed, how product/account scope was determined, tests, and verification results.

These preferences do not authorize broader mutations than the current user request.

## Prohibited shortcuts

- Pathname/slug-based product detection.
- New duplicate parser/schema/column lists that can drift from validation.
- Recreating failed import drafts behind the user’s back.
- Database-direct cleanup when normal product flow is required.
- Native dialogs or hidden auto-navigation to mask broken state.
- “Fixing” seed data or metrics by hardcoding display values.
- Treating old docs/screenshots as current proof.
- Calling unverified production behavior “done,” “live,” or “production-ready.”
- Broad refactors inside a targeted QA fix.

## Prompt model selection

`docs/ENGINEERING_STANDARDS.md` is the canonical engineering standard for this repository. When recommending or writing prompts for another model/agent, follow its **Prompt Model Selection** policy and the current model guide at `docs/MODEL_SELECTION.md`.

- Use the header format `Model:` / `Strength:`.
- Best model for the job, at the lowest Strength that is still fully capable.
- A challenge to a recommendation ("is that overkill?") is a request to re-verify it, not to downgrade it.
