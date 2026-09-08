# Loop 3 handoff — canonical LR integration hard stop

Date: 2026-09-08
Branch: `feat/demo-seeding-framework`
Worktree: `/Users/ali/Documents/orca-clean-event-overview`

## Resume point and preserved work

Re-read the user-named controller, framework brief, prompt pack, Loop 1 handoff, and Loop 2 handoff. The current Loop 2 handoff supersedes the older environment stop in Loop 1: it records completed Platform/Orca persistence verification and explicitly permits starting Loop 3. Loop 1 was not restarted, Loop 2 was not reseeded, and neither implementation nor either existing handoff was rewritten.

The existing SMOKE and DEMO ownership journals remain readable at `/private/tmp/st-orca-smoke-20260908.json` and `/private/tmp/st-orca-demo-20260908.json`. Each has six Platform identity/registry receipts and three Orca organization/user/event receipts. These journals are not fresh database readback or complete module-level reset proof. Actual persisted module counts and prior rerun evidence remain as recorded in LOOP_2_HANDOFF.md; no new database verification or mutation occurred in this resume.

## Active Loop 3 scope

- Audit real LR account/event/staff permissions and canonical Platform integration before adapter writes.
- Implement direct mode with one account across multiple events.
- Implement organizer mode with the exact requested companies per event and varied granular facts.
- Preserve canonical ownership, attach integrity, deterministic reruns, and reset safety.
- Verify persisted direct and organizer runs before proceeding to Loop 4 intelligence.

Likely implementation files, contingent on resolving the hard stop: `scripts/demo-seeding/lead-retrieval.ts`, `scripts/demo-seeding/cli.ts`, `scripts/demo-seeding/platform.ts`, `scripts/demo-seeding/framework.test.ts`, `scripts/demo-seeding/README.md`, an LR-owned persistence helper if needed, and this handoff. No implementation edits were made because the prerequisite audit reached the controller hard stop.

## Evidence for the hard stop

1. `apps/platform/lib/server/product-registry.ts:24` registers app URL configuration only for Orca and Pulse. Its auth-authority registry at line 47 likewise has only Orca and Pulse. Unknown products have no handoff authority. Environment variables alone cannot register LR.
2. Searches of LR runtime code, types, and migrations found no `platform_event_id`, `platform_organization_id`, `platform_user_id`, camel-case equivalents, or `/platform-entry` implementation.
3. `apps/lead-retrieval/lib/auth/session.ts` obtains the current user from LR Supabase Auth, looks up `public.users.id` using that local Auth ID, and derives scope from its company/role. `lib/supabase/server.ts` uses LR's Supabase client configuration.
4. `apps/lead-retrieval/supabase/migrations/0001_phase1.sql` binds `public.users.id` and `companies.organizer_id` to local `auth.users`. LR event/account access remains product-local. The local `platform_admin` role is not a Platform Core identity mapping.
5. `apps/lead-retrieval/docs/PLATFORM_CORE_INTEGRATION_AUDIT.md` describes integration changes and open decisions, including canonical event-ID adoption and identity/RLS implications. It is an audit/proposal, not an implemented production mapping contract.

Loop 3 requires canonical event/organization ownership and valid attach; the brief forbids bypassing identity assumptions merely to make rows appear. Giving local rows matching UUIDs, copying an email, or adding a seed-only mapping would not establish a supported launch/authorization contract. Implementing product authentication and integration is broader than the seeding adapter and is not resolved by approval to write framework-owned demo data.

Applicable LOOP_CONTROLLER.md hard stops: “Authorization, tenancy, or event/account scoping is unclear”; “Required product behavior is not covered by the plan”; and “The prompt expands beyond the named allowed scope.” The Canonical Data Rule also forbids duplicate state without reconciliation. Existing database-write authorization remains valid; no renewed database authorization is requested.

Required human review: identify the implemented/approved LR–Platform identity, organization, and event mapping contract or the branch/commit containing that integration. If it has not been implemented, the production integration scope and authentication/mapping decision must be approved before seeding can rely on it. Resume at this Loop 3 prerequisite audit once resolved; do not restart Loops 1–2 and do not skip to Loops 4–6.

## Controller stop report

Prompt completed: Loop 3 NOT complete; prerequisite audit reached a canonical integration hard stop. Loop 2 completion is preserved as documented.
Files changed: `docs/loop/LOOP_3_HANDOFF.md` only during this resume. Existing dirty `package.json`, framework files, audit, and Loop 1/2 handoffs preserved. A temporary worktree `node_modules` symlink was used for verification and removed afterward.
Migration files created: none.
Schema/client generation: none; no database contacted or mutated.
Tests run: `npm run test:demo-seeding`; `npm run typecheck:demo-seeding`; `npm run lint:demo-seeding`; `node scripts/check-import-boundaries.mjs`; `git diff --check`.
Test results: 16/16 framework tests passed. Initial invocation failed to resolve `@supabase/supabase-js` because the feature worktree had no dependencies; using the existing main-checkout dependency toolchain resolved it without source changes. Import boundaries and whitespace checks passed.
Typecheck/build result: scoped TypeScript and ESLint passed. No app build rerun: no application code changed.
Behavior changed: none.
Plan alignment review: preserved the existing event world and canonical Platform/Orca implementation; declined to invent unsupported LR identity/launch mappings.
Corrections made after plan review: none to implementation; documented the exact integration blocker rather than repeating the resolved environment blocker.
Risks / follow-up needed: Loop 3 persisted direct/organizer checks, Loops 4–6, complete reset ownership, and the final matrix remain outstanding. This is not a completed cross-product framework.
Next prompt started or reason for stopping: stop at Loop 3 under the controller hard stops above, pending the real LR integration contract.
